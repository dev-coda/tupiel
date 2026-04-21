import { Component, computed, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IpTarea } from '../ip.models';
import { IpStateService } from '../ip-state.service';
import { ipDateMed, ipMoney } from '../ip-utils';
import { IpModalTarea } from './ip-modal-tarea';
import { IpModalHojaVida } from './ip-modal-hoja-vida';
import { IpGoalProgress } from '../ip-goal-progress/ip-goal-progress';


const TIPOS: { key: string; label: string; icon: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'campana_mercadeo', label: 'Campaña Mercadeo', icon: '📣' },
  { key: 'email', label: 'Email', icon: '✉️' },
  { key: 'seguimiento_especializado', label: 'Seg. Especializado', icon: '🎯' },
  { key: 'foco_paciente', label: 'Foco Paciente', icon: '⭐' },
];
const TIPO_MAP: Record<string, (typeof TIPOS)[0]> = Object.fromEntries(TIPOS.map((t) => [t.key, t]));
const TIPO_ICON_LEGACY: Record<string, string> = { llamada: '📞', seguimiento: '👁' };

const ESTADO_TAREA: Record<string, { color: string; bg: string; label: string }> = {
  nueva: { color: '#d63031', bg: 'rgba(214,48,49,.1)', label: '⚡ Nueva' },
  pendiente: { color: '#e17055', bg: 'rgba(225,112,85,.1)', label: 'Pendiente' },
  completado: { color: '#00b894', bg: 'rgba(0,184,148,.1)', label: 'Completado' },
  ganado: { color: '#6c63ff', bg: 'rgba(108,99,255,.1)', label: 'Ganado 🎉' },
};

const ESTADO_ORDER: Record<string, number> = {
  nueva: 0,
  pendiente: 1,
  completado: 2,
  ganado: 3,
};

/** Seeded tasks use asignadoA "operario" as a shared pool; assigned tasks use a real username */
function tareaVisibleParaOperario(
  t: IpTarea,
  username: string
): boolean {
  const a = (t.asignadoA ?? '').trim();
  return a === username || a === 'operario' || a === '';
}

const TICKET_COLOR: Record<string, string> = {
  alto: '#d63031',
  medio: '#e17055',
  bajo: '#0984e3',
};
const TICKET_LABEL: Record<string, string> = { alto: 'Alto', medio: 'Medio', bajo: 'Bajo' };
const ACTIV_COLOR: Record<string, string> = {
  activo: '#00b894',
  en_riesgo: '#e17055',
  inactivo: '#b2bec3',
};
const ACTIV_LABEL: Record<string, string> = {
  activo: 'Activo',
  en_riesgo: 'En Riesgo',
  inactivo: 'Inactivo',
};

@Component({
  selector: 'app-ip-actividades',
  standalone: true,
  imports: [CommonModule, IpModalTarea, IpModalHojaVida, IpGoalProgress],
  templateUrl: './ip-actividades.html',
  styleUrl: './ip-actividades.scss',
})
export class IpActividades {
  readonly st = inject(IpStateService);

  filtro = signal('todos');
  modalTarea = signal<Partial<IpTarea> | null>(null);
  hojaVidaDoc = signal<string | null>(null);
  showInforme = signal(false);

  fM = ipMoney;
  fD = ipDateMed;
  tipoMap = TIPO_MAP;
  tipoLegacy = TIPO_ICON_LEGACY;
  estadoTarea = ESTADO_TAREA;
  ticketColor = TICKET_COLOR;
  ticketLabel = TICKET_LABEL;
  activColor = ACTIV_COLOR;
  activLabel = ACTIV_LABEL;
  pacIndex = computed(() =>
    Object.fromEntries(this.st.pacientes().map((p) => [p.doc, p]))
  );

  tareasVis = computed(() => {
    const ym = this.st.metricsYm();
    let d = this.st
      .tareas()
      .filter((t) => (t.fechaCreacion || '').startsWith(ym));
    const u = this.st.user();
    if (u?.rol === 'operario') {
      d = d.filter((t) => tareaVisibleParaOperario(t, u.username));
    }
    const f = this.filtro();
    if (f === 'nueva') d = d.filter((t) => t.estado === 'nueva');
    if (f === 'pendiente') d = d.filter((t) => t.estado === 'pendiente');
    if (f === 'completado') d = d.filter((t) => t.estado === 'completado');
    if (f === 'ganado') d = d.filter((t) => t.estado === 'ganado');
    return d.sort(
      (a, b) => (ESTADO_ORDER[a.estado] ?? 1) - (ESTADO_ORDER[b.estado] ?? 1)
    );
  });

  /** Agrupa tareas por paciente (acordeón) manteniendo el orden de aparición. */
  tareasPorPaciente = computed(() => {
    const list = this.tareasVis();
    const order: string[] = [];
    const map = new Map<string, IpTarea[]>();
    for (const t of list) {
      const key = `${t.pacDoc || '—'}::${t.pacNombre || ''}`;
      if (!map.has(key)) {
        order.push(key);
        map.set(key, []);
      }
      map.get(key)!.push(t);
    }
    return order.map((key) => {
      const tareas = map.get(key)!;
      const first = tareas[0];
      return {
        key,
        doc: first.pacDoc,
        nombre: first.pacNombre,
        tareas,
      };
    });
  });

  conteos = computed(() => {
    const ym = this.st.metricsYm();
    const u = this.st.user();
    let base = this.st.tareas().filter((t) => (t.fechaCreacion || '').startsWith(ym));
    if (u?.rol === 'operario') {
      base = base.filter((t) => tareaVisibleParaOperario(t, u.username));
    }
    return {
      todos: base.length,
      nueva: base.filter((t) => t.estado === 'nueva').length,
      pendiente: base.filter((t) => t.estado === 'pendiente').length,
      completado: base.filter((t) => t.estado === 'completado').length,
      ganado: base.filter((t) => t.estado === 'ganado').length,
    };
  });

  ganados = computed(() => {
    const ym = this.st.metricsYm();
    const u = this.st.user();
    let list = this.st
      .tareas()
      .filter((t) => (t.fechaCreacion || '').startsWith(ym) && t.estado === 'ganado');
    if (u?.rol === 'operario') {
      list = list.filter((t) => tareaVisibleParaOperario(t, u.username));
    }
    return list;
  });

  guardarTarea(datos: Partial<IpTarea>) {
    const cur = this.modalTarea();
    if (cur?.id) {
      this.st.patchTarea(cur.id, datos).subscribe({ next: () => this.modalTarea.set(null) });
    } else {
      this.st.crearTarea(datos).subscribe({ next: () => this.modalTarea.set(null) });
    }
  }

  toggleEstado(ev: Event, id: number) {
    ev.stopPropagation();
    const x = this.st.tareas().find((t) => t.id === id);
    if (!x || x.estado === 'nueva') return;
    const estado: IpTarea['estado'] =
      x.estado === 'pendiente' ? 'completado' : 'pendiente';
    this.st.patchTarea(id, { estado }).subscribe();
  }

  hasContactos(t: IpTarea): boolean {
    return !!(
      t.contacto1_fecha ||
      t.contacto1_nota ||
      t.contacto2_fecha ||
      t.contacto2_nota ||
      t.contacto3_fecha ||
      t.contacto3_nota
    );
  }

  fmtContacto(t: IpTarea, n: 1 | 2 | 3): string {
    const f = t[`contacto${n}_fecha` as keyof IpTarea] as string;
    const no = t[`contacto${n}_nota` as keyof IpTarea] as string;
    if (!f && !no) return '—';
    const parts = [f ? this.fD(f) : null, no || null].filter(Boolean) as string[];
    return parts.join(' · ');
  }

  fmtContactoN(t: IpTarea, n: number): string {
    return this.fmtContacto(t, n as 1 | 2 | 3);
  }

  statKeyFromLabel(label: string): string | null {
    const m: Record<string, string> = {
      Nuevas: 'nueva',
      Pendientes: 'pendiente',
      Completadas: 'completado',
      Ganados: 'ganado',
    };
    return m[label] ?? null;
  }

  toggleStatFilter(label: string) {
    const k = this.statKeyFromLabel(label);
    if (!k) return;
    this.filtro.set(this.filtro() === k ? 'todos' : k);
  }
}
