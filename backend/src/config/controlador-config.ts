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
 * Default config based on the February 2026 reference file.
 */
export const DEFAULT_CONFIG: ControladorConfig = {
  diasHabilesMes: 24,
  diasEjecutados: 0,  // Will be auto-computed from date
  metaGlobal: 520_000_000,

  dermatologia: [
    { nombre: 'LUISA HERNANDEZ TEJADA', presupuesto: 80_000_000 },
    { nombre: 'DANIELA ASTAROT SALAZAR URIBE', presupuesto: 110_000_000 },
    { nombre: 'JURANY SANCHEZ', presupuesto: 110_000_000 },
    { nombre: 'PAULA ANDREA ARISTIZABAL DIAZ', presupuesto: 30_000_000 },
    { nombre: 'DAVID CHALARCA CANAS', presupuesto: 70_000_000 },
  ],

  medEstetica: [
    { nombre: 'MARIA CAMILA ZULUAGA ALVAREZ', presupuesto: 40_000_000 },
    { nombre: 'STEPHANIA LAGUADO GONZALEZ', presupuesto: 40_000_000 },
  ],

  lounge: [
    { nombre: 'LUISA FERNANDA CORREA HERNANDEZ', presupuesto: 8_000_000 },
    { nombre: 'YANED FAYSURI RESTREPO', presupuesto: 8_000_000 },
    { nombre: 'LINDA ELIANA AROCA LONDOÑO', presupuesto: 8_000_000 },
    { nombre: 'ISABELLA GONZALEZ MEJIA', presupuesto: 8_000_000 },
    { nombre: 'KAREN LORENA AMARIS GARCES', presupuesto: 8_000_000 },
  ],

  metaProductos: 60_000_000,
  facturadoProductos: 47_404_171,

  botox: { nombre: 'Botox', meta: 5000, disponibles: 12031 },
  radiesse: { nombre: 'Radiesse', meta: 20, disponibles: 46 },
  harmonyca: { nombre: 'Harmonyca', meta: 20, disponibles: 86 },
  skinvive: { nombre: 'Skinvive', meta: 17, disponibles: 2 },
  belotero: {
    balance: { nombre: 'AH Balance', meta: 10, disponibles: 40 },
    intense: { nombre: 'AH Intense', meta: 20, disponibles: 64 },
    volume: { nombre: 'AH Volume', meta: 4, disponibles: 19 },
    revive: { nombre: 'AH Revive', meta: 3, disponibles: 3 },
  },
};
