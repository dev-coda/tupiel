/**
 * Saved Reports Service
 * 
 * Handles saving and retrieving daily automated report snapshots.
 * Reports are saved at 11pm daily with all current data and config versions.
 */

import { appQuery } from '../config/app-database';
import { generateDashboardData } from './dashboard';
import { generateControlador } from './controlador';
import { generateRentabilidad } from './rentabilidad';
import { generateEstimada } from './rentabilidad-estimada';
import { getMonthlyConfigHistory } from './monthly-config';
import * as fs from 'fs/promises';
import * as path from 'path';

export interface SavedReport {
  id: number;
  report_date: string;
  report_type: 'dashboard' | 'controlador' | 'rentabilidad' | 'estimada';
  date_from: string;
  date_to: string;
  config_version: number | null;
  report_data: string | null;
  file_path: string | null;
  file_size: number | null;
  created_at: string;
}

/**
 * Get the date range for today's reports (current month so far)
 */
function getTodayDateRange(): { from: string; to: string } {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth() + 1;
  const from = `${year}-${String(month).padStart(2, '0')}-01`;
  const to = today.toISOString().substring(0, 10);
  return { from, to };
}

/**
 * Get the config version used for a specific month
 */
async function getConfigVersionForMonth(year: number, month: number): Promise<number | null> {
  try {
    const history = await getMonthlyConfigHistory(year, month);
    if (history.length > 0) {
      return history[0].version; // Latest version
    }
  } catch (err) {
    console.warn('Could not get config version:', err);
  }
  return null;
}

/**
 * Save dashboard report
 */
async function saveDashboardReport(reportDate: string, dateFrom: string, dateTo: string): Promise<void> {
  const dashboardData = await generateDashboardData(dateFrom, dateTo);
  const reportData = JSON.stringify(dashboardData);
  
  // Get config version
  const dateFromObj = new Date(dateFrom + 'T00:00:00');
  const year = dateFromObj.getFullYear();
  const month = dateFromObj.getMonth() + 1;
  const configVersion = await getConfigVersionForMonth(year, month);
  
  await appQuery(
    `INSERT INTO saved_reports 
     (report_date, report_type, date_from, date_to, config_version, report_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reportDate, 'dashboard', dateFrom, dateTo, configVersion, reportData]
  );
  
  console.log(`✅ Saved dashboard report for ${reportDate}`);
}

/**
 * Save controlador Excel report
 */
async function saveControladorReport(reportDate: string, dateFrom: string, dateTo: string): Promise<void> {
  const workbook = await generateControlador(dateFrom, dateTo);
  
  // Create reports directory if it doesn't exist
  const reportsDir = path.join(process.cwd(), 'saved-reports');
  await fs.mkdir(reportsDir, { recursive: true });
  
  // Generate filename
  const filename = `controlador_${dateFrom}_${dateTo}_${reportDate.replace(/-/g, '')}.xlsx`;
  const filePath = path.join(reportsDir, filename);
  
  // Write Excel file
  await workbook.xlsx.writeFile(filePath);
  
  // Get file size
  const stats = await fs.stat(filePath);
  const fileSize = stats.size;
  
  // Get config version
  const dateFromObj = new Date(dateFrom + 'T00:00:00');
  const year = dateFromObj.getFullYear();
  const month = dateFromObj.getMonth() + 1;
  const configVersion = await getConfigVersionForMonth(year, month);
  
  await appQuery(
    `INSERT INTO saved_reports 
     (report_date, report_type, date_from, date_to, config_version, file_path, file_size)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [reportDate, 'controlador', dateFrom, dateTo, configVersion, filePath, fileSize]
  );
  
  console.log(`✅ Saved controlador report for ${reportDate} at ${filePath}`);
}

/**
 * Save rentabilidad report
 */
async function saveRentabilidadReport(reportDate: string, dateFrom: string, dateTo: string): Promise<void> {
  const rentabilidadData = await generateRentabilidad(dateFrom, dateTo);
  const reportData = JSON.stringify(rentabilidadData);
  
  // Get config version
  const dateFromObj = new Date(dateFrom + 'T00:00:00');
  const year = dateFromObj.getFullYear();
  const month = dateFromObj.getMonth() + 1;
  const configVersion = await getConfigVersionForMonth(year, month);
  
  await appQuery(
    `INSERT INTO saved_reports 
     (report_date, report_type, date_from, date_to, config_version, report_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reportDate, 'rentabilidad', dateFrom, dateTo, configVersion, reportData]
  );
  
  console.log(`✅ Saved rentabilidad report for ${reportDate}`);
}

/**
 * Save estimada report
 */
async function saveEstimadaReport(reportDate: string, dateFrom: string, dateTo: string): Promise<void> {
  const estimadaData = await generateEstimada(dateFrom, dateTo);
  const reportData = JSON.stringify(estimadaData);
  
  // Get config version
  const dateFromObj = new Date(dateFrom + 'T00:00:00');
  const year = dateFromObj.getFullYear();
  const month = dateFromObj.getMonth() + 1;
  const configVersion = await getConfigVersionForMonth(year, month);
  
  await appQuery(
    `INSERT INTO saved_reports 
     (report_date, report_type, date_from, date_to, config_version, report_data)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [reportDate, 'estimada', dateFrom, dateTo, configVersion, reportData]
  );
  
  console.log(`✅ Saved estimada report for ${reportDate}`);
}

/**
 * Save all reports for today (called by scheduled job)
 */
export async function saveAllReportsForToday(): Promise<void> {
  const today = new Date();
  const reportDate = today.toISOString().substring(0, 10);
  const { from, to } = getTodayDateRange();
  
  console.log(`📊 Starting daily report save for ${reportDate} (${from} to ${to})`);
  
  try {
    // Save all report types in parallel
    await Promise.all([
      saveDashboardReport(reportDate, from, to),
      saveControladorReport(reportDate, from, to),
      saveRentabilidadReport(reportDate, from, to),
      saveEstimadaReport(reportDate, from, to),
    ]);
    
    console.log(`✅ All reports saved successfully for ${reportDate}`);
  } catch (err) {
    console.error(`❌ Error saving reports for ${reportDate}:`, err);
    throw err;
  }
}

/**
 * Get all saved reports, optionally filtered by date range or type
 */
export async function getSavedReports(
  filters?: {
    reportType?: 'dashboard' | 'controlador' | 'rentabilidad' | 'estimada';
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }
): Promise<SavedReport[]> {
  let query = 'SELECT * FROM saved_reports WHERE 1=1';
  const params: any[] = [];
  
  if (filters?.reportType) {
    query += ' AND report_type = ?';
    params.push(filters.reportType);
  }
  
  if (filters?.dateFrom) {
    query += ' AND report_date >= ?';
    params.push(filters.dateFrom);
  }
  
  if (filters?.dateTo) {
    query += ' AND report_date <= ?';
    params.push(filters.dateTo);
  }
  
  query += ' ORDER BY report_date DESC, created_at DESC';
  
  if (filters?.limit) {
    query += ' LIMIT ?';
    params.push(filters.limit);
  } else {
    query += ' LIMIT 100'; // Default limit
  }
  
  const result = await appQuery(query, params);
  return result.rows as unknown as SavedReport[];
}

/**
 * Get a specific saved report by ID
 */
export async function getSavedReportById(id: number): Promise<SavedReport | null> {
  const result = await appQuery(
    'SELECT * FROM saved_reports WHERE id = ?',
    [id]
  );
  
  if (result.rows.length === 0) {
    return null;
  }
  
  return result.rows[0] as unknown as SavedReport;
}

/**
 * Get saved report file (for controlador Excel files)
 */
export async function getSavedReportFile(id: number): Promise<Buffer | null> {
  const report = await getSavedReportById(id);
  
  if (!report || !report.file_path || report.report_type !== 'controlador') {
    return null;
  }
  
  try {
    const fileBuffer = await fs.readFile(report.file_path);
    return fileBuffer;
  } catch (err) {
    console.error(`Error reading file ${report.file_path}:`, err);
    return null;
  }
}
