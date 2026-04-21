import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';

dotenv.config();

/**
 * App Database Configuration (Local Read-Write)
 * 
 * This is a LOCAL database used for application-specific data that requires writes:
 * - dias_no_laborales (non-working days)
 * - monthly_configs (monthly configuration versions)
 * - employee_presupuestos (employee budgets)
 * - product_metas (product targets)
 * - saved_reports (daily report snapshots)
 *
 * Inteligencia de Pacientes (ip_* tables) lives in a separate MySQL database — see `ip-database.ts`.
 *
 * This is SEPARATE from the production database which is read-only.
 * The production database is used for all report data (rentabilidad, estimada, etc.)
 */
const appDbConfig = {
  host: process.env.APP_DB_HOST || 'localhost',
  port: parseInt(process.env.APP_DB_PORT || '3306', 10),
  database: process.env.APP_DB_NAME || 'tupiel_app',
  user: process.env.APP_DB_USER || 'root',
  password: process.env.APP_DB_PASSWORD || '',
};

console.log(`💾 App database (local read-write): ${appDbConfig.host}:${appDbConfig.port}/${appDbConfig.database}`);

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
    
    // Test connection first
    await conn.query('SELECT 1');
    
    // Create dias_no_laborales table (database should already exist)
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
    
    // Create monthly_configs table - stores monthly configuration snapshots
    await conn.query(`
      CREATE TABLE IF NOT EXISTS monthly_configs (
        id INT AUTO_INCREMENT PRIMARY KEY,
        year INT NOT NULL,
        month INT NOT NULL,
        version INT NOT NULL DEFAULT 1,
        meta_global DECIMAL(15, 2) NOT NULL,
        meta_productos DECIMAL(15, 2) NOT NULL,
        facturado_productos DECIMAL(15, 2) NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        UNIQUE KEY uk_year_month_version (year, month, version),
        INDEX idx_year_month (year, month),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Create employee_presupuestos table - stores employee budgets per month/version
    await conn.query(`
      CREATE TABLE IF NOT EXISTS employee_presupuestos (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_id INT NOT NULL,
        nombre VARCHAR(255) NOT NULL,
        categoria ENUM('DERMATOLOGÍA', 'MED ESTÉTICA', 'TP LOUNGE') NOT NULL,
        presupuesto DECIMAL(15, 2) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (config_id) REFERENCES monthly_configs(id) ON DELETE CASCADE,
        INDEX idx_config_id (config_id),
        INDEX idx_nombre (nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Create product_metas table - stores product targets per month/version
    await conn.query(`
      CREATE TABLE IF NOT EXISTS product_metas (
        id INT AUTO_INCREMENT PRIMARY KEY,
        config_id INT NOT NULL,
        producto_nombre VARCHAR(255) NOT NULL,
        meta INT NOT NULL,
        disponibles INT NOT NULL DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (config_id) REFERENCES monthly_configs(id) ON DELETE CASCADE,
        INDEX idx_config_id (config_id),
        INDEX idx_producto (producto_nombre)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    
    // Create saved_reports table - stores daily automated report snapshots
    await conn.query(`
      CREATE TABLE IF NOT EXISTS saved_reports (
        id INT AUTO_INCREMENT PRIMARY KEY,
        report_date DATE NOT NULL,
        report_type ENUM('dashboard', 'controlador', 'rentabilidad', 'estimada') NOT NULL,
        date_from DATE NOT NULL,
        date_to DATE NOT NULL,
        config_version INT NULL,
        report_data LONGTEXT NULL,
        file_path VARCHAR(500) NULL,
        file_size BIGINT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        INDEX idx_report_date (report_date),
        INDEX idx_report_type (report_type),
        INDEX idx_date_range (date_from, date_to),
        INDEX idx_created_at (created_at)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Create users table for authentication
    await conn.query(`
      CREATE TABLE IF NOT EXISTS users (
        id INT AUTO_INCREMENT PRIMARY KEY,
        username VARCHAR(100) NOT NULL UNIQUE,
        name VARCHAR(255) NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    // Inteligencia de Pacientes — per-user role/cargo (mirrors legacy admin vs operario)
    await migrateUsersInteligenciaColumns(conn);

    // Seed default user if no users exist
    const [existingUsers] = await conn.query('SELECT COUNT(*) AS cnt FROM users');
    const userCount = (existingUsers as Array<{ cnt: number }>)[0].cnt;
    if (userCount === 0) {
      const hash = await bcrypt.hash('DidierTuPiel2025', 10);
      await conn.query(
        'INSERT INTO users (username, name, password_hash, ip_rol, ip_cargo) VALUES (?, ?, ?, ?, ?)',
        ['Didier', 'Didier', hash, 'operario', 'Usuario']
      );
      console.log('👤 Default user "Didier" seeded');
    }

    // Create hidden_employees table - tracks employees hidden from monthly config
    await conn.query(`
      CREATE TABLE IF NOT EXISTS hidden_employees (
        id INT AUTO_INCREMENT PRIMARY KEY,
        nombre VARCHAR(255) NOT NULL,
        categoria ENUM('DERMATOLOGÍA', 'MED ESTÉTICA', 'TP LOUNGE') NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        UNIQUE KEY uk_nombre_cat (nombre, categoria)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    console.log('✅ App database initialized successfully');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('❌ Failed to initialize app database:', errorMessage);
    // Don't throw - allow app to continue even if table creation fails
    // The table might already exist or permissions might be limited
    console.warn('⚠️  Continuing without app database initialization. Some features may not work.');
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

/** Add ip_rol / ip_cargo and align legacy rule: username "admin" → admin; ensure ≥1 admin exists. */
async function migrateUsersInteligenciaColumns(conn: PoolConnection): Promise<void> {
  const alters = [
    `ALTER TABLE users ADD COLUMN ip_rol ENUM('admin','operario') NOT NULL DEFAULT 'operario'`,
    `ALTER TABLE users ADD COLUMN ip_cargo VARCHAR(255) NULL`,
  ];
  for (const sql of alters) {
    try {
      await conn.query(sql);
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code;
      // MySQL: ER_DUP_FIELDNAME — column already exists
      if (code !== 'ER_DUP_FIELDNAME') throw e;
    }
  }

  await conn.query(
    `UPDATE users SET ip_rol = 'admin', ip_cargo = COALESCE(NULLIF(TRIM(ip_cargo), ''), 'Administrador')
     WHERE LOWER(username) = 'admin'`
  );

  const [cntRows] = await conn.query(`SELECT COUNT(*) AS c FROM users WHERE ip_rol = 'admin'`);
  const adminCount = Number((cntRows as Array<{ c: number }>)[0]?.c ?? 0);
  if (adminCount === 0) {
    const [minRows] = await conn.query(`SELECT MIN(id) AS mid FROM users`);
    const mid = (minRows as Array<{ mid: number }>)[0]?.mid;
    if (mid != null) {
      await conn.query(
        `UPDATE users SET ip_rol = 'admin', ip_cargo = COALESCE(NULLIF(TRIM(ip_cargo), ''), 'Administrador') WHERE id = ?`,
        [mid]
      );
      console.log('👤 Promoted earliest user to Inteligencia admin (no admin row existed)');
    }
  }
}
