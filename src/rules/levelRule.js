/**
 * levelRule.js — Level-crossing detection.
 *
 * Compares consecutive chronological closing prices against a configured
 * threshold (level) to detect crossings.
 *
 * Logic:
 *   direction "above": trigger when previousClose <= level AND currentClose > level
 *   direction "below": trigger when previousClose >= level AND currentClose < level
 *
 * Key behaviors:
 *   - The first observation cannot trigger (no previous close to compare).
 *   - Merely starting beyond the threshold does not trigger.
 *   - Staying on the same side does not repeatedly trigger.
 *   - Crossing back and crossing again produces a new alert.
 *   - Equality at the level is handled by the <= / >= in the conditions.
 *
 * Input:  rule object + chronologically sorted price history for the instrument
 * Output: Array of alert objects { date, ruleId, instrument, type, detail }
 */

/**
 * Evaluate a level-crossing rule against an instrument's price history.
 *
 * @param {{ id: string, instrument: string, type: string, direction: string, level: number }} rule
 * @param {Array<{ date: string, close: number }>} history - Chronologically sorted prices.
 * @returns {Array<{ date: string, ruleId: string, instrument: string, type: string, detail: string }>}
 */
export function evaluateLevelRule(rule, history) {
  const { id, instrument, direction, level } = rule;
  const alerts = [];

  // Need at least 2 observations to detect a crossing
  if (history.length < 2) return alerts;

  for (let i = 1; i < history.length; i++) {
    const prevClose = history[i - 1].close;
    const currClose = history[i].close;

    let triggered = false;

    if (direction === 'above') {
      // Crossed upward through the level
      triggered = prevClose <= level && currClose > level;
    } else if (direction === 'below') {
      // Crossed downward through the level
      triggered = prevClose >= level && currClose < level;
    }

    if (triggered) {
      alerts.push({
        date: history[i].date,
        ruleId: id,
        instrument,
        type: 'level',
        detail: `level ${direction} ${level}`,
      });
    }
  }

  return alerts;
}
