export interface DiaNoLaboral {
  id: number;
  fecha: string; // YYYY-MM-DD
  descripcion: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface DiasNoLaboralesResponse {
  success: boolean;
  data: DiaNoLaboral[];
}

export interface DiaNoLaboralResponse {
  success: boolean;
  data: DiaNoLaboral;
}

export interface AddSundaysResponse {
  success: boolean;
  message: string;
  inserted: number;
}
