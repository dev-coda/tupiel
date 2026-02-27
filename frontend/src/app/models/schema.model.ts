export interface ColumnInfo {
  name: string;
  type: string;
  maxLength: number | null;
  nullable: string;
  default: string | null;
  key: string;
  extra: string;
}

export interface TableInfo {
  schema: string;
  table: string;
  columns: ColumnInfo[];
}

export interface ForeignKey {
  table_schema: string;
  table_name: string;
  column_name: string;
  foreign_table_schema: string;
  foreign_table_name: string;
  foreign_column_name: string;
  constraint_name: string;
}

export interface RowCount {
  table_schema: string;
  table_name: string;
  estimated_row_count: number;
}

export interface SchemaResponse {
  tables: TableInfo[];
}

export interface ForeignKeysResponse {
  foreignKeys: ForeignKey[];
}

export interface RowCountsResponse {
  rowCounts: RowCount[];
}

export interface SampleResponse {
  table: string;
  rows: Record<string, unknown>[];
  count: number;
}

export interface HealthResponse {
  status: string;
  timestamp: string;
  database: string;
}
