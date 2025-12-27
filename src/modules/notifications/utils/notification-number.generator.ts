/**
 * Notification Number Generator
 * Format: NOTIF-YYYYMMDD-XXX
 * Example: NOTIF-20250129-001
 */
export class NotificationNumberGenerator {
  /**
   * Generate notification number based on date and sequence
   */
  static generate(date: Date, sequence: number, attempt: number = 0): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');

    // ✅ Logic Attempt: Tambahkan attempt ke sequence agar nomor berbeda saat retry
    const effectiveSequence = sequence + attempt;
    const seq = String(effectiveSequence).padStart(3, '0');

    return `NOTIF-${year}${month}${day}-${seq}`;
  }

  /**
   * Parse notification number to extract date and sequence
   */
  static parse(notificationNumber: string): {
    date: Date;
    sequence: number;
  } | null {
    const pattern = /^NOTIF-(\d{4})(\d{2})(\d{2})-(\d{3})$/;
    const match = notificationNumber.match(pattern);

    if (!match) {
      return null;
    }

    const [, year, month, day, seq] = match;
    return {
      date: new Date(parseInt(year), parseInt(month) - 1, parseInt(day)),
      sequence: parseInt(seq),
    };
  }

  /**
   * Get next sequence number for today
   */
  static async getNextSequence(
    lastNotificationNumber: string | null,
  ): Promise<number> {
    if (!lastNotificationNumber) {
      return 1;
    }

    const parsed = this.parse(lastNotificationNumber);
    if (!parsed) {
      return 1;
    }

    const today = new Date();
    const lastDate = parsed.date;

    // If last notification is from today, increment sequence
    if (
      today.getFullYear() === lastDate.getFullYear() &&
      today.getMonth() === lastDate.getMonth() &&
      today.getDate() === lastDate.getDate()
    ) {
      return parsed.sequence + 1;
    }

    // If last notification is from previous day, reset to 1
    return 1;
  }
}
