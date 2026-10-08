"use strict";

const assert = require("node:assert/strict");
const { Worker } = require("node:worker_threads");
const { LiveDraftPlanner, livePriorPools, livePlannerWorkerSource, POSITIONS,
  clampPanelPosition, shortestPlacementPlan, reachableRosterStates } = require("../82-0-advisor.user.js");

assert.deepEqual(clampPanelPosition({ x: -20, y: 1000 }, 800, 600, 292, 260), { x: 8, y: 332 });
assert.deepEqual(clampPanelPosition({ x: 200, y: 300 }, 200, 150, 292, 260), { x: 8, y: 8 });
assert.deepEqual(clampPanelPosition({ x: 120, y: 90 }, 800, 600, 292, 260), { x: 120, y: 90 });

async function main() {
  const worker = new Worker(`
    const { parentPort } = require("node:worker_threads");
    global.self = { postMessage: (message) => parentPort.postMessage(message) };
    ${livePlannerWorkerSource()}
    parentPort.on("message", (data) => self.onmessage({ data }));
  `, { eval: true });
  let ticks = 0;
  const heartbeat = setInterval(() => { ticks += 1; }, 5);
  const run = (input) => new Promise((resolve, reject) => {
    worker.once("message", resolve);
    worker.once("error", reject);
    worker.postMessage(input);
  }).finally(() => worker.removeAllListeners("error"));
  try {
    const pools = livePriorPools();
    let comparisons = 0;
    for (let game = 0; game < 3; game += 1) {
      const entries = [];
      for (let round = 0; round < 5; round += 1) {
        const cell = pools[(game * 17 + round * 9) % pools.length];
        for (const [team, era] of [[false, false], [false, true], [true, false], [true, true]]) {
          const input = { pools, entries, rows: cell.rows, cell, retries: { team, era } };
          const expected = new LiveDraftPlanner(pools, entries).advise(input.rows, cell, input.retries);
          const actual = await run(input);
          assert.deepEqual(actual.advice, expected,
            `worker must preserve every score, pick, position, move, and retry (game ${game}, round ${round})`);
          assert.equal(actual.error, undefined);
          comparisons += 1;
        }
        const advice = new LiveDraftPlanner(pools, entries).advise(cell.rows, cell, { team: false, era: false });
        if (advice.best) {
          for (const move of advice.best.moves)
            entries.find((entry) => entry.row.player === move.player).position = move.to;
          entries.push({ row: advice.best.row, position: advice.best.position });
        }
      }
    }
    // A fully flexible roster exercises actual moves rather than only empty slots.
    const entries = POSITIONS.slice(0, 4).map((position, index) => ({ position,
      row: { player: `Flexible ${index}`, posMask: 31, ppg: 20, rpg: 8, apg: 6, spg: 1, bpg: 0.5 } }));
    const cell = pools[0];
    const input = { pools, entries, rows: cell.rows, cell, retries: { team: true, era: true } };
    assert.deepEqual((await run(input)).advice,
      new LiveDraftPlanner(pools, entries).advise(cell.rows, cell, input.retries));
    assert.ok(shortestPlacementPlan(reachableRosterStates(entries), cell.rows[0]).moves.length);
    assert.ok(ticks > 10, "the calling event loop must keep running during worker calculations");
    assert.ok((await run({ pools: null })).error, "model errors must produce a response, not infinite analyzing");
    console.log(`Worker parity passed: ${comparisons + 1} complete advice comparisons, ${ticks} heartbeat ticks.`);
  } finally {
    clearInterval(heartbeat);
    await worker.terminate();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
