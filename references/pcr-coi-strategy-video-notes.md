# PCR + COI Strategy — Video Notes
Source: https://youtu.be/3zWyzrB7YIk

## Core Concept
This strategy uses **Change in Open Interest (COI)** — not the PCR ratio itself — to determine intraday market direction. It reads option writer (seller) positioning to infer where the market is likely to go.

## Data Collection — NO EOD Required
This strategy does NOT use prior EOD OI data. It is entirely intraday:
- Observe COI data from **9:15 AM to 11:00 AM** (observation window, no trades)
- At **9:08 AM** (pre-market), note the pre-open price and round to nearest strike → this is your ATM center

## COI Calculation (The Core Engine)
1. **Select 7 strikes**: ATM + 3 above + 3 below (total 7 call strikes, 7 put strikes)
2. **Sum the Change in OI** for all 7 call strikes → Call COI Total
3. **Sum the Change in OI** for all 7 put strikes → Put COI Total
4. **Calculate imbalance ratio**: Call COI % vs Put COI %

## Signal Thresholds
- **Balanced / No Trade**: difference between Call COI% and Put COI% is < ~25%
  - Example: 55% calls / 45% puts → too close, skip
- **Actionable Imbalance**: difference > ~40-50%
  - Example: 81% calls / 19% puts → clear signal
  - Example: 20% calls / 80% puts → clear signal

## Signal Interpretation (CONTRARIAN — reading option WRITERS)
- **Heavy Call Writing (high Call COI%)** → Market faces resistance → **BUY PUT**
- **Heavy Put Writing (high Put COI%)** → Market has support → **BUY CALL**

## Entry Rules
- **No trades before 11:00 AM** — observation only
- **Trade after 11:30 AM** — best opportunities 12:00 PM – 1:00 PM
- **VWAP Entry**: Wait for price to retrace to VWAP before entering
  - Do NOT chase price far from VWAP — wait for pullback

## Expiry Filter
- On expiry day OR one day before expiry: **do NOT trade current week options**
- Instead: trade **next week's expiry**

## Strike Selection & Risk Management
| Delta | Stop Loss | Target | R:R |
|-------|-----------|--------|-----|
| 0.3   | 20 pts    | 30 pts | 1:1.5 |
| 0.4   | 25 pts    | 40 pts | 1:1.6 |
| 0.5 (ATM) | 30 pts | 50 pts | 1:1.67 |

- Alternative SL: use high/low of reversal candle near VWAP
- **Time stop**: Square off ALL positions by **3:20 PM**

## What IV Does NOT Factor In
IV is not used in this strategy at all. Pure OI + price action + VWAP.

## Key Differences from Current PitDesk Implementation
| Aspect | Video Strategy | Current PitDesk |
|--------|---------------|-----------------|
| Data source | Real intraday COI (live OI change) | Synthetic PCR from RSI/momentum |
| Timing | 9:08 AM ATM selection, observe 9:15-11 AM, trade after 11:30 AM | Single 11:30 AM scan |
| Strikes | 7 strikes around ATM (±3) | All strikes aggregated |
| Signal basis | COI imbalance % between calls and puts | Absolute PCR ratio vs thresholds |
| Entry trigger | Price near VWAP | No entry trigger |
| EOD data | Not needed | Used (but synthetic) |
| IV | Not used | Used in scoring |

## Implementation Plan for PitDesk
1. **Real options data required** (Tradier API) — get live OI per strike
2. **9:08 AM ATM detection** — fetch pre-market price, round to nearest strike
3. **Select ±3 strikes around ATM** — 7 strikes each side
4. **Calculate COI per strike** = current OI - prior OI (need prior snapshot OR use opening OI)
5. **Compute imbalance ratio** — call COI% vs put COI%
6. **Signal**: if |callPct - putPct| > 40% → generate directional signal
7. **VWAP overlay** — show VWAP on the scan results so user knows when to enter
8. **Expiry filter** — flag if today is expiry or day before
