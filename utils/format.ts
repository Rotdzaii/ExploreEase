export function formatCurrency(amount: number, nationality?: string | null) {
  const locale = nationality === 'VN' ? 'vi-VN' : 'en-US';
  const currency = nationality === 'VN' ? 'VND' : 'USD';

  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency,
  }).format(amount);
}

export function parseMoneyToNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value !== 'string') return null;

  const trimmed = value.trim();
  if (!trimmed) return null;

  // Remove everything except digits, comma, dot, and minus.
  const cleaned = trimmed.replace(/[^0-9,.-]/g, '');
  if (!cleaned) return null;

  // Locale-aware heuristic to support both:
  // - en-US: 1,299.50
  // - vi-VN: 1.299,50 (and common currency formats like "1.299.000 ₫")
  let normalized = cleaned;
  const lastComma = normalized.lastIndexOf(',');
  const lastDot = normalized.lastIndexOf('.');
  const hasComma = lastComma !== -1;
  const hasDot = lastDot !== -1;

  const removeAll = (s: string, ch: string) => s.split(ch).join('');

  if (hasComma && hasDot) {
    // Whichever appears last is assumed to be the decimal separator.
    const commaIsDecimal = lastComma > lastDot;
    const decimalSep = commaIsDecimal ? ',' : '.';
    const thousandSep = commaIsDecimal ? '.' : ',';
    normalized = removeAll(normalized, thousandSep);
    if (decimalSep === ',') normalized = normalized.replace(',', '.');
  } else if (hasComma && !hasDot) {
    const parts = normalized.split(',');
    const commaCount = parts.length - 1;
    if (commaCount > 1) {
      // Many commas -> treat as thousand separators.
      normalized = removeAll(normalized, ',');
    } else {
      const decimals = parts[1] ?? '';
      // If exactly 3 digits after comma, it's likely a thousand separator; otherwise decimal.
      if (decimals.length === 3) normalized = removeAll(normalized, ',');
      else normalized = normalized.replace(',', '.');
    }
  } else if (!hasComma && hasDot) {
    const parts = normalized.split('.');
    const dotCount = parts.length - 1;
    if (dotCount > 1) {
      // Many dots -> treat as thousand separators (common in vi-VN).
      normalized = removeAll(normalized, '.');
    } else {
      const decimals = parts[1] ?? '';
      // If exactly 3 digits after dot, it's likely a thousand separator.
      if (decimals.length === 3) normalized = removeAll(normalized, '.');
      // else keep dot as decimal separator.
    }
  }

  // Guard against multiple minus signs.
  normalized = normalized.replace(/(?!^)-/g, '');

  const num = Number(normalized);
  return Number.isFinite(num) ? num : null;
}
