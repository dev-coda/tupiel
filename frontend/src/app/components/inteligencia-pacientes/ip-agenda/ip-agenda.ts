import { Component, computed, effect, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ESTADO_CFG } from '../data/mock-fichas';
import { IpCitaAgenda, IpPaciente } from '../ip.models';
import { IpStateService } from '../ip-state.service';
import { ipDateShort, ipIniciales, ipMoney } from '../ip-utils';
import { IpModalFicha } from '../ip-modal-ficha/ip-modal-ficha';
import { IpMedifonySyncPanel } from '../ip-medifony-sync-panel/ip-medifony-sync-panel';
import { IpGoalProgress } from '../ip-goal-progress/ip-goal-progress';

const SUBCATS = ['Todas', 'INYECTABLES', 'RELLENOS', 'PRODEEP', 'BIOESTIMULADORES'];

const CROSS: Record<string, string[]> = {
  INYECTABLES: ['RELLENOS', 'BIOESTIMULADORES', 'PRODEEP'],
  RELLENOS: ['INYECTABLES', 'BIOESTIMULADORES'],
  PRODEEP: ['INYECTABLES', 'RELLENOS'],
  BIOESTIMULADORES: ['INYECTABLES', 'PRODEEP'],
};

const SUBCAT_COLOR: Record<string, { bg: string; color: string }> = {
  INYECTABLES: { bg: 'rgba(108,99,255,.12)', color: '#6c63ff' },
  RELLENOS: { bg: 'rgba(9,132,227,.12)', color: '#0984e3' },
  PRODEEP: { bg: 'rgba(0,184,148,.12)', color: '#00b894' },
  BIOESTIMULADORES: { bg: 'rgba(225,112,85,.12)', color: '#e17055' },
};

function calcCross(pac: IpPaciente | undefined): string[] {
  if (!pac?.subcategorias) return [];
  const out: string[] = [];
  pac.subcategorias.forEach((s) =>
    (CROSS[s] || []).forEach((r) => {
      if (!pac.subcategorias.includes(r) && !out.includes(r)) out.push(r);
    })
  );
  return out;
}

function formatFechaBanner(fecha: string): string {
  const d = new Date(fecha + 'T00:00:00');
  const hoy = new Date();
  hoy.setHours(0, 0, 0, 0);
  const man = new Date(hoy);
  man.setDate(hoy.getDate() + 1);
  const opts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  };
  if (d.getTime() === hoy.getTime()) {
    return 'Hoy · ' + d.toLocaleDateString('es-CO', opts);
  }
  if (d.getTime() === man.getTime()) {
    return 'Mañana · ' + d.toLocaleDateString('es-CO', opts);
  }
  return d.toLocaleDateString('es-CO', { ...opts, year: 'numeric' });
}

@Component({
  selector: 'app-ip-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule, IpModalFicha, IpMedifonySyncPanel, IpGoalProgress],
  templateUrl: './ip-agenda.html',
  styleUrl: './ip-agenda.scss',
})
export class IpAgenda {
  readonly st = inject(IpStateService);

  constructor() {
    effect(() => {
      const list = this.st.agenda();
      if (!list.length) return;
      const fechas = [...new Set(list.map((c) => c.fecha))].sort();
      this.openDias.update((o) => {
        if (Object.keys(o).length > 0) return o;
        return { [fechas[0]]: true };
      });
    });
  }

  profesional = signal('Todos');
  subcat = signal('Todas');
  openDias = signal<Record<string, boolean>>({});
  selectedCita = signal<IpCitaAgenda | null>(null);
  fichaModal = signal<IpPaciente | { nombre: string; doc: string } | null>(null);
  copiedCel = signal(false);
  importing = signal(false);

  subcats = SUBCATS;
  profesionales = computed(() => [
    'Todos',
    ...new Set(this.st.agenda().map((c) => c.profesional)),
  ]);
  estadoCfg = ESTADO_CFG;
  pacIndex = computed(() =>
    Object.fromEntries(this.st.pacientes().map((p) => [p.doc, p]))
  );
  subcatColor = SUBCAT_COLOR;

  fM = ipMoney;
  fD = ipDateShort;
  ini = ipIniciales;
  fFecha = formatFechaBanner;
  calcCross = calcCross;

  /** Citas del mes de métricas (barra superior) + filtros de vista. */
  filtered = computed(() => {
    const ym = this.st.metricsYm();
    let data = this.st.agenda().filter((c) => c.fecha.startsWith(ym));
    if (this.profesional() !== 'Todos') {
      data = data.filter((c) => c.profesional === this.profesional());
    }
    if (this.subcat() !== 'Todas') {
      data = data.filter((c) => c.subcategoria === this.subcat());
    }
    return data;
  });

  grouped = computed(() => {
    const map: Record<string, IpCitaAgenda[]> = {};
    this.filtered().forEach((c) => {
      if (!map[c.fecha]) map[c.fecha] = [];
      map[c.fecha].push(c);
    });
    return Object.entries(map).sort(([a], [b]) => a.localeCompare(b));
  });

  totalValor = computed(() =>
    this.filtered().reduce((s, c) => s + c.valor, 0)
  );

  totalNuevos = computed(() =>
    this.filtered().filter((c) => !this.pacIndex()[c.doc]).length
  );

  toggleDay(fecha: string) {
    this.openDias.update((o) => ({ ...o, [fecha]: !o[fecha] }));
  }

  selectCita(c: IpCitaAgenda) {
    const cur = this.selectedCita();
    this.selectedCita.set(cur?.id === c.id ? null : c);
  }

  abrirFicha(cita: IpCitaAgenda) {
    const pac = this.pacIndex()[cita.doc];
    this.fichaModal.set(pac || { nombre: cita.nombre, doc: cita.doc });
  }

  copiarCelular(celular: string) {
    void navigator.clipboard.writeText(celular).then(() => {
      this.copiedCel.set(true);
      setTimeout(() => this.copiedCel.set(false), 1500);
    });
  }

  porEspecialista(citas: IpCitaAgenda[]): Record<string, IpCitaAgenda[]> {
    return citas.reduce(
      (acc, c) => {
        if (!acc[c.profesional]) acc[c.profesional] = [];
        acc[c.profesional].push(c);
        return acc;
      },
      {} as Record<string, IpCitaAgenda[]>
    );
  }

  valorDia(citas: IpCitaAgenda[]): number {
    return citas.reduce((s, c) => s + c.valor, 0);
  }

  entriesPorProf(m: Record<string, IpCitaAgenda[]>): [string, IpCitaAgenda[]][] {
    return Object.entries(m);
  }

  valorProfesional(pcitas: IpCitaAgenda[]): number {
    return pcitas.reduce((s, c) => s + c.valor, 0);
  }

  nuevosProfCount(pcitas: IpCitaAgenda[]): number {
    const idx = this.pacIndex();
    return pcitas.filter((c) => !idx[c.doc]).length;
  }

  onImportAgenda(ev: Event) {
    const inp = ev.target as HTMLInputElement;
    const file = inp.files?.[0];
    inp.value = '';
    if (!file) return;
    this.importing.set(true);
    this.st
      .importAgendaExcel(file)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        error: (e) => console.error('Import agenda', e),
      });
  }
}
