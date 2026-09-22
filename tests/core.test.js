"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  POSITIONS,
  TARGET_SCORE,
  normalizeDataset,
  calculateTeamResult,
  projectedWins,
  meaningfulRateAdvantage,
  bestRolloutSequenceRaw,
  stratifiedFutureKeys,
  rolloutCandidateShortlist,
  reachableRosterStates,
  shortestPlacementPlan,
  movePlanUpgradesOccupiedPosition,
  MulberryRng,
  buildStudioDrawIndex,
  criticalStudioPlayerIds,
  StudioShadowSession,
  ExactCeilingOptimizer,
} = require("../82-0-advisor.user.js");

function row(player, team, era, positions, ppg, rpg, apg, spg, bpg) {
  return { player, team, era, positions, ppg, rpg, apg, spg, bpg };
}

assert.equal(TARGET_SCORE, 109.5);
assert.equal(projectedWins(109.4), 81, "109.4 must remain an 81-win score");
assert.equal(
  projectedWins(109.5),
  82,
  "109.5 is the first displayed 82-win score",
);
assert.equal(
  projectedWins(91.3),
  66,
  "record projection must match the planning expectation curve",
);
assert.equal(
  projectedWins(98),
  72,
  "planning curve must match the signed-in result shown by the site",
);

assert.equal(
  meaningfulRateAdvantage(0.55, 100, 0.5, 100),
  false,
  "a small noisy path-rate difference must not override expected score",
);
assert.equal(
  meaningfulRateAdvantage(0.75, 100, 0.5, 100),
  true,
  "a large statistically meaningful path advantage must be recognized",
);

const stratifiedKeys = [
  "A|1960s",
  "B|1960s",
  "A|1970s",
  "B|1970s",
  "A|1980s",
  "B|1980s",
  "A|1990s",
  "B|1990s",
  "A|2000s",
  "B|2000s",
  "A|2010s",
  "B|2010s",
  "A|2020s",
  "B|2020s",
];
const stratified = stratifiedFutureKeys(stratifiedKeys, 3, 14, "test");
assert.equal(stratified.length, 14);
for (let round = 0; round < 3; round += 1) {
  const eraCounts = new Map();
  for (const scenario of stratified) {
    const era = scenario[round].split("|")[1];
    eraCounts.set(era, (eraCounts.get(era) || 0) + 1);
  }
  assert.deepEqual(
    [...eraCounts.values()].sort((left, right) => left - right),
    [2, 2, 2, 2, 2, 2, 2],
    "every forecast round must represent every era equally",
  );
  for (const era of eraCounts.keys()) {
    const teams = new Set(
      stratified
        .map((scenario) => scenario[round])
        .filter((key) => key.endsWith(`|${era}`))
        .map((key) => key.split("|")[0]),
    );
    assert.equal(
      teams.size,
      2,
      "team sampling must rotate within each represented era",
    );
  }
}

const shortlistData = normalizeDataset(
  POSITIONS.flatMap((position, positionIndex) =>
    Array.from({ length: 5 }, (_, index) =>
      row(
        `${position}-${index}`,
        "TST",
        "2020s",
        [position],
        10 + positionIndex + index,
        2,
        2,
        0,
        0,
      ),
    ),
  ),
);
const shortlist = rolloutCandidateShortlist([], 0, shortlistData.rows);
for (const position of POSITIONS) {
  assert.ok(
    shortlist.some((candidate) => candidate.row.positions.includes(position)),
    `bounded rollout finalists must preserve a candidate for ${position}`,
  );
}

const knownMaximum = [
  row("Oscar Robertson", "SAC", "1960s", ["PG"], 29.66, 8.73, 10.5, null, null),
  row("Michael Jordan", "CHI", "1980s", ["SG"], 32.65, 6.15, 5.93, 2.81, 1.18),
  row("Elgin Baylor", "LAL", "1960s", ["SF"], 28.11, 13.75, 4.29, null, null),
  row("Bob Pettit", "ATL", "1960s", ["PF"], 27.55, 16.69, 3.3, null, null),
  row("Wilt Chamberlain", "GSW", "1960s", ["C"], 41.46, 25.1, 3.02, null, null),
];
const maximumResult = calculateTeamResult(knownMaximum);
assert.equal(maximumResult.score, 139.4);
assert.equal(maximumResult.wins, 82);

const rolloutData = normalizeDataset([
  row("Fixed PG", "AAA", "2020s", ["PG"], 10, 2, 5, 1, 0.1),
  row("Shared Star", "BBB", "2020s", ["SG", "SF"], 30, 5, 5, 1, 1),
  row("Backup SG", "BBB", "2020s", ["SG"], 18, 3, 3, 1, 0.2),
  row("Shared Star", "CCC", "2020s", ["SG", "SF"], 29, 5, 5, 1, 1),
  row("Backup SF", "CCC", "2020s", ["SF"], 17, 4, 3, 1, 0.3),
]);
const [fixedPg, sharedOne, backupSg, sharedTwo, backupSf] = rolloutData.rows;
const rolloutRaw = bestRolloutSequenceRaw(
  [fixedPg],
  1 << 0,
  [
    [sharedOne, backupSg],
    [sharedTwo, backupSf],
  ],
);
assert.equal(
  rolloutRaw,
  Math.max(
    calculateTeamResult([fixedPg, sharedOne, backupSf]).raw,
    calculateTeamResult([fixedPg, backupSg, sharedTwo]).raw,
  ),
  "rollout search must enforce unique player names across future cells",
);

const eliteStealsOnly = calculateTeamResult([
  row("A", "AAA", "2020s", ["PG"], 0, 0, 0, 3, 0),
]);
const dilutedSteals = calculateTeamResult([
  row("A", "AAA", "2020s", ["PG"], 0, 0, 0, 3, 0),
  row("B", "BBB", "2020s", ["SG"], 0, 0, 0, 1, 0),
]);
assert.ok(
  dilutedSteals.raw < eliteStealsOnly.raw,
  "adding a below-average recorded defender must be able to lower the score",
);

const normalized = normalizeDataset([
  ...knownMaximum,
  row("Old", "OLD", "1950s", ["PG"], 99, 99, 99, 9, 9),
  row("No Position", "BAD", "2020s", [], 99, 99, 99, 9, 9),
]);
assert.equal(
  normalized.rows.length,
  5,
  "1950s and positionless rows are not in the live game pool",
);
assert.equal(
  normalized.rows[0].spg,
  0,
  "missing defense normalizes to zero, not a fake boost",
);

const optimizerRows = [
  ...knownMaximum,
  row("Decoy PG", "AAA", "2020s", ["PG"], 1, 1, 1, 1, 1),
  row("Decoy SG", "AAA", "2020s", ["SG"], 1, 1, 1, 1, 1),
  row("Decoy SF", "AAA", "2020s", ["SF"], 1, 1, 1, 1, 1),
  row("Decoy PF", "AAA", "2020s", ["PF"], 1, 1, 1, 1, 1),
  row("Decoy C", "AAA", "2020s", ["C"], 1, 1, 1, 1, 1),
  // The same display name on two cards may never fill two slots.
  row("Duplicate Star", "AAA", "2020s", ["PG"], 50, 10, 10, 2, 2),
  row("Duplicate Star", "BBB", "2010s", ["SG"], 50, 10, 10, 2, 2),
];
const optimizerData = normalizeDataset(optimizerRows);
const optimizer = new ExactCeilingOptimizer(
  optimizerData.rows,
  optimizerData.names,
);
const ceiling = optimizer.relaxedCeiling([], true);
assert.ok(ceiling && ceiling.future.length === 5);
assert.equal(
  new Set(ceiling.future.map((pick) => pick.row.player)).size,
  5,
  "optimizer enforces unique names",
);
assert.equal(
  ceiling.score,
  calculateTeamResult(ceiling.future.map((pick) => pick.row)).score,
);

const movementData = normalizeDataset([
  row("A", "AAA", "2020s", ["PG", "SG"], 1, 1, 1, 0, 0),
  row("B", "AAA", "2020s", ["SG", "SF"], 1, 1, 1, 0, 0),
  row("Candidate", "AAA", "2020s", ["PG"], 1, 1, 1, 0, 0),
]);
const [moveA, moveB, moveCandidate] = movementData.rows;
const oneMovePlan = shortestPlacementPlan(
  reachableRosterStates([{ row: moveA, position: "PG" }]),
  moveCandidate,
  (1 << 0) | (1 << 1),
);
assert.deepEqual(
  oneMovePlan.moves.map(({ player, from, to }) => [player, from, to]),
  [["A", "PG", "SG"]],
  "the coach must move a flexible prior pick before placing a PG-only candidate",
);
assert.equal(oneMovePlan.position, "PG");
assert.equal(
  movePlanUpgradesOccupiedPosition(
    [{ row: moveA, position: "PG" }],
    moveCandidate,
    oneMovePlan,
  ),
  false,
  "an equal current-roll player must not trigger a speculative position move",
);

const strongerMovementData = normalizeDataset([
  row("Incumbent", "AAA", "2020s", ["PG", "SG"], 5, 1, 1, 0, 0),
  row("Upgrade", "BBB", "2020s", ["PG"], 25, 5, 5, 1, 0),
]);
const [incumbent, upgrade] = strongerMovementData.rows;
const upgradePlan = shortestPlacementPlan(
  reachableRosterStates([{ row: incumbent, position: "PG" }]),
  upgrade,
  (1 << 0) | (1 << 1),
);
assert.equal(
  movePlanUpgradesOccupiedPosition(
    [{ row: incumbent, position: "PG" }],
    upgrade,
    upgradePlan,
  ),
  true,
  "a clearly stronger roll may move the incumbent out of its occupied slot",
);

const augmentingPlan = shortestPlacementPlan(
  reachableRosterStates([
    { row: moveA, position: "PG" },
    { row: moveB, position: "SG" },
  ]),
  moveCandidate,
  (1 << 0) | (1 << 1) | (1 << 2),
);
assert.deepEqual(
  augmentingPlan.moves.map(({ player, from, to }) => [player, from, to]),
  [
    ["B", "SG", "SF"],
    ["A", "PG", "SG"],
  ],
  "the BFS must find a two-step augmenting path",
);
assert.equal(augmentingPlan.position, "PG");

const loopData = normalizeDataset([
  row("Luka Doncic", "DAL", "2020s", ["PG", "SG", "SF"], 30, 9, 9, 1, 0.5),
  row("James Harden", "HOU", "2010s", ["PG", "SG"], 29, 7, 9, 1.7, 0.6),
  row("Allen Iverson", "PHI", "2000s", ["PG", "SG"], 33, 4, 7, 2.5, 0.2),
]);
const [luka, harden, iverson] = loopData.rows;
const stableIversonPlan = shortestPlacementPlan(
  reachableRosterStates([
    { row: luka, position: "PG" },
    { row: harden, position: "SG" },
  ]),
  iverson,
  (1 << 0) | (1 << 1) | (1 << 2),
  "SG",
);
assert.deepEqual(
  stableIversonPlan.moves.map(({ player, from, to, swapPlayer }) => [
    player,
    from,
    to,
    swapPlayer,
  ]),
  [
    ["Luka Doncic", "PG", "SF", null],
    ["James Harden", "SG", "PG", null],
  ],
  "multi-step placement must advance through the empty slot instead of swapping Luka and Harden",
);

for (const state of reachableRosterStates([
  { row: luka, position: "PG" },
  { row: harden, position: "SG" },
])) {
  assert.ok(
    state.moves.every((move) => move.swapPlayer === null),
    "reachable movement plans must never contain reversible occupied-slot swaps",
  );
}

const rng = new MulberryRng(1);
assert.equal(rng.next(), 0.6270739405881613);
assert.equal(rng.next(), 0.002735721180215478);
const rngClone = rng.clone();
assert.equal(
  rng.next(),
  rngClone.next(),
  "cloned retry previews must not alter the live RNG",
);

const studioPlayers = [
  { id: "a60", name: "A", team: "AAA", era: "1960s", positions: ["PG"] },
  { id: "b60", name: "B", team: "BBB", era: "1960s", positions: ["SG"] },
  { id: "c60", name: "C", team: "CCC", era: "1960s", positions: ["SF"] },
  { id: "a70", name: "D", team: "AAA", era: "1970s", positions: ["C"] },
  { id: "b70", name: "E", team: "BBB", era: "1970s", positions: ["PF"] },
  { id: "c70", name: "F", team: "CCC", era: "1970s", positions: ["PG"] },
];
const studioPayload = {
  session_id: "test-session",
  seed: 123456,
  slots: ["PG", "SG", "SF", "PF", "C"].map((position) => ({
    id: position,
    positions: [position],
  })),
  respin_budget: { team: 1, era: 1 },
};
const studio = new StudioShadowSession(studioPayload, studioPlayers);
const firstDraw = studio.nextSpin();
assert.ok(firstDraw);
const preview = studio.clone();
const previewTeamRetry = preview.respin("team");
const liveTeamRetry = studio.respin("team");
assert.deepEqual(
  [previewTeamRetry.team, previewTeamRetry.era],
  [liveTeamRetry.team, liveTeamRetry.era],
  "a cloned exact retry must match the committed retry",
);
assert.equal(studio.remainingRespins("team"), 0);
const studioIndex = buildStudioDrawIndex(studioPlayers);
assert.equal(criticalStudioPlayerIds(studioIndex).size, studioPlayers.length);
const studioIndexWithOldRow = buildStudioDrawIndex([
  ...studioPlayers,
  { id: "old", name: "Old", team: "OLD", era: "1950s", positions: ["PG"] },
]);
assert.equal(
  studioIndexWithOldRow.byId.has("old"),
  false,
  "the seeded draw index must ignore eras outside the live game pool",
);

const livePath = process.env.DATASET || "/tmp/players_flat.json";
if (fs.existsSync(livePath)) {
  const liveSource = JSON.parse(
    fs.readFileSync(path.resolve(livePath), "utf8"),
  );
  const liveData = normalizeDataset(liveSource.players || liveSource);
  const liveOptimizer = new ExactCeilingOptimizer(
    liveData.rows,
    liveData.names,
  );
  const liveCeiling = liveOptimizer.relaxedCeiling([], true);
  assert.equal(liveData.rows.length, 10621);
  assert.equal(liveCeiling.score, 139.4);
  assert.deepEqual(
    liveCeiling.future.map((pick) => `${pick.position}:${pick.row.player}`),
    [
      "PG:Oscar Robertson",
      "SG:Michael Jordan",
      "SF:Elgin Baylor",
      "PF:Bob Pettit",
      "C:Wilt Chamberlain",
    ],
  );

  const findLive = (player, team, era) =>
    liveData.rows.find(
      (candidate) =>
        candidate.player === player &&
        candidate.team === team &&
        candidate.era === era,
    );
  const ferrari = findLive("Al Ferrari", "ATL", "1960s");
  const alvin = findLive("Alvin Robertson", "SAS", "1980s");
  const boykins = findLive("Earl Boykins", "MIL", "2000s");
  for (const [candidate, expectedRaw] of [
    [alvin, 114.115],
    [boykins, 109.805],
  ]) {
    assert.ok(ferrari && candidate);
    const flexible = liveOptimizer.relaxedCeiling([ferrari, candidate], false);
    const plan = shortestPlacementPlan(
      reachableRosterStates([{ row: ferrari, position: "SG" }]),
      candidate,
      flexible.occupiedMask,
    );
    assert.equal(plan.moves[0].player, "Al Ferrari");
    assert.equal(plan.moves[0].from, "SG");
    assert.equal(plan.moves[0].to, "SF");
    assert.equal(plan.position, "SG");
    assert.ok(Math.abs(flexible.raw - expectedRaw) < 0.001);
  }
}

console.log("82-0 Coach core tests passed");
