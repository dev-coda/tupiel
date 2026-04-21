export type IpViewId =
  | 'pacientes'
  | 'agenda'
  | 'alertas'
  | 'tareas'
  | 'actividades'
  | 'reportes'
  | 'metas'
  | 'usuarios';

export interface IpUser {
  username: string;
  nombre: string;
  rol: 'admin' | 'operario';
  avatar: string;
  cargo: string;
}

export interface IpHistoriaCita {
  fecha: string;
  cups: string;
  subcategoria: string;
  profesional: string;
  valor: number;
}

export interface IpPaciente {
  doc: string;
  nombre: string;
  celular: string;
  edad: number;
  procedencia: string;
  valor_total: number;
  visitas: number;
  ultima: string;
  subcategorias: string[];
  profesional: string;
  historial: IpHistoriaCita[];
}

export interface IpCitaAgenda {
  id: number;
  fecha: string;
  hora: string;
  doc: string;
  nombre: string;
  profesional: string;
  cups: string;
  subcategoria: string;
  valor: number;
}

export type IpFichaEstado = 'fidelizacion' | 'seguimiento' | 'extranjero' | 'descartado';
export type IpTicket = 'alto' | 'medio' | 'bajo';
export type IpActividad = 'activo' | 'en_riesgo' | 'inactivo';

export interface IpFicha {
  estado: IpFichaEstado;
  ticket: IpTicket;
  actividad: IpActividad;
  notas: string;
  origen?: string | null;
  modificadoPor?: string | null;
  modificadoEn?: string | null;
}

export type IpTareaEstado = 'nueva' | 'pendiente' | 'completado' | 'ganado';

export interface IpTarea {
  id: number;
  tipo: string;
  pacDoc: string;
  pacNombre: string;
  pacCelular: string;
  pacValor: number;
  pacServicios: string[];
  fichaNotas: string;
  fichaTicket: string;
  fichaActividad: string;
  fichaOrigen: string;
  descripcion: string;
  estado: IpTareaEstado;
  contacto1_fecha: string;
  contacto1_nota: string;
  contacto2_fecha: string;
  contacto2_nota: string;
  contacto3_fecha: string;
  contacto3_nota: string;
  citaAgendada: boolean;
  fechaCreacion: string;
  creadoPor: string;
  asignadoA?: string;
  prioridad?: string;
}

