import { appQuery } from '../config/app-database';

export interface DiaNoLaboral {
  id: number;
  fecha: string; // YYYY-MM-DD
  descripcion: string | null;
  created_at?: string;
  updated_at?: string;
}

/**
 * Get all non-working days.
 */
export async function getAllDiasNoLaborales(): Promise<DiaNoLaboral[]> {
  const result = await appQuery(
    'SELECT id, fecha, descripcion, created_at, updated_at FROM dias_no_laborales ORDER BY fecha DESC'
  );
  return result.rows as DiaNoLaboral[];
}

/**
 * Get a non-working day by ID.
 */
export async function getDiaNoLaboralById(id: number): Promise<DiaNoLaboral | null> {
  const result = await appQuery(
    'SELECT id, fecha, descripcion, created_at, updated_at FROM dias_no_laborales WHERE id = ?',
    [id]
  );
  return result.rows.length > 0 ? (result.rows[0] as DiaNoLaboral) : null;
}

/**
 * Create a new non-working day.
 */
export async function createDiaNoLaboral(
  fecha: string,
  descripcion?: string | null
): Promise<DiaNoLaboral> {
  let conn;
  try {
    const { default: pool } = await import('../config/app-database');
    conn = await pool.getConnection();
    const [result] = await conn.execute(
      'INSERT INTO dias_no_laborales (fecha, descripcion) VALUES (?, ?)',
      [fecha, descripcion || null]
    );
    const insertResult = result as any;
    const newId = insertResult.insertId;
    
    const created = await getDiaNoLaboralById(newId);
    if (!created) {
      throw new Error('Failed to retrieve created dia no laboral');
    }
    return created;
  } finally {
    if (conn) conn.release();
  }
}

/**
 * Update a non-working day.
 */
export async function updateDiaNoLaboral(
  id: number,
  fecha: string,
  descripcion?: string | null
): Promise<DiaNoLaboral> {
  await appQuery(
    'UPDATE dias_no_laborales SET fecha = ?, descripcion = ? WHERE id = ?',
    [fecha, descripcion || null, id]
  );
  
  const updated = await getDiaNoLaboralById(id);
  if (!updated) {
    throw new Error('Failed to retrieve updated dia no laboral');
  }
  return updated;
}

/**
 * Delete a non-working day.
 */
export async function deleteDiaNoLaboral(id: number): Promise<void> {
  await appQuery('DELETE FROM dias_no_laborales WHERE id = ?', [id]);
}

/**
 * Add all Sundays of the current year.
 */
export async function addAllSundaysOfYear(year?: number): Promise<number> {
  const targetYear = year || new Date().getFullYear();
  const sundays: string[] = [];
  
  // Find all Sundays in the year
  const date = new Date(targetYear, 0, 1); // January 1st
  // Find first Sunday
  while (date.getDay() !== 0) {
    date.setDate(date.getDate() + 1);
  }
  
  // Collect all Sundays
  while (date.getFullYear() === targetYear) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    sundays.push(`${year}-${month}-${day}`);
    date.setDate(date.getDate() + 7); // Next Sunday
  }
  
  // Insert all Sundays (ignore duplicates)
  let inserted = 0;
  for (const fecha of sundays) {
    try {
      await appQuery(
        'INSERT IGNORE INTO dias_no_laborales (fecha, descripcion) VALUES (?, ?)',
        [fecha, 'Domingo']
      );
      inserted++;
    } catch (err) {
      // Ignore duplicate key errors
      console.log(`Skipping duplicate date: ${fecha}`);
    }
  }
  
  return inserted;
}

/**
 * Check if a date is a non-working day.
 */
export async function isDiaNoLaboral(fecha: string): Promise<boolean> {
  const result = await appQuery(
    'SELECT COUNT(*) as count FROM dias_no_laborales WHERE fecha = ?',
    [fecha]
  );
  const count = (result.rows[0] as { count: number }).count;
  return count > 0;
}
