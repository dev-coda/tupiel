export interface EstimadaRow {
  atencion: number;
  registro: number;
  fecha_realizacion_o_programada: string;
  doc_paciente: string;
  nombre_paciente: string;
  personal_atiende: string;
  codigo_cups: string;
  cups: string;
  sub_categoria: string;
  categoria: string;
  dispositivo: string;
  vlr: number;
  vlr_comisiones: number;
  vlr_insumos: number;
  costo_adicional: number;
  rentabilidad_insumos: number;
  rentabilidad_equipos: number;
  rentabilidad_ips: number;
  rentabilidad_total: number;
  rentabilidad_porcentaje: number | string;
  pendiente_registrar: string;
  fecha_facturacion: string;
  pagado_este_mes: string;
  procedencia_recomendacion: string;
  edad_paciente: number | null;
  numero_factura: string;
}

export interface EstimadaTotals {
  vlr: number;
  vlr_comisiones: number;
  vlr_insumos: number;
  costo_adicional: number;
  rentabilidad_insumos: number;
  rentabilidad_equipos: number;
  rentabilidad_ips: number;
  rentabilidad_total: number;
  rentabilidad_porcentaje: number;
}

export interface EstimadaReport {
  generated_at: string;
  date_from: string;
  date_to: string;
  rows: EstimadaRow[];
  totals: EstimadaTotals;
}
