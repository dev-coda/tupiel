import { Component, signal, computed } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { ApiService } from '../../services/api.service';
import { ExportService } from '../../services/export.service';
import {
  RentabilidadReport,
  RentabilidadRow,
} from '../../models/rentabilidad.model';
import {
  EstimadaReport,
  EstimadaRow,
} from '../../models/estimada.model';

type ReportType = 'rentabilidad' | 'estimada';

interface ColumnDef {
  field: string;
  header: string;
  width: string;
  type?: 'currency' | 'percent';
}

@Component({
  selector: 'app-reports',
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    TableModule,
    ProgressSpinnerModule,
    MessageModule,
    TagModule,
    DatePickerModule,
    SelectModule,
  ],
  templateUrl: './reports.html',
  styleUrl: './reports.scss',
})
export class Reports {
  // ── Controls ──
  reportType = signal<ReportType>('rentabilidad');
  dateFrom = signal<Date>(this.getFirstOfMonth());
  dateTo = signal<Date>(new Date());
  loading = signal(false);
  error = signal<string | null>(null);

  // ── Report data (unified as generic rows) ──
  reportRows = signal<Record<string, unknown>[]>([]);
  reportTotals = signal<Record<string, number> | null>(null);
  reportMeta = signal<{ date_from: string; date_to: string } | null>(null);

  reportTypeOptions = [
    { label: 'Rentabilidad (Ejecutada)', value: 'rentabilidad' },
    { label: 'Rentabilidad Estimada', value: 'estimada' },
  ];

  // ── Column definitions based on report type ──
  rentColumns: ColumnDef[] = [
    { field: 'atencion', header: '# Atención', width: '90px' },
    { field: 'registro', header: '# Registro', width: '90px' },
    { field: 'fecha_realizacion', header: 'Fecha Realización', width: '160px' },
    { field: 'nombre_paciente', header: 'Paciente', width: '200px' },
    { field: 'personal_atiende', header: 'Personal', width: '180px' },
    { field: 'codigo_cups', header: 'Cups', width: '80px' },
    { field: 'sub_categoria', header: 'Sub Categoría', width: '140px' },
    { field: 'vlr', header: 'Vlr', width: '110px', type: 'currency' },
    { field: 'costo_comisiones', header: 'Comisiones', width: '110px', type: 'currency' },
    { field: 'costo_insumos', header: 'Insumos', width: '110px', type: 'currency' },
    { field: 'costo_bancario', header: 'Bancario', width: '100px', type: 'currency' },
    { field: 'rentabilidad_total', header: 'Rent. Total', width: '110px', type: 'currency' },
    { field: 'promedio_porcentaje', header: '% Rent.', width: '80px', type: 'percent' },
    { field: 'pagado_este_mes', header: 'Pagado', width: '80px' },
    { field: 'numero_factura', header: 'Factura', width: '100px' },
  ];

  estColumns: ColumnDef[] = [
    { field: 'atencion', header: '# Atención', width: '90px' },
    { field: 'registro', header: '# Registro', width: '90px' },
    { field: 'fecha_realizacion_o_programada', header: 'Fecha Programada', width: '160px' },
    { field: 'nombre_paciente', header: 'Paciente', width: '200px' },
    { field: 'personal_atiende', header: 'Personal', width: '180px' },
    { field: 'codigo_cups', header: 'Cups', width: '80px' },
    { field: 'sub_categoria', header: 'Sub Categoría', width: '180px' },
    { field: 'vlr', header: 'Vlr', width: '110px', type: 'currency' },
    { field: 'vlr_comisiones', header: 'Comisiones', width: '110px', type: 'currency' },
    { field: 'vlr_insumos', header: 'Insumos', width: '100px', type: 'currency' },
    { field: 'rentabilidad_ips', header: 'Rent. IPS', width: '110px', type: 'currency' },
    { field: 'rentabilidad_total', header: 'Rent. Total', width: '110px', type: 'currency' },
    { field: 'rentabilidad_porcentaje', header: '% Rent.', width: '80px', type: 'percent' },
    { field: 'pendiente_registrar', header: 'Pendiente', width: '80px' },
    { field: 'pagado_este_mes', header: 'Pagado', width: '80px' },
  ];

  columns = computed<ColumnDef[]>(() =>
    this.reportType() === 'estimada' ? this.estColumns : this.rentColumns
  );

  reportTitle = computed(() =>
    this.reportType() === 'estimada'
      ? 'Reporte de Rentabilidad Estimada'
      : 'Reporte de Rentabilidad'
  );

  constructor(
    private api: ApiService,
    private exportService: ExportService
  ) {}

  private getFirstOfMonth(): Date {
    const d = new Date();
    d.setDate(1);
    return d;
  }

  private fmtDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  onReportTypeChange() {
    // Clear previous data when switching report types
    this.reportRows.set([]);
    this.reportTotals.set(null);
    this.reportMeta.set(null);
    this.error.set(null);
  }

  loadReport() {
    this.loading.set(true);
    this.error.set(null);
    this.reportRows.set([]);
    this.reportTotals.set(null);

    const from = this.fmtDate(this.dateFrom());
    const to = this.fmtDate(this.dateTo());

    if (this.reportType() === 'estimada') {
      this.api.getEstimada(from, to).subscribe({
        next: (data) => {
          this.reportRows.set(data.rows as unknown as Record<string, unknown>[]);
          this.reportTotals.set(data.totals as unknown as Record<string, number>);
          this.reportMeta.set({ date_from: data.date_from, date_to: data.date_to });
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Error loading report: ' + (err?.error?.error || err.message));
          this.loading.set(false);
        },
      });
    } else {
      this.api.getRentabilidad(from, to).subscribe({
        next: (data) => {
          this.reportRows.set(data.rows as unknown as Record<string, unknown>[]);
          this.reportTotals.set(data.totals as unknown as Record<string, number>);
          this.reportMeta.set({ date_from: data.date_from, date_to: data.date_to });
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set('Error loading report: ' + (err?.error?.error || err.message));
          this.loading.set(false);
        },
      });
    }
  }

  exportCsv() {
    const rows = this.reportRows();
    if (rows.length === 0) return;
    const meta = this.reportMeta();
    const prefix = this.reportType() === 'estimada'
      ? 'reporte_rentabilidad_estimada'
      : 'reporte_rentabilidad';
    this.exportService.exportCsv(
      rows,
      `${prefix}_${meta?.date_from}_${meta?.date_to}`
    );
  }

  async exportExcel() {
    const rows = this.reportRows();
    if (rows.length === 0) return;
    const meta = this.reportMeta();
    const prefix = this.reportType() === 'estimada'
      ? 'reporte_rentabilidad_estimada'
      : 'reporte_rentabilidad';
    const sheetName = this.reportType() === 'estimada' ? 'Estimada' : 'Rentabilidad';
    await this.exportService.exportExcel(
      rows,
      `${prefix}_${meta?.date_from}_${meta?.date_to}`,
      sheetName
    );
  }

  formatCurrency(value: number): string {
    return value != null
      ? '$' + value.toLocaleString('es-CO', { maximumFractionDigits: 0 })
      : '';
  }

  formatPercent(value: number | string): string {
    if (typeof value === 'string') return value;
    return value != null ? (value * 100).toFixed(1) + '%' : '';
  }

  /** Download the Controlador PPTO master report as Excel */
  controladorLoading = signal(false);

  downloadControlador() {
    this.controladorLoading.set(true);
    const from = this.fmtDate(this.dateFrom());
    const to = this.fmtDate(this.dateTo());

    this.api.downloadControlador(from, to).subscribe({
      next: (blob) => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `controlador_ppto_${from}_${to}.xlsx`;
        a.click();
        window.URL.revokeObjectURL(url);
        this.controladorLoading.set(false);
      },
      error: (err) => {
        this.error.set(
          'Error downloading Controlador: ' + (err?.error?.error || err.message)
        );
        this.controladorLoading.set(false);
      },
    });
  }
}
