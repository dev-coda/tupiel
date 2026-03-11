/**
 * Employees & Products Service
 * 
 * Loads employee lists and product inventory from the PRODUCTION database.
 * These are used to populate the monthly-config form and dashboard.
 */

import { query } from '../config/database';

// ─── Employee category mapping ───
// Based on the 'cargo' field in the 'personal' table.
// We classify employees who have recent activity (consulta_cups) into 3 groups.

const DERMATOLOGIA_CARGOS = ['DERMATÓLOGA', 'DERMATOLOGO', 'DERMATOLOGA'];
const MED_ESTETICA_CARGOS = ['MEDICINA ESTETICA', 'MEDICINA INTEGRATIVA Y ESTETICA'];
const LOUNGE_CARGOS = ['AUXILIAR DE ENFERMERIA', 'ENFERMERA', 'ENFERMERO'];

export type EmployeeCategory = 'DERMATOLOGÍA' | 'MED ESTÉTICA' | 'TP LOUNGE';

export interface EmployeeFromDB {
  user_id: number;
  nombre: string;
  cargo: string;
  categoria: EmployeeCategory;
}

/**
 * Classify an employee cargo string into a category.
 */
function classifyCargo(cargo: string): EmployeeCategory | null {
  const upper = cargo.toUpperCase().trim();
  
  if (DERMATOLOGIA_CARGOS.some(c => upper.includes(c) || c.includes(upper))) {
    return 'DERMATOLOGÍA';
  }
  if (MED_ESTETICA_CARGOS.some(c => upper.includes(c) || c.includes(upper))) {
    return 'MED ESTÉTICA';
  }
  if (LOUNGE_CARGOS.some(c => upper.includes(c) || c.includes(upper))) {
    return 'TP LOUNGE';
  }
  return null;
}

/**
 * Load employees from the production DB who have had activity (consulta_cups)
 * within the given date range, classified by category.
 * 
 * If no date range is given, uses the current month.
 */
export async function getActiveEmployees(
  dateFrom?: string,
  dateTo?: string
): Promise<{ dermatologia: EmployeeFromDB[]; medEstetica: EmployeeFromDB[]; lounge: EmployeeFromDB[] }> {
  // Default to current month if not provided
  if (!dateFrom || !dateTo) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    dateFrom = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    dateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  // Query all employees who have activity in the period
  const result = await query(`
    SELECT DISTINCT per.user_id, per.nombre, per.cargo
    FROM personal per
    JOIN consulta_cups cc ON per.user_id = cc.personal_id
    WHERE cc.fecha_realizacion BETWEEN ? AND ?
    ORDER BY per.cargo, per.nombre
  `, [dateFrom, `${dateTo} 23:59:59`]);

  const dermatologia: EmployeeFromDB[] = [];
  const medEstetica: EmployeeFromDB[] = [];
  const lounge: EmployeeFromDB[] = [];

  for (const row of result.rows) {
    const cargo = String(row.cargo || '');
    const categoria = classifyCargo(cargo);
    
    if (!categoria) continue; // Skip employees that don't fit any category

    const emp: EmployeeFromDB = {
      user_id: Number(row.user_id),
      nombre: String(row.nombre),
      cargo,
      categoria,
    };

    switch (categoria) {
      case 'DERMATOLOGÍA': dermatologia.push(emp); break;
      case 'MED ESTÉTICA': medEstetica.push(emp); break;
      case 'TP LOUNGE': lounge.push(emp); break;
    }
  }

  return { dermatologia, medEstetica, lounge };
}

// ─── Product tracking ───

// The specific articulo IDs for tracked products
export const TRACKED_PRODUCTS: { articulo_id: number; key: string; label: string }[] = [
  { articulo_id: 5500118, key: 'botox', label: 'Botox' },
  { articulo_id: 5500454, key: 'radiesse', label: 'Radiesse' },
  { articulo_id: 5500257, key: 'harmonyca', label: 'Harmonyca' },
  { articulo_id: 5500523, key: 'skinvive', label: 'Skinvive' },
  { articulo_id: 5500451, key: 'belotero.balance', label: 'Belotero Balance' },
  { articulo_id: 5500452, key: 'belotero.intense', label: 'Belotero Intense' },
  { articulo_id: 5500453, key: 'belotero.volume', label: 'Belotero Volume' },
  { articulo_id: 5500491, key: 'belotero.revive', label: 'Belotero Revive' },
];

export interface ProductFromDB {
  articulo_id: number;
  key: string;
  label: string;
  stock: number;        // Current stock from bodega_articulo
  vendidos: number;     // Units used/sold in the period (from consulta_articulo)
  ventaTotal: number;   // Total sales value in $ (cantidad * costo_actual)
}

/**
 * Load product stock and usage from the production DB.
 * 
 * - Stock comes from bodega_articulo (SUM of cantidad where activa=1)
 * - Vendidos (sold/used) comes from consulta_articulo for the given period
 */
export async function getProductsFromDB(
  dateFrom?: string,
  dateTo?: string
): Promise<ProductFromDB[]> {
  // Default to current month if not provided
  if (!dateFrom || !dateTo) {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth() + 1;
    dateFrom = `${y}-${String(m).padStart(2, '0')}-01`;
    const lastDay = new Date(y, m, 0).getDate();
    dateTo = `${y}-${String(m).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
  }

  const articuloIds = TRACKED_PRODUCTS.map(p => p.articulo_id);
  const placeholders = articuloIds.map(() => '?').join(',');

  // Get current stock
  const stockResult = await query(`
    SELECT ba.articulo_id, SUM(ba.cantidad) AS stock
    FROM bodega_articulo ba
    WHERE ba.articulo_id IN (${placeholders})
      AND ba.activa = 1
    GROUP BY ba.articulo_id
  `, articuloIds);

  const stockMap = new Map<number, number>();
  for (const row of stockResult.rows) {
    stockMap.set(Number(row.articulo_id), Number(row.stock || 0));
  }

  // Get units used/sold in the period
  const usageResult = await query(`
    SELECT ca.articulo_id, SUM(ca.cantidad) AS cantidad_usada
    FROM consulta_articulo ca
    WHERE ca.fecha >= ? AND ca.fecha <= ?
      AND ca.articulo_id IN (${placeholders})
    GROUP BY ca.articulo_id
  `, [dateFrom, `${dateTo} 23:59:59`, ...articuloIds]);

  const usageMap = new Map<number, number>();
  for (const row of usageResult.rows) {
    usageMap.set(Number(row.articulo_id), Number(row.cantidad_usada || 0));
  }

  // Get costo_actual for each product (use average if multiple bodegas)
  const priceResult = await query(`
    SELECT ba.articulo_id, AVG(ba.costo_actual) AS costo_promedio
    FROM bodega_articulo ba
    WHERE ba.articulo_id IN (${placeholders})
      AND ba.activa = 1
      AND ba.costo_actual > 0
    GROUP BY ba.articulo_id
  `, articuloIds);

  const priceMap = new Map<number, number>();
  for (const row of priceResult.rows) {
    priceMap.set(Number(row.articulo_id), Number(row.costo_promedio || 0));
  }

  // Build result
  return TRACKED_PRODUCTS.map(p => {
    const cantidad = usageMap.get(p.articulo_id) || 0;
    const costo = priceMap.get(p.articulo_id) || 0;
    return {
      articulo_id: p.articulo_id,
      key: p.key,
      label: p.label,
      stock: stockMap.get(p.articulo_id) || 0,
      vendidos: cantidad,
      ventaTotal: cantidad * costo,
    };
  });
}
