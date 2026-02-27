import { Component, OnInit, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { TableModule } from 'primeng/table';
import { CardModule } from 'primeng/card';
import { ButtonModule } from 'primeng/button';
import { TagModule } from 'primeng/tag';
import { DialogModule } from 'primeng/dialog';
import { ProgressSpinnerModule } from 'primeng/progressspinner';
import { MessageModule } from 'primeng/message';
import { AccordionModule } from 'primeng/accordion';
import { ApiService } from '../../services/api.service';
import { TableInfo, ForeignKey, RowCount } from '../../models/schema.model';

@Component({
  selector: 'app-schema-explorer',
  imports: [
    CommonModule,
    TableModule,
    CardModule,
    ButtonModule,
    TagModule,
    DialogModule,
    ProgressSpinnerModule,
    MessageModule,
    AccordionModule,
  ],
  templateUrl: './schema-explorer.html',
  styleUrl: './schema-explorer.scss',
})
export class SchemaExplorer implements OnInit {
  tables = signal<TableInfo[]>([]);
  foreignKeys = signal<ForeignKey[]>([]);
  rowCounts = signal<RowCount[]>([]);
  loading = signal(true);
  error = signal<string | null>(null);

  sampleDialogVisible = signal(false);
  sampleTableName = signal('');
  sampleData = signal<Record<string, unknown>[]>([]);
  sampleColumns = signal<string[]>([]);
  sampleLoading = signal(false);

  constructor(private api: ApiService) {}

  ngOnInit() {
    this.loadSchema();
  }

  loadSchema() {
    this.loading.set(true);
    this.error.set(null);

    this.api.getSchema().subscribe({
      next: (data) => {
        this.tables.set(data.tables);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set('Failed to load schema: ' + err.message);
        this.loading.set(false);
      },
    });

    this.api.getForeignKeys().subscribe({
      next: (data) => this.foreignKeys.set(data.foreignKeys),
    });

    this.api.getRowCounts().subscribe({
      next: (data) => this.rowCounts.set(data.rowCounts),
    });
  }

  getRowCount(tableName: string): number {
    const rc = this.rowCounts().find((r) => r.table_name === tableName);
    return rc?.estimated_row_count ?? 0;
  }

  getTableForeignKeys(tableName: string): ForeignKey[] {
    return this.foreignKeys().filter((fk) => fk.table_name === tableName);
  }

  viewSample(tableName: string) {
    this.sampleTableName.set(tableName);
    this.sampleDialogVisible.set(true);
    this.sampleLoading.set(true);
    this.sampleData.set([]);
    this.sampleColumns.set([]);

    this.api.getSample(tableName).subscribe({
      next: (data) => {
        this.sampleData.set(data.rows);
        if (data.rows.length > 0) {
          this.sampleColumns.set(Object.keys(data.rows[0]));
        }
        this.sampleLoading.set(false);
      },
      error: () => {
        this.sampleLoading.set(false);
      },
    });
  }
}
