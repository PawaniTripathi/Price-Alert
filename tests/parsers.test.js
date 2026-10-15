/**
 * parsers.test.js — Tests for CSV parsing, JSON parsing,
 * price validation, rule validation, and duplicate handling.
 */

import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { writeFileSync, unlinkSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parseCsv } from '../src/parsers/csvParser.js';
import { parseRules } from '../src/parsers/rulesParser.js';
import { validatePrices } from '../src/validators/validatePrices.js';
import { validateRules } from '../src/validators/validateRules.js';

// ── Helpers ──────────────────────────────────────────────────────────

const TMP_DIR = join(import.meta.dirname, '..', 'tests', '_tmp');

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

// Suppress stderr warnings during validation tests
let stderrOutput = '';
const originalStderrWrite = process.stderr.write;
function captureStderr() {
  stderrOutput = '';
  process.stderr.write = (chunk) => { stderrOutput += chunk; return true; };
}
function restoreStderr() {
  process.stderr.write = originalStderrWrite;
}

// =====================================================================
// CSV PARSER TESTS
// =====================================================================

describe('CSV Parser', () => {
  afterEach(cleanup);

  it('should parse a valid CSV file', () => {
    const path = tmpFile('valid.csv',
      'date,instrument,close\n2026-09-01,INFY,1500.00\n2026-09-02,INFY,1510.00\n'
    );
    const result = parseCsv(path);
    assert.deepStrictEqual(result.header, ['date', 'instrument', 'close']);
    assert.equal(result.records.length, 2);
    assert.equal(result.records[0].date, '2026-09-01');
    assert.equal(result.records[0].instrument, 'INFY');
    assert.equal(result.records[0].close, 1500.00);
  });

  it('should throw on missing file', () => {
    assert.throws(() => parseCsv('nonexistent.csv'), /Cannot read CSV file/);
  });

  it('should throw on empty file', () => {
    const path = tmpFile('empty.csv', '');
    assert.throws(() => parseCsv(path), /empty.*no header/i);
  });

  it('should throw on missing required header column', () => {
    const path = tmpFile('bad_header.csv', 'date,symbol,close\n2026-09-01,INFY,1500\n');
    assert.throws(() => parseCsv(path), /missing required column.*instrument/i);
  });

  it('should accept header-only CSV (produces zero records)', () => {
    const path = tmpFile('header_only.csv', 'date,instrument,close\n');
    const result = parseCsv(path);
    assert.equal(result.records.length, 0);
  });

  it('should handle extra columns (accept and ignore)', () => {
    const path = tmpFile('extra_cols.csv',
      'date,instrument,close,volume\n2026-09-01,INFY,1500,100000\n'
    );
    const result = parseCsv(path);
    assert.equal(result.records.length, 1);
    assert.equal(result.records[0].close, 1500);
  });

  it('should handle quoted CSV fields', () => {
    const path = tmpFile('quoted.csv',
      'date,instrument,close\n"2026-09-01","INFY","1500.00"\n'
    );
    const result = parseCsv(path);
    assert.equal(result.records[0].date, '2026-09-01');
    assert.equal(result.records[0].instrument, 'INFY');
    assert.equal(result.records[0].close, 1500);
  });

  it('should handle quoted fields with commas inside', () => {
    const path = tmpFile('comma_in_quotes.csv',
      'date,instrument,close\n2026-09-01,"INF,Y",1500\n'
    );
    const result = parseCsv(path);
    assert.equal(result.records[0].instrument, 'INF,Y');
  });

  it('should handle escaped double quotes in quoted fields', () => {
    const path = tmpFile('escaped_quotes.csv',
      'date,instrument,close\n2026-09-01,"INF""Y",1500\n'
    );
    const result = parseCsv(path);
    assert.equal(result.records[0].instrument, 'INF"Y');
  });

  it('should strip UTF-8 BOM', () => {
    const path = tmpFile('bom.csv',
      '\uFEFFdate,instrument,close\n2026-09-01,INFY,1500\n'
    );
    const result = parseCsv(path);
    assert.deepStrictEqual(result.header, ['date', 'instrument', 'close']);
    assert.equal(result.records.length, 1);
  });

  it('should handle \\r\\n line endings', () => {
    const path = tmpFile('crlf.csv',
      'date,instrument,close\r\n2026-09-01,INFY,1500\r\n'
    );
    const result = parseCsv(path);
    assert.equal(result.records.length, 1);
  });

  it('should skip rows with too few fields and warn', () => {
    captureStderr();
    const path = tmpFile('short_row.csv',
      'date,instrument,close\n2026-09-01,INFY\n2026-09-02,INFY,1510\n'
    );
    const result = parseCsv(path);
    restoreStderr();
    assert.equal(result.records.length, 1);
    assert.match(stderrOutput, /Warning.*Line 2/);
  });

  it('should handle whitespace around fields', () => {
    const path = tmpFile('whitespace.csv',
      'date,instrument,close\n  2026-09-01 , INFY , 1500.00 \n'
    );
    const result = parseCsv(path);
    assert.equal(result.records[0].date, '2026-09-01');
    assert.equal(result.records[0].instrument, 'INFY');
    assert.equal(result.records[0].close, 1500);
  });

  it('should handle case-insensitive header matching', () => {
    const path = tmpFile('uppercase_header.csv',
      'Date,Instrument,Close\n2026-09-01,INFY,1500\n'
    );
    const result = parseCsv(path);
    assert.equal(result.records.length, 1);
  });

  it('should skip blank lines within the file', () => {
    const path = tmpFile('blank_lines.csv',
      'date,instrument,close\n\n2026-09-01,INFY,1500\n\n2026-09-02,INFY,1510\n'
    );
    const result = parseCsv(path);
    assert.equal(result.records.length, 2);
  });
});

// =====================================================================
// RULES PARSER TESTS
// =====================================================================

describe('Rules Parser', () => {
  afterEach(cleanup);

  it('should parse valid JSON array', () => {
    const path = tmpFile('valid.json', '[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1500}]');
    const result = parseRules(path);
    assert.equal(Array.isArray(result), true);
    assert.equal(result.length, 1);
  });

  it('should throw on missing file', () => {
    assert.throws(() => parseRules('nonexistent.json'), /Cannot read rules file/);
  });

  it('should throw on malformed JSON', () => {
    const path = tmpFile('bad.json', '{invalid json}');
    assert.throws(() => parseRules(path), /Malformed JSON/);
  });

  it('should strip UTF-8 BOM from JSON', () => {
    const path = tmpFile('bom.json', '\uFEFF[{"id":"r1","instrument":"INFY","type":"level","direction":"below","level":1500}]');
    const result = parseRules(path);
    assert.equal(result.length, 1);
  });

  it('should parse an empty JSON array', () => {
    const path = tmpFile('empty.json', '[]');
    const result = parseRules(path);
    assert.deepStrictEqual(result, []);
  });

  it('should parse JSON with non-array top-level (validation catches this later)', () => {
    const path = tmpFile('obj.json', '{"id": "r1"}');
    const result = parseRules(path);
    assert.equal(typeof result, 'object');
    assert.equal(Array.isArray(result), false);
  });
});

// =====================================================================
// PRICE VALIDATION TESTS
// =====================================================================

describe('Price Validation', () => {
  afterEach(() => { restoreStderr(); cleanup(); });
  beforeEach(captureStderr);

  it('should accept valid records', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [
        { date: '2026-09-01', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 2 },
      ],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0], { date: '2026-09-01', instrument: 'INFY', close: 1500 });
  });

  it('should reject blank date', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 0);
    assert.match(stderrOutput, /blank date/);
  });

  it('should reject invalid date format (DD-MM-YYYY)', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '01-09-2026', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 0);
    assert.match(stderrOutput, /invalid date/);
  });

  it('should reject impossible calendar date (Feb 30)', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '2026-02-30', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 0);
  });

  it('should reject month 13', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '2026-13-01', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 0);
  });

  it('should reject blank instrument', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '2026-09-01', instrument: '', close: 1500, closeRaw: '1500', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 0);
    assert.match(stderrOutput, /blank instrument/);
  });

  it('should reject blank close', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '2026-09-01', instrument: 'INFY', close: NaN, closeRaw: '', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 0);
    assert.match(stderrOutput, /blank close/);
  });

  it('should reject NaN close', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '2026-09-01', instrument: 'INFY', close: NaN, closeRaw: 'abc', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 0);
    assert.match(stderrOutput, /invalid close/);
  });

  it('should reject Infinity close', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '2026-09-01', instrument: 'INFY', close: Infinity, closeRaw: 'Infinity', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 0);
    assert.match(stderrOutput, /invalid close/);
  });

  it('should accept zero close (finite)', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '2026-09-01', instrument: 'INFY', close: 0, closeRaw: '0', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 1);
    assert.equal(result[0].close, 0);
  });

  it('should accept negative close (finite)', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [{ date: '2026-09-01', instrument: 'INFY', close: -10, closeRaw: '-10', line: 2 }],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 1);
    assert.equal(result[0].close, -10);
  });

  // ── Duplicate handling ─────────────────────────────────────────────

  it('should keep first record for duplicate instrument+date with same close', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [
        { date: '2026-09-01', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 2 },
        { date: '2026-09-01', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 3 },
      ],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 1);
    assert.match(stderrOutput, /duplicate record/);
  });

  it('should keep first record for duplicate instrument+date with different close', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [
        { date: '2026-09-01', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 2 },
        { date: '2026-09-01', instrument: 'INFY', close: 1510, closeRaw: '1510', line: 3 },
      ],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 1);
    assert.equal(result[0].close, 1500);
    assert.match(stderrOutput, /conflicting close/);
  });

  it('should allow different instruments on the same date', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [
        { date: '2026-09-01', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 2 },
        { date: '2026-09-01', instrument: 'TCS', close: 3400, closeRaw: '3400', line: 3 },
      ],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 2);
  });

  it('should treat instrument names as case-sensitive (TCS != tcs)', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [
        { date: '2026-09-01', instrument: 'TCS', close: 3400, closeRaw: '3400', line: 2 },
        { date: '2026-09-01', instrument: 'tcs', close: 3500, closeRaw: '3500', line: 3 },
      ],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 2);
  });

  it('should not reserve key for invalid row — later valid row accepted', () => {
    const parsed = {
      header: ['date', 'instrument', 'close'],
      records: [
        { date: '2026-09-01', instrument: 'INFY', close: NaN, closeRaw: 'bad', line: 2 },
        { date: '2026-09-01', instrument: 'INFY', close: 1500, closeRaw: '1500', line: 3 },
      ],
    };
    const result = validatePrices(parsed);
    assert.equal(result.length, 1);
    assert.equal(result[0].close, 1500);
  });
});

// =====================================================================
// RULE VALIDATION TESTS
// =====================================================================

describe('Rule Validation', () => {
  it('should accept valid level rule', () => {
    const rules = [{ id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 }];
    const result = validateRules(rules);
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0], {
      id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 1500,
    });
  });

  it('should accept valid ma_cross rule', () => {
    const rules = [{ id: 'r2', instrument: 'TCS', type: 'ma_cross', direction: 'above', short: 5, long: 20 }];
    const result = validateRules(rules);
    assert.equal(result.length, 1);
    assert.deepStrictEqual(result[0], {
      id: 'r2', instrument: 'TCS', type: 'ma_cross', direction: 'above', short: 5, long: 20,
    });
  });

  it('should accept an empty rules array', () => {
    const result = validateRules([]);
    assert.deepStrictEqual(result, []);
  });

  it('should reject non-array top-level value', () => {
    assert.throws(() => validateRules({ id: 'r1' }), /must be a JSON array/);
  });

  it('should reject non-array top-level value (string)', () => {
    assert.throws(() => validateRules('not an array'), /must be a JSON array/);
  });

  it('should reject non-array top-level value (null)', () => {
    assert.throws(() => validateRules(null), /must be a JSON array/);
  });

  it('should reject rule that is not an object', () => {
    assert.throws(() => validateRules(['not an object']), /must be an object/);
  });

  it('should reject null rule', () => {
    assert.throws(() => validateRules([null]), /must be an object/);
  });

  it('should reject rule missing id', () => {
    assert.throws(
      () => validateRules([{ instrument: 'INFY', type: 'level', direction: 'below', level: 1500 }]),
      /missing required field "id"/
    );
  });

  it('should reject rule with blank id', () => {
    assert.throws(
      () => validateRules([{ id: '  ', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 }]),
      /nonblank/
    );
  });

  it('should reject duplicate rule IDs', () => {
    assert.throws(
      () => validateRules([
        { id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 1500 },
        { id: 'r1', instrument: 'TCS', type: 'level', direction: 'above', level: 3000 },
      ]),
      /duplicate rule ID/
    );
  });

  it('should reject missing instrument', () => {
    assert.throws(
      () => validateRules([{ id: 'r1', type: 'level', direction: 'below', level: 1500 }]),
      /missing required field "instrument"/
    );
  });

  it('should reject blank instrument', () => {
    assert.throws(
      () => validateRules([{ id: 'r1', instrument: '', type: 'level', direction: 'below', level: 1500 }]),
      /nonblank/
    );
  });

  it('should reject unsupported rule type', () => {
    assert.throws(
      () => validateRules([{ id: 'r1', instrument: 'INFY', type: 'exponential', direction: 'below', level: 1500 }]),
      /unsupported rule type/
    );
  });

  it('should reject unsupported direction', () => {
    assert.throws(
      () => validateRules([{ id: 'r1', instrument: 'INFY', type: 'level', direction: 'sideways', level: 1500 }]),
      /unsupported direction/
    );
  });

  it('should reject level rule missing level field', () => {
    assert.throws(
      () => validateRules([{ id: 'r1', instrument: 'INFY', type: 'level', direction: 'below' }]),
      /missing required field "level"/
    );
  });

  it('should reject level rule with non-finite level (NaN)', () => {
    assert.throws(
      () => validateRules([{ id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 'abc' }]),
      /finite number/
    );
  });

  it('should reject level rule with Infinity level', () => {
    assert.throws(
      () => validateRules([{ id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: Infinity }]),
      /finite number/
    );
  });

  it('should reject ma_cross rule missing short', () => {
    assert.throws(
      () => validateRules([{ id: 'r2', instrument: 'TCS', type: 'ma_cross', direction: 'above', long: 20 }]),
      /missing required field "short"/
    );
  });

  it('should reject ma_cross rule missing long', () => {
    assert.throws(
      () => validateRules([{ id: 'r2', instrument: 'TCS', type: 'ma_cross', direction: 'above', short: 5 }]),
      /missing required field "long"/
    );
  });

  it('should reject non-integer short window', () => {
    assert.throws(
      () => validateRules([{ id: 'r2', instrument: 'TCS', type: 'ma_cross', direction: 'above', short: 5.5, long: 20 }]),
      /positive integer/
    );
  });

  it('should reject zero short window', () => {
    assert.throws(
      () => validateRules([{ id: 'r2', instrument: 'TCS', type: 'ma_cross', direction: 'above', short: 0, long: 20 }]),
      /positive integer/
    );
  });

  it('should reject negative long window', () => {
    assert.throws(
      () => validateRules([{ id: 'r2', instrument: 'TCS', type: 'ma_cross', direction: 'above', short: 5, long: -1 }]),
      /positive integer/
    );
  });

  it('should reject short >= long', () => {
    assert.throws(
      () => validateRules([{ id: 'r2', instrument: 'TCS', type: 'ma_cross', direction: 'above', short: 20, long: 20 }]),
      /must be less than/
    );
  });

  it('should accept and ignore unknown extra fields on rules', () => {
    const rules = [{ id: 'r1', instrument: 'INFY', type: 'level', direction: 'below', level: 1500, note: 'test' }];
    const result = validateRules(rules);
    assert.equal(result.length, 1);
    // Extra field not present in output
    assert.equal(result[0].note, undefined);
  });
});
