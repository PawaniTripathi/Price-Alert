/**
 * levelRule.test.js — Tests for level-crossing detection.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateLevelRule } from '../src/rules/levelRule.js';

// Helper to build a price history from an array of [date, close] pairs
function hist(entries) {
  return entries.map(([date, close]) => ({ date, close }));
}

// Helper to build a level rule
function levelRule(overrides = {}) {
  return {
    id: 'r1',
    instrument: 'INFY',
    type: 'level',
    direction: 'below',
    level: 1500,
    ...overrides,
  };
}

describe('Level Rule', () => {
  // ── Basic crossings ──────────────────────────────────────────────

  it('should detect downward crossing (below)', () => {
    const rule = levelRule({ direction: 'below', level: 1500 });
    const history = hist([
      ['2026-09-01', 1534.10],
      ['2026-09-02', 1510.00],
      ['2026-09-03', 1498.00],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-09-03');
    assert.equal(alerts[0].ruleId, 'r1');
    assert.equal(alerts[0].detail, 'level below 1500');
  });

  it('should detect upward crossing (above)', () => {
    const rule = levelRule({ direction: 'above', level: 1500 });
    const history = hist([
      ['2026-09-01', 1490],
      ['2026-09-02', 1505],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-09-02');
    assert.equal(alerts[0].detail, 'level above 1500');
  });

  // ── First observation ────────────────────────────────────────────

  it('should not trigger on the first observation', () => {
    const rule = levelRule({ direction: 'below', level: 1500 });
    const history = hist([['2026-09-01', 1400]]); // Below level, but first obs
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 0);
  });

  it('should not trigger with zero observations', () => {
    const rule = levelRule();
    const alerts = evaluateLevelRule(rule, []);
    assert.equal(alerts.length, 0);
  });

  // ── Already beyond threshold ─────────────────────────────────────

  it('should not trigger when already below (direction=below)', () => {
    const rule = levelRule({ direction: 'below', level: 1500 });
    const history = hist([
      ['2026-09-01', 1400],
      ['2026-09-02', 1390],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 0);
  });

  it('should not trigger when already above (direction=above)', () => {
    const rule = levelRule({ direction: 'above', level: 1500 });
    const history = hist([
      ['2026-09-01', 1600],
      ['2026-09-02', 1610],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 0);
  });

  // ── Staying on the same side ─────────────────────────────────────

  it('should not repeatedly trigger when staying below', () => {
    const rule = levelRule({ direction: 'below', level: 1500 });
    const history = hist([
      ['2026-09-01', 1510],
      ['2026-09-02', 1490],
      ['2026-09-03', 1480],
      ['2026-09-04', 1470],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-09-02');
  });

  // ── Equality at the level ────────────────────────────────────────

  it('should not trigger when close equals level exactly (direction=below)', () => {
    // prev=1510 (>= 1500), curr=1500 (not < 1500) → no trigger
    const rule = levelRule({ direction: 'below', level: 1500 });
    const history = hist([
      ['2026-09-01', 1510],
      ['2026-09-02', 1500],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 0);
  });

  it('should not trigger when close equals level exactly (direction=above)', () => {
    // prev=1490 (<= 1500), curr=1500 (not > 1500) → no trigger
    const rule = levelRule({ direction: 'above', level: 1500 });
    const history = hist([
      ['2026-09-01', 1490],
      ['2026-09-02', 1500],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 0);
  });

  it('should trigger when crossing through equality (prev=level, curr crosses)', () => {
    // prev=1500 (>= 1500), curr=1490 (< 1500) → triggers below
    const rule = levelRule({ direction: 'below', level: 1500 });
    const history = hist([
      ['2026-09-01', 1500],
      ['2026-09-02', 1490],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 1);
  });

  // ── Crossing back and recrossing ─────────────────────────────────

  it('should trigger again when crossing back and recrossing', () => {
    const rule = levelRule({ direction: 'below', level: 1500 });
    const history = hist([
      ['2026-09-01', 1510],
      ['2026-09-02', 1490], // cross below → alert
      ['2026-09-03', 1510], // cross back above
      ['2026-09-04', 1490], // cross below again → alert
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 2);
    assert.equal(alerts[0].date, '2026-09-02');
    assert.equal(alerts[1].date, '2026-09-04');
  });

  // ── Multiple rules for one instrument ────────────────────────────

  it('should support multiple rules on the same instrument independently', () => {
    const rule1 = levelRule({ id: 'r1', direction: 'below', level: 1500 });
    const rule2 = levelRule({ id: 'r2', direction: 'above', level: 1500 });
    const history = hist([
      ['2026-09-01', 1510],
      ['2026-09-02', 1490],
      ['2026-09-03', 1510],
    ]);
    const alerts1 = evaluateLevelRule(rule1, history);
    const alerts2 = evaluateLevelRule(rule2, history);
    assert.equal(alerts1.length, 1); // crosses below on 09-02
    assert.equal(alerts2.length, 1); // crosses above on 09-03
  });

  // ── Identical rules with different IDs ───────────────────────────

  it('should produce separate alerts for identical rules with different IDs', () => {
    const rule1 = levelRule({ id: 'r1', direction: 'below', level: 1500 });
    const rule2 = levelRule({ id: 'r2', direction: 'below', level: 1500 });
    const history = hist([
      ['2026-09-01', 1510],
      ['2026-09-02', 1490],
    ]);
    const alerts1 = evaluateLevelRule(rule1, history);
    const alerts2 = evaluateLevelRule(rule2, history);
    assert.equal(alerts1.length, 1);
    assert.equal(alerts2.length, 1);
    assert.equal(alerts1[0].ruleId, 'r1');
    assert.equal(alerts2[0].ruleId, 'r2');
  });

  // ── Multiple alerts on the same date (from different rules) ──────

  it('should allow multiple alerts on the same date', () => {
    const rule1 = levelRule({ id: 'r1', direction: 'below', level: 1500 });
    const rule2 = levelRule({ id: 'r2', direction: 'below', level: 1510 });
    const history = hist([
      ['2026-09-01', 1520],
      ['2026-09-02', 1490],
    ]);
    // Both levels are crossed on the same day
    const alerts1 = evaluateLevelRule(rule1, history);
    const alerts2 = evaluateLevelRule(rule2, history);
    assert.equal(alerts1.length, 1);
    assert.equal(alerts2.length, 1);
    assert.equal(alerts1[0].date, '2026-09-02');
    assert.equal(alerts2[0].date, '2026-09-02');
  });

  // ── Assessment example ───────────────────────────────────────────

  it('should produce the assessment example result', () => {
    const rule = levelRule({ id: 'r1', instrument: 'INFY', direction: 'below', level: 1500 });
    const history = hist([
      ['2026-09-01', 1534.10],
      ['2026-09-02', 1510.00],
      ['2026-09-03', 1498.00],
    ]);
    const alerts = evaluateLevelRule(rule, history);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].date, '2026-09-03');
    assert.equal(alerts[0].ruleId, 'r1');
    assert.equal(alerts[0].instrument, 'INFY');
    assert.equal(alerts[0].detail, 'level below 1500');
  });
});
