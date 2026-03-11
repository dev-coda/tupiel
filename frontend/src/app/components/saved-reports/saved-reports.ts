import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';
import { SelectModule } from 'primeng/select';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService } from 'primeng/api';
import { ApiService } from '../../services/api.service';

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
  data?: any; // Parsed JSON data
}

@Component({
  selector: 'app-saved-reports',
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    TableModule,
    TagModule,
    DatePickerModule,
    SelectModule,
    ProgressSpinnerModule,
    MessageModule,
    ToastModule,
    TooltipModule,
  ],
  providers: [MessageService],
  templateUrl: './saved-reports.html',
  styleUrl: './saved-reports.scss',
})
export class SavedReports implements OnInit {
  loading = signal(false);
  error = signal<string | null>(null);
  reports = signal<SavedReport[]>([]);

  // Filters — default to current month
  selectedReportType: 'dashboard' | 'controlador' | 'rentabilidad' | 'estimada' | null = null;
  dateFrom: Date | null = null;
  dateTo: Date | null = null;

  reportTypeOptions = [
    { label: 'Todos', value: null },
    { label: 'Dashboard', value: 'dashboard' },
    { label: 'Controlador', value: 'controlador' },
    { label: 'Rentabilidad', value: 'rentabilidad' },
    { label: 'Estimada', value: 'estimada' },
  ];

  constructor(
    private api: ApiService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    // Initialize dates to current month (first day to last day, even if in the future)
    const now = new Date();
    this.dateFrom = new Date(now.getFullYear(), now.getMonth(), 1);
    this.dateTo = new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
    this.loadReports();
  }

  loadReports() {
    this.loading.set(true);
    this.error.set(null);

    const params: any = {};
    if (this.selectedReportType) {
      params.reportType = this.selectedReportType;
    }
    if (this.dateFrom) {
      params.dateFrom = this.formatDate(this.dateFrom);
    }
    if (this.dateTo) {
      params.dateTo = this.formatDate(this.dateTo);
    }

    this.api.getSavedReports(params).subscribe({
      next: (response: any) => {
        this.reports.set(response.reports || []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error al cargar reportes guardados: ' + err.message);
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los reportes guardados',
        });
      },
    });
  }

  formatDate(date: Date): string {
    return date.toISOString().substring(0, 10);
  }

  formatFileSize(bytes: number | null): string {
    if (!bytes) return '-';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(2) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(2) + ' MB';
  }

  getReportTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      dashboard: 'Dashboard',
      controlador: 'Controlador',
      rentabilidad: 'Rentabilidad',
      estimada: 'Estimada',
    };
    return labels[type] || type;
  }

  getReportTypeSeverity(type: string): 'success' | 'info' | 'warn' | 'secondary' | 'contrast' | 'danger' {
    const severities: Record<string, 'success' | 'info' | 'warn' | 'secondary' | 'contrast' | 'danger'> = {
      dashboard: 'info',
      controlador: 'success',
      rentabilidad: 'warn',
      estimada: 'warn',
    };
    return severities[type] || 'info';
  }

  viewReport(report: SavedReport) {
    if (report.report_type === 'controlador') {
      // Download Excel file
      const config = (window as any).APP_CONFIG;
      const baseUrl = config?.apiUrl || '/api';
      window.open(`${baseUrl}/saved-reports/${report.id}/download`, '_blank');
    } else {
      // Show JSON data in a modal or new page
      const data = report.data || (report.report_data ? JSON.parse(report.report_data) : null);
      if (data) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        window.open(url, '_blank');
      }
    }
  }

  downloadReport(report: SavedReport) {
    if (report.report_type === 'controlador') {
      const config = (window as any).APP_CONFIG;
      const baseUrl = config?.apiUrl || '/api';
      window.open(`${baseUrl}/saved-reports/${report.id}/download`, '_blank');
    } else {
      const data = report.data || (report.report_data ? JSON.parse(report.report_data) : null);
      if (data) {
        const jsonStr = JSON.stringify(data, null, 2);
        const blob = new Blob([jsonStr], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `${report.report_type}_${report.date_from}_${report.date_to}.json`;
        a.click();
        URL.revokeObjectURL(url);
      }
    }
  }

  onFilterChange() {
    this.loadReports();
  }

  triggerDailySave() {
    this.loading.set(true);
    this.api.triggerDailyReportsSave().subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Guardado diario de reportes iniciado',
        });
        // Reload reports after a delay
        setTimeout(() => {
          this.loadReports();
        }, 2000);
      },
      error: (err) => {
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Error al iniciar guardado: ' + (err.error?.details || err.message),
        });
      },
    });
  }
}
