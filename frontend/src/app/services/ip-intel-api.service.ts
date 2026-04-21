/**
 * Inteligencia de Pacientes API — talks only to `/api/inteligencia-pacientes/*`,
 * persisted in the Inteligencia database (e.g. `tupiel_inteligencia`). No PPTO/report DB.
 */
import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import { getApiBaseUrl } from '../util/api-base-url';
import { IpCitaAgenda, IpFicha, IpPaciente, IpTarea } from '../components/inteligencia-pacientes/ip.models';

export interface IpIntelStateResponse {
  pacientes: IpPaciente[];
  agenda: IpCitaAgenda[];
  fichas: Record<string, IpFicha>;
  tareas: IpTarea[];
}

/** App DB user row for Inteligencia admin UI (not the CRM paciente catalog). */
export interface IpAppUser {
  id: number;
  username: string;
  name: string;
  ipRol: 'admin' | 'operario';
  ipCargo: string;
}

@Injectable({ providedIn: 'root' })
export class IpIntelApiService {
  private readonly http = inject(HttpClient);

  private basePath(): string {
    return `${getApiBaseUrl()}/inteligencia-pacientes`;
  }

  getState(): Observable<IpIntelStateResponse> {
    return this.http.get<IpIntelStateResponse>(`${this.basePath()}/state`);
  }

  getGoals(ym: string): Observable<{ ym: string; goals: Record<string, number> }> {
    return this.http.get<{ ym: string; goals: Record<string, number> }>(
      `${this.basePath()}/goals`,
      { params: { ym } }
    );
  }

  putGoals(ym: string, goals: Record<string, number>): Observable<{ ok: boolean; ym: string; goals: Record<string, number> }> {
    return this.http.put<{ ok: boolean; ym: string; goals: Record<string, number> }>(
      `${this.basePath()}/goals`,
      { ym, goals }
    );
  }

  putFicha(doc: string, ficha: IpFicha): Observable<{ ok: boolean }> {
    const body = {
      estado: ficha.estado,
      ticket: ficha.ticket,
      actividad: ficha.actividad,
      notas: ficha.notas,
      origen: ficha.origen ?? null,
      modificadoPor: ficha.modificadoPor ?? null,
      modificadoEn: ficha.modificadoEn ?? null,
    };
    return this.http.put<{ ok: boolean }>(
      `${this.basePath()}/fichas/${encodeURIComponent(doc)}`,
      body
    );
  }

  deleteFicha(doc: string): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(
      `${this.basePath()}/fichas/${encodeURIComponent(doc)}`
    );
  }

  postTarea(t: Partial<IpTarea>): Observable<IpTarea> {
    return this.http.post<IpTarea>(`${this.basePath()}/tareas`, t);
  }

  patchTarea(id: number, patch: Partial<IpTarea>): Observable<IpTarea> {
    return this.http.patch<IpTarea>(`${this.basePath()}/tareas/${id}`, patch);
  }

  deleteTarea(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.basePath()}/tareas/${id}`);
  }

  importPacientesExcel(file: File): Observable<{ imported: number; errors: string[] }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ imported: number; errors: string[] }>(
      `${this.basePath()}/import/pacientes`,
      fd
    );
  }

  importAgendaExcel(file: File): Observable<{ imported: number; errors: string[] }> {
    const fd = new FormData();
    fd.append('file', file);
    return this.http.post<{ imported: number; errors: string[] }>(
      `${this.basePath()}/import/agenda`,
      fd
    );
  }

  /** Admin-only: `/api/inteligencia-pacientes/users` (app DB). */
  listInteligenciaAppUsers(): Observable<{ users: IpAppUser[] }> {
    return this.http.get<{ users: IpAppUser[] }>(`${this.basePath()}/users`);
  }

  createInteligenciaAppUser(body: {
    username: string;
    name: string;
    password: string;
    ipRol: 'admin' | 'operario';
    ipCargo?: string;
  }): Observable<{ user: IpAppUser }> {
    return this.http.post<{ user: IpAppUser }>(`${this.basePath()}/users`, body);
  }

  patchInteligenciaAppUser(
    id: number,
    body: Partial<{
      name: string;
      password: string;
      ipRol: 'admin' | 'operario';
      ipCargo: string;
    }>
  ): Observable<{ user: IpAppUser }> {
    return this.http.patch<{ user: IpAppUser }>(`${this.basePath()}/users/${id}`, body);
  }

  deleteInteligenciaAppUser(id: number): Observable<{ ok: boolean }> {
    return this.http.delete<{ ok: boolean }>(`${this.basePath()}/users/${id}`);
  }

  /**
   * Admin only: elimina filas que coinciden con los JSON de demo empaquetados (no vacía tablas enteras).
   * No borra `ip_monthly_goals`.
   */
  deleteDemoSeed(): Observable<{
    ok: boolean;
    deleted: { pacientes: number; agenda: number; fichas: number; tareas: number; chat: number };
  }> {
    return this.http.delete<{
      ok: boolean;
      deleted: { pacientes: number; agenda: number; fichas: number; tareas: number; chat: number };
    }>(`${this.basePath()}/demo-data`);
  }

  /** Admin only: vuelve a insertar demo en tablas vacías (misma lógica que al arrancar el servidor). */
  reseedDemoCatalog(): Observable<{ ok: boolean; message: string }> {
    return this.http.post<{ ok: boolean; message: string }>(
      `${this.basePath()}/demo-data/reseed`,
      {}
    );
  }

  /** Sincronizar catálogo desde BD Medifony remota (misma conexión que PPTO). */
  syncFromMedifony(body: {
    dateFrom: string;
    dateTo: string;
    replacePacientesCatalog?: boolean;
    replaceAgendaCatalog?: boolean;
    fullHistorialServicios?: boolean;
    includeAgendaOnlyPacientes?: boolean;
  }): Observable<{
    ok: boolean;
    dateFrom: string;
    dateTo: string;
    pacientesUpserted: number;
    serviciosLines: number;
    serviciosLinesFullHistorial?: number;
    agendaUpserted: number;
    pacientesAgendaOnly: number;
    warnings: string[];
  }> {
    return this.http.post<{
      ok: boolean;
      dateFrom: string;
      dateTo: string;
      pacientesUpserted: number;
      serviciosLines: number;
      serviciosLinesFullHistorial?: number;
      agendaUpserted: number;
      pacientesAgendaOnly: number;
      warnings: string[];
    }>(`${this.basePath()}/sync/medifony`, body);
  }
}
