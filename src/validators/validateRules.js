/**
 * validateRules.js — Validate all rule definitions.
 *
 * Responsibilities:
 *   - Verify the top-level value is an array.
 *   - Validate each rule object: id, instrument, type, direction, type-specific fields.
 *   - Reject duplicate rule IDs.
 *   - Validate level rules: finite numeric `level`.
 *   - Validate ma_cross rules: positive integer `short` and `long`, short < long.
 *   - Unknown extra fields on rules: accepted and ignored (documented policy).
 *
 * Input:  parsed JSON value (from rulesParser)
 * Output: Array of validated rule objects
 *
 * Throws on: any validation error (all rule errors are fatal).
 */

const VALID_TYPES = new Set(['level', 'ma_cross']);
const VALID_DIRECTIONS = new Set(['above', 'below']);

/**
 * Validate all rule definitions.
 *
 * @param {*} parsed - The parsed JSON value.
 * @returns {Array<object>} Validated rule objects.
 * @throws {Error} If any rule is invalid.
 */
export function validateRules(parsed) {
  // ── Top-level must be an array ────────────────────────────────
  if (!Array.isArray(parsed)) {
    throw new Error(
      `Rules must be a JSON array. Got ${typeof parsed}: ${JSON.stringify(parsed)?.slice(0, 100)}`
    );
  }

  const seenIds = new Set();
  const validated = [];

  for (let i = 0; i < parsed.length; i++) {
    const rule = parsed[i];
    const prefix = `Rule[${i}]`;

    // Must be a non-null object
    if (rule === null || typeof rule !== 'object' || Array.isArray(rule)) {
      throw new Error(`${prefix}: must be an object. Got: ${JSON.stringify(rule)?.slice(0, 100)}`);
    }

    // ── id ─────────────────────────────────────────────────────
    if (rule.id === undefined || rule.id === null) {
      throw new Error(`${prefix}: missing required field "id".`);
    }
    const id = String(rule.id).trim();
    if (id.length === 0) {
      throw new Error(`${prefix}: "id" must be a nonblank string.`);
    }
    if (seenIds.has(id)) {
      throw new Error(`${prefix}: duplicate rule ID "${id}".`);
    }
    seenIds.add(id);

    // ── instrument ─────────────────────────────────────────────
    if (rule.instrument === undefined || rule.instrument === null) {
      throw new Error(`${prefix} (id="${id}"): missing required field "instrument".`);
    }
    const instrument = String(rule.instrument).trim();
    if (instrument.length === 0) {
      throw new Error(`${prefix} (id="${id}"): "instrument" must be a nonblank string.`);
    }

    // ── type ───────────────────────────────────────────────────
    if (rule.type === undefined || rule.type === null) {
      throw new Error(`${prefix} (id="${id}"): missing required field "type".`);
    }
    const type = String(rule.type).trim();
    if (!VALID_TYPES.has(type)) {
      throw new Error(
        `${prefix} (id="${id}"): unsupported rule type "${type}". ` +
        `Supported types: ${[...VALID_TYPES].join(', ')}.`
      );
    }

    // ── direction ──────────────────────────────────────────────
    if (rule.direction === undefined || rule.direction === null) {
      throw new Error(`${prefix} (id="${id}"): missing required field "direction".`);
    }
    const direction = String(rule.direction).trim();
    if (!VALID_DIRECTIONS.has(direction)) {
      throw new Error(
        `${prefix} (id="${id}"): unsupported direction "${direction}". ` +
        `Supported directions: ${[...VALID_DIRECTIONS].join(', ')}.`
      );
    }

    // ── Type-specific validation ───────────────────────────────
    if (type === 'level') {
      if (rule.level === undefined || rule.level === null) {
        throw new Error(`${prefix} (id="${id}"): level rule missing required field "level".`);
      }
      const level = Number(rule.level);
      if (!Number.isFinite(level)) {
        throw new Error(
          `${prefix} (id="${id}"): "level" must be a finite number. Got: ${rule.level}`
        );
      }
      validated.push({ id, instrument, type, direction, level });
    } else if (type === 'ma_cross') {
      // short window
      if (rule.short === undefined || rule.short === null) {
        throw new Error(`${prefix} (id="${id}"): ma_cross rule missing required field "short".`);
      }
      const short = Number(rule.short);
      if (!Number.isInteger(short) || short <= 0) {
        throw new Error(
          `${prefix} (id="${id}"): "short" must be a positive integer. Got: ${rule.short}`
        );
      }

      // long window
      if (rule.long === undefined || rule.long === null) {
        throw new Error(`${prefix} (id="${id}"): ma_cross rule missing required field "long".`);
      }
      const long = Number(rule.long);
      if (!Number.isInteger(long) || long <= 0) {
        throw new Error(
          `${prefix} (id="${id}"): "long" must be a positive integer. Got: ${rule.long}`
        );
      }

      // short must be less than long
      if (short >= long) {
        throw new Error(
          `${prefix} (id="${id}"): "short" (${short}) must be less than "long" (${long}).`
        );
      }

      validated.push({ id, instrument, type, direction, short, long });
    }
  }

  return validated;
}
