#!/usr/bin/env node

/**
 * alerts.js — CLI entry point for the Price Alert Tool.
 *
 * Usage:
 *   node alerts.js <prices.csv> <rules.json>
 *   npm start -- <prices.csv> <rules.json>
 *
 * Reads daily closing prices and alert rules, evaluates level-crossing
 * and moving-average crossover rules, and prints triggered alerts to stdout.
 *
 * Diagnostics and warnings go to stderr.
 * Exit 0 on success (even if no alerts trigger).
 * Exit 1 on fatal input/processing errors.
 */

import { parseCsv } from './src/parsers/csvParser.js';
import { parseRules } from './src/parsers/rulesParser.js';
import { validatePrices } from './src/validators/validatePrices.js';
import { validateRules } from './src/validators/validateRules.js';
import { processPrices } from './src/utils/priceProcessor.js';
import { evaluateAlerts } from './src/services/alertService.js';
import { formatAlerts } from './src/output/formatAlerts.js';

function main() {
  // ── 1. Parse CLI arguments ──────────────────────────────────────────
  const args = process.argv.slice(2);

  if (args.length < 2) {
    process.stderr.write(
      'Usage: node alerts.js <prices.csv> <rules.json>\n'
    );
    process.exit(1);
  }

  const [csvPath, rulesPath] = args;

  try {
    // ── 2. Parse CSV file ───────────────────────────────────────────
    const rawPrices = parseCsv(csvPath);

    // ── 3. Validate and normalize price records ─────────────────────
    const validPrices = validatePrices(rawPrices);

    // ── 4. Parse JSON rules file ────────────────────────────────────
    const rawRules = parseRules(rulesPath);

    // ── 5. Validate all rule definitions ────────────────────────────
    const validRules = validateRules(rawRules);

    // ── 6. Group by instrument and sort chronologically ─────────────
    const pricesByInstrument = processPrices(validPrices);

    // ── 7–10. Evaluate rules and collect alerts ─────────────────────
    const alerts = evaluateAlerts(validRules, pricesByInstrument);

    // ── 11–13. Sort, format, and print ──────────────────────────────
    const output = formatAlerts(alerts);

    if (output.length > 0) {
      process.stdout.write(output + '\n');
    }

    // ── 14–15. Exit successfully ────────────────────────────────────
    process.exit(0);
  } catch (err) {
    // Fatal errors: report to stderr, exit nonzero.
    // Avoid leaking full stack traces to ordinary users.
    process.stderr.write(`Error: ${err.message}\n`);
    process.exit(1);
  }
}

main();
