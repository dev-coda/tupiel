/**
 * Removes rows that correspond to bundled Inteligencia demo seeds (same sources as `initInteligenciaDatabase`).
 * Deletes only when stored data still matches the seed payload (same document/id as seed is not enough).
 * Does not truncate tables. `ip_monthly_goals` is not seeded — not modified here.
 */
import { ResultSetHeader } from 'mysql2';
import { getIpPool } from './ip-database';
import { IP_TAREAS_SEED } from './inteligencia-seed-data';
import pacientesSeed from './ip-seed-pacientes.json';
import agendaSeed from './ip-seed-agenda.json';
import fichasSeed from './ip-seed-fichas.json';
import chatSeed from './ip-seed-chat.json';

export interface IpDemoPurgeResult {
  deleted: {
    pacientes: number;
    agenda: number;
    fichas: number;
    tareas: number;
    chat: number;
  };
}

function stableStringify(obj: unknown): string {
  if (obj === null || typeof obj !== 'object') {
    return JSON.stringify(obj);
  }
  if (Array.isArray(obj)) {
    return `[${obj.map((x) => stableStringify(x)).join(',')}]`;
  }
  const keys = Object.keys(obj as Record<string, unknown>).sort();
  const o = obj as Record<string, unknown>;
  return `{${keys.map((k) => `${JSON.stringify(k)}:${stableStringify(o[k])}`).join(',')}}`;
}

/** Compare tarea JSON body to a seed object (ignores numeric `id`). */
function tareaMatchesSeed(data: Record<string, unknown>, seed: Record<string, unknown>): boolean {
  const stripId = (x: Record<string, unknown>) => {
    const { id: _i, ...rest } = x;
    return rest;
  };
  return stableStringify(stripId(data)) === stableStringify(stripId({ ...seed }));
}

function parseJsonRow(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === 'string') {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  if (typeof raw === 'object') {
    return raw as Record<string, unknown>;
  }
  return null;
}

function fichaRowMatchesSeed(
  row: {
    estado: string;
    ticket: string;
    actividad: string;
    notas: string | null;
    origen: string | null;
    modificado_por: string | null;
    modificado_en: string | null;
  },
  seed: Record<string, unknown>
): boolean {
  return (
    row.estado === String(seed.estado) &&
    row.ticket === String(seed.ticket) &&
    row.actividad === String(seed.actividad) &&
    (row.notas ?? '') === String(seed.notas ?? '') &&
    (row.origen ?? null) === (seed.origen != null ? String(seed.origen) : null) &&
    (row.modificado_por ?? null) === (seed.modificadoPor != null ? String(seed.modificadoPor) : null) &&
    (row.modificado_en ?? null) === (seed.modificadoEn != null ? String(seed.modificadoEn) : null)
  );
}

export async function purgeInteligenciaDemoSeedData(): Promise<IpDemoPurgeResult> {
  const pacList = pacientesSeed as Array<Record<string, unknown>>;
  const pacByDoc = new Map(pacList.map((p) => [String(p.doc), p]));
  const pacDocs = [...pacByDoc.keys()];

  const agendaList = agendaSeed as Array<Record<string, unknown> & { id: number }>;
  const agendaById = new Map(agendaList.map((a) => [a.id, a]));
  const agendaIds = [...agendaById.keys()];

  const fichasObj = fichasSeed as Record<string, Record<string, unknown>>;
  const fichaDocs = Object.keys(fichasObj);

  const pool = getIpPool();
  const conn = await pool.getConnection();
  const deleted = { pacientes: 0, agenda: 0, fichas: 0, tareas: 0, chat: 0 };

  try {
    await conn.beginTransaction();

    if (pacDocs.length) {
      const [rows] = await conn.query(
        `SELECT doc, data_json FROM ip_pacientes WHERE doc IN (${pacDocs.map(() => '?').join(',')})`,
        pacDocs
      );
      for (const row of rows as Array<{ doc: string; data_json: unknown }>) {
        const seed = pacByDoc.get(row.doc);
        if (!seed) continue;
        const parsed = parseJsonRow(row.data_json);
        if (!parsed) continue;
        if (stableStringify(parsed) === stableStringify(seed)) {
          const [dr] = await conn.execute('DELETE FROM ip_pacientes WHERE doc = ?', [row.doc]);
          deleted.pacientes += (dr as ResultSetHeader).affectedRows;
        }
      }
    }

    if (agendaIds.length) {
      const [rows] = await conn.query(
        `SELECT id, data_json FROM ip_agenda WHERE id IN (${agendaIds.map(() => '?').join(',')})`,
        agendaIds
      );
      for (const row of rows as Array<{ id: number; data_json: unknown }>) {
        const id = typeof row.id === 'bigint' ? Number(row.id) : Number(row.id);
        const seed = agendaById.get(id);
        if (!seed) continue;
        const parsed = parseJsonRow(row.data_json);
        if (!parsed) continue;
        if (stableStringify(parsed) === stableStringify(seed)) {
          const [dr] = await conn.execute('DELETE FROM ip_agenda WHERE id = ?', [id]);
          deleted.agenda += (dr as ResultSetHeader).affectedRows;
        }
      }
    }

    if (fichaDocs.length) {
      const [rows] = await conn.query(
        `SELECT paciente_doc, estado, ticket, actividad, notas, origen, modificado_por, modificado_en
         FROM ip_fichas WHERE paciente_doc IN (${fichaDocs.map(() => '?').join(',')})`,
        fichaDocs
      );
      for (const row of rows as Array<{
        paciente_doc: string;
        estado: string;
        ticket: string;
        actividad: string;
        notas: string | null;
        origen: string | null;
        modificado_por: string | null;
        modificado_en: string | null;
      }>) {
        const seed = fichasObj[row.paciente_doc];
        if (!seed) continue;
        if (fichaRowMatchesSeed(row, seed)) {
          const [dr] = await conn.execute('DELETE FROM ip_fichas WHERE paciente_doc = ?', [
            row.paciente_doc,
          ]);
          deleted.fichas += (dr as ResultSetHeader).affectedRows;
        }
      }
    }

    const [tareaRows] = await conn.query('SELECT id, data_json FROM ip_tareas');
    const tareas = tareaRows as Array<{ id: number; data_json: unknown }>;
    const seedBodies = IP_TAREAS_SEED as Record<string, unknown>[];
    for (const row of tareas) {
      const data = parseJsonRow(row.data_json);
      if (!data) continue;
      const hit = seedBodies.some((s) => tareaMatchesSeed(data, s));
      if (hit) {
        const [dr] = await conn.execute('DELETE FROM ip_tareas WHERE id = ?', [row.id]);
        deleted.tareas += (dr as ResultSetHeader).affectedRows;
      }
    }

    const chats = chatSeed as Array<{
      usuario: string;
      nombre: string;
      avatar: string;
      texto: string;
      hora: string;
      fecha: string;
    }>;
    for (const m of chats) {
      const [dr] = await conn.execute(
        `DELETE FROM ip_chat_messages
         WHERE usuario = ? AND nombre = ? AND avatar = ? AND texto = ? AND hora = ? AND fecha = ?`,
        [m.usuario, m.nombre, m.avatar, m.texto, m.hora, m.fecha]
      );
      deleted.chat += (dr as ResultSetHeader).affectedRows;
    }

    await conn.commit();
    return { deleted };
  } catch (err) {
    await conn.rollback();
    throw err;
  } finally {
    conn.release();
  }
}
