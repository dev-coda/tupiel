import { Component, signal, computed, OnInit } from '@angular/core';
import { CommonModule, CurrencyPipe, DecimalPipe, PercentPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';

// PrimeNG
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { ProgressBarModule } from 'primeng/progressbar';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { TagModule } from 'primeng/tag';
import { DatePickerModule } from 'primeng/datepicker';
import { KnobModule } from 'primeng/knob';
import { DividerModule } from 'primeng/divider';
import { PanelModule } from 'primeng/panel';
import { ToolbarModule } from 'primeng/toolbar';
import { TooltipModule } from 'primeng/tooltip';
import { ChartModule } from 'primeng/chart';
import { TabsModule } from 'primeng/tabs';
import { SelectModule } from 'primeng/select';
import { ToggleSwitchModule } from 'primeng/toggleswitch';

import { saveAs } from 'file-saver';
import { ApiService } from '../../services/api.service';
import {
  DashboardData,
  PersonMetrics,
  BusinessUnit,
  DailyMetrics,
  ProductMetrics,
  StrategyMetrics,
  ServiceSubcategoryMetrics,
} from '../../models/dashboard.model';

@Component({
  selector: 'app-ppto-dashboard',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    TableModule,
    ProgressBarModule,
    ProgressSpinnerModule,
    MessageModule,
    TagModule,
    DatePickerModule,
    KnobModule,
    DividerModule,
    PanelModule,
    ToolbarModule,
    TooltipModule,
    ChartModule,
    TabsModule,
    SelectModule,
    ToggleSwitchModule,
  ],
  templateUrl: './ppto-dashboard.html',
  styleUrl: './ppto-dashboard.scss',
})
export class PptoDashboard implements OnInit {
  // Expose Math for template
  Math = Math;

  // ── Controls ──
  dateFrom = signal<Date>(this.getFirstOfMonth());
  dateTo = signal<Date>(this.getLastOfMonth());
  pagoSi = signal(true);
  loading = signal(false);
  error = signal<string | null>(null);

  // ── Data ──
  dashData = signal<DashboardData | null>(null);

  // Knob values (computed from strategy)
  get knobCumplimiento(): number {
    return Math.round((this.strategy()?.pctRealCum ?? 0) * 100);
  }
  set knobCumplimiento(_v: number) {} // knob two-way binding needs setter

  get knobAlDia(): number {
    return Math.round((this.strategy()?.pctAlDia ?? 0) * 100);
  }
  set knobAlDia(_v: number) {}

  get knobDiferencia(): number {
    const diff = this.strategy()?.pctDiferencia ?? 0;
    return Math.min(100, Math.max(-100, Math.round(diff * 100)));
  }
  set knobDiferencia(_v: number) {}

  get knobResultado(): number {
    return Math.round((this.strategy()?.pctResultado ?? 0) * 100);
  }
  set knobResultado(_v: number) {}

  // ── Computed helpers ──
  strategy = computed(() => this.dashData()?.strategy ?? null);
  businessUnits = computed(() => this.dashData()?.businessUnits ?? []);
  products = computed(() => this.dashData()?.products ?? []);
  servicesBySubcategory = computed(() => this.dashData()?.servicesBySubcategory ?? []);
  servicesTotals = computed(() => {
    const svcs = this.servicesBySubcategory();
    return {
      atenciones: svcs.reduce((s, v) => s + v.atenciones, 0),
      venta: svcs.reduce((s, v) => s + v.venta, 0),
    };
  });
  weeklySummaries = computed(() => this.dashData()?.weeklySummaries ?? []);

  // Personnel by group
  dermaPersonnel = computed(() =>
    (this.dashData()?.personnel ?? []).filter((p) => p.grupo === 'DERMATOLOGÍA')
  );
  medEstPersonnel = computed(() =>
    (this.dashData()?.personnel ?? []).filter((p) => p.grupo === 'MED ESTÉTICA')
  );
  loungePersonnel = computed(() =>
    (this.dashData()?.personnel ?? []).filter((p) => p.grupo === 'TP LOUNGE')
  );

  // ── Charts ──
  dailyChartData = computed(() => {
    const daily = this.dashData()?.dailyMetrics ?? [];
    const filtered = daily.filter(
      (d) => d.serviciosPrestados > 0 || d.gestionComercial > 0 || (d.productosFacturado ?? 0) > 0
    );

    const facturadoData = filtered.map((d) => d.facturado);
    const productosData = filtered.map((d) => d.productosFacturado ?? 0);
    const gestionData = filtered.map((d) => d.gestionComercial);
    const metaData = filtered.map((d) => d.metaDia);

    const carteraData = filtered.map((d) => d.cartera);

    return {
      labels: filtered.map((d) => {
        const dt = new Date(d.fecha + 'T12:00:00');
        return dt.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
      }),
      datasets: [
        {
          label: 'Facturado',
          data: facturadoData,
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          borderColor: '#22c55e',
          borderWidth: 1,
          stack: 'servicios',
        },
        {
          label: 'Cartera',
          data: carteraData,
          backgroundColor: 'rgba(251, 191, 36, 0.7)',
          borderColor: '#f59e0b',
          borderWidth: 1,
          stack: 'servicios',
        },
        {
          label: 'Productos',
          data: productosData,
          backgroundColor: 'rgba(168, 85, 247, 0.7)',
          borderColor: '#a855f7',
          borderWidth: 1,
          stack: 'productos',
        },
        {
          label: 'Gestión Comercial (Est.)',
          data: gestionData,
          backgroundColor: 'rgba(59, 130, 246, 0.5)',
          borderColor: '#3b82f6',
          borderWidth: 1,
          stack: 'estimada',
        },
        {
          type: 'line' as const,
          label: 'Meta Día',
          data: metaData,
          borderColor: '#ef4444',
          borderWidth: 2,
          borderDash: [6, 4],
          pointRadius: 0,
          fill: false,
        },
      ],
    };
  });

  dailyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
      },
    },
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (ctx: any) => {
            const val = ctx.raw as number;
            return `${ctx.dataset.label}: $${val.toLocaleString('es-CO')}`;
          },
          afterBody: (items: any[]) => {
            if (items.length === 0) return [];
            const idx = items[0].dataIndex;
            const ds = items[0].chart?.data?.datasets ?? [];
            const fac = Number(ds[0]?.data?.[idx]) || 0;
            const car = Number(ds[1]?.data?.[idx]) || 0;
            const prod = Number(ds[2]?.data?.[idx]) || 0;
            const fmt = (v: number) => '$' + v.toLocaleString('es-CO');
            return [
              '',
              `Total Servicios: ${fmt(fac + car)}`,
              `Total Productos: ${fmt(prod)}`,
              `Total: ${fmt(fac + car + prod)}`,
            ];
          },
        },
      },
    },
    scales: {
      x: { stacked: true },
      y: {
        stacked: true,
        beginAtZero: true,
        ticks: {
          callback: (val: any) => '$' + (val / 1_000_000).toFixed(0) + 'M',
        },
      },
    },
  };

  businessUnitChartData = computed(() => {
    const units = this.businessUnits();
    const totalVenta = units.reduce((sum, u) => sum + u.venta, 0);
    const totalMeta = units.reduce((sum, u) => sum + u.meta, 0);
    
    return {
      labels: [...units.map((u) => u.nombre), 'Total'],
      datasets: [
        {
          label: 'Venta',
          data: [...units.map((u) => u.venta), totalVenta],
          backgroundColor: 'rgba(34, 197, 94, 0.8)',
          borderRadius: 4,
        },
        {
          label: 'Meta',
          data: [...units.map((u) => u.meta), totalMeta],
          backgroundColor: 'rgba(156, 163, 175, 0.4)',
          borderColor: '#9ca3af',
          borderWidth: 1,
          borderRadius: 4,
        },
      ],
    };
  });

  businessUnitChartOptions = {
    indexAxis: 'y' as const,
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
      },
    },
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            `${ctx.dataset.label}: $${(ctx.raw as number).toLocaleString('es-CO')}`,
        },
      },
    },
    scales: {
      x: {
        beginAtZero: true,
        ticks: {
          callback: (val: any) => '$' + (val / 1_000_000).toFixed(0) + 'M',
        },
      },
    },
  };

  weeklyChartData = computed(() => {
    const weeks = this.weeklySummaries();
    return {
      labels: weeks.map((w) => w.label),
      datasets: [
        {
          label: 'Servicios Prestados',
          data: weeks.map((w) => w.serviciosPrestados),
          backgroundColor: 'rgba(34, 197, 94, 0.7)',
          borderRadius: 4,
        },
        {
          label: 'Gestión Comercial',
          data: weeks.map((w) => w.gestionComercial),
          backgroundColor: 'rgba(59, 130, 246, 0.6)',
          borderRadius: 4,
        },
      ],
    };
  });

  weeklyChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    layout: {
      padding: {
        top: 10,
        bottom: 10,
        left: 10,
        right: 10,
      },
    },
    plugins: {
      legend: { position: 'top' as const, labels: { usePointStyle: true } },
      tooltip: {
        callbacks: {
          label: (ctx: any) =>
            `${ctx.dataset.label}: $${(ctx.raw as number).toLocaleString('es-CO')}`,
        },
      },
    },
    scales: {
      y: {
        beginAtZero: true,
        ticks: {
          callback: (val: any) => '$' + (val / 1_000_000).toFixed(0) + 'M',
        },
      },
    },
  };

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadDashboard();
  }

  // ── Utility ──

  private getFirstOfMonth(): Date {
    const d = new Date();
    d.setDate(1);
    return d;
  }

  private getLastOfMonth(): Date {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth() + 1, 0); // Last day of current month
  }

  private fmtDate(d: Date): string {
    return d.toISOString().split('T')[0];
  }

  // ── Data loading ──

  loadDashboard() {
    this.loading.set(true);
    this.error.set(null);

    const from = this.fmtDate(this.dateFrom());
    const to = this.fmtDate(this.dateTo());

    this.api.getDashboard(from, to, this.pagoSi()).subscribe({
      next: (data) => {
        this.dashData.set(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          'Error cargando dashboard: ' + (err?.error?.error || err.message)
        );
        this.loading.set(false);
      },
    });
  }

  onPagoSiToggle() {
    this.loadDashboard();
  }

  // ── Download the Excel report ──

  downloadExcel() {
    this.loading.set(true);
    const from = this.fmtDate(this.dateFrom());
    const to = this.fmtDate(this.dateTo());

    this.api.downloadControlador(from, to).subscribe({
      next: (blob) => {
        saveAs(blob, `controlador_ppto_${from}_${to}.xlsx`);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(
          'Error descargando reporte: ' + (err?.error?.error || err.message)
        );
        this.loading.set(false);
      },
    });
  }

  // ── Print ──

  printDashboard() {
    window.print();
  }

  // ── Formatters ──

  fmtCurrency(val: number | null | undefined): string {
    if (val == null) return '$0';
    return '$' + Math.round(val).toLocaleString('es-CO');
  }

  fmtCurrencyM(val: number | null | undefined): string {
    if (val == null) return '$0M';
    return '$' + (val / 1_000_000).toFixed(3) + 'M';
  }

  fmtPct(val: number | null | undefined): string {
    if (val == null) return '0%';
    return (val * 100).toFixed(1) + '%';
  }

  getTodayDate(): string {
    const today = new Date();
    return today.toLocaleDateString('es-CO', {
      weekday: 'long',
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  getFacturadoPct(): number {
    const s = this.strategy();
    if (!s || s.metaGlobal === 0) return 0;
    return s.facturado / s.metaGlobal;
  }

  progressColor(pct: number): string {
    if (pct >= 0.9) return '#22c55e';
    if (pct >= 0.7) return '#f59e0b';
    if (pct >= 0.5) return '#f97316';
    return '#ef4444';
  }

  progressSeverity(pct: number): 'success' | 'warn' | 'danger' | 'info' {
    if (pct >= 0.9) return 'success';
    if (pct >= 0.6) return 'warn';
    return 'danger';
  }

  tagSeverity(pct: number): 'success' | 'warn' | 'danger' | 'info' | 'secondary' | 'contrast' | undefined {
    if (pct >= 0.9) return 'success';
    if (pct >= 0.6) return 'warn';
    return 'danger';
  }

  personnelGroupTotal(group: PersonMetrics[]): {
    atenciones: number;
    venta: number;
    presupuesto: number;
    ventaIdeal: number;
    proyeccion: number;
    pctVenta: number;
    pctEsperado: number;
  } {
    const atenciones = group.reduce((s, p) => s + p.atenciones, 0);
    const venta = group.reduce((s, p) => s + p.venta, 0);
    const presupuesto = group.reduce((s, p) => s + p.presupuesto, 0);
    const ventaIdeal = group.reduce((s, p) => s + p.ventaIdeal, 0);
    const proyeccion = group.reduce((s, p) => s + p.proyeccion, 0);
    return {
      atenciones,
      venta,
      presupuesto,
      ventaIdeal,
      proyeccion,
      pctVenta: presupuesto > 0 ? venta / presupuesto : 0,
      pctEsperado: presupuesto > 0 ? (venta + proyeccion) / presupuesto : 0,
    };
  }
}
