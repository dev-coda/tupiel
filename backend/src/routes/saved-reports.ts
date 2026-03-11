import { Router, Request, Response } from 'express';
import {
  getSavedReports,
  getSavedReportById,
  getSavedReportFile,
} from '../services/saved-reports';
import { triggerDailyReportsJob } from '../jobs/daily-reports';

const router = Router();

/**
 * GET /api/saved-reports
 * 
 * Get all saved reports with optional filters:
 * - reportType: dashboard | controlador | rentabilidad | estimada
 * - dateFrom: YYYY-MM-DD
 * - dateTo: YYYY-MM-DD
 * - limit: number (default 100)
 */
router.get('/', async (req: Request, res: Response) => {
  const { reportType, dateFrom, dateTo, limit } = req.query;

  try {
    const reports = await getSavedReports({
      reportType: reportType as any,
      dateFrom: dateFrom as string,
      dateTo: dateTo as string,
      limit: limit ? parseInt(String(limit), 10) : undefined,
    });

    res.json({
      count: reports.length,
      reports,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to get saved reports:', errorMessage);
    res.status(500).json({
      error: 'Failed to get saved reports',
      details: errorMessage,
    });
  }
});

/**
 * GET /api/saved-reports/:id
 * 
 * Get a specific saved report by ID
 */
router.get('/:id', async (req: Request, res: Response) => {
  const { id } = req.params;
  const reportId = parseInt(String(id), 10);

  if (isNaN(reportId)) {
    res.status(400).json({ error: 'Invalid report ID' });
    return;
  }

  try {
    const report = await getSavedReportById(reportId);

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    // If it's a JSON report, parse the data
    if (report.report_data) {
      try {
        (report as any).data = JSON.parse(report.report_data);
      } catch (err) {
        // Keep as string if parsing fails
      }
    }

    res.json(report);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to get saved report:', errorMessage);
    res.status(500).json({
      error: 'Failed to get saved report',
      details: errorMessage,
    });
  }
});

/**
 * GET /api/saved-reports/:id/download
 * 
 * Download a saved report file (for controlador Excel files)
 */
router.get('/:id/download', async (req: Request, res: Response) => {
  const { id } = req.params;
  const reportId = parseInt(String(id), 10);

  if (isNaN(reportId)) {
    res.status(400).json({ error: 'Invalid report ID' });
    return;
  }

  try {
    const report = await getSavedReportById(reportId);

    if (!report) {
      res.status(404).json({ error: 'Report not found' });
      return;
    }

    if (report.report_type !== 'controlador' || !report.file_path) {
      res.status(400).json({ error: 'This report type does not have a downloadable file' });
      return;
    }

    const fileBuffer = await getSavedReportFile(reportId);

    if (!fileBuffer) {
      res.status(404).json({ error: 'Report file not found' });
      return;
    }

    const filename = `controlador_${report.date_from}_${report.date_to}_${report.report_date.replace(/-/g, '')}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(fileBuffer);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to download saved report:', errorMessage);
    res.status(500).json({
      error: 'Failed to download saved report',
      details: errorMessage,
    });
  }
});

/**
 * POST /api/saved-reports/trigger
 * 
 * Manually trigger the daily reports job (for testing or manual saves)
 */
router.post('/trigger', async (req: Request, res: Response) => {
  try {
    await triggerDailyReportsJob();
    res.json({
      success: true,
      message: 'Daily reports job triggered successfully',
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to trigger daily reports job:', errorMessage);
    res.status(500).json({
      error: 'Failed to trigger daily reports job',
      details: errorMessage,
    });
  }
});

export default router;
