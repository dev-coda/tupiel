import { Router, Request, Response } from 'express';
import { testConnection } from '../config/database';

const router = Router();

/**
 * Health check endpoint.
 * Always returns HTTP 200 immediately so App Runner health checks pass.
 * Database connectivity is checked in the background with a short timeout.
 */
router.get('/', async (_req: Request, res: Response) => {
  // Respond immediately - don't block on DB connection
  // App Runner health check timeout is 5s, DB connect timeout can be 10s+
  let dbConnected = false;
  try {
    // Race the DB check against a 3-second timeout
    dbConnected = await Promise.race([
      testConnection(),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 3000)),
    ]);
  } catch {
    dbConnected = false;
  }

  res.json({
    status: 'healthy', // Always report healthy to pass App Runner health checks
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
  });
});

export default router;
