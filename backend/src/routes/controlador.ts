import { Router, Request, Response } from 'express';
import { generateControlador } from '../services/controlador';
import { DEFAULT_CONFIG } from '../config/controlador-config';

const router = Router();

/**
 * GET /api/reports/controlador?from=YYYY-MM-DD&to=YYYY-MM-DD
 *
 * Generates the full CONTROLADOR PPTO master report as an Excel download.
 * Optionally accepts config overrides in the request body (POST).
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
    const wb = await generateControlador(String(from), String(to));

    const fileName = `controlador_ppto_${from}_${to}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Controlador report failed:', err);
    res.status(500).json({ error: 'Failed to generate controlador report' });
  }
});

/**
 * POST /api/reports/controlador
 *
 * Same as GET but accepts config overrides in the body.
 */
router.post('/', async (req: Request, res: Response) => {
  const { from, to, config } = req.body;

  if (!from || !to) {
    res.status(400).json({
      error: 'Missing required body params: from, to (YYYY-MM-DD)',
    });
    return;
  }

  try {
    const wb = await generateControlador(
      String(from),
      String(to),
      config || {}
    );

    const fileName = `controlador_ppto_${from}_${to}.xlsx`;
    res.setHeader(
      'Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
    );
    res.setHeader('Content-Disposition', `attachment; filename="${fileName}"`);

    await wb.xlsx.write(res);
    res.end();
  } catch (err) {
    console.error('Controlador report failed:', err);
    res.status(500).json({ error: 'Failed to generate controlador report' });
  }
});

export default router;
