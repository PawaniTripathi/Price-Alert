/**
 * formatAlerts.js — Sort and format the alert collection for output.
 *
 * Responsibilities:
 *   - Sort all alerts by date ascending, then by rule ID ascending (lexicographic).
 *   - Format each alert as a single output line.
 *   - Return the complete formatted string (the CLI layer handles printing).
 *   - No rule-calculation logic lives here.
 *
 * Sorting convention:
 *   - Date: standard string comparison (YYYY-MM-DD is lexicographically sortable).
 *   - Rule ID: ordinary lexicographic string comparison.
 *     Example order: r1, r10, r2 (not "natural" numeric sorting).
 *
 * Output format per line:
 *   For level:    "2026-09-03 r1 INFY level below 1500"
 *   For ma_cross: "2026-09-24 r2 TCS ma_cross 5/20 above"
 *
 * Input:  Array of alert objects
 * Output: formatted string (may be empty if no alerts)
 */

/**
 * Sort and format alerts into output lines.
 *
 * @param {Array<{ date: string, ruleId: string, instrument: string, type: string, detail: string }>} alerts
 * @returns {string} Formatted output (empty string if no alerts).
 */
export function formatAlerts(alerts) {
  if (alerts.length === 0) return '';

  // Sort: date ascending first, then rule ID ascending (lexicographic)
  const sorted = [...alerts].sort((a, b) => {
    if (a.date < b.date) return -1;
    if (a.date > b.date) return 1;
    // Same date — sort by rule ID (lexicographic)
    if (a.ruleId < b.ruleId) return -1;
    if (a.ruleId > b.ruleId) return 1;
    return 0;
  });

  // Format each alert as a single line: "date ruleId instrument detail"
  // The detail field already contains the type-specific part
  // (e.g., "level below 1500" or "ma_cross 5/20 above")
  const lines = sorted.map(
    (alert) => `${alert.date} ${alert.ruleId} ${alert.instrument} ${alert.detail}`
  );

  return lines.join('\n');
}
