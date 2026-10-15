/**
 * priceProcessor.js — Group accepted price records by instrument
 * and sort each group chronologically.
 *
 * Responsibilities:
 *   - Group validated price records by instrument name (case-sensitive).
 *   - Sort each instrument's observations by date ascending.
 *   - Return a Map where each key is an instrument name and
 *     each value is a chronologically sorted array of { date, close }.
 *
 * Input:  Array<{ date: string, instrument: string, close: number }>
 * Output: Map<string, Array<{ date: string, close: number }>>
 *
 * Why a Map?
 *   - Preserves insertion order (though we don't depend on it).
 *   - Lookup by instrument name is O(1).
 *   - Clear semantics: instrument → sorted price history.
 */

/**
 * Group prices by instrument and sort each group chronologically.
 *
 * @param {Array<{ date: string, instrument: string, close: number }>} prices
 * @returns {Map<string, Array<{ date: string, close: number }>>}
 */
export function processPrices(prices) {
  const grouped = new Map();

  for (const { date, instrument, close } of prices) {
    if (!grouped.has(instrument)) {
      grouped.set(instrument, []);
    }
    grouped.get(instrument).push({ date, close });
  }

  // Sort each instrument's prices chronologically.
  // Dates are in YYYY-MM-DD format, so lexicographic string comparison
  // gives correct chronological order.
  for (const [, history] of grouped) {
    history.sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  }

  return grouped;
}
