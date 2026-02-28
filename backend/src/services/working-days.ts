import { appQuery } from '../config/app-database';

/**
 * Calculate working days in a date range, excluding non-working days from the database.
 * @param from Start date (YYYY-MM-DD)
 * @param to End date (YYYY-MM-DD)
 * @returns Number of working days
 */
export async function calculateWorkingDays(from: string, to: string): Promise<number> {
  // Get all non-working days in the range
  const result = await appQuery(
    `SELECT fecha FROM dias_no_laborales 
     WHERE fecha >= ? AND fecha <= ?`,
    [from, to]
  );
  
  const nonWorkingDays = new Set(
    result.rows.map((row: any) => row.fecha as string)
  );
  
  // Count all days in range, excluding weekends and non-working days
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  let workingDays = 0;
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    const dateStr = current.toISOString().substring(0, 10);
    
    // Exclude weekends (Saturday = 6, Sunday = 0)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      // Exclude non-working days from database
      if (!nonWorkingDays.has(dateStr)) {
        workingDays++;
      }
    }
    
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
}

/**
 * Calculate working days in a specific month.
 * @param year Year (e.g., 2026)
 * @param month Month (1-12)
 * @returns Number of working days in the month
 */
export async function calculateWorkingDaysInMonth(year: number, month: number): Promise<number> {
  const firstDay = new Date(year, month - 1, 1);
  const lastDay = new Date(year, month, 0);
  
  const from = firstDay.toISOString().substring(0, 10);
  const to = lastDay.toISOString().substring(0, 10);
  
  return calculateWorkingDays(from, to);
}

/**
 * Get working days for a date range (synchronous fallback if database is unavailable).
 * This is used as a fallback when the app database is not available.
 */
export function calculateWorkingDaysFallback(from: string, to: string): number {
  const start = new Date(from + 'T00:00:00');
  const end = new Date(to + 'T00:00:00');
  let workingDays = 0;
  
  const current = new Date(start);
  while (current <= end) {
    const dayOfWeek = current.getDay();
    // Exclude weekends only (fallback doesn't check database)
    if (dayOfWeek !== 0 && dayOfWeek !== 6) {
      workingDays++;
    }
    current.setDate(current.getDate() + 1);
  }
  
  return workingDays;
}
