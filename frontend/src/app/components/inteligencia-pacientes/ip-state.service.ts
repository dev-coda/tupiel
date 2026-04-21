/**
 * CRM state for Inteligencia de Pacientes — loaded/saved only via IpIntelApiService
 * (app DB). No coupling to PPTO, reportes, or ApiService.
 */
import { Injectable, inject, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { IpCitaAgenda, IpFicha, IpPaciente, IpTarea, IpUser, IpViewId } from './ip.models';
import { IpIntelApiService } from '../../services/ip-intel-api.service';

function defaultYm(): string {
  const n = new Date();
  return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}`;
}

@Injectable()
export class IpStateService {
  private readonly api = inject(IpIntelApiService);

  readonly user = signal<IpUser | null>(null);
  readonly activeView = signal<IpViewId>('pacientes');
  readonly pacientes = signal<IpPaciente[]>([]);
  readonly agenda = signal<IpCitaAgenda[]>([]);
  readonly fichas = signal<Record<string, IpFicha>>({});
  readonly tareas = signal<IpTarea[]>([]);
  /** Mes activo para KPIs y metas (YYYY-MM). */
  readonly metricsYm = signal<string>(defaultYm());
  /** Metas numéricas del mes `metricsYm` (clave → meta). */
  readonly monthlyGoals = signal<Record<string, number>>({});
  /** True after first load attempt (success or error). */
  readonly dataReady = signal(false);

  login(u: IpUser) {
    this.user.set(u);
  }

  /** Meta para una clave en el mes activo (si no hay, no se muestra barra). */
  goal(key: string): number | undefined {
    const g = this.monthlyGoals()[key];
    return g != null && g > 0 ? g : undefined;
  }

  setMetricsYm(ym: string): void {
    const v = ym.slice(0, 7);
    if (/^\d{4}-\d{2}$/.test(v)) {
      this.metricsYm.set(v);
      /** Avoid showing the previous month’s goals until the new month’s payload returns. */
      this.monthlyGoals.set({});
      this.loadGoals();
    }
  }

  loadGoals(): void {
    const ym = this.metricsYm();
    this.api.getGoals(ym).subscribe({
      next: (r) => this.monthlyGoals.set(r.goals ?? {}),
      error: () => this.monthlyGoals.set({}),
    });
  }

  saveMonthlyGoals(goals: Record<string, number>): Observable<{ ok: boolean; goals: Record<string, number> }> {
    return this.api.putGoals(this.metricsYm(), goals).pipe(
      tap((r) => this.monthlyGoals.set(r.goals ?? {}))
    );
  }

  /** Load full catalog from the isolated app DB (reference demo seeds on empty DB). */
  hydrate(): void {
    this.api.getState().subscribe({
      next: (s) => {
        this.pacientes.set(s.pacientes ?? []);
        this.agenda.set(s.agenda ?? []);
        this.fichas.set(s.fichas ?? {});
        this.tareas.set(s.tareas ?? []);
        this.dataReady.set(true);
        this.loadGoals();
      },
      error: () => {
        this.dataReady.set(true);
        this.loadGoals();
      },
    });
  }

  persistFicha(doc: string, ficha: IpFicha): Observable<{ ok: boolean }> {
    return this.api.putFicha(doc, ficha).pipe(
      tap(() => this.fichas.update((f) => ({ ...f, [doc]: ficha })))
    );
  }

  removeFicha(doc: string): Observable<{ ok: boolean }> {
    return this.api.deleteFicha(doc).pipe(
      tap(() =>
        this.fichas.update((f) => {
          const n = { ...f };
          delete n[doc];
          return n;
        })
      )
    );
  }

  crearTarea(datos: Partial<IpTarea> & Record<string, unknown>): Observable<IpTarea> {
    const row: Partial<IpTarea> = {
      tipo: (datos.tipo as string) ?? '',
      pacDoc: (datos.pacDoc as string) ?? '',
      pacNombre: (datos.pacNombre as string) ?? '',
      pacCelular: (datos.pacCelular as string) ?? '',
      pacValor: (datos.pacValor as number) ?? 0,
      pacServicios: (datos.pacServicios as string[]) ?? [],
      fichaNotas: (datos.fichaNotas as string) ?? '',
      fichaTicket: (datos.fichaTicket as string) ?? '',
      fichaActividad: (datos.fichaActividad as string) ?? '',
      fichaOrigen: (datos.fichaOrigen as string) ?? '',
      descripcion: (datos.descripcion as string) ?? '',
      estado: (datos.estado as IpTarea['estado']) ?? 'nueva',
      contacto1_fecha: (datos.contacto1_fecha as string) ?? '',
      contacto1_nota: (datos.contacto1_nota as string) ?? '',
      contacto2_fecha: (datos.contacto2_fecha as string) ?? '',
      contacto2_nota: (datos.contacto2_nota as string) ?? '',
      contacto3_fecha: (datos.contacto3_fecha as string) ?? '',
      contacto3_nota: (datos.contacto3_nota as string) ?? '',
      citaAgendada: (datos.citaAgendada as boolean) ?? false,
      fechaCreacion: new Date().toISOString().split('T')[0],
      creadoPor: (datos.creadoPor as string) ?? this.user()?.username ?? 'admin',
      /** Must match CRM user username for operario board filter; 'operario' kept as legacy pool label */
      asignadoA: (datos.asignadoA as string) ?? this.user()?.username ?? 'operario',
      prioridad: (datos.prioridad as string) ?? 'media',
    };
    return this.api.postTarea(row).pipe(
      tap((created) => this.tareas.update((t) => [...t, created]))
    );
  }

  patchTarea(id: number, patch: Partial<IpTarea>): Observable<IpTarea> {
    return this.api.patchTarea(id, patch).pipe(
      tap((updated) =>
        this.tareas.update((ts) => ts.map((t) => (t.id === id ? updated : t)))
      )
    );
  }

  importPacientesExcel(file: File): Observable<{ imported: number; errors: string[] }> {
    return this.api.importPacientesExcel(file).pipe(
      tap((r) => {
        if (r.imported > 0) this.hydrate();
      })
    );
  }

  importAgendaExcel(file: File): Observable<{ imported: number; errors: string[] }> {
    return this.api.importAgendaExcel(file).pipe(
      tap((r) => {
        if (r.imported > 0) this.hydrate();
      })
    );
  }

  /** Admin: borra filas demo (seeds JSON). Recarga estado al terminar. */
  purgeDemoSeed(): Observable<{
    ok: boolean;
    deleted: { pacientes: number; agenda: number; fichas: number; tareas: number; chat: number };
  }> {
    return this.api.deleteDemoSeed().pipe(tap(() => this.hydrate()));
  }

  /** Admin: reinserta demo solo donde la tabla siga vacía. */
  reseedDemoCatalog(): Observable<{ ok: boolean; message: string }> {
    return this.api.reseedDemoCatalog().pipe(tap(() => this.hydrate()));
  }

  navigate(view: IpViewId) {
    this.activeView.set(view);
  }
}
