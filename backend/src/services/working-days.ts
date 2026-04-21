import { appQuery } from '../config/app-database';
import { toDateString } from '../utils/dates';

/**
 * Calculate working days in a date range.
 * 
 * Working days = total calendar days in range − days marked in dias_no_laborales.
 * 
 * Weekends are NOT automatically excluded — if Sundays (or any other day)
 * should be non-working, they must be added to the dias_no_laborales table.
 * This is done via the "Agregar Domingos" feature in the UI.
 * 
 * @param from Start date (YYYY-MM-DD)
 * @param to End date (YYYY-MM-DD)
 * @returns Number of working days
 */
export async function calculateWorkingDays(from: string, to: string): Promise<number> {
  // Count total calendar days in range
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;

  // Get non-working days count from database
  let nonWorkingCount = 0;

  try {
    const result = await appQuery(
      `SELECT COUNT(*) as cnt FROM dias_no_laborales 
       WHERE fecha >= ? AND fecha <= ?`,
      [from, to]
    );
    nonWorkingCount = Number(result.rows[0]?.cnt || 0);
  } catch (err) {
    console.warn('Could not fetch non-working days from database:', err);
    // If DB is unavailable, return total calendar days (no deductions)
  }

  return Math.max(1, totalDays - nonWorkingCount);
}

/**
 * Calculate working days in a specific month.
 * 
 * @param year Year (e.g., 2026)
 * @param month Month (1-12)
 * @returns Number of working days in the month
 */
export async function calculateWorkingDaysInMonth(year: number, month: number): Promise<number> {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);

  const from = toDateString(firstDay);
  const to = toDateString(lastDay);

  return calculateWorkingDays(from, to);
}

/**
 * Fallback: returns total calendar days when the database is unavailable.
 */
export function calculateWorkingDaysFallback(from: string, to: string): number {
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  const totalDays = Math.round((end.getTime() - start.getTime()) / 86_400_000) + 1;
  return Math.max(1, totalDays);
}
