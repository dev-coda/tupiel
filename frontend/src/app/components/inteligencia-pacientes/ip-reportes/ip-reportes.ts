import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClient, HttpResponse } from '@angular/common/http';
import { finalize } from 'rxjs';
import { getApiBaseUrl } from '../../../util/api-base-url';

type ExportKind = 'pacientes' | 'agenda' | 'fichas' | 'tareas' | 'all';

@Component({
  selector: 'app-ip-reportes',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ip-reportes.html',
  styleUrl: './ip-reportes.scss',
})
export class IpReportes {
  private readonly http = inject(HttpClient);

  readonly busy = signal<ExportKind | null>(null);
  readonly lastErr = signal<string | null>(null);

  private base(): string {
    return `${getApiBaseUrl()}/inteligencia-pacientes/reports/csv`;
  }

  download(kind: ExportKind): void {
    this.lastErr.set(null);
    this.busy.set(kind);
    this.http
      .get(this.base(), {
        params: { kind },
        responseType: 'blob',
        observe: 'response',
      })
      .pipe(finalize(() => this.busy.set(null)))
      .subscribe({
        next: (resp: HttpResponse<Blob>) => {
          const blob = resp.body;
          if (!blob) {
            this.lastErr.set('Respuesta vacía');
            return;
          }
          let name = `inteligencia_${kind}.csv`;
          const cd = resp.headers.get('Content-Disposition');
          const m = cd?.match(/filename="([^"]+)"/);
          if (m?.[1]) name = m[1];
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = name;
          a.click();
          URL.revokeObjectURL(url);
        },
        error: () => this.lastErr.set('No se pudo generar el archivo. ¿Sesión válida?'),
      });
  }
}
