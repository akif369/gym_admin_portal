/**
 * Timezone utilities for Asia/Kolkata (IST, UTC+5:30).
 *
 * Production pattern:
 *  - Timestamps are ALWAYS stored in UTC in the database.
 *  - These helpers convert between UTC Date objects and IST calendar
 *    boundaries so that queries use the correct UTC window.
 *  - Never mutate process.env.TZ — keep Node.js UTC-agnostic.
 */

export const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000; // 5h 30m in ms

/**
 * Returns a YYYY-MM-DD string for the given UTC Date, interpreted in IST.
 * e.g. new Date('2026-08-16T20:00:00Z') → '2026-08-17' (next day in IST)
 */
export function toISTDateString(utcDate: Date): string {
  return utcDate.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' }); // en-CA → YYYY-MM-DD
}

/**
 * Returns a UTC Date representing the start of a calendar day in IST.
 * e.g. '2026-08-16' → 2026-08-15T18:30:00.000Z  (IST 00:00 = UTC 18:30 prev day)
 */
export function istDayStart(istDateStr?: string): Date {
  const ymd = istDateStr ?? toISTDateString(new Date());
  return new Date(`${ymd}T00:00:00+05:30`);
}

/**
 * Returns a UTC Date representing the end of a calendar day in IST (23:59:59.999).
 */
export function istDayEnd(istDateStr?: string): Date {
  const ymd = istDateStr ?? toISTDateString(new Date());
  return new Date(`${ymd}T23:59:59.999+05:30`);
}

/**
 * Returns a UTC Date representing the start of the current IST month.
 */
export function istMonthStart(utcDate = new Date()): Date {
  const ymd = toISTDateString(utcDate); // YYYY-MM-DD in IST
  return new Date(`${ymd.slice(0, 8)}01T00:00:00+05:30`);
}
