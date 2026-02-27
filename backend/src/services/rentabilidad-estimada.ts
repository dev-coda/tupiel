import { query } from '../config/database';

export interface EstimadaRow {
  atencion: number;
  registro: number;
  fecha_realizacion_o_programada: string;
  doc_paciente: string;
  nombre_paciente: string;
  personal_atiende: string;
  codigo_cups: string;
  cups: string;
  sub_categoria: string; // "SUBCATEGORIA - CATEGORIA" format
  categoria: string;
  dispositivo: string;
  vlr: number;
  vlr_comisiones: number;
  vlr_insumos: number;
  costo_adicional: number;
  rentabilidad_insumos: number;
  rentabilidad_equipos: number;
  rentabilidad_ips: number;
  rentabilidad_total: number;
  rentabilidad_porcentaje: number | string;
  pendiente_registrar: string;
  fecha_facturacion: string;
  pagado_este_mes: string;
  procedencia_recomendacion: string;
  edad_paciente: number | null;
  numero_factura: string;
}

export interface EstimadaReport {
  generated_at: string;
  date_from: string;
  date_to: string;
  rows: EstimadaRow[];
  totals: {
    vlr: number;
    vlr_comisiones: number;
    vlr_insumos: number;
    costo_adicional: number;
    rentabilidad_insumos: number;
    rentabilidad_equipos: number;
    rentabilidad_ips: number;
    rentabilidad_total: number;
    rentabilidad_porcentaje: number;
  };
}

/**
 * Format a date value as YYYY-MM-DD HH:mm:ss WITHOUT timezone conversion.
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
  if (/^\d{4}-\d{2}-\d{2}/.test(str)) return str.substring(0, 19);
  return str;
}

export async function generateEstimada(
  dateFrom: string,
  dateTo: string
): Promise<EstimadaReport> {
  // ──────────────────────────────────────────────
  // 1. Core query — scheduled procedures (estado=0, fecha_inicio in range)
  //    NO sub-category exclusions for the estimada report.
  // ──────────────────────────────────────────────
  const coreQuery = `
    SELECT
      c.id                                                AS atencion,
      cc.id                                               AS registro,
      COALESCE(cc.fecha_realizacion, cc.fecha_inicio)     AS fecha_display,
      cc.fecha_realizacion,
      cc.fecha_inicio,
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
      c.personal_user_id                                  AS doctor_id,
      p.fecha_nacimiento,
      p.recomendacion_id
    FROM consulta_cups cc
    JOIN consulta c       ON c.id = cc.consulta_id
    JOIN paciente p       ON p.id = c.paciente_id
    JOIN personal per     ON per.user_id = cc.personal_id
    JOIN cups cu          ON cu.id = cc.cups_id
    LEFT JOIN sub_categoria sc ON sc.id = cu.sub_categoria_id
    LEFT JOIN categoria cat    ON cat.id = sc.categoria_id
    WHERE cc.fecha_inicio BETWEEN ? AND ?
      AND cc.estado = 0
    ORDER BY cc.fecha_inicio ASC
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
  const consultaCupsIds = coreRows.map((r) => Number(r.registro));
  const personalIds = [
    ...new Set([
      ...coreRows.map((r) => Number(r.personal_id)),
      ...coreRows.map((r) => Number(r.doctor_id)),
    ]),
  ];

  // ── 2a. Factura info via factura_actividad ──
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

  // ── 2b. Recomendacion lookup ──
  const recRows = (await query(`SELECT id, descripcion FROM recomendacion`)).rows;
  const recMap = new Map<number, string>();
  for (const r of recRows) recMap.set(Number(r.id), String(r.descripcion));

  // ── 2c. Device name (only for cups with requiere_dispositivos=1) ──
  const cupsRequiringDevices = coreRows
    .filter((r) => Number(r.requiere_dispositivos) === 1)
    .map((r) => Number(r.registro));
  const deviceRows =
    cupsRequiringDevices.length > 0
      ? (
          await query(
            `SELECT ccd.consulta_cups_id,
                    CONCAT(IFNULL(a.codigo_barras, ''), ' ', a.descripcion) AS device_name
             FROM consulta_cups_dispositivo ccd
             JOIN articulo a ON a.id = ccd.articulo_id
             WHERE ccd.consulta_cups_id IN (${cupsRequiringDevices.map(() => '?').join(',')})`,
            cupsRequiringDevices
          )
        ).rows
      : [];
  const deviceMap = new Map<number, string>();
  for (const d of deviceRows) {
    const regId = Number(d.consulta_cups_id);
    if (!deviceMap.has(regId)) {
      deviceMap.set(regId, String(d.device_name).trim());
    }
  }

  // ── 2d. Supply costs (consulta_articulo × transaccion) + plan cost ──
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

  // ── 2e. Additional cost from consulta_cups_costo ──
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

  // ── 2f. Commission rates per personal + tipo ──
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
  // 3. Commission tipo logic
  // ──────────────────────────────────────────────
  function getComisionTipo(row: Record<string, unknown>): number {
    const tipoFormulacion = Number(row.tipo_comision_formulacion || 0);
    if (tipoFormulacion === 6) return 6;
    const subCatDesc = String(row.sub_categoria || '').toUpperCase();
    if (
      subCatDesc.includes('CONSULTA PRIMERA') ||
      subCatDesc.includes('VALORACION')
    )
      return 1;
    if (subCatDesc.includes('CONSULTA CONTROL')) return 5;
    return 3;
  }

  // ──────────────────────────────────────────────
  // 4. Build report rows
  // ──────────────────────────────────────────────
  const monthStart = dateFrom.substring(0, 7);
  const rows: EstimadaRow[] = [];

  for (const r of coreRows) {
    const atencion = Number(r.atencion);
    const registro = Number(r.registro);
    const vlr = Number(r.vlr || 0);
    const personalId = Number(r.personal_id);
    const hasFechaRealizacion = !!r.fecha_realizacion;

    // Factura info
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

    // ── Supply costs ──
    const insumoData = insumoCostMap.get(registro);
    const vlrInsumos = insumoData?.purchase_total || 0;
    const planInsumoTotal = insumoData?.plan_total || 0;
    const rentabilidadInsumos = planInsumoTotal - vlrInsumos;

    // ── Additional cost ──
    const costoAdicional = costoAdicMap.get(registro) || 0;

    // ── Commission ──
    // For tipo_comision_formulacion = 2: combine doctor's tipo-2 rate + performer's tipo-3 rate
    const tipoFormulacion = Number(r.tipo_comision_formulacion || 0);
    const doctorId = Number(r.doctor_id);
    let comPct: number;

    if (tipoFormulacion === 2 && doctorId !== personalId) {
      const doctorComisiones = comisionMap.get(doctorId);
      const doctorTipo2 = doctorComisiones?.get(2)?.pct ?? 0;
      const performerComisiones = comisionMap.get(personalId);
      const performerTipo3 = performerComisiones?.get(3)?.pct ?? 0;
      comPct = doctorTipo2 + performerTipo3;
    } else {
      const comTipo = getComisionTipo(r);
      const personalComisiones = comisionMap.get(personalId);
      const comInfo = personalComisiones?.get(comTipo);
      comPct = comInfo?.pct ?? 50;
    }

    const comBase = vlr - planInsumoTotal - costoAdicional;
    const vlrComisiones = vlr > 0 ? Math.round((comBase * comPct) / 100 * 10) / 10 : 0;

    // ── Rentabilidad Ips = Vlr - Comisiones - Insumos - Adicional ──
    const rentabilidadIps = vlr - vlrComisiones - vlrInsumos - costoAdicional;

    // ── Bank cost: 2% of vlr for rows with existing invoices ──
    let estimatedBankCost = 0;
    if (pagadoEsteMes === 'NO' && vlr > 0) {
      estimatedBankCost = Math.round(vlr * 0.02);
    }

    // ── Rentabilidad Total = Ips - bank cost ──
    const rentabilidadTotal = rentabilidadIps - estimatedBankCost;

    // ── Percentage ──
    const hasInsumos = vlrInsumos > 0 || planInsumoTotal > 0;
    const rentabilidadPorcentaje: number | string =
      vlr > 0
        ? hasInsumos
          ? Math.round((rentabilidadTotal / vlr) * 10000) / 10000
          : 'Revisar insumos'
        : 'Revisar insumos';

    // ── Pendiente Registrar ──
    const pendienteRegistrar = hasFechaRealizacion ? 'NO' : 'SI';

    // ── Device ──
    const deviceName = deviceMap.get(registro) || '';

    // ── Recomendacion ──
    const recId = Number(r.recomendacion_id || 0);
    const procedencia = recMap.get(recId) || '';

    // ── Age ──
    const fechaNac = r.fecha_nacimiento
      ? new Date(String(r.fecha_nacimiento))
      : null;
    const fechaRef = r.fecha_display
      ? new Date(String(r.fecha_display))
      : new Date();
    let edadPaciente: number | null = null;
    if (fechaNac && !isNaN(fechaNac.getTime())) {
      edadPaciente = Math.floor(
        (fechaRef.getTime() - fechaNac.getTime()) / (365.25 * 86400000)
      );
    }

    // ── Sub-category format: "SUBCATEGORIA - CATEGORIA" ──
    const subCat = String(r.sub_categoria || '');
    const cat = String(r.categoria || '');
    const subCatDisplay = subCat && cat ? `${subCat} - ${cat}` : subCat || cat;

    rows.push({
      atencion,
      registro,
      fecha_realizacion_o_programada: fmtDate(r.fecha_display),
      doc_paciente: String(r.doc_paciente || ''),
      nombre_paciente: String(r.nombre_paciente || ''),
      personal_atiende: String(r.personal_atiende || ''),
      codigo_cups: String(r.codigo_cups || ''),
      cups: String(r.cups || ''),
      sub_categoria: subCatDisplay,
      categoria: cat,
      dispositivo: deviceName,
      vlr,
      vlr_comisiones: Math.round(vlrComisiones * 10) / 10,
      vlr_insumos: Math.round(vlrInsumos * 100) / 100,
      costo_adicional: costoAdicional,
      rentabilidad_insumos: Math.round(rentabilidadInsumos * 100) / 100,
      rentabilidad_equipos: 0,
      rentabilidad_ips: Math.round(rentabilidadIps * 10) / 10,
      rentabilidad_total: Math.round(rentabilidadTotal * 10) / 10,
      rentabilidad_porcentaje: typeof rentabilidadPorcentaje === 'number'
        ? Math.round(rentabilidadPorcentaje * 10000) / 10000
        : rentabilidadPorcentaje,
      pendiente_registrar: pendienteRegistrar,
      fecha_facturacion: fechaFacturacion,
      pagado_este_mes: pagadoEsteMes,
      procedencia_recomendacion: procedencia,
      edad_paciente: edadPaciente,
      numero_factura: numeroFactura,
    });
  }

  // Totals
  const totals = rows.reduce(
    (acc, r) => ({
      vlr: acc.vlr + r.vlr,
      vlr_comisiones: acc.vlr_comisiones + r.vlr_comisiones,
      vlr_insumos: acc.vlr_insumos + r.vlr_insumos,
      costo_adicional: acc.costo_adicional + r.costo_adicional,
      rentabilidad_insumos: acc.rentabilidad_insumos + r.rentabilidad_insumos,
      rentabilidad_equipos: acc.rentabilidad_equipos + r.rentabilidad_equipos,
      rentabilidad_ips: acc.rentabilidad_ips + r.rentabilidad_ips,
      rentabilidad_total: acc.rentabilidad_total + r.rentabilidad_total,
      rentabilidad_porcentaje: 0,
    }),
    {
      vlr: 0,
      vlr_comisiones: 0,
      vlr_insumos: 0,
      costo_adicional: 0,
      rentabilidad_insumos: 0,
      rentabilidad_equipos: 0,
      rentabilidad_ips: 0,
      rentabilidad_total: 0,
      rentabilidad_porcentaje: 0,
    }
  );
  totals.rentabilidad_porcentaje =
    totals.vlr > 0
      ? Math.round((totals.rentabilidad_total / totals.vlr) * 100000000) / 100000000
      : 0;

  return {
    generated_at: new Date().toISOString(),
    date_from: dateFrom,
    date_to: dateTo,
    rows,
    totals,
  };
}

function emptyReport(dateFrom: string, dateTo: string): EstimadaReport {
  return {
    generated_at: new Date().toISOString(),
    date_from: dateFrom,
    date_to: dateTo,
    rows: [],
    totals: {
      vlr: 0,
      vlr_comisiones: 0,
      vlr_insumos: 0,
      costo_adicional: 0,
      rentabilidad_insumos: 0,
      rentabilidad_equipos: 0,
      rentabilidad_ips: 0,
      rentabilidad_total: 0,
      rentabilidad_porcentaje: 0,
    },
  };
}
