import { Router, Request, Response } from 'express';
import {
  getMonthlyConfig,
  saveMonthlyConfig,
  getMonthlyConfigHistory,
} from '../services/monthly-config';
import { getActiveEmployees, getProductsFromDB } from '../services/employees-products';
import { ControladorConfig } from '../config/controlador-config';
import { toDateString } from '../utils/dates';
import { appQuery } from '../config/app-database';

const router = Router();

/**
 * GET /api/monthly-config?year=2026&month=3&from=2026-03-01&to=2026-03-31
 * 
 * Get the latest config for a month. Loads employees & products from production DB.
 */
router.get('/', async (req: Request, res: Response) => {
  const { year, month, from, to } = req.query;

  if (!year || !month) {
    res.status(400).json({
      error: 'Missing required params: year, month',
    });
    return;
  }

  const yearNum = parseInt(String(year), 10);
  const monthNum = parseInt(String(month), 10);

  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    res.status(400).json({ error: 'Invalid year or month' });
    return;
  }

  // Auto-calculate date range if not provided
  let dateFrom = String(from);
  let dateTo = String(to);

  if (!from || !to) {
    const firstDay = new Date(yearNum, monthNum - 1, 1);
    const lastDay = new Date(yearNum, monthNum, 0);
    dateFrom = toDateString(firstDay);
    dateTo = toDateString(lastDay);
  }

  try {
    const config = await getMonthlyConfig(yearNum, monthNum, dateFrom, dateTo);

    // Also load product vendidos for display
    let productVendidos: Record<string, number> = {};
    try {
      const products = await getProductsFromDB(dateFrom, dateTo);
      for (const p of products) {
        productVendidos[p.key] = p.vendidos;
      }
    } catch (_) { /* ignore */ }

    res.json({
      year: yearNum,
      month: monthNum,
      dateFrom,
      dateTo,
      config,
      productVendidos,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to get monthly config:', errorMessage);
    res.status(500).json({
      error: 'Failed to get monthly config',
      details: errorMessage,
    });
  }
});

/**
 * GET /api/monthly-config/employees?from=2026-03-01&to=2026-03-31
 * 
 * Load active employees from the production DB, classified by category.
 */
router.get('/employees', async (req: Request, res: Response) => {
  const { from, to } = req.query;

  try {
    const employees = await getActiveEmployees(
      from ? String(from) : undefined,
      to ? String(to) : undefined
    );
    res.json(employees);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to load employees:', errorMessage);
    res.status(500).json({
      error: 'Failed to load employees',
      details: errorMessage,
    });
  }
});

/**
 * GET /api/monthly-config/products?from=2026-03-01&to=2026-03-31
 * 
 * Load tracked products with stock and usage from the production DB.
 */
router.get('/products', async (req: Request, res: Response) => {
  const { from, to } = req.query;

  try {
    const products = await getProductsFromDB(
      from ? String(from) : undefined,
      to ? String(to) : undefined
    );
    res.json(products);
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to load products:', errorMessage);
    res.status(500).json({
      error: 'Failed to load products',
      details: errorMessage,
    });
  }
});

/**
 * POST /api/monthly-config
 * 
 * Save a new config version for a month.
 */
router.post('/', async (req: Request, res: Response) => {
  const { year, month, config } = req.body;

  if (!year || !month || !config) {
    res.status(400).json({
      error: 'Missing required body params: year, month, config',
    });
    return;
  }

  const yearNum = parseInt(String(year), 10);
  const monthNum = parseInt(String(month), 10);

  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    res.status(400).json({ error: 'Invalid year or month' });
    return;
  }

  try {
    const configRecord = await saveMonthlyConfig(yearNum, monthNum, config as Partial<ControladorConfig>);
    res.json({
      message: 'Config saved successfully',
      config: configRecord,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to save monthly config:', errorMessage);
    res.status(500).json({
      error: 'Failed to save monthly config',
      details: errorMessage,
    });
  }
});

/**
 * GET /api/monthly-config/history?year=2026&month=2
 * 
 * Get all config versions for a month (for audit/history)
 */
router.get('/history', async (req: Request, res: Response) => {
  const { year, month } = req.query;

  if (!year || !month) {
    res.status(400).json({
      error: 'Missing required params: year, month',
    });
    return;
  }

  const yearNum = parseInt(String(year), 10);
  const monthNum = parseInt(String(month), 10);

  if (isNaN(yearNum) || isNaN(monthNum) || monthNum < 1 || monthNum > 12) {
    res.status(400).json({ error: 'Invalid year or month' });
    return;
  }

  try {
    const history = await getMonthlyConfigHistory(yearNum, monthNum);
    res.json({
      year: yearNum,
      month: monthNum,
      versions: history,
    });
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('Failed to get config history:', errorMessage);
    res.status(500).json({
      error: 'Failed to get config history',
      details: errorMessage,
    });
  }
});

// ─── Hidden Employees ───────────────────────────────────

router.get('/hidden-employees', async (_req: Request, res: Response) => {
  try {
    const result = await appQuery('SELECT * FROM hidden_employees ORDER BY categoria, nombre');
    res.json({ data: result.rows });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load hidden employees' });
  }
});

router.post('/hidden-employees', async (req: Request, res: Response) => {
  const { nombre, categoria } = req.body;
  if (!nombre || !categoria) {
    res.status(400).json({ error: 'nombre and categoria are required' });
    return;
  }
  try {
    await appQuery(
      'INSERT IGNORE INTO hidden_employees (nombre, categoria) VALUES (?, ?)',
      [nombre, categoria]
    );
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to hide employee' });
  }
});

router.delete('/hidden-employees/:id', async (req: Request, res: Response) => {
  const id = parseInt(String(req.params.id), 10);
  if (isNaN(id)) {
    res.status(400).json({ error: 'Invalid ID' });
    return;
  }
  try {
    await appQuery('DELETE FROM hidden_employees WHERE id = ?', [id]);
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unhide employee' });
  }
});

export default router;
