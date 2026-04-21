import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { InputNumberModule } from 'primeng/inputnumber';
import { TableModule } from 'primeng/table';
import { MessageModule } from 'primeng/message';
import { ToastModule } from 'primeng/toast';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { TooltipModule } from 'primeng/tooltip';
import { MessageService, ConfirmationService } from 'primeng/api';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ApiService, HiddenEmployee } from '../../services/api.service';

interface PersonBudget {
  nombre: string;
  presupuesto: number;
}

interface ProductTarget {
  nombre: string;
  meta: number;
  disponibles: number;
}

interface MonthlyConfigResponse {
  year: number;
  month: number;
  dateFrom: string;
  dateTo: string;
  productVendidos?: Record<string, number>;
  config: {
    diasHabilesMes: number;
    diasEjecutados: number;
    metaGlobal: number;
    metaProductos: number;
    dermatologia: PersonBudget[];
    medEstetica: PersonBudget[];
    lounge: PersonBudget[];
    botox: ProductTarget;
    radiesse: ProductTarget;
    harmonyca: ProductTarget;
    skinvive: ProductTarget;
    belotero: {
      balance: ProductTarget;
      intense: ProductTarget;
      volume: ProductTarget;
      revive: ProductTarget;
    };
  };
}

interface ProductRow {
  key: string;
  label: string;
  meta: number;
  disponibles: number;
  vendidos: number;
}

@Component({
  selector: 'app-monthly-config',
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    InputNumberModule,
    TableModule,
    MessageModule,
    ToastModule,
    ProgressSpinnerModule,
    TagModule,
    DialogModule,
    ConfirmDialogModule,
    TooltipModule,
  ],
  providers: [MessageService, ConfirmationService],
  templateUrl: './monthly-config.html',
  styleUrl: './monthly-config.scss',
})
export class MonthlyConfig implements OnInit {
  loading = signal(false);
  saving = signal(false);
  error = signal<string | null>(null);

  // Form state
  selectedYear = new Date().getFullYear();
  selectedMonth = new Date().getMonth() + 1;

  // Config info (read-only)
  diasHabilesMes = 0;
  diasEjecutados = 0;
  dateFrom = '';
  dateTo = '';
  hasExistingConfig = false;

  // Editable global values
  metaGlobal = 0;
  metaProductos = 0;

  // Employee lists (names from production DB, presupuesto editable)
  dermatologia: PersonBudget[] = [];
  medEstetica: PersonBudget[] = [];
  lounge: PersonBudget[] = [];

  // Product rows (meta editable, disponibles/vendidos from production DB)
  productRows: ProductRow[] = [];

  // Hidden employees
  hiddenEmployees: HiddenEmployee[] = [];
  showHiddenDialog = signal(false);

  constructor(
    private api: ApiService,
    private messageService: MessageService,
    private confirmationService: ConfirmationService
  ) {}

  ngOnInit() {
    this.loadConfig();
  }

  loadConfig() {
    this.loading.set(true);
    this.error.set(null);

    this.api.getMonthlyConfig(this.selectedYear, this.selectedMonth).subscribe({
      next: (data: MonthlyConfigResponse) => {
        this.populateForm(data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error al cargar configuración: ' + err.message);
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudo cargar la configuración mensual',
        });
      },
    });
  }

  populateForm(data: MonthlyConfigResponse) {
    const config = data.config;

    this.diasHabilesMes = config.diasHabilesMes;
    this.diasEjecutados = config.diasEjecutados;
    this.dateFrom = data.dateFrom;
    this.dateTo = data.dateTo;

    // Check if there's a real config saved (metaGlobal > 0 means yes)
    this.hasExistingConfig = config.metaGlobal > 0;

    this.metaGlobal = config.metaGlobal;
    this.metaProductos = config.metaProductos;

    // Employees — names come from production DB, presupuesto from saved config
    this.dermatologia = config.dermatologia.map(e => ({ ...e }));
    this.medEstetica = config.medEstetica.map(e => ({ ...e }));
    this.lounge = config.lounge.map(e => ({ ...e }));

    // Products
    const vendidos = data.productVendidos || {};
    this.productRows = [
      { key: 'botox', label: 'Botox', meta: config.botox.meta, disponibles: config.botox.disponibles, vendidos: vendidos['botox'] || 0 },
      { key: 'radiesse', label: 'Radiesse', meta: config.radiesse.meta, disponibles: config.radiesse.disponibles, vendidos: vendidos['radiesse'] || 0 },
      { key: 'harmonyca', label: 'Harmonyca', meta: config.harmonyca.meta, disponibles: config.harmonyca.disponibles, vendidos: vendidos['harmonyca'] || 0 },
      { key: 'skinvive', label: 'Skinvive', meta: config.skinvive.meta, disponibles: config.skinvive.disponibles, vendidos: vendidos['skinvive'] || 0 },
      { key: 'belotero.balance', label: 'Belotero Balance', meta: config.belotero.balance.meta, disponibles: config.belotero.balance.disponibles, vendidos: vendidos['belotero.balance'] || 0 },
      { key: 'belotero.intense', label: 'Belotero Intense', meta: config.belotero.intense.meta, disponibles: config.belotero.intense.disponibles, vendidos: vendidos['belotero.intense'] || 0 },
      { key: 'belotero.volume', label: 'Belotero Volume', meta: config.belotero.volume.meta, disponibles: config.belotero.volume.disponibles, vendidos: vendidos['belotero.volume'] || 0 },
      { key: 'belotero.revive', label: 'Belotero Revive', meta: config.belotero.revive.meta, disponibles: config.belotero.revive.disponibles, vendidos: vendidos['belotero.revive'] || 0 },
    ];
  }

  saveConfig() {
    this.saving.set(true);

    // Build products back into the expected structure
    const getProduct = (key: string): ProductTarget => {
      const row = this.productRows.find(p => p.key === key);
      return row ? { nombre: row.label, meta: row.meta, disponibles: row.disponibles } : { nombre: key, meta: 0, disponibles: 0 };
    };

    const configToSave = {
      metaGlobal: this.metaGlobal,
      metaProductos: this.metaProductos,
      dermatologia: this.dermatologia,
      medEstetica: this.medEstetica,
      lounge: this.lounge,
      botox: getProduct('botox'),
      radiesse: getProduct('radiesse'),
      harmonyca: getProduct('harmonyca'),
      skinvive: getProduct('skinvive'),
      belotero: {
        balance: getProduct('belotero.balance'),
        intense: getProduct('belotero.intense'),
        volume: getProduct('belotero.volume'),
        revive: getProduct('belotero.revive'),
      },
    };

    this.api.saveMonthlyConfig(this.selectedYear, this.selectedMonth, configToSave).subscribe({
      next: () => {
        this.messageService.add({
          severity: 'success',
          summary: 'Éxito',
          detail: 'Configuración guardada correctamente',
        });
        this.saving.set(false);
        this.loadConfig();
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Error al guardar: ' + (err.error?.details || err.message),
        });
        this.saving.set(false);
      },
    });
  }

  onYearMonthChange() {
    this.loadConfig();
  }

  getMonthName(month: number): string {
    const names = ['', 'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
      'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
    return names[month] || '';
  }

  getTotalPresupuesto(employees: PersonBudget[]): number {
    return employees.reduce((sum, e) => sum + (e.presupuesto || 0), 0);
  }

  formatCurrency(value: number): string {
    return new Intl.NumberFormat('es-CO', { style: 'currency', currency: 'COP', maximumFractionDigits: 0 }).format(value);
  }

  hideEmployee(nombre: string, categoria: string) {
    this.confirmationService.confirm({
      message: `¿Ocultar a "${nombre}" de la configuración mensual?`,
      header: 'Confirmar',
      icon: 'pi pi-eye-slash',
      acceptLabel: 'Ocultar',
      rejectLabel: 'Cancelar',
      accept: () => {
        this.api.hideEmployee(nombre, categoria).subscribe({
          next: () => {
            this.messageService.add({ severity: 'success', summary: 'Empleado oculto', detail: nombre });
            this.loadConfig();
          },
          error: () => {
            this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo ocultar' });
          },
        });
      },
    });
  }

  openHiddenDialog() {
    this.api.getHiddenEmployees().subscribe({
      next: (res) => {
        this.hiddenEmployees = res.data;
        this.showHiddenDialog.set(true);
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudieron cargar empleados ocultos' });
      },
    });
  }

  unhideEmployee(emp: HiddenEmployee) {
    this.api.unhideEmployee(emp.id).subscribe({
      next: () => {
        this.hiddenEmployees = this.hiddenEmployees.filter(e => e.id !== emp.id);
        this.messageService.add({ severity: 'success', summary: 'Restaurado', detail: emp.nombre });
        if (this.hiddenEmployees.length === 0) {
          this.showHiddenDialog.set(false);
        }
        this.loadConfig();
      },
      error: () => {
        this.messageService.add({ severity: 'error', summary: 'Error', detail: 'No se pudo restaurar' });
      },
    });
  }
}
