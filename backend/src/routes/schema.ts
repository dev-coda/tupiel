import { Router, Request, Response } from 'express';
import { query } from '../config/database';

const router = Router();
const DB_NAME = process.env.DB_NAME || 'tupiel';

// GET /api/schema — List all tables with columns, types, and row counts
router.get('/', async (_req: Request, res: Response) => {
  try {
    const tablesResult = await query(`
      SELECT
        TABLE_SCHEMA AS table_schema,
        TABLE_NAME AS table_name,
        COLUMN_NAME AS column_name,
        DATA_TYPE AS data_type,
        CHARACTER_MAXIMUM_LENGTH AS max_length,
        IS_NULLABLE AS is_nullable,
        COLUMN_DEFAULT AS column_default,
        COLUMN_KEY AS column_key,
        EXTRA AS extra
      FROM information_schema.COLUMNS
      WHERE TABLE_SCHEMA = ?
      ORDER BY TABLE_NAME, ORDINAL_POSITION
    `, [DB_NAME]);

    // Group columns by table
    const tables: Record<string, {
      schema: string;
      table: string;
      columns: Array<{
        name: string;
        type: string;
        maxLength: number | null;
        nullable: string;
        default: string | null;
        key: string;
        extra: string;
      }>;
    }> = {};

    for (const row of tablesResult.rows) {
      const key = `${row.table_schema}.${row.table_name}`;
      if (!tables[key]) {
        tables[key] = {
          schema: row.table_schema as string,
          table: row.table_name as string,
          columns: [],
        };
      }
      tables[key].columns.push({
        name: row.column_name as string,
        type: row.data_type as string,
        maxLength: row.max_length as number | null,
        nullable: row.is_nullable as string,
        default: row.column_default as string | null,
        key: row.column_key as string,
        extra: row.extra as string,
      });
    }

    res.json({ tables: Object.values(tables) });
  } catch (err) {
    console.error('Schema query failed:', err);
    res.status(500).json({ error: 'Failed to fetch schema' });
  }
});

// GET /api/schema/foreign-keys — List all foreign key relationships
router.get('/foreign-keys', async (_req: Request, res: Response) => {
  try {
    const fkResult = await query(`
      SELECT
        TABLE_SCHEMA AS table_schema,
        TABLE_NAME AS table_name,
        COLUMN_NAME AS column_name,
        REFERENCED_TABLE_SCHEMA AS foreign_table_schema,
        REFERENCED_TABLE_NAME AS foreign_table_name,
        REFERENCED_COLUMN_NAME AS foreign_column_name,
        CONSTRAINT_NAME AS constraint_name
      FROM information_schema.KEY_COLUMN_USAGE
      WHERE TABLE_SCHEMA = ?
        AND REFERENCED_TABLE_NAME IS NOT NULL
      ORDER BY TABLE_NAME
    `, [DB_NAME]);

    res.json({ foreignKeys: fkResult.rows });
  } catch (err) {
    console.error('Foreign keys query failed:', err);
    res.status(500).json({ error: 'Failed to fetch foreign keys' });
  }
});

// GET /api/schema/row-counts — Row counts for all tables
router.get('/row-counts', async (_req: Request, res: Response) => {
  try {
    const countResult = await query(`
      SELECT
        TABLE_SCHEMA AS table_schema,
        TABLE_NAME AS table_name,
        TABLE_ROWS AS estimated_row_count
      FROM information_schema.TABLES
      WHERE TABLE_SCHEMA = ?
        AND TABLE_TYPE = 'BASE TABLE'
      ORDER BY TABLE_ROWS DESC
    `, [DB_NAME]);

    res.json({ rowCounts: countResult.rows });
  } catch (err) {
    console.error('Row counts query failed:', err);
    res.status(500).json({ error: 'Failed to fetch row counts' });
  }
});

// GET /api/schema/sample/:table — Sample 10 rows from a table
router.get('/sample/:table', async (req: Request, res: Response) => {
  const table = req.params.table as string;

  // Whitelist: only allow alphanumeric and underscores to prevent injection
  const safePattern = /^[a-zA-Z_][a-zA-Z0-9_]*$/;
  if (!safePattern.test(table)) {
    res.status(400).json({ error: 'Invalid table name' });
    return;
  }

  try {
    const result = await query(
      `SELECT * FROM \`${table}\` LIMIT 10`
    );
    res.json({ table, rows: result.rows, count: result.rows.length });
  } catch (err) {
    console.error(`Sample query failed for ${table}:`, err);
    res.status(500).json({ error: 'Failed to fetch sample data' });
  }
});

export default router;
