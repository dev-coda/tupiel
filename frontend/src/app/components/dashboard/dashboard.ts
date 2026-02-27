import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CardModule } from 'primeng/card';
import { TagModule } from 'primeng/tag';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { ApiService } from '../../services/api.service';
import { RowCount, HealthResponse } from '../../models/schema.model';

@Component({
  selector: 'app-dashboard',
  imports: [CommonModule, CardModule, TagModule, ProgressSpinnerModule, MessageModule],
  templateUrl: './dashboard.html',
  styleUrl: './dashboard.scss',
})
export class Dashboard implements OnInit {
  health = signal<HealthResponse | null>(null);
  rowCounts = signal<RowCount[]>([]);
  totalTables = signal(0);
  totalRows = signal(0);
  loading = signal(true);
  error = signal<string | null>(null);

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadData();
  }

  loadData() {
    this.loading.set(true);
    this.error.set(null);

    this.api.getHealth().subscribe({
      next: (data) => this.health.set(data),
      error: (err) =>
        this.error.set('Failed to reach backend API: ' + err.message),
    });

    this.api.getRowCounts().subscribe({
      next: (data) => {
        this.rowCounts.set(data.rowCounts);
        this.totalTables.set(data.rowCounts.length);
        this.totalRows.set(
          data.rowCounts.reduce(
            (sum, r) => sum + (r.estimated_row_count || 0),
            0
          )
        );
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load row counts: ' + err.message);
        this.loading.set(false);
      },
    });
  }
}
