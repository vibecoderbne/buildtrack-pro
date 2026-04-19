/**
 * Weekday-based date utilities for task scheduling.
 *
 * Convention: duration_days represents working (weekday) days.
 *   - duration 1  → task starts and ends on the same weekday
 *   - duration 5  → Mon→Fri (5 weekdays inclusive)
 *   - duration 6  → Mon→Mon of the following week
 *
 * Saturdays and Sundays are never counted and never land as end dates.
 * If a start date falls on a weekend, addWeekdays snaps forward to Monday.
 */

// ── Internal helpers ──────────────────────────────────────────────────────────

/**
 * Parses a YYYY-MM-DD string into a local-timezone Date, avoiding the
 * UTC-midnight off-by-one that `new Date('YYYY-MM-DD')` causes in timezones
 * east of UTC.
 */
export function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number)
  return new Date(y, m - 1, d)
}

/**
 * Formats a Date as a YYYY-MM-DD string using local timezone values.
 */
export function formatDate(date: Date): string {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

// ── Exported utilities ────────────────────────────────────────────────────────

/**
 * Returns the date that is `days` working days from `startDate` (inclusive).
 *
 * Examples (no public holidays considered):
 *   addWeekdays(Monday,  1) → Monday      (same day)
 *   addWeekdays(Monday,  5) → Friday
 *   addWeekdays(Friday,  2) → Monday
 *   addWeekdays(Saturday,1) → Monday      (snaps to next weekday)
 */
export function addWeekdays(startDate: Date, days: number): Date {
  const result = new Date(startDate)

  // Snap forward past any weekend so we always start on a weekday
  while (result.getDay() === 0 || result.getDay() === 6) {
    result.setDate(result.getDate() + 1)
  }

  // The start date itself counts as day 1
  let remaining = Math.max(1, days) - 1
  while (remaining > 0) {
    result.setDate(result.getDate() + 1)
    if (result.getDay() !== 0 && result.getDay() !== 6) {
      remaining--
    }
  }

  return result
}

/**
 * Counts the number of weekday days from `startDate` to `endDate`, inclusive
 * of both endpoints — matching the duration_days storage convention.
 *
 * Returns at least 1 so that a task is never zero-duration.
 *
 * Examples:
 *   countWeekdays(Monday, Monday)  → 1
 *   countWeekdays(Monday, Friday)  → 5
 *   countWeekdays(Friday, Monday)  → 1  (endDate < startDate → minimum)
 */
export function countWeekdays(startDate: Date, endDate: Date): number {
  if (endDate <= startDate) return 1

  let count = 0
  const d = new Date(startDate)

  while (d <= endDate) {
    const day = d.getDay()
    if (day !== 0 && day !== 6) count++
    d.setDate(d.getDate() + 1)
  }

  return Math.max(1, count)
}
