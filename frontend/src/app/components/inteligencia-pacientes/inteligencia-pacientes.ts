/**
 * Inteligencia de Pacientes — self-contained CRM UI. All data is loaded and saved
 * through `/api/inteligencia-pacientes/*` (Inteligencia MySQL DB). No PPTO/report DB.
 */
import { Component, OnInit, computed, inject, signal } from '@angular/core';
import { finalize } from 'rxjs';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { IpStateService } from './ip-state.service';
import { mapAuthUserToIpUser } from './ip-auth-map';
import { AuthService } from '../../services/auth.service';
import { IpPacientes } from './ip-pacientes/ip-pacientes';
import { IpAgenda } from './ip-agenda/ip-agenda';
import { IpAlertas } from './ip-alertas/ip-alertas';
import { IpTareasGestion } from './ip-tareas-gestion/ip-tareas-gestion';
import { IpActividades } from './ip-actividades/ip-actividades';
import { IpReportes } from './ip-reportes/ip-reportes';
import { IpUsuarios } from './ip-usuarios/ip-usuarios';
import { IpMetas } from './ip-metas/ip-metas';
import { IpViewId } from './ip.models';

@Component({
  selector: 'app-inteligencia-pacientes',
  standalone: true,
  imports: [
    CommonModule,
    RouterLink,
    IpPacientes,
    IpAgenda,
    IpAlertas,
    IpTareasGestion,
    IpActividades,
    IpReportes,
    IpMetas,
    IpUsuarios,
  ],
  providers: [IpStateService],
  templateUrl: './inteligencia-pacientes.html',
  styleUrl: './inteligencia-pacientes.scss',
})
export class InteligenciaPacientes implements OnInit {
  readonly st = inject(IpStateService);
  private readonly auth = inject(AuthService);

  readonly demoPurgeBusy = signal(false);
  readonly demoReseedBusy = signal(false);
  readonly demoPurgeMsg = signal<string | null>(null);
  readonly demoPurgeErr = signal<string | null>(null);

  readonly todayStr = new Date().toLocaleDateString('es-CO', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  private readonly navBase: { id: IpViewId; label: string; icon: string }[] = [
    { id: 'pacientes', label: 'Pacientes', icon: '👥' },
    { id: 'agenda', label: 'Agenda', icon: '📅' },
    { id: 'alertas', label: 'Alertas de Venta', icon: '🔔' },
    { id: 'tareas', label: 'Gestión Comercial', icon: '📋' },
    { id: 'actividades', label: 'Tareas', icon: '✅' },
    { id: 'reportes', label: 'Informes', icon: '📥' },
    { id: 'metas', label: 'Metas', icon: '🎯' },
  ];

  readonly navItems = computed(() => {
    const u = this.st.user();
    if (u?.rol === 'admin') {
      return [...this.navBase, { id: 'usuarios' as IpViewId, label: 'Usuarios', icon: '👤' }];
    }
    return this.navBase;
  });

  ngOnInit(): void {
    const apply = () => {
      const u = this.auth.user();
      if (u) {
        const ipUser = mapAuthUserToIpUser(u);
        this.st.login(ipUser);
        this.st.hydrate();
        if (this.st.activeView() === 'usuarios' && ipUser.rol !== 'admin') {
          this.st.navigate('pacientes');
        }
      }
    };
    apply();
    if (!this.auth.user() && this.auth.getToken()) {
      this.auth.verifyToken().subscribe({ next: () => apply() });
    }
  }

  go(v: IpViewId) {
    if (v === 'usuarios' && this.st.user()?.rol !== 'admin') {
      return;
    }
    this.st.navigate(v);
  }

  purgeDemoData(): void {
    if (this.st.user()?.rol !== 'admin') return;
    const ok = window.confirm(
      '¿Eliminar los registros de demostración del catálogo inicial?\n\n' +
        'No borra datos importados ni sincronizados con otras claves. Las metas mensuales no se modifican.'
    );
    if (!ok) return;
    this.demoPurgeBusy.set(true);
    this.demoPurgeMsg.set(null);
    this.demoPurgeErr.set(null);
    this.st
      .purgeDemoSeed()
      .pipe(finalize(() => this.demoPurgeBusy.set(false)))
      .subscribe({
        next: (r) => {
          const d = r.deleted;
          this.demoPurgeMsg.set(
            `Eliminado: ${d.pacientes} pacientes, ${d.agenda} agenda, ${d.fichas} fichas, ${d.tareas} tareas, ${d.chat} chat.`
          );
          setTimeout(() => this.demoPurgeMsg.set(null), 6000);
        },
        error: (e: { error?: { error?: string } }) =>
          this.demoPurgeErr.set(
            typeof e?.error?.error === 'string' ? e.error.error : 'No se pudo completar'
          ),
      });
  }

  reseedDemoData(): void {
    if (this.st.user()?.rol !== 'admin') return;
    const ok = window.confirm(
      '¿Restaurar el catálogo de demostración en las tablas que estén vacías?\n\n' +
        'No sobrescribe datos existentes.'
    );
    if (!ok) return;
    this.demoReseedBusy.set(true);
    this.demoPurgeMsg.set(null);
    this.demoPurgeErr.set(null);
    this.st
      .reseedDemoCatalog()
      .pipe(finalize(() => this.demoReseedBusy.set(false)))
      .subscribe({
        next: (r) => {
          this.demoPurgeMsg.set(r.message || 'Listo.');
          setTimeout(() => this.demoPurgeMsg.set(null), 6000);
        },
        error: (e: { error?: { error?: string } }) =>
          this.demoPurgeErr.set(
            typeof e?.error?.error === 'string' ? e.error.error : 'No se pudo restaurar'
          ),
      });
  }
}
