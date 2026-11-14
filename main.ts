// Entry point: reads a DefiLlama-style snapshot, scores every pre-token
// protocol with the comparable-multiples model, and writes the board, the
// dashboard dataset and the submission dossier. Node 22 standard library
// only; run with `node main.ts --input <snapshot>`.

import { readFileSync, writeFileSync, mkdirSync, cpSync, existsSync, statSync } from "node:fs";
import { join, resolve } from "node:path";
import { buildBoard, MODEL_CONSTANTS, MODEL_VERSION } from "./lib/model.ts";
import type { BoardRow, Snapshot } from "./lib/model.ts";
import { buildDossier } from "./vendor/makefun-board.ts";

function parseArgs(argv: string[]): { input: string; output: string } {
  let input = "/input";
  let output = process.env.MAKEFUN_OUTPUT_DIR ?? "/output";
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === "--input" && i + 1 < argv.length) input = argv[++i];
    else if (argv[i] === "--output" && i + 1 < argv.length) output = argv[++i];
  }
  return { input, output };
}

function loadSnapshot(inputPath: string): Snapshot {
  let filePath = inputPath;
  if (existsSync(inputPath) && statSync(inputPath).isDirectory()) {
    filePath = join(inputPath, "snapshot.json");
  }
  const raw = readFileSync(filePath, "utf8");
  return JSON.parse(raw) as Snapshot;
}

function selfCheck(rows: BoardRow[], watchlist: string[]): void {
  const problems: string[] = [];
  const slugs = new Set(rows.map((r) => r.slug));
  for (const slug of watchlist) {
    if (!slugs.has(slug)) problems.push(`watchlist slug missing from board: ${slug}`);
  }
  for (let i = 0; i < rows.length; i++) {
    if (rows[i].rank !== i + 1) {
      problems.push(`rank out of order at position ${i}: got ${rows[i].rank}`);
      break;
    }
  }
  for (let i = 1; i < rows.length; i++) {
    if (rows[i].implied_value_usd > rows[i - 1].implied_value_usd) {
      problems.push(
        `implied value rises with rank: rank ${rows[i].rank} (${rows[i].implied_value_usd}) above rank ${rows[i - 1].rank} (${rows[i - 1].implied_value_usd})`,
      );
      break;
    }
  }
  const distinct = new Set(rows.map((r) => r.implied_value_usd));
  if (distinct.size <= 1) problems.push("all implied values are equal");
  for (const row of rows) {
    if (!Number.isInteger(row.implied_value_usd) || row.implied_value_usd <= 0) {
      problems.push(`bad implied value for ${row.slug}: ${row.implied_value_usd}`);
    }
    if (row.farm_steps.length < 3 || row.farm_steps.length > 12) {
      problems.push(`farm step count out of range for ${row.slug}: ${row.farm_steps.length}`);
    }
    for (const step of row.farm_steps) {
      if (step.length < 20 || step.length > 600) {
        problems.push(`farm step length out of range for ${row.slug}: ${step.length} chars`);
      }
    }
  }
  if (problems.length > 0) {
    throw new Error(`self-check failed:\n- ${problems.join("\n- ")}`);
  }
}

async function main(): Promise<void> {
  const { input, output } = parseArgs(process.argv.slice(2));
  const snapshot = loadSnapshot(input);
  const built = buildBoard(snapshot);
  selfCheck(built.rows, snapshot.watchlist);

  const outDir = resolve(output);
  mkdirSync(outDir, { recursive: true });

  writeFileSync(join(outDir, "board.json"), JSON.stringify({ rows: built.rows }, null, 2));

  const watchlistSet = new Set(snapshot.watchlist);
  const dataset = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    constants: MODEL_CONSTANTS,
    model_version: MODEL_VERSION,
    watchlist_size: built.watchlist_size,
    board_size: built.board_size,
    early_size: built.early_size,
    live_size: built.live_size,
    total_implied_usd: built.total_implied_usd,
    global_multiple: built.global_multiple,
    comps: built.comps,
    rows: built.rows.map((r) => ({
      rank: r.rank,
      slug: r.slug,
      name: r.name,
      category: r.category,
      chains: r.chains,
      tvl_usd: r.tvl_usd,
      change_7d: r.change_7d,
      mcap_usd: r.mcap_usd,
      listed_at: r.listed_at,
      age_days: r.age_days,
      implied_value_usd: r.implied_value_usd,
      category_multiple: r.model.category_multiple,
      comps_n: r.model.comps_n,
      growth_multiplier: r.model.growth_multiplier,
      maturity_multiplier: r.model.maturity_multiplier,
      chain_multiplier: r.model.chain_multiplier,
      watchlist: watchlistSet.has(r.slug),
      farm_steps: r.farm_steps,
    })),
    live: built.live,
  };
  writeFileSync(join(outDir, "data.js"), `window.RADAR = ${JSON.stringify(dataset)};\n`);

  const root = new URL(".", import.meta.url).pathname;
  cpSync(join(root, "dashboard"), join(outDir, "dashboard"), { recursive: true });
  cpSync(join(root, "screenshots"), join(outDir, "screenshots"), { recursive: true });

  const dossier = await buildDossier(outDir, {
    text_max_bytes: 65536,
    screenshots: { max: 4, max_bytes: 524288 },
    dashboard: { max_files: 400, max_bytes: 4194304 },
  });
  const rawBytes =
    dossier !== null &&
    typeof dossier === "object" &&
    !(dossier instanceof Uint8Array) &&
    "bytes" in dossier
      ? (dossier as { bytes: unknown }).bytes
      : dossier;
  const bytes =
    typeof rawBytes === "string"
      ? Buffer.from(rawBytes, "utf8")
      : rawBytes instanceof Uint8Array
        ? Buffer.from(rawBytes)
        : Buffer.from(JSON.stringify(rawBytes), "utf8");
  writeFileSync(join(outDir, "dossier.json"), bytes);

  console.log(
    `board: ${built.rows.length} rows, watchlist ${built.watchlist_size}/${built.watchlist_size}, live ${built.live.length}, total implied $${built.total_implied_usd.toLocaleString("en-US")}`,
  );
  console.log(`wrote ${outDir}`);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
