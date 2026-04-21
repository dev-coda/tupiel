import { Component, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ESTADO_CFG } from '../data/mock-fichas';
import { IpPaciente } from '../ip.models';
import { IpStateService } from '../ip-state.service';
import {
  ipDateShort,
  ipDiasDesde,
  ipIniciales,
  ipMoney,
} from '../ip-utils';
import { IpModalFicha } from '../ip-modal-ficha/ip-modal-ficha';
import { IpMedifonySyncPanel } from '../ip-medifony-sync-panel/ip-medifony-sync-panel';
import { IpGoalProgress } from '../ip-goal-progress/ip-goal-progress';

const SUBCATS = ['Todas', 'INYECTABLES', 'RELLENOS', 'PRODEEP', 'BIOESTIMULADORES'];
const PP = 10;

@Component({
  selector: 'app-ip-pacientes',
  standalone: true,
  imports: [CommonModule, FormsModule, IpModalFicha, IpMedifonySyncPanel, IpGoalProgress],
  templateUrl: './ip-pacientes.html',
  styleUrl: './ip-pacientes.scss',
})
export class IpPacientes {
  readonly st = inject(IpStateService);
  readonly Math = Math;

  search = signal('');
  subcat = signal('Todas');
  profesional = signal('Todos');
  sortCol = signal<string>('ultima');
  sortDir = signal<'asc' | 'desc'>('desc');
  page = signal(1);
  selected = signal<IpPaciente | null>(null);
  fichaModal = signal<IpPaciente | null>(null);
  copiedCel = signal(false);
  importing = signal(false);

  subcats = SUBCATS;
  profesionales = computed(() => [
    'Todos',
    ...new Set(this.st.pacientes().map((p) => p.profesional)),
  ]);
  estadoCfg = ESTADO_CFG;

  fM = ipMoney;
  fD = ipDateShort;
  diasDesde = ipDiasDesde;
  ini = ipIniciales;

  filtered = computed(() => {
    let data = [...this.st.pacientes()];
    const q = this.search().trim().toLowerCase();
    if (q) {
      data = data.filter(
        (p) =>
          p.nombre.toLowerCase().includes(q) ||
          p.doc.includes(q) ||
          p.celular.includes(q)
      );
    }
    if (this.subcat() !== 'Todas') {
      data = data.filter((p) => p.subcategorias.includes(this.subcat()));
    }
    if (this.profesional() !== 'Todos') {
      data = data.filter((p) => p.profesional === this.profesional());
    }
    const sortCol = this.sortCol();
    const sortDir = this.sortDir();
    data.sort((a, b) => {
      let av: string | number | Date = a[sortCol as keyof IpPaciente] as never;
      let bv: string | number | Date = b[sortCol as keyof IpPaciente] as never;
      if (sortCol === 'ultima') {
        av = new Date(av as string);
        bv = new Date(bv as string);
      }
      if (sortCol === 'gestion') {
        return 0;
      }
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return data;
  });

  totalPages = computed(() => Math.ceil(this.filtered().length / PP));

  pageNums = computed(() =>
    Array.from({ length: this.totalPages() }, (_, i) => i + 1)
  );

  paginated = computed(() => {
    const p = this.page();
    const f = this.filtered();
    return f.slice((p - 1) * PP, p * PP);
  });

  stats = computed(() => {
    const filtered = this.filtered();
    return {
      total: filtered.length,
      valor: filtered.reduce((s, p) => s + p.valor_total, 0),
      visitas: filtered.length
        ? Math.round(
            filtered.reduce((s, p) => s + p.visitas, 0) / filtered.length
          )
        : 0,
    };
  });

  diasColor(d: number): string {
    if (d <= 30) return 'var(--ip-green)';
    if (d <= 60) return 'var(--ip-blue)';
    if (d <= 120) return 'var(--ip-amber)';
    return 'var(--ip-red)';
  }

  handleSort(col: string) {
    if (col === 'gestion') return;
    if (this.sortCol() === col) {
      this.sortDir.set(this.sortDir() === 'asc' ? 'desc' : 'asc');
    } else {
      this.sortCol.set(col);
      this.sortDir.set('desc');
    }
    this.page.set(1);
  }

  toggleSelect(p: IpPaciente) {
    const s = this.selected();
    this.selected.set(s?.doc === p.doc ? null : p);
  }

  copyCelular(ev: Event, celular: string) {
    ev.stopPropagation();
    void navigator.clipboard.writeText(celular).then(() => {
      this.copiedCel.set(true);
      setTimeout(() => this.copiedCel.set(false), 1500);
    });
  }

  onImportPacientes(ev: Event) {
    const inp = ev.target as HTMLInputElement;
    const file = inp.files?.[0];
    inp.value = '';
    if (!file) return;
    this.importing.set(true);
    this.st
      .importPacientesExcel(file)
      .pipe(finalize(() => this.importing.set(false)))
      .subscribe({
        error: (e) => console.error('Import pacientes', e),
      });
  }
}
