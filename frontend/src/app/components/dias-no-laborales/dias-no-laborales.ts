import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TableModule } from 'primeng/table';
import { DialogModule } from 'primeng/dialog';
import { InputTextModule } from 'primeng/inputtext';
import { DatePickerModule } from 'primeng/datepicker';
import { MessageModule } from 'primeng/message';
import { ConfirmDialogModule } from 'primeng/confirmdialog';
import { ToastModule } from 'primeng/toast';
import { TooltipModule } from 'primeng/tooltip';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { ConfirmationService, MessageService } from 'primeng/api';
import { ApiService } from '../../services/api.service';
import { DiaNoLaboral } from '../../models/dias-no-laborales.model';

@Component({
  selector: 'app-dias-no-laborales',
  imports: [
    CommonModule,
    FormsModule,
    CardModule,
    ButtonModule,
    TableModule,
    DialogModule,
    InputTextModule,
    DatePickerModule,
    MessageModule,
    ConfirmDialogModule,
    ToastModule,
    TooltipModule,
    ProgressSpinnerModule,
  ],
  providers: [ConfirmationService, MessageService],
  templateUrl: './dias-no-laborales.html',
  styleUrl: './dias-no-laborales.scss',
})
export class DiasNoLaborales implements OnInit {
  dias = signal<DiaNoLaboral[]>([]);
  loading = signal(false);
  error = signal<string | null>(null);
  
  // Dialog state
  showDialog = signal(false);
  editingDia = signal<DiaNoLaboral | null>(null);
  fecha: Date | null = null;
  descripcion = '';

  constructor(
    private api: ApiService,
    private confirmationService: ConfirmationService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadDias();
  }

  loadDias() {
    this.loading.set(true);
    this.error.set(null);
    
    this.api.getDiasNoLaborales().subscribe({
      next: (response) => {
        this.dias.set(response.data);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Error al cargar días no laborales: ' + err.message);
        this.loading.set(false);
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'No se pudieron cargar los días no laborales',
        });
      },
    });
  }

  openNewDialog() {
    this.editingDia.set(null);
    this.fecha = null;
    this.descripcion = '';
    this.showDialog.set(true);
  }

  openEditDialog(dia: DiaNoLaboral) {
    this.editingDia.set(dia);
    this.fecha = new Date(dia.fecha + 'T12:00:00');
    this.descripcion = dia.descripcion || '';
    this.showDialog.set(true);
  }

  closeDialog() {
    this.showDialog.set(false);
    this.editingDia.set(null);
    this.fecha = null;
    this.descripcion = '';
  }

  saveDia() {
    if (!this.fecha) {
      this.messageService.add({
        severity: 'warn',
        summary: 'Validación',
        detail: 'La fecha es requerida',
      });
      return;
    }

    const fechaStr = this.formatDate(this.fecha);
    const descripcion = this.descripcion.trim() || null;

    if (this.editingDia()) {
      // Update
      this.api.updateDiaNoLaboral(this.editingDia()!.id, fechaStr, descripcion).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Éxito',
            detail: 'Día no laboral actualizado correctamente',
          });
          this.closeDialog();
          this.loadDias();
        },
        error: (err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Error al actualizar: ' + (err.error?.error || err.message),
          });
        },
      });
    } else {
      // Create
      this.api.createDiaNoLaboral(fechaStr, descripcion).subscribe({
        next: () => {
          this.messageService.add({
            severity: 'success',
            summary: 'Éxito',
            detail: 'Día no laboral creado correctamente',
          });
          this.closeDialog();
          this.loadDias();
        },
        error: (err) => {
          this.messageService.add({
            severity: 'error',
            summary: 'Error',
            detail: 'Error al crear: ' + (err.error?.error || err.message),
          });
        },
      });
    }
  }

  deleteDia(dia: DiaNoLaboral) {
    this.confirmationService.confirm({
      message: `¿Está seguro de eliminar el día no laboral del ${this.formatDateDisplay(dia.fecha)}?`,
      header: 'Confirmar eliminación',
      icon: 'pi pi-exclamation-triangle',
      acceptLabel: 'Sí',
      rejectLabel: 'No',
      accept: () => {
        this.api.deleteDiaNoLaboral(dia.id).subscribe({
          next: () => {
            this.messageService.add({
              severity: 'success',
              summary: 'Éxito',
              detail: 'Día no laboral eliminado correctamente',
            });
            this.loadDias();
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'Error al eliminar: ' + (err.error?.error || err.message),
            });
          },
        });
      },
    });
  }

  addAllSundays() {
    this.confirmationService.confirm({
      message: '¿Agregar todos los domingos del año actual a los días no laborales?',
      header: 'Agregar domingos',
      icon: 'pi pi-calendar',
      acceptLabel: 'Sí',
      rejectLabel: 'No',
      accept: () => {
        this.loading.set(true);
        this.api.addAllSundays().subscribe({
          next: (response) => {
            this.messageService.add({
              severity: 'success',
              summary: 'Éxito',
              detail: response.message,
            });
            this.loadDias();
          },
          error: (err) => {
            this.messageService.add({
              severity: 'error',
              summary: 'Error',
              detail: 'Error al agregar domingos: ' + (err.error?.error || err.message),
            });
            this.loading.set(false);
          },
        });
      },
    });
  }

  formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  formatDateDisplay(fecha: string): string {
    const dateStr = typeof fecha === 'string' ? fecha.substring(0, 10) : String(fecha).substring(0, 10);
    const date = new Date(dateStr + 'T12:00:00');
    return date.toLocaleDateString('es-ES', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }
}
