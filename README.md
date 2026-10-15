# Price Alert Tool — Wissen Technologies Assessment

A Node.js command-line tool that monitors financial instruments for price alerts. It reads daily closing prices from a CSV file and alert rules from a JSON file, then evaluates two types of rules — **level crossings** and **moving-average crossovers** — and prints every triggered alert in sorted order.

## How to Run

**Prerequisites:** Node.js ≥ 18 (no `npm install` needed — zero external dependencies).

```bash
# Run the tool
node alerts.js prices.csv rules.json

# Or via npm
npm start -- prices.csv rules.json

# Run the test suite (124 automated tests)
npm test
```

**Example output:**
```
2026-09-03 r1 INFY level below 1500
2026-09-10 r1 INFY level below 1500
2026-10-03 r2 TCS ma_cross 5/20 above
```

## How It Works

1. **Parse** — Reads the CSV (with RFC 4180 quoting support) and JSON files, stripping UTF-8 BOM if present.
2. **Validate** — Checks every price record (valid dates, numeric closes) and every rule (types, directions, MA windows). Invalid CSV rows are skipped with warnings; invalid rules are fatal.
3. **Process** — Groups prices by instrument and sorts each group chronologically (handles out-of-order input dates).
4. **Evaluate** — Runs each rule against its instrument's history independently:
   - *Level rules* trigger when the price crosses a threshold between two consecutive days.
   - *MA crossover rules* trigger when the short-period SMA crosses the long-period SMA (requires complete windows — no partial averages).
5. **Output** — Sorts all alerts by date, then rule ID (lexicographic), and prints one line per alert to stdout. Warnings/errors go to stderr only.

## Input Formats

**CSV** — `date,instrument,close` (extra columns are ignored):
```
2026-09-01,INFY,1534.10
2026-09-02,INFY,1510.00
```

**Rules JSON** — array of rule objects:
```json
[
  { "id": "r1", "instrument": "INFY", "type": "level", "direction": "below", "level": 1500 },
  { "id": "r2", "instrument": "TCS", "type": "ma_cross", "direction": "above", "short": 5, "long": 20 }
]
```

## Key Design Decisions

- **Duplicate prices:** First valid record for each instrument+date wins; later duplicates are skipped with a warning.
- **Instruments are case-sensitive:** `TCS` and `tcs` are treated as different instruments.
- **MA crossovers require two valid SMA pairs:** The first valid pair is a baseline only — no alert is emitted until a crossing is actually detected.
- **Sorting:** Rule IDs are sorted lexicographically (`r1`, `r10`, `r2`), not numerically.

## AI Assistance

**Prompts used:** I provided a detailed master prompt that specified the project architecture (10 source modules + CLI entry point + 4 test files), the exact data flow, rule evaluation logic (level-crossing and MA crossover conditions), input validation requirements, duplicate-handling policy, edge cases, and testing expectations. The assistant was asked to inspect the project first, report a plan, and implement incrementally with tests at each stage.

**What the assistant got wrong:**
The initial sample `prices.csv` the assistant generated did not have enough price variation in the TCS data to trigger a moving-average crossover. The SMA-5 never crossed above the SMA-20 because the recovery prices were too conservative. I caught this during verification when only level alerts appeared in the output. The assistant then adjusted the last 5 TCS prices (stronger recovery: 3360→3400→3450→3500→3550) so the short MA could overtake the long MA, producing the expected crossover alert.

**What I changed and why:**
I reviewed the assistant's output at each stage, approved the architecture plan before any code was written, and verified every test result. The core logic, validation rules, and edge-case handling were implemented correctly on the first attempt. The only correction was the sample data adjustment described above — all application code remained unchanged.
