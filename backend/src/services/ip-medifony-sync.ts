/**
 * Pull pacientes, servicios (consulta_cups), y agenda desde la BD Medifony remota
 * (misma conexión read-only que PPTO / rentabilidad) hacia ip_pacientes / ip_agenda.
 */
import { query } from '../config/database';
import { getIpPool } from '../config/ip-database';
import type { PacienteImportJson } from '../utils/ip-excel-import';
import { PoolConnection } from 'mysql2/promise';

export interface MedifonySyncOptions {
  dateFrom: string;
  dateTo: string;
  replacePacientesCatalog?: boolean;
  replaceAgendaCatalog?: boolean;
  /** Todas las líneas consulta_cups por paciente (no solo el rango). */
  fullHistorialServicios?: boolean;
  /** Pacientes que solo tienen cita en agenda en el rango (sin consulta_cups en el rango). Default true. */
  includeAgendaOnlyPacientes?: boolean;
}

export interface MedifonySyncResult {
  ok: boolean;
  dateFrom: string;
  dateTo: string;
  pacientesUpserted: number;
  /** Siempre: filas `consulta_cups` devueltas por la consulta acotada al rango de fechas. */
  serviciosLines: number;
  /** Si `fullHistorialServicios`: total de filas `consulta_cups` usadas al armar historiales completos. */
  serviciosLinesFullHistorial?: number;
  agendaUpserted: number;
  pacientesAgendaOnly: number;
  warnings: string[];
}

function ymd(d: unknown): string {
  if (d == null) return '';
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return '';
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    return `${Y}-${M}-${D}`;
  }
  const s = String(d);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return s.slice(0, 10);
}

function edadFromFnac(fnac: unknown): number {
  const d =
    fnac instanceof Date ? fnac : fnac ? new Date(String(fnac)) : null;
  if (!d || isNaN(d.getTime())) return 0;
  const t = new Date();
  let a = t.getFullYear() - d.getFullYear();
  const m = t.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && t.getDate() < d.getDate())) a--;
  return Math.max(0, a);
}

function tsFromMysql(v: unknown): string {
  if (v == null) return '';
  if (v instanceof Date) {
    if (isNaN(v.getTime())) return '';
    const Y = v.getFullYear();
    const M = String(v.getMonth() + 1).padStart(2, '0');
    const D = String(v.getDate()).padStart(2, '0');
    return `${Y}-${M}-${D}`;
  }
  const s = String(v);
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  return '';
}

interface CcRow {
  doc: string;
  nombre_paciente: string;
  fecha_realizacion: unknown;
  celular: string;
  personal_atiende: string;
  codigo_cups: string;
  cups_desc: string;
  sub_categoria: string;
  vlr: unknown;
  fecha_nacimiento: unknown;
  recomendacion_id: unknown;
  pais_origen_id: unknown;
}

interface AgendaRow {
  id: unknown;
  fecha_slot: unknown;
  hora_slot: unknown;
  doc: string;
  nombre_paciente: string;
  profesional: string;
  codigo_cups: string;
  subcategoria: string;
  valor: unknown;
}

function num(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function normDoc(d: string): string {
  return d.replace(/\s+/g, ' ').trim();
}

type Agg = {
  doc: string;
  nombre: string;
  celular: string;
  edad: number;
  procedencia: string;
  valor_total: number;
  visitas: number;
  ultima: string;
  subcats: Set<string>;
  profCount: Map<string, number>;
  historial: Array<{
    fecha: string;
    cups: string;
    subcategoria: string;
    profesional: string;
    valor: number;
  }>;
  fecha_nacimiento: unknown;
  recomendacion_id: unknown;
  pais_origen_id: unknown;
};

function buildAggFromCcRows(
  ccRows: CcRow[],
  dateFallback: string,
  recMap: Map<number, string>,
  paisMap: Map<number, string>
): Map<string, Agg> {
  const byDoc = new Map<string, Agg>();

  for (const row of ccRows) {
    const doc = normDoc(String(row.doc || ''));
    if (!doc) continue;

    let g = byDoc.get(doc);
    if (!g) {
      g = {
        doc,
        nombre: String(row.nombre_paciente || '').trim() || doc,
        celular: String(row.celular || ''),
        edad: 0,
        procedencia: '—',
        valor_total: 0,
        visitas: 0,
        ultima: '',
        subcats: new Set(),
        profCount: new Map(),
        historial: [],
        fecha_nacimiento: row.fecha_nacimiento,
        recomendacion_id: row.recomendacion_id,
        pais_origen_id: row.pais_origen_id,
      };
      byDoc.set(doc, g);
    }

    const fechaLinea = tsFromMysql(row.fecha_realizacion);
    const vlr = num(row.vlr);
    g.valor_total += vlr;
    g.visitas += 1;
    if (fechaLinea && (!g.ultima || fechaLinea > g.ultima)) g.ultima = fechaLinea;

    const sub = String(row.sub_categoria || '').trim();
    if (sub) g.subcats.add(sub);

    const prof = String(row.personal_atiende || '').trim();
    if (prof) g.profCount.set(prof, (g.profCount.get(prof) ?? 0) + 1);

    g.historial.push({
      fecha: fechaLinea || dateFallback,
      cups:
        String(row.codigo_cups || '').trim() ||
        String(row.cups_desc || '').slice(0, 32),
      subcategoria: sub || '—',
      profesional: prof || '—',
      valor: vlr,
    });
  }

  for (const g of byDoc.values()) {
    g.edad = edadFromFnac(g.fecha_nacimiento);
    const rid = Number(g.recomendacion_id || 0);
    const pid = Number(g.pais_origen_id || 0);
    g.procedencia = recMap.get(rid) || paisMap.get(pid) || '—';

    let topProf = '—';
    let topN = 0;
    for (const [name, c] of g.profCount) {
      if (c > topN) {
        topN = c;
        topProf = name;
      }
    }
    g.profCount.clear();
    (g as unknown as { __prof: string }).__prof = topProf;
  }

  return byDoc;
}

function aggToPacienteJson(g: Agg, dateFallback: string): PacienteImportJson {
  const prof =
    (g as unknown as { __prof?: string }).__prof ??
    '—';
  const historial = [...g.historial].sort((a, b) =>
    a.fecha.localeCompare(b.fecha)
  );
  return {
    doc: g.doc,
    nombre: g.nombre,
    celular: g.celular,
    edad: g.edad,
    procedencia: g.procedencia,
    valor_total: g.valor_total,
    visitas: g.visitas,
    ultima: g.ultima || dateFallback,
    subcategorias: [...g.subcats],
    profesional: prof,
    historial,
  };
}

async function fetchCcByDocs(docs: string[]): Promise<CcRow[]> {
  if (docs.length === 0) return [];
  const out: CcRow[] = [];
  const chunk = 120;
  const ccSql = `
    SELECT
      CONCAT(p.tipo_documento, ' ', TRIM(p.numero_documento)) AS doc,
      TRIM(CONCAT(p.nombres, ' ', p.apellidos)) AS nombre_paciente,
      cc.fecha_realizacion,
      IFNULL(p.celular, '') AS celular,
      per.nombre AS personal_atiende,
      IFNULL(cu.codigo, '') AS codigo_cups,
      IFNULL(cu.descripcion, '') AS cups_desc,
      IFNULL(sc.descripcion, '') AS sub_categoria,
      cc.valor AS vlr,
      p.fecha_nacimiento,
      p.recomendacion_id,
      p.pais_origen_id
    FROM consulta_cups cc
    JOIN consulta c ON c.id = cc.consulta_id
    JOIN paciente p ON p.id = c.paciente_id
    JOIN personal per ON per.user_id = cc.personal_id
    JOIN cups cu ON cu.id = cc.cups_id
    LEFT JOIN sub_categoria sc ON sc.id = cu.sub_categoria_id
    WHERE CONCAT(p.tipo_documento, ' ', TRIM(p.numero_documento)) IN (${docs.map(() => '?').join(',')})
    ORDER BY cc.fecha_realizacion ASC
  `;
  for (let i = 0; i < docs.length; i += chunk) {
    const part = docs.slice(i, i + chunk);
    const r = await query(ccSql, part);
    out.push(...(r.rows as unknown as CcRow[]));
  }
  return out;
}

async function fetchPacienteStubs(docs: string[]): Promise<Map<string, Partial<Agg>>> {
  const map = new Map<string, Partial<Agg>>();
  if (docs.length === 0) return map;
  const chunk = 120;
  const sql = `
    SELECT
      CONCAT(p.tipo_documento, ' ', TRIM(p.numero_documento)) AS doc,
      TRIM(CONCAT(p.nombres, ' ', p.apellidos)) AS nombre_paciente,
      IFNULL(p.celular, '') AS celular,
      p.fecha_nacimiento,
      p.recomendacion_id,
      p.pais_origen_id
    FROM paciente p
    WHERE CONCAT(p.tipo_documento, ' ', TRIM(p.numero_documento)) IN (${docs.map(() => '?').join(',')})
  `;
  for (let i = 0; i < docs.length; i += chunk) {
    const part = docs.slice(i, i + chunk);
    const r = await query(sql, part);
    for (const row of r.rows as unknown as Array<{
      doc: string;
      nombre_paciente: string;
      celular: string;
      fecha_nacimiento: unknown;
      recomendacion_id: unknown;
      pais_origen_id: unknown;
    }>) {
      const doc = normDoc(String(row.doc || ''));
      if (!doc) continue;
      map.set(doc, {
        doc,
        nombre: String(row.nombre_paciente || '').trim() || doc,
        celular: String(row.celular || ''),
        fecha_nacimiento: row.fecha_nacimiento,
        recomendacion_id: row.recomendacion_id,
        pais_origen_id: row.pais_origen_id,
      });
    }
  }
  return map;
}

export async function syncMedifonyToInteligencia(
  opts: MedifonySyncOptions
): Promise<MedifonySyncResult> {
  const warnings: string[] = [];
  const dateFrom = String(opts.dateFrom || '').trim().slice(0, 10);
  const dateTo = String(opts.dateTo || '').trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateFrom) || !/^\d{4}-\d{2}-\d{2}$/.test(dateTo)) {
    throw new Error('dateFrom y dateTo deben ser YYYY-MM-DD');
  }
  if (dateFrom > dateTo) {
    throw new Error('dateFrom no puede ser posterior a dateTo');
  }

  const dateToEnd = `${dateTo} 23:59:59`;
  const includeAgendaOnly = opts.includeAgendaOnlyPacientes !== false;

  const recRows = (await query(`SELECT id, descripcion FROM recomendacion`)).rows;
  const recMap = new Map<number, string>();
  for (const r of recRows) {
    recMap.set(Number(r.id), String(r.descripcion ?? ''));
  }
  const paisRows = (await query(`SELECT id, descripcion FROM pais`)).rows;
  const paisMap = new Map<number, string>();
  for (const r of paisRows) {
    paisMap.set(Number(r.id), String(r.descripcion ?? ''));
  }

  const ccRangeSql = `
    SELECT
      CONCAT(p.tipo_documento, ' ', TRIM(p.numero_documento)) AS doc,
      TRIM(CONCAT(p.nombres, ' ', p.apellidos)) AS nombre_paciente,
      cc.fecha_realizacion,
      IFNULL(p.celular, '') AS celular,
      per.nombre AS personal_atiende,
      IFNULL(cu.codigo, '') AS codigo_cups,
      IFNULL(cu.descripcion, '') AS cups_desc,
      IFNULL(sc.descripcion, '') AS sub_categoria,
      cc.valor AS vlr,
      p.fecha_nacimiento,
      p.recomendacion_id,
      p.pais_origen_id
    FROM consulta_cups cc
    JOIN consulta c ON c.id = cc.consulta_id
    JOIN paciente p ON p.id = c.paciente_id
    JOIN personal per ON per.user_id = cc.personal_id
    JOIN cups cu ON cu.id = cc.cups_id
    LEFT JOIN sub_categoria sc ON sc.id = cu.sub_categoria_id
    WHERE cc.fecha_realizacion >= ? AND cc.fecha_realizacion <= ?
    ORDER BY cc.fecha_realizacion ASC
  `;

  const ccRangeResult = await query(ccRangeSql, [dateFrom, dateToEnd]);
  const ccRangeRows = ccRangeResult.rows as unknown as CcRow[];

  let byDoc = buildAggFromCcRows(ccRangeRows, dateFrom, recMap, paisMap);

  const agendaSql = `
    SELECT
      a.id,
      IF(a.fecha IS NOT NULL AND a.fecha > '1900-01-01', a.fecha, DATE(a.fecha_inicio)) AS fecha_slot,
      IF(
        a.fecha_inicio IS NOT NULL AND a.fecha_inicio > '1900-01-01',
        DATE_FORMAT(TIME(a.fecha_inicio), '%H:%i'),
        DATE_FORMAT(a.hora, '%H:%i')
      ) AS hora_slot,
      CONCAT(p.tipo_documento, ' ', TRIM(p.numero_documento)) AS doc,
      TRIM(CONCAT(p.nombres, ' ', p.apellidos)) AS nombre_paciente,
      IFNULL(per.nombre, '') AS profesional,
      IFNULL(cu.codigo, '') AS codigo_cups,
      IFNULL(sc.descripcion, IFNULL(cu.descripcion, '')) AS subcategoria,
      IFNULL(c.valor_consulta, 0) AS valor
    FROM agenda a
    INNER JOIN consulta c ON c.id = a.consulta_id
    INNER JOIN paciente p ON p.id = c.paciente_id
    LEFT JOIN personal per ON per.user_id = a.medico_id
    LEFT JOIN cups cu ON cu.id = c.cups_id
    LEFT JOIN sub_categoria sc ON sc.id = cu.sub_categoria_id
    WHERE IF(
      a.fecha IS NOT NULL AND a.fecha > '1900-01-01',
      a.fecha,
      IFNULL(DATE(a.fecha_inicio), DATE(a.fecha_registro))
    ) >= ?
      AND IF(
        a.fecha IS NOT NULL AND a.fecha > '1900-01-01',
        a.fecha,
        IFNULL(DATE(a.fecha_inicio), DATE(a.fecha_registro))
      ) <= ?
    ORDER BY a.id ASC
  `;

  const agResult = await query(agendaSql, [dateFrom, dateTo]);
  const agendaRows = agResult.rows as unknown as AgendaRow[];

  const agendaMaxFecha = new Map<string, string>();
  for (const ar of agendaRows) {
    const doc = normDoc(String(ar.doc || ''));
    if (!doc) continue;
    const fd = ymd(ar.fecha_slot);
    if (!fd || fd < '1900-01-01') continue;
    const cur = agendaMaxFecha.get(doc);
    if (!cur || fd > cur) agendaMaxFecha.set(doc, fd);
  }

  let pacientesAgendaOnly = 0;
  if (includeAgendaOnly) {
    const agendaDocs = new Set<string>();
    for (const ar of agendaRows) {
      const d = normDoc(String(ar.doc || ''));
      if (d) agendaDocs.add(d);
    }
    const missing: string[] = [];
    for (const d of agendaDocs) {
      if (!byDoc.has(d)) missing.push(d);
    }
    if (missing.length > 0) {
      const stubs = await fetchPacienteStubs(missing);
      for (const doc of missing) {
        const s = stubs.get(doc);
        if (!s) {
          warnings.push(`Paciente ${doc}: no encontrado en tabla paciente`);
          continue;
        }
        const ultima = agendaMaxFecha.get(doc) || dateTo;
        const g: Agg = {
          doc,
          nombre: s.nombre || doc,
          celular: String(s.celular || ''),
          edad: edadFromFnac(s.fecha_nacimiento),
          procedencia: '—',
          valor_total: 0,
          visitas: 0,
          ultima,
          subcats: new Set(),
          profCount: new Map(),
          historial: [],
          fecha_nacimiento: s.fecha_nacimiento,
          recomendacion_id: s.recomendacion_id,
          pais_origen_id: s.pais_origen_id,
        };
        const rid = Number(g.recomendacion_id || 0);
        const pid = Number(g.pais_origen_id || 0);
        g.procedencia = recMap.get(rid) || paisMap.get(pid) || '—';
        (g as unknown as { __prof: string }).__prof = '—';
        byDoc.set(doc, g);
        pacientesAgendaOnly++;
      }
    }
  }

  let serviciosLinesFull = ccRangeRows.length;
  if (opts.fullHistorialServicios && byDoc.size > 0) {
    const preFull = new Map(byDoc);
    const allDocs = [...byDoc.keys()];
    const allCc = await fetchCcByDocs(allDocs);
    serviciosLinesFull = allCc.length;
    const rebuilt = buildAggFromCcRows(allCc, dateFrom, recMap, paisMap);
    for (const [doc, g] of preFull) {
      if (
        !rebuilt.has(doc) &&
        g.visitas === 0 &&
        g.historial.length === 0
      ) {
        rebuilt.set(doc, g);
      }
    }
    byDoc = rebuilt;
  }

  const pool = getIpPool();
  let conn: PoolConnection | undefined;
  try {
    conn = await pool.getConnection();
    await conn.beginTransaction();

    if (opts.replacePacientesCatalog) {
      await conn.execute('DELETE FROM ip_pacientes');
    }
    if (opts.replaceAgendaCatalog) {
      await conn.execute('DELETE FROM ip_agenda');
    }

    let pacN = 0;
    for (const g of byDoc.values()) {
      const pj = aggToPacienteJson(g, dateTo);
      await conn.execute(
        `INSERT INTO ip_pacientes (doc, data_json) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = CURRENT_TIMESTAMP`,
        [pj.doc, JSON.stringify(pj)]
      );
      pacN++;
    }

    let agN = 0;
    for (const ar of agendaRows) {
      const id = num(ar.id);
      if (!id) continue;
      const fd = ymd(ar.fecha_slot);
      if (!fd || fd < '1900-01-01') {
        warnings.push(`Agenda id=${id}: fecha inválida, omitida`);
        continue;
      }
      const doc = normDoc(String(ar.doc || ''));
      if (!doc) {
        warnings.push(`Agenda id=${id}: sin documento paciente, omitida`);
        continue;
      }
      const horaRaw = String(ar.hora_slot || '09:00');
      const hora = horaRaw.length >= 5 ? horaRaw.slice(0, 5) : `${horaRaw}:00`.slice(0, 5);
      const row = {
        id,
        fecha: fd,
        hora,
        doc,
        nombre: String(ar.nombre_paciente || '').trim() || doc,
        profesional: String(ar.profesional || '').trim() || '—',
        cups: String(ar.codigo_cups || '').trim(),
        subcategoria: String(ar.subcategoria || '').trim() || '—',
        valor: num(ar.valor),
      };
      await conn.execute(
        `INSERT INTO ip_agenda (id, data_json) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data_json = VALUES(data_json), updated_at = CURRENT_TIMESTAMP`,
        [id, JSON.stringify(row)]
      );
      agN++;
    }

    await conn.commit();

    return {
      ok: true,
      dateFrom,
      dateTo,
      pacientesUpserted: pacN,
      serviciosLines: ccRangeRows.length,
      serviciosLinesFullHistorial: opts.fullHistorialServicios
        ? serviciosLinesFull
        : undefined,
      agendaUpserted: agN,
      pacientesAgendaOnly,
      warnings,
    };
  } catch (e) {
    if (conn) await conn.rollback();
    throw e;
  } finally {
    if (conn) conn.release();
  }
}
