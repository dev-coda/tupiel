import { query } from '../config/database';

export interface RentabilidadRow {
  atencion: number;
  registro: number;
  fecha_realizacion: string;
  doc_paciente: string;
  nombre_paciente: string;
  personal_atiende: string;
  codigo_cups: string;
  cups: string;
  sub_categoria: string;
  categoria: string;
  dispositivo: string;
  vlr: number;
  costo_comisiones: number;
  costo_insumos: number;
  costo_bancario: number;
  costo_adicional: number;
  rentabilidad_insumos: number;
  rentabilidad_equipos: number;
  rentabilidad_total: number;
  promedio_porcentaje: number;
  observaciones: string;
  fecha_facturacion: string;
  pagado_este_mes: string;
  procedencia_recomendacion: string;
  edad_paciente: number | null;
  numero_factura: string;
  paciente_pais_origen: string;
  paciente_celular: string;
}

export interface RentabilidadReport {
  generated_at: string;
  date_from: string;
  date_to: string;
  rows: RentabilidadRow[];
  totals: {
    vlr: number;
    costo_comisiones: number;
    costo_insumos: number;
    costo_bancario: number;
    costo_adicional: number;
    rentabilidad_insumos: number;
    rentabilidad_equipos: number;
    rentabilidad_total: number;
    promedio_porcentaje: number;
  };
}

// Sub-categories excluded from the report
const EXCLUDED_SUB_CATEGORIA_IDS = new Set([
  9,  // DEPILACION
  12, // SUEROS
  20, // Terapia Respiratoria
  28, // ESTÉTICA
  29, // TENSAMAX  (vlr=0 maintenance sessions — inconsistent inclusion in original)
  36, // HYDRAFACIAL
]);

/**
 * Format a date value as YYYY-MM-DD HH:mm:ss WITHOUT timezone conversion.
 * MySQL dates are in local time (Colombia UTC-5) — we must NOT convert to UTC.
 */
function fmtDate(d: unknown): string {
  if (!d) return '';
  if (d instanceof Date) {
    if (isNaN(d.getTime())) return '';
    const Y = d.getFullYear();
    const M = String(d.getMonth() + 1).padStart(2, '0');
    const D = String(d.getDate()).padStart(2, '0');
    const h = String(d.getHours()).padStart(2, '0');
    const m = String(d.getMinutes()).padStart(2, '0');
    const s = String(d.getSeconds()).padStart(2, '0');
    return `${Y}-${M}-${D} ${h}:${m}:${s}`;
  }
  const str = String(d);
  // Already formatted?
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 19);
  return str;
}

export interface RentabilidadOptions {
  /** If true, skip sub-category exclusions (include all rows). Used by controlador. */
  includeAllSubCategories?: boolean;
}

export async function generateRentabilidad(
  dateFrom: string,
  dateTo: string,
  options: RentabilidadOptions = {}
): Promise<RentabilidadReport> {
  // ──────────────────────────────────────────────
  // 1. Core data query (with sub_categoria filtering)
  // ──────────────────────────────────────────────
  const excludedIds = [...EXCLUDED_SUB_CATEGORIA_IDS].join(',');
  const subCatFilter = options.includeAllSubCategories
    ? ''
    : `AND (cu.sub_categoria_id IS NULL OR cu.sub_categoria_id NOT IN (${excludedIds}))`;
  const coreQuery = `
    SELECT
      c.id                                                AS atencion,
      cc.id                                               AS registro,
      cc.fecha_realizacion,
      CONCAT(p.tipo_documento, ' ', p.numero_documento)   AS doc_paciente,
      CONCAT(p.nombres, ' ', p.apellidos)                 AS nombre_paciente,
      per.nombre                                          AS personal_atiende,
      cu.codigo                                           AS codigo_cups,
      cu.descripcion                                      AS cups,
      IFNULL(sc.descripcion, '')                          AS sub_categoria,
      IFNULL(cat.descripcion, '')                         AS categoria,
      cu.requiere_dispositivos,
      cu.sub_categoria_id,
      cu.tipo_comision_formulacion,
      cc.cups_id,
      cc.valor                                            AS vlr,
      cc.personal_id,
      cc.observaciones                                    AS cc_observaciones,
      p.fecha_nacimiento,
      p.celular                                           AS paciente_celular,
      p.recomendacion_id,
      p.pais_origen_id
    FROM consulta_cups cc
    JOIN consulta c       ON c.id = cc.consulta_id
    JOIN paciente p       ON p.id = c.paciente_id
    JOIN personal per     ON per.user_id = cc.personal_id
    JOIN cups cu          ON cu.id = cc.cups_id
    LEFT JOIN sub_categoria sc ON sc.id = cu.sub_categoria_id
    LEFT JOIN categoria cat    ON cat.id = sc.categoria_id
    WHERE cc.fecha_realizacion BETWEEN ? AND ?
      ${subCatFilter}
    ORDER BY cc.fecha_realizacion ASC
  `;

  const coreRows = (
    await query(coreQuery, [dateFrom, `${dateTo} 23:59:59`])
  ).rows;

  if (coreRows.length === 0) {
    return emptyReport(dateFrom, dateTo);
  }

  // ──────────────────────────────────────────────
  // 2. Batch-load related data
  // ──────────────────────────────────────────────
  const consultaIds = [...new Set(coreRows.map((r) => Number(r.atencion)))];
  const consultaCupsIds = coreRows.map((r) => Number(r.registro));
  const personalIds = [...new Set(coreRows.map((r) => Number(r.personal_id)))];

  // ── 2a. Factura info via factura_actividad (per consulta_cups) ──
  const facturaQuery = `
    SELECT
      fa.consulta_cups_id                     AS registro,
      fa.factura_id,
      f.numero_factura,
      f.fecha_factura,
      f.total                                 AS factura_total,
      IFNULL(res.prefijo, '')                 AS prefijo
    FROM factura_actividad fa
    JOIN factura f ON f.id = fa.factura_id
    LEFT JOIN resolucion res ON res.id = f.resolucion_id
    WHERE fa.consulta_cups_id IN (${consultaCupsIds.map(() => '?').join(',')})
      AND fa.anular = 0
      AND f.estado >= 0
  `;
  const facturaRows =
    consultaCupsIds.length > 0
      ? (await query(facturaQuery, consultaCupsIds)).rows
      : [];

  // Map: registro → { numero_factura, fecha_factura, prefijo, factura_id, factura_total }
  const facturaMap = new Map<
    number,
    {
      numero_factura: string;
      fecha_factura: string;
      prefijo: string;
      factura_id: number;
      factura_total: number;
    }
  >();
  for (const fr of facturaRows) {
    const regId = Number(fr.registro);
    // Use the latest factura_actividad per registro
    if (!facturaMap.has(regId)) {
      facturaMap.set(regId, {
        numero_factura: String(fr.numero_factura || ''),
        fecha_factura: fmtDate(fr.fecha_factura),
        prefijo: String(fr.prefijo || ''),
        factura_id: Number(fr.factura_id),
        factura_total: Number(fr.factura_total || 0),
      });
    }
  }

  // ── 2b. Payment modality per factura (for bank cost calculation) ──
  const facturaIds = [...new Set([...facturaMap.values()].map((f) => f.factura_id))];
  let facturaPaymentMap = new Map<
    number,
    { total_paid: number; non_cash_total: number }
  >();
  if (facturaIds.length > 0) {
    const pagoQuery = `
      SELECT
        fp.factura_id,
        SUM(fp.valor)                                                         AS total_paid,
        SUM(CASE WHEN mp.descripcion != 'EFECTIVO' THEN fp.valor ELSE 0 END) AS non_cash_total
      FROM factura_pago fp
      JOIN modalidad_pago mp ON mp.id = fp.modalidad_pago_id
      WHERE fp.factura_id IN (${facturaIds.map(() => '?').join(',')})
      GROUP BY fp.factura_id
    `;
    const pagoRows = (await query(pagoQuery, facturaIds)).rows;
    for (const pr of pagoRows) {
      facturaPaymentMap.set(Number(pr.factura_id), {
        total_paid: Number(pr.total_paid || 0),
        non_cash_total: Number(pr.non_cash_total || 0),
      });
    }
  }

  // ── 2c. Recomendacion lookup ──
  const recRows = (await query(`SELECT id, descripcion FROM recomendacion`)).rows;
  const recMap = new Map<number, string>();
  for (const r of recRows) recMap.set(Number(r.id), String(r.descripcion));

  // ── 2d. Pais lookup ──
  const paisRows = (await query(`SELECT id, descripcion FROM pais`)).rows;
  const paisMap = new Map<number, string>();
  for (const r of paisRows) paisMap.set(Number(r.id), String(r.descripcion));

  // ── 2e. Device name per consulta_cups (via consulta_cups_dispositivo → articulo) ──
  // Only for cups where requiere_dispositivos = 1
  const cupsRequiringDevices = coreRows
    .filter((r) => Number(r.requiere_dispositivos) === 1)
    .map((r) => Number(r.registro));
  const deviceQuery = `
    SELECT ccd.consulta_cups_id, a.descripcion AS device_name
    FROM consulta_cups_dispositivo ccd
    JOIN articulo a ON a.id = ccd.articulo_id
    WHERE ccd.consulta_cups_id IN (${cupsRequiringDevices.map(() => '?').join(',')})
  `;
  const deviceRows =
    cupsRequiringDevices.length > 0
      ? (await query(deviceQuery, cupsRequiringDevices)).rows
      : [];
  const deviceMap = new Map<number, string>();
  for (const d of deviceRows) {
    const regId = Number(d.consulta_cups_id);
    // Take first device per registro (there's typically one)
    if (!deviceMap.has(regId)) {
      deviceMap.set(regId, String(d.device_name));
    }
  }

  // ── 2f. Supply costs (consulta_articulo × transaccion) + plan cost (plan_articulo) ──
  const insumoQuery = `
    SELECT
      ca.consulta_cups_id,
      ca.articulo_id,
      ca.cantidad,
      COALESCE(t.precio_unitario, 0)     AS purchase_cost,
      COALESCE(pa.costo, 0)              AS plan_cost
    FROM consulta_articulo ca
    LEFT JOIN transaccion t    ON t.id = ca.transaccion_id
    LEFT JOIN plan_articulo pa ON pa.articulo_id = ca.articulo_id
                               AND pa.activo = 1
                               AND pa.plan_id = 1
    WHERE ca.consulta_cups_id IN (${consultaCupsIds.map(() => '?').join(',')})
      AND ca.estado = 0
  `;
  const insumoRows =
    consultaCupsIds.length > 0
      ? (await query(insumoQuery, consultaCupsIds)).rows
      : [];

  // Map: registro → { purchase_total, plan_total }
  const insumoCostMap = new Map<
    number,
    { purchase_total: number; plan_total: number }
  >();
  for (const ir of insumoRows) {
    const regId = Number(ir.consulta_cups_id);
    const qty = Number(ir.cantidad || 0);
    const purchaseCost = qty * Number(ir.purchase_cost || 0);
    const planCost = qty * Number(ir.plan_cost || 0);
    const existing = insumoCostMap.get(regId) || {
      purchase_total: 0,
      plan_total: 0,
    };
    existing.purchase_total += purchaseCost;
    existing.plan_total += planCost;
    insumoCostMap.set(regId, existing);
  }

  // ── 2g. Additional cost from consulta_cups_costo ──
  const costoAdicQuery = `
    SELECT consulta_cups_id, SUM(valor) AS total_costo
    FROM consulta_cups_costo
    WHERE consulta_cups_id IN (${consultaCupsIds.map(() => '?').join(',')})
    GROUP BY consulta_cups_id
  `;
  const costoAdicRows =
    consultaCupsIds.length > 0
      ? (await query(costoAdicQuery, consultaCupsIds)).rows
      : [];
  const costoAdicMap = new Map<number, number>();
  for (const ca of costoAdicRows) {
    costoAdicMap.set(Number(ca.consulta_cups_id), Number(ca.total_costo || 0));
  }

  // ── 2h. Commission rates per personal + tipo ──
  const comisionQuery = `
    SELECT personal_user_id, tipo, porcentaje, sin_costos
    FROM personal_comision
    WHERE personal_user_id IN (${personalIds.map(() => '?').join(',')})
  `;
  const comisionRows =
    personalIds.length > 0
      ? (await query(comisionQuery, personalIds)).rows
      : [];
  const comisionMap = new Map<number, Map<number, { pct: number; sinCostos: boolean }>>();
  for (const cr of comisionRows) {
    const pid = Number(cr.personal_user_id);
    if (!comisionMap.has(pid)) comisionMap.set(pid, new Map());
    comisionMap.get(pid)!.set(Number(cr.tipo), {
      pct: Number(cr.porcentaje),
      sinCostos: Number(cr.sin_costos) === 1,
    });
  }

  // ──────────────────────────────────────────────
  // 3. Determine commission tipo from sub_categoria
  // ──────────────────────────────────────────────
  function getComisionTipo(row: Record<string, unknown>): number {
    const tipoFormulacion = Number(row.tipo_comision_formulacion || 0);
    if (tipoFormulacion === 6) return 6; // HYDRAFACIAL

    const subCatDesc = String(row.sub_categoria || '').toUpperCase();
    if (
      subCatDesc.includes('CONSULTA PRIMERA') ||
      subCatDesc.includes('VALORACION')
    )
      return 1;
    if (subCatDesc.includes('CONSULTA CONTROL')) return 5;

    // Everything else uses tipo 3 (PROCEDIMIENTOS)
    return 3;
  }

  // ──────────────────────────────────────────────
  // 4. Build report rows
  // ──────────────────────────────────────────────
  const monthStart = dateFrom.substring(0, 7); // "YYYY-MM"
  const rows: RentabilidadRow[] = [];

  for (const r of coreRows) {
    const atencion = Number(r.atencion);
    const registro = Number(r.registro);
    const vlr = Number(r.vlr || 0);
    const personalId = Number(r.personal_id);

    // Factura info (via factura_actividad)
    const fInfo = facturaMap.get(registro);
    const fechaFacturacion = fInfo?.fecha_factura || '';
    const numeroFactura = fInfo
      ? `${fInfo.prefijo}${fInfo.numero_factura}`
      : '';

    // Paid this month?
    let pagadoEsteMes = '';
    if (vlr === 0) {
      pagadoEsteMes = 'SIN PAGO';
    } else if (fInfo && fInfo.fecha_factura) {
      const fMonth = fInfo.fecha_factura.substring(0, 7);
      pagadoEsteMes = fMonth === monthStart ? 'SI' : 'NO';
    } else {
      pagadoEsteMes = 'SIN PAGO';
    }

    // ── Bank cost: 2% of non-cash portion on the specific factura ──
    let costoBancario = 0;
    if (fInfo && vlr > 0) {
      const payment = facturaPaymentMap.get(fInfo.factura_id);
      if (payment && payment.non_cash_total > 0) {
        // Proportionally allocate bank cost when factura has multiple registros
        const proportion =
          fInfo.factura_total > 0 ? vlr / fInfo.factura_total : 1;
        costoBancario = Math.round(
          0.02 * payment.non_cash_total * proportion
        );
      }
    }

    // ── Insumo cost (actual purchase) and plan cost (reference) ──
    const insumoData = insumoCostMap.get(registro);
    const costoInsumos = insumoData?.purchase_total || 0;
    const planInsumoTotal = insumoData?.plan_total || 0;
    const rentabilidadInsumos = planInsumoTotal - costoInsumos;

    // ── Additional cost from consulta_cups_costo ──
    const costoAdicional = costoAdicMap.get(registro) || 0;

    // ── Commission ──
    const comTipo = getComisionTipo(r);
    const personalComisiones = comisionMap.get(personalId);
    const comInfo = personalComisiones?.get(comTipo);
    const comPct = comInfo?.pct ?? 50;

    // Commission base uses PLAN cost (not purchase cost) for insumos
    const comBase = vlr - planInsumoTotal - costoBancario - costoAdicional;
    const costoComisiones =
      vlr > 0 ? Math.round((comBase * comPct) / 100) : 0;

    // ── Rentabilidad ──
    const rentabilidadTotal =
      vlr - costoComisiones - costoInsumos - costoBancario - costoAdicional;
    const rentabilidadEquipos = 0;
    const promedioPorcentaje = vlr > 0 ? rentabilidadTotal / vlr : 0;

    // ── Device name (from consulta_cups_dispositivo) ──
    const deviceName = deviceMap.get(registro) || '';

    // ── Recomendacion ──
    const recId = Number(r.recomendacion_id || 0);
    const procedencia = recMap.get(recId) || '';

    // ── Country ──
    const paisId = Number(r.pais_origen_id || 0);
    const paisOrigen = paisMap.get(paisId) || '';

    // ── Age ──
    const fechaNac = r.fecha_nacimiento
      ? new Date(String(r.fecha_nacimiento))
      : null;
    const fechaReal = r.fecha_realizacion
      ? new Date(String(r.fecha_realizacion))
      : new Date();
    let edadPaciente: number | null = null;
    if (fechaNac && !isNaN(fechaNac.getTime())) {
      edadPaciente = Math.floor(
        (fechaReal.getTime() - fechaNac.getTime()) / (365.25 * 86400000)
      );
    }

    rows.push({
      atencion,
      registro,
      fecha_realizacion: fmtDate(r.fecha_realizacion),
      doc_paciente: String(r.doc_paciente || ''),
      nombre_paciente: String(r.nombre_paciente || ''),
      personal_atiende: String(r.personal_atiende || ''),
      codigo_cups: String(r.codigo_cups || ''),
      cups: String(r.cups || ''),
      sub_categoria: String(r.sub_categoria || ''),
      categoria: String(r.categoria || ''),
      dispositivo: deviceName,
      vlr,
      costo_comisiones: costoComisiones,
      costo_insumos: Math.round(costoInsumos * 100) / 100,
      costo_bancario: costoBancario,
      costo_adicional: costoAdicional,
      rentabilidad_insumos: Math.round(rentabilidadInsumos * 100) / 100,
      rentabilidad_equipos: rentabilidadEquipos,
      rentabilidad_total: Math.round(rentabilidadTotal * 100) / 100,
      promedio_porcentaje:
        Math.round(promedioPorcentaje * 100000000) / 100000000,
      observaciones: String(r.cc_observaciones || ''),
      fecha_facturacion: fechaFacturacion,
      pagado_este_mes: pagadoEsteMes,
      procedencia_recomendacion: procedencia,
      edad_paciente: edadPaciente,
      numero_factura: numeroFactura,
      paciente_pais_origen: paisOrigen,
      paciente_celular: (() => {
        let cel = String(r.paciente_celular || '').trim();
        if (cel === '0') cel = '';
        // Strip leading '+' (reference report convention)
        if (cel.startsWith('+') && !cel.includes(' ')) cel = cel.substring(1);
        return cel;
      })(),
    });
  }

  // Totals
  const totals = rows.reduce(
    (acc, r) => ({
      vlr: acc.vlr + r.vlr,
      costo_comisiones: acc.costo_comisiones + r.costo_comisiones,
      costo_insumos: acc.costo_insumos + r.costo_insumos,
      costo_bancario: acc.costo_bancario + r.costo_bancario,
      costo_adicional: acc.costo_adicional + r.costo_adicional,
      rentabilidad_insumos:
        acc.rentabilidad_insumos + r.rentabilidad_insumos,
      rentabilidad_equipos:
        acc.rentabilidad_equipos + r.rentabilidad_equipos,
      rentabilidad_total: acc.rentabilidad_total + r.rentabilidad_total,
      promedio_porcentaje: 0,
    }),
    {
      vlr: 0,
      costo_comisiones: 0,
      costo_insumos: 0,
      costo_bancario: 0,
      costo_adicional: 0,
      rentabilidad_insumos: 0,
      rentabilidad_equipos: 0,
      rentabilidad_total: 0,
      promedio_porcentaje: 0,
    }
  );
  totals.promedio_porcentaje =
    totals.vlr > 0
      ? Math.round((totals.rentabilidad_total / totals.vlr) * 10000) / 10000
      : 0;

  return {
    generated_at: new Date().toISOString(),
    date_from: dateFrom,
    date_to: dateTo,
    rows,
    totals,
  };
}

function emptyReport(dateFrom: string, dateTo: string): RentabilidadReport {
  return {
    generated_at: new Date().toISOString(),
    date_from: dateFrom,
    date_to: dateTo,
    rows: [],
    totals: {
      vlr: 0,
      costo_comisiones: 0,
      costo_insumos: 0,
      costo_bancario: 0,
      costo_adicional: 0,
      rentabilidad_insumos: 0,
      rentabilidad_equipos: 0,
      rentabilidad_total: 0,
      promedio_porcentaje: 0,
    },
  };
}
