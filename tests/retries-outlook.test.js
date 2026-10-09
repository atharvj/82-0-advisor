"use strict";

const assert = require("node:assert/strict");
const { retryAvailability, mergeRetryBoosters, chooseScoreAdvice, compareForecastActions, live82Outlook,
  liveExpectedFinalScore, legacy82Outlook, LiveDraftPlanner, livePriorPools, rawTeamScore,
  POSITIONS } = require("../82-0-advisor.user.js");

for (const mode of ["classic", "hoopiq", "1v1"]) {
  const ready = { available: true };
  assert.deepEqual(retryAvailability(ready, { enabled: true, next_use: "free", free_left: 1 }),
    { source: "free", label: "free", available: true, purchase: false }, mode);
  assert.equal(retryAvailability({ available: false }, { next_use: "free", free_left: 1 }).label, "not ready", mode);
  assert.equal(retryAvailability(ready, { enabled: false, next_use: "free", free_left: 1 }).available, false, mode);
  for (const next_use of ["owned", "rv"]) {
    const result = retryAvailability(ready, { next_use, free_left: 0 });
    assert.equal(result.available, true, "owned/ad retries must not be silently excluded");
    assert.equal(result.source, next_use);
    assert.notEqual(result.label, "free");
  }
  for (const next_use of ["coins", "none"]) {
    const result = retryAvailability(ready, { next_use, free_left: 0 });
    assert.equal(result.purchase, true);
    assert.equal(result.available, false, "purchase opportunities are not assumed funded inventory");
  }
  assert.equal(retryAvailability(ready, { next_use: "free", free_left: 0 }).available, true,
    "explicit next_use matches the site's readiness check even if a counter is stale");
  for (const metadata of [null, {}, { effect: "respin", currency: "booster_respin_team" }]) {
    const result = retryAvailability(ready, metadata);
    assert.equal(result.available, true, "absent/config-only metadata must not override an enabled button");
    assert.equal(result.source, "unknown");
    assert.ok(result.label.includes("check cost"), "never falsely promise an unknown retry is free");
  }
  assert.equal(retryAvailability(ready, { owned_left: 2, free_left: 0 }).source, "owned");
  assert.equal(retryAvailability(ready, { next_use: "free" }).available, true,
    "explicit free source still works when the counter is omitted");
  assert.equal(retryAvailability(ready, { next_use: "none", used_coins: 1, coins_per_draft: 1,
    used_in_draft: 1, max_per_draft: 6 }).purchase, false, "coin cap supersedes the overall draft cap");
  assert.equal(retryAvailability(ready, { next_use: "none", used_coins: 0, coins_per_draft: 1,
    used_in_draft: 6, max_per_draft: 6 }).purchase, true, "split coin counters match the public frontend");
  assert.equal(retryAvailability(ready, { next_use: "none", max_per_draft: 1, used_in_draft: 1 }).purchase, false);
}

const counters = { respin_team: { next_use: "free", free_left: 1 },
  respin_era: { next_use: "owned", owned_left: 2, free_left: 0 } };
assert.deepEqual(mergeRetryBoosters(counters, { boosters: { respin_team: { effect: "respin" } } }), counters);
const updated = mergeRetryBoosters(counters, { boosters: { respin_team: { free_left: 0, next_use: "none" } } });
assert.equal(updated.respin_team.next_use, "none");
assert.deepEqual(updated.respin_era, counters.respin_era, "a partial update retains the other scope");
assert.equal(counters.respin_team.free_left, 1, "metadata merging must not mutate the original");
assert.equal(mergeRetryBoosters(updated, { data: { cell: { boosters: {
  respin_team: { next_use: "owned", owned_left: 1 } } } } }).respin_team.next_use, "owned");

const current = { best: { forecastRaw: 100, forecastMatchupRate: 0.2, forecastPathRate: 0.1 } };
const team = { scope: "team", meanRaw: 102, legalCount: 5, matchupRate: 0.1, pathRate: 0.1 };
const era = { scope: "era", meanRaw: 99.5, legalCount: 5, matchupRate: 1, pathRate: 1, decisionRaw: 500 };
const available = { team: { available: true }, era: { available: true } };
assert.equal(chooseScoreAdvice(current, team, era, available).kind, "team",
  "higher score must win even if the lower-score retry beats the bot more often");
assert.equal(chooseScoreAdvice(current, null, era, available).kind, "pick",
  "a 100% sampled bot-win chance must not justify reducing expected score");
assert.equal(chooseScoreAdvice(current, { ...team, meanRaw: 100.01 }, era, available).kind, "team",
  "do not suppress small positive score gains with the old reserve bonus or 0.25 buffer");
assert.equal(chooseScoreAdvice(current, { ...team, meanRaw: 100 }, era, available).kind, "pick",
  "preserve the retry on exact score ties");
assert.equal(chooseScoreAdvice({ best: null }, team, era, available).kind, "team");
assert.equal(chooseScoreAdvice({ best: null }, null, null, available).kind, "dead");
assert.equal(compareForecastActions({ ...current.best, forecastRaw: 105 },
  { ...current.best, forecastRaw: 104, forecastMatchupRate: 1 }), 1);
assert.equal(compareForecastActions({ ...current.best, forecastRaw: 104, forecastPathRate: 1 },
  { ...current.best, forecastRaw: 105 }), -1);

const syntheticAdvice = (value) => ({ kind: "pick", best: { value }, forecasts: { team: null, era: null },
  stealWeight: 1, blockWeight: 1, sampleCount: 69 });
assert.equal(live82Outlook(syntheticAdvice(115), [], 0).state, "promising");
assert.equal(live82Outlook(syntheticAdvice(99), [], 0).state, "unlikely");
assert.equal(live82Outlook(syntheticAdvice(0), [], 0).state, "unlikely",
  "low sampled scores must never be called impossible on server-hidden v4");
assert.equal(live82Outlook(syntheticAdvice(120), [], 1).state, "uncertain",
  "unknown Hoop IQ player stats must not produce an overconfident outlook");
assert.equal(live82Outlook({ ...syntheticAdvice(120), sampleCount: 1 }, [], 0).state, "uncertain");
assert.equal(live82Outlook({ ...syntheticAdvice(120), best: null }, [], 0).state, "uncertain");
assert.equal(live82Outlook({ ...syntheticAdvice(120), kind: "team", best: null,
  forecasts: { team: 120 } }, [], 1).forecast, null,
  "an unscorable offer must not display a speculative retry forecast as its final-score outlook");
assert.equal(live82Outlook(syntheticAdvice(115), [], 0, [null, {}]).state, "promising",
  "malformed stored records must not break live advice");
const perfectHistory = [{ protocol: "v4", mode: "classic", wins: 82, score: 114, at: Date.now() }];
assert.equal(live82Outlook(syntheticAdvice(112), [], 0, perfectHistory).state, "unlikely");
assert.equal(live82Outlook(syntheticAdvice(115), [], 0, perfectHistory).state, "promising");
assert.equal(live82Outlook(syntheticAdvice(112), [], 0,
  [{ ...perfectHistory[0], protocol: "legacy" }]).reference, 110,
  "legacy record calibration must never leak into v4");
assert.equal(live82Outlook(syntheticAdvice(115), [], 0,
  [...perfectHistory, { ...perfectHistory[0], wins: 81, score: 115 }]).state, "uncertain",
  "contradictory record observations must invalidate confidence");

const pools = livePriorPools();
const row = (player, posMask) => ({ player, posMask, ppg: 22, rpg: 8, apg: 7, spg: 1, bpg: 1 });
const entries = POSITIONS.slice(0, 4).map((position, i) => ({ position, row: row(`Fixed ${i}`, 1 << i) }));
const offered = row("Last", 16);
const planner = new LiveDraftPlanner(pools, entries);
const advice = planner.advise([offered], { teamId: "TEST", era: "2000s" }, { team: false, era: false });
assert.ok(Math.abs(liveExpectedFinalScore(advice, entries) - rawTeamScore([...entries.map(e => e.row), offered])) < 1e-8,
  "last-pick score outlook must use exact complete-team scoring");
const early = entries.slice(0, 2);
const earlyPlanner = new LiveDraftPlanner(pools, early);
const earlyAdvice = earlyPlanner.advise([row("Incoming", 4)], pools[0], { team: false, era: false });
const purchaseAdvice = new LiveDraftPlanner(pools, early).advise([row("Incoming", 4)], pools[0],
  { team: false, era: false, purchase: { team: true, era: true } });
assert.deepEqual(purchaseAdvice.best, earlyAdvice.best,
  "purchase quotes cannot change a pick by inventing future purchased inventory");
assert.equal(purchaseAdvice.forecasts.team,
  earlyPlanner.retryExpectation(earlyPlanner.state(earlyPlanner.initialFamily, 0, 0).table, pools[0], "team"));
assert.equal(purchaseAdvice.forecasts.era,
  earlyPlanner.retryExpectation(earlyPlanner.state(earlyPlanner.initialFamily, 0, 0).table, pools[0], "era"));
assert.equal(earlyAdvice.forecasts.team, null, "quotes must not mutate no-purchase advice");
assert.equal(purchaseAdvice.withoutPurchaseKind, earlyAdvice.kind);
const ownedAdvice = new LiveDraftPlanner(pools, early).advise([row("Incoming", 4)], pools[0],
  { team: false, era: true });
const mixedAdvice = new LiveDraftPlanner(pools, early).advise([row("Incoming", 4)], pools[0],
  { team: false, era: true, purchase: { team: true } });
assert.equal(mixedAdvice.withoutPurchaseKind, ownedAdvice.kind,
  "the best no-purchase alternative includes any usable free/owned retry, not just a pick");
assert.deepEqual(mixedAdvice.best, ownedAdvice.best);
assert.ok(Math.abs(liveExpectedFinalScore(earlyAdvice, early) -
  earlyAdvice.best.value - early.reduce((sum, e) => sum + earlyPlanner.value(e.row), 0)) < 1e-8,
  "early outlook must reuse planner defense denominators, not inflated partial-team scores");
const retryAdvice = { ...earlyAdvice, kind: "team", forecasts: { team: 99 } };
assert.ok(Math.abs(liveExpectedFinalScore(retryAdvice, early) -
  99 - early.reduce((sum, e) => sum + earlyPlanner.value(e.row), 0)) < 1e-8);

assert.equal(legacy82Outlook({ priorCeiling: { possible82: false } }).state, "impossible");
assert.equal(legacy82Outlook({ priorCeiling: { possible82: false } }, true).state, "uncertain");
assert.equal(legacy82Outlook({ priorCeiling: { possible82: true },
  current: { best: { forecastPathRate: 0, forecastRaw: 100 } } }).state, "unlikely");
assert.equal(legacy82Outlook({ seededPlan: { result: { possible82: true } } }).state, "promising");
assert.equal(legacy82Outlook({ seededPlan: { result: { possible82: false } } }).state, "impossible");
assert.equal(legacy82Outlook({ priorCeiling: {} }).state, "uncertain",
  "an absent proof flag is not proof of impossibility");
console.log("Retry and outlook tests passed: score-only objective, funding sources, partial metadata, conditional purchase quotes, and honest cross-mode 82-0 estimates.");
