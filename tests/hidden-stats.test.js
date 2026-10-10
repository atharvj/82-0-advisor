"use strict";

const assert = require("node:assert/strict");
const { buildReferenceStatsIndex, recoverDealtStats, statContextKey,
  usableReferenceStats, normalizeDealtCell, normalizeDataset, referenceStatsCells,
  referenceStatsDate } = require("../82-0-advisor.user.js");
const index = buildReferenceStatsIndex();
assert.equal(index.size, 10626);
const pool = referenceStatsCells.find(([team, era]) => team === "GSW" && era === "1990s");
assert.equal(pool[2].length, 73, "bundled stats must cover the screenshot's entire GSW 1990s pool");
const cell = normalizeDealtCell({ seq: 1, team: { team_id: "349", abbr: "GSW" }, era: "1990s",
  squad: pool[2].map(([name], i) => ({ name, player_id: i + 1, positions: ["PF"] })) });
const before = JSON.stringify(cell);
const recovered = recoverDealtStats(cell, new Map(), index);
assert.equal(recovered.squad.filter(p => p.hasStats).length, 73);
assert.equal(JSON.stringify(cell), before, "recovery must not alter the site's original payload");
assert.ok(recovered.squad.every(p => p.statsSource === "reference" && p.statsReferenceDate === referenceStatsDate));
assert.deepEqual(recovered.squad.map(p => [p.id, p.name, p.positions]),
  cell.squad.map(p => [p.id, p.name, p.positions]), "current identities and eligibility must remain authoritative");
assert.equal(normalizeDataset(recovered.squad).rows.length, 73);
assert.ok(normalizeDataset(recovered.squad).rows.every(r => r.statsSource === "reference"));
const jamison = cell.squad.find(p => p.name === "Antawn Jamison");
const one = { ...cell, squad: [jamison] };
assert.equal(recoverDealtStats(one, new Map(), index).squad[0].stats.ppg, 9.6);

const liveStats = { ppg: 20, rpg: 10, apg: 5, spg: 1.5, bpg: 1 };
const wire = { ...one, squad: [{ ...jamison, hasStats: true, stats: liveStats }] };
assert.deepEqual(recoverDealtStats(wire, new Map(), index).squad[0].stats, liveStats);
assert.equal(recoverDealtStats(wire, new Map(), index).squad[0].statsSource, "live");
const cached = { ...jamison, hasStats: true, stats: liveStats, statsSource: "live" };
const restored = recoverDealtStats(one, new Map([[jamison.id, cached]]), index).squad[0];
assert.deepEqual(restored.stats, liveStats, "actual observed stats take priority over the snapshot");
assert.equal(restored.statsSource, "cached");
const currentIdReference = { ...cached, stats: { ...liveStats, ppg: 9.6 },
  statsSource: "reference", statsReferenceDate: referenceStatsDate };
const oldIdLive = { ...cached, id: "older-server-id", statsObservedAt: 1 };
assert.deepEqual(recoverDealtStats(one,
  new Map([[jamison.id, currentIdReference],
    [oldIdLive.id, oldIdLive]]), index).squad[0].stats, liveStats,
  "a same-ID reference must not hide a real observation under another ID");
for (const other of [{ team: "CLE" }, { era: "2010s" }, { name: "Different player" }]) {
  const wrong = { ...cached, ...other };
  assert.equal(recoverDealtStats(one, new Map([[jamison.id, wrong]]), index).squad[0].stats.ppg, 9.6,
    "even an identical ID must not borrow another player/team/era's stats");
}
const staleReference = { ...cached, statsSource: "reference", statsReferenceDate: "2000-01-01" };
assert.equal(recoverDealtStats(one, new Map([[jamison.id, staleReference]]), index).squad[0].stats.ppg, 9.6,
  "refresh a cached reference from the current bundle, not its old values");
assert.equal(recoverDealtStats(one, new Map([[jamison.id, staleReference]]), new Map()).squad[0].hasStats, false);

const partial = { ...one, squad: [{ ...jamison, stats: { ppg: 0, rpg: null, apg: null, spg: null, bpg: null } }] };
const partialStats = recoverDealtStats(partial, new Map(), index).squad[0].stats;
assert.equal(partialStats.ppg, 0, "a genuine supplied zero is not missing data");
assert.equal(partialStats.rpg, 6.4, "null hidden fields must be recovered, not turn into zeros");
assert.equal(partialStats.spg, 0.8);
const unknown = { ...one, squad: [{ ...jamison, name: "Unknown new player", id: "unknown" }] };
assert.equal(recoverDealtStats(unknown, new Map(), index).squad[0].hasStats, false,
  "unknown players must never get guessed stats or fabricated recommendations");
assert.equal(recoverDealtStats(unknown, new Map(), index).squad.length, 1,
  "references may supply numbers, never absent selectable players");

assert.equal(statContextKey("Dāvis Bertāns", "GSW", "1990s"), statContextKey("Davis Bertans", "GSW", "1990s"));
assert.equal(statContextKey("B.J. Armstrong", "GSW", "1990s"), statContextKey("BJ Armstrong", "GSW", "1990s"));
assert.equal(statContextKey("J.R. Smith", "NJN", "1980s"), statContextKey("JR Smith", "BKN", "1980s"));
assert.notEqual(statContextKey("JR Smith", "BKN", "1980s"), statContextKey("JR Smith", "BKN", "1990s"));
assert.notEqual(statContextKey("JR Smith", "BKN", "1980s"), statContextKey("JR Smith", "NYK", "1980s"));
const ambiguous = buildReferenceStatsIndex([["GSW", "1990s", [
  ["J.R. Smith", 10, 5, 3, 1, 1], ["JR Smith", 20, 5, 3, 1, 1],
]]]);
assert.equal(ambiguous.get(statContextKey("JR Smith", "GSW", "1990s")), null);
const ambiguousPlayer = { ...jamison, name: "JR Smith" };
assert.equal(recoverDealtStats({ ...one, squad: [ambiguousPlayer] },
  new Map([[ambiguousPlayer.id, { ...ambiguousPlayer, hasStats: true, stats: liveStats,
    statsSource: "reference", statsReferenceDate: referenceStatsDate }]]), ambiguous).squad[0].hasStats,
  false, "a cached reference must not revive a conflicting bundled match");
assert.equal(usableReferenceStats({ ppg: null, rpg: 5, apg: 3, spg: null, bpg: null }), false);
assert.equal(usableReferenceStats({ ppg: 20, rpg: 5, apg: 3, spg: null, bpg: null }), true);
assert.equal(usableReferenceStats({ ppg: 999, rpg: 5, apg: 3, spg: 1, bpg: 1 }), false);

console.log("Hidden-stat recovery passed: all 73 GSW 1990s players, live/cache precedence, exact context, spelling variants, safe partial fields, source labels, and no invented players.");
