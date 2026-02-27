export interface RentabilidadRow {
  atencion: number;
  registro: number;
  fecha_realizacion: string;
  doc_paciente: string;
  nombre_paciente: string;
  personal_atiende: string;
  codigo_cups: string;
  cups: string;
  sub_categoria: string;
  categoria: string;
  dispositivo: string;
  vlr: number;
  costo_comisiones: number;
  costo_insumos: number;
  costo_bancario: number;
  costo_adicional: number;
  rentabilidad_insumos: number;
  rentabilidad_equipos: number;
  rentabilidad_total: number;
  promedio_porcentaje: number;
  observaciones: string;
  fecha_facturacion: string;
  pagado_este_mes: string;
  procedencia_recomendacion: string;
  edad_paciente: number | null;
  numero_factura: string;
  paciente_pais_origen: string;
  paciente_celular: string;
}

export interface RentabilidadTotals {
  vlr: number;
  costo_comisiones: number;
  costo_insumos: number;
  costo_bancario: number;
  costo_adicional: number;
  rentabilidad_insumos: number;
  rentabilidad_equipos: number;
  rentabilidad_total: number;
  promedio_porcentaje: number;
}

export interface RentabilidadReport {
  generated_at: string;
  date_from: string;
  date_to: string;
  rows: RentabilidadRow[];
  totals: RentabilidadTotals;
}
