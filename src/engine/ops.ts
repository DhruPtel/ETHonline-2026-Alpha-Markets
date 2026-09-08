// The deterministic arithmetic a report plan executes. Five operations, no judgment — which maths
// to run is the plan's decision, not this file's.
//
// ⚠️ **No floating point anywhere.** The gateway returns figures at up to 23 decimal places —
// `24917272809.52169350845770191155245` is a real one — and a JS number silently rounds them. These
// results are hashed and settled against, so a rounded figure is a wrong figure with a plausible
// face on it. This is the single most important constraint in the file.
//
// ── Why BigInt at a fixed scale, and not a decimal library ───────────────────────────────────────
//
// Of the operations here, only division is inexact. Addition, subtraction and comparison over
// BigInt at a common scale are exact *by construction* — there is no rounding decision to get
// wrong, so a library would be carrying a dependency to solve a problem these three do not have.
//
// Division does need a rounding rule, and a library would not remove that decision — it would name
// it. The rule here is truncation toward zero at `SCALE`, documented below, and it applies to
// ratios rather than to money: utilization is a ratio read to a few places, while the USD figures
// that must be exact only ever go through `sum` and `net`.
//
// So: exact where exactness is required, one explicit rule where it cannot be, and no dependency.
// If the operation set grows to need roots, logs or compounding, revisit — that is a different file.

import type { Decimal } from '../types/wire.js';

/**
 * Working scale.
 *
 * ⚠️ **Raised from 40 to 80 on 2026-09-07**, after ranking across all 25 live deployments hit
 * `0.00000000000000162926873065418174459347072777589` — a token price with **47 decimal places**.
 * The original 40 was sized against the 23 places seen on the five development deployments, and the
 * five were not representative.
 *
 * The binding constraint is not decimal places, it is **significant digits plus leading zeros**. The
 * Graph's BigDecimal carries up to 34 significant digits, so a sub-unit price of 1e-14 needs 14
 * zeros plus 34 digits = 48 places. 80 leaves room for prices down to about 1e-46.
 *
 * Raising it is safe for hashes already computed: `format` trims trailing zeros, so a value inside
 * the old scale formats identically under the new one. And the failure mode is a loud throw naming
 * the value, never a silent truncation — so if 80 is ever exceeded we will be told.
 */
const SCALE = 80;
const UNIT = 10n ** BigInt(SCALE);
const PLAIN_DECIMAL = /^-?\d+(\.\d+)?$/;

/**
 * Decimal string → scaled BigInt.
 *
 * ⚠️ Throws on exponent notation and on more than `SCALE` decimal places rather than coercing.
 * Silently truncating a hashed figure is the exact failure this file exists to prevent, and a loud
 * error naming the value is recoverable where a quiet wrong answer is not.
 */
function parse(d: Decimal): bigint {
  if (!PLAIN_DECIMAL.test(d)) throw new Error(`not a plain decimal string: "${d}"`);
  const negative = d.startsWith('-');
  const [whole, fraction = ''] = (negative ? d.slice(1) : d).split('.');
  if (fraction.length > SCALE) throw new Error(`"${d}" carries ${fraction.length} decimal places, past the working scale of ${SCALE}`);
  const scaled = BigInt(whole + fraction.padEnd(SCALE, '0'));
  return negative ? -scaled : scaled;
}

/** Scaled BigInt → decimal string, trailing zeros trimmed. */
function format(x: bigint): Decimal {
  const negative = x < 0n;
  const abs = negative ? -x : x;
  const whole = (abs / UNIT).toString();
  const fraction = (abs % UNIT).toString().padStart(SCALE, '0').replace(/0+$/, '');
  return `${negative ? '-' : ''}${whole}${fraction ? `.${fraction}` : ''}`;
}

/** `a − b`. Exact. The gross-vs-net correction: deposits minus borrows. */
export function net(a: Decimal, b: Decimal): Decimal {
  return format(parse(a) - parse(b));
}

/** Exact. Totals across markets — no drift however many terms, because nothing rounds. */
export function sum(values: readonly Decimal[]): Decimal {
  return format(values.reduce((acc, v) => acc + parse(v), 0n));
}

/**
 * `a ÷ b`, truncated toward zero at `SCALE`.
 *
 * ⚠️ **Returns `null` when `b` is zero, and that is not an edge case.** `cream-finance-ethereum` and
 * `zerolend-ethereum` both report $0 deposits and $0 borrows today. Their utilization is *undefined*,
 * not zero — and the difference matters, because zero reads as an answer. A protocol with nothing in
 * it and a protocol with nothing borrowed are not the same finding.
 */
export function ratio(a: Decimal, b: Decimal): Decimal | null {
  const divisor = parse(b);
  if (divisor === 0n) return null;
  return format((parse(a) * UNIT) / divisor);
}

/** `-1 | 0 | 1`. Exact, so it orders 23-decimal figures correctly where a float would tie them. */
export function compare(a: Decimal, b: Decimal): -1 | 0 | 1 {
  const [x, y] = [parse(a), parse(b)];
  return x < y ? -1 : x > y ? 1 : 0;
}

/** Group rows by a derived key — markets by asset, deployments by class. No arithmetic. */
export function groupBy<T>(rows: readonly T[], key: (row: T) => string): Record<string, T[]> {
  const out: Record<string, T[]> = {};
  for (const row of rows) (out[key(row)] ??= []).push(row);
  return out;
}

/** Top `n` by a decimal field, descending. ⚠️ Rows with no value sort last, never as zero. */
export function rank<T>(rows: readonly T[], value: (row: T) => Decimal | null, n = rows.length): T[] {
  return [...rows]
    .sort((p, q) => {
      const [a, b] = [value(p), value(q)];
      if (a === null && b === null) return 0;
      if (a === null) return 1;
      if (b === null) return -1;
      return compare(b, a);
    })
    .slice(0, n);
}
