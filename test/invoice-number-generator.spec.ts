import { InvoiceNumberGenerator } from '../src/modules/orders/utils/invoice-number-generator';

describe('InvoiceNumberGenerator', () => {
  describe('generate', () => {
    it('should generate correct invoice number for January 2025', () => {
      const date = new Date('2025-01-15');
      const result = InvoiceNumberGenerator.generate(date, 1);
      expect(result).toBe('SL/OJ-MKT/I/25/0001');
    });

    it('should generate correct invoice number for December 2025', () => {
      const date = new Date('2025-12-31');
      const result = InvoiceNumberGenerator.generate(date, 999);
      expect(result).toBe('SL/OJ-MKT/XII/25/0999');
    });

    it('should pad sequence number with zeros', () => {
      const date = new Date('2025-06-15');
      const result = InvoiceNumberGenerator.generate(date, 42);
      expect(result).toBe('SL/OJ-MKT/VI/25/0042');
    });
  });

  describe('parse', () => {
    it('should parse invoice number correctly', () => {
      const invoiceNumber = 'SL/OJ-MKT/IX/25/0123';
      const result = InvoiceNumberGenerator.parse(invoiceNumber);

      expect(result).toEqual({
        prefix: 'SL/OJ-MKT',
        romanMonth: 'IX',
        shortYear: '25',
        sequence: '0123',
        month: 9,
        year: 2025,
      });
    });

    it('should return null for invalid format', () => {
      const invalidNumber = 'INVALID-FORMAT';
      const result = InvoiceNumberGenerator.parse(invalidNumber);
      expect(result).toBeNull();
    });
  });

  describe('month to roman conversion', () => {
    const testCases = [
      { month: 1, expected: 'I' },
      { month: 2, expected: 'II' },
      { month: 3, expected: 'III' },
      { month: 4, expected: 'IV' },
      { month: 5, expected: 'V' },
      { month: 6, expected: 'VI' },
      { month: 7, expected: 'VII' },
      { month: 8, expected: 'VIII' },
      { month: 9, expected: 'IX' },
      { month: 10, expected: 'X' },
      { month: 11, expected: 'XI' },
      { month: 12, expected: 'XII' },
    ];

    testCases.forEach(({ month, expected }) => {
      it(`should convert month ${month} to roman ${expected}`, () => {
        const date = new Date(2025, month - 1, 1);
        const result = InvoiceNumberGenerator.generate(date, 1);
        expect(result).toContain(`/${expected}/`);
      });
    });
  });
});
