/**
 * Date utilities — all dates use local timezone (TZ=America/Bogota).
 *
 * IMPORTANT: Never use toISOString() for date-only strings —
 * it always returns UTC, which can shift the date after 7pm COT.
 */

/** Format a Date as YYYY-MM-DD in local timezone. */
export function toDateString(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

/** Get today's date as YYYY-MM-DD in local timezone. */
export function todayStr(): string {
  return toDateString(new Date());
}
