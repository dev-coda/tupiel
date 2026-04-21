/**
 * Dashboard Data Service
 *
 * Returns structured JSON with all the metrics from the CONTROLADOR PPTO
 * report, ready for chart rendering in the frontend.
 */
import { generateRentabilidad, RentabilidadRow } from './rentabilidad';
import { generateEstimada, EstimadaRow } from './rentabilidad-estimada';
import {
  ControladorConfig,
  DEFAULT_CONFIG,
  PersonBudget,
  ProductTarget,
} from '../config/controlador-config';
import { calculateWorkingDays, calculateWorkingDaysFallback } from './working-days';
import { getMonthlyConfig } from './monthly-config';
import { getProductsFromDB } from './employees-products';
import { query } from '../config/database';
import { toDateString } from '../utils/dates';

// ─── Helpers ───────────────────────────────────────────────

function sumBy<T>(rows: T[], matchField: keyof T, matchValue: string, sumField: keyof T): number {
  return rows
    .filter((r) => String(r[matchField]) === matchValue)
    .reduce((acc, r) => acc + Number(r[sumField] || 0), 0);
}

function countBy<T>(rows: T[], field: keyof T, value: string): number {
  return rows.filter((r) => String(r[field]) === value).length;
}

function sumByDate<T>(
  rows: T[],
  dateField: keyof T,
  date: string,
  sumField: keyof T,
  filterFn?: (r: T) => boolean
): number {
  return rows
    .filter((r) => {
      const d = String(r[dateField] || '').substring(0, 10);
      return d === date && (!filterFn || filterFn(r));
    })
    .reduce((acc, r) => acc + Number(r[sumField] || 0), 0);
}

function dateRange(from: string, to: string): string[] {
  const dates: string[] = [];
  const d = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  while (d <= end) {
    dates.push(toDateString(d));
    d.setDate(d.getDate() + 1);
  }
  return dates;
}

/**
 * Query daily billing from facturas (invoices) — both services and products.
 *
 * Services = factura_actividad entries linked to consulta_cups (consulta_cups_id NOT NULL).
 * Products = factura_actividad entries NOT linked to consulta_cups (consulta_cups_id IS NULL),
 *            excluding credit notes (resolucion prefijo starting with 'NC').
 *
 * Returns per-day totals keyed by YYYY-MM-DD (based on factura.fecha_factura).
 */
export async function getDailyFacturaBilling(
  dateFrom: string,
  dateTo: string
): Promise<Map<string, { servicios: number; productos: number }>> {
  const result = await query(`
    SELECT
      LEFT(f.fecha_factura, 10) AS inv_date,
      SUM(CASE WHEN faa.consulta_cups_id IS NOT NULL
          THEN cc.valor ELSE 0 END) AS servicios,
      SUM(CASE WHEN faa.consulta_cups_id IS NULL
            AND (res.prefijo IS NULL OR res.prefijo NOT LIKE 'NC%')
          THEN faa.precio_unitario * faa.cantidad ELSE 0 END) AS productos
    FROM factura_actividad faa
    JOIN factura f ON f.id = faa.factura_id
    LEFT JOIN consulta_cups cc ON cc.id = faa.consulta_cups_id
    LEFT JOIN resolucion res ON res.id = f.resolucion_id
    WHERE f.fecha_factura BETWEEN ? AND ?
      AND f.estado >= 0
      AND faa.anular = 0
    GROUP BY LEFT(f.fecha_factura, 10)
    ORDER BY inv_date
  `, [dateFrom, `${dateTo} 23:59:59`]);

  const map = new Map<string, { servicios: number; productos: number }>();
  for (const row of result.rows) {
    map.set(String(row.inv_date), {
      servicios: Number(row.servicios || 0),
      productos: Number(row.productos || 0),
    });
  }
  return map;
}

// ─── Types ─────────────────────────────────────────────────

export interface PersonMetrics {
  nombre: string;
  grupo: string;               // 'DERMATOLOGÍA' | 'MED ESTÉTICA' | 'TP LOUNGE'
  atenciones: number;
  venta: number;
  presupuesto: number;
  pctVenta: number;
  ventaIdeal: number;
  proyeccion: number;
  pctProyeccion: number;
  pendiente: number;
  pctEsperado: number;         // (venta + proyeccion) / presupuesto
}

export interface BusinessUnit {
  nombre: string;
  venta: number;
  meta: number;
  pctCumplimiento: number;
  faltaria: number;
}

export interface DailyMetrics {
  fecha: string;
  gestionComercial: number;    // Estimada vlr for this date
  facturado: number;           // Paid rentabilidad vlr
  cartera: number;             // Unpaid rentabilidad vlr
  serviciosPrestados: number;  // Total rentabilidad vlr
  productosFacturado: number;  // Product sales from POS (factura_actividad w/ NULL consulta_cups_id)
  metaDia: number;
  pctCumplimiento: number;
}

export interface WeeklySummary {
  label: string;
  gestionComercial: number;
  serviciosPrestados: number;
}

export interface ProductMetrics {
  nombre: string;
  meta: number;
  vendidos: number;
  faltan: number;
  pctCumplimiento: number;
  ventaTotal: number;  // Total sales value in $
}

export interface ServiceSubcategoryMetrics {
  subCategoria: string;
  atenciones: number;
  venta: number;
  pctDelTotal: number;
}

export interface StrategyMetrics {
  metaGlobal: number;
  diasHabiles: number;
  diasEjecutados: number;
  facturado: number;
  proyeccion: number;
  ventaEsperada: number;
  faltaCumplir: number;
  resultadoEsperado: number;
  pctResultado: number;
  pctAlDia: number;
  pctRealCum: number;
  pctDiferencia: number;
  metaDiaria: number;
}

export interface DashboardData {
  generated_at: string;
  date_from: string;
  date_to: string;

  strategy: StrategyMetrics;
  businessUnits: BusinessUnit[];
  personnel: PersonMetrics[];
  dailyMetrics: DailyMetrics[];
  weeklySummaries: WeeklySummary[];
  products: ProductMetrics[];
  servicesBySubcategory: ServiceSubcategoryMetrics[];

  filterPagoSi: boolean;
  totalRegistrosRent: number;
  totalRegistrosEst: number;
  totalVlrRent: number;
  totalVlrEst: number;
  totalRentabilidad: number;
}

// ─── Main ──────────────────────────────────────────────────

export async function generateDashboardData(
  dateFrom: string,
  dateTo: string,
  config: Partial<ControladorConfig> = {},
  filterPagoSi: boolean = true
): Promise<DashboardData> {
  // Extract year/month from dateFrom
  const dateFromObj = new Date(dateFrom + 'T00:00:00');
  const year = dateFromObj.getFullYear();
  const month = dateFromObj.getMonth() + 1;

  // Load config from database (with fallback to defaults)
  let cfg: ControladorConfig;
  try {
    cfg = await getMonthlyConfig(year, month, dateFrom, dateTo);
    console.log(`✅ Loaded monthly config from database for ${year}-${month}`);
  } catch (err) {
    console.warn('Failed to load monthly config from database, using defaults:', err);
    cfg = { ...DEFAULT_CONFIG };
    
    // Still calculate working days and dias ejecutados
    try {
      const workingDays = await calculateWorkingDays(dateFrom, dateTo);
      if (workingDays <= 0) {
        throw new Error(`Invalid working days calculation: ${workingDays}`);
      }
      cfg.diasHabilesMes = workingDays;
    } catch (err2) {
      cfg.diasHabilesMes = calculateWorkingDaysFallback(dateFrom, dateTo);
    }

    // Auto-calculate dias ejecutados as past business days
    const today = new Date();
    const monthStart = new Date(year, month - 1, 1);
    const todayS = toDateString(today);
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
    
    try {
      const endDate = today < new Date(dateTo + 'T00:00:00') ? todayS : dateTo;
      const workingDaysExecuted = await calculateWorkingDays(monthStartStr, endDate);
      cfg.diasEjecutados = Math.max(1, Math.min(workingDaysExecuted, cfg.diasHabilesMes));
    } catch (err2) {
      const diffDays = Math.floor((today.getTime() - monthStart.getTime()) / 86_400_000);
      cfg.diasEjecutados = Math.max(1, Math.min(diffDays, cfg.diasHabilesMes));
    }
  }

  // Override with any provided config values
  cfg = { ...cfg, ...config };

  console.log('Dashboard: fetching data…');
  const rentReport = await generateRentabilidad(dateFrom, dateTo, {
    includeAllSubCategories: true,
  });
  const estReport = await generateEstimada(dateFrom, dateTo);
  console.log(`  → ${rentReport.rows.length} rent, ${estReport.rows.length} est`);

  const rentRows = filterPagoSi
    ? rentReport.rows.filter((r) => r.pagado_este_mes === 'SI')
    : rentReport.rows;
  const estRows = estReport.rows;

  // ── Factura-based daily billing (services + products by invoice date) ──
  let dailyFactura = new Map<string, { servicios: number; productos: number }>();
  let facturadoProductosFromDB = 0;
  try {
    dailyFactura = await getDailyFacturaBilling(dateFrom, dateTo);
    for (const v of dailyFactura.values()) {
      facturadoProductosFromDB += v.productos;
    }
    console.log(`  → ${dailyFactura.size} days with factura billing, productos=$${facturadoProductosFromDB.toLocaleString()}`);
  } catch (err) {
    console.warn('Failed to load factura-based billing:', err);
  }

  // ── Personnel metrics ──
  const allPeople: { person: PersonBudget; grupo: string }[] = [
    ...cfg.dermatologia.map((p) => ({ person: p, grupo: 'DERMATOLOGÍA' })),
    ...cfg.medEstetica.map((p) => ({ person: p, grupo: 'MED ESTÉTICA' })),
    ...cfg.lounge.map((p) => ({ person: p, grupo: 'TP LOUNGE' })),
  ];

  const personnel: PersonMetrics[] = allPeople.map(({ person, grupo }) => {
    const venta = sumBy(rentRows, 'personal_atiende', person.nombre, 'vlr');
    const atenciones = countBy(rentRows, 'personal_atiende', person.nombre);
    const proyeccion = sumBy(estRows, 'personal_atiende', person.nombre, 'vlr');
    const ventaIdeal = (person.presupuesto / cfg.diasHabilesMes) * cfg.diasEjecutados;
    const pctEsperado = person.presupuesto > 0
      ? (venta + proyeccion) / person.presupuesto : 0;

    return {
      nombre: person.nombre,
      grupo,
      atenciones,
      venta,
      presupuesto: person.presupuesto,
      pctVenta: person.presupuesto > 0 ? venta / person.presupuesto : 0,
      ventaIdeal,
      proyeccion,
      pctProyeccion: person.presupuesto > 0 ? proyeccion / person.presupuesto : 0,
      pendiente: -(person.presupuesto - venta - proyeccion),
      pctEsperado,
    };
  });

  // ── Business units ──
  const dermaVenta = cfg.dermatologia.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );
  const dermaPpto = cfg.dermatologia.reduce((s, p) => s + p.presupuesto, 0);

  const medEstVenta = cfg.medEstetica.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );
  const medEstPpto = cfg.medEstetica.reduce((s, p) => s + p.presupuesto, 0);

  const loungeVenta = cfg.lounge.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );
  const loungePpto = cfg.lounge.reduce((s, p) => s + p.presupuesto, 0);

  const businessUnits: BusinessUnit[] = [
    {
      nombre: 'Dermatología',
      venta: dermaVenta,
      meta: dermaPpto,
      pctCumplimiento: dermaPpto > 0 ? dermaVenta / dermaPpto : 0,
      faltaria: dermaVenta - dermaPpto,
    },
    {
      nombre: 'Medicina Estética',
      venta: medEstVenta,
      meta: medEstPpto,
      pctCumplimiento: medEstPpto > 0 ? medEstVenta / medEstPpto : 0,
      faltaria: medEstVenta - medEstPpto,
    },
    {
      nombre: 'TP Lounge',
      venta: loungeVenta,
      meta: loungePpto,
      pctCumplimiento: loungePpto > 0 ? loungeVenta / loungePpto : 0,
      faltaria: loungeVenta - loungePpto,
    },
    {
      nombre: 'Productos',
      venta: facturadoProductosFromDB,
      meta: cfg.metaProductos,
      pctCumplimiento: cfg.metaProductos > 0
        ? facturadoProductosFromDB / cfg.metaProductos : 0,
      faltaria: facturadoProductosFromDB - cfg.metaProductos,
    },
  ];

  // ── Daily metrics ──
  // Daily goal is calculated using working days (not calendar days)
  // This ensures the goal adjusts automatically when non-working days are added/removed
  const dates = dateRange(dateFrom, dateTo);
  if (cfg.diasHabilesMes <= 0) {
    throw new Error('Working days (diasHabilesMes) must be calculated before computing daily metrics');
  }
  const metaDia = cfg.metaGlobal / cfg.diasHabilesMes;

  const dailyMetrics: DailyMetrics[] = dates.map((d) => {
    const gestion = sumByDate(estRows, 'fecha_realizacion_o_programada', d, 'vlr');
    const fb = dailyFactura.get(d);

    // Use factura-based totals (by invoice date) for accurate billing
    const facturado = fb?.servicios ?? sumByDate(
      rentRows, 'fecha_realizacion', d, 'vlr',
      (r) => r.pagado_este_mes === 'SI'
    );
    const productosFacturado = fb?.productos ?? 0;
    const servicios = facturado;
    const cartera = 0;

    return {
      fecha: d,
      gestionComercial: gestion,
      facturado,
      cartera,
      serviciosPrestados: servicios,
      productosFacturado,
      metaDia: Math.round(metaDia),
      pctCumplimiento: metaDia > 0 && servicios > 0 ? servicios / metaDia : 0,
    };
  });

  // ── Weekly summaries ──
  const weekBounds = [
    { label: 'Semana 1', start: 0, end: 4 },
    { label: 'Semana 2', start: 5, end: 11 },
    { label: 'Semana 3', start: 12, end: 18 },
    { label: 'Semana 4', start: 19, end: 25 },
    { label: 'Semana 5', start: 26, end: 30 },
  ];
  const weeklySummaries: WeeklySummary[] = weekBounds
    .filter((w) => w.start < dates.length)
    .map((w) => {
      let gestion = 0, servicios = 0;
      for (let i = w.start; i <= Math.min(w.end, dates.length - 1); i++) {
        gestion += dailyMetrics[i].gestionComercial;
        servicios += dailyMetrics[i].serviciosPrestados;
      }
      return { label: w.label, gestionComercial: gestion, serviciosPrestados: servicios };
    });

  // ── Product metrics ──
  // Load actual vendidos (units used) and sales values from production DB
  let productsFromDB: { key: string; vendidos: number; ventaTotal: number }[] = [];
  try {
    productsFromDB = await getProductsFromDB(dateFrom, dateTo);
  } catch (err) {
    console.warn('Failed to load product usage from production DB:', err);
  }
  const vendidosMap = new Map<string, number>();
  const ventaTotalMap = new Map<string, number>();
  for (const p of productsFromDB) {
    vendidosMap.set(p.key, p.vendidos);
    ventaTotalMap.set(p.key, p.ventaTotal);
  }

  const productEntries: { label: string; key: string; target: ProductTarget }[] = [
    { label: 'Botox', key: 'botox', target: cfg.botox },
    { label: 'Radiesse', key: 'radiesse', target: cfg.radiesse },
    { label: 'Harmonyca', key: 'harmonyca', target: cfg.harmonyca },
    { label: 'Skinvive', key: 'skinvive', target: cfg.skinvive },
    { label: 'Belotero Balance', key: 'belotero.balance', target: cfg.belotero.balance },
    { label: 'Belotero Intense', key: 'belotero.intense', target: cfg.belotero.intense },
    { label: 'Belotero Volume', key: 'belotero.volume', target: cfg.belotero.volume },
    { label: 'Belotero Revive', key: 'belotero.revive', target: cfg.belotero.revive },
  ];

  const products: ProductMetrics[] = productEntries.map((p) => {
    const vendidos = vendidosMap.get(p.key) ?? 0;
    const ventaTotal = ventaTotalMap.get(p.key) ?? 0;
    return {
      nombre: p.label,
      meta: p.target.meta,
      vendidos,
      faltan: Math.max(0, p.target.meta - vendidos),
      pctCumplimiento: p.target.meta > 0 ? vendidos / p.target.meta : 0,
      ventaTotal,
    };
  });

  // ── Services by subcategory ──
  const subCatMap = new Map<string, { venta: number; atenciones: number }>();
  for (const r of rentRows) {
    const key = r.sub_categoria || '(Sin subcategoría)';
    const existing = subCatMap.get(key) || { venta: 0, atenciones: 0 };
    existing.venta += r.vlr;
    existing.atenciones += 1;
    subCatMap.set(key, existing);
  }
  const totalVentaServicios = rentRows.reduce((s, r) => s + r.vlr, 0);
  const servicesBySubcategory: ServiceSubcategoryMetrics[] = Array.from(subCatMap.entries())
    .map(([subCategoria, data]) => ({
      subCategoria,
      atenciones: data.atenciones,
      venta: data.venta,
      pctDelTotal: totalVentaServicios > 0 ? data.venta / totalVentaServicios : 0,
    }))
    .sort((a, b) => b.venta - a.venta);

  // ── Strategy ──
  const totalFacturado = dermaVenta + medEstVenta + loungeVenta + facturadoProductosFromDB;
  const totalProyeccion = estRows.reduce((s, r) => s + r.vlr, 0);
  const pctAlDia = cfg.diasEjecutados / cfg.diasHabilesMes;
  const pctRealCum = totalFacturado / cfg.metaGlobal;
  const ventaEsperada = metaDia * cfg.diasEjecutados;
  const faltaCumplir = cfg.metaGlobal - totalFacturado - totalProyeccion;
  const resultadoEsp = totalFacturado + totalProyeccion;

  const strategy: StrategyMetrics = {
    metaGlobal: cfg.metaGlobal,
    diasHabiles: cfg.diasHabilesMes,
    diasEjecutados: cfg.diasEjecutados,
    facturado: totalFacturado,
    proyeccion: totalProyeccion,
    ventaEsperada,
    faltaCumplir,
    resultadoEsperado: resultadoEsp,
    pctResultado: cfg.metaGlobal > 0 ? resultadoEsp / cfg.metaGlobal : 0,
    pctAlDia,
    pctRealCum,
    pctDiferencia: pctRealCum - pctAlDia,
    metaDiaria: metaDia,
  };

  return {
    generated_at: new Date().toISOString(),
    date_from: dateFrom,
    date_to: dateTo,
    strategy,
    businessUnits,
    personnel,
    dailyMetrics,
    weeklySummaries,
    products,
    servicesBySubcategory,
    filterPagoSi,
    totalRegistrosRent: rentRows.length,
    totalRegistrosEst: estRows.length,
    totalVlrRent: rentRows.reduce((s, r) => s + r.vlr, 0),
    totalVlrEst: estReport.totals?.vlr ?? 0,
    totalRentabilidad: rentRows.reduce((s, r) => s + r.rentabilidad_total, 0),
  };
}
