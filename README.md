# Price Alert Tool

Command-line tool that reads daily closing prices (CSV) and alert rules (JSON), evaluates level-crossing and moving-average crossover rules, and prints triggered alerts.

## Setup & Run

Requires **Node.js ≥ 18**. No dependencies to install.

```bash
node alerts.js <prices.csv> <rules.json>
npm start -- <prices.csv> <rules.json>
npm test
```

## Input Schemas

**CSV** (`date,instrument,close`): Dates must be `YYYY-MM-DD`. Extra columns are accepted and ignored. Out-of-order dates are sorted automatically per instrument.

**Rules JSON** — array of rule objects:

- **Level**: `{ "id", "instrument", "type": "level", "direction": "above"|"below", "level": <number> }`
- **MA Cross**: `{ "id", "instrument", "type": "ma_cross", "direction": "above"|"below", "short": <int>, "long": <int> }` — `short < long`, positive integers.

## Output & Sorting

One line per triggered alert: `<date> <ruleId> <instrument> <detail>`

Sorted by date ascending, then rule ID ascending (lexicographic: `r1, r10, r2`). Diagnostics go to stderr only. Exit 0 on success, exit 1 on fatal errors.

## Key Policies

- **Duplicates**: First valid record for each instrument+date wins. Later duplicates are skipped with a warning.
- **Level crossing**: Triggers only when price crosses the threshold between consecutive observations (equality at the level does not trigger).
- **MA crossover**: Requires complete windows. The first valid SMA pair is a baseline only — no alert. Crossover detected by comparing two consecutive valid pairs. No partial windows, no zero-fill.
- **Instruments**: Case-sensitive. Different instruments never share price data.
- **Validation**: Invalid CSV rows are skipped (recoverable). Invalid rules or malformed JSON are fatal.

## AI Assistance

Built with AI assistance (Gemini/Claude). The primary prompt defined architecture, data flow, rule logic, edge-case policies, and testing requirements. AI implemented the code, then tests were run and verified. One AI mistake: the initial sample `prices.csv` had insufficient TCS data to trigger an MA crossover — prices were adjusted to create a valid crossover scenario for demonstration.
