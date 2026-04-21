import { IpFicha } from '../ip.models';

export const FICHAS_INIT: Record<string, IpFicha> = {
  '1020304050': {
    estado: 'fidelizacion',
    ticket: 'alto',
    actividad: 'activo',
    notas: 'Interesada en rellenos labiales',
    origen: 'A1 · Pacientes Dormidos',
    modificadoPor: null,
    modificadoEn: null,
  },
  '1060708090': {
    estado: 'seguimiento',
    ticket: 'alto',
    actividad: 'activo',
    notas: 'Confirmó cita toxina',
    origen: 'A5 · Atenciones para Seguimiento',
    modificadoPor: null,
    modificadoEn: null,
  },
  '1050607080': {
    estado: 'fidelizacion',
    ticket: 'medio',
    actividad: 'en_riesgo',
    notas: 'Pendiente enviar info de bioestimuladores',
    origen: 'A2 · Oportunidades Cross-sell',
    modificadoPor: null,
    modificadoEn: null,
  },
  '1100102040': {
    estado: 'descartado',
    ticket: 'bajo',
    actividad: 'inactivo',
    notas: 'Intentos x3 sin respuesta',
    origen: 'Inteligencia de Pacientes',
    modificadoPor: null,
    modificadoEn: null,
  },
  '1070809010': {
    estado: 'extranjero',
    ticket: 'medio',
    actividad: 'en_riesgo',
    notas: 'Le interesa paquete prodeep',
    origen: 'A3 · Tratamientos Abandonados',
    modificadoPor: null,
    modificadoEn: null,
  },
};

export const ESTADO_CFG: Record<
  string,
  { label: string; color: string; bg: string }
> = {
  fidelizacion: { label: 'Fidelización', color: '#0984e3', bg: 'rgba(9,132,227,.1)' },
  seguimiento: { label: 'Seguimiento', color: '#00b894', bg: 'rgba(0,184,148,.1)' },
  extranjero: { label: 'Extranjero', color: '#6c63ff', bg: 'rgba(108,99,255,.1)' },
  descartado: { label: 'Descartado', color: '#b2bec3', bg: 'rgba(178,190,195,.15)' },
};

export const TICKET_CFG: Record<string, { label: string; color: string; bg: string }> = {
  alto: { label: 'Alto', color: '#d63031', bg: 'rgba(214,48,49,.1)' },
  medio: { label: 'Medio', color: '#e17055', bg: 'rgba(225,112,85,.1)' },
  bajo: { label: 'Bajo', color: '#0984e3', bg: 'rgba(9,132,227,.1)' },
};

export const ACTIVIDAD_CFG: Record<string, { label: string; color: string; bg: string }> = {
  activo: { label: 'Activo', color: '#00b894', bg: 'rgba(0,184,148,.1)' },
  en_riesgo: { label: 'En Riesgo', color: '#e17055', bg: 'rgba(225,112,85,.1)' },
  inactivo: { label: 'Inactivo', color: '#b2bec3', bg: 'rgba(178,190,195,.15)' },
};
