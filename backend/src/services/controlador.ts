/**
 * Controlador PPTO Master Report Generator
 *
 * Generates a multi-tab Excel workbook that mirrors the manual
 * "CONTROLADOR PPTO" spreadsheet by pulling data from the DB
 * and computing all dashboard metrics programmatically.
 */
import ExcelJS from 'exceljs';
import { generateRentabilidad, RentabilidadRow } from './rentabilidad';
import { generateEstimada, EstimadaRow } from './rentabilidad-estimada';
import {
  ControladorConfig,
  DEFAULT_CONFIG,
  PersonBudget,
} from '../config/controlador-config';
import { calculateWorkingDays, calculateWorkingDaysFallback } from './working-days';
import { getMonthlyConfig } from './monthly-config';

// ─── Helpers ───────────────────────────────────────────────

function countBy<T>(rows: T[], field: keyof T, value: string): number {
  return rows.filter((r) => String(r[field]) === value).length;
}

function sumBy<T>(rows: T[], matchField: keyof T, matchValue: string, sumField: keyof T): number {
  return rows
    .filter((r) => String(r[matchField]) === matchValue)
    .reduce((acc, r) => acc + Number(r[sumField] || 0), 0);
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

function pct(a: number, b: number): number | string {
  if (b === 0) return 0;
  return Math.round((a / b) * 1e8) / 1e8;
}

// ─── Style helpers ─────────────────────────────────────────

const HEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FF2E5090' }, // Darker blue for better contrast
};
const HEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FFFFFFFF' },
  size: 11,
  name: 'Calibri',
};
const SUBHEADER_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFE7E6F6' }, // Light purple-gray
};
const SUBHEADER_FONT: Partial<ExcelJS.Font> = {
  bold: true,
  color: { argb: 'FF1F1F1F' },
  size: 10,
  name: 'Calibri',
};
const DATA_FONT: Partial<ExcelJS.Font> = {
  size: 10,
  name: 'Calibri',
};
const TOTAL_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF2F2F2' }, // Light gray for totals
};
const ALT_ROW_FILL: ExcelJS.Fill = {
  type: 'pattern',
  pattern: 'solid',
  fgColor: { argb: 'FFF9F9F9' }, // Very light gray for alternating rows
};
const MONEY_FMT = '#,##0';
const PCT_FMT = '0.00%';
const DATE_FMT = 'yyyy-mm-dd';

function styleHeaderRow(ws: ExcelJS.Worksheet, rowNum: number, colCount: number) {
  const row = ws.getRow(rowNum);
  row.height = 25; // Taller header row
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = HEADER_FILL;
    cell.font = HEADER_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }
}

function styleSubheaderRow(ws: ExcelJS.Worksheet, rowNum: number, colCount: number) {
  const row = ws.getRow(rowNum);
  row.height = 20;
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.fill = SUBHEADER_FILL;
    cell.font = SUBHEADER_FONT;
    cell.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF000000' } },
      bottom: { style: 'thin', color: { argb: 'FF000000' } },
      left: { style: 'thin', color: { argb: 'FF000000' } },
      right: { style: 'thin', color: { argb: 'FF000000' } },
    };
  }
}

function styleDataRow(
  ws: ExcelJS.Worksheet,
  rowNum: number,
  colCount: number,
  isAlternate: boolean = false,
  isTotal: boolean = false
) {
  const row = ws.getRow(rowNum);
  row.height = 18; // Consistent row height
  for (let c = 1; c <= colCount; c++) {
    const cell = row.getCell(c);
    cell.font = isTotal ? { ...DATA_FONT, bold: true } : DATA_FONT;
    if (isTotal) {
      cell.fill = TOTAL_FILL;
    } else if (isAlternate) {
      cell.fill = ALT_ROW_FILL;
    }
    cell.alignment = { vertical: 'middle' };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      bottom: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      left: { style: 'thin', color: { argb: 'FFCCCCCC' } },
      right: { style: 'thin', color: { argb: 'FFCCCCCC' } },
    };
  }
}

function applyBorders(ws: ExcelJS.Worksheet, rowStart: number, rowEnd: number, colStart: number, colEnd: number) {
  const thin: Partial<ExcelJS.Border> = { style: 'thin', color: { argb: 'FFCCCCCC' } };
  for (let r = rowStart; r <= rowEnd; r++) {
    for (let c = colStart; c <= colEnd; c++) {
      ws.getRow(r).getCell(c).border = {
        top: thin, left: thin, bottom: thin, right: thin,
      };
    }
  }
}

function setColumnWidths(ws: ExcelJS.Worksheet, widths: number[]) {
  widths.forEach((width, idx) => {
    ws.getColumn(idx + 1).width = width;
  });
}

function freezeHeader(ws: ExcelJS.Worksheet, rowNum: number, colNum: number = 0) {
  ws.views = [{ state: 'frozen', ySplit: rowNum, xSplit: colNum }];
}

// ─── Main ──────────────────────────────────────────────────

export async function generateControlador(
  dateFrom: string,
  dateTo: string,
  config: Partial<ControladorConfig> = {}
): Promise<ExcelJS.Workbook> {
  // Extract year/month from dateFrom
  const dateFromObj = new Date(dateFrom + 'T00:00:00');
  const year = dateFromObj.getFullYear();
  const month = dateFromObj.getMonth() + 1;

  // Load config from database (with fallback to defaults)
  let cfg: ControladorConfig;
  try {
    cfg = await getMonthlyConfig(year, month, dateFrom, dateTo);
    console.log(`✅ Controlador: loaded monthly config from database for ${year}-${month}`);
  } catch (err) {
    console.warn('Controlador: failed to load monthly config from database, using defaults:', err);
    cfg = { ...DEFAULT_CONFIG };
    
    // Still calculate working days
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
    const todayStr = today.toISOString().substring(0, 10);
    const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;
    
    try {
      const endDate = today < new Date(dateTo + 'T00:00:00') ? todayStr : dateTo;
      const workingDaysExecuted = await calculateWorkingDays(monthStartStr, endDate);
      cfg.diasEjecutados = Math.max(1, Math.min(workingDaysExecuted, cfg.diasHabilesMes));
    } catch (err2) {
      const diffDays = Math.floor((today.getTime() - monthStart.getTime()) / 86_400_000);
      cfg.diasEjecutados = Math.max(1, Math.min(diffDays, cfg.diasHabilesMes));
    }
  }

  // Override with any provided config values
  cfg = { ...cfg, ...config };

  // ── 1. Fetch both source reports ──
  // For the controlador, include ALL sub-categories (no filtering)
  console.log('Controlador: fetching rentabilidad data…');
  const rentReport = await generateRentabilidad(dateFrom, dateTo, {
    includeAllSubCategories: true,
  });
  console.log(`  → ${rentReport.rows.length} rentabilidad rows`);

  console.log('Controlador: fetching estimada data…');
  const estReport = await generateEstimada(dateFrom, dateTo);
  console.log(`  → ${estReport.rows.length} estimada rows`);

  // ── 2. Build workbook ──
  const wb = new ExcelJS.Workbook();
  wb.creator = 'TuPiel Reports';
  wb.created = new Date();

  // ── Tab order matches the reference ──
  buildProductosTab(wb, cfg);
  buildPptoLoungeTab(wb, rentReport.rows, estReport.rows, cfg);
  buildPptoCeTab(wb, rentReport.rows, estReport.rows, cfg);
  buildBalancePptoTab(wb, rentReport.rows, estReport.rows, cfg);
  buildInfoProyeccionTab(wb, estReport.rows);
  buildInfoRentabilidadTab(wb, rentReport.rows);
  buildTableroAgendaTab(wb, rentReport.rows, estReport.rows, dateFrom, dateTo, cfg);
  buildReporteXDiasTab(wb, rentReport.rows, estReport.rows, dateFrom, dateTo, cfg);

  return wb;
}

// ═══════════════════════════════════════════════════════════
// Tab builders
// ═══════════════════════════════════════════════════════════

function buildPersonnelSection(
  ws: ExcelJS.Worksheet,
  startRow: number,
  label: string,
  people: PersonBudget[],
  rentRows: RentabilidadRow[],
  estRows: EstimadaRow[],
  cfg: ControladorConfig,
  totalLabel: string
): number {
  let r = startRow;

  for (let i = 0; i < people.length; i++) {
    const p = people[i];
    const row = ws.getRow(r);

    if (i === 0) {
      row.getCell(2).value = label;
      row.getCell(2).font = { bold: true, size: 11 };
      row.getCell(2).fill = SUBHEADER_FILL;
    }

    const atenciones = countBy(rentRows, 'personal_atiende', p.nombre);
    const venta = sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr');
    const presupuesto = p.presupuesto;
    const pctVenta = presupuesto > 0 ? venta / presupuesto : 0;
    const ventaIdeal = (presupuesto / cfg.diasHabilesMes) * cfg.diasEjecutados;
    const proyeccion = sumBy(estRows, 'personal_atiende', p.nombre, 'vlr');
    const proyPct = presupuesto > 0 ? proyeccion / presupuesto : 0;
    const pendientePct = presupuesto > 0 ? -(presupuesto - venta - proyeccion) / presupuesto : 0;
    const pendiente = -(presupuesto - venta - proyeccion);
    const esperado = presupuesto > 0 ? (venta + proyeccion) / presupuesto : 0;

    // Apply alternating row styling
    styleDataRow(ws, r, 13, i % 2 === 1);

    row.getCell(3).value = p.nombre;
    row.getCell(4).value = atenciones;
    row.getCell(4).alignment = { horizontal: 'center', vertical: 'middle' };
    row.getCell(5).value = venta;         row.getCell(5).numFmt = MONEY_FMT;
    row.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(6).value = presupuesto;   row.getCell(6).numFmt = MONEY_FMT;
    row.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(7).value = pctVenta;      row.getCell(7).numFmt = PCT_FMT;
    row.getCell(7).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(8).value = ventaIdeal;    row.getCell(8).numFmt = MONEY_FMT;
    row.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(9).value = proyPct;       row.getCell(9).numFmt = PCT_FMT;
    row.getCell(9).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(10).value = proyeccion;   row.getCell(10).numFmt = MONEY_FMT;
    row.getCell(10).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(11).value = pendientePct; row.getCell(11).numFmt = PCT_FMT;
    row.getCell(11).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(12).value = pendiente;    row.getCell(12).numFmt = MONEY_FMT;
    row.getCell(12).alignment = { horizontal: 'right', vertical: 'middle' };
    row.getCell(13).value = esperado;     row.getCell(13).numFmt = PCT_FMT;
    row.getCell(13).alignment = { horizontal: 'right', vertical: 'middle' };

    r++;
  }

  // Total row
  const totalRow = ws.getRow(r);
  styleDataRow(ws, r, 13, false, true);
  totalRow.getCell(4).value = totalLabel;
  totalRow.getCell(4).alignment = { horizontal: 'left', vertical: 'middle' };
  const totalVenta = people.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'),
    0
  );
  const totalPpto = people.reduce((s, p) => s + p.presupuesto, 0);
  const totalIdeal = (totalPpto / cfg.diasHabilesMes) * cfg.diasEjecutados;
  totalRow.getCell(5).value = totalVenta;    totalRow.getCell(5).numFmt = MONEY_FMT;
  totalRow.getCell(5).alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell(6).value = totalPpto;     totalRow.getCell(6).numFmt = MONEY_FMT;
  totalRow.getCell(6).alignment = { horizontal: 'right', vertical: 'middle' };
  totalRow.getCell(8).value = totalIdeal;    totalRow.getCell(8).numFmt = MONEY_FMT;
  totalRow.getCell(8).alignment = { horizontal: 'right', vertical: 'middle' };

  return r + 1; // next available row
}

// ─── PPTO TP C.E ───────────────────────────────────────────

function buildPptoCeTab(
  wb: ExcelJS.Workbook,
  rentRows: RentabilidadRow[],
  estRows: EstimadaRow[],
  cfg: ControladorConfig
) {
  const ws = wb.addWorksheet('PPTO TP C.E');

  // Title
  ws.getRow(2).getCell(2).value = 'CONTROLADOR DE PRESUPUESTOS ESPECIALISTAS';
  ws.getRow(2).getCell(2).font = { bold: true, size: 14 };

  // Header row
  const headers = [
    '', 'FECHA', 'PERSONAL', '# ATENCIONES', '$ VENTA', 'PRESUPUESTO',
    '% VENTA', 'VENTA IDEAL', 'PROYECCIÓN %', 'PROYECCIÓN $',
    'PENDIENTE %', 'PENDIENTE $', '% ESP',
  ];
  const hRow = ws.getRow(4);
  headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; });
  styleHeaderRow(ws, 4, 13);

  // Date in B4
  hRow.getCell(2).value = new Date();
  hRow.getCell(2).numFmt = DATE_FMT;

  // Dermatología section
  let nextRow = buildPersonnelSection(
    ws, 5, 'DERMATOLOGÍA', cfg.dermatologia, rentRows, estRows, cfg, 'Total Derma:'
  );

  // Med Estética section
  nextRow = buildPersonnelSection(
    ws, nextRow, 'MED ESTÉTICA', cfg.medEstetica, rentRows, estRows, cfg, 'Total Med Estética:'
  );

  // ── Right-side strategy panel (column O-P) ──
  const allPeople = [...cfg.dermatologia, ...cfg.medEstetica];
  const totalPpto = allPeople.reduce((s, p) => s + p.presupuesto, 0);
  const totalVenta = allPeople.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );
  const totalProyeccion = allPeople.reduce(
    (s, p) => s + sumBy(estRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );

  buildStrategyPanel(ws, cfg, totalVenta, totalProyeccion,
    cfg.metaGlobal, 'ESTRATEGIA FEBRERO');

  // Column widths
  ws.getColumn(3).width = 38;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 16;
  ws.getColumn(8).width = 16;
  ws.getColumn(10).width = 16;
  ws.getColumn(12).width = 16;
  ws.getColumn(15).width = 22;
  ws.getColumn(16).width = 20;

  applyBorders(ws, 4, nextRow - 1, 2, 13);
  freezeHeader(ws, 4, 2); // Freeze header row and first 2 columns
}

// ─── PPTO TP LOUNGE ────────────────────────────────────────

function buildPptoLoungeTab(
  wb: ExcelJS.Workbook,
  rentRows: RentabilidadRow[],
  estRows: EstimadaRow[],
  cfg: ControladorConfig
) {
  const ws = wb.addWorksheet('PPTO TP LOUNGE');

  ws.getRow(14).getCell(2).value = 'CONTROLADOR DE PRESUPUESTOS TP LOUNGE';
  ws.getRow(14).getCell(2).font = { bold: true, size: 14 };

  // Header row
  const headers = [
    '', 'FECHA', 'PERSONAL', '# ATENCIONES', '$ VENTA', 'PRESUPUESTO',
    'VENTA', 'VENTA IDEAL', 'PROYECCIÓN %', 'PROYECCIÓN $',
    'PENDIENTE %', 'PENDIENTE $',
  ];
  const hRow = ws.getRow(16);
  headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; });
  styleHeaderRow(ws, 16, 12);
  hRow.getCell(2).value = new Date();
  hRow.getCell(2).numFmt = DATE_FMT;

  const startRow = 17;
  const nextRow = buildPersonnelSection(
    ws, startRow, 'TP LOUNGE', cfg.lounge, rentRows, estRows, cfg, 'Total TP Lounge:'
  );

  // Strategy panel
  const totalVenta = cfg.lounge.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );
  const totalProyeccion = cfg.lounge.reduce(
    (s, p) => s + sumBy(estRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );
  buildStrategyPanel(ws, cfg, totalVenta, totalProyeccion,
    cfg.metaGlobal, 'ESTRATEGIA FEBRERO');

  ws.getColumn(3).width = 38;
  ws.getColumn(5).width = 16;
  ws.getColumn(6).width = 16;
  ws.getColumn(8).width = 16;
  ws.getColumn(10).width = 16;
  ws.getColumn(12).width = 16;
  ws.getColumn(15).width = 22;
  ws.getColumn(16).width = 20;

  applyBorders(ws, 16, nextRow - 1, 2, 12);
}

// ─── Strategy panel (right side of PPTO tabs) ──────────────

function buildStrategyPanel(
  ws: ExcelJS.Worksheet,
  cfg: ControladorConfig,
  facturado: number,
  proyeccion: number,
  _metaGlobal: number,
  title: string
) {
  const pctAlDia = cfg.diasEjecutados / cfg.diasHabilesMes;
  const pctRealCum = facturado / cfg.metaGlobal;
  const pctDif = pctRealCum - pctAlDia;
  const resultado = facturado + proyeccion;
  const pctResultado = cfg.metaGlobal > 0 ? resultado / cfg.metaGlobal : 0;
  // Daily goal uses working days (not calendar days) - automatically adjusts when non-working days change
  const metaDiaria = cfg.metaGlobal / cfg.diasHabilesMes;
  const ventaEsperada = metaDiaria * cfg.diasEjecutados;
  const faltaCumplir = cfg.metaGlobal - facturado - proyeccion;

  const rows: [string, number | string, string?][] = [
    [title, ''],
    ['DÍAS HÁB MES ', cfg.diasHabilesMes],
    ['DÍAS EJECT', cfg.diasEjecutados],
    ['FECHA', new Date().toISOString().substring(0, 10)],
    ['META FEBRERO', cfg.metaGlobal, MONEY_FMT],
    ['VENTA ESPERADA FEB', ventaEsperada, MONEY_FMT],
    ['FACTURADO FEB', facturado, MONEY_FMT],
    ['PROYECCIÓN FEB', proyeccion, MONEY_FMT],
    ['FALTA X CUMPLIR', faltaCumplir, MONEY_FMT],
    ['RESULTADO ESP', resultado, MONEY_FMT],
    ['% RESULTADO ESP', pctResultado, PCT_FMT],
    ['', ''],
    ['% ESPERADO AL DÍA', pctAlDia, PCT_FMT],
    ['% REAL AL DÍA', pctRealCum, PCT_FMT],
    ['% DIFERENCIA', pctDif, PCT_FMT],
    ['NOS FALTA VENDER', 1 - pctAlDia, PCT_FMT],
    ['', ''],
    ['META DIARIA', metaDiaria, MONEY_FMT],
  ];

  let r = 15;
  for (const [label, val, fmt] of rows) {
    const row = ws.getRow(r);
    row.getCell(15).value = label;
    row.getCell(15).font = { bold: true, size: 9 };
    row.getCell(16).value = val;
    if (fmt) row.getCell(16).numFmt = fmt;
    r++;
  }
}

// ─── BALANCE PPTO ──────────────────────────────────────────

function buildBalancePptoTab(
  wb: ExcelJS.Workbook,
  rentRows: RentabilidadRow[],
  estRows: EstimadaRow[],
  cfg: ControladorConfig
) {
  const ws = wb.addWorksheet('BALANCE PPTO');

  // All personnel
  const allCE = [...cfg.dermatologia, ...cfg.medEstetica];
  const dermaPpto = cfg.dermatologia.reduce((s, p) => s + p.presupuesto, 0);
  const medEstPpto = cfg.medEstetica.reduce((s, p) => s + p.presupuesto, 0);
  const loungePpto = cfg.lounge.reduce((s, p) => s + p.presupuesto, 0);

  const dermaVenta = cfg.dermatologia.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );
  const medEstVenta = cfg.medEstetica.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );
  const loungeVenta = cfg.lounge.reduce(
    (s, p) => s + sumBy(rentRows, 'personal_atiende', p.nombre, 'vlr'), 0
  );

  const totalFacturado = dermaVenta + medEstVenta + loungeVenta + cfg.facturadoProductos;
  const totalProyeccion = estRows.reduce((s, r) => s + r.vlr, 0);

  const pctAlDia = cfg.diasEjecutados / cfg.diasHabilesMes;
  const pctRealCum = totalFacturado / cfg.metaGlobal;
  // Daily goal uses working days (not calendar days) - automatically adjusts when non-working days change
  const metaDiaria = cfg.metaGlobal / cfg.diasHabilesMes;
  const ventaEsperada = metaDiaria * cfg.diasEjecutados;
  const faltaCumplir = cfg.metaGlobal - totalFacturado - totalProyeccion;
  const resultadoEsp = totalFacturado + totalProyeccion;

  // Title
  ws.getRow(4).getCell(4).value = 'REPORTE GENERAL';
  ws.getRow(4).getCell(4).font = { bold: true, size: 14 };

  // Left column — strategy
  const leftData: [string, number | string, string?][] = [
    ['REPORTE GENERAL', new Date().toISOString().substring(0, 10)],
    ['', ''],
    ['', ''],
    ['% ESPERADO AL DÍA', pctAlDia, PCT_FMT],
    ['% REAL AL DÍA', pctRealCum, PCT_FMT],
    ['% DIFERENCIA', pctRealCum - pctAlDia, PCT_FMT],
    ['NOS FALTA VENDER', 1 - pctAlDia, PCT_FMT],
    ['', ''],
    ['', ''],
    ['ESTRATEGIA FEBRERO', ''],
    ['DÍAS HÁB MES ', cfg.diasHabilesMes],
    ['DÍAS EJECT', cfg.diasEjecutados],
    ['FECHA', new Date().toISOString().substring(0, 10)],
    ['META FEBRERO', cfg.metaGlobal, MONEY_FMT],
    ['VENTA ESPERADA FEB', ventaEsperada, MONEY_FMT],
    ['FACTURADO FEB', totalFacturado - cfg.facturadoProductos, MONEY_FMT],
    ['PROYECCIÓN FEB', totalProyeccion, MONEY_FMT],
    ['FALTA X CUMPLIR', faltaCumplir, MONEY_FMT],
    ['RESULTADO ESP', resultadoEsp, MONEY_FMT],
    ['% RESULTADO ESP', cfg.metaGlobal > 0 ? resultadoEsp / cfg.metaGlobal : 0, PCT_FMT],
    ['', ''],
    ['', ''],
    ['', ''],
    ['META DIARIA', metaDiaria, MONEY_FMT],
  ];

  let r = 4;
  for (const [label, val, fmt] of leftData) {
    const row = ws.getRow(r);
    row.getCell(4).value = label;
    row.getCell(4).font = { bold: true, size: 10 };
    row.getCell(5).value = val;
    if (fmt) row.getCell(5).numFmt = fmt;
    r++;
  }

  // Right column — business unit breakdown
  const buHeaders = ['Unidad de Negocio', 'Venta', 'Meta', 'Faltaría'];
  ws.getRow(15).getCell(7).value = buHeaders[0];
  ws.getRow(15).getCell(8).value = buHeaders[1];
  ws.getRow(15).getCell(9).value = buHeaders[2];
  ws.getRow(15).getCell(10).value = buHeaders[3];
  styleHeaderRow(ws, 15, 10);

  const units: [string, number, number][] = [
    ['Tu Piel Derma', dermaVenta, dermaPpto],
    ['Tu Piel Medicina Estética', medEstVenta, medEstPpto],
    ['TP Lounge', loungeVenta, loungePpto],
    ['Productos', cfg.facturadoProductos, cfg.metaProductos],
  ];
  r = 16;
  for (const [name, venta, meta] of units) {
    const row = ws.getRow(r);
    row.getCell(7).value = name;
    row.getCell(8).value = venta;          row.getCell(8).numFmt = MONEY_FMT;
    row.getCell(9).value = meta;           row.getCell(9).numFmt = MONEY_FMT;
    row.getCell(10).value = venta - meta;  row.getCell(10).numFmt = MONEY_FMT;
    r++;
  }
  // Total
  const totalMeta = dermaPpto + medEstPpto + loungePpto + cfg.metaProductos;
  const totalRow = ws.getRow(r);
  totalRow.getCell(7).value = 'Total';
  totalRow.getCell(7).font = { bold: true };
  totalRow.getCell(8).value = totalFacturado;  totalRow.getCell(8).numFmt = MONEY_FMT;
  totalRow.getCell(9).value = totalMeta;       totalRow.getCell(9).numFmt = MONEY_FMT;

  // Balance Meta side
  ws.getRow(15).getCell(12).value = 'Balance Meta';
  ws.getRow(15).getCell(12).font = { bold: true };
  ws.getRow(16).getCell(12).value = 'Meta Global';
  ws.getRow(16).getCell(13).value = cfg.metaGlobal;   ws.getRow(16).getCell(13).numFmt = MONEY_FMT;
  ws.getRow(17).getCell(12).value = 'Ventas';
  ws.getRow(17).getCell(13).value = totalFacturado;    ws.getRow(17).getCell(13).numFmt = MONEY_FMT;
  ws.getRow(18).getCell(12).value = 'Agendamiento';
  ws.getRow(18).getCell(13).value = totalProyeccion;   ws.getRow(18).getCell(13).numFmt = MONEY_FMT;
  ws.getRow(19).getCell(12).value = 'Falta';
  ws.getRow(19).getCell(13).value = totalProyeccion + totalFacturado - cfg.metaGlobal;
  ws.getRow(19).getCell(13).numFmt = MONEY_FMT;

  // Meta Ventas
  ws.getRow(42).getCell(4).value = 'Meta Ventas';
  ws.getRow(42).getCell(5).value = 'Valor $';
  ws.getRow(42).font = { bold: true };
  ws.getRow(43).getCell(4).value = 'Tu Piel Centro Especializado';
  ws.getRow(43).getCell(5).value = dermaPpto + medEstPpto; ws.getRow(43).getCell(5).numFmt = MONEY_FMT;
  ws.getRow(44).getCell(4).value = 'Tu Piel Lounge';
  ws.getRow(44).getCell(5).value = loungePpto;             ws.getRow(44).getCell(5).numFmt = MONEY_FMT;
  ws.getRow(45).getCell(4).value = 'Venta de Producto';
  ws.getRow(45).getCell(5).value = cfg.metaProductos;      ws.getRow(45).getCell(5).numFmt = MONEY_FMT;

  ws.getColumn(4).width = 24;
  ws.getColumn(5).width = 18;
  ws.getColumn(7).width = 30;
  ws.getColumn(8).width = 16;
  ws.getColumn(9).width = 16;
  ws.getColumn(10).width = 16;
  ws.getColumn(12).width = 18;
  ws.getColumn(13).width = 18;

  applyBorders(ws, 15, r, 7, 10);
}

// ─── INFO.PROYECCIÓN (raw data dump) ──────────────────────

function buildInfoProyeccionTab(wb: ExcelJS.Workbook, rows: EstimadaRow[]) {
  const ws = wb.addWorksheet('INFO.PROYECCIÓN');

  const headers = [
    '# Atención', '# Registro', 'Fecha', 'Doc. Paciente', 'Nombre Paciente',
    'Personal Atiende', 'Código Cups', 'Cups', 'Sub Categoria', 'Categoria',
    'Dispositivo', 'Vlr', 'Vlr Comisiones', 'Vlr Insumos', 'Costo Adicional',
    'Rentabilidad Insumos', 'Rentabilidad Equipos', 'Rentabilidad Ips',
    'Rentabilidad Total', 'Rentabilidad Porcentaje', 'Pendiente Registrar',
    'Fecha Facturación', 'Pagado este mes', 'Procedencia / Recomendacion',
    'Edad del paciente', 'Numero Factura',
  ];

  const hRow = ws.getRow(1);
  headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; });
  styleHeaderRow(ws, 1, headers.length);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = ws.getRow(i + 2);
    row.getCell(1).value = r.atencion;
    row.getCell(2).value = r.registro;
    row.getCell(3).value = r.fecha_realizacion_o_programada ? new Date(r.fecha_realizacion_o_programada) : '';
    row.getCell(3).numFmt = DATE_FMT;
    row.getCell(4).value = r.doc_paciente;
    row.getCell(5).value = r.nombre_paciente;
    row.getCell(6).value = r.personal_atiende;
    row.getCell(7).value = r.codigo_cups;
    row.getCell(8).value = r.cups;
    row.getCell(9).value = r.sub_categoria;
    row.getCell(10).value = r.categoria;
    row.getCell(11).value = r.dispositivo;
    row.getCell(12).value = r.vlr;               row.getCell(12).numFmt = MONEY_FMT;
    row.getCell(13).value = r.vlr_comisiones;     row.getCell(13).numFmt = MONEY_FMT;
    row.getCell(14).value = r.vlr_insumos;        row.getCell(14).numFmt = MONEY_FMT;
    row.getCell(15).value = r.costo_adicional;    row.getCell(15).numFmt = MONEY_FMT;
    row.getCell(16).value = r.rentabilidad_insumos;
    row.getCell(17).value = r.rentabilidad_equipos;
    row.getCell(18).value = r.rentabilidad_ips;   row.getCell(18).numFmt = MONEY_FMT;
    row.getCell(19).value = r.rentabilidad_total;  row.getCell(19).numFmt = MONEY_FMT;
    row.getCell(20).value = r.rentabilidad_porcentaje;
    row.getCell(21).value = r.pendiente_registrar;
    row.getCell(22).value = r.fecha_facturacion;
    row.getCell(23).value = r.pagado_este_mes;
    row.getCell(24).value = r.procedencia_recomendacion;
    row.getCell(25).value = r.edad_paciente;
    row.getCell(26).value = r.numero_factura;
  }

  // Auto-fit some columns
  ws.getColumn(5).width = 30;
  ws.getColumn(6).width = 35;
  ws.getColumn(8).width = 50;
  ws.getColumn(9).width = 30;
}

// ─── INFO.RENTABILIDAD (raw data dump) ─────────────────────

function buildInfoRentabilidadTab(wb: ExcelJS.Workbook, rows: RentabilidadRow[]) {
  const ws = wb.addWorksheet('INFO.RENTABILIDAD');

  const headers = [
    '# Atención', '# Registro', 'Fecha Realización', 'Doc. Paciente',
    'Nombre Paciente', 'Personal Atiende', 'Código Cups', 'Cups',
    'Sub Categoria', 'Categoria', 'Dispositivo', 'Vlr', 'Costo Comisiones',
    'Costo Insumos', 'Costo Bancario', 'Costo Adicional',
    'Rentabilidad Insumos', 'Rentabilidad Equipos', 'Rentabilidad Total',
    'Promedio Porcentaje', 'Observaciones', 'Fecha Facturación',
    'Pagado este mes', 'Procedencia / Recomendacion', 'Edad del paciente',
    'Numero Factura', 'Paciente Pais de origen', 'Paciente Celular',
  ];

  const hRow = ws.getRow(1);
  headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; });
  styleHeaderRow(ws, 1, headers.length);

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const row = ws.getRow(i + 2);
    row.getCell(1).value = r.atencion;
    row.getCell(2).value = r.registro;
    row.getCell(3).value = r.fecha_realizacion ? new Date(r.fecha_realizacion) : '';
    row.getCell(3).numFmt = DATE_FMT;
    row.getCell(4).value = r.doc_paciente;
    row.getCell(5).value = r.nombre_paciente;
    row.getCell(6).value = r.personal_atiende;
    row.getCell(7).value = r.codigo_cups;
    row.getCell(8).value = r.cups;
    row.getCell(9).value = r.sub_categoria;
    row.getCell(10).value = r.categoria;
    row.getCell(11).value = r.dispositivo;
    row.getCell(12).value = r.vlr;               row.getCell(12).numFmt = MONEY_FMT;
    row.getCell(13).value = r.costo_comisiones;   row.getCell(13).numFmt = MONEY_FMT;
    row.getCell(14).value = r.costo_insumos;      row.getCell(14).numFmt = MONEY_FMT;
    row.getCell(15).value = r.costo_bancario;     row.getCell(15).numFmt = MONEY_FMT;
    row.getCell(16).value = r.costo_adicional;    row.getCell(16).numFmt = MONEY_FMT;
    row.getCell(17).value = r.rentabilidad_insumos;
    row.getCell(18).value = r.rentabilidad_equipos;
    row.getCell(19).value = r.rentabilidad_total;  row.getCell(19).numFmt = MONEY_FMT;
    row.getCell(20).value = r.promedio_porcentaje;
    row.getCell(21).value = r.observaciones;
    row.getCell(22).value = r.fecha_facturacion;
    row.getCell(23).value = r.pagado_este_mes;
    row.getCell(24).value = r.procedencia_recomendacion;
    row.getCell(25).value = r.edad_paciente;
    row.getCell(26).value = r.numero_factura;
    row.getCell(27).value = r.paciente_pais_origen;
    row.getCell(28).value = r.paciente_celular;
  }

  ws.getColumn(5).width = 30;
  ws.getColumn(6).width = 35;
  ws.getColumn(8).width = 50;
  ws.getColumn(9).width = 22;
}

// ─── TABLERO Y AGENDA ─────────────────────────────────────

function buildTableroAgendaTab(
  wb: ExcelJS.Workbook,
  rentRows: RentabilidadRow[],
  estRows: EstimadaRow[],
  dateFrom: string,
  dateTo: string,
  cfg: ControladorConfig
) {
  const ws = wb.addWorksheet('TABLERO Y AGENDA');

  const headers = [
    '', 'FECHA', 'PROYECIÓN INICIO MES', 'PROYECIÓN QUINCENA',
    'GESTIÓN COMERCIAL REAL', 'PAGO SI', 'PAGO NO', 'SIN PAGO',
    'SERVICIOS PRESTADOS', '% DIF',
  ];
  const hRow = ws.getRow(3);
  headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; });
  styleHeaderRow(ws, 3, 10);

  const dates = dateRange(dateFrom, dateTo);
  const todayStr = new Date().toISOString().substring(0, 10);

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const row = ws.getRow(4 + i);

    row.getCell(2).value = new Date(d + 'T12:00:00');
    row.getCell(2).numFmt = DATE_FMT;

    // Gestión Comercial Real = sum of estimada vlr for this date
    const gestion = sumByDate(estRows, 'fecha_realizacion_o_programada', d, 'vlr');
    row.getCell(5).value = gestion;       row.getCell(5).numFmt = MONEY_FMT;

    // Pago SI = rentabilidad vlr for date where pagado_este_mes = SI
    const pagoSi = sumByDate(
      rentRows, 'fecha_realizacion', d, 'vlr',
      (r) => r.pagado_este_mes === 'SI'
    );
    row.getCell(6).value = pagoSi;        row.getCell(6).numFmt = MONEY_FMT;

    // Pago NO = rentabilidad vlr for date where pagado_este_mes = NO
    const pagoNo = sumByDate(
      rentRows, 'fecha_realizacion', d, 'vlr',
      (r) => r.pagado_este_mes === 'NO'
    );
    row.getCell(7).value = pagoNo;        row.getCell(7).numFmt = MONEY_FMT;

    // Sin Pago
    const sinPago = sumByDate(
      rentRows, 'fecha_realizacion', d, 'vlr',
      (r) => r.pagado_este_mes === 'SIN PAGO'
    );
    row.getCell(8).value = sinPago;       row.getCell(8).numFmt = MONEY_FMT;

    // Servicios Prestados = total vlr for date in rentabilidad
    const servicios = sumByDate(rentRows, 'fecha_realizacion', d, 'vlr');
    row.getCell(9).value = servicios;     row.getCell(9).numFmt = MONEY_FMT;

    row.getCell(10).value = '-';
  }

  // Totals row
  const totalRowIdx = 4 + dates.length;
  const totalRow = ws.getRow(totalRowIdx);
  totalRow.font = { bold: true };
  for (const col of [3, 4, 5, 6, 7, 8, 9]) {
    let sum = 0;
    for (let i = 0; i < dates.length; i++) {
      sum += Number(ws.getRow(4 + i).getCell(col).value || 0);
    }
    totalRow.getCell(col).value = sum;
    totalRow.getCell(col).numFmt = MONEY_FMT;
  }

  // ── Right-side weekly summary (L-P) ──
  ws.getRow(1).getCell(12).value = 'META OBJETIVO';
  ws.getRow(1).getCell(13).value = 'PROYEC DÍA';
  ws.getRow(1).getCell(14).value = 'FECHA';
  ws.getRow(1).getCell(15).value = 'FACTURADO';
  ws.getRow(1).getCell(16).value = 'DÍA HABIL';

  // Daily goal uses working days (not calendar days) - automatically adjusts when non-working days change
  const metaDiaria = cfg.metaGlobal / cfg.diasHabilesMes;
  ws.getRow(3).getCell(12).value = metaDiaria;    ws.getRow(3).getCell(12).numFmt = MONEY_FMT;
  ws.getRow(3).getCell(14).value = new Date();     ws.getRow(3).getCell(14).numFmt = DATE_FMT;
  ws.getRow(3).getCell(16).value = cfg.diasEjecutados;

  // Weekly summaries
  const weeks = [
    { label: 'SEMANA 1', start: 0, end: 4 },
    { label: 'SEMANA 2', start: 5, end: 11 },
    { label: 'SEMANA 3', start: 12, end: 18 },
    { label: 'SEMANA 4', start: 19, end: 25 },
    { label: 'SEMANA 5', start: 26, end: 30 },
  ];
  let wkRow = 6;
  for (const wk of weeks) {
    const row = ws.getRow(wkRow);
    row.getCell(13).value = wk.label;
    row.getCell(13).font = { bold: true };

    let gestionSum = 0, serviciosSum = 0;
    for (let i = wk.start; i <= Math.min(wk.end, dates.length - 1); i++) {
      gestionSum += Number(ws.getRow(4 + i).getCell(5).value || 0);
      serviciosSum += Number(ws.getRow(4 + i).getCell(9).value || 0);
    }
    row.getCell(15).value = gestionSum;    row.getCell(15).numFmt = MONEY_FMT;
    row.getCell(16).value = serviciosSum;  row.getCell(16).numFmt = MONEY_FMT;
    wkRow++;
  }

  // ── Right-side strategy summary ──
  const facturado = rentRows.reduce((s, r) => s + r.vlr, 0);
  const proyeccion = estRows.reduce((s, r) => s + r.vlr, 0);

  const strategyStart = 12;
  const strategyData: [string, number | string, string?][] = [
    ['REPORTE GENERAL', ''],
    ['', new Date().toISOString().substring(0, 10)],
    ['', ''],
    ['% ESPERADO AL DÍA', cfg.diasEjecutados / cfg.diasHabilesMes, PCT_FMT],
    ['% REAL AL DÍA', facturado / cfg.metaGlobal, PCT_FMT],
    ['% DIFERENCIA', facturado / cfg.metaGlobal - cfg.diasEjecutados / cfg.diasHabilesMes, PCT_FMT],
    ['NOS FALTA VENDER', 1 - cfg.diasEjecutados / cfg.diasHabilesMes, PCT_FMT],
    ['', ''],
    ['', ''],
    ['ESTRATEGIA FEBRERO', ''],
    ['DÍAS HÁB MES ', cfg.diasHabilesMes],
    ['DÍAS EJECT', cfg.diasEjecutados],
    ['FECHA', new Date().toISOString().substring(0, 10)],
    ['META FEBRERO', cfg.metaGlobal, MONEY_FMT],
    ['VENTA ESPERADA FEB', metaDiaria * cfg.diasEjecutados, MONEY_FMT],
    ['FACTURADO FEB', facturado, MONEY_FMT],
    ['PROYECCIÓN FEB', proyeccion, MONEY_FMT],
    ['FALTA X CUMPLIR', cfg.metaGlobal - facturado - proyeccion, MONEY_FMT],
    ['RESULTADO ESP', facturado + proyeccion, MONEY_FMT],
    ['% RESULTADO ESP', (facturado + proyeccion) / cfg.metaGlobal, PCT_FMT],
    ['', ''],
    ['META DIARIA', metaDiaria, MONEY_FMT],
  ];

  let sr = strategyStart;
  for (const [label, val, fmt] of strategyData) {
    const row = ws.getRow(sr);
    row.getCell(12).value = label;
    row.getCell(12).font = { bold: true, size: 9 };
    row.getCell(13).value = val;
    if (fmt) row.getCell(13).numFmt = fmt;
    sr++;
  }

  // Column widths
  ws.getColumn(2).width = 14;
  ws.getColumn(5).width = 18;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 14;
  ws.getColumn(8).width = 14;
  ws.getColumn(9).width = 18;
  ws.getColumn(12).width = 22;
  ws.getColumn(13).width = 18;
  ws.getColumn(15).width = 16;
  ws.getColumn(16).width = 16;

  applyBorders(ws, 3, totalRowIdx, 2, 10);
}

// ─── REPORTE X DÍAS ────────────────────────────────────────

function buildReporteXDiasTab(
  wb: ExcelJS.Workbook,
  rentRows: RentabilidadRow[],
  estRows: EstimadaRow[],
  dateFrom: string,
  dateTo: string,
  cfg: ControladorConfig
) {
  const ws = wb.addWorksheet('REPORTE X DÍAS');

  // Title
  ws.getRow(2).getCell(2).value = '% CUMPLIMIENTO POR DÍA DE SERVICIOS FACTURADOS Y REALIZADOS';
  ws.getRow(2).getCell(2).font = { bold: true, size: 12 };

  // Headers
  const headers = ['', 'FECHA', 'META DÍA/HÁBIL', 'PROYECCIÓN', 'PENDIENTE', 'FACTURADO', 'ANTICIPOS', '%'];
  const hRow = ws.getRow(3);
  headers.forEach((h, i) => { hRow.getCell(i + 1).value = h; });
  styleHeaderRow(ws, 3, 8);

  // Daily goal uses working days (not calendar days) - automatically adjusts when non-working days change
  const metaDia = cfg.metaGlobal / cfg.diasHabilesMes;
  const dates = dateRange(dateFrom, dateTo);

  for (let i = 0; i < dates.length; i++) {
    const d = dates[i];
    const row = ws.getRow(4 + i);

    row.getCell(2).value = new Date(d + 'T12:00:00');
    row.getCell(2).numFmt = DATE_FMT;

    row.getCell(3).value = Math.round(metaDia);
    row.getCell(3).numFmt = MONEY_FMT;

    const proyeccion = sumByDate(estRows, 'fecha_realizacion_o_programada', d, 'vlr');
    row.getCell(4).value = proyeccion;                    row.getCell(4).numFmt = MONEY_FMT;
    row.getCell(5).value = -(Math.round(metaDia) - proyeccion);
    row.getCell(5).numFmt = MONEY_FMT;

    const facturado = sumByDate(
      rentRows, 'fecha_realizacion', d, 'vlr',
      (r) => r.pagado_este_mes === 'SI'
    );
    row.getCell(6).value = facturado;                     row.getCell(6).numFmt = MONEY_FMT;

    const anticipos = sumByDate(
      rentRows, 'fecha_realizacion', d, 'vlr',
      (r) => r.pagado_este_mes === 'NO'
    );
    row.getCell(7).value = anticipos;                     row.getCell(7).numFmt = MONEY_FMT;

    const pctCumpl = metaDia > 0 && facturado > 0 ? facturado / metaDia : 0;
    row.getCell(8).value = pctCumpl;                      row.getCell(8).numFmt = PCT_FMT;
  }

  // ── Right sidebar: TABLERO VENTA DIARIA/MENSUAL ──
  const facturadoTotal = rentRows
    .filter((r) => r.pagado_este_mes === 'SI')
    .reduce((s, r) => s + r.vlr, 0);
  const proyeccionTotal = estRows.reduce((s, r) => s + r.vlr, 0);
  const anticiposTotal = rentRows
    .filter((r) => r.pagado_este_mes === 'NO')
    .reduce((s, r) => s + r.vlr, 0);
  const carteraTotal = 0; // would need separate data source

  ws.getRow(2).getCell(10).value = 'TABLERO VENTA DIARIA/MENSUAL';
  ws.getRow(2).getCell(10).font = { bold: true };
  ws.getRow(3).getCell(10).value = new Date();
  ws.getRow(3).getCell(10).numFmt = DATE_FMT;

  const sideData: [string, number | string, string?][] = [
    ['Objetivo Facuración', cfg.metaGlobal, MONEY_FMT],
    ['Objetivo al día', 0, MONEY_FMT],
    ['Facturación Real', facturadoTotal, MONEY_FMT],
    ['Proyección Mes', proyeccionTotal, MONEY_FMT],
    ['Cartera Mes', carteraTotal, MONEY_FMT],
    ['Anticipos', anticiposTotal, MONEY_FMT],
    ['Gestión Pendiente', cfg.metaGlobal - facturadoTotal - proyeccionTotal, MONEY_FMT],
    ['Día Hábil', cfg.diasEjecutados],
    ['Resultado Esperado', cfg.metaGlobal > 0 ? (facturadoTotal + proyeccionTotal) / cfg.metaGlobal : 0, PCT_FMT],
    ['% Al Día', cfg.diasEjecutados / cfg.diasHabilesMes, PCT_FMT],
    ['% Real', facturadoTotal / cfg.metaGlobal, PCT_FMT],
    ['Objetivo Hábil', cfg.metaGlobal / cfg.diasHabilesMes, MONEY_FMT],
  ];

  let sr = 14;
  for (const [label, val, fmt] of sideData) {
    const row = ws.getRow(sr - 10);
    row.getCell(10).value = label;
    row.getCell(10).font = { bold: true, size: 9 };
    row.getCell(11).value = val;
    if (fmt) row.getCell(11).numFmt = fmt;
    sr++;
  }

  // ── Right sidebar: TABLERO RESULTADO DÍA ──
  ws.getRow(2).getCell(13).value = 'TABLERO RESULTADO DÍA';
  ws.getRow(2).getCell(13).font = { bold: true };

  // Column widths
  ws.getColumn(2).width = 14;
  ws.getColumn(3).width = 16;
  ws.getColumn(4).width = 16;
  ws.getColumn(5).width = 14;
  ws.getColumn(6).width = 16;
  ws.getColumn(7).width = 14;
  ws.getColumn(10).width = 22;
  ws.getColumn(11).width = 18;
  ws.getColumn(13).width = 22;
  ws.getColumn(14).width = 18;

  applyBorders(ws, 3, 3 + dates.length, 2, 8);
}

// ─── PRODUCTOS ─────────────────────────────────────────────

function buildProductosTab(wb: ExcelJS.Workbook, cfg: ControladorConfig) {
  const ws = wb.addWorksheet('PRODUCTOS');

  ws.getRow(2).getCell(2).value = 'ROTACIÓN PRODUCTOS';
  ws.getRow(2).getCell(2).font = { bold: true, size: 14 };

  // Left panel — Product summary
  ws.getRow(4).getCell(2).value = 'REPORTE PRODUCTOS FEBRERO';
  ws.getRow(4).getCell(2).font = { bold: true };

  const leftData: [string, number | string][] = [
    ['DÍAS HÁB MES ', cfg.diasHabilesMes],
    ['DÍAS EJECT', cfg.diasEjecutados],
    ['FECHA', new Date().toISOString().substring(0, 10)],
    ['META FEBRERO', cfg.metaProductos],
    ['META DÍA', cfg.metaProductos / cfg.diasHabilesMes],
    ['VENTA ESPERADA', (cfg.metaProductos / cfg.diasHabilesMes) * cfg.diasEjecutados],
    ['FACTURADO FEB', cfg.facturadoProductos],
    ['VENTA ADICIONAL', cfg.facturadoProductos - (cfg.metaProductos / cfg.diasHabilesMes) * cfg.diasEjecutados],
    ['FALTA X CUMPLIR', cfg.metaProductos - cfg.facturadoProductos],
    ['% ESPERADO', cfg.diasEjecutados / cfg.diasHabilesMes],
    ['CUMPLIMIENTO', cfg.facturadoProductos / cfg.metaProductos],
  ];

  let r = 5;
  for (const [label, val] of leftData) {
    ws.getRow(r).getCell(2).value = label;
    ws.getRow(r).getCell(2).font = { bold: true };
    ws.getRow(r).getCell(3).value = val;
    if (typeof val === 'number' && val > 1000)
      ws.getRow(r).getCell(3).numFmt = MONEY_FMT;
    else if (typeof val === 'number' && val < 1)
      ws.getRow(r).getCell(3).numFmt = PCT_FMT;
    r++;
  }

  // ── Product inventory controls ──
  const products = [
    { col: 5, name: 'CONTROL BOTOX', unit: 'Unidades Botox Vendidas', p: cfg.botox },
    { col: 8, name: 'CONTROL RADIESSE', unit: 'Radiesse Vendidos', p: cfg.radiesse },
  ];

  for (const prod of products) {
    ws.getRow(4).getCell(prod.col).value = prod.name;
    ws.getRow(4).getCell(prod.col).font = { bold: true };
    ws.getRow(5).getCell(prod.col).value = 'Meta Febrero';
    ws.getRow(5).getCell(prod.col + 1).value = prod.p.meta;
    ws.getRow(6).getCell(prod.col).value = 'Vendidos';
    ws.getRow(6).getCell(prod.col + 1).value = prod.p.meta - prod.p.disponibles > 0
      ? prod.p.meta - prod.p.disponibles : 0;
    ws.getRow(7).getCell(prod.col).value = 'Faltan';
    ws.getRow(7).getCell(prod.col + 1).value = prod.p.disponibles;
  }

  // Harmonyca & Skinvive
  ws.getRow(8).getCell(5).value = 'CONTROL HARMONYCA';
  ws.getRow(8).getCell(5).font = { bold: true };
  ws.getRow(9).getCell(5).value = 'Meta Febrero';
  ws.getRow(9).getCell(6).value = cfg.harmonyca.meta;
  ws.getRow(10).getCell(5).value = 'Vendidos';
  ws.getRow(10).getCell(6).value = Math.max(0, cfg.harmonyca.meta - cfg.harmonyca.disponibles);
  ws.getRow(11).getCell(5).value = 'Faltan';
  ws.getRow(11).getCell(6).value = cfg.harmonyca.disponibles;

  ws.getRow(12).getCell(5).value = 'CONTROL SKINVIVE';
  ws.getRow(12).getCell(5).font = { bold: true };
  ws.getRow(13).getCell(5).value = 'Meta Febrero';
  ws.getRow(13).getCell(6).value = cfg.skinvive.meta;
  ws.getRow(14).getCell(5).value = 'Vendidos';
  ws.getRow(14).getCell(6).value = Math.max(0, cfg.skinvive.meta - cfg.skinvive.disponibles);
  ws.getRow(15).getCell(5).value = 'Faltan';
  ws.getRow(15).getCell(6).value = cfg.skinvive.disponibles;

  // Belotero
  ws.getRow(8).getCell(8).value = 'CONTROL BELOTERO';
  ws.getRow(8).getCell(8).font = { bold: true };
  const belo = [
    cfg.belotero.balance,
    cfg.belotero.intense,
    cfg.belotero.volume,
    cfg.belotero.revive,
  ];
  let br = 9;
  for (const b of belo) {
    ws.getRow(br).getCell(8).value = b.nombre;
    ws.getRow(br).getCell(9).value = b.meta;
    br++;
  }
  const beloMetaTotal = belo.reduce((s, b) => s + b.meta, 0);
  ws.getRow(13).getCell(8).value = 'Meta Febrero';
  ws.getRow(13).getCell(9).value = beloMetaTotal;

  ws.getColumn(2).width = 20;
  ws.getColumn(3).width = 16;
  ws.getColumn(5).width = 26;
  ws.getColumn(6).width = 12;
  ws.getColumn(8).width = 22;
  ws.getColumn(9).width = 12;
}
