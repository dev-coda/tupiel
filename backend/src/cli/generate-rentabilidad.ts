#!/usr/bin/env npx ts-node
/**
 * CLI tool to generate profitability reports as Excel or CSV.
 *
 * Usage:
 *   # Rentabilidad (actual, completed procedures)
 *   npx ts-node src/cli/generate-rentabilidad.ts --from 2026-02-01 --to 2026-02-20
 *
 *   # Rentabilidad Estimada (scheduled, upcoming procedures)
 *   npx ts-node src/cli/generate-rentabilidad.ts --type estimada --from 2026-02-27 --to 2026-02-28
 *
 *   # Options
 *   --output /path/to/file.xlsx    Output file path
 *   --csv                          Export as CSV instead of Excel
 *   --type rentabilidad|estimada   Report type (default: rentabilidad)
 */
import dotenv from 'dotenv';
dotenv.config();

import { generateRentabilidad, RentabilidadRow } from '../services/rentabilidad';
import { generateEstimada, EstimadaRow } from '../services/rentabilidad-estimada';
import { generateControlador } from '../services/controlador';
import * as fs from 'fs';
import * as path from 'path';

// ── Parse CLI args ──
const args = process.argv.slice(2);
function getArg(name: string): string | undefined {
  const idx = args.indexOf(`--${name}`);
  return idx >= 0 && idx + 1 < args.length ? args[idx + 1] : undefined;
}
const hasFlag = (name: string) => args.includes(`--${name}`);

const reportType = (getArg('type') || 'rentabilidad').toLowerCase();
const dateFrom = getArg('from');
const dateTo = getArg('to');
const outputPath = getArg('output');
const csvMode = hasFlag('csv');

if (!dateFrom || !dateTo) {
  console.error(
    'Usage: npx ts-node src/cli/generate-rentabilidad.ts --from YYYY-MM-DD --to YYYY-MM-DD [--type rentabilidad|estimada] [--output path] [--csv]'
  );
  process.exit(1);
}

if (!['rentabilidad', 'estimada', 'controlador'].includes(reportType)) {
  console.error('Invalid report type. Use: rentabilidad | estimada | controlador');
  process.exit(1);
}

// ── Rentabilidad (actual) column config ──
const RENT_HEADERS = [
  '# Atención', '# Registro', 'Fecha Realización', 'Doc. Paciente',
  'Nombre Paciente', 'Personal Atiende', 'Código Cups', 'Cups',
  'Sub Categoria', 'Categoria', 'Dispositivo', 'Vlr',
  'Costo Comisiones', 'Costo Insumos', 'Costo Bancario', 'Costo Adicional',
  'Rentabilidad Insumos', 'Rentabilidad Equipos', 'Rentabilidad Total',
  'Promedio Porcentaje', 'Observaciones', 'Fecha Facturación',
  'Pagado este mes', 'Procedencia / Recomendacion', 'Edad del paciente',
  'Numero Factura', 'Paciente Pais de origen', 'Paciente Celular',
];

function rentRowToArray(r: RentabilidadRow): (string | number | null)[] {
  return [
    r.atencion, r.registro, r.fecha_realizacion, r.doc_paciente,
    r.nombre_paciente, r.personal_atiende, r.codigo_cups, r.cups,
    r.sub_categoria, r.categoria, r.dispositivo, r.vlr,
    r.costo_comisiones, r.costo_insumos, r.costo_bancario, r.costo_adicional,
    r.rentabilidad_insumos, r.rentabilidad_equipos, r.rentabilidad_total,
    r.promedio_porcentaje, r.observaciones, r.fecha_facturacion,
    r.pagado_este_mes, r.procedencia_recomendacion, r.edad_paciente,
    r.numero_factura, r.paciente_pais_origen, r.paciente_celular,
  ];
}

// ── Estimada column config ──
const EST_HEADERS = [
  '# Atención', '# Registro', 'Fecha Realización o Programada', 'Doc. Paciente',
  'Nombre Paciente', 'Personal Atiende', 'Código Cups', 'Cups',
  'Sub Categoria', 'Categoria', 'Dispositivo', 'Vlr',
  'Vlr Comisiones', 'Vlr Insumos', 'Costo Adicional',
  'Rentabilidad Insumos', 'Rentabilidad Equipos', 'Rentabilidad Ips',
  'Rentabilidad Total', 'Rentabilidad Porcentaje', 'Pendiente Registrar',
  'Fecha Facturación', 'Pagado este mes', 'Procedencia / Recomendacion',
  'Edad del paciente', 'Numero Factura',
];

function estRowToArray(r: EstimadaRow): (string | number | null)[] {
  return [
    r.atencion, r.registro, r.fecha_realizacion_o_programada, r.doc_paciente,
    r.nombre_paciente, r.personal_atiende, r.codigo_cups, r.cups,
    r.sub_categoria, r.categoria, r.dispositivo, r.vlr,
    r.vlr_comisiones, r.vlr_insumos, r.costo_adicional,
    r.rentabilidad_insumos, r.rentabilidad_equipos, r.rentabilidad_ips,
    r.rentabilidad_total, r.rentabilidad_porcentaje, r.pendiente_registrar,
    r.fecha_facturacion, r.pagado_este_mes, r.procedencia_recomendacion,
    r.edad_paciente, r.numero_factura,
  ];
}

async function main() {
  // ── Controlador: special path (always Excel, multi-tab) ──
  if (reportType === 'controlador') {
    console.log(`Generating Controlador PPTO report: ${dateFrom} → ${dateTo}`);
    const wb = await generateControlador(dateFrom!, dateTo!);
    const filePath =
      outputPath || path.join(process.cwd(), `controlador_ppto_${dateFrom}_${dateTo}.xlsx`);
    await wb.xlsx.writeFile(filePath);
    console.log(`\n✅ Controlador Excel written to: ${filePath}`);
    process.exit(0);
  }

  const isEstimada = reportType === 'estimada';
  const label = isEstimada ? 'Rentabilidad Estimada' : 'Rentabilidad';
  console.log(`Generating ${label} report: ${dateFrom} → ${dateTo}`);

  // Generate data
  const headers = isEstimada ? EST_HEADERS : RENT_HEADERS;
  let dataRows: (string | number | null)[][];
  let totalsRow: (string | number | null)[];
  let rowCount: number;

  if (isEstimada) {
    const report = await generateEstimada(dateFrom!, dateTo!);
    rowCount = report.rows.length;
    dataRows = report.rows.map(estRowToArray);
    totalsRow = [
      '', '', '', '', '', '', '', '', '', '', 'Total: ',
      report.totals.vlr, report.totals.vlr_comisiones, report.totals.vlr_insumos,
      report.totals.costo_adicional, report.totals.rentabilidad_insumos,
      report.totals.rentabilidad_equipos, report.totals.rentabilidad_ips,
      report.totals.rentabilidad_total, report.totals.rentabilidad_porcentaje,
    ];
    console.log(`  Rows: ${rowCount}`);
    console.log(`  Total Vlr: ${report.totals.vlr.toLocaleString()}`);
    console.log(`  Rentabilidad Total: ${report.totals.rentabilidad_total.toLocaleString()}`);
  } else {
    const report = await generateRentabilidad(dateFrom!, dateTo!);
    rowCount = report.rows.length;
    dataRows = report.rows.map(rentRowToArray);
    totalsRow = [
      '', '', '', '', '', '', '', '', '', '', 'Total: ',
      report.totals.vlr, report.totals.costo_comisiones, report.totals.costo_insumos,
      report.totals.costo_bancario, report.totals.costo_adicional,
      report.totals.rentabilidad_insumos, report.totals.rentabilidad_equipos,
      report.totals.rentabilidad_total, report.totals.promedio_porcentaje,
    ];
    console.log(`  Rows: ${rowCount}`);
    console.log(`  Total Vlr: ${report.totals.vlr.toLocaleString()}`);
    console.log(`  Rentabilidad Total: ${report.totals.rentabilidad_total.toLocaleString()}`);
    console.log(`  Promedio %: ${(report.totals.promedio_porcentaje * 100).toFixed(2)}%`);
  }

  const defaultName = isEstimada
    ? `reporte_rentabilidad_estimada_${dateFrom}_${dateTo}`
    : `reporte_rentabilidad_${dateFrom}_${dateTo}`;

  const escape = (v: string | number | null) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };

  if (csvMode) {
    const filePath = outputPath || path.join(process.cwd(), `${defaultName}.csv`);
    const lines = [
      'Medifony',
      `Fecha Generación:,${new Date().toLocaleDateString('sv-SE')}`,
      '',
      headers.map(escape).join(','),
      ...dataRows.map((row) => row.map(escape).join(',')),
      totalsRow.map(escape).join(','),
    ];
    fs.writeFileSync(filePath, lines.join('\n'), 'utf-8');
    console.log(`\n✅ CSV written to: ${filePath}`);
  } else {
    let ExcelJS: any;
    try {
      ExcelJS = await import('exceljs');
    } catch {
      console.error('ExcelJS not installed. Run: npm install exceljs');
      process.exit(1);
    }

    const workbook = new ExcelJS.Workbook();
    const ws = workbook.addWorksheet('Worksheet');

    // Row 1: Title
    ws.addRow(['Medifony']);
    ws.getCell('A1').font = { bold: true, size: 14 };

    // Row 2: Generation date
    ws.addRow(['Fecha Generación:', new Date().toLocaleDateString('sv-SE')]);

    // Row 3: blank
    ws.addRow([]);

    // Row 4: Headers
    const headerRow = ws.addRow(headers);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF4472C4' },
    };

    // Data rows
    for (const row of dataRows) {
      ws.addRow(row);
    }

    // Totals row
    const totRow = ws.addRow(totalsRow);
    totRow.font = { bold: true };

    // Auto-width
    ws.columns.forEach((col: any) => {
      col.width = Math.max(col.width || 10, 14);
    });

    // Currency format for financial columns
    const financialStart = 12; // Vlr
    const financialEnd = isEstimada ? 19 : 19;
    const pctCol = isEstimada ? 20 : 20;

    for (let rowNum = 5; rowNum <= ws.rowCount; rowNum++) {
      for (let colNum = financialStart; colNum <= financialEnd; colNum++) {
        const cell = ws.getCell(rowNum, colNum);
        if (typeof cell.value === 'number') {
          cell.numFmt = '#,##0';
        }
      }
      const pctCell = ws.getCell(rowNum, pctCol);
      if (typeof pctCell.value === 'number') {
        pctCell.numFmt = '0.00%';
      }
    }

    const filePath = outputPath || path.join(process.cwd(), `${defaultName}.xlsx`);
    await workbook.xlsx.writeFile(filePath);
    console.log(`\n✅ Excel written to: ${filePath}`);
  }

  process.exit(0);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
