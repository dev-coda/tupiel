import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import dotenv from 'dotenv';

dotenv.config();

// Local app database configuration (separate from production read-only DB)
const appDbConfig = {
  host: process.env.APP_DB_HOST || 'localhost',
  port: parseInt(process.env.APP_DB_PORT || '3306', 10),
  database: process.env.APP_DB_NAME || 'tupiel_app',
  user: process.env.APP_DB_USER || 'root',
  password: process.env.APP_DB_PASSWORD || '',
};

console.log(`App database: ${appDbConfig.host}:${appDbConfig.port}/${appDbConfig.database}`);

const appPool: Pool = mysql.createPool({
  ...appDbConfig,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
  connectTimeout: 10000,
});

/**
 * Execute a query on the app database (read-write).
 */
export async function appQuery(text: string, params?: (string | number | null | Date)[]) {
  let conn: PoolConnection | undefined;
  try {
    conn = await appPool.getConnection();
    const start = Date.now();
    const [rows] = await conn.execute(text, params);
    const duration = Date.now() - start;
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    console.log('Executed app query', { text: text.substring(0, 80), duration, rows: rowCount });
    return { rows: rows as Record<string, unknown>[], rowCount };
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Initialize the app database schema.
 */
export async function initAppDatabase(): Promise<void> {
  let conn: PoolConnection | undefined;
  try {
    conn = await appPool.getConnection();
    
    // Create database if it doesn't exist
    await conn.query(`CREATE DATABASE IF NOT EXISTS ${appDbConfig.database}`);
    await conn.query(`USE ${appDbConfig.database}`);
    
    // Create dias_no_laborales table
    await conn.query(`
      CREATE TABLE IF NOT EXISTS dias_no_laborales (
        id INT AUTO_INCREMENT PRIMARY KEY,
        fecha DATE NOT NULL UNIQUE,
        descripcion VARCHAR(255) NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        INDEX idx_fecha (fecha)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    console.log('✅ App database initialized successfully');
  } catch (err) {
    console.error('❌ Failed to initialize app database:', err);
    throw err;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Test the app database connection.
 */
export async function testAppConnection(): Promise<boolean> {
  let conn: PoolConnection | undefined;
  try {
    conn = await appPool.getConnection();
    const [rows] = await conn.query('SELECT NOW() AS now');
    const result = rows as Array<{ now: string }>;
    console.log('App database connected at:', result[0].now);
    return true;
  } catch (err) {
    console.error('App database connection failed:', err);
    return false;
  } finally {
    if (conn) conn.release();
  }
}

export default appPool;
