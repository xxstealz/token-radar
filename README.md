# Token Launch Radar

A dashboard that ranks pre-token protocols by implied value, using only the
figures in a DefiLlama-style snapshot. The idea is simple: a protocol without
a token yet can be priced by looking at what the market already pays for
similar protocols that do have one.

## Model

Every protocol on the board is pre-token (no market cap, no CoinGecko id, no
symbol in the snapshot). Bridges, liquid staking and restaking, restaked BTC
and CEXes are left out, as are names that end in a version marker, carry a
whole word like "wrapped" or "staked", or start with an exchange name. The
40 watchlist slugs are always included; every other rankable pre-token
protocol joins them.

**Category multiple.** Within a protocol's category, take the median of
market-cap-over-TVL across the snapshot's own live-token protocols. Clamp
that median to 0.02–2.0, then pull it toward the global median (the median
over all live-token protocols) according to how many peers support it: 5 or
more peers stand alone, 3–4 blend 70% category / 30% global, 1–2 blend 30%
category / 70% global, and with no peers the global median is used. Clamp
the result to 0.02–2.0 again.

**Growth.** The 7-day TVL change in percent, clamped to −60…120, then the
multiplier is 1 + (growth / 100) × 0.5.

**Maturity.** Age in whole days from `listed_at` to the snapshot date
(unknown age counts as 365 days); the multiplier is
0.6 + min(age, 1095) / 1095 × 0.4.

**Chains.** 1 + min(chains − 1, 4) × 0.03.

**Implied value.** max(1, round(TVL × multiple × growth × maturity × chains)).
Rows are sorted by implied value descending, ties broken by slug ascending.

The 24 live-token protocols with the largest market cap (excluding CEX) are
shown separately with the market's own values and are never ranked.

**Farm steps.** Each row carries six concrete steps built from its own
record: capital by TVL ($250 at $5B+, $150 at $1B+, $100 at $100M+, else
$50), hold time by age (60 days under 180 days old, 45 under a year, else
30), gas by main chain (about $8 on Ethereum, $0.10 on Solana, $2 on
Bitcoin or Tron, $1 on the big L2s, $3 elsewhere), and the action by
category (supply, provide liquidity, bridge, stake, hedge, and so on).

## Run it

Requires Node 22 or newer, standard library only.

```sh
MAKEFUN_OUTPUT_DIR=out node main.ts --input <path-to-snapshot.json>
node check-gate.mjs out
```

`--input` accepts a `snapshot.json` file or a directory holding one;
`--output` (or `MAKEFUN_OUTPUT_DIR`) picks the output directory
(default `/output`). The program self-checks the board first — every
watchlist slug covered, ranks exactly 1…N, implied values never rising with
rank, not all equal, farm steps 3–12 strings of 20–600 characters, implied
values positive whole numbers — and exits non-zero if any check fails.

Outputs in the output directory:

- `board.json` — the ranked rows with model breakdown and farm steps
- `data.js` — the dashboard dataset as `window.RADAR`
- `dashboard/` — the static dashboard (no network use)
- `screenshots/` — the three dashboard screenshots
- `dossier.json` — the submission dossier

## Dashboard

Open `out/dashboard/index.html` (it reads `../data.js`, no fetch, no
network). The board table sorts by rank, implied value, TVL and 7-day
change, and filters by search text, a watchlist-only toggle and category.
Clicking a protocol opens its detail view (`#detail-<slug>`) with the model
breakdown and farm steps; `#filter=watchlist` shows the filtered board and
`#live` the live-token peers. A methodology panel states every constant.

## Verification

Reproduced 2026-11-14 after the 10:00 UTC opening with the commands above.
Result: 198 board rows with 40 of 40 watchlist slugs covered, and all 7
gate rows passing — dashboard files 3 files / 13,896 bytes, board file 198
rows, ranks 1…198 non-increasing, coverage 40/40, farm steps in range,
screenshots 1440×800 (141 KB, 118 KB, 140 KB), dossier 560,984 bytes and
matching a rebuild. Combined implied value $7,637,396,090.
