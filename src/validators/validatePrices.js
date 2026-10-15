/**
 * validatePrices.js — Validate and normalize parsed price records.
 *
 * Responsibilities:
 *   - Validate each price record: date format, valid calendar date,
 *     non-blank instrument, finite numeric close.
 *   - Handle duplicate (instrument + date) records per the first-wins policy.
 *   - Skip invalid rows with a warning (recoverable errors).
 *   - Return only validated, deduplicated price records.
 *
 * Duplicate policy:
 *   - Key = instrument + date (case-sensitive instrument, trimmed).
 *   - Keep the first valid record for each key.
 *   - If a later record has the same key and same close → skip, warn.
 *   - If a later record has the same key but different close → skip, warn.
 *   - A malformed/invalid row does NOT reserve the key.
 *
 * Input:  { header: string[], records: Array<{ date, instrument, close, closeRaw, line }> }
 * Output: Array<{ date: string, instrument: string, close: number }>
 */

// Strict YYYY-MM-DD pattern
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Check if a date string represents a valid calendar date.
 * Requires strict YYYY-MM-DD format and a real calendar date.
 *
 * @param {string} dateStr - The date string to validate.
 * @returns {boolean}
 */
function isValidCalendarDate(dateStr) {
  if (!DATE_REGEX.test(dateStr)) return false;

  const [yearStr, monthStr, dayStr] = dateStr.split('-');
  const year = Number(yearStr);
  const month = Number(monthStr);
  const day = Number(dayStr);

  // Month must be 1–12
  if (month < 1 || month > 12) return false;

  // Day must be 1–(max for that month)
  if (day < 1) return false;

  // Use Date constructor to validate the day is real for that month/year.
  // We construct the date in UTC to avoid timezone issues.
  const d = new Date(Date.UTC(year, month - 1, day));
  return (
    d.getUTCFullYear() === year &&
    d.getUTCMonth() === month - 1 &&
    d.getUTCDate() === day
  );
}

/**
 * Validate and normalize price records.
 *
 * @param {{ header: string[], records: Array<{ date: string, instrument: string, close: number, closeRaw: string, line: number }> }} parsed
 * @returns {Array<{ date: string, instrument: string, close: number }>}
 */
export function validatePrices(parsed) {
  const { records } = parsed;
  const valid = [];
  // Track seen instrument+date keys for duplicate detection.
  // Value is the close price of the first accepted record.
  const seen = new Map();

  for (const record of records) {
    const { date, instrument, close, closeRaw, line } = record;

    // ── Validate date ───────────────────────────────────────────
    if (!date || date.length === 0) {
      process.stderr.write(`Warning: Line ${line}: blank date. Skipping.\n`);
      continue;
    }

    if (!isValidCalendarDate(date)) {
      process.stderr.write(
        `Warning: Line ${line}: invalid date "${date}". Skipping.\n`
      );
      continue;
    }

    // ── Validate instrument ─────────────────────────────────────
    if (!instrument || instrument.length === 0) {
      process.stderr.write(
        `Warning: Line ${line}: blank instrument. Skipping.\n`
      );
      continue;
    }

    // ── Validate close ──────────────────────────────────────────
    if (closeRaw === undefined || closeRaw.length === 0) {
      process.stderr.write(
        `Warning: Line ${line}: blank close price. Skipping.\n`
      );
      continue;
    }

    if (!Number.isFinite(close)) {
      process.stderr.write(
        `Warning: Line ${line}: invalid close price "${closeRaw}". Skipping.\n`
      );
      continue;
    }

    // ── Duplicate detection (first-wins policy) ─────────────────
    const key = `${instrument}\0${date}`;

    if (seen.has(key)) {
      const firstClose = seen.get(key);
      if (firstClose === close) {
        process.stderr.write(
          `Warning: Line ${line}: duplicate record for ${instrument} on ${date} (same close ${close}). Skipping.\n`
        );
      } else {
        process.stderr.write(
          `Warning: Line ${line}: conflicting close for ${instrument} on ${date} ` +
          `(first: ${firstClose}, this: ${close}). Keeping first. Skipping.\n`
        );
      }
      continue;
    }

    // Accept the record
    seen.set(key, close);
    valid.push({ date, instrument, close });
  }

  return valid;
}
