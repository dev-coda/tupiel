/**
 * Monthly Configuration Service
 * 
 * Manages monthly configurations with versioning to preserve historical values.
 * When a config is updated mid-month, a new version is created, preserving
 * the old version for historical reports.
 * 
 * Employees and products are loaded from the PRODUCTION database.
 * Only the configurable values (presupuesto, meta) are stored in the app database.
 */

import { appQuery } from '../config/app-database';
import { ControladorConfig, PersonBudget, ProductTarget } from '../config/controlador-config';
import { calculateWorkingDays } from './working-days';
import { getActiveEmployees, getProductsFromDB, ProductFromDB } from './employees-products';

export interface MonthlyConfigRecord {
  id: number;
  year: number;
  month: number;
  version: number;
  meta_global: number;
  meta_productos: number;
  facturado_productos: number;
  created_at: string;
  updated_at: string;
}

export interface EmployeePresupuestoRecord {
  id: number;
  config_id: number;
  nombre: string;
  categoria: 'DERMATOLOGÍA' | 'MED ESTÉTICA' | 'TP LOUNGE';
  presupuesto: number;
}

export interface ProductMetaRecord {
  id: number;
  config_id: number;
  producto_nombre: string;
  meta: number;
  disponibles: number;
}

/**
 * Get the latest config for a given year/month.
 * 
 * - Employees are loaded from the production DB (active in period)
 * - Products stock/vendidos come from the production DB
 * - If a saved config exists, the presupuesto/meta values are applied
 * - If NO saved config exists, all goals default to 0
 */
export async function getMonthlyConfig(
  year: number,
  month: number,
  dateFrom: string,
  dateTo: string
): Promise<ControladorConfig> {
  // 1. Load employees from production DB
  let employees: { dermatologia: { nombre: string }[]; medEstetica: { nombre: string }[]; lounge: { nombre: string }[] };
  try {
    const fromDB = await getActiveEmployees(dateFrom, dateTo);
    employees = {
      dermatologia: fromDB.dermatologia.map(e => ({ nombre: e.nombre })),
      medEstetica: fromDB.medEstetica.map(e => ({ nombre: e.nombre })),
      lounge: fromDB.lounge.map(e => ({ nombre: e.nombre })),
    };
  } catch (err) {
    console.warn('Failed to load employees from production DB:', err);
    employees = { dermatologia: [], medEstetica: [], lounge: [] };
  }

  // 2. Load products from production DB
  let productsFromDB: ProductFromDB[] = [];
  try {
    productsFromDB = await getProductsFromDB(dateFrom, dateTo);
  } catch (err) {
    console.warn('Failed to load products from production DB:', err);
  }

  // 3. Check if we have a saved config for this month
  let configRecord: MonthlyConfigRecord | null = null;
  let savedEmployees: EmployeePresupuestoRecord[] = [];
  let savedProducts: ProductMetaRecord[] = [];

  try {
    const configResult = await appQuery(
      `SELECT * FROM monthly_configs 
       WHERE year = ? AND month = ?
       ORDER BY version DESC LIMIT 1`,
      [year, month]
    );

    if (configResult.rows.length > 0) {
      configRecord = configResult.rows[0] as unknown as MonthlyConfigRecord;

      const empResult = await appQuery(
        `SELECT * FROM employee_presupuestos WHERE config_id = ?`,
        [configRecord.id]
      );
      savedEmployees = empResult.rows as unknown as EmployeePresupuestoRecord[];

      const prodResult = await appQuery(
        `SELECT * FROM product_metas WHERE config_id = ?`,
        [configRecord.id]
      );
      savedProducts = prodResult.rows as unknown as ProductMetaRecord[];
    }
  } catch (err) {
    console.warn('Failed to load saved config from app DB:', err);
  }

  // 4. Build employee budget maps from saved config
  const savedPresupuestoMap = new Map<string, number>();
  for (const emp of savedEmployees) {
    savedPresupuestoMap.set(`${emp.categoria}:${emp.nombre}`, Number(emp.presupuesto));
  }

  // 5. Build product meta maps from saved config
  const savedProductMetaMap = new Map<string, { meta: number }>();
  for (const prod of savedProducts) {
    savedProductMetaMap.set(prod.producto_nombre.toLowerCase(), { meta: Number(prod.meta) });
  }

  // 6. Build ControladorConfig
  const dermatologia: PersonBudget[] = employees.dermatologia.map(e => ({
    nombre: e.nombre,
    presupuesto: savedPresupuestoMap.get(`DERMATOLOGÍA:${e.nombre}`) ?? 0,
  }));

  const medEstetica: PersonBudget[] = employees.medEstetica.map(e => ({
    nombre: e.nombre,
    presupuesto: savedPresupuestoMap.get(`MED ESTÉTICA:${e.nombre}`) ?? 0,
  }));

  const lounge: PersonBudget[] = employees.lounge.map(e => ({
    nombre: e.nombre,
    presupuesto: savedPresupuestoMap.get(`TP LOUNGE:${e.nombre}`) ?? 0,
  }));

  // Also add any saved employees that are NOT in the current period's active list
  // (in case someone was active at config save time but not in current query range)
  for (const emp of savedEmployees) {
    const existsInList = (list: PersonBudget[]) => list.some(e => e.nombre === emp.nombre);
    const budget: PersonBudget = { nombre: emp.nombre, presupuesto: Number(emp.presupuesto) };
    if (emp.categoria === 'DERMATOLOGÍA' && !existsInList(dermatologia)) {
      dermatologia.push(budget);
    } else if (emp.categoria === 'MED ESTÉTICA' && !existsInList(medEstetica)) {
      medEstetica.push(budget);
    } else if (emp.categoria === 'TP LOUNGE' && !existsInList(lounge)) {
      lounge.push(budget);
    }
  }

  // 7. Build product targets — stock and vendidos from production DB, meta from saved config
  const buildProductTarget = (key: string, label: string): ProductTarget => {
    const dbProduct = productsFromDB.find(p => p.key === key);
    const savedMeta = savedProductMetaMap.get(label.toLowerCase());
    return {
      nombre: label,
      meta: savedMeta?.meta ?? 0,
      disponibles: dbProduct?.stock ?? 0,
    };
  };

  const config: ControladorConfig = {
    diasHabilesMes: 0,
    diasEjecutados: 0,
    metaGlobal: configRecord ? Number(configRecord.meta_global) : 0,
    metaProductos: configRecord ? Number(configRecord.meta_productos) : 0,
    facturadoProductos: configRecord ? Number(configRecord.facturado_productos) : 0,
    dermatologia,
    medEstetica,
    lounge,
    botox: buildProductTarget('botox', 'Botox'),
    radiesse: buildProductTarget('radiesse', 'Radiesse'),
    harmonyca: buildProductTarget('harmonyca', 'Harmonyca'),
    skinvive: buildProductTarget('skinvive', 'Skinvive'),
    belotero: {
      balance: buildProductTarget('belotero.balance', 'Belotero Balance'),
      intense: buildProductTarget('belotero.intense', 'Belotero Intense'),
      volume: buildProductTarget('belotero.volume', 'Belotero Volume'),
      revive: buildProductTarget('belotero.revive', 'Belotero Revive'),
    },
  };

  // 8. Calculate working days
  try {
    const workingDays = await calculateWorkingDays(dateFrom, dateTo);
    if (workingDays <= 0) {
      throw new Error(`Invalid working days calculation: ${workingDays}`);
    }
    config.diasHabilesMes = workingDays;
  } catch (err) {
    console.warn('Failed to calculate working days, using fallback:', err);
    const start = new Date(dateFrom + 'T00:00:00');
    const end = new Date(dateTo + 'T00:00:00');
    let workingDays = 0;
    const current = new Date(start);
    while (current <= end) {
      const dayOfWeek = current.getDay();
      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        workingDays++;
      }
      current.setDate(current.getDate() + 1);
    }
    config.diasHabilesMes = workingDays;
  }

  // 9. Auto-calculate dias ejecutados
  const today = new Date();
  const monthStartStr = `${year}-${String(month).padStart(2, '0')}-01`;

  try {
    const endDate = today < new Date(dateTo + 'T00:00:00')
      ? today.toISOString().substring(0, 10)
      : dateTo;
    const workingDaysExecuted = await calculateWorkingDays(monthStartStr, endDate);
    config.diasEjecutados = Math.max(1, Math.min(workingDaysExecuted, config.diasHabilesMes));
  } catch (err) {
    const monthStart = new Date(year, month - 1, 1);
    const diffDays = Math.floor((today.getTime() - monthStart.getTime()) / 86_400_000);
    config.diasEjecutados = Math.max(1, Math.min(diffDays, config.diasHabilesMes));
  }

  return config;
}

/**
 * Save or update monthly config. Creates a new version if one already exists.
 */
export async function saveMonthlyConfig(
  year: number,
  month: number,
  config: Partial<ControladorConfig>
): Promise<MonthlyConfigRecord> {
  // Check if config exists
  const existingResult = await appQuery(
    `SELECT MAX(version) as max_version FROM monthly_configs 
     WHERE year = ? AND month = ?`,
    [year, month]
  );

  const maxVersion = existingResult.rows[0]?.max_version as number || 0;
  const newVersion = maxVersion + 1;

  const { default: pool } = await import('../config/app-database');
  let conn: any;
  try {
    conn = await pool.getConnection();

    const [result] = await conn.execute(
      `INSERT INTO monthly_configs 
       (year, month, version, meta_global, meta_productos, facturado_productos)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        year,
        month,
        newVersion,
        config.metaGlobal || 0,
        config.metaProductos || 0,
        config.facturadoProductos || 0,
      ]
    );

    const configId = (result as any).insertId;

    // Insert employee presupuestos
    const allEmployees = [
      ...(config.dermatologia || []).map(e => ({ ...e, categoria: 'DERMATOLOGÍA' as const })),
      ...(config.medEstetica || []).map(e => ({ ...e, categoria: 'MED ESTÉTICA' as const })),
      ...(config.lounge || []).map(e => ({ ...e, categoria: 'TP LOUNGE' as const })),
    ];

    for (const emp of allEmployees) {
      await conn.execute(
        `INSERT INTO employee_presupuestos (config_id, nombre, categoria, presupuesto)
         VALUES (?, ?, ?, ?)`,
        [configId, emp.nombre, emp.categoria, emp.presupuesto]
      );
    }

    // Insert product metas
    const products = [
      config.botox,
      config.radiesse,
      config.harmonyca,
      config.skinvive,
      config.belotero?.balance,
      config.belotero?.intense,
      config.belotero?.volume,
      config.belotero?.revive,
    ].filter(Boolean) as ProductTarget[];

    for (const prod of products) {
      await conn.execute(
        `INSERT INTO product_metas (config_id, producto_nombre, meta, disponibles)
         VALUES (?, ?, ?, ?)`,
        [configId, prod.nombre, prod.meta, prod.disponibles]
      );
    }

    // Return the created config
    const [rows] = await conn.execute(
      `SELECT * FROM monthly_configs WHERE id = ?`,
      [configId]
    );

    return (rows as any[])[0] as MonthlyConfigRecord;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Get all config versions for a month (for history/audit)
 */
export async function getMonthlyConfigHistory(
  year: number,
  month: number
): Promise<MonthlyConfigRecord[]> {
  const result = await appQuery(
    `SELECT * FROM monthly_configs 
     WHERE year = ? AND month = ?
     ORDER BY version DESC`,
    [year, month]
  );
  return result.rows as unknown as MonthlyConfigRecord[];
}
