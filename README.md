# Token Radar — token-radar-01

A token launch radar: it reads a sealed DefiLlama snapshot of every protocol at or
above $5M of TVL, ranks the protocols that record no token by what their launch would
be worth, and hands in a web dashboard with the board, a detail view for each protocol
and the steps to farm it.

## How to run

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts --input <snapshot.json>
```

`main.ts` (Node 22, standard library only) writes `board.json`, `data.js`, copies
`dashboard/` and `screenshots/` into the output directory and writes `dossier.json`
with `vendor/makefun-board.ts`. The program is deterministic: two runs on the same
snapshot write the same bytes.

## What it reads

`snapshot.json` is the sealed protocol data (758 protocols, fetched once from
DefiLlama's public protocols endpoint, `as_of` 2026-11-14). Each protocol carries ten
fields: `slug`, `name`, `category`, `chains`, `tvl_usd`, `change_7d`, `mcap_usd`,
`listed_at`, `gecko_id`, `symbol`. The snapshot's `watchlist` names 40 protocols: TVL
at or above the $50,000,000 floor, no token recorded, and not a wrapped, staked or
bridged product of one that trades.

## The board

198 rows: all 40 watchlist protocols plus 158 further pre-token protocols below the
floor. A protocol is rankable when it records no token (`mcap_usd`, `gecko_id` and
`symbol` all null) and is not a wrapped, staked or bridged product of a token that
already trades (category not Bridge, Canonical Bridge, Liquid Staking, Liquid
Restaking, Restaked BTC or CEX; name not versioned, carrying no whole word wrapped,
staked or staking, and not starting with an exchange's name). Live-token protocols are
kept apart in the dashboard's Live token view, shown with their market caps, never
mixed into the ranking. "No token" means the snapshot records none: a protocol may
still have a token its DefiLlama record does not carry.

## The model (radar-2)

Implied value follows only from the snapshot's own figures, through comparable
multiples — no protocol name is ever special-cased:

```
multiple   = the category's median mcap/TVL among the snapshot's own live-token
             protocols, clamped to [0.02, 2.0] first, then shrunk toward the global
             median (0.21x) by support: 5+ live comps stand alone, 3-4 blend 70/30,
             1-2 blend 30/70, none use the global median
growth     = clamp(change_7d, -60, 120) per cent
growthMult = 1 + (growth / 100) x 0.5
maturity   = 0.6 + min(age_days, 1095) / 1095 x 0.4   (age_days unknown: 365)
chains     = 1 + min(chains - 1, 4) x 0.03
implied    = max(1, round(tvl_usd x multiple x growthMult x maturity x chains))
```

Age is the time since DefiLlama began tracking the protocol — the best record of how
long it has run with no token. The multiples come from the snapshot itself, so a new
snapshot re-prices every row. The dashboard's methodology panel lists every category's
median multiple, its number of live comps and the multiple actually used, and the
detail view of each protocol shows its own breakdown and recomputes the number, so
the page's code and `board.json` visibly agree.

Worked example (rank 1, Steakhouse Financial): TVL $2,754.0M x Risk Curators
multiple 0.75x (1 live comp, shrunk toward the global median) x growth 0.989 x
maturity 1.00 x chains 1.00 = $1,825,794,718.

## Farm plans

Every row carries six steps, each with a cost and a time, derived from the protocol's
own record (category, main chain, TVL tier, age) — never from a hand-written list of
names. Capital scales with TVL ($50–$250), gas follows the main chain (Ethereum
~$8, L2s ~$1, Solana ~$0.10), and the hold window is longer for younger protocols
(60 days under 180 days old, 45 under a year, 30 otherwise). The plan never promises
an airdrop: it says what to do and what it costs, and to claim only from the link the
protocol itself publishes.

## The dashboard

`dashboard/` is a static page with no network: `index.html`, `app.css`, `app.js` read
`data.js` (written beside the page) and render the ranked board, a category chart, the
methodology panel and a detail dialog for every protocol. Filters: search, category,
chain, TVL floor, seven-day growth, watchlist-only, and a Pre-token / Live token
switch. Every column sorts. The page state lives in the URL hash, so a board, a
filtered view or a protocol's detail view is a link.

## Files

- `main.ts` — the entry program
- `lib/model.ts` — the radar-2 model, the board builder and the farm plans
- `vendor/makefun-board.ts` — make.fun's dossier library, copied byte for byte
- `dashboard/` — the static page (`index.html`, `app.css`, `app.js`)
- `screenshots/` — the board, a protocol's detail view, a filtered view
- `BUILD_LOG.md` — the build's decisions and verification results

## Re-authoring

The entry was re-authored in a fresh session after the competition opened
(2026-11-14 10:00 UTC), because the pre-submit check refuses build sessions and
repositories from before opening. The files above were written again in that
session — same radar-2 model, same dashboard, same outputs — and the reproduce
commands were re-run to confirm all seven gate rows pass.
