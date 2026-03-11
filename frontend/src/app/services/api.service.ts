import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';
import {
  SchemaResponse,
  ForeignKeysResponse,
  RowCountsResponse,
  SampleResponse,
  HealthResponse,
} from '../models/schema.model';
import { RentabilidadReport } from '../models/rentabilidad.model';
import { EstimadaReport } from '../models/estimada.model';
import { DashboardData } from '../models/dashboard.model';
import {
  DiasNoLaboralesResponse,
  DiaNoLaboralResponse,
  AddSundaysResponse,
} from '../models/dias-no-laborales.model';

@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly baseUrl: string;

  constructor(private http: HttpClient) {
    // Get API URL from window config (set by environment variable or default to /api)
    const config = (window as any).APP_CONFIG;
    this.baseUrl = config?.apiUrl || '/api';
  }

  getHealth(): Observable<HealthResponse> {
    return this.http.get<HealthResponse>(`${this.baseUrl}/health`);
  }

  getSchema(): Observable<SchemaResponse> {
    return this.http.get<SchemaResponse>(`${this.baseUrl}/schema`);
  }

  getForeignKeys(): Observable<ForeignKeysResponse> {
    return this.http.get<ForeignKeysResponse>(
      `${this.baseUrl}/schema/foreign-keys`
    );
  }

  getRowCounts(): Observable<RowCountsResponse> {
    return this.http.get<RowCountsResponse>(
      `${this.baseUrl}/schema/row-counts`
    );
  }

  getSample(table: string): Observable<SampleResponse> {
    return this.http.get<SampleResponse>(
      `${this.baseUrl}/schema/sample/${table}`
    );
  }

  getRentabilidad(from: string, to: string): Observable<RentabilidadReport> {
    return this.http.get<RentabilidadReport>(
      `${this.baseUrl}/reports/rentabilidad`,
      { params: { from, to } }
    );
  }

  getEstimada(from: string, to: string): Observable<EstimadaReport> {
    return this.http.get<EstimadaReport>(
      `${this.baseUrl}/reports/rentabilidad-estimada`,
      { params: { from, to } }
    );
  }

  /** Download the Controlador PPTO master report as an Excel file */
  downloadControlador(from: string, to: string): Observable<Blob> {
    return this.http.get(
      `${this.baseUrl}/reports/controlador`,
      {
        params: { from, to },
        responseType: 'blob',
      }
    );
  }

  /** Get dashboard data as JSON for visualization */
  getDashboard(from: string, to: string, pagoSi: boolean = true): Observable<DashboardData> {
    return this.http.get<DashboardData>(
      `${this.baseUrl}/dashboard`,
      { params: { from, to, pagoSi: String(pagoSi) } }
    );
  }

  /** Get current database mode */
  getDbMode(): Observable<{ useLocal: boolean; mode: string }> {
    return this.http.get<{ useLocal: boolean; mode: string }>(`${this.baseUrl}/db-toggle`);
  }

  /** Toggle database mode */
  toggleDbMode(useLocal: boolean): Observable<{ success: boolean; useLocal: boolean; mode: string; message: string }> {
    return this.http.post<{ success: boolean; useLocal: boolean; mode: string; message: string }>(
      `${this.baseUrl}/db-toggle`,
      { useLocal }
    );
  }

  /** Get all non-working days */
  getDiasNoLaborales(): Observable<DiasNoLaboralesResponse> {
    return this.http.get<DiasNoLaboralesResponse>(`${this.baseUrl}/dias-no-laborales`);
  }

  /** Get a non-working day by ID */
  getDiaNoLaboral(id: number): Observable<DiaNoLaboralResponse> {
    return this.http.get<DiaNoLaboralResponse>(`${this.baseUrl}/dias-no-laborales/${id}`);
  }

  /** Create a new non-working day */
  createDiaNoLaboral(fecha: string, descripcion?: string | null): Observable<DiaNoLaboralResponse> {
    return this.http.post<DiaNoLaboralResponse>(`${this.baseUrl}/dias-no-laborales`, {
      fecha,
      descripcion,
    });
  }

  /** Update a non-working day */
  updateDiaNoLaboral(id: number, fecha: string, descripcion?: string | null): Observable<DiaNoLaboralResponse> {
    return this.http.put<DiaNoLaboralResponse>(`${this.baseUrl}/dias-no-laborales/${id}`, {
      fecha,
      descripcion,
    });
  }

  /** Delete a non-working day */
  deleteDiaNoLaboral(id: number): Observable<{ success: boolean; message: string }> {
    return this.http.delete<{ success: boolean; message: string }>(`${this.baseUrl}/dias-no-laborales/${id}`);
  }

  /** Add all Sundays of the current year */
  addAllSundays(year?: number): Observable<AddSundaysResponse> {
    return this.http.post<AddSundaysResponse>(`${this.baseUrl}/dias-no-laborales/add-sundays`, {
      year,
    });
  }

  // ── Monthly Config ──
  getMonthlyConfig(year: number, month: number, from?: string, to?: string): Observable<any> {
    const params: any = { year, month };
    if (from) params.from = from;
    if (to) params.to = to;
    return this.http.get(`${this.baseUrl}/monthly-config`, { params });
  }

  saveMonthlyConfig(year: number, month: number, config: any): Observable<any> {
    return this.http.post(`${this.baseUrl}/monthly-config`, { year, month, config });
  }

  getMonthlyConfigHistory(year: number, month: number): Observable<any> {
    return this.http.get(`${this.baseUrl}/monthly-config/history`, {
      params: { year, month },
    });
  }

  // ── Saved Reports ──
  getSavedReports(filters?: {
    reportType?: string;
    dateFrom?: string;
    dateTo?: string;
    limit?: number;
  }): Observable<any> {
    return this.http.get(`${this.baseUrl}/saved-reports`, { params: filters });
  }

  getSavedReport(id: number): Observable<SavedReport> {
    return this.http.get<SavedReport>(`${this.baseUrl}/saved-reports/${id}`);
  }

  triggerDailyReportsSave(): Observable<any> {
    return this.http.post(`${this.baseUrl}/saved-reports/trigger`, {});
  }
}

interface SavedReport {
  id: number;
  report_date: string;
  report_type: 'dashboard' | 'controlador' | 'rentabilidad' | 'estimada';
  date_from: string;
  date_to: string;
  config_version: number | null;
  report_data: string | null;
  file_path: string | null;
  file_size: number | null;
  created_at: string;
}
