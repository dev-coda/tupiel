/** Claves de metas mensuales (alineadas con KPIs en cada vista). */
export type IpGoalMetricKey = string;

export type IpGoalMetricFormat = 'int' | 'money';

export interface IpGoalMetricDef {
  key: IpGoalMetricKey;
  label: string;
  format: IpGoalMetricFormat;
  hint?: string;
}

export interface IpGoalMetricGroup {
  id: string;
  label: string;
  metrics: IpGoalMetricDef[];
}

export const IP_GOAL_GROUPS: IpGoalMetricGroup[] = [
  {
    id: 'pacientes',
    label: 'Pacientes (lista actual con filtros)',
    metrics: [
      { key: 'pacientes_total', label: 'Total en lista', format: 'int' },
      { key: 'pacientes_valor', label: 'Valor total acumulado', format: 'money' },
      { key: 'pacientes_prom_visitas', label: 'Promedio de visitas', format: 'int' },
    ],
  },
  {
    id: 'agenda',
    label: 'Agenda (mes de métricas)',
    metrics: [
      { key: 'agenda_citas', label: 'Citas del mes', format: 'int', hint: 'Filtradas por mes + profesional/servicio' },
      { key: 'agenda_valor', label: 'Valor proyectado del mes', format: 'money' },
      { key: 'agenda_nuevos', label: 'Pacientes nuevos (sin historial)', format: 'int' },
      { key: 'agenda_dias', label: 'Días con al menos una cita', format: 'int' },
    ],
  },
  {
    id: 'gestion',
    label: 'Gestión comercial (fichas)',
    metrics: [
      { key: 'gestion_total', label: 'Total en seguimiento', format: 'int' },
      { key: 'gestion_fidelizacion', label: 'En fidelización', format: 'int' },
      { key: 'gestion_seguimiento', label: 'Seguimiento', format: 'int' },
      { key: 'gestion_extranjero', label: 'Extranjero', format: 'int' },
      { key: 'gestion_descartado', label: 'Descartados', format: 'int' },
    ],
  },
  {
    id: 'tareas',
    label: 'Tareas (mes de métricas, creadas en el mes)',
    metrics: [
      { key: 'tareas_nueva', label: 'Nuevas', format: 'int' },
      { key: 'tareas_pendiente', label: 'Pendientes', format: 'int' },
      { key: 'tareas_completado', label: 'Completadas', format: 'int' },
      { key: 'tareas_ganado', label: 'Ganadas', format: 'int' },
    ],
  },
  {
    id: 'alertas',
    label: 'Alertas de venta (lista filtrada actual)',
    metrics: [
      { key: 'alertas_a1', label: 'A1 Pacientes dormidos', format: 'int' },
      { key: 'alertas_a2', label: 'A2 Cross-sell', format: 'int' },
      { key: 'alertas_a3', label: 'A3 Tratamientos abandonados', format: 'int' },
      { key: 'alertas_a4', label: 'A4 Recompra por servicios', format: 'int' },
      { key: 'alertas_a5', label: 'A5 Seguimiento fidelización', format: 'int' },
    ],
  },
];
