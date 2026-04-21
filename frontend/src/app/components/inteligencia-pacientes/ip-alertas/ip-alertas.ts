import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ESTADO_CFG } from '../data/mock-fichas';
import { IpFicha, IpPaciente } from '../ip.models';
import { IpStateService } from '../ip-state.service';
import { ipDateShort, ipDiasDesde, ipIniciales, ipMoney } from '../ip-utils';
import { IpModalFicha } from '../ip-modal-ficha/ip-modal-ficha';
import { IpGoalProgress } from '../ip-goal-progress/ip-goal-progress';

const CROSS: Record<string, string[]> = {
  INYECTABLES: ['RELLENOS', 'BIOESTIMULADORES', 'PRODEEP'],
  RELLENOS: ['INYECTABLES', 'BIOESTIMULADORES'],
  PRODEEP: ['INYECTABLES', 'RELLENOS'],
  BIOESTIMULADORES: ['INYECTABLES', 'PRODEEP'],
};

const SUBCATS = ['Todas', 'INYECTABLES', 'RELLENOS', 'PRODEEP', 'BIOESTIMULADORES'];
const CUPS_LIST = ['Todos', 'TOX001', 'REL002', 'PRO004', 'BIO003'];
const CUPS_SUBCAT: Record<string, string> = {
  TOX001: 'INYECTABLES',
  REL002: 'RELLENOS',
  PRO004: 'PRODEEP',
  BIO003: 'BIOESTIMULADORES',
};

const DIAS_DORMIDO = 60;
const DIAS_RECOMPRA = 60;
const DIAS_ABANDONO = 30;
const SESIONES_MIN = 2;

export type IpAlertasA3Row = IpPaciente & { subcat: string; sesiones: number; dias: number };
export type IpAlertasA5Row = IpPaciente & { ficha: IpFicha };

@Component({
  selector: 'app-ip-alertas',
  standalone: true,
  imports: [CommonModule, FormsModule, IpModalFicha, IpGoalProgress],
  templateUrl: './ip-alertas.html',
  styleUrl: './ip-alertas.scss',
})
export class IpAlertas {
  readonly st = inject(IpStateService);

  open = signal<Record<string, boolean>>({
    a1: true,
    a2: false,
    a3: false,
    a4: false,
    a5: false,
  });
  refreshing = signal<Record<string, boolean>>({
    a1: false,
    a2: false,
    a3: false,
    a4: false,
    a5: false,
  });
  fichaModal = signal<{ pac: IpPaciente; origen: string } | null>(null);
  expanded = signal<Record<string, boolean>>({});
  copiedKey = signal<string | null>(null);

  f5 = signal({ actividad: 'Todas' as string });
  f1 = signal({ dias: '', valorMin: '', profesional: 'Todos' });
  f2 = signal({ dias: '', valorMin: '', profesional: 'Todos' });
  f3 = signal({ sesiones: '', subcat: 'Todas', profesional: 'Todos' });
  f4 = signal({ cups: 'Todos', subcat: 'Todas', dias: '', profesional: 'Todos' });

  estadoCfg = ESTADO_CFG;
  subcats = SUBCATS;
  cupsList = CUPS_LIST;
  profesionales = computed(() => [
    'Todos',
    ...new Set(this.st.pacientes().map((p) => p.profesional)),
  ]);

  fM = ipMoney;
  fD = ipDateShort;
  ini = ipIniciales;
  diasDesde = ipDiasDesde;

  a5base = computed(() => {
    const fichas = this.st.fichas();
    const pacList = this.st.pacientes();
    return Object.entries(fichas)
      .map(([doc, ficha]) => {
        const pac = pacList.find((p) => p.doc === doc);
        if (!pac || ficha.estado !== 'fidelizacion') return null;
        return { ...pac, ficha } as IpAlertasA5Row;
      })
      .filter((x): x is IpAlertasA5Row => x !== null)
      .sort((a, b) => {
        const orden: Record<string, number> = { alto: 0, medio: 1, bajo: 2 };
        return (orden[a.ficha.ticket] ?? 3) - (orden[b.ficha.ticket] ?? 3);
      });
  });

  a5 = computed(() => {
    let d = this.a5base();
    if (this.f5().actividad !== 'Todas') {
      d = d.filter((p) => p.ficha.actividad === this.f5().actividad);
    }
    return d;
  });

  a1base = computed(() =>
    this.st
      .pacientes()
      .map((p) => ({ ...p, dias: ipDiasDesde(p.ultima) }))
      .filter((p) => p.dias >= DIAS_DORMIDO)
      .sort((a, b) => b.dias - a.dias)
  );

  a2base = computed(() =>
    this.st.pacientes().map((p) => {
      const sugeridas: string[] = [];
      p.subcategorias.forEach((s) => {
        (CROSS[s] || []).forEach((r) => {
          if (!p.subcategorias.includes(r) && !sugeridas.includes(r)) sugeridas.push(r);
        });
      });
      return { ...p, sugeridas, dias: ipDiasDesde(p.ultima) };
    })
      .filter((p) => p.sugeridas.length > 0 && ipDiasDesde(p.ultima) <= 180)
      .sort((a, b) => b.valor_total - a.valor_total)
  );

  a3base = computed(() => {
    const rows: IpAlertasA3Row[] = [];
    this.st.pacientes().forEach((p) => {
      const counts: Record<string, number> = {};
      p.subcategorias.forEach((s) => {
        counts[s] = (counts[s] || 0) + 1;
      });
      Object.entries(counts).forEach(([subcat, sesiones]) => {
        if (sesiones >= SESIONES_MIN && ipDiasDesde(p.ultima) >= DIAS_ABANDONO) {
          rows.push({
            ...p,
            subcat,
            sesiones,
            dias: ipDiasDesde(p.ultima),
          });
        }
      });
    });
    return rows.sort((a, b) => b.dias - a.dias);
  });

  a4base = computed(() =>
    this.st
      .pacientes()
      .filter((p) => p.visitas >= SESIONES_MIN && ipDiasDesde(p.ultima) >= DIAS_RECOMPRA)
      .map((p) => ({ ...p, dias: ipDiasDesde(p.ultima) }))
      .sort((a, b) => b.valor_total - a.valor_total)
  );

  a1 = computed(() => {
    let d = this.a1base();
    const f = this.f1();
    if (f.dias) d = d.filter((p) => p.dias >= Number(f.dias));
    if (f.valorMin) d = d.filter((p) => p.valor_total >= Number(f.valorMin));
    if (f.profesional !== 'Todos') d = d.filter((p) => p.profesional === f.profesional);
    return d;
  });

  a2 = computed(() => {
    let d = this.a2base();
    const f = this.f2();
    if (f.dias) d = d.filter((p) => p.dias >= Number(f.dias));
    if (f.valorMin) d = d.filter((p) => p.valor_total >= Number(f.valorMin));
    if (f.profesional !== 'Todos') d = d.filter((p) => p.profesional === f.profesional);
    return d;
  });

  a3 = computed(() => {
    let d = this.a3base();
    const f = this.f3();
    if (f.sesiones) d = d.filter((p) => p.sesiones >= Number(f.sesiones));
    if (f.subcat !== 'Todas') d = d.filter((p) => p.subcat === f.subcat);
    if (f.profesional !== 'Todos') d = d.filter((p) => p.profesional === f.profesional);
    return d;
  });

  a4 = computed(() => {
    let d = this.a4base();
    const f = this.f4();
    if (f.cups !== 'Todos') d = d.filter((p) => p.subcategorias.includes(CUPS_SUBCAT[f.cups]));
    if (f.subcat !== 'Todas') d = d.filter((p) => p.subcategorias.includes(f.subcat));
    if (f.dias) d = d.filter((p) => p.dias >= Number(f.dias));
    if (f.profesional !== 'Todos') d = d.filter((p) => p.profesional === f.profesional);
    return d;
  });

  toggle(k: string) {
    this.open.update((o) => ({ ...o, [k]: !o[k] }));
  }

  handleRefresh(k: string) {
    this.refreshing.update((r) => ({ ...r, [k]: true }));
    setTimeout(() => this.refreshing.update((r) => ({ ...r, [k]: false })), 700);
  }

  expandKey(sec: string, doc: string, i: number): string {
    return `${sec}-${doc}-${i}`;
  }

  toggleExpand(key: string) {
    this.expanded.update((e) => ({ ...e, [key]: !e[key] }));
  }

  isExpanded(key: string): boolean {
    return !!this.expanded()[key];
  }

  copiarCel(key: string, cel: string) {
    void navigator.clipboard.writeText(cel).then(() => {
      this.copiedKey.set(key);
      setTimeout(() => this.copiedKey.set(null), 1500);
    });
  }

  abrirFicha(pac: IpPaciente, origen: string) {
    this.fichaModal.set({ pac, origen });
  }

  readonly f5ActividadOpts = ['Todas', 'activo', 'en_riesgo', 'inactivo'] as const;

  readonly actividadLabel: Record<string, string> = {
    activo: 'Activo',
    en_riesgo: 'En Riesgo',
    inactivo: 'Inactivo',
  };

  f5ActividadLabel(v: string): string {
    if (v === 'Todas') return 'Todas';
    return this.actividadLabel[v] ?? v;
  }
  readonly actividadColor: Record<string, string> = {
    activo: '#00b894',
    en_riesgo: '#e17055',
    inactivo: '#b2bec3',
  };
  readonly ticketColor: Record<string, string> = {
    alto: '#d63031',
    medio: '#e17055',
    bajo: '#0984e3',
  };
}
