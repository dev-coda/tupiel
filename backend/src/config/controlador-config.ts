/**
 * Configuration for the Controlador PPTO master report.
 *
 * These are the "hard-coded" parameters that appear in the Excel template
 * (budgets per person, monthly targets, product inventory, etc.).
 * They change month-to-month and should be updated via the API or a config file.
 */

export interface PersonBudget {
  nombre: string;         // Must match personal.nombre exactly
  presupuesto: number;    // Monthly budget ($)
}

export interface ProductTarget {
  nombre: string;
  meta: number;           // Monthly target (units)
  disponibles: number;    // Currently available (manual input)
}

export interface ControladorConfig {
  // ── Period info ──
  diasHabilesMes: number;        // Business days in the month
  diasEjecutados: number;        // Days executed so far (auto-computed if 0)
  metaGlobal: number;            // Overall monthly sales target

  // ── Personnel budgets ──
  dermatologia: PersonBudget[];  // PPTO TP C.E — Dermatología group
  medEstetica: PersonBudget[];   // PPTO TP C.E — Med Estética group
  lounge: PersonBudget[];        // PPTO TP LOUNGE

  // ── Product targets (manual) ──
  metaProductos: number;         // Monthly product sales target ($)
  facturadoProductos: number;    // Product sales invoiced so far ($)
  botox: ProductTarget;
  radiesse: ProductTarget;
  harmonyca: ProductTarget;
  skinvive: ProductTarget;
  belotero: {
    balance: ProductTarget;
    intense: ProductTarget;
    volume: ProductTarget;
    revive: ProductTarget;
  };
}

/**
 * Default config — ALL zeros.
 * 
 * Real values are loaded from the production database (employees, products)
 * and the app database (saved monthly configurations with presupuesto/meta).
 * 
 * This default is only used as a last-resort fallback when both databases
 * are unreachable.
 */
export const DEFAULT_CONFIG: ControladorConfig = {
  diasHabilesMes: 0,  // Auto-calculated from database
  diasEjecutados: 0,  // Auto-computed from date
  metaGlobal: 0,

  dermatologia: [],
  medEstetica: [],
  lounge: [],

  metaProductos: 0,
  facturadoProductos: 0,

  botox: { nombre: 'Botox', meta: 0, disponibles: 0 },
  radiesse: { nombre: 'Radiesse', meta: 0, disponibles: 0 },
  harmonyca: { nombre: 'Harmonyca', meta: 0, disponibles: 0 },
  skinvive: { nombre: 'Skinvive', meta: 0, disponibles: 0 },
  belotero: {
    balance: { nombre: 'Belotero Balance', meta: 0, disponibles: 0 },
    intense: { nombre: 'Belotero Intense', meta: 0, disponibles: 0 },
    volume: { nombre: 'Belotero Volume', meta: 0, disponibles: 0 },
    revive: { nombre: 'Belotero Revive', meta: 0, disponibles: 0 },
  },
};
