import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    redirectTo: 'ppto',
    pathMatch: 'full',
  },
  {
    path: 'ppto',
    loadComponent: () =>
      import('./components/ppto-dashboard/ppto-dashboard').then(
        (m) => m.PptoDashboard
      ),
  },
  {
    path: 'dashboard',
    loadComponent: () =>
      import('./components/dashboard/dashboard').then((m) => m.Dashboard),
  },
  {
    path: 'schema',
    loadComponent: () =>
      import('./components/schema-explorer/schema-explorer').then(
        (m) => m.SchemaExplorer
      ),
  },
  {
    path: 'reports',
    loadComponent: () =>
      import('./components/reports/reports').then((m) => m.Reports),
  },
  {
    path: 'settings',
    loadComponent: () =>
      import('./components/settings/settings').then((m) => m.Settings),
  },
  {
    path: 'settings/dias-no-laborales',
    loadComponent: () =>
      import('./components/dias-no-laborales/dias-no-laborales').then(
        (m) => m.DiasNoLaborales
      ),
  },
];
