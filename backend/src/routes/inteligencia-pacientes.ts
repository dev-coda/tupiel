/**
 * Inteligencia de Pacientes — persiste en `tupiel_inteligencia` (ip_*).
 * La mayoría de rutas no tocan la BD remota; la excepción es POST `/sync/medifony`,
 * que lee Medifony vía el pool read-only de `config/database` (mismo que PPTO) y escribe ip_*.
 */
import { Router, Request, Response } from 'express';
import multer from 'multer';
import { inteligenciaQuery, getIpPool, reseedInteligenciaDemoCatalog } from '../config/ip-database';
import { PoolConnection } from 'mysql2/promise';
import { RowDataPacket, ResultSetHeader } from 'mysql2';
import { parseAgendaExcel, parsePacientesExcel } from '../utils/ip-excel-import';
import { syncMedifonyToInteligencia } from '../services/ip-medifony-sync';
import { purgeInteligenciaDemoSeedData } from '../config/ip-demo-purge';

const router = Router();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 25 * 1024 * 1024 },
});

interface IpFichaRow extends RowDataPacket {
  paciente_doc: string;
  estado: string;
  ticket: string;
  actividad: string;
  notas: string | null;
  origen: string | null;
  modificado_por: string | null;
  modificado_en: string | null;
}

interface IpTareaRow extends RowDataPacket {
  id: number;
  data_json: unknown;
}

interface IpPacienteRow extends RowDataPacket {
  doc: string;
  data_json: unknown;
}

interface IpAgendaRow extends RowDataPacket {
  id: number;
  data_json: unknown;
}

function parseJsonField(v: unknown): Record<string, unknown> {
  if (v == null) return {};
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  return v as Record<string, unknown>;
}

/**
 * GET /api/inteligencia-pacientes/state
 */
router.get('/state', async (_req: Request, res: Response) => {
  try {
    const pacR = await inteligenciaQuery('SELECT doc, data_json FROM ip_pacientes');
    const pacientes = (pacR.rows as unknown as IpPacienteRow[]).map((row) => {
      const d = parseJsonField(row.data_json);
      return { ...d, doc: row.doc };
    });

    const agR = await inteligenciaQuery('SELECT id, data_json FROM ip_agenda');
    const agenda = (agR.rows as unknown as IpAgendaRow[])
      .map((row) => {
        const d = parseJsonField(row.data_json);
        return { ...d, id: row.id } as Record<string, unknown>;
      })
      .sort((a, b) => {
        const fa = String(a['fecha'] ?? '');
        const fb = String(b['fecha'] ?? '');
        if (fa !== fb) return fa.localeCompare(fb);
        return String(a['hora'] ?? '').localeCompare(String(b['hora'] ?? ''));
      });

    const fichasR = await inteligenciaQuery(
      'SELECT paciente_doc, estado, ticket, actividad, notas, origen, modificado_por, modificado_en FROM ip_fichas'
    );
    const fichas: Record<string, unknown> = {};
    for (const row of fichasR.rows as unknown as IpFichaRow[]) {
      fichas[row.paciente_doc] = {
        estado: row.estado,
        ticket: row.ticket,
        actividad: row.actividad,
        notas: row.notas ?? '',
        origen: row.origen,
        modificadoPor: row.modificado_por,
        modificadoEn: row.modificado_en,
      };
    }

    const tareasR = await inteligenciaQuery(
      'SELECT id, data_json FROM ip_tareas ORDER BY id ASC'
    );
    const tareas = (tareasR.rows as unknown as IpTareaRow[]).map((row) => {
      const data = parseJsonField(row.data_json);
      const id =
        typeof row.id === 'bigint' ? Number(row.id) : Number(row.id);
      return { ...data, id: Number.isFinite(id) ? id : row.id };
    });

    res.json({ pacientes, agenda, fichas, tareas });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes state:', msg);
    res.status(500).json({ error: 'Failed to load state' });
  }
});

/**
 * GET /api/inteligencia-pacientes/goals?ym=YYYY-MM
 */
router.get('/goals', async (req: Request, res: Response) => {
  const ym = String(req.query.ym || '').trim();
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    res.status(400).json({ error: 'ym must be YYYY-MM' });
    return;
  }
  try {
    const r = await inteligenciaQuery('SELECT goals_json FROM ip_monthly_goals WHERE ym = ?', [ym]);
    const row = r.rows[0] as { goals_json: unknown } | undefined;
    let goals: Record<string, number> = {};
    if (row?.goals_json != null) {
      const raw = row.goals_json;
      const obj =
        typeof raw === 'string'
          ? (JSON.parse(raw) as Record<string, unknown>)
          : (raw as Record<string, unknown>);
      for (const [k, v] of Object.entries(obj)) {
        const n = Number(v);
        if (typeof k === 'string' && Number.isFinite(n) && n >= 0) goals[k] = n;
      }
    }
    res.json({ ym, goals });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes get goals:', msg);
    res.status(500).json({ error: 'Failed to load goals' });
  }
});

/**
 * PUT /api/inteligencia-pacientes/goals
 * Body: { ym: 'YYYY-MM', goals: Record<string, number> }
 */
router.put('/goals', async (req: Request, res: Response) => {
  const ym = String((req.body as { ym?: string })?.ym || '').trim();
  const goalsIn = (req.body as { goals?: unknown })?.goals;
  if (!/^\d{4}-\d{2}$/.test(ym)) {
    res.status(400).json({ error: 'ym must be YYYY-MM' });
    return;
  }
  if (goalsIn == null || typeof goalsIn !== 'object' || Array.isArray(goalsIn)) {
    res.status(400).json({ error: 'goals must be an object' });
    return;
  }
  const cleaned: Record<string, number> = {};
  for (const [k, v] of Object.entries(goalsIn as Record<string, unknown>)) {
    if (typeof k !== 'string' || k.length > 96) continue;
    const n = Number(v);
    if (Number.isFinite(n) && n >= 0 && n < 1e16) cleaned[k] = n;
  }
  try {
    await inteligenciaQuery(
      `INSERT INTO ip_monthly_goals (ym, goals_json) VALUES (?, ?)
       ON DUPLICATE KEY UPDATE goals_json = VALUES(goals_json), updated_at = CURRENT_TIMESTAMP`,
      [ym, JSON.stringify(cleaned)]
    );
    res.json({ ok: true, ym, goals: cleaned });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes put goals:', msg);
    res.status(500).json({ error: 'Failed to save goals' });
  }
});

/**
 * DELETE /api/inteligencia-pacientes/demo-data
 * Admin only: removes rows whose stored payload still exactly matches bundled JSON seeds (by doc/id + data).
 * Does not truncate tables. Skips rows that were edited or replaced (e.g. import with same key).
 */
router.delete('/demo-data', async (req: Request, res: Response) => {
  if (req.user?.ipRol !== 'admin') {
    res.status(403).json({ error: 'Se requiere administrador de Inteligencia' });
    return;
  }
  try {
    const result = await purgeInteligenciaDemoSeedData();
    res.json({ ok: true, deleted: result.deleted });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes purge demo:', msg);
    res.status(500).json({ error: 'No se pudo eliminar el demo', detail: msg });
  }
});

/**
 * POST /api/inteligencia-pacientes/demo-data/reseed
 * Admin only: re-inserts bundled demo rows for any ip_* table that is still empty (same as server init).
 */
router.post('/demo-data/reseed', async (req: Request, res: Response) => {
  if (req.user?.ipRol !== 'admin') {
    res.status(403).json({ error: 'Se requiere administrador de Inteligencia' });
    return;
  }
  try {
    const out = await reseedInteligenciaDemoCatalog();
    if (!out.ok) {
      res.status(500).json({ error: out.message });
      return;
    }
    res.json({ ok: true, message: out.message });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes reseed demo:', msg);
    res.status(500).json({ error: msg });
  }
});

/**
 * PUT /api/inteligencia-pacientes/fichas/:doc
 */
router.put('/fichas/:doc', async (req: Request, res: Response) => {
  const rawDoc = req.params.doc;
  const doc = decodeURIComponent(Array.isArray(rawDoc) ? rawDoc[0] : rawDoc);
  const b = req.body as {
    estado?: string;
    ticket?: string;
    actividad?: string;
    notas?: string;
    origen?: string | null;
    modificadoPor?: string | null;
    modificadoEn?: string | null;
  };
  if (!b.estado || !b.ticket || !b.actividad) {
    res.status(400).json({ error: 'estado, ticket, actividad are required' });
    return;
  }
  try {
    await inteligenciaQuery(
      `INSERT INTO ip_fichas (paciente_doc, estado, ticket, actividad, notas, origen, modificado_por, modificado_en)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
         estado = VALUES(estado),
         ticket = VALUES(ticket),
         actividad = VALUES(actividad),
         notas = VALUES(notas),
         origen = VALUES(origen),
         modificado_por = VALUES(modificado_por),
         modificado_en = VALUES(modificado_en)`,
      [
        doc,
        b.estado,
        b.ticket,
        b.actividad,
        b.notas ?? '',
        b.origen ?? null,
        b.modificadoPor ?? null,
        b.modificadoEn ?? null,
      ]
    );
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes put ficha:', msg);
    res.status(500).json({ error: 'Failed to save ficha' });
  }
});

/**
 * DELETE /api/inteligencia-pacientes/fichas/:doc
 */
router.delete('/fichas/:doc', async (req: Request, res: Response) => {
  const rawDoc = req.params.doc;
  const doc = decodeURIComponent(Array.isArray(rawDoc) ? rawDoc[0] : rawDoc);
  try {
    await inteligenciaQuery('DELETE FROM ip_fichas WHERE paciente_doc = ?', [doc]);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes delete ficha:', msg);
    res.status(500).json({ error: 'Failed to delete ficha' });
  }
});

/**
 * POST /api/inteligencia-pacientes/tareas
 */
router.post('/tareas', async (req: Request, res: Response) => {
  const body = req.body as Record<string, unknown>;
  const { id: _drop, ...rest } = body;
  let conn: PoolConnection | undefined;
  try {
    conn = await getIpPool().getConnection();
    const payload = { ...rest };
    const [ins] = await conn.execute('INSERT INTO ip_tareas (data_json) VALUES (?)', [
      JSON.stringify(payload),
    ]);
    const insertId = (ins as ResultSetHeader).insertId;
    const merged = { ...payload, id: insertId };
    await conn.execute('UPDATE ip_tareas SET data_json = ? WHERE id = ?', [
      JSON.stringify(merged),
      insertId,
    ]);
    res.status(201).json(merged);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes post tarea:', msg);
    res.status(500).json({ error: 'Failed to create tarea' });
  } finally {
    if (conn) conn.release();
  }
});

/**
 * PATCH /api/inteligencia-pacientes/tareas/:id
 */
router.patch('/tareas/:id', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    const r = await inteligenciaQuery('SELECT data_json FROM ip_tareas WHERE id = ?', [id]);
    const rows = r.rows as unknown as IpTareaRow[];
    if (!rows.length) {
      res.status(404).json({ error: 'Tarea not found' });
      return;
    }
    const prev = parseJsonField(rows[0].data_json);
    const patch = req.body as Record<string, unknown>;
    const merged = { ...prev, ...patch, id };
    await inteligenciaQuery('UPDATE ip_tareas SET data_json = ? WHERE id = ?', [JSON.stringify(merged), id]);
    res.json(merged);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes patch tarea:', msg);
    res.status(500).json({ error: 'Failed to update tarea' });
  }
});

/**
 * DELETE /api/inteligencia-pacientes/tareas/:id
 */
router.delete('/tareas/:id', async (req: Request, res: Response) => {
  const rawId = req.params.id;
  const id = parseInt(Array.isArray(rawId) ? rawId[0] : rawId, 10);
  if (Number.isNaN(id)) {
    res.status(400).json({ error: 'Invalid id' });
    return;
  }
  try {
    await inteligenciaQuery('DELETE FROM ip_tareas WHERE id = ?', [id]);
    res.json({ ok: true });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes delete tarea:', msg);
    res.status(500).json({ error: 'Failed to delete tarea' });
  }
});

function csvCell(v: unknown): string {
  const s = v == null ? '' : String(v);
  if (/[\r\n",]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function csvLine(vals: unknown[]): string {
  return vals.map(csvCell).join(',');
}

/**
 * GET /api/inteligencia-pacientes/reports/csv?kind=pacientes|agenda|fichas|tareas|all
 * UTF-8 CSV for Inteligencia CRM scope (Medifony-synced data + fichas + tareas).
 */
router.get('/reports/csv', async (req: Request, res: Response) => {
  const kind = String(req.query.kind || 'pacientes').toLowerCase();
  const allowed = ['pacientes', 'agenda', 'fichas', 'tareas', 'all'];
  if (!allowed.includes(kind)) {
    res.status(400).type('text/plain').send('Invalid kind');
    return;
  }
  const stamp = new Date().toISOString().slice(0, 10);

  try {
    const blocks: string[] = [];

    const addPacientes = async () => {
      const pacR = await inteligenciaQuery('SELECT doc, data_json FROM ip_pacientes ORDER BY doc ASC');
      const rows = pacR.rows as unknown as IpPacienteRow[];
      const lines: string[] = [
        csvLine([
          'doc',
          'nombre',
          'celular',
          'edad',
          'procedencia',
          'valor_total',
          'visitas',
          'ultima',
          'subcategorias',
          'profesional',
          'historial_json',
        ]),
      ];
      for (const row of rows) {
        const d = parseJsonField(row.data_json);
        const subcats = Array.isArray(d.subcategorias)
          ? (d.subcategorias as string[]).join('|')
          : String(d.subcategorias ?? '');
        lines.push(
          csvLine([
            row.doc,
            d.nombre,
            d.celular,
            d.edad,
            d.procedencia,
            d.valor_total,
            d.visitas,
            d.ultima,
            subcats,
            d.profesional,
            JSON.stringify(d.historial ?? []),
          ])
        );
      }
      blocks.push(lines.join('\n'));
    };

    const addAgenda = async () => {
      const agR = await inteligenciaQuery('SELECT id, data_json FROM ip_agenda ORDER BY id ASC');
      const lines: string[] = [
        csvLine([
          'id',
          'fecha',
          'hora',
          'doc',
          'nombre',
          'profesional',
          'cups',
          'subcategoria',
          'valor',
        ]),
      ];
      for (const row of agR.rows as unknown as IpAgendaRow[]) {
        const d = parseJsonField(row.data_json);
        const id = typeof row.id === 'bigint' ? Number(row.id) : Number(row.id);
        lines.push(
          csvLine([
            id,
            d.fecha,
            d.hora,
            d.doc,
            d.nombre,
            d.profesional,
            d.cups,
            d.subcategoria,
            d.valor,
          ])
        );
      }
      blocks.push(lines.join('\n'));
    };

    const addFichas = async () => {
      const fichasR = await inteligenciaQuery(
        'SELECT paciente_doc, estado, ticket, actividad, notas, origen, modificado_por, modificado_en FROM ip_fichas ORDER BY paciente_doc ASC'
      );
      const lines: string[] = [
        csvLine([
          'paciente_doc',
          'estado',
          'ticket',
          'actividad',
          'notas',
          'origen',
          'modificado_por',
          'modificado_en',
        ]),
      ];
      for (const row of fichasR.rows as unknown as IpFichaRow[]) {
        lines.push(
          csvLine([
            row.paciente_doc,
            row.estado,
            row.ticket,
            row.actividad,
            row.notas ?? '',
            row.origen,
            row.modificado_por,
            row.modificado_en,
          ])
        );
      }
      blocks.push(lines.join('\n'));
    };

    const addTareas = async () => {
      const tareasR = await inteligenciaQuery('SELECT id, data_json FROM ip_tareas ORDER BY id ASC');
      const lines: string[] = [
        csvLine([
          'id',
          'tipo',
          'pacDoc',
          'pacNombre',
          'pacCelular',
          'pacValor',
          'pacServicios',
          'fichaNotas',
          'fichaTicket',
          'fichaActividad',
          'fichaOrigen',
          'descripcion',
          'estado',
          'contacto1_fecha',
          'contacto1_nota',
          'contacto2_fecha',
          'contacto2_nota',
          'contacto3_fecha',
          'contacto3_nota',
          'citaAgendada',
          'fechaCreacion',
          'creadoPor',
          'asignadoA',
          'prioridad',
        ]),
      ];
      for (const row of tareasR.rows as unknown as IpTareaRow[]) {
        const d = parseJsonField(row.data_json);
        const id = typeof row.id === 'bigint' ? Number(row.id) : Number(row.id);
        const srv = Array.isArray(d.pacServicios)
          ? (d.pacServicios as string[]).join('|')
          : String(d.pacServicios ?? '');
        lines.push(
          csvLine([
            Number.isFinite(id) ? id : row.id,
            d.tipo,
            d.pacDoc,
            d.pacNombre,
            d.pacCelular,
            d.pacValor,
            srv,
            d.fichaNotas,
            d.fichaTicket,
            d.fichaActividad,
            d.fichaOrigen,
            d.descripcion,
            d.estado,
            d.contacto1_fecha,
            d.contacto1_nota,
            d.contacto2_fecha,
            d.contacto2_nota,
            d.contacto3_fecha,
            d.contacto3_nota,
            d.citaAgendada,
            d.fechaCreacion,
            d.creadoPor,
            d.asignadoA,
            d.prioridad,
          ])
        );
      }
      blocks.push(lines.join('\n'));
    };

    if (kind === 'pacientes') await addPacientes();
    else if (kind === 'agenda') await addAgenda();
    else if (kind === 'fichas') await addFichas();
    else if (kind === 'tareas') await addTareas();
    else {
      await addPacientes();
      await addAgenda();
      await addFichas();
      await addTareas();
    }

    const body =
      kind === 'all'
        ? `# Inteligencia export ${stamp}\n# === PACIENTES ===\n${blocks[0]}\n\n# === AGENDA ===\n${blocks[1]}\n\n# === FICHAS ===\n${blocks[2]}\n\n# === TAREAS ===\n${blocks[3]}`
        : blocks[0];

    const name =
      kind === 'all'
        ? `inteligencia_completo_${stamp}.csv`
        : `inteligencia_${kind}_${stamp}.csv`;

    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${name}"`);
    res.send('\uFEFF' + body);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia-pacientes reports csv:', msg);
    res.status(500).type('text/plain').send('Export failed');
  }
});

function numFromMysql(v: unknown): number {
  if (typeof v === 'bigint') return Number(v);
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

/**
 * POST /api/inteligencia-pacientes/import/pacientes
 * multipart field name: file (.xlsx)
 */
router.post('/import/pacientes', upload.single('file'), async (req: Request, res: Response) => {
  const f = req.file;
  if (!f?.buffer?.length) {
    res.status(400).json({ error: 'Archivo Excel requerido (campo: file)' });
    return;
  }
  try {
    const { pacientes, errors: parseErr } = await parsePacientesExcel(f.buffer);
    if (!pacientes.length) {
      res.status(400).json({ imported: 0, errors: parseErr.length ? parseErr : ['Sin filas válidas'] });
      return;
    }
    let imported = 0;
    for (const p of pacientes) {
      await inteligenciaQuery(
        `INSERT INTO ip_pacientes (doc, data_json) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data_json = VALUES(data_json)`,
        [p.doc, JSON.stringify(p)]
      );
      imported++;
    }
    res.json({ imported, errors: parseErr });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia import pacientes:', msg);
    res.status(500).json({ error: 'Error al importar pacientes', detail: msg });
  }
});

/**
 * POST /api/inteligencia-pacientes/import/agenda
 * multipart field name: file (.xlsx)
 */
router.post('/import/agenda', upload.single('file'), async (req: Request, res: Response) => {
  const f = req.file;
  if (!f?.buffer?.length) {
    res.status(400).json({ error: 'Archivo Excel requerido (campo: file)' });
    return;
  }
  try {
    const { citas, errors: parseErr } = await parseAgendaExcel(f.buffer);
    if (!citas.length) {
      res.status(400).json({ imported: 0, errors: parseErr.length ? parseErr : ['Sin filas válidas'] });
      return;
    }

    const maxR = await inteligenciaQuery('SELECT COALESCE(MAX(id), 0) AS m FROM ip_agenda');
    let nextId = numFromMysql((maxR.rows[0] as { m: unknown }).m) + 1;

    let imported = 0;
    for (const c of citas) {
      let id: number;
      if (c.id != null && Number(c.id) > 0) {
        id = Math.floor(Number(c.id));
      } else {
        id = nextId++;
      }
      const row = {
        id,
        fecha: c.fecha,
        hora: c.hora,
        doc: c.doc,
        nombre: c.nombre,
        profesional: c.profesional,
        cups: c.cups,
        subcategoria: c.subcategoria,
        valor: c.valor,
      };
      await inteligenciaQuery(
        `INSERT INTO ip_agenda (id, data_json) VALUES (?, ?)
         ON DUPLICATE KEY UPDATE data_json = VALUES(data_json)`,
        [id, JSON.stringify(row)]
      );
      imported++;
    }
    res.json({ imported, errors: parseErr });
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia import agenda:', msg);
    res.status(500).json({ error: 'Error al importar agenda', detail: msg });
  }
});

/**
 * POST /api/inteligencia-pacientes/sync/medifony
 * Body: { dateFrom, dateTo, replacePacientesCatalog?, replaceAgendaCatalog?,
 *         fullHistorialServicios?, includeAgendaOnlyPacientes? }
 * Lee paciente + consulta_cups + agenda en la BD remota (Medifony / misma que PPTO) y escribe ip_*.
 */
router.post('/sync/medifony', async (req: Request, res: Response) => {
  const b = req.body as {
    dateFrom?: string;
    dateTo?: string;
    replacePacientesCatalog?: boolean;
    replaceAgendaCatalog?: boolean;
    fullHistorialServicios?: boolean;
    includeAgendaOnlyPacientes?: boolean;
  };
  try {
    const result = await syncMedifonyToInteligencia({
      dateFrom: String(b.dateFrom || '').trim(),
      dateTo: String(b.dateTo || '').trim(),
      replacePacientesCatalog: !!b.replacePacientesCatalog,
      replaceAgendaCatalog: !!b.replaceAgendaCatalog,
      fullHistorialServicios: !!b.fullHistorialServicios,
      includeAgendaOnlyPacientes: b.includeAgendaOnlyPacientes !== false,
    });
    res.json(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error('inteligencia sync medifony:', msg);
    const clientErr = /YYYY-MM-DD|dateFrom|posteri/i.test(msg);
    res.status(clientErr ? 400 : 500).json({ error: msg });
  }
});

export default router;
