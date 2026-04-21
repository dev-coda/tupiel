import { Component, OnInit, inject, input, output } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  ACTIVIDAD_CFG,
  ESTADO_CFG,
  TICKET_CFG,
} from '../data/mock-fichas';
import { IpFicha, IpPaciente } from '../ip.models';
import { IpStateService } from '../ip-state.service';
import { ipMoney } from '../ip-utils';
import { switchMap } from 'rxjs';

@Component({
  selector: 'app-ip-modal-ficha',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ip-modal-ficha.html',
  styleUrl: './ip-modal-ficha.scss',
})
export class IpModalFicha implements OnInit {
  private readonly st = inject(IpStateService);

  readonly pac = input.required<IpPaciente | { nombre: string; doc: string; celular?: string; valor_total?: number; subcategorias?: string[] }>();
  readonly origen = input<string | null>(null);
  readonly onCrearTarea = input<boolean>(false);

  readonly close = output<void>();

  form: {
    estado: string;
    ticket: string;
    actividad: string;
    notas: string;
    origen?: string | null;
  } = {
    estado: 'fidelizacion',
    ticket: 'medio',
    actividad: 'activo',
    notas: '',
  };

  estadoCfg = ESTADO_CFG;
  ticketCfg = TICKET_CFG;
  actividadCfg = ACTIVIDAD_CFG;

  readonly estadoKeys = ['fidelizacion', 'seguimiento', 'extranjero', 'descartado'] as const;
  readonly ticketKeys = ['alto', 'medio', 'bajo'] as const;
  readonly actividadKeys = ['activo', 'en_riesgo', 'inactivo'] as const;

  money = ipMoney;

  ngOnInit() {
    const p = this.pac();
    const ficha = this.st.fichas()[p.doc];
    this.form = ficha
      ? { ...ficha }
      : { estado: 'fidelizacion', ticket: 'medio', actividad: 'activo', notas: '' };
  }

  get origenDisplay(): string | null {
    return this.form.origen || this.origen() || null;
  }

  get fichaExistente(): IpFicha | undefined {
    return this.st.fichas()[this.pac().doc];
  }

  backdropClick(ev: MouseEvent) {
    if (ev.target === ev.currentTarget) this.close.emit();
  }

  guardar() {
    const p = this.pac();
    const ficha = this.fichaExistente;
    const user = this.st.user();
    const payload: IpFicha = {
      ...this.form,
      origen: ficha?.origen ?? this.origen() ?? null,
      modificadoPor: user?.username || 'admin',
      modificadoEn: new Date().toISOString().split('T')[0],
    } as IpFicha;
    this.st.persistFicha(p.doc, payload).subscribe({ next: () => this.close.emit() });
  }

  eliminar() {
    const p = this.pac();
    this.st.removeFicha(p.doc).subscribe({ next: () => this.close.emit() });
  }

  enviarATareas() {
    if (!this.onCrearTarea()) return;
    const p = this.pac() as IpPaciente;
    this.st
      .crearTarea({
        pacDoc: p.doc,
        pacNombre: p.nombre,
        pacCelular: p.celular || '',
        pacValor: p.valor_total || 0,
        pacServicios: p.subcategorias || [],
        fichaNotas: this.form.notas,
        fichaTicket: this.form.ticket,
        fichaActividad: this.form.actividad,
        fichaOrigen: this.origenDisplay || '',
        tipo: '',
        descripcion: '',
        estado: 'nueva',
        contacto1_fecha: '',
        contacto1_nota: '',
        contacto2_fecha: '',
        contacto2_nota: '',
        contacto3_fecha: '',
        contacto3_nota: '',
        citaAgendada: false,
        creadoPor: this.st.user()?.username || 'admin',
      })
      .pipe(switchMap(() => this.st.removeFicha(p.doc)))
      .subscribe({ next: () => this.close.emit() });
  }
}
