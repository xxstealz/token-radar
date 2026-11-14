// Board UI: sorting, filtering, detail view and live-token view. All data
// comes from window.RADAR, which data.js sets before this script runs.

const DATA = window.RADAR;

const state = {
  sortKey: "rank",
  sortDir: 1,
  search: "",
  watchlistOnly: false,
  category: "",
};

function money(value) {
  if (value === null || value === undefined) return "-";
  const abs = Math.abs(value);
  if (abs >= 1e9) return "$" + (value / 1e9).toFixed(2) + "B";
  if (abs >= 1e6) return "$" + (value / 1e6).toFixed(1) + "M";
  if (abs >= 1e3) return "$" + (value / 1e3).toFixed(1) + "K";
  return "$" + value.toLocaleString("en-US");
}

function pct(value) {
  if (value === null || value === undefined) return "-";
  return (value >= 0 ? "+" : "") + value.toFixed(1) + "%";
}

function esc(text) {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function visibleRows() {
  const q = state.search.trim().toLowerCase();
  let rows = DATA.rows.filter((r) => {
    if (state.watchlistOnly && !r.watchlist) return false;
    if (state.category && r.category !== state.category) return false;
    if (q) {
      const hay = (r.name + " " + r.slug + " " + (r.category || "")).toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  const key = state.sortKey;
  rows = rows.slice().sort((a, b) => {
    let av = a[key];
    let bv = b[key];
    if (key === "change_7d") {
      av = av === null ? -Infinity : av;
      bv = bv === null ? -Infinity : bv;
    }
    if (av === bv) return a.slug < b.slug ? -1 : 1;
    return (av - bv) * state.sortDir;
  });
  return rows;
}

function sortArrow(key) {
  if (state.sortKey !== key) return "";
  return state.sortDir === 1 ? " \u2191" : " \u2193";
}

function renderBoard() {
  const rows = visibleRows();
  const body = document.getElementById("board-body");
  body.innerHTML = rows
    .map(
      (r) => `<tr>
        <td>${r.rank}</td>
        <td><a href="#detail-${esc(r.slug)}">${esc(r.name)}</a>${r.watchlist ? ' <span class="badge">watchlist</span>' : ""}</td>
        <td>${esc(r.category || "-")}</td>
        <td class="num">${money(r.implied_value_usd)}</td>
        <td class="num">${money(r.tvl_usd)}</td>
        <td class="num">${pct(r.change_7d)}</td>
        <td class="num">${r.age_days === null ? "-" : r.age_days + "d"}</td>
      </tr>`,
    )
    .join("");
  document.getElementById("row-count").textContent =
    rows.length + " of " + DATA.board_size + " protocols";
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    if (!th.dataset.label) th.dataset.label = th.textContent;
    th.textContent = th.dataset.label + sortArrow(th.getAttribute("data-sort"));
  });
}

function renderDetail(slug) {
  const row = DATA.rows.find((r) => r.slug === slug);
  const panel = document.getElementById("detail");
  if (!row) {
    panel.innerHTML = `<p>Unknown protocol: ${esc(slug)}. <a href="#">Back to the board</a></p>`;
  } else {
    panel.innerHTML = `
      <p><a href="#">&larr; Back to the board</a></p>
      <h2>${esc(row.name)}</h2>
      <p>${esc(row.category || "Uncategorised")} &middot; ${esc(row.chains.join(", "))} &middot; ${row.watchlist ? "on the watchlist" : "outside the watchlist"}</p>
      <dl class="facts">
        <div><dt>Implied value</dt><dd>${money(row.implied_value_usd)}</dd></div>
        <div><dt>TVL</dt><dd>${money(row.tvl_usd)}</dd></div>
        <div><dt>7-day TVL change</dt><dd>${pct(row.change_7d)}</dd></div>
        <div><dt>Age</dt><dd>${row.age_days === null ? "unknown" : row.age_days + " days"}</dd></div>
        <div><dt>Token status</dt><dd>pre-token</dd></div>
      </dl>
      <h3>Model breakdown</h3>
      <table class="model-table"><tbody>
        <tr><th>Category multiple</th><td>${row.category_multiple.toFixed(4)} (${row.comps_n} comps)</td></tr>
        <tr><th>Growth multiplier</th><td>${row.growth_multiplier.toFixed(4)}</td></tr>
        <tr><th>Maturity multiplier</th><td>${row.maturity_multiplier.toFixed(4)}</td></tr>
        <tr><th>Chain multiplier</th><td>${row.chain_multiplier.toFixed(4)}</td></tr>
        <tr><th>Implied value</th><td>${money(row.implied_value_usd)}</td></tr>
      </tbody></table>
      <h3>Farm steps</h3>
      <ol class="steps">${row.farm_steps.map((s) => `<li>${esc(s)}</li>`).join("")}</ol>`;
  }
  document.getElementById("board-view").hidden = true;
  document.getElementById("live-view").hidden = true;
  panel.hidden = false;
  window.scrollTo(0, 0);
}

function renderLive() {
  const body = document.getElementById("live-body");
  body.innerHTML = DATA.live
    .map(
      (r) => `<tr>
        <td>${esc(r.name)}</td>
        <td>${esc(r.category || "-")}</td>
        <td class="num">${money(r.mcap_usd)}</td>
        <td class="num">${money(r.tvl_usd)}</td>
        <td class="num">${pct(r.change_7d)}</td>
      </tr>`,
    )
    .join("");
  document.getElementById("board-view").hidden = true;
  document.getElementById("detail").hidden = true;
  document.getElementById("live-view").hidden = false;
  window.scrollTo(0, 0);
}

function showBoard() {
  document.getElementById("detail").hidden = true;
  document.getElementById("live-view").hidden = true;
  document.getElementById("board-view").hidden = false;
  renderBoard();
}

function renderMethod() {
  const c = DATA.constants;
  document.getElementById("method-body").innerHTML = `
    <p>Each pre-token protocol is valued from its own TVL times a category multiple
    taken from live-token peers in the same category. The multiple is clamped to
    ${c.multipleFloor}&ndash;${c.multipleCeiling} and pulled toward the global median
    (${DATA.global_multiple.toFixed(4)}) when a category has few peers:
    5+ peers stand alone, 3&ndash;4 blend 70/30, 1&ndash;2 blend 30/70, none use the global median.</p>
    <p>Growth: 7-day TVL change clamped to ${c.growthFloorPct}&hellip;${c.growthCeilingPct}%,
    then 1 + growth &times; ${c.growthWeight}. Maturity: 0.6 + min(age, ${c.maturityCapDays} days) / ${c.maturityCapDays} &times; 0.4
    (unknown age counts as ${c.unknownAgeDays} days). Chains: 1 + min(chains &minus; 1, ${c.chainMaxBonus}) &times; ${c.chainStep}.</p>
    <p>Implied value = max(1, round(TVL &times; multiple &times; growth &times; maturity &times; chains)).
    Model version ${esc(DATA.model_version)}; snapshot ${esc(DATA.as_of)}; floor ${money(DATA.floor_usd)}.</p>
    <p>Live-token peers are shown separately and never ranked. The board holds
    ${DATA.board_size} rows (${DATA.watchlist_size} watchlist, ${DATA.early_size} outside it)
    with a combined implied value of ${money(DATA.total_implied_usd)}.</p>`;
}

function renderCategoryOptions() {
  const select = document.getElementById("category-filter");
  const cats = [...new Set(DATA.rows.map((r) => r.category).filter(Boolean))].sort();
  for (const cat of cats) {
    const opt = document.createElement("option");
    opt.value = cat;
    opt.textContent = cat;
    select.appendChild(opt);
  }
}

function route() {
  const hash = location.hash || "";
  if (hash.startsWith("#detail-")) {
    renderDetail(hash.slice("#detail-".length));
    return;
  }
  if (hash === "#live") {
    renderLive();
    return;
  }
  if (hash.startsWith("#filter=")) {
    const params = new URLSearchParams(hash.slice("#filter=".length));
    if (params.get("watchlist") === "1" || hash.includes("watchlist")) {
      state.watchlistOnly = true;
      document.getElementById("watchlist-only").checked = true;
    }
  }
  showBoard();
}

function bindControls() {
  document.querySelectorAll("th[data-sort]").forEach((th) => {
    th.addEventListener("click", () => {
      const key = th.getAttribute("data-sort");
      if (state.sortKey === key) {
        state.sortDir = -state.sortDir;
      } else {
        state.sortKey = key;
        state.sortDir = key === "rank" ? 1 : -1;
      }
      renderBoard();
    });
  });
  document.getElementById("search").addEventListener("input", (e) => {
    state.search = e.target.value;
    renderBoard();
  });
  document.getElementById("watchlist-only").addEventListener("change", (e) => {
    state.watchlistOnly = e.target.checked;
    renderBoard();
  });
  document.getElementById("category-filter").addEventListener("change", (e) => {
    state.category = e.target.value;
    renderBoard();
  });
  document.getElementById("show-live").addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "#live";
  });
  document.getElementById("show-board").addEventListener("click", (e) => {
    e.preventDefault();
    location.hash = "";
    showBoard();
  });
  window.addEventListener("hashchange", route);
}

function init() {
  document.getElementById("as-of").textContent =
    "Snapshot " + DATA.as_of + " \u00b7 source " + DATA.source + " \u00b7 " + DATA.board_size + " protocols";
  renderCategoryOptions();
  renderMethod();
  bindControls();
  route();
}

init();
