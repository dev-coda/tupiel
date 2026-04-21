import { Component, computed, inject, input } from '@angular/core';
import { CommonModule } from '@angular/common';
import { IpStateService } from '../ip-state.service';
import { ipMoney } from '../ip-utils';

@Component({
  selector: 'app-ip-goal-progress',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './ip-goal-progress.html',
  styleUrl: './ip-goal-progress.scss',
})
export class IpGoalProgress {
  readonly st = inject(IpStateService);

  /** Clave en `monthlyGoals` / formulario de metas. */
  readonly metricKey = input.required<string>();
  readonly actual = input.required<number>();
  readonly format = input<'int' | 'money'>('int');

  private readonly fMoney = ipMoney;

  readonly target = computed(() => this.st.goal(this.metricKey()));

  readonly pct = computed(() => {
    const t = this.target();
    if (t == null || t <= 0) return null;
    const a = Number(this.actual()) || 0;
    return Math.min(999, (a / t) * 100);
  });

  fmt(v: number): string {
    return this.format() === 'money' ? this.fMoney(v) : String(Math.round(v));
  }
}
