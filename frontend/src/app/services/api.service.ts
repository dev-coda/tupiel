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
  getDashboard(from: string, to: string): Observable<DashboardData> {
    return this.http.get<DashboardData>(
      `${this.baseUrl}/dashboard`,
      { params: { from, to } }
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
}
