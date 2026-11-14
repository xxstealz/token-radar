// Radar model: values pre-token protocols by comparing them with live-token
// peers from the same snapshot. Every number below comes from the snapshot
// itself; nothing here names a single protocol.

export const MODEL_VERSION = "radar-2";

export const MODEL_CONSTANTS = {
  multipleFloor: 0.02,
  multipleCeiling: 2.0,
  growthFloorPct: -60,
  growthCeilingPct: 120,
  growthWeight: 0.5,
  maturityBase: 0.6,
  maturityCapDays: 1095,
  chainStep: 0.03,
  chainMaxBonus: 4,
  unknownAgeDays: 365,
  blendHigh: 0.7,
  blendLow: 0.3,
  strongSupport: 5,
  mediumSupport: 3,
};

export interface Protocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | number | null;
  gecko_id: string | null;
  symbol: string | null;
}

export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: Protocol[];
  watchlist: string[];
}

export interface ModelBreakdown {
  category_multiple: number;
  comps_n: number;
  growth_pct: number;
  growth_multiplier: number;
  maturity_multiplier: number;
  chain_multiplier: number;
  age_days: number | null;
}

export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | number | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: "pre-token";
  age_days: number | null;
  implied_value_usd: number;
  model: ModelBreakdown;
  farm_steps: string[];
}

export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number;
  change_7d: number | null;
}

export interface CategoryComp {
  category: string;
  comps_n: number;
  median_multiple: number | null;
  used_multiple: number;
}

export interface BoardBuild {
  rows: BoardRow[];
  live: LiveRow[];
  comps: CategoryComp[];
  global_multiple: number;
  total_implied_usd: number;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

const C = MODEL_CONSTANTS;

const EXCLUDED_CATEGORIES = new Set([
  "Bridge",
  "Canonical Bridge",
  "Liquid Staking",
  "Liquid Restaking",
  "Restaked BTC",
  "CEX",
]);

const EXCHANGE_PREFIXES = [
  "binance",
  "coinbase",
  "bybit",
  "kraken",
  "bitget",
  "okx",
  "bitfinex",
  "gemini",
];

const VERSION_TAIL = /\s(v\d+|\d+\.\d+)$/i;
const WRAPPED_WORD = /\b(wrapped|staked|staking)\b/i;

function clamp(value: number, low: number, high: number): number {
  return Math.min(high, Math.max(low, value));
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[mid];
  return (sorted[mid - 1] + sorted[mid]) / 2;
}

export function hasToken(p: Protocol): boolean {
  return p.mcap_usd !== null || p.gecko_id !== null || p.symbol !== null;
}

export function isPreToken(p: Protocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

export function isRankable(p: Protocol): boolean {
  if (!isPreToken(p)) return false;
  if (p.category !== null && EXCLUDED_CATEGORIES.has(p.category)) return false;
  if (VERSION_TAIL.test(p.name)) return false;
  if (WRAPPED_WORD.test(p.name)) return false;
  const lower = p.name.toLowerCase();
  for (const ex of EXCHANGE_PREFIXES) {
    if (lower === ex || lower.startsWith(ex + " ")) return false;
  }
  return true;
}

function parseDate(value: string | number | null): number | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "number") {
    const ms = value < 1e12 ? value * 1000 : value;
    return Number.isFinite(ms) ? ms : null;
  }
  const ms = Date.parse(value);
  return Number.isFinite(ms) ? ms : null;
}

export function ageDays(listedAt: string | number | null, asOf: string): number | null {
  const listedMs = parseDate(listedAt);
  const asOfMs = parseDate(asOf);
  if (listedMs === null || asOfMs === null) return null;
  const days = Math.floor((asOfMs - listedMs) / 86400000);
  return Math.max(0, days);
}

function categoryMultiple(
  category: string | null,
  ratiosByCategory: Map<string, number[]>,
  globalMultiple: number,
): { used: number; compsN: number; median: number | null } {
  const ratios = category !== null ? ratiosByCategory.get(category) ?? [] : [];
  const rawMedian = median(ratios);
  const clampedMedian =
    rawMedian === null ? null : clamp(rawMedian, C.multipleFloor, C.multipleCeiling);
  const n = ratios.length;
  let used: number;
  if (n >= C.strongSupport) {
    used = clampedMedian as number;
  } else if (n >= C.mediumSupport) {
    used =
      C.blendHigh * (clampedMedian as number) + (1 - C.blendHigh) * globalMultiple;
  } else if (n >= 1) {
    used =
      C.blendLow * (clampedMedian as number) + (1 - C.blendLow) * globalMultiple;
  } else {
    used = globalMultiple;
  }
  return { used: clamp(used, C.multipleFloor, C.multipleCeiling), compsN: n, median: clampedMedian };
}

const L2_CHAINS = [
  "arbitrum",
  "optimism",
  "base",
  "zksync",
  "polygon",
  "blast",
  "linea",
  "scroll",
  "mantle",
  "starknet",
  "mode",
  "manta",
  "taiko",
  "fraxtal",
  "ink",
  "unichain",
  "soneium",
  "abstract",
];

function gasUsd(mainChain: string): number {
  const chain = mainChain.toLowerCase();
  if (chain.includes("ethereum")) return 8;
  if (chain.includes("solana")) return 0.1;
  if (chain.includes("bitcoin") || chain.includes("tron")) return 2;
  for (const l2 of L2_CHAINS) {
    if (chain.includes(l2)) return 1;
  }
  return 3;
}

function gasLabel(usd: number): string {
  return usd === 0.1 ? "$0.10" : `$${usd}`;
}

function capitalUsd(tvl: number): number {
  if (tvl >= 5_000_000_000) return 250;
  if (tvl >= 1_000_000_000) return 150;
  if (tvl >= 100_000_000) return 100;
  return 50;
}

function holdDays(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

function actionFor(category: string | null, mainChain: string): string {
  const c = (category ?? "").toLowerCase();
  if (c.includes("lending") || c.includes("cdp") || c.includes("collateral")) {
    return "supply USDC to its main lending market";
  }
  if (c.includes("prediction")) {
    return "fund your account and place one market position";
  }
  if (
    c.includes("perpetual") ||
    c.includes("derivative") ||
    c.includes("options") ||
    c.includes("synthetic")
  ) {
    return "deposit USDC as margin and open one small hedge";
  }
  if (c.includes("bridge")) return "bridge USDC through it";
  if (c.includes("staking") || c.includes("restaking")) {
    return `stake ${mainChain}'s staking asset through it`;
  }
  if (c.includes("launchpad")) return "stake or lock funds and join one sale";
  if (c.includes("insurance")) return "buy cover for your position";
  if (c.includes("basis")) return "deposit into its basis vault";
  if (c.includes("rwa")) return "mint its yield-bearing asset";
  if (c.includes("stable")) return "mint or deposit its stable asset";
  if (c.includes("curator") || c.includes("allocator") || c.includes("risk")) {
    return "deposit into one of its vaults";
  }
  if (c.includes("payment") || c.includes("card")) return "spend through it";
  if (c.includes("privacy")) return "use its private pool";
  if (/\bai\b/.test(c) || c.includes("agent")) {
    return "use credits or stake in its agent service";
  }
  if (c.includes("index")) return "buy its index";
  if (c.includes("locker")) return "lock tokens for the longest term";
  if (c.includes("marketplace") || c.includes("nft")) return "list or buy one item";
  if (
    c.includes("dex") ||
    c.includes("yield") ||
    c.includes("leveraged") ||
    c.includes("liquidity")
  ) {
    return "provide liquidity to its main pool";
  }
  if (c.includes("chain")) return `use ${mainChain}'s native asset through it`;
  return "deposit USDC";
}

export function farmSteps(p: Protocol, age: number | null): string[] {
  const capital = capitalUsd(p.tvl_usd);
  const hold = holdDays(age);
  const mainChain = p.chains.length > 0 ? p.chains[0] : "Ethereum";
  const gas = gasUsd(mainChain);
  const action = actionFor(p.category, mainChain);
  return [
    `Use a fresh wallet that holds only the money you plan to farm with ${p.name}, and keep that wallet's seed phrase offline on paper. Setup takes about 10 minutes and costs nothing.`,
    `On ${mainChain}, ${action} with $${capital} on ${p.name} (about ${gasLabel(gas)} of gas, about 15 minutes), then leave the position in place for ${hold} days so it counts toward any future rewards.`,
    `Make one qualifying action each week on ${p.name} so your activity stays regular (about 5 minutes per week, gas only, roughly ${gasLabel(gas)} each time).`,
    `Once a week, open ${p.name} and confirm your position on ${mainChain} is still active and still earning points (about 5 minutes, no cost beyond the time).`,
    `Before you withdraw anything, open ${p.name}'s own points or rewards page and claim only through the link that page publishes, never pay anyone to claim for you (about 10 minutes, gas only).`,
    `Write the wallet address, the dates and every transaction hash for ${p.name} in a farm log you keep yourself (about 5 minutes after each action, no cost).`,
  ];
}

export function buildBoard(snapshot: Snapshot): BoardBuild {
  const liveToken = snapshot.protocols.filter(hasToken);
  const ratiosByCategory = new Map<string, number[]>();
  const globalRatios: number[] = [];
  for (const p of liveToken) {
    if (p.mcap_usd === null || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    globalRatios.push(ratio);
    if (p.category !== null) {
      const list = ratiosByCategory.get(p.category) ?? [];
      list.push(ratio);
      ratiosByCategory.set(p.category, list);
    }
  }
  const globalMedian = median(globalRatios);
  const globalMultiple = clamp(
    globalMedian ?? 1,
    C.multipleFloor,
    C.multipleCeiling,
  );

  const bySlug = new Map<string, Protocol>();
  for (const p of snapshot.protocols) bySlug.set(p.slug, p);

  const picked = new Map<string, Protocol>();
  for (const slug of snapshot.watchlist) {
    const p = bySlug.get(slug);
    if (p) picked.set(slug, p);
  }
  for (const p of snapshot.protocols) {
    if (!picked.has(p.slug) && isRankable(p)) picked.set(p.slug, p);
  }

  const scored: BoardRow[] = [];
  for (const p of picked.values()) {
    const mult = categoryMultiple(p.category, ratiosByCategory, globalMultiple);
    const growthPct = clamp(p.change_7d ?? 0, C.growthFloorPct, C.growthCeilingPct);
    const growthMultiplier = 1 + (growthPct / 100) * C.growthWeight;
    const age = ageDays(p.listed_at, snapshot.as_of);
    const ageForMaturity = age ?? C.unknownAgeDays;
    const maturityMultiplier =
      C.maturityBase +
      (Math.min(ageForMaturity, C.maturityCapDays) / C.maturityCapDays) *
        (1 - C.maturityBase);
    const chainCount = Math.max(1, p.chains.length);
    const chainMultiplier =
      1 + Math.min(chainCount - 1, C.chainMaxBonus) * C.chainStep;
    const implied = Math.max(
      1,
      Math.round(
        p.tvl_usd *
          mult.used *
          growthMultiplier *
          maturityMultiplier *
          chainMultiplier,
      ),
    );
    scored.push({
      rank: 0,
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      change_7d: p.change_7d,
      mcap_usd: p.mcap_usd,
      listed_at: p.listed_at,
      gecko_id: p.gecko_id,
      symbol: p.symbol,
      token_status: "pre-token",
      age_days: age,
      implied_value_usd: implied,
      model: {
        category_multiple: mult.used,
        comps_n: mult.compsN,
        growth_pct: growthPct,
        growth_multiplier: growthMultiplier,
        maturity_multiplier: maturityMultiplier,
        chain_multiplier: chainMultiplier,
        age_days: age,
      },
      farm_steps: farmSteps(p, age),
    });
  }

  scored.sort((a, b) => {
    if (b.implied_value_usd !== a.implied_value_usd) {
      return b.implied_value_usd - a.implied_value_usd;
    }
    return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
  });
  scored.forEach((row, i) => {
    row.rank = i + 1;
  });

  const live: LiveRow[] = liveToken
    .filter((p) => p.mcap_usd !== null && p.category !== "CEX")
    .sort((a, b) => (b.mcap_usd as number) - (a.mcap_usd as number))
    .slice(0, 24)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd as number,
      change_7d: p.change_7d,
    }));

  const boardCategories = new Set<string>();
  for (const row of scored) {
    if (row.category !== null) boardCategories.add(row.category);
  }
  const comps: CategoryComp[] = [...boardCategories]
    .sort()
    .map((category) => {
      const ratios = ratiosByCategory.get(category) ?? [];
      const rawMedian = median(ratios);
      const clampedMedian =
        rawMedian === null
          ? null
          : clamp(rawMedian, C.multipleFloor, C.multipleCeiling);
      const used = categoryMultiple(category, ratiosByCategory, globalMultiple).used;
      return {
        category,
        comps_n: ratios.length,
        median_multiple: clampedMedian,
        used_multiple: used,
      };
    });

  const watchlistSet = new Set(snapshot.watchlist);
  const earlySize = scored.filter((r) => !watchlistSet.has(r.slug)).length;
  const totalImplied = scored.reduce((sum, r) => sum + r.implied_value_usd, 0);

  return {
    rows: scored,
    live,
    comps,
    global_multiple: globalMultiple,
    total_implied_usd: totalImplied,
    watchlist_size: snapshot.watchlist.length,
    board_size: scored.length,
    early_size: earlySize,
    live_size: live.length,
  };
}
