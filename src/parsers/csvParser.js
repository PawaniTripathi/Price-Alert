/**
 * csvParser.js — Read and parse a CSV file into price record objects.
 *
 * Responsibilities:
 *   - Read a CSV file from the given path.
 *   - Strip a leading UTF-8 BOM if present.
 *   - Parse CSV records respecting RFC 4180 quoting rules.
 *   - Convert the `close` field to a number.
 *   - Attach source line numbers for diagnostics.
 *   - Return an array of raw record objects (not yet validated).
 *
 * Input:  file path (string)
 * Output: { header: string[], records: Array<{ date, instrument, close, line }> }
 *
 * Throws on: missing/unreadable file, missing required header columns.
 */

import { readFileSync } from 'node:fs';

/**
 * Parse a single CSV line respecting RFC 4180 quoted fields.
 *
 * Rules:
 *   - Fields may be enclosed in double quotes.
 *   - Inside a quoted field, a literal double quote is escaped as "".
 *   - Commas inside quotes do not split fields.
 *   - Unquoted fields are taken as-is (trimmed of surrounding whitespace).
 *
 * @param {string} line - A single CSV line.
 * @returns {string[]} Parsed field values.
 */
function parseCsvLine(line) {
  const fields = [];
  let i = 0;
  const len = line.length;

  while (i <= len) {
    // Skip leading whitespace before a field
    while (i < len && (line[i] === ' ' || line[i] === '\t')) i++;

    if (i >= len) {
      // Trailing comma or empty last field
      fields.push('');
      break;
    }

    if (line[i] === '"') {
      // ── Quoted field ──
      i++; // skip opening quote
      let value = '';
      while (i < len) {
        if (line[i] === '"') {
          if (i + 1 < len && line[i + 1] === '"') {
            // Escaped double quote
            value += '"';
            i += 2;
          } else {
            // Closing quote
            i++; // skip closing quote
            break;
          }
        } else {
          value += line[i];
          i++;
        }
      }
      // Skip any whitespace or content after the closing quote until comma or end
      while (i < len && line[i] !== ',') i++;
      fields.push(value);
      // Skip the comma
      if (i < len) i++;
    } else {
      // ── Unquoted field ──
      let start = i;
      while (i < len && line[i] !== ',') i++;
      fields.push(line.substring(start, i).trim());
      // Skip the comma
      if (i < len) i++;
      else {
        // End of line, we're done
        break;
      }
    }
  }

  return fields;
}

// Required column names
const REQUIRED_COLUMNS = ['date', 'instrument', 'close'];

/**
 * Parse a CSV file into raw price records.
 *
 * @param {string} filePath - Path to the CSV file.
 * @returns {{ header: string[], records: Array<{ date: string, instrument: string, close: number, line: number }> }}
 * @throws {Error} If the file cannot be read or the header is missing/invalid.
 */
export function parseCsv(filePath) {
  // Read the file
  let content;
  try {
    content = readFileSync(filePath, 'utf-8');
  } catch (err) {
    throw new Error(`Cannot read CSV file "${filePath}": ${err.message}`);
  }

  // Strip UTF-8 BOM if present
  if (content.charCodeAt(0) === 0xfeff) {
    content = content.slice(1);
  }

  // Split into lines, handling \r\n and \n
  const lines = content.split(/\r?\n/);

  // Find the header line (first non-empty line)
  let headerLineIndex = -1;
  for (let i = 0; i < lines.length; i++) {
    if (lines[i].trim().length > 0) {
      headerLineIndex = i;
      break;
    }
  }

  if (headerLineIndex === -1) {
    throw new Error('CSV file is empty: no header found.');
  }

  // Parse header
  const headerFields = parseCsvLine(lines[headerLineIndex]).map(
    (h) => h.trim().toLowerCase()
  );

  // Validate required columns exist
  const columnIndices = {};
  for (const col of REQUIRED_COLUMNS) {
    const idx = headerFields.indexOf(col);
    if (idx === -1) {
      throw new Error(
        `CSV header is missing required column "${col}". ` +
        `Found columns: [${headerFields.join(', ')}]`
      );
    }
    columnIndices[col] = idx;
  }

  // Parse data rows
  const records = [];

  for (let i = headerLineIndex + 1; i < lines.length; i++) {
    const rawLine = lines[i];
    // Skip empty lines
    if (rawLine.trim().length === 0) continue;

    const fields = parseCsvLine(rawLine);
    const lineNum = i + 1; // 1-indexed for diagnostics

    // Check minimum field count (must have at least enough for required columns)
    const minRequired = Math.max(...Object.values(columnIndices)) + 1;
    if (fields.length < minRequired) {
      process.stderr.write(
        `Warning: Line ${lineNum}: expected at least ${minRequired} fields, got ${fields.length}. Skipping.\n`
      );
      continue;
    }

    const date = fields[columnIndices.date].trim();
    const instrument = fields[columnIndices.instrument].trim();
    const closeStr = fields[columnIndices.close].trim();

    // Convert close to a number (further validation happens in validatePrices)
    const close = Number(closeStr);

    records.push({ date, instrument, close, closeRaw: closeStr, line: lineNum });
  }

  return { header: headerFields, records };
}
