/**
 * alertService.js — Rule dispatch and alert collection.
 *
 * Responsibilities:
 *   - Receive validated rules and the instrument history Map.
 *   - For each rule, find the matching instrument's price history.
 *   - If no history exists for the rule's instrument, skip it (no crash).
 *   - Dispatch to the correct evaluator (levelRule or movingAverageRule).
 *   - Collect all triggered alerts in a single array.
 *   - Each rule is evaluated independently.
 *   - Never print output during evaluation.
 *
 * Input:
 *   - rules: Array of validated rule objects
 *   - pricesByInstrument: Map<string, Array<{ date, close }>>
 *
 * Output: Array of alert objects (unsorted — sorting happens in formatAlerts)
 */

import { evaluateLevelRule } from '../rules/levelRule.js';
import { evaluateMovingAverageRule } from '../rules/movingAverageRule.js';

/**
 * Evaluate all rules and collect triggered alerts.
 *
 * @param {Array<object>} rules - Validated rule objects.
 * @param {Map<string, Array<{ date: string, close: number }>>} pricesByInstrument
 * @returns {Array<{ date: string, ruleId: string, instrument: string, type: string, detail: string }>}
 */
export function evaluateAlerts(rules, pricesByInstrument) {
  const allAlerts = [];

  for (const rule of rules) {
    const history = pricesByInstrument.get(rule.instrument);

    // If the instrument has no price history, this rule simply
    // produces no alerts. This is not an error.
    if (!history || history.length === 0) {
      continue;
    }

    let ruleAlerts;

    if (rule.type === 'level') {
      ruleAlerts = evaluateLevelRule(rule, history);
    } else if (rule.type === 'ma_cross') {
      ruleAlerts = evaluateMovingAverageRule(rule, history);
    }

    if (ruleAlerts) {
      allAlerts.push(...ruleAlerts);
    }
  }

  return allAlerts;
}
