export class InvoiceNumberGenerator {
  /**
   * Convert month number to Roman numeral
   */
  private static monthToRoman(month: number): string {
    const romanNumerals = [
      'I',
      'II',
      'III',
      'IV',
      'V',
      'VI',
      'VII',
      'VIII',
      'IX',
      'X',
      'XI',
      'XII',
    ];
    return romanNumerals[month - 1];
  }

  /**
   * Generate invoice number in format: SL/OJ-MKT/IX/25/0001
   * @param invoiceDate Date when invoice is generated
   * @param sequenceNumber Sequential number for the month/year
   * @returns Formatted invoice number
   */
  static generate(invoiceDate: Date, sequenceNumber: number): string {
    const month = invoiceDate.getMonth() + 1; // getMonth() returns 0-11
    const year = invoiceDate.getFullYear();
    const romanMonth = this.monthToRoman(month);
    const shortYear = year.toString().slice(-2); // Get last 2 digits
    const paddedSequence = sequenceNumber.toString().padStart(4, '0');

    return `SL/OJ-MKT/${romanMonth}/${shortYear}/${paddedSequence}`;
  }

  /**
   * Parse invoice number to extract components
   * @param invoiceNumber Invoice number string
   * @returns Object with parsed components
   */
  static parse(invoiceNumber: string): {
    prefix: string;
    romanMonth: string;
    shortYear: string;
    sequence: string;
    month: number;
    year: number;
  } | null {
    const pattern = /^SL\/OJ-MKT\/([IVX]+)\/(\d{2})\/(\d{4})$/;
    const match = invoiceNumber.match(pattern);

    if (!match) return null;

    const [, romanMonth, shortYear, sequence] = match;

    // Convert Roman to month number
    const romanToMonth: { [key: string]: number } = {
      I: 1,
      II: 2,
      III: 3,
      IV: 4,
      V: 5,
      VI: 6,
      VII: 7,
      VIII: 8,
      IX: 9,
      X: 10,
      XI: 11,
      XII: 12,
    };

    const month = romanToMonth[romanMonth];
    const year = 2000 + parseInt(shortYear);

    return {
      prefix: 'SL/OJ-MKT',
      romanMonth,
      shortYear,
      sequence,
      month,
      year,
    };
  }
}
