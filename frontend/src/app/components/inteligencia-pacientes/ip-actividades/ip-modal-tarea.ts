import { Component, effect, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IpTarea } from '../ip.models';
import { IpStateService } from '../ip-state.service';
import { ipMoney } from '../ip-utils';

const TIPOS: { key: string; label: string; icon: string }[] = [
  { key: 'whatsapp', label: 'WhatsApp', icon: '💬' },
  { key: 'campana_mercadeo', label: 'Campaña Mercadeo', icon: '📣' },
  { key: 'email', label: 'Email', icon: '✉️' },
  { key: 'seguimiento_especializado', label: 'Seg. Especializado', icon: '🎯' },
  { key: 'foco_paciente', label: 'Foco Paciente', icon: '⭐' },
];

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
  selector: 'app-ip-modal-tarea',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ip-modal-tarea.html',
  styleUrl: './ip-modal-tarea.scss',
})
export class IpModalTarea {
  private readonly st = inject(IpStateService);

  readonly tarea = input.required<Partial<IpTarea>>();
  readonly close = output<void>();
  readonly save = output<Partial<IpTarea>>();

  tipos = TIPOS;
  fM = ipMoney;

  form: Record<string, string | boolean | number | string[]> = {};

  constructor() {
    effect(() => {
      const t = this.tarea();
      const isNew = !t.id;
      const isNueva = t.estado === 'nueva';
      this.form = {
        tipo: ((isNueva ? '' : t.tipo) || (isNew ? 'whatsapp' : '')) as string,
        pacNombre: t.pacNombre || '',
        pacDoc: t.pacDoc || '',
        pacCelular: t.pacCelular || '',
        pacValor: t.pacValor ?? 0,
        pacServicios: t.pacServicios || [],
        fichaNotas: t.fichaNotas || '',
        fichaTicket: t.fichaTicket || '',
        fichaActividad: t.fichaActividad || '',
        fichaOrigen: t.fichaOrigen || '',
        descripcion: (isNueva ? '' : t.descripcion) || '',
        asignadoA: t.asignadoA || this.st.user()?.username || 'operario',
        prioridad: t.prioridad || 'media',
        estado: t.estado || 'pendiente',
        contacto1_fecha: t.contacto1_fecha || '',
        contacto1_nota: t.contacto1_nota || '',
        contacto2_fecha: t.contacto2_fecha || '',
        contacto2_nota: t.contacto2_nota || '',
        contacto3_fecha: t.contacto3_fecha || '',
        contacto3_nota: t.contacto3_nota || '',
        citaAgendada: t.citaAgendada ?? false,
        creadoPor: t.creadoPor || '',
      };
    });
  }

  get isNew(): boolean {
    return !this.tarea().id;
  }

  get isNueva(): boolean {
    return this.tarea().estado === 'nueva';
  }

  backdrop(ev: MouseEvent) {
    if (ev.target === ev.currentTarget) this.close.emit();
  }

  marcarGanado() {
    this.form['citaAgendada'] = true;
    this.form['estado'] = 'ganado';
  }

  handleSave() {
    const t = this.tarea();
    const datos: Partial<IpTarea> = {
      ...this.form,
      pacValor: Number(this.form['pacValor']) || 0,
      citaAgendada: !!this.form['citaAgendada'],
      creadoPor: (this.form['creadoPor'] as string) || t.creadoPor || this.st.user()?.username || 'admin',
    } as Partial<IpTarea>;
    if (datos.estado === 'nueva') datos.estado = 'pendiente';
    this.save.emit(datos);
  }

  copiarCel() {
    const c = String(this.form['pacCelular'] || '');
    if (c) void navigator.clipboard.writeText(c);
  }

  pacValorPositive(): boolean {
    return this.pacValorNum() > 0;
  }

  pacValorNum(): number {
    return Number(this.form['pacValor']) || 0;
  }

  fichaTicketK(): string {
    return String(this.form['fichaTicket'] || '');
  }

  fichaActividadK(): string {
    return String(this.form['fichaActividad'] || '');
  }

  fichaNotasPreview(): string {
    const s = String(this.form['fichaNotas'] || '');
    return s.slice(0, 60) + (s.length > 60 ? '…' : '');
  }

  protected readonly TICKET_COLOR = TICKET_COLOR;
  protected readonly TICKET_LABEL = TICKET_LABEL;
  protected readonly ACTIV_COLOR = ACTIV_COLOR;
  protected readonly ACTIV_LABEL = ACTIV_LABEL;
}
