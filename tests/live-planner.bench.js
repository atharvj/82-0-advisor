"use strict";

// Reproducible planning regression, NOT a real-game win-rate measurement.
// Future draws are sampled from captured public rolls. Both policies receive
// identical initial offers; retries preserve their actual Team/Era dimension.
const assert = require("node:assert/strict");
const {
  LiveDraftPlanner, bestLivePick, rawTeamScore, MulberryRng,
} = require("../82-0-advisor.user.js");
const samples = require("./fixtures/v4-roll-samples.json");
const pools = samples.map(([teamId, era, players]) => ({
  teamId, era,
  rows: players.map(([player, posMask, ppg, rpg, apg, spg, bpg]) => ({
    player, posMask, ppg, rpg, apg, spg, bpg,
  })),
}));
const games = 500;
const totals = [0, 0];
const retries = { team: 0, era: 0 };
let maxAnalysisMs = 0;
for (let game = 0; game < games; game += 1) {
  const rng = new MulberryRng(8192 + game);
  const initial = Array.from({ length: 5 }, () => pools[Math.floor(rng.next() * pools.length)]);
  for (let policy = 0; policy < 2; policy += 1) {
    const entries = [];
    const tokens = { team: true, era: true };
    const retryRng = new MulberryRng(32768 + game);
    for (const first of initial) {
      let cell = first;
      for (let attempt = 0; attempt < 3; attempt += 1) {
        const alternatives = {
          team: pools.filter((pool) => pool.era === cell.era && pool.teamId !== cell.teamId),
          era: pools.filter((pool) => pool.teamId === cell.teamId && pool.era !== cell.era),
        };
        const start = performance.now();
        const advice = policy
          ? new LiveDraftPlanner(pools, entries).advise(cell.rows, cell, {
            team: tokens.team && alternatives.team.length > 0,
            era: tokens.era && alternatives.era.length > 0,
          }) : { kind: "pick", best: bestLivePick(cell.rows, entries) };
        maxAnalysisMs = Math.max(maxAnalysisMs, performance.now() - start);
        if (advice.kind === "team" || advice.kind === "era") {
          tokens[advice.kind] = false;
          retries[advice.kind] += 1;
          const options = alternatives[advice.kind];
          cell = options[Math.floor(retryRng.next() * options.length)];
          continue;
        }
        if (advice.best) {
          for (const move of advice.best.moves)
            entries.find((entry) => entry.row.player === move.player).position = move.to;
          entries.push({ row: advice.best.row, position: advice.best.position });
        }
        break;
      }
    }
    totals[policy] += rawTeamScore(entries.map((entry) => entry.row));
  }
}
const averages = totals.map((total) => total / games);
assert.ok(averages[1] > averages[0] + 1,
  "position/retry planning must beat the previous no-retry greedy policy in this model");
assert.ok(retries.team > 0 && retries.era > 0,
  "the live planner must actually use both retry kinds when useful");
console.log(JSON.stringify({
  simulatedGamesPerPolicy: games,
  meanCalculatedScore: { previousGreedy: averages[0], positionRetryPlanner: averages[1] },
  recommendedRetries: retries,
  maxAnalysisMs,
}, null, 2));
