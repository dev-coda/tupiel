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
    dates.push(d.toISOString().substring(0, 10));
    d.setDate(d.getDate() + 1);
  }
  return dates;
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

  // Raw totals for summary cards
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
  config: Partial<ControladorConfig> = {}
): Promise<DashboardData> {
  const cfg: ControladorConfig = { ...DEFAULT_CONFIG, ...config };

  // Auto-compute diasEjecutados
  if (cfg.diasEjecutados === 0) {
    const today = new Date();
    const monthStart = new Date(dateFrom + 'T00:00:00');
    const diffDays = Math.floor(
      (today.getTime() - monthStart.getTime()) / 86_400_000
    );
    cfg.diasEjecutados = Math.max(1, Math.min(diffDays, cfg.diasHabilesMes));
  }

  console.log('Dashboard: fetching data…');
  const rentReport = await generateRentabilidad(dateFrom, dateTo, {
    includeAllSubCategories: true,
  });
  const estReport = await generateEstimada(dateFrom, dateTo);
  console.log(`  → ${rentReport.rows.length} rent, ${estReport.rows.length} est`);

  const rentRows = rentReport.rows;
  const estRows = estReport.rows;

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
      venta: cfg.facturadoProductos,
      meta: cfg.metaProductos,
      pctCumplimiento: cfg.metaProductos > 0
        ? cfg.facturadoProductos / cfg.metaProductos : 0,
      faltaria: cfg.facturadoProductos - cfg.metaProductos,
    },
  ];

  // ── Daily metrics ──
  const dates = dateRange(dateFrom, dateTo);
  const metaDia = cfg.metaGlobal / cfg.diasHabilesMes;

  const dailyMetrics: DailyMetrics[] = dates.map((d) => {
    const gestion = sumByDate(estRows, 'fecha_realizacion_o_programada', d, 'vlr');
    const facturado = sumByDate(
      rentRows, 'fecha_realizacion', d, 'vlr',
      (r) => r.pagado_este_mes === 'SI'
    );
    const cartera = sumByDate(
      rentRows, 'fecha_realizacion', d, 'vlr',
      (r) => r.pagado_este_mes !== 'SI'
    );
    const servicios = sumByDate(rentRows, 'fecha_realizacion', d, 'vlr');

    return {
      fecha: d,
      gestionComercial: gestion,
      facturado,
      cartera,
      serviciosPrestados: servicios,
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
  const productEntries: { label: string; target: ProductTarget }[] = [
    { label: 'Botox', target: cfg.botox },
    { label: 'Radiesse', target: cfg.radiesse },
    { label: 'Harmonyca', target: cfg.harmonyca },
    { label: 'Skinvive', target: cfg.skinvive },
    { label: 'Belotero Balance', target: cfg.belotero.balance },
    { label: 'Belotero Intense', target: cfg.belotero.intense },
    { label: 'Belotero Volume', target: cfg.belotero.volume },
    { label: 'Belotero Revive', target: cfg.belotero.revive },
  ];

  const products: ProductMetrics[] = productEntries.map((p) => {
    const vendidos = Math.max(0, p.target.meta - p.target.disponibles);
    return {
      nombre: p.label,
      meta: p.target.meta,
      vendidos,
      faltan: p.target.meta - vendidos,
      pctCumplimiento: p.target.meta > 0 ? vendidos / p.target.meta : 0,
    };
  });

  // ── Strategy ──
  const totalFacturado = dermaVenta + medEstVenta + loungeVenta + cfg.facturadoProductos;
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
    totalRegistrosRent: rentRows.length,
    totalRegistrosEst: estRows.length,
    totalVlrRent: rentReport.totals.vlr,
    totalVlrEst: estReport.totals?.vlr ?? 0,
    totalRentabilidad: rentReport.totals.rentabilidad_total,
  };
}
