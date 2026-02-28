import { Component, OnInit, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { MenuItem } from 'primeng/api';
import { MenubarModule } from 'primeng/menubar';
import { ButtonModule } from 'primeng/button';
import { TooltipModule } from 'primeng/tooltip';
import { ApiService } from './services/api.service';
import { MessageService } from 'primeng/api';
import { ToastModule } from 'primeng/toast';

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, MenubarModule, ButtonModule, ToastModule, TooltipModule],
  providers: [MessageService],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App implements OnInit {
  dbMode = signal<'local' | 'remote'>('remote');
  dbLoading = signal(false);

  menuItems: MenuItem[] = [
    {
      label: 'Controlador PPTO',
      icon: 'pi pi-chart-bar',
      routerLink: '/ppto',
    },
    {
      label: 'Reportes',
      icon: 'pi pi-file-export',
      routerLink: '/reports',
    },
    {
      label: 'DB Status',
      icon: 'pi pi-database',
      routerLink: '/dashboard',
    },
    {
      label: 'Schema',
      icon: 'pi pi-sitemap',
      routerLink: '/schema',
    },
    {
      label: 'Días No Laborales',
      icon: 'pi pi-calendar-times',
      routerLink: '/dias-no-laborales',
    },
  ];

  constructor(
    private api: ApiService,
    private messageService: MessageService
  ) {}

  ngOnInit() {
    this.loadDbMode();
  }

  loadDbMode() {
    this.api.getDbMode().subscribe({
      next: (data) => {
        this.dbMode.set(data.mode as 'local' | 'remote');
      },
      error: () => {
        this.dbMode.set('remote');
      },
    });
  }

  toggleDb() {
    this.dbLoading.set(true);
    const newMode = this.dbMode() === 'local' ? false : true;
    this.api.toggleDbMode(newMode).subscribe({
      next: (data) => {
        this.dbMode.set(data.mode as 'local' | 'remote');
        this.messageService.add({
          severity: 'info',
          summary: 'Database Mode Changed',
          detail: data.message,
          life: 5000,
        });
        this.dbLoading.set(false);
      },
      error: (err) => {
        this.messageService.add({
          severity: 'error',
          summary: 'Error',
          detail: 'Failed to toggle database mode: ' + (err?.error?.error || err.message),
        });
        this.dbLoading.set(false);
      },
    });
  }
}
