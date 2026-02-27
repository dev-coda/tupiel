import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Determine which database to use
const useLocalDb = process.env.USE_LOCAL_DB === 'true' || process.env.USE_LOCAL_DB === '1';

const dbConfig = useLocalDb
  ? {
      host: process.env.LOCAL_DB_HOST || 'localhost',
      port: parseInt(process.env.LOCAL_DB_PORT || '3306', 10),
      database: process.env.LOCAL_DB_NAME || process.env.DB_NAME,
      user: process.env.LOCAL_DB_USER || 'root',
      password: process.env.LOCAL_DB_PASSWORD || '',
    }
  : {
      host: process.env.DB_HOST,
      port: parseInt(process.env.DB_PORT || '25060', 10),
      database: process.env.DB_NAME,
      user: process.env.DB_USER,
      password: process.env.DB_PASSWORD,
    };

console.log(`Using ${useLocalDb ? 'LOCAL' : 'REMOTE'} database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}`);

const pool: Pool = mysql.createPool({
  ...dbConfig,
  waitForConnections: true,
  connectionLimit: 5, // Limit connections to avoid overloading production
  queueLimit: 0,
  connectTimeout: 10000,
});

/**
 * Execute a read-only query using a connection with READ ONLY transaction mode.
 */
export async function query(text: string, params?: (string | number | null)[]) {
  let conn: PoolConnection | undefined;
  try {
    conn = await pool.getConnection();
    await conn.query('SET SESSION TRANSACTION READ ONLY');
    const start = Date.now();
    const [rows] = await conn.execute(text, params);
    const duration = Date.now() - start;
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    console.log('Executed query', { text: text.substring(0, 80), duration, rows: rowCount });
    return { rows: rows as Record<string, unknown>[], rowCount };
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Test the database connection.
 */
export async function testConnection(): Promise<boolean> {
  let conn: PoolConnection | undefined;
  try {
    conn = await pool.getConnection();
    const [rows] = await conn.query('SELECT NOW() AS now');
    const result = rows as Array<{ now: string }>;
    console.log('Database connected at:', result[0].now);
    return true;
  } catch (err) {
    console.error('Database connection failed:', err);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

export default pool;
