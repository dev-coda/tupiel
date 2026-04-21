import { Component, inject, signal, effect } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { finalize } from 'rxjs';
import { IpStateService } from '../ip-state.service';
import { IP_GOAL_GROUPS } from '../ip-goals.constants';

@Component({
  selector: 'app-ip-metas',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ip-metas.html',
  styleUrl: './ip-metas.scss',
})
export class IpMetas {
  readonly st = inject(IpStateService);

  readonly groups = IP_GOAL_GROUPS;

  /** Local draft; only overwritten from server when not dirty (see effects). */
  draft = signal<Record<string, number | ''>>({});

  /** True after the user edits a field; cleared on month change or successful save. */
  private readonly draftDirty = signal(false);

  saving = signal(false);
  saveMsg = signal<string | null>(null);
  saveErr = signal<string | null>(null);

  constructor() {
    effect(() => {
      void this.st.metricsYm();
      this.draftDirty.set(false);
    });
    effect(() => {
      void this.st.metricsYm();
      void this.st.monthlyGoals();
      if (!this.draftDirty()) {
        this.syncDraftFromState();
      }
    });
  }

  private syncDraftFromState(): void {
    const g = { ...this.st.monthlyGoals() };
    const d: Record<string, number | ''> = {};
    for (const gr of this.groups) {
      for (const m of gr.metrics) {
        const v = g[m.key];
        d[m.key] = v != null && v > 0 ? v : '';
      }
    }
    this.draft.set(d);
  }

  patch(key: string, val: string): void {
    this.draftDirty.set(true);
    const n = val === '' ? '' : Number(val);
    this.draft.update((prev) => ({
      ...prev,
      [key]: val === '' || Number.isNaN(n as number) ? '' : (n as number),
    }));
  }

  val(key: string): number | '' {
    return this.draft()[key] ?? '';
  }

  guardar(): void {
    const out: Record<string, number> = {};
    for (const gr of this.groups) {
      for (const m of gr.metrics) {
        const v = this.draft()[m.key];
        if (v !== '' && v != null && typeof v === 'number' && v >= 0) {
          out[m.key] = v;
        }
      }
    }
    this.saving.set(true);
    this.saveMsg.set(null);
    this.saveErr.set(null);
    this.st
      .saveMonthlyGoals(out)
      .pipe(finalize(() => this.saving.set(false)))
      .subscribe({
        next: () => {
          this.draftDirty.set(false);
          this.syncDraftFromState();
          this.saveMsg.set('Metas guardadas.');
          setTimeout(() => this.saveMsg.set(null), 3500);
        },
        error: (e) =>
          this.saveErr.set(
            typeof e?.error?.error === 'string' ? e.error.error : 'No se pudo guardar'
          ),
      });
  }
}
