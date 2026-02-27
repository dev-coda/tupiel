import { Router, Request, Response } from 'express';
import { testConnection } from '../config/database';

const router = Router();

router.get('/', async (_req: Request, res: Response) => {
  const dbConnected = await testConnection();
  res.json({
    status: dbConnected ? 'healthy' : 'unhealthy',
    timestamp: new Date().toISOString(),
    database: dbConnected ? 'connected' : 'disconnected',
  });
});

export default router;
