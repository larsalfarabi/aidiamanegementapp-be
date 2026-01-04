/**
 * Date Utility for Jakarta Timezone (WIB)
 *
 * Ensures consistent date handling across the application,
 * avoiding UTC vs Local inconsistencies.
 */

// WIB is UTC+7
const JAKARTA_TZ = 'Asia/Jakarta';

/**
 * Get current date object in Jakarta timezone
 */
export function getJakartaDate(): Date {
  // Create date string in Jakarta time
  const jakartaTimeStr = new Date().toLocaleString('en-US', {
    timeZone: JAKARTA_TZ,
  });
  return new Date(jakartaTimeStr);
}

/**
 * Get current date string in YYYY-MM-DD format (Jakarta time)
 */
export function getJakartaDateString(date: Date = new Date()): string {
  return new Intl.DateTimeFormat('fr-CA', {
    timeZone: JAKARTA_TZ,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

/**
 * Get previous day date string in YYYY-MM-DD format (Jakarta time)
 */
export function getPreviousJakartaDateString(): string {
  const date = getJakartaDate();
  date.setDate(date.getDate() - 1);
  return getJakartaDateString(date);
}
