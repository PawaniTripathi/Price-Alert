/**
 * rulesParser.js — Read and parse a JSON rules file.
 *
 * Responsibilities:
 *   - Read a JSON file from the given path.
 *   - Strip a leading UTF-8 BOM if present.
 *   - Parse JSON with JSON.parse.
 *   - Report malformed JSON clearly.
 *   - Do not silently repair malformed input.
 *
 * Input:  file path (string)
 * Output: parsed JavaScript value (expected to be an array, validated later)
 *
 * Throws on: missing/unreadable file, malformed JSON.
 */

import { readFileSync } from 'node:fs';

/**
 * Parse a JSON rules file.
 *
 * @param {string} filePath - Path to the JSON file.
 * @returns {*} The parsed JSON value.
 * @throws {Error} If the file cannot be read or contains malformed JSON.
 */
export function parseRules(filePath) {
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read rules file "${filePath}": ${err.message}`);
  }

  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error(`Malformed JSON in "${filePath}": ${err.message}`);
  }
}
