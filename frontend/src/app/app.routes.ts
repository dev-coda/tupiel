import { Routes } from '@angular/router';
import { authGuard } from './guards/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () =>
      import('./components/login/login').then((m) => m.Login),
  },
  {
    path: '',
    redirectTo: 'ppto',
    pathMatch: 'full',
  },
  {
    path: 'ppto',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/ppto-dashboard/ppto-dashboard').then(
        (m) => m.PptoDashboard
      ),
  },
  {
    path: 'dashboard',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'schema',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/schema-explorer/schema-explorer').then(
        (m) => m.SchemaExplorer
      ),
  },
  {
    path: 'reports',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/reports/reports').then((m) => m.Reports),
  },
  {
    path: 'settings',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/settings/settings').then((m) => m.Settings),
  },
  {
    path: 'settings/dias-no-laborales',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/dias-no-laborales/dias-no-laborales').then(
        (m) => m.DiasNoLaborales
      ),
  },
  {
    path: 'settings/monthly-config',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/monthly-config/monthly-config').then(
        (m) => m.MonthlyConfig
      ),
  },
  {
    path: 'saved-reports',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/saved-reports/saved-reports').then(
        (m) => m.SavedReports
      ),
  },
  {
    path: 'inteligencia-pacientes',
    canActivate: [authGuard],
    loadComponent: () =>
      import('./components/inteligencia-pacientes/inteligencia-pacientes').then(
        (m) => m.InteligenciaPacientes
      ),
  },
  {
    path: '**',
    redirectTo: 'ppto',
  },
];
