import { IpCitaAgenda } from '../ip.models';

export const MOCK_AGENDA: IpCitaAgenda[] = [
  // HOY — mezcla de nuevos e historial
  { id: 1,  fecha: '2026-04-08', hora: '08:00', doc: '1020304050', nombre: 'Andrea Martínez López',   profesional: 'Dra. Sofía Ramírez', cups: 'TOX001', subcategoria: 'INYECTABLES',     valor: 350000 },
  { id: 2,  fecha: '2026-04-08', hora: '09:00', doc: '9990000001', nombre: 'Isabella Romero Parra',   profesional: 'Dra. Sofía Ramírez', cups: 'REL002', subcategoria: 'RELLENOS',        valor: 800000 },
  { id: 3,  fecha: '2026-04-08', hora: '10:00', doc: '1080900020', nombre: 'Daniela Quintero Mejía',  profesional: 'Dr. Carlos Vega',    cups: 'TOX001', subcategoria: 'INYECTABLES',     valor: 350000 },
  { id: 4,  fecha: '2026-04-08', hora: '11:00', doc: '9990000002', nombre: 'Sofía Mendez Torres',     profesional: 'Dr. Carlos Vega',    cups: 'BIO003', subcategoria: 'BIOESTIMULADORES', valor: 600000 },
  { id: 5,  fecha: '2026-04-08', hora: '14:00', doc: '1090001030', nombre: 'Natalia Ospina Arango',   profesional: 'Dra. Sofía Ramírez', cups: 'REL002', subcategoria: 'RELLENOS',        valor: 800000 },
  { id: 6,  fecha: '2026-04-08', hora: '15:30', doc: '9990000003', nombre: 'Luciana Vargas Gil',      profesional: 'Dra. Sofía Ramírez', cups: 'TOX001', subcategoria: 'INYECTABLES',     valor: 350000 },

  // MAÑANA
  { id: 7,  fecha: '2026-04-09', hora: '08:30', doc: '1040506070', nombre: 'Valentina Torres Ruiz',   profesional: 'Dr. Carlos Vega',    cups: 'TOX001', subcategoria: 'INYECTABLES',     valor: 350000 },
  { id: 8,  fecha: '2026-04-09', hora: '10:00', doc: '9990000004', nombre: 'Mariana Calle Suárez',    profesional: 'Dra. Sofía Ramírez', cups: 'PRO004', subcategoria: 'PRODEEP',         valor: 450000 },
  { id: 9,  fecha: '2026-04-09', hora: '11:00', doc: '1160708000', nombre: 'Carolina Henao Vélez',    profesional: 'Dr. Carlos Vega',    cups: 'TOX001', subcategoria: 'INYECTABLES',     valor: 350000 },
  { id: 10, fecha: '2026-04-09', hora: '14:30', doc: '9990000005', nombre: 'Daniela Soto Ríos',       profesional: 'Dr. Carlos Vega',    cups: 'REL002', subcategoria: 'RELLENOS',        valor: 800000 },

  // JUEVES
  { id: 11, fecha: '2026-04-10', hora: '09:00', doc: '1030405060', nombre: 'Claudia Ríos Herrera',    profesional: 'Dra. Sofía Ramírez', cups: 'PRO004', subcategoria: 'PRODEEP',         valor: 450000 },
  { id: 12, fecha: '2026-04-10', hora: '10:30', doc: '1110203050', nombre: 'Camila Salcedo Díaz',     profesional: 'Dr. Carlos Vega',    cups: 'REL002', subcategoria: 'RELLENOS',        valor: 800000 },
  { id: 13, fecha: '2026-04-10', hora: '12:00', doc: '9990000006', nombre: 'Paula Jiménez Mora',      profesional: 'Dra. Sofía Ramírez', cups: 'BIO003', subcategoria: 'BIOESTIMULADORES', valor: 600000 },
  { id: 14, fecha: '2026-04-10', hora: '15:00', doc: '1140506080', nombre: 'Gloria Inés Restrepo',    profesional: 'Dra. Sofía Ramírez', cups: 'BIO003', subcategoria: 'BIOESTIMULADORES', valor: 600000 },
]
