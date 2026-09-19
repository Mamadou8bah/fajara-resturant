/**
 * Money policy (MON-001 / MON-002)
 *
 * Storage: PostgreSQL `numeric(12,2)` / Prisma `Decimal(12, 2)` for all currency fields.
 * Calculation: work in integer cents; round half-away-from-zero via `Math.round(n * 100)`.
 * Sequence (always, server-authoritative via `calculateBill`):
 *   1. Line totals = (unit price + modifier totals) × quantity
 *   2. Subtotal = sum of line totals
 *   3. Discounts (capped at subtotal)
 *   4. Taxable amount / tax (from configured rate; inclusive or exclusive)
 *   5. Tip
 *   6. Final total
 * Display strings use two decimal places (`fromCents` → `toFixed(2)`).
 */

export type MoneyInput = number | string;

export function toCents(value: MoneyInput): number {
  const n = typeof value === 'string' ? Number(value) : value;
  if (!Number.isFinite(n)) {
    throw new Error(`Invalid money value: ${value}`);
  }
  return Math.round(n * 100);
}

export function fromCents(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function roundMoney(value: MoneyInput): string {
  return fromCents(toCents(value));
}

export interface LineInput {
  unitPrice: MoneyInput;
  quantity: number;
  modifierTotal?: MoneyInput;
}

export interface BillInput {
  lines: LineInput[];
  discountAmount?: MoneyInput;
  taxRatePercent?: MoneyInput;
  taxInclusive?: boolean;
  tipAmount?: MoneyInput;
}

export interface BillTotals {
  linesSubtotal: string;
  discountAmount: string;
  taxableAmount: string;
  taxAmount: string;
  tipAmount: string;
  total: string;
}

export function calculateBill(input: BillInput): BillTotals {
  const linesSubtotalCents = input.lines.reduce((sum, line) => {
    const unit = toCents(line.unitPrice) + toCents(line.modifierTotal ?? 0);
    return sum + unit * line.quantity;
  }, 0);

  const discountCents = Math.min(
    toCents(input.discountAmount ?? 0),
    linesSubtotalCents,
  );
  const afterDiscount = linesSubtotalCents - discountCents;

  const rate = Number(input.taxRatePercent ?? 0);
  const taxInclusive = Boolean(input.taxInclusive);
  let taxCents = 0;
  let taxableAmount = afterDiscount;

  if (rate > 0) {
    if (taxInclusive) {
      taxCents = Math.round(afterDiscount - afterDiscount / (1 + rate / 100));
      taxableAmount = afterDiscount - taxCents;
    } else {
      taxCents = Math.round(afterDiscount * (rate / 100));
      taxableAmount = afterDiscount;
    }
  }

  const tipCents = toCents(input.tipAmount ?? 0);
  const totalCents = taxInclusive
    ? afterDiscount + tipCents
    : afterDiscount + taxCents + tipCents;

  return {
    linesSubtotal: fromCents(linesSubtotalCents),
    discountAmount: fromCents(discountCents),
    taxableAmount: fromCents(taxableAmount),
    taxAmount: fromCents(taxCents),
    tipAmount: fromCents(tipCents),
    total: fromCents(totalCents),
  };
}
