export interface PersonMetrics {
  nombre: string;
  grupo: string;
  atenciones: number;
  venta: number;
  presupuesto: number;
  pctVenta: number;
  ventaIdeal: number;
  proyeccion: number;
  pctProyeccion: number;
  pendiente: number;
  pctEsperado: number;
}

export interface BusinessUnit {
  nombre: string;
  venta: number;
  meta: number;
  pctCumplimiento: number;
  faltaria: number;
}

export interface DailyMetrics {
  fecha: string;
  gestionComercial: number;
  facturado: number;
  cartera: number;
  serviciosPrestados: number;
  metaDia: number;
  pctCumplimiento: number;
}

export interface WeeklySummary {
  label: string;
  gestionComercial: number;
  serviciosPrestados: number;
}

export interface ProductMetrics {
  nombre: string;
  meta: number;
  vendidos: number;
  faltan: number;
  pctCumplimiento: number;
  ventaTotal: number;  // Total sales value in $
}

export interface ServiceSubcategoryMetrics {
  subCategoria: string;
  atenciones: number;
  venta: number;
  pctDelTotal: number;
}

export interface StrategyMetrics {
  metaGlobal: number;
  diasHabiles: number;
  diasEjecutados: number;
  facturado: number;
  proyeccion: number;
  ventaEsperada: number;
  faltaCumplir: number;
  resultadoEsperado: number;
  pctResultado: number;
  pctAlDia: number;
  pctRealCum: number;
  pctDiferencia: number;
  metaDiaria: number;
}

export interface DashboardData {
  generated_at: string;
  date_from: string;
  date_to: string;

  strategy: StrategyMetrics;
  businessUnits: BusinessUnit[];
  personnel: PersonMetrics[];
  dailyMetrics: DailyMetrics[];
  weeklySummaries: WeeklySummary[];
  products: ProductMetrics[];
  servicesBySubcategory: ServiceSubcategoryMetrics[];

  filterPagoSi: boolean;
  totalRegistrosRent: number;
  totalRegistrosEst: number;
  totalVlrRent: number;
  totalVlrEst: number;
  totalRentabilidad: number;
}
