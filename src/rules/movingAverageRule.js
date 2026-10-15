/**
 * movingAverageRule.js — Moving-average crossover detection.
 *
 * Calculates simple moving averages (SMAs) for configured short and long
 * windows, then detects crossovers between consecutive valid MA pairs.
 *
 * SMA formula:
 *   SMA_N(t) = sum of the last N closing prices / N
 *
 * Requirements:
 *   - Only complete windows produce valid SMAs (no partial windows, no zero-fill).
 *   - The first valid MA pair (both short and long SMAs available) establishes
 *     the baseline — it does NOT trigger an alert.
 *   - A crossover is detected by comparing two consecutive valid MA pairs.
 *   - For short=5, long=20: first valid pair at observation index 19 (obs #20),
 *     earliest crossover check at index 20 (obs #21).
 *
 * Crossover conditions:
 *   direction "above": prevShortMA <= prevLongMA AND currShortMA > currLongMA
 *   direction "below": prevShortMA >= prevLongMA AND currShortMA < currLongMA
 *
 * Input:  rule object + chronologically sorted price history
 * Output: Array of alert objects { date, ruleId, instrument, type, detail }
 */

/**
 * Evaluate a moving-average crossover rule.
 *
 * @param {{ id: string, instrument: string, type: string, direction: string, short: number, long: number }} rule
 * @param {Array<{ date: string, close: number }>} history - Chronologically sorted prices.
 * @returns {Array<{ date: string, ruleId: string, instrument: string, type: string, detail: string }>}
 */
export function evaluateMovingAverageRule(rule, history) {
  const { id, instrument, direction, short: shortWindow, long: longWindow } = rule;
  const alerts = [];

  // Need at least longWindow observations for the first valid long SMA,
  // plus one more to compare consecutive pairs.
  // First valid pair at index (longWindow - 1).
  // First comparison at index longWindow.
  if (history.length < longWindow + 1) return alerts;

  // Precompute prefix sums for efficient SMA calculation.
  // prefixSum[i] = sum of history[0].close through history[i-1].close
  // So sum of history[a..b] = prefixSum[b+1] - prefixSum[a]
  const prefixSum = new Array(history.length + 1);
  prefixSum[0] = 0;
  for (let i = 0; i < history.length; i++) {
    prefixSum[i + 1] = prefixSum[i] + history[i].close;
  }

  /**
   * Calculate SMA ending at index `endIdx` with the given window size.
   * Uses prefix sums: average of history[endIdx - window + 1 .. endIdx].
   */
  function sma(endIdx, window) {
    const startIdx = endIdx - window + 1;
    return (prefixSum[endIdx + 1] - prefixSum[startIdx]) / window;
  }

  // The first index where both short and long SMAs are valid is (longWindow - 1).
  // That's the baseline — we start comparing from (longWindow).
  let prevShortMA = sma(longWindow - 1, shortWindow);
  let prevLongMA = sma(longWindow - 1, longWindow);

  for (let i = longWindow; i < history.length; i++) {
    const currShortMA = sma(i, shortWindow);
    const currLongMA = sma(i, longWindow);

    let triggered = false;

    if (direction === 'above') {
      triggered = prevShortMA <= prevLongMA && currShortMA > currLongMA;
    } else if (direction === 'below') {
      triggered = prevShortMA >= prevLongMA && currShortMA < currLongMA;
    }

    if (triggered) {
      alerts.push({
        date: history[i].date,
        ruleId: id,
        instrument,
        type: 'ma_cross',
        detail: `ma_cross ${shortWindow}/${longWindow} ${direction}`,
      });
    }

    prevShortMA = currShortMA;
    prevLongMA = currLongMA;
  }

  return alerts;
}
