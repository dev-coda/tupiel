import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';

@Component({
  selector: 'app-settings',
  imports: [CommonModule, RouterModule, CardModule, ButtonModule],
  templateUrl: './settings.html',
  styleUrl: './settings.scss',
})
export class Settings {
  settingsItems = [
    {
      title: 'Días No Laborales',
      description: 'Gestiona los días no laborales del sistema. Estos días se excluyen del cálculo de días hábiles.',
      icon: 'pi pi-calendar-times',
      route: '/settings/dias-no-laborales',
      color: '#667eea',
    },
  ];
}
