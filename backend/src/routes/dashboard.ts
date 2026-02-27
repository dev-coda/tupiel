import { Router, Request, Response } from 'express';
import { generateDashboardData } from '../services/dashboard';

const router = Router();

/**
 * GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns JSON dashboard data for the given date range.
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
  if (!datePattern.test(String(from)) || !datePattern.test(String(to))) {
    res.status(400).json({ error: 'Dates must be YYYY-MM-DD format' });
    return;
  }

  try {
    const data = await generateDashboardData(String(from), String(to));
    res.json(data);
  } catch (err) {
    console.error('Dashboard data failed:', err);
    res.status(500).json({ error: 'Failed to generate dashboard data' });
  }
});

export default router;
