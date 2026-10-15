/**
 * cli.test.js — End-to-end CLI tests using child_process.
 *
 * Tests the complete pipeline by running `node alerts.js` as a subprocess
 * and verifying stdout, stderr, and exit codes.
 */

import { describe, it, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { promisify } from 'node:util';

import { processPrices } from '../src/utils/priceProcessor.js';
import { evaluateAlerts } from '../src/services/alertService.js';
import { formatAlerts } from '../src/output/formatAlerts.js';

const execFileAsync = promisify(execFile);

const PROJECT_ROOT = join(import.meta.dirname, '..');
const TMP_DIR = join(PROJECT_ROOT, 'tests', '_tmp');
const ALERTS_JS = join(PROJECT_ROOT, 'alerts.js');

let tmpFiles = [];

function tmpFile(name, content) {
  mkdirSync(TMP_DIR, { recursive: true });
  const path = join(TMP_DIR, name);
  writeFileSync(path, content, 'utf-8');
  tmpFiles.push(path);
  return path;
}

function cleanup() {
  for (const f of tmpFiles) {
    try { unlinkSync(f); } catch { /* ignore */ }
  }
  tmpFiles = [];
}

/**
 * Run the CLI and capture output.
 * Returns { stdout, stderr, exitCode }.
 */
async function runCli(args = []) {
  try {
    const { stdout, stderr } = await execFileAsync('node', [ALERTS_JS, ...args], {
      cwd: PROJECT_ROOT,
      timeout: 10000,
    });
    return { stdout, stderr, exitCode: 0 };
  } catch (err) {
    return {
      stdout: err.stdout || '',
      stderr: err.stderr || '',
      exitCode: err.code ?? 1,
    };
  }
}

// =====================================================================
// CLI ARGUMENT TESTS
// =====================================================================

describe('CLI Arguments', () => {
  afterEach(cleanup);

  it('should show usage and exit 1 when no arguments given', async () => {
    const { stdout, stderr, exitCode } = await runCli([]);
    assert.equal(exitCode, 1);
    assert.match(stderr, /Usage/i);
    assert.equal(stdout, '');
  });

  it('should show usage and exit 1 when only one argument given', async () => {
    const { exitCode, stderr, stdout } = await runCli(['prices.csv']);
    assert.equal(exitCode, 1);
    assert.match(stderr, /Usage/i);
    assert.equal(stdout, '');
  });

  it('should exit 1 when CSV file does not exist', async () => {
    const rulesPath = tmpFile('rules.json', '[]');
    const { exitCode, stderr, stdout } = await runCli(['nonexistent.csv', rulesPath]);
    assert.equal(exitCode, 1);
    assert.match(stderr, /Cannot read/i);
    assert.equal(stdout, '');
  });

  it('should exit 1 when rules file does not exist', async () => {
    const csvPath = tmpFile('prices.csv', 'date,instrument,close\n');
    const { exitCode, stderr, stdout } = await runCli([csvPath, 'nonexistent.json']);
    assert.equal(exitCode, 1);
    assert.match(stderr, /Cannot read/i);
    assert.equal(stdout, '');
  });
});

// =====================================================================
// FATAL INPUT ERROR TESTS
// =====================================================================

describe('CLI Fatal Errors', () => {
  afterEach(cleanup);

  it('should exit 1 on malformed JSON', async () => {
    const csvPath = tmpFile('prices.csv', 'date,instrument,close\n2026-09-01,INFY,1500\n');
    const rulesPath = tmpFile('bad.json', '{invalid}');
    const { exitCode, stderr, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 1);
    assert.match(stderr, /Malformed JSON/i);
    assert.equal(stdout, '');
  });

  it('should exit 1 when rules is not an array', async () => {
    const csvPath = tmpFile('prices.csv', 'date,instrument,close\n2026-09-01,INFY,1500\n');
    const rulesPath = tmpFile('obj.json', '{"id": "r1"}');
    const { exitCode, stderr, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 1);
    assert.match(stderr, /must be a JSON array/i);
    assert.equal(stdout, '');
  });

  it('should exit 1 on invalid rule definition', async () => {
    const csvPath = tmpFile('prices.csv', 'date,instrument,close\n2026-09-01,INFY,1500\n');
    const rulesPath = tmpFile('badrule.json', '[{"id":"r1","instrument":"INFY","type":"unknown","direction":"below"}]');
    const { exitCode, stderr, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 1);
    assert.match(stderr, /unsupported rule type/i);
    assert.equal(stdout, '');
  });

  it('should exit 1 on duplicate rule IDs', async () => {
    const csvPath = tmpFile('prices.csv', 'date,instrument,close\n');
    const rulesPath = tmpFile('dup.json', JSON.stringify([
      { id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 },
      { id: 'r1', instrument: 'TCS', type: 'level', direction: 'above', level: 3000 },
    ]));
    const { exitCode, stderr, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 1);
    assert.match(stderr, /duplicate rule ID/i);
    assert.equal(stdout, '');
  });

  it('should exit 1 on missing CSV header', async () => {
    const csvPath = tmpFile('prices.csv', '');
    const rulesPath = tmpFile('rules.json', '[]');
    const { exitCode, stderr, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 1);
    assert.equal(stdout, '');
  });

  it('should produce no partial output on fatal error', async () => {
    // Valid CSV but invalid rules → should not print any alerts
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n2026-09-01,INFY,1510\n2026-09-02,INFY,1490\n'
    );
    const rulesPath = tmpFile('bad.json', 'not json');
    const { stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(stdout, '');
  });
});

// =====================================================================
// SUCCESSFUL EXECUTION TESTS
// =====================================================================

describe('CLI Successful Execution', () => {
  afterEach(cleanup);

  it('should exit 0 with no alerts when no rules match', async () => {
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n2026-09-01,INFY,1500\n2026-09-02,INFY,1500\n'
    );
    const rulesPath = tmpFile('rules.json',
      '[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1000}]'
    );
    const { exitCode, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    assert.equal(stdout, '');
  });

  it('should exit 0 with empty rules array', async () => {
    const csvPath = tmpFile('prices.csv', 'date,instrument,close\n2026-09-01,INFY,1500\n');
    const rulesPath = tmpFile('rules.json', '[]');
    const { exitCode, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    assert.equal(stdout, '');
  });

  it('should exit 0 with header-only CSV', async () => {
    const csvPath = tmpFile('prices.csv', 'date,instrument,close\n');
    const rulesPath = tmpFile('rules.json',
      '[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1500}]'
    );
    const { exitCode, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    assert.equal(stdout, '');
  });

  it('should produce correct level alert output', async () => {
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n2026-09-01,INFY,1534.10\n2026-09-02,INFY,1510.00\n2026-09-03,INFY,1498.00\n'
    );
    const rulesPath = tmpFile('rules.json',
      '[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1500}]'
    );
    const { exitCode, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), '2026-09-03 r1 INFY level below 1500');
  });

  it('should handle out-of-order dates correctly', async () => {
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n2026-09-03,INFY,1498.00\n2026-09-01,INFY,1534.10\n2026-09-02,INFY,1510.00\n'
    );
    const rulesPath = tmpFile('rules.json',
      '[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1500}]'
    );
    const { exitCode, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), '2026-09-03 r1 INFY level below 1500');
  });

  it('should handle rule for instrument absent from CSV', async () => {
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n2026-09-01,INFY,1500\n'
    );
    const rulesPath = tmpFile('rules.json',
      '[{"id":"r1","instrument":"RELIANCE","type":"level","direction":"below","level":1500}]'
    );
    const { exitCode, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    assert.equal(stdout, '');
  });

  it('should sort alerts by date first, then by rule ID (lexicographic)', async () => {
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n' +
      '2026-09-01,INFY,1510\n' +
      '2026-09-02,INFY,1490\n' +
      '2026-09-03,INFY,1510\n' +
      '2026-09-04,INFY,1490\n'
    );
    const rulesPath = tmpFile('rules.json', JSON.stringify([
      { id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 },
      { id: 'r10', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 },
      { id: 'r2', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 },
    ]));
    const { exitCode, stdout } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    const lines = stdout.trim().split('\n');
    // On 2026-09-02: all 3 rules trigger. Order: r1, r10, r2 (lexicographic)
    assert.equal(lines[0], '2026-09-02 r1 INFY level below 1500');
    assert.equal(lines[1], '2026-09-02 r10 INFY level below 1500');
    assert.equal(lines[2], '2026-09-02 r2 INFY level below 1500');
    // On 2026-09-04: all 3 rules trigger again
    assert.equal(lines[3], '2026-09-04 r1 INFY level below 1500');
    assert.equal(lines[4], '2026-09-04 r10 INFY level below 1500');
    assert.equal(lines[5], '2026-09-04 r2 INFY level below 1500');
  });

  it('should produce deterministic output on repeated runs', async () => {
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n2026-09-01,INFY,1510\n2026-09-02,INFY,1490\n'
    );
    const rulesPath = tmpFile('rules.json',
      '[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1500}]'
    );
    const result1 = await runCli([csvPath, rulesPath]);
    const result2 = await runCli([csvPath, rulesPath]);
    assert.equal(result1.stdout, result2.stdout);
    assert.equal(result1.exitCode, result2.exitCode);
  });

  it('should not leak warnings into stdout', async () => {
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n' +
      'bad-date,INFY,1500\n' + // invalid row → stderr warning
      '2026-09-01,INFY,1510\n' +
      '2026-09-02,INFY,1490\n'
    );
    const rulesPath = tmpFile('rules.json',
      '[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1500}]'
    );
    const { exitCode, stdout, stderr } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    // stdout should only contain alert lines
    assert.equal(stdout.trim(), '2026-09-02 r1 INFY level below 1500');
    // stderr should contain warning
    assert.match(stderr, /Warning/);
  });

  it('should handle duplicate rows with warnings on stderr', async () => {
    const csvPath = tmpFile('prices.csv',
      'date,instrument,close\n' +
      '2026-09-01,INFY,1510\n' +
      '2026-09-01,INFY,1510\n' + // duplicate same close
      '2026-09-02,INFY,1490\n'
    );
    const rulesPath = tmpFile('rules.json',
      '[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1500}]'
    );
    const { exitCode, stdout, stderr } = await runCli([csvPath, rulesPath]);
    assert.equal(exitCode, 0);
    assert.equal(stdout.trim(), '2026-09-02 r1 INFY level below 1500');
    assert.match(stderr, /duplicate/i);
  });
});

// =====================================================================
// PRICE PROCESSOR TESTS
// =====================================================================

describe('Price Processor', () => {
  it('should group by instrument', () => {
    const prices = [
      { date: '2026-09-01', instrument: 'INFY', close: 1500 },
      { date: '2026-09-01', instrument: 'TCS', close: 3400 },
      { date: '2026-09-02', instrument: 'INFY', close: 1510 },
    ];
    const grouped = processPrices(prices);
    assert.equal(grouped.size, 2);
    assert.equal(grouped.get('INFY').length, 2);
    assert.equal(grouped.get('TCS').length, 1);
  });

  it('should sort each group chronologically', () => {
    const prices = [
      { date: '2026-09-03', instrument: 'INFY', close: 1498 },
      { date: '2026-09-01', instrument: 'INFY', close: 1534 },
      { date: '2026-09-02', instrument: 'INFY', close: 1510 },
    ];
    const grouped = processPrices(prices);
    const infy = grouped.get('INFY');
    assert.equal(infy[0].date, '2026-09-01');
    assert.equal(infy[1].date, '2026-09-02');
    assert.equal(infy[2].date, '2026-09-03');
  });

  it('should return empty Map for empty input', () => {
    const grouped = processPrices([]);
    assert.equal(grouped.size, 0);
  });
});

// =====================================================================
// ALERT SERVICE TESTS
// =====================================================================

describe('Alert Service', () => {
  it('should dispatch level rules correctly', () => {
    const rules = [
      { id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 },
    ];
    const pricesByInstrument = new Map([
      ['INFY', [
        { date: '2026-09-01', close: 1510 },
        { date: '2026-09-02', close: 1490 },
      ]],
    ]);
    const alerts = evaluateAlerts(rules, pricesByInstrument);
    assert.equal(alerts.length, 1);
    assert.equal(alerts[0].ruleId, 'r1');
  });

  it('should handle missing instrument gracefully', () => {
    const rules = [
      { id: 'r1', instrument: 'RELIANCE', type: 'level', direction: 'below', level: 1500 },
    ];
    const pricesByInstrument = new Map([
      ['INFY', [{ date: '2026-09-01', close: 1510 }]],
    ]);
    const alerts = evaluateAlerts(rules, pricesByInstrument);
    assert.equal(alerts.length, 0);
  });

  it('should collect alerts from multiple rules', () => {
    const rules = [
      { id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 },
      { id: 'r2', instrument: 'INFY', type: 'level', direction: 'above', level: 1500 },
    ];
    const pricesByInstrument = new Map([
      ['INFY', [
        { date: '2026-09-01', close: 1510 },
        { date: '2026-09-02', close: 1490 },
        { date: '2026-09-03', close: 1510 },
      ]],
    ]);
    const alerts = evaluateAlerts(rules, pricesByInstrument);
    assert.equal(alerts.length, 2); // r1 triggers on 09-02, r2 triggers on 09-03
  });
});

// =====================================================================
// FORMAT ALERTS TESTS
// =====================================================================

describe('Format Alerts', () => {
  it('should return empty string for no alerts', () => {
    assert.equal(formatAlerts([]), '');
  });

  it('should sort by date then rule ID', () => {
    const alerts = [
      { date: '2026-09-03', ruleId: 'r2', instrument: 'TCS', type: 'ma_cross', detail: 'ma_cross 5/20 above' },
      { date: '2026-09-02', ruleId: 'r1', instrument: 'INFY', type: 'level', detail: 'level below 1500' },
    ];
    const output = formatAlerts(alerts);
    const lines = output.split('\n');
    assert.equal(lines[0], '2026-09-02 r1 INFY level below 1500');
    assert.equal(lines[1], '2026-09-03 r2 TCS ma_cross 5/20 above');
  });

  it('should sort rule IDs lexicographically (r1, r10, r2)', () => {
    const alerts = [
      { date: '2026-09-02', ruleId: 'r2', instrument: 'INFY', type: 'level', detail: 'level below 1500' },
      { date: '2026-09-02', ruleId: 'r1', instrument: 'INFY', type: 'level', detail: 'level below 1500' },
      { date: '2026-09-02', ruleId: 'r10', instrument: 'INFY', type: 'level', detail: 'level below 1500' },
    ];
    const output = formatAlerts(alerts);
    const lines = output.split('\n');
    assert.equal(lines[0], '2026-09-02 r1 INFY level below 1500');
    assert.equal(lines[1], '2026-09-02 r10 INFY level below 1500');
    assert.equal(lines[2], '2026-09-02 r2 INFY level below 1500');
  });

  it('should format level alert correctly', () => {
    const alerts = [
      { date: '2026-09-03', ruleId: 'r1', instrument: 'INFY', type: 'level', detail: 'level below 1500' },
    ];
    const output = formatAlerts(alerts);
    assert.equal(output, '2026-09-03 r1 INFY level below 1500');
  });

  it('should format ma_cross alert correctly', () => {
    const alerts = [
      { date: '2026-09-24', ruleId: 'r2', instrument: 'TCS', type: 'ma_cross', detail: 'ma_cross 5/20 above' },
    ];
    const output = formatAlerts(alerts);
    assert.equal(output, '2026-09-24 r2 TCS ma_cross 5/20 above');
  });
});
