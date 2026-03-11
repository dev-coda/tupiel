import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const router = Router();

/**
 * GET /api/db-toggle
 * Returns current database mode
 * 
 * - remote/production: Live production database (DigitalOcean) - READ-ONLY
 * - local: Local database dump - for testing/development
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const envPath = join(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const useLocal = envContent.includes('USE_LOCAL_DB=true') || envContent.includes('USE_LOCAL_DB=1');
    res.json({ 
      useLocal, 
      mode: useLocal ? 'local' : 'production',
      description: useLocal 
        ? 'Using local database dump (for testing)' 
        : 'Using live production database (read-only)'
    });
  } catch (err) {
    console.error('Error reading DB toggle:', err);
    // Default to production
    res.json({ 
      useLocal: false, 
      mode: 'production',
      description: 'Using live production database (read-only)'
    });
  }
});

/**
 * POST /api/db-toggle
 * Toggles between local dump and production database
 * 
 * Body: { useLocal: boolean }
 * - useLocal: true = use local database dump
 * - useLocal: false = use live production database (default)
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { useLocal } = req.body;
    const envPath = join(process.cwd(), '.env');
    let envContent = '';
    
    try {
      envContent = readFileSync(envPath, 'utf-8');
    } catch (err) {
      // .env doesn't exist, create it
      envContent = '';
    }

    // Remove existing USE_LOCAL_DB lines
    envContent = envContent.replace(/^USE_LOCAL_DB=.*$/gm, '');

    // Add new setting
    if (useLocal) {
      envContent += `\nUSE_LOCAL_DB=true\n`;
    } else {
      envContent += `\nUSE_LOCAL_DB=false\n`;
    }

    writeFileSync(envPath, envContent, 'utf-8');

    res.json({
      success: true,
      useLocal,
      mode: useLocal ? 'local' : 'production',
      message: `Switched to ${useLocal ? 'local database dump' : 'live production database'}. Restart the server for changes to take effect.`,
    });
  } catch (err) {
    console.error('Error toggling DB:', err);
    res.status(500).json({ error: 'Failed to toggle database mode' });
  }
});

export default router;
