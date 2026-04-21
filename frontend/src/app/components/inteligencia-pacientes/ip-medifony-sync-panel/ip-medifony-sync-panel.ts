import { Component, inject, input, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { IpIntelApiService } from '../../../services/ip-intel-api.service';
import { IpStateService } from '../ip-state.service';

function defaultMedifonyRange(): { from: string; to: string } {
  const now = new Date();
  const y = now.getFullYear();
  const m = now.getMonth();
  const d = String(now.getDate()).padStart(2, '0');
  const from = `${y}-${String(m + 1).padStart(2, '0')}-01`;
  const to = `${y}-${String(m + 1).padStart(2, '0')}-${d}`;
  return { from, to };
}

function todayYmd(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
}

/** Barra reutilizable: sync Medifony en vistas Pacientes y Agenda. */
@Component({
  selector: 'app-ip-medifony-sync-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ip-medifony-sync-panel.html',
  styleUrl: './ip-medifony-sync-panel.scss',
})
export class IpMedifonySyncPanel {
  private readonly ipApi = inject(IpIntelApiService);
  private readonly st = inject(IpStateService);

  /** Solo cambia el texto de ayuda (Pacientes vs Agenda). */
  readonly context = input<'pacientes' | 'agenda'>('pacientes');

  private readonly range0 = defaultMedifonyRange();
  syncFrom = signal(this.range0.from);
  syncTo = signal(this.range0.to);
  replacePacientesCat = signal(false);
  replaceAgendaCat = signal(false);
  /** Trae todo el historial de servicios (consulta_cups) por paciente, no solo el rango. */
  fullHistorialServicios = signal(false);
  /** Incluye en CRM pacientes que solo aparecen en agenda (sin servicios en el rango). */
  includeAgendaOnlyPacientes = signal(true);

  /**
   * Carga amplia desde Medifony: muchos años + historial completo + reemplazo de catálogo.
   * El usuario confirma antes de borrar datos locales del CRM.
   */
  aplicarCargaInicialCompleta(): void {
    const ok = window.confirm(
      'Se configurará una sincronización AMPLIA desde Medifony:\n\n' +
        '• Rango: 2010-01-01 → hoy\n' +
        '• Historial completo de servicios por paciente\n' +
        '• Incluir pacientes solo en agenda\n' +
        '• BORRAR el catálogo actual de pacientes y agenda en Inteligencia antes de importar\n\n' +
        '¿Continuar? (puede tardar varios minutos)'
    );
    if (!ok) return;
    this.syncFrom.set('2010-01-01');
    this.syncTo.set(todayYmd());
    this.fullHistorialServicios.set(true);
    this.includeAgendaOnlyPacientes.set(true);
    this.replacePacientesCat.set(true);
    this.replaceAgendaCat.set(true);
    this.sync();
  }

  syncing = signal(false);
  err = signal<string | null>(null);
  ok = signal<string | null>(null);

  sync(): void {
    this.syncing.set(true);
    this.err.set(null);
    this.ok.set(null);
    this.ipApi
      .syncFromMedifony({
        dateFrom: this.syncFrom(),
        dateTo: this.syncTo(),
        replacePacientesCatalog: this.replacePacientesCat(),
        replaceAgendaCatalog: this.replaceAgendaCat(),
        fullHistorialServicios: this.fullHistorialServicios(),
        includeAgendaOnlyPacientes: this.includeAgendaOnlyPacientes(),
      })
      .pipe(finalize(() => this.syncing.set(false)))
      .subscribe({
        next: (r) => {
          const extra =
            r.pacientesAgendaOnly > 0 ? ` · ${r.pacientesAgendaOnly} pac. solo-agenda` : '';
          const hist =
            r.serviciosLinesFullHistorial != null
              ? ` · ${r.serviciosLinesFullHistorial} líneas servicios (historial completo)`
              : ` · ${r.serviciosLines} líneas servicios en rango`;
          this.ok.set(
            `OK: ${r.pacientesUpserted} pacientes${extra}${hist} · ${r.agendaUpserted} citas agenda`
          );
          this.st.hydrate();
        },
        error: (e) =>
          this.err.set(
            typeof e?.error?.error === 'string' ? e.error.error : 'No se pudo sincronizar'
          ),
      });
  }
}
