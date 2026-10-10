"use strict";

// Refresh factual stat tuples, not executable third-party code. The installed
// userscript remains self-contained: it never fetches this mirror at runtime.
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const { execFileSync } = require("node:child_process");
const { usableReferenceStats } = require("../82-0-advisor.user.js");
const samples = require("../tests/fixtures/v4-roll-samples.json");
const URL = "https://82-0.vercel.app/players.json";
const ERAS = new Set(["1960s", "1970s", "1980s", "1990s", "2000s", "2010s", "2020s"]);

async function main() {
  const date = process.argv.find(x => x.startsWith("--date="))?.slice(7);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date || "") || !Number.isFinite(Date.parse(date)))
    throw new Error("Supply the verification date explicitly: --date=YYYY-MM-DD");
  const response = await fetch(URL, { signal: AbortSignal.timeout(20000) });
  if (!response.ok) throw new Error(`Public snapshot returned ${response.status}`);
  const text = await response.text();
  if (Buffer.byteLength(text) > 10 * 1024 * 1024) throw new Error("Unexpectedly large snapshot");
  const data = JSON.parse(text);
  if (!Array.isArray(data) || data.length < 10000) throw new Error("Incomplete snapshot");
  const keys = ["ppg", "rpg", "apg", "spg", "bpg"];
  const matches = (row, tuple) => row.player === tuple[0] &&
    keys.every((key, i) => Math.abs(Number(row[key] || 0) - tuple[i + 2]) < 0.02);
  // Derive each sampled franchise's abbreviation by intersecting its exact
  // name/stat matches. Do not assume server numeric team IDs are permanent.
  const teamMatches = new Map();
  for (const [teamId, era, players] of samples) {
    for (const tuple of players) {
      const teams = new Set(data.filter(row => row.era === era && matches(row, tuple)).map(row => row.team));
      const previous = teamMatches.get(teamId);
      teamMatches.set(teamId, previous ? new Set([...previous].filter(x => teams.has(x))) : teams);
    }
  }
  let verified = 0;
  for (const [teamId, era, players] of samples) {
    const teams = teamMatches.get(teamId);
    if (teams.size !== 1) throw new Error(`Ambiguous or changed sample franchise ${teamId}`);
    const team = [...teams][0];
    for (const tuple of players) {
      if (!data.some(row => row.team === team && row.era === era && matches(row, tuple)))
        throw new Error(`Snapshot differs from saved Classic sample: ${tuple[0]} ${team} ${era}`);
      verified += 1;
    }
  }
  const pools = new Map();
  let skipped = 0;
  for (const row of data) {
    if (!ERAS.has(row.era)) continue;
    if (typeof row.player !== "string" || !/^[A-Z]{3}$/.test(row.team) ||
        !usableReferenceStats(row)) { skipped += 1; continue; }
    const key = `${row.team}|${row.era}`;
    if (!pools.has(key)) pools.set(key, [row.team, row.era, []]);
    pools.get(key)[2].push([row.player, ...keys.map(key => row[key] ?? null)]);
  }
  const cells = [...pools.values()].sort((a, b) => `${a[0]}|${a[1]}`.localeCompare(`${b[0]}|${b[1]}`));
  const count = cells.reduce((sum, cell) => sum + cell[2].length, 0);
  if (cells.length < 150 || count < 9000) throw new Error("Validated snapshot is incomplete");
  const sha = crypto.createHash("sha256").update(text).digest("hex");
  const file = path.resolve(__dirname, "../82-0-advisor.user.js");
  const script = fs.readFileSync(file, "utf8");
  const begin = "  // BEGIN bundled reference stats";
  const end = "  // END bundled reference stats";
  const start = script.indexOf(begin);
  const finish = script.indexOf(end, start) + end.length;
  if (start < 0 || finish < end.length) throw new Error("Reference markers missing");
  const previous = script.slice(start, finish);
  const block = [begin,
    `  // Source: ${URL}; verified ${date}. Raw source SHA-256: ${sha}`,
    `  // ${count} factual stat rows; ${cells.length} team/era pools. Live/cached stats take priority.`,
    "  // Eligibility and selectable players always come from the actual server offer.",
    `  const REFERENCE_STATS_DATE = ${JSON.stringify(date)};`,
    "  const REFERENCE_STATS_CELLS = [",
    ...cells.map(cell => `    ${JSON.stringify(cell)},`),
    "  ];", end].join("\n");
  const patch = ["*** Begin Patch", `*** Update File: ${file}`, "@@",
    ...previous.split("\n").map(line => `-${line}`),
    ...block.split("\n").map(line => `+${line}`), "*** End Patch"].join("\n");
  process.stdout.write(execFileSync("apply_patch", [], { input: patch, encoding: "utf8", maxBuffer: 20 * 1024 * 1024 }));
  console.log(JSON.stringify({ verifiedClassicSamples: verified, referenceRows: count,
    teamEraPools: cells.length, invalidRowsSkipped: skipped, sourceSha256: sha }));
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
