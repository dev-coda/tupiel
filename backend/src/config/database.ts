import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import type { SslOptions } from 'mysql2/typings/mysql/lib/Connection.js';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { join } from 'path';

dotenv.config();

/**
 * Production Database Configuration
 * 
 * By default, connects to the live production database (DigitalOcean).
 * This is READ-ONLY and used for all report generation.
 * 
 * To use a local database dump instead, set USE_LOCAL_DB=true in .env
 */
const useLocalDb = process.env.USE_LOCAL_DB === 'true' || process.env.USE_LOCAL_DB === '1';

// Load production DB credentials from enviroment file if not in .env
let prodDbConfig = {
  host: process.env.DB_HOST,
  port: parseInt(process.env.DB_PORT || '25060', 10),
  database: process.env.DB_NAME || 'tupiel',
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
};

// If production credentials are not in .env, try to load from enviroment file
if (!prodDbConfig.host || !prodDbConfig.user || !prodDbConfig.password) {
  try {
    const envFile = readFileSync(join(process.cwd(), 'enviroment'), 'utf-8');
    const lines = envFile.split('\n');
    for (const line of lines) {
      if (line.startsWith('SERVER=')) {
        const server = line.split('=')[1].trim();
        const [host, port] = server.split(':');
        prodDbConfig.host = host;
        prodDbConfig.port = parseInt(port || '25060', 10);
      } else if (line.startsWith('DB=')) {
        prodDbConfig.database = line.split('=')[1].trim();
      } else if (line.startsWith('USER=')) {
        prodDbConfig.user = line.split('=')[1].trim();
      } else if (line.startsWith('PWD=')) {
        prodDbConfig.password = line.split('=')[1].trim();
      }
    }
  } catch (err) {
    console.warn('Could not load credentials from enviroment file:', err);
  }
}

const dbConfig = useLocalDb
  ? {
      // Local database (for testing with dump)
      host: process.env.LOCAL_DB_HOST || 'localhost',
      port: parseInt(process.env.LOCAL_DB_PORT || '3306', 10),
      database: process.env.LOCAL_DB_NAME || process.env.DB_NAME || 'tupiel',
      user: process.env.LOCAL_DB_USER || 'root',
      password: process.env.LOCAL_DB_PASSWORD || '',
    }
  : {
      // Production database (READ-ONLY)
      ...prodDbConfig,
    };

if (!dbConfig.host || !dbConfig.user || !dbConfig.password) {
  throw new Error(
    'Missing database credentials. Set DB_HOST, DB_USER, DB_PASSWORD in .env or use enviroment file.'
  );
}

/**
 * DigitalOcean managed MySQL (and similar) expect TLS; mysql2 also avoids
 * occasional "Malformed communication packet" issues when TLS matches the server.
 * Set DB_SSL=false to disable. Optional DB_SSL_CA + DB_SSL_REJECT_UNAUTHORIZED=false|true.
 */
function getRemoteMysqlSsl(): SslOptions | undefined {
  if (useLocalDb) return undefined;
  const flag = process.env.DB_SSL?.toLowerCase();
  if (flag === 'false' || flag === '0') return undefined;

  const host = String(dbConfig.host || '');
  const port =
    typeof dbConfig.port === 'number'
      ? dbConfig.port
      : parseInt(String(dbConfig.port || '0'), 10);
  const likelyManagedRemote =
    flag === 'true' ||
    flag === '1' ||
    host.includes('ondigitalocean.com') ||
    port === 25060;

  if (!likelyManagedRemote) return undefined;

  const ssl: SslOptions = {
    rejectUnauthorized: process.env.DB_SSL_REJECT_UNAUTHORIZED !== 'false',
  };
  const caPath = process.env.DB_SSL_CA;
  if (caPath) {
    try {
      ssl.ca = readFileSync(caPath, 'utf8');
    } catch {
      console.warn('DB_SSL_CA file not readable:', caPath);
    }
  }
  if (!ssl.ca) {
    ssl.rejectUnauthorized = false;
  }
  return ssl;
}

const mysqlSsl = getRemoteMysqlSsl();

console.log(`📊 Using ${useLocalDb ? 'LOCAL (DUMP)' : 'PRODUCTION (LIVE)'} database: ${dbConfig.host}:${dbConfig.port}/${dbConfig.database}${mysqlSsl ? ' (TLS)' : ''}`);

const pool: Pool = mysql.createPool({
  ...dbConfig,
  ...(mysqlSsl ? { ssl: mysqlSsl } : {}),
  waitForConnections: true,
  connectionLimit: 5, // Limit connections to avoid overloading production
  queueLimit: 0,
  connectTimeout: 10000,
});

/**
 * Execute a read-only query on the production database.
 * 
 * This connects to the LIVE PRODUCTION database (DigitalOcean) by default.
 * All report data (rentabilidad, estimada, dashboard, controlador) comes from here.
 * 
 * The connection is set to READ ONLY mode to prevent accidental writes.
 */
export async function query(text: string, params?: (string | number | null)[]) {
  let conn: PoolConnection | undefined;
  try {
    conn = await pool.getConnection();
    // Enforce read-only mode for safety
    await conn.query('SET SESSION TRANSACTION READ ONLY');
    const start = Date.now();
    // Use text protocol (query) instead of prepared statements (execute): mysql2 + some
    // MySQL 8 / proxy setups throw ER_MALFORMED_PACKET with execute() after READ ONLY.
    const [rows] =
      params === undefined
        ? await conn.query(text)
        : await conn.query(text, params);
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
