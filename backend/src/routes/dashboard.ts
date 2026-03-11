import { Router, Request, Response } from 'express';
import { generateDashboardData } from '../services/dashboard';

const router = Router();

/**
 * GET /api/dashboard?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Returns JSON dashboard data for the given date range.
 */
router.get('/', async (req: Request, res: Response) => {
  const { from, to, pagoSi } = req.query;

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

  const filterPagoSi = pagoSi !== 'false';

  try {
    const data = await generateDashboardData(String(from), String(to), {}, filterPagoSi);
    res.json(data);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    const errorStack = err instanceof Error ? err.stack : undefined;
    const code = err && typeof err === 'object' && 'code' in err ? String((err as NodeJS.ErrnoException).code) : '';
    console.error('Dashboard data failed:', errorMessage, errorStack);
    const isConnectionError = code === 'ETIMEDOUT' || code === 'ECONNREFUSED' || errorMessage.includes('ETIMEDOUT') || errorMessage.includes('ECONNREFUSED');
    res.status(isConnectionError ? 503 : 500).json({
      error: 'Failed to generate dashboard data',
      details: errorMessage,
      ...(isConnectionError && { hint: 'Production database unreachable. From local dev, add your IP to DigitalOcean Managed DB Trusted Sources.' }),
      ...(process.env.NODE_ENV === 'development' && { stack: errorStack }),
    });
  }
});

export default router;
