/**
 * Inteligencia de Pacientes — dedicated MySQL database (default: `tupiel_inteligencia`).
 * No tables here overlap PPTO / monthly config / saved_reports / dias (those stay in `tupiel_app`).
 * Auth remains in `tupiel_app.users`; this module stores CRM data only.
 */
import dotenv from 'dotenv';
dotenv.config();

import mysql, { Pool, PoolConnection } from 'mysql2/promise';
import { ResultSetHeader } from 'mysql2';
import { IP_TAREAS_SEED } from './inteligencia-seed-data';
import pacientesSeed from './ip-seed-pacientes.json';
import agendaSeed from './ip-seed-agenda.json';
import fichasSeed from './ip-seed-fichas.json';
import chatSeed from './ip-seed-chat.json';

function sanitizeDbName(name: string): string {
  if (!/^[a-zA-Z0-9_]+$/.test(name)) {
    throw new Error(`Invalid IP_DB_NAME: ${name}`);
  }
  return name;
}

/**
 * mysql2 / MySQL may return COUNT(*) as number, bigint, or string forms ("0", "0.0", etc.).
 */
function isZeroCount(v: unknown): boolean {
  if (v === 0 || v === 0n) return true;
  if (typeof v === 'string') {
    const t = v.trim();
    if (t === '') return false;
    if (t === '0') return true;
    const n = Number(t);
    return !Number.isNaN(n) && n === 0;
  }
  return false;
}

const ipHost = process.env.IP_DB_HOST || process.env.APP_DB_HOST || 'localhost';
const ipPort = parseInt(process.env.IP_DB_PORT || process.env.APP_DB_PORT || '3306', 10);
const ipDatabase = sanitizeDbName(process.env.IP_DB_NAME || 'tupiel_inteligencia');
const ipUser = process.env.IP_DB_USER || process.env.APP_DB_USER || 'root';
const ipPassword = process.env.IP_DB_PASSWORD ?? process.env.APP_DB_PASSWORD ?? '';

console.log(
  `📇 Inteligencia DB (isolated): ${ipHost}:${ipPort}/${ipDatabase} (user ${ipUser})`
);

let ipPool: Pool | undefined;

async function ensureInteligenciaDatabaseExists(): Promise<void> {
  const conn = await mysql.createConnection({
    host: ipHost,
    port: ipPort,
    user: ipUser,
    password: ipPassword,
  });
  try {
    await conn.query(
      `CREATE DATABASE IF NOT EXISTS \`${ipDatabase}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    console.warn(
      `⚠️  IP_DB: CREATE DATABASE failed (${msg}). Ensure database "${ipDatabase}" exists and user has privileges.`
    );
  } finally {
    await conn.end();
  }
}

/**
 * Execute against the Inteligencia pool once init succeeded.
 * If `initInteligenciaDatabase()` failed or did not complete, there is no pool — `getIpPool()` throws.
 */
export async function inteligenciaQuery(
  text: string,
  params?: (string | number | null | Date)[]
) {
  const pool = getIpPool();
  let conn: PoolConnection | undefined;
  try {
    conn = await pool.getConnection();
    const start = Date.now();
    const [rows] = await conn.execute(text, params);
    const duration = Date.now() - start;
    const rowCount = Array.isArray(rows) ? rows.length : 0;
    console.log('Executed IP-DB query', { text: text.substring(0, 80), duration, rows: rowCount });
    return { rows: rows as Record<string, unknown>[], rowCount };
  } finally {
    if (conn) conn.release();
  }
}

export function getIpPool(): Pool {
  if (!ipPool) {
    throw new Error(
      'Inteligencia DB unavailable: pool not initialized (init failed or did not complete — see startup logs).'
    );
  }
  return ipPool;
}

/**
 * Creates schema + demo seeds in the Inteligencia-only database.
 * Does not throw: failures are logged; the HTTP server can still start without CRM.
 */
export async function initInteligenciaDatabase(): Promise<void> {
  try {
    await ensureInteligenciaDatabaseExists();
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('❌ Inteligencia DB: unreachable or failed during ensure step:', errorMessage);
    console.warn('⚠️  Inteligencia CRM unavailable until the database is reachable and configured.');
    if (ipPool) {
      try {
        await ipPool.end();
      } catch {
        /* ignore */
      }
      ipPool = undefined;
    }
    return;
  }

  if (ipPool) {
    try {
      await ipPool.end();
    } catch {
      /* ignore — replacing pool */
    }
    ipPool = undefined;
  }

  ipPool = mysql.createPool({
    host: ipHost,
    port: ipPort,
    database: ipDatabase,
    user: ipUser,
    password: ipPassword,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    connectTimeout: 10000,
  });

  let initOk = false;
  let conn: PoolConnection | undefined;
  try {
    conn = await ipPool.getConnection();
    await conn.query('SELECT 1');

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ip_pacientes (
        doc VARCHAR(32) NOT NULL PRIMARY KEY,
        data_json JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ip_agenda (
        id BIGINT NOT NULL PRIMARY KEY,
        data_json JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ip_fichas (
        paciente_doc VARCHAR(32) NOT NULL PRIMARY KEY,
        estado VARCHAR(32) NOT NULL,
        ticket VARCHAR(32) NOT NULL,
        actividad VARCHAR(32) NOT NULL,
        notas TEXT,
        origen VARCHAR(512) NULL,
        modificado_por VARCHAR(100) NULL,
        modificado_en VARCHAR(32) NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ip_tareas (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        data_json JSON NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ip_chat_messages (
        id BIGINT AUTO_INCREMENT PRIMARY KEY,
        usuario VARCHAR(100) NOT NULL,
        nombre VARCHAR(200) NOT NULL,
        avatar VARCHAR(32) NOT NULL,
        texto TEXT NOT NULL,
        hora VARCHAR(16) NOT NULL,
        fecha DATE NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    await conn.query(`
      CREATE TABLE IF NOT EXISTS ip_monthly_goals (
        ym CHAR(7) NOT NULL,
        goals_json JSON NOT NULL,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
        PRIMARY KEY (ym)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);

    const [ipPacCount] = await conn.query('SELECT COUNT(*) AS c FROM ip_pacientes');
    if (isZeroCount((ipPacCount as Array<{ c: unknown }>)[0].c)) {
      for (const p of pacientesSeed as Array<{ doc: string }>) {
        await conn.execute('INSERT INTO ip_pacientes (doc, data_json) VALUES (?, ?)', [
          p.doc,
          JSON.stringify(p),
        ]);
      }
      console.log('👥 Seeded ip_pacientes (Inteligencia demo catalog)');
    }

    const [ipAgendaCount] = await conn.query('SELECT COUNT(*) AS c FROM ip_agenda');
    if (isZeroCount((ipAgendaCount as Array<{ c: unknown }>)[0].c)) {
      for (const a of agendaSeed as Array<{ id: number }>) {
        await conn.execute('INSERT INTO ip_agenda (id, data_json) VALUES (?, ?)', [
          a.id,
          JSON.stringify(a),
        ]);
      }
      console.log('📅 Seeded ip_agenda (Inteligencia demo agenda)');
    }

    const [ipFichaCount] = await conn.query('SELECT COUNT(*) AS c FROM ip_fichas');
    if (isZeroCount((ipFichaCount as Array<{ c: unknown }>)[0].c)) {
      const fichas = fichasSeed as Record<string, Record<string, unknown>>;
      for (const [doc, f] of Object.entries(fichas)) {
        await conn.execute(
          `INSERT INTO ip_fichas (paciente_doc, estado, ticket, actividad, notas, origen, modificado_por, modificado_en)
           VALUES (?,?,?,?,?,?,?,?)`,
          [
            doc,
            String(f.estado),
            String(f.ticket),
            String(f.actividad),
            String(f.notas ?? ''),
            f.origen != null ? String(f.origen) : null,
            f.modificadoPor != null ? String(f.modificadoPor) : null,
            f.modificadoEn != null ? String(f.modificadoEn) : null,
          ]
        );
      }
      console.log('📝 Seeded ip_fichas (Inteligencia demo fichas)');
    }

    const [ipChatCount] = await conn.query('SELECT COUNT(*) AS c FROM ip_chat_messages');
    if (isZeroCount((ipChatCount as Array<{ c: unknown }>)[0].c)) {
      for (const m of chatSeed as Array<Record<string, unknown>>) {
        await conn.execute(
          'INSERT INTO ip_chat_messages (usuario, nombre, avatar, texto, hora, fecha) VALUES (?,?,?,?,?,?)',
          [
            String(m.usuario),
            String(m.nombre),
            String(m.avatar),
            String(m.texto),
            String(m.hora),
            String(m.fecha),
          ]
        );
      }
      console.log('💬 Seeded ip_chat_messages (Inteligencia demo chat)');
    }

    const [ipTareaCount] = await conn.query('SELECT COUNT(*) AS c FROM ip_tareas');
    if (isZeroCount((ipTareaCount as Array<{ c: unknown }>)[0].c)) {
      for (const row of IP_TAREAS_SEED) {
        const [ins] = await conn.execute('INSERT INTO ip_tareas (data_json) VALUES (?)', [
          JSON.stringify(row),
        ]);
        const insertId = (ins as ResultSetHeader).insertId;
        await conn.execute('UPDATE ip_tareas SET data_json = ? WHERE id = ?', [
          JSON.stringify({ ...row, id: insertId }),
          insertId,
        ]);
      }
      console.log('📋 Seeded ip_tareas (Inteligencia demo tasks)');
    }

    initOk = true;
    console.log('✅ Inteligencia de Pacientes database initialized');
  } catch (err) {
    const errorMessage = err instanceof Error ? err.message : String(err);
    console.error('❌ Failed to initialize Inteligencia database:', errorMessage);
    console.warn('⚠️  Inteligencia CRM features may be unavailable until this is fixed.');
  } finally {
    if (conn) conn.release();
  }

  if (!initOk && ipPool) {
    try {
      await ipPool.end();
    } catch {
      /* ignore */
    }
    ipPool = undefined;
  }
}
