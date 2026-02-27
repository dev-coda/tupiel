import { Router, Request, Response } from 'express';
import { readFileSync, writeFileSync } from 'fs';
import { join } from 'path';

const router = Router();

/**
 * GET /api/db-toggle
 * Returns current database mode (local or remote)
 */
router.get('/', (_req: Request, res: Response) => {
  try {
    const envPath = join(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf-8');
    const useLocal = envContent.includes('USE_LOCAL_DB=true') || envContent.includes('USE_LOCAL_DB=1');
    res.json({ useLocal, mode: useLocal ? 'local' : 'remote' });
  } catch (err) {
    console.error('Error reading DB toggle:', err);
    res.json({ useLocal: false, mode: 'remote' });
  }
});

/**
 * POST /api/db-toggle
 * Toggles between local and remote database
 * Body: { useLocal: boolean }
 */
router.post('/', (req: Request, res: Response) => {
  try {
    const { useLocal } = req.body;
    const envPath = join(process.cwd(), '.env');
    let envContent = readFileSync(envPath, 'utf-8');

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
      mode: useLocal ? 'local' : 'remote',
      message: `Switched to ${useLocal ? 'local' : 'remote'} database. Restart the server for changes to take effect.`,
    });
  } catch (err) {
    console.error('Error toggling DB:', err);
    res.status(500).json({ error: 'Failed to toggle database mode' });
  }
});

export default router;
