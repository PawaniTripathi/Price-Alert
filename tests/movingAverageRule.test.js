/**
 * movingAverageRule.test.js — Tests for moving-average crossover detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateMovingAverageRule } from '../src/rules/movingAverageRule.js';

// Helper to build a price history from an array of [date, close] pairs
function hist(entries) {
  return entries.map(([date, close]) => ({ date, close }));
}

// Helper to build an MA rule with small default windows for easier testing
function maRule(overrides = {}) {
  return {
    id: 'r2',
    instrument: 'TCS',
    type: 'ma_cross',
    direction: 'above',
    short: 2,
    long: 3,
    ...overrides,
  };
}

// Generate dated history: sequential dates starting from a base
function datedHist(closes, startDate = '2026-01-01') {
  const base = new Date(startDate);
  return closes.map((close, i) => {
    const d = new Date(base);
    d.setDate(d.getDate() + i);
    const ds = d.toISOString().slice(0, 10);
    return { date: ds, close };
  });
}

describe('Moving Average Rule', () => {
  // ── Insufficient history ─────────────────────────────────────────

  it('should return no alerts when history is too short for long window', () => {
    const rule = maRule({ short: 5, long: 20 });
    const history = datedHist(Array(20).fill(100)); // exactly 20 obs, need 21
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 0);
  });

  it('should return no alerts with empty history', () => {
    const rule = maRule({ short: 2, long: 3 });
    const alerts = evaluateMovingAverageRule(rule, []);
    assert.equal(alerts.length, 0);
  });

  // ── First valid pair — no false alert ────────────────────────────

  it('should not trigger on the first valid MA pair (baseline only)', () => {
    // With short=2, long=3: first valid pair at index 2 (obs 3).
    // We need 4 observations for one comparison.
    // Use a flat series where short MA = long MA.
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([100, 100, 100, 100]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 0);
  });

  it('should not trigger when first valid pair already has short > long', () => {
    // short=2, long=3. First valid pair at index 2.
    // [10, 10, 20] → SMA2=[15], SMA3=[13.33] → short > long at baseline
    // [10, 10, 20, 30] → at index 3: SMA2=25, SMA3=20 → still short > long → no crossing
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([10, 10, 20, 30]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 0); // Already above at baseline, stays above
  });

  // ── Earliest valid crossover ─────────────────────────────────────

  it('should detect crossover at the earliest valid comparison point', () => {
    // short=2, long=3. First valid pair at index 2, first comparison at index 3.
    // Obs: [100, 100, 100, 120]
    // Index 2: SMA2 = avg(100,100) = 100, SMA3 = avg(100,100,100) = 100 → short <= long ✓
    // Index 3: SMA2 = avg(100,120) = 110, SMA3 = avg(100,100,120) = 106.67 → short > long ✓
    // → triggers "above" at index 3
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([100, 100, 100, 120]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-01-04');
    assert.equal(alerts[0].ruleId, 'r2');
    assert.equal(alerts[0].detail, 'ma_cross 2/3 above');
  });

  // ── Upward crossover ─────────────────────────────────────────────

  it('should detect upward crossover (above)', () => {
    // short=2, long=3
    // [100, 90, 80, 120]
    // Index 2: SMA2 = avg(90,80) = 85, SMA3 = avg(100,90,80) = 90 → S <= L
    // Index 3: SMA2 = avg(80,120) = 100, SMA3 = avg(90,80,120) = 96.67 → S > L → trigger
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([100, 90, 80, 120]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-01-04');
  });

  // ── Downward crossover ───────────────────────────────────────────

  it('should detect downward crossover (below)', () => {
    // short=2, long=3
    // [80, 90, 100, 70]
    // Index 2: SMA2 = avg(90,100) = 95, SMA3 = avg(80,90,100) = 90 → S >= L
    // Index 3: SMA2 = avg(100,70) = 85, SMA3 = avg(90,100,70) = 86.67 → S < L → trigger
    const rule = maRule({ short: 2, long: 3, direction: 'below' });
    const history = datedHist([80, 90, 100, 70]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-01-04');
    assert.equal(alerts[0].detail, 'ma_cross 2/3 below');
  });

  // ── Equality / touching ──────────────────────────────────────────

  it('should not trigger when SMAs are equal and direction is above', () => {
    // Both SMAs stay equal → no crossing
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([100, 100, 100, 100, 100]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 0);
  });

  it('should trigger when moving from equal to short > long (above)', () => {
    // [100, 100, 100, 110]
    // Index 2: SMA2=100, SMA3=100 → S <= L ✓
    // Index 3: SMA2=105, SMA3=103.33 → S > L ✓ → trigger
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([100, 100, 100, 110]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 1);
  });

  // ── Different window sizes ───────────────────────────────────────

  it('should work with short=3, long=5', () => {
    // Need 6 observations minimum. First valid pair at index 4.
    // [100, 100, 100, 100, 100, 130]
    // Index 4: SMA3 = avg(100,100,100)=100, SMA5 = avg(100,100,100,100,100)=100 → S<=L
    // Index 5: SMA3 = avg(100,100,130)=110, SMA5 = avg(100,100,100,100,130)=106 → S>L → trigger
    const rule = maRule({ short: 3, long: 5, direction: 'above' });
    const history = datedHist([100, 100, 100, 100, 100, 130]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-01-06');
    assert.equal(alerts[0].detail, 'ma_cross 3/5 above');
  });

  // ── No partial windows ──────────────────────────────────────────

  it('should not use partial windows', () => {
    // With short=5, long=20, we need exactly 21 observations for one comparison.
    // 20 observations → zero comparisons → zero alerts
    const rule = maRule({ short: 5, long: 20 });
    const prices = Array(20).fill(100);
    prices.push(200); // obs 21
    const history = datedHist(prices);
    // First valid pair at index 19, first comparison at index 20.
    // Should have exactly one comparison point. 
    // Index 19: all 100s → SMA5=100, SMA20=100 → equal → baseline
    // Index 20: SMA5 = avg(100,100,100,100,200) = 120, SMA20 = avg(nineteen 100s + 200) = 105 → S > L
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 1);
  });

  // ── Independent instruments ──────────────────────────────────────

  it('should produce independent results for different instruments', () => {
    const rule1 = maRule({ id: 'r1', instrument: 'TCS', short: 2, long: 3, direction: 'above' });
    const rule2 = maRule({ id: 'r2', instrument: 'INFY', short: 2, long: 3, direction: 'above' });

    const tcsHistory = datedHist([100, 100, 100, 120]); // crosses above
    const infyHistory = datedHist([100, 100, 100, 80]); // does not cross above

    const alerts1 = evaluateMovingAverageRule(rule1, tcsHistory);
    const alerts2 = evaluateMovingAverageRule(rule2, infyHistory);

    assert.equal(alerts1.length, 1);
    assert.equal(alerts2.length, 0);
  });

  // ── Correct SMA calculation ──────────────────────────────────────

  it('should compute correct SMA values', () => {
    // short=2, long=3, [10, 20, 30, 40]
    // Index 2: SMA2 = avg(20,30) = 25, SMA3 = avg(10,20,30) = 20 → S > L (baseline, S >= L)
    // Index 3: SMA2 = avg(30,40) = 35, SMA3 = avg(20,30,40) = 30 → S > L still
    // For direction=above: at baseline S >= L, and at index 3 S > L → need prev S <= L
    // Since baseline has S > L already, this stays above → no trigger for "above"
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([10, 20, 30, 40]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 0); // Already above at baseline
  });

  // ── No incorrect duplicate alerts ────────────────────────────────

  it('should not produce duplicate alerts for staying above after crossing', () => {
    // short=2, long=3
    // [100, 100, 100, 120, 130, 140]
    // Index 2: SMA2=100, SMA3=100 → S<=L
    // Index 3: SMA2=110, SMA3=106.67 → S>L → trigger
    // Index 4: SMA2=125, SMA3=116.67 → S>L → no trigger (already above)
    // Index 5: SMA2=135, SMA3=130 → S>L → no trigger
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([100, 100, 100, 120, 130, 140]);
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-01-04');
  });

  // ── Cross back and recross ───────────────────────────────────────

  it('should detect recrossing after crossing back', () => {
    // short=2, long=3
    // [100, 100, 100, 120, 90, 120]
    // Index 2: SMA2=100, SMA3=100 → S<=L
    // Index 3: SMA2=110, SMA3=106.67 → S>L → trigger (above)
    // Index 4: SMA2=105, SMA3=103.33 → S>L → still above, no trigger
    // Wait — let me recalculate:
    // Index 4: SMA2=avg(120,90)=105, SMA3=avg(100,120,90)=103.33 → S>L still
    // Index 5: SMA2=avg(90,120)=105, SMA3=avg(120,90,120)=110 → S<L
    // Hmm, need a clearer cross-back.
    // Let's use [100, 100, 100, 120, 80, 70, 120]
    // Index 2: SMA2=100, SMA3=100 → S<=L
    // Index 3: SMA2=110, SMA3=106.67 → S>L → trigger
    // Index 4: SMA2=100, SMA3=100 → S<=L (crossed back)
    // Index 5: SMA2=75, SMA3=90 → S<L
    // Index 6: SMA2=95, SMA3=90 → S>L → trigger again
    const rule = maRule({ short: 2, long: 3, direction: 'above' });
    const history = datedHist([100, 100, 100, 120, 80, 70, 120]);

    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].date, '2026-01-04');
    assert.equal(alerts[1].date, '2026-01-07');
  });

  // ── short=5, long=20 window ──────────────────────────────────────

  it('should handle short=5, long=20 correctly', () => {
    // Build 22 observations: first 20 are flat 100, then jump to 200, 200
    const rule = maRule({ short: 5, long: 20, direction: 'above' });
    const closes = Array(20).fill(100);
    closes.push(200, 200);
    const history = datedHist(closes);
    // Index 19: SMA5=100, SMA20=100 → S<=L (baseline)
    // Index 20: SMA5=avg(100,100,100,100,200)=120, SMA20=avg(19*100+200)/20=105 → S>L → trigger
    const alerts = evaluateMovingAverageRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-01-21');
  });
});
