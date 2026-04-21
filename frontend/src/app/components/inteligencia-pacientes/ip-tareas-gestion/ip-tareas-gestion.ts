import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ESTADO_CFG, TICKET_CFG, ACTIVIDAD_CFG } from '../data/mock-fichas';
import { IpFicha, IpPaciente } from '../ip.models';
import { IpStateService } from '../ip-state.service';
import { ipDateShort, ipDiasDesde, ipIniciales, ipMoney } from '../ip-utils';
import { IpModalFicha } from '../ip-modal-ficha/ip-modal-ficha';
import { IpGoalProgress } from '../ip-goal-progress/ip-goal-progress';
import { switchMap } from 'rxjs';

const ESTADOS = [
  { key: 'todos', label: 'Todos', color: 'var(--ip-text3)', bg: 'var(--ip-line2)' },
  { key: 'fidelizacion', label: 'En Fidelización', color: '#0984e3', bg: 'rgba(9,132,227,.1)' },
  { key: 'seguimiento', label: 'Seguimiento', color: '#00b894', bg: 'rgba(0,184,148,.1)' },
  { key: 'extranjero', label: 'Extranjero', color: '#6c63ff', bg: 'rgba(108,99,255,.1)' },
  { key: 'descartado', label: 'Descartado', color: '#b2bec3', bg: 'rgba(178,190,195,.15)' },
];

@Component({
  selector: 'app-ip-tareas-gestion',
  standalone: true,
  imports: [CommonModule, IpModalFicha, IpGoalProgress],
  templateUrl: './ip-tareas-gestion.html',
  styleUrl: './ip-tareas-gestion.scss',
})
export class IpTareasGestion {
  readonly st = inject(IpStateService);

  filtroEstado = signal('todos');
  expanded = signal<Record<string, boolean>>({});
  modalPac = signal<IpPaciente | null>(null);
  copiedCel = signal(false);

  estados = ESTADOS;
  estadoCfg = ESTADO_CFG;
  ticketCfg = TICKET_CFG;
  actividadCfg = ACTIVIDAD_CFG;
  pacIndex = computed(() =>
    Object.fromEntries(this.st.pacientes().map((p) => [p.doc, p]))
  );

  fD = ipDateShort;
  fM = ipMoney;
  diasDesde = ipDiasDesde;
  ini = ipIniciales;

  hojaKpis(p: IpPaciente & { ficha: IpFicha }) {
    const pac = this.pacIndex()[p.doc] || p;
    return [
      { l: 'Edad', v: pac.edad ? pac.edad + ' años' : '—' },
      { l: 'Procedencia', v: pac.procedencia || '—' },
      { l: 'Visitas', v: String(pac.visitas ?? '—') },
      { l: 'Valor Total', v: pac.valor_total ? this.fM(pac.valor_total) : '—' },
      {
        l: 'Primera Visita',
        v: pac.historial?.length ? this.fD(pac.historial[pac.historial.length - 1].fecha) : '—',
      },
      { l: 'Última Visita', v: pac.ultima ? this.fD(pac.ultima) : '—' },
    ];
  }

  pacientesConFicha = computed(() => {
    const fichas = this.st.fichas();
    const fe = this.filtroEstado();
    return this.st
      .pacientes()
      .filter((p) => fichas[p.doc])
      .map((p) => ({ ...p, ficha: fichas[p.doc], dias: ipDiasDesde(p.ultima) }))
      .filter((p) => fe === 'todos' || p.ficha.estado === fe)
      .sort((a, b) => {
        const orden: Record<string, number> = {
          fidelizacion: 0,
          cita: 1,
          descartado: 2,
        };
        return (orden[a.ficha.estado] ?? 3) - (orden[b.ficha.estado] ?? 3);
      });
  });

  conteos = computed(() => {
    const c = {
      todos: 0,
      fidelizacion: 0,
      seguimiento: 0,
      extranjero: 0,
      descartado: 0,
    };
    Object.values(this.st.fichas()).forEach((f) => {
      c.todos++;
      switch (f.estado) {
        case 'fidelizacion':
          c.fidelizacion++;
          break;
        case 'seguimiento':
          c.seguimiento++;
          break;
        case 'extranjero':
          c.extranjero++;
          break;
        case 'descartado':
          c.descartado++;
          break;
      }
    });
    return c;
  });

  auditoriaRows = computed(() =>
    Object.entries(this.st.fichas()).filter(([, f]) => f.modificadoPor)
  );

  toggleExpand(doc: string) {
    this.expanded.update((ex) => ({ ...ex, [doc]: !ex[doc] }));
  }

  isExpanded(doc: string): boolean {
    return !!this.expanded()[doc];
  }

  enviarATareas(pac: IpPaciente & { ficha: IpFicha }) {
    const ficha = this.st.fichas()[pac.doc];
    this.st
      .crearTarea({
        pacDoc: pac.doc,
        pacNombre: pac.nombre,
        pacCelular: pac.celular || '',
        pacValor: pac.valor_total || 0,
        pacServicios: pac.subcategorias || [],
        fichaNotas: ficha?.notas || '',
        fichaTicket: ficha?.ticket || '',
        fichaActividad: ficha?.actividad || '',
        fichaOrigen: ficha?.origen || '',
        tipo: '',
        descripcion: '',
        estado: 'nueva',
        creadoPor: this.st.user()?.username || 'admin',
        contacto1_fecha: '',
        contacto1_nota: '',
        contacto2_fecha: '',
        contacto2_nota: '',
        contacto3_fecha: '',
        contacto3_nota: '',
        citaAgendada: false,
      })
      .pipe(switchMap(() => this.st.removeFicha(pac.doc)))
      .subscribe({ next: () => this.st.navigate('actividades') });
  }

  openModal(p: IpPaciente) {
    this.modalPac.set(p);
  }

  copiarCel(cel: string) {
    void navigator.clipboard.writeText(cel).then(() => {
      this.copiedCel.set(true);
      setTimeout(() => this.copiedCel.set(false), 1500);
    });
  }

  conteoPill(key: string): number {
    const c = this.conteos();
    switch (key) {
      case 'todos':
        return c.todos;
      case 'fidelizacion':
        return c.fidelizacion;
      case 'seguimiento':
        return c.seguimiento;
      case 'extranjero':
        return c.extranjero;
      case 'descartado':
        return c.descartado;
      default:
        return 0;
    }
  }
}
