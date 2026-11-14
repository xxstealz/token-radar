// Gate self-check: mirrors the seven scorer rows in RULES.txt against out/.
// Usage: node check-gate.mjs [outDir] [snapshotPath]
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

const out = process.argv[2] ?? 'out';
const snapPath = process.argv[3] ?? '/home/hatch/workspace/makefun/token-radar-01-kit/input/snapshot.json';
const snap = JSON.parse(readFileSync(snapPath, 'utf8'));
const slugs = new Set(snap.protocols.map((p) => p.slug));
let fail = 0;
const check = (name, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? ' — ' + detail : ''}`);
  if (!ok) fail++;
};

// 1. dashboard_files
const dashDir = join(out, 'dashboard');
const dashFiles = readdirSync(dashDir).filter((f) => statSync(join(dashDir, f)).isFile());
const hasHtml = dashFiles.includes('index.html');
const hasCss = dashFiles.some((f) => f.endsWith('.css'));
const hasJs = dashFiles.some((f) => f.endsWith('.js'));
const totalBytes = dashFiles.reduce((n, f) => n + statSync(join(dashDir, f)).size, 0);
let netAddr = null;
for (const f of dashFiles) {
  const text = readFileSync(join(dashDir, f), 'utf8');
  const m = text.match(/https?:\/\/[^\s"'<>]+/);
  if (m) { netAddr = `${f}: ${m[0]}`; break; }
}
check('dashboard_files', hasHtml && hasCss && hasJs && dashFiles.length <= 400 && totalBytes <= 4 * 1024 * 1024 && !netAddr,
  `${dashFiles.length} files, ${totalBytes} bytes${netAddr ? ', NETWORK ADDR ' + netAddr : ''}`);

// 2. board_file
const board = JSON.parse(readFileSync(join(out, 'board.json'), 'utf8'));
const rows = board.rows;
const boardSize = statSync(join(out, 'board.json')).size;
const badSlugs = rows.filter((r) => !slugs.has(r.slug)).slice(0, 3).map((r) => r.slug);
check('board_file', rows.length >= 100 && rows.length <= 4000 && boardSize <= 8 * 1024 * 1024 && badSlugs.length === 0
  && rows.every((r) => r.name && Number.isSafeInteger(r.rank) && r.rank > 0 && Number.isSafeInteger(r.implied_value_usd) && r.implied_value_usd > 0 && r.implied_value_usd <= 1e14),
  `${rows.length} rows, ${boardSize} bytes${badSlugs.length ? ', bad slugs: ' + badSlugs.join(',') : ''}`);

// 3. sorted_by_value
const ranksOk = rows.every((r, i) => r.rank === i + 1);
const orderOk = rows.every((r, i) => i === 0 || r.implied_value_usd <= rows[i - 1].implied_value_usd);
const notAllSame = rows.length < 2 || rows[0].implied_value_usd !== rows[rows.length - 1].implied_value_usd;
check('sorted_by_value', ranksOk && orderOk && notAllSame, `ranks 1..${rows.length}: ${ranksOk}, non-increasing: ${orderOk}, not all same: ${notAllSame}`);

// 4. coverage
const rowSlugs = new Set(rows.map((r) => r.slug));
const missing = snap.watchlist.filter((s) => !rowSlugs.has(s));
check('coverage', missing.length === 0, `${snap.watchlist.length - missing.length}/${snap.watchlist.length} watchlist slugs covered`);

// 5. farm_steps
const badSteps = rows.filter((r) => !(r.farm_steps.length >= 3 && r.farm_steps.length <= 12 && r.farm_steps.every((s) => s.trim().length >= 20 && s.trim().length <= 600)));
check('farm_steps', badSteps.length === 0, badSteps.length ? `bad: ${badSteps.slice(0, 3).map((r) => r.slug).join(',')}` : 'all rows 3-12 steps, 20-600 chars');

// 6. screenshots
const shotsDir = join(out, 'screenshots');
const shots = readdirSync(shotsDir).filter((f) => !f.startsWith('.'));
let shotsOk = shots.length >= 3 && shots.length <= 4;
let shotDetail = '';
for (const f of shots) {
  const buf = readFileSync(join(shotsDir, f));
  const isPng = buf[0] === 0x89 && buf[1] === 0x50;
  const isJpg = buf[0] === 0xff && buf[1] === 0xd8;
  let w = 0, h = 0;
  if (isPng) { w = buf.readUInt32BE(16); h = buf.readUInt32BE(20); }
  const ok = (isPng || isJpg) && buf.length <= 524288 && Math.max(w, h) <= 1440 && Math.min(w, h) >= 800;
  if (!ok) shotsOk = false;
  shotDetail += `${f} ${w}x${h} ${Math.round(buf.length / 1024)}KB; `;
}
check('screenshots', shotsOk, shotDetail.trim());

// 7. dossier_matches — rebuild with the vendored library and compare bytes
const { buildDossier } = await import('./vendor/makefun-board.ts');
const rebuilt = buildDossier(out, { text_max_bytes: 65536, screenshots: { max: 4, max_bytes: 524288 }, dashboard: { max_files: 400, max_bytes: 4194304 } });
const written = readFileSync(join(out, 'dossier.json'));
check('dossier_matches', Buffer.from(rebuilt).equals(written), `dossier ${written.length} bytes, rebuilt ${rebuilt.length} bytes`);

// extras: dashboard source under the 64 KiB text cap; data.js present
const srcTotal = dashFiles.reduce((n, f) => n + statSync(join(dashDir, f)).size, 0);
const dossier = JSON.parse(written.toString('utf8'));
console.log(`INFO  dashboard source ${srcTotal} bytes (cap 65536), dossier text ${Buffer.byteLength(dossier.text)} bytes, images ${dossier.images.length}`);
console.log(fail === 0 ? 'ALL 7 GATE ROWS PASS' : `${fail} GATE ROW(S) FAIL`);
process.exit(fail === 0 ? 0 : 1);
