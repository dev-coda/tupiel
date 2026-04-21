import { Component, inject, input, output, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IpPaciente } from '../ip.models';
import { IpStateService } from '../ip-state.service';
import { ipDateLong, ipIniciales, ipMoney } from '../ip-utils';

@Component({
  selector: 'app-ip-modal-hoja-vida',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ip-modal-hoja-vida.html',
  styleUrl: './ip-modal-hoja-vida.scss',
})
export class IpModalHojaVida {
  private readonly st = inject(IpStateService);

  readonly pacDoc = input.required<string | null>();
  readonly close = output<void>();

  copied = signal(false);

  fM = ipMoney;
  fDLg = ipDateLong;
  ini = ipIniciales;

  pac(): IpPaciente | null {
    const d = this.pacDoc();
    if (!d) return null;
    return this.st.pacientes().find((p) => p.doc === d) ?? null;
  }

  backdrop(ev: MouseEvent) {
    if (ev.target === ev.currentTarget) this.close.emit();
  }

  copiar(cel: string) {
    void navigator.clipboard.writeText(cel).then(() => {
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 1500);
    });
  }
}
