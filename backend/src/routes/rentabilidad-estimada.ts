import { Router, Request, Response } from 'express';
import { generateEstimada } from '../services/rentabilidad-estimada';

const router = Router();

/**
 * GET /api/reports/rentabilidad-estimada?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns the estimated profitability report for scheduled procedures.
 */
router.get('/', async (req: Request, res: Response) => {
  const { from, to } = req.query;

  if (!from || !to) {
    res.status(400).json({
      error: 'Missing required query params: from, to (YYYY-MM-DD)',
    });
    return;
  }

  const datePattern = /^\d{4}-\d{2}-\d{2}$/;
  if (
    !datePattern.test(String(from)) ||
    !datePattern.test(String(to))
  ) {
    res.status(400).json({ error: 'Dates must be YYYY-MM-DD format' });
    return;
  }

  try {
    const report = await generateEstimada(String(from), String(to));
    res.json(report);
  } catch (err) {
    console.error('Rentabilidad Estimada report failed:', err);
    res.status(500).json({ error: 'Failed to generate report' });
  }
});

export default router;
