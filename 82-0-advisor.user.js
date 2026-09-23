// ==UserScript==
// @name         82-0 Perfect Team Coach
// @namespace    https://82-0.com/
// @version      2.2.0
// @description  Live draft optimization, positions, retries, and 82-0 guidance for Classic, Hoop IQ, and 1v1.
// @author       Intellectual07
// @license      MIT
// @match        https://82-0.com/*
// @match        https://www.82-0.com/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(function () {
  "use strict";

  const VERSION = "2.2.0";
  const MODEL_VERIFIED = "2026-09-21";
  const PANEL_ID = "__82coach_host__";
  const DATASET_WAIT_MS = 15_000;
  const UI_KEY = "__82coach_ui_v1__";
  const MODE_KEY = "__82coach_mode_v1__";
  const MISMATCH_KEY = "__82coach_model_mismatch_v1__";
  const PICKS_KEY = "__82coach_picks_v1__";
  const HISTORY_KEY = "__82coach_results_v1__";
  const HISTORY_LIMIT = 100;
  const PICKS_MAX_AGE = 6 * 60 * 60 * 1000;
  const PENDING_PICK_MAX_AGE = 30_000;
  const MAX_IDLE_RECOVERY_SCANS = 8;

  const POSITIONS = ["PG", "SG", "SF", "PF", "C"];
  const POSITION_INDEX = Object.freeze({ PG: 0, SG: 1, SF: 2, PF: 3, C: 4 });
  const FULL_POSITION_MASK = 0b11111;
  const ERAS = new Set([
    "1960s",
    "1970s",
    "1980s",
    "1990s",
    "2000s",
    "2010s",
    "2020s",
  ]);
  // Current public reverse engineering and the signed-in result screen both
  // put the first displayed 82-win score at 109.5 on the 110-point curve. The
  // result screen still prefers the site's returned record over this forecast.
  const RECORD_SCORE_CAP = 110;
  const TARGET_SCORE = 109.5;
  const EPSILON = 1e-10;
  const ROLLOUT_CURRENT_SAMPLES = 28;
  const ROLLOUT_RETRY_SAMPLES = 7;
  const ROLLOUT_CURRENT_ACTIONS = 32;
  const ROLLOUT_RETRY_ACTIONS = 1;
  const ROLLOUT_ROWS_PER_POSITION = 3;
  const ONE_V_ONE_CURRENT_SAMPLES = 7;
  const ONE_V_ONE_RETRY_SAMPLES = 7;
  const ONE_V_ONE_CURRENT_ACTIONS = 8;
  const ONE_V_ONE_RETRY_ACTIONS = 1;
  const ANALYSIS_YIELD_EVERY = 6;
  const CURRENT_ANALYSIS_MAX_MS = 5_000;
  const RETRY_ANALYSIS_MAX_MS = 1_500;
  const ONE_V_ONE_ANALYSIS_MAX_MS = 900;
  const PATH_CONFIDENCE_Z = 1.645;
  const MIN_PATH_ADVANTAGE = 0.08;

  // These are algebraically identical to the current production team formula.
  const COEFF_PPG = (100 * 0.46) / 133.4;
  const COEFF_RPG = (100 * 0.25) / 39.7;
  const COEFF_APG = (100 * 0.18) / 29.3;
  const COEFF_SPG = Array.from({ length: 6 }, (_, count) =>
    count ? ((100 * 0.07) / 6.1) * (5 / count) : 0,
  );
  const COEFF_BPG = Array.from({ length: 6 }, (_, count) =>
    count ? ((100 * 0.04) / 3.2) * (5 / count) : 0,
  );

  const COLORS = Object.freeze({
    pick: "#22c55e",
    team: "#f59e0b",
    era: "#a855f7",
    position: "#38bdf8",
    impossible: "#ef4444",
    muted: "#94a3b8",
  });

  function finiteNumber(value) {
    const number = Number(value);
    return Number.isFinite(number) ? number : 0;
  }

  function positiveNumber(value) {
    const number = finiteNumber(value);
    return number > 0 ? number : 0;
  }

  function roundOne(value) {
    return Math.round(value * 10) / 10;
  }

  function popcount(value) {
    let count = 0;
    for (let bits = value >>> 0; bits; bits &= bits - 1) count += 1;
    return count;
  }

  function positionMask(positions) {
    let mask = 0;
    for (const position of positions || []) {
      const index = POSITION_INDEX[position];
      if (index !== undefined) mask |= 1 << index;
    }
    return mask;
  }

  function rawTeamScore(players) {
    let ppg = 0;
    let rpg = 0;
    let apg = 0;
    let spg = 0;
    let bpg = 0;
    let spgCount = 0;
    let bpgCount = 0;

    for (const player of players || []) {
      ppg += finiteNumber(player.ppg);
      rpg += finiteNumber(player.rpg);
      apg += finiteNumber(player.apg);
      const steals = positiveNumber(player.spg);
      const blocks = positiveNumber(player.bpg);
      if (steals > 0) {
        spg += steals;
        spgCount += 1;
      }
      if (blocks > 0) {
        bpg += blocks;
        bpgCount += 1;
      }
    }

    const adjustedSpg = spgCount ? (spg * 5) / spgCount : 0;
    const adjustedBpg = bpgCount ? (bpg * 5) / bpgCount : 0;
    return (
      100 *
      ((0.46 * ppg) / 133.4 +
        (0.25 * rpg) / 39.7 +
        (0.18 * apg) / 29.3 +
        (0.07 * adjustedSpg) / 6.1 +
        (0.04 * adjustedBpg) / 3.2)
    );
  }

  function projectedWins(score) {
    return Math.round(
      82 *
        Math.pow(
          Math.min(Math.max(score, 0) / RECORD_SCORE_CAP, 1),
          1.15,
        ),
    );
  }

  function calculateTeamResult(players) {
    const raw = rawTeamScore(players);
    const score = roundOne(raw);
    const wins = projectedWins(score);
    return { raw, score, wins, losses: 82 - wins, possible82: wins === 82 };
  }

  function meaningfulRateAdvantage(
    betterRate,
    betterTrials,
    worseRate,
    worseTrials,
  ) {
    const difference = betterRate - worseRate;
    if (difference <= 0) return false;
    const leftTrials = Math.max(1, finiteNumber(betterTrials));
    const rightTrials = Math.max(1, finiteNumber(worseTrials));
    const standardError = Math.sqrt(
      (betterRate * (1 - betterRate)) / leftTrials +
        (worseRate * (1 - worseRate)) / rightTrials,
    );
    return (
      difference >=
      Math.max(MIN_PATH_ADVANTAGE, PATH_CONFIDENCE_Z * standardError)
    );
  }

  function rolloutRowValue(row) {
    return (
      COEFF_PPG * row.ppg +
      COEFF_RPG * row.rpg +
      COEFF_APG * row.apg +
      COEFF_SPG[5] * row.spg +
      COEFF_BPG[5] * row.bpg
    );
  }

  // Scores one possible sequence of future server-dealt cells. The search is
  // exact over the strongest few candidates at every open position; limiting
  // each position keeps first-round forecasts fast enough for the live UI.
  function bestRolloutSequenceRaw(
    fixedRows,
    occupied,
    futurePools,
    rowsPerPosition = ROLLOUT_ROWS_PER_POSITION,
  ) {
    if (!futurePools.length) return rawTeamScore(fixedRows);
    const usedNames = new Set(fixedRows.map((row) => row.player));
    const picked = [...fixedRows];
    let bestRaw = Number.NEGATIVE_INFINITY;

    const visit = (round, mask) => {
      if (round === futurePools.length) {
        bestRaw = Math.max(bestRaw, rawTeamScore(picked));
        return;
      }
      const pool = futurePools[round] || [];
      const candidates = [];
      const seen = new Set();
      for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
        const bit = 1 << positionIndex;
        if (mask & bit) continue;
        const strongest = pool
          .filter(
            (row) =>
              row.posMask & bit && !usedNames.has(row.player),
          )
          .sort((left, right) => rolloutRowValue(right) - rolloutRowValue(left))
          .slice(0, rowsPerPosition);
        for (const row of strongest) {
          const key = `${row.key}@${positionIndex}`;
          if (seen.has(key)) continue;
          seen.add(key);
          candidates.push({ row, bit });
        }
      }
      for (const candidate of candidates) {
        usedNames.add(candidate.row.player);
        picked.push(candidate.row);
        visit(round + 1, mask | candidate.bit);
        picked.pop();
        usedNames.delete(candidate.row.player);
      }
    };

    visit(0, occupied);
    return Number.isFinite(bestRaw) ? bestRaw : null;
  }

  function normalizeDataset(rawRows) {
    const rows = [];
    const nameToId = new Map();
    const names = [];
    const sourceRows = Array.isArray(rawRows)
      ? rawRows
      : Array.isArray(rawRows?.players)
        ? rawRows.players
        : [];

    for (const source of sourceRows) {
      const player = source?.player || source?.name;
      const stats = source?.stats || source;
      if (!source || !ERAS.has(source.era) || !player || !source.team)
        continue;
      const positions = (
        Array.isArray(source.positions) ? source.positions : [source.pos]
      ).filter((position) => POSITION_INDEX[position] !== undefined);
      const posMask = positionMask(positions);
      if (!posMask) continue;

      let nameId = nameToId.get(player);
      if (nameId === undefined) {
        nameId = names.length;
        nameToId.set(player, nameId);
        names.push(player);
      }

      const spg = positiveNumber(stats.spg);
      const bpg = positiveNumber(stats.bpg);
      rows.push({
        player: String(player),
        team: String(source.team),
        era: String(source.era),
        positions: [...new Set(positions)],
        posMask,
        ppg: finiteNumber(stats.ppg),
        rpg: finiteNumber(stats.rpg),
        apg: finiteNumber(stats.apg),
        spg,
        bpg,
        sig: (spg > 0 ? 1 : 0) | (bpg > 0 ? 2 : 0),
        nameId,
        id: source.id || `${player}_${source.team}_${source.era}`,
        key: `${player}|${source.team}|${source.era}`,
      });
    }

    return { rows, nameToId, names };
  }

  class ExactCeilingOptimizer {
    constructor(rows, names) {
      this.rows = rows;
      this.names = names;
      this.nameCount = names.length;
      this.scenarios = [];
      this.cache = new Map();
      this.relevantNames = new Set();
      this.buildIndex();
    }

    buildIndex() {
      const actionCount = 20; // five positions x four defense-presence signatures
      const denseValues = new Float64Array(this.nameCount * actionCount);
      const denseRows = new Int32Array(this.nameCount * actionCount);

      for (let ks = 0; ks <= 5; ks += 1) {
        for (let kb = 0; kb <= 5; kb += 1) {
          denseValues.fill(Number.NEGATIVE_INFINITY);
          denseRows.fill(-1);

          for (let rowIndex = 0; rowIndex < this.rows.length; rowIndex += 1) {
            const row = this.rows[rowIndex];
            const value =
              COEFF_PPG * row.ppg +
              COEFF_RPG * row.rpg +
              COEFF_APG * row.apg +
              COEFF_SPG[ks] * row.spg +
              COEFF_BPG[kb] * row.bpg;

            for (let position = 0; position < 5; position += 1) {
              if (!(row.posMask & (1 << position))) continue;
              const action = position * 4 + row.sig;
              const denseIndex = row.nameId * actionCount + action;
              if (
                value > denseValues[denseIndex] + EPSILON ||
                (Math.abs(value - denseValues[denseIndex]) <= EPSILON &&
                  (denseRows[denseIndex] < 0 ||
                    rowIndex < denseRows[denseIndex]))
              ) {
                denseValues[denseIndex] = value;
                denseRows[denseIndex] = rowIndex;
              }
            }
          }

          const topByAction = Array.from({ length: actionCount }, () => []);
          const union = new Set();
          for (let action = 0; action < actionCount; action += 1) {
            const ranked = [];
            for (let nameId = 0; nameId < this.nameCount; nameId += 1) {
              const value = denseValues[nameId * actionCount + action];
              if (Number.isFinite(value)) ranked.push(nameId);
            }
            ranked.sort((left, right) => {
              const difference =
                denseValues[right * actionCount + action] -
                denseValues[left * actionCount + action];
              return Math.abs(difference) > EPSILON
                ? difference
                : this.names[left].localeCompare(this.names[right]);
            });
            topByAction[action] = ranked.slice(0, 5);
            for (const nameId of topByAction[action]) {
              union.add(nameId);
              this.relevantNames.add(nameId);
            }
          }

          const localNames = [...union].sort((left, right) => left - right);
          const globalToLocal = new Int16Array(this.nameCount);
          globalToLocal.fill(-1);
          const values = new Float64Array(localNames.length * actionCount);
          values.fill(Number.NEGATIVE_INFINITY);
          const rowIndices = new Int32Array(localNames.length * actionCount);
          rowIndices.fill(-1);

          localNames.forEach((nameId, localIndex) => {
            globalToLocal[nameId] = localIndex;
            for (let action = 0; action < actionCount; action += 1) {
              const sourceIndex = nameId * actionCount + action;
              const targetIndex = localIndex * actionCount + action;
              values[targetIndex] = denseValues[sourceIndex];
              rowIndices[targetIndex] = denseRows[sourceIndex];
            }
          });

          this.scenarios.push({
            ks,
            kb,
            cs: COEFF_SPG[ks],
            cb: COEFF_BPG[kb],
            localNames,
            globalToLocal,
            values,
            rowIndices,
            topByAction,
          });
        }
      }
    }

    clearCache() {
      this.cache.clear();
    }

    cacheKey(fixedRows, openMask, spgCount, bpgCount) {
      const excluded = [];
      for (const row of fixedRows) {
        if (this.relevantNames.has(row.nameId)) excluded.push(row.nameId);
      }
      excluded.sort((left, right) => left - right);
      return `${openMask}|${spgCount}|${bpgCount}|${excluded.join(".")}`;
    }

    candidateLocals(scenario, excluded, openMask, remaining) {
      const candidates = new Set();
      for (let position = 0; position < 5; position += 1) {
        if (!(openMask & (1 << position))) continue;
        for (let sig = 0; sig < 4; sig += 1) {
          const action = position * 4 + sig;
          let kept = 0;
          for (const nameId of scenario.topByAction[action]) {
            if (excluded.has(nameId)) continue;
            const local = scenario.globalToLocal[nameId];
            if (local >= 0) candidates.add(local);
            kept += 1;
            if (kept >= remaining) break;
          }
        }
      }
      return [...candidates];
    }

    solveScenario(scenario, fixedRows, openMask, spgCount, bpgCount, withPath) {
      const remaining = popcount(openMask);
      const neededSpg = scenario.ks - spgCount;
      const neededBpg = scenario.kb - bpgCount;
      if (
        neededSpg < 0 ||
        neededBpg < 0 ||
        neededSpg > remaining ||
        neededBpg > remaining
      ) {
        return { value: Number.NEGATIVE_INFINITY, picks: [] };
      }

      if (remaining === 0) {
        return neededSpg === 0 && neededBpg === 0
          ? { value: 0, picks: [] }
          : { value: Number.NEGATIVE_INFINITY, picks: [] };
      }

      const excluded = new Set(fixedRows.map((row) => row.nameId));
      const candidateLocals = this.candidateLocals(
        scenario,
        excluded,
        openMask,
        remaining,
      );
      const stateCount = 32 * 6 * 6;
      const stateIndex = (mask, steals, blocks) =>
        (mask * 6 + steals) * 6 + blocks;
      let values = new Float64Array(stateCount);
      values.fill(Number.NEGATIVE_INFINITY);
      values[stateIndex(0, 0, 0)] = 0;
      let paths = withPath ? new Array(stateCount).fill(null) : null;

      for (const local of candidateLocals) {
        const nextValues = values.slice();
        const nextPaths = withPath ? paths.slice() : null;

        for (let index = 0; index < stateCount; index += 1) {
          const currentValue = values[index];
          if (!Number.isFinite(currentValue)) continue;
          const blocks = index % 6;
          const withoutBlocks = (index - blocks) / 6;
          const steals = withoutBlocks % 6;
          const usedMask = (withoutBlocks - steals) / 6;

          for (let position = 0; position < 5; position += 1) {
            const bit = 1 << position;
            if (!(openMask & bit) || usedMask & bit) continue;
            for (let sig = 0; sig < 4; sig += 1) {
              const action = position * 4 + sig;
              const actionValue = scenario.values[local * 20 + action];
              if (!Number.isFinite(actionValue)) continue;
              const nextSteals = steals + (sig & 1 ? 1 : 0);
              const nextBlocks = blocks + (sig & 2 ? 1 : 0);
              if (nextSteals > neededSpg || nextBlocks > neededBpg) continue;
              const nextIndex = stateIndex(
                usedMask | bit,
                nextSteals,
                nextBlocks,
              );
              const proposed = currentValue + actionValue;
              if (proposed > nextValues[nextIndex] + EPSILON) {
                nextValues[nextIndex] = proposed;
                if (withPath) {
                  const rowIndex = scenario.rowIndices[local * 20 + action];
                  nextPaths[nextIndex] = {
                    previous: paths[index],
                    rowIndex,
                    position,
                  };
                }
              }
            }
          }
        }

        values = nextValues;
        if (withPath) paths = nextPaths;
      }

      const terminalIndex = stateIndex(openMask, neededSpg, neededBpg);
      const terminalValue = values[terminalIndex];
      if (!withPath || !Number.isFinite(terminalValue)) {
        return { value: terminalValue, picks: [] };
      }

      const picks = [];
      for (let path = paths[terminalIndex]; path; path = path.previous) {
        if (path.rowIndex >= 0) {
          picks.push({
            row: this.rows[path.rowIndex],
            position: POSITIONS[path.position],
          });
        }
      }
      picks.reverse();
      return { value: terminalValue, picks };
    }

    completionVector(fixedRows, openMask, spgCount, bpgCount) {
      const key = this.cacheKey(fixedRows, openMask, spgCount, bpgCount);
      const cached = this.cache.get(key);
      if (cached) return cached;

      const vector = new Float64Array(this.scenarios.length);
      vector.fill(Number.NEGATIVE_INFINITY);
      this.scenarios.forEach((scenario, index) => {
        vector[index] = this.solveScenario(
          scenario,
          fixedRows,
          openMask,
          spgCount,
          bpgCount,
          false,
        ).value;
      });

      if (this.cache.size > 1600) this.cache.clear();
      this.cache.set(key, vector);
      return vector;
    }

    ceilingForMask(fixedRows, occupiedMask, withLineup = false) {
      const openMask = FULL_POSITION_MASK & ~occupiedMask;
      if (fixedRows.length + popcount(openMask) !== 5) {
        return null;
      }
      const uniqueNames = new Set(fixedRows.map((row) => row.player));
      if (uniqueNames.size !== fixedRows.length) return null;

      let fixedPpg = 0;
      let fixedRpg = 0;
      let fixedApg = 0;
      let fixedSpg = 0;
      let fixedBpg = 0;
      let spgCount = 0;
      let bpgCount = 0;
      for (const row of fixedRows) {
        fixedPpg += row.ppg;
        fixedRpg += row.rpg;
        fixedApg += row.apg;
        fixedSpg += row.spg;
        fixedBpg += row.bpg;
        if (row.spg > 0) spgCount += 1;
        if (row.bpg > 0) bpgCount += 1;
      }

      const offensiveBase =
        COEFF_PPG * fixedPpg + COEFF_RPG * fixedRpg + COEFF_APG * fixedApg;
      const vector = this.completionVector(
        fixedRows,
        openMask,
        spgCount,
        bpgCount,
      );
      let bestRaw = Number.NEGATIVE_INFINITY;
      let bestScenarioIndex = -1;
      for (let index = 0; index < this.scenarios.length; index += 1) {
        const future = vector[index];
        if (!Number.isFinite(future)) continue;
        const scenario = this.scenarios[index];
        const raw =
          offensiveBase +
          scenario.cs * fixedSpg +
          scenario.cb * fixedBpg +
          future;
        if (raw > bestRaw + EPSILON) {
          bestRaw = raw;
          bestScenarioIndex = index;
        }
      }

      if (!Number.isFinite(bestRaw)) return null;
      const score = roundOne(bestRaw);
      const wins = projectedWins(score);
      const result = {
        raw: bestRaw,
        score,
        wins,
        losses: 82 - wins,
        possible82: wins === 82,
        openMask,
        occupiedMask,
        future: [],
      };

      if (withLineup && bestScenarioIndex >= 0) {
        const scenario = this.scenarios[bestScenarioIndex];
        result.future = this.solveScenario(
          scenario,
          fixedRows,
          openMask,
          spgCount,
          bpgCount,
          true,
        ).picks;
      }
      return result;
    }

    relaxedCeiling(fixedRows, withAssignment = false) {
      const masks = new Map();
      const sorted = [...fixedRows].sort(
        (left, right) => popcount(left.posMask) - popcount(right.posMask),
      );

      const visit = (index, mask, assignment) => {
        if (index === sorted.length) {
          if (!masks.has(mask)) masks.set(mask, [...assignment]);
          return;
        }
        const row = sorted[index];
        for (let position = 0; position < 5; position += 1) {
          const bit = 1 << position;
          if (!(row.posMask & bit) || mask & bit) continue;
          assignment.push({ row, position: POSITIONS[position] });
          visit(index + 1, mask | bit, assignment);
          assignment.pop();
        }
      };
      visit(0, 0, []);

      let best = null;
      for (const [mask, assignment] of masks) {
        const result = this.ceilingForMask(fixedRows, mask, withAssignment);
        if (!result) continue;
        if (!best || result.raw > best.raw + EPSILON) {
          best = { ...result, assignment };
        }
      }
      return best;
    }
  }

  function rosterStateKey(slots) {
    return slots
      .map((row) =>
        row ? row.key || row.id || `${row.player}:${row.nameId}` : "-",
      )
      .join("\u001f");
  }

  function reachableRosterStates(entries) {
    const initial = Array(5).fill(null);
    for (const entry of entries || []) {
      const index = POSITION_INDEX[entry.position];
      if (index === undefined || initial[index]) return [];
      initial[index] = entry.row;
    }

    const queue = [{ slots: initial, moves: [] }];
    const seen = new Set([rosterStateKey(initial)]);
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const state = queue[cursor];
      for (let from = 0; from < 5; from += 1) {
        const moving = state.slots[from];
        if (!moving) continue;
        for (let to = 0; to < 5; to += 1) {
          if (from === to || !(moving.posMask & (1 << to))) continue;
          // Only move into the current empty slot. Occupied-position swaps can
          // mirror the lineup and make the next scan recommend the reverse
          // swap forever. Empty-slot moves follow a stable augmenting path:
          // every step opens the position needed by the following step.
          if (state.slots[to]) continue;
          const slots = [...state.slots];
          slots[to] = moving;
          slots[from] = null;
          const key = rosterStateKey(slots);
          if (seen.has(key)) continue;
          seen.add(key);
          queue.push({
            slots,
            moves: [
              ...state.moves,
              {
                player: moving.player,
                from: POSITIONS[from],
                to: POSITIONS[to],
                swapPlayer: null,
              },
            ],
          });
        }
      }
    }
    return queue;
  }

  function shortestPlacementPlan(
    states,
    row,
    desiredMask = null,
    desiredPosition = null,
  ) {
    let best = null;
    for (const state of states || []) {
      let mask = 0;
      for (let index = 0; index < 5; index += 1) {
        if (state.slots[index]) mask |= 1 << index;
      }
      for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
        const bit = 1 << positionIndex;
        if (state.slots[positionIndex] || !(row.posMask & bit)) continue;
        if (desiredPosition && POSITIONS[positionIndex] !== desiredPosition)
          continue;
        const postMask = mask | bit;
        if (desiredMask !== null && postMask !== desiredMask) continue;
        const plan = {
          position: POSITIONS[positionIndex],
          postMask,
          moves: state.moves,
          slots: state.slots,
        };
        if (
          !best ||
          plan.moves.length < best.moves.length ||
          (plan.moves.length === best.moves.length &&
            POSITION_INDEX[plan.position] < POSITION_INDEX[best.position])
        ) {
          best = plan;
        }
      }
    }
    return best;
  }

  function movePlanUpgradesOccupiedPosition(entries, row, plan) {
    if (!plan?.moves?.length) return true;
    const incumbent = (entries || []).find(
      (entry) => entry.position === plan.position,
    )?.row;
    if (!incumbent) return false;
    return rawTeamScore([row]) > rawTeamScore([incumbent]) + EPSILON;
  }

  function permittedPlacement(row, entries, fixedRows, optimizer) {
    const initialState = reachableRosterStates(entries)[0];
    if (!initialState) return null;

    // An open compatible slot never needs a reshuffle. Position changes are
    // reserved for cases where the new roll cannot otherwise fit.
    let best = null;
    for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
      const bit = 1 << positionIndex;
      if (initialState.slots[positionIndex] || !(row.posMask & bit)) continue;
      const postMask = occupiedMask(entries) | bit;
      const ceiling = optimizer.ceilingForMask(
        [...fixedRows, row],
        postMask,
        false,
      );
      if (!ceiling) continue;
      const candidate = {
        plan: {
          position: POSITIONS[positionIndex],
          postMask,
          moves: [],
          slots: initialState.slots,
        },
        ceiling,
      };
      if (!best || ceiling.raw > best.ceiling.raw + EPSILON) best = candidate;
    }
    if (best) return best;

    // If every compatible slot is occupied, allow a reshuffle only when the
    // current-roll player is genuinely stronger than the player whose slot it
    // takes. This prevents speculative moves made solely for future flexibility.
    for (const state of reachableRosterStates(entries)) {
      const plan = shortestPlacementPlan([state], row);
      if (!plan || !movePlanUpgradesOccupiedPosition(entries, row, plan))
        continue;
      const ceiling = optimizer.ceilingForMask(
        [...fixedRows, row],
        plan.postMask,
        false,
      );
      if (!ceiling) continue;
      const candidate = { plan, ceiling };
      if (
        !best ||
        ceiling.raw > best.ceiling.raw + EPSILON ||
        (Math.abs(ceiling.raw - best.ceiling.raw) <= EPSILON &&
          plan.moves.length < best.plan.moves.length)
      ) {
        best = candidate;
      }
    }
    return best;
  }

  class MulberryRng {
    constructor(seed) {
      this.state = Number(seed) >>> 0;
    }

    next() {
      let value = (this.state = (this.state + 0x6d2b79f5) >>> 0);
      value = Math.imul(value ^ (value >>> 15), 1 | value);
      value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
      return ((value ^ (value >>> 14)) >>> 0) / 0x100000000;
    }

    clone() {
      const copy = new MulberryRng(0);
      copy.state = this.state;
      return copy;
    }
  }

  function buildStudioDrawIndex(players) {
    const byId = new Map();
    const squadByKey = new Map();
    const idByKey = new Map();
    for (const source of Array.isArray(players) ? players : []) {
      const name = source?.name || source?.player;
      const positions = Array.isArray(source?.positions)
        ? [...source.positions]
        : [];
      if (!source?.id || !source.team || !ERAS.has(source.era) || !name)
        continue;
      const player = {
        id: String(source.id),
        team: String(source.team),
        era: String(source.era),
        name: String(name),
        positions,
        posMask: positionMask(positions),
      };
      byId.set(player.id, player);
      idByKey.set(`${player.name}|${player.team}|${player.era}`, player.id);
      const key = `${player.team}|${player.era}`;
      if (!squadByKey.has(key)) squadByKey.set(key, []);
      squadByKey.get(key).push(player);
    }
    return {
      byId,
      squadByKey,
      idByKey,
      sortedKeys: [...squadByKey.keys()].sort(),
    };
  }

  function criticalStudioPlayerIds(index) {
    const critical = new Set();
    for (const squad of index.squadByKey.values()) {
      for (let openMask = 1; openMask <= FULL_POSITION_MASK; openMask += 1) {
        const legal = squad.filter((player) => player.posMask & openMask);
        if (legal.length > 4) continue;
        for (const player of legal) critical.add(player.id);
      }
    }
    return critical;
  }

  class StudioShadowSession {
    constructor(payload, players) {
      this.sessionId = payload.session_id;
      this.seed = Number(payload.seed) >>> 0;
      this.slots = payload.slots.map((slot) => ({
        id: String(slot.id),
        positions: [...slot.positions],
      }));
      this.respinBudget = { ...payload.respin_budget };
      this.index = buildStudioDrawIndex(players);
      this.rng = new MulberryRng(this.seed);
      this.openSlots = [...this.slots];
      this.placed = new Set();
      this.respins = [];
      this.step = 0;
      this.current = null;
      this.drawnStep = -1;
    }

    clone() {
      const copy = Object.create(StudioShadowSession.prototype);
      copy.sessionId = this.sessionId;
      copy.seed = this.seed;
      copy.slots = this.slots;
      copy.respinBudget = this.respinBudget;
      copy.index = this.index;
      copy.rng = this.rng.clone();
      copy.openSlots = [...this.openSlots];
      copy.placed = new Set(this.placed);
      copy.respins = [...this.respins];
      copy.step = this.step;
      copy.current = this.current;
      copy.drawnStep = this.drawnStep;
      return copy;
    }

    isPlayerLegalForSlot(player, slot) {
      return slot.positions.some((position) =>
        player.positions.includes(position),
      );
    }

    drawSpin(options = {}) {
      let keys = this.index.sortedKeys;
      if (
        options.lockedTeam ||
        options.lockedEra ||
        options.excludedTeam ||
        options.excludedEra ||
        options.excludeKey
      ) {
        keys = keys.filter((key) => {
          const [team, era] = key.split("|");
          return (
            (!options.lockedTeam || team === options.lockedTeam) &&
            (!options.lockedEra || era === options.lockedEra) &&
            (!options.excludedTeam || team !== options.excludedTeam) &&
            (!options.excludedEra || era !== options.excludedEra) &&
            (!options.excludeKey || key !== options.excludeKey)
          );
        });
      }
      const shuffled = [...keys];
      for (let index = shuffled.length - 1; index > 0; index -= 1) {
        const swapIndex = Math.floor(this.rng.next() * (index + 1));
        [shuffled[index], shuffled[swapIndex]] = [
          shuffled[swapIndex],
          shuffled[index],
        ];
      }
      for (const key of shuffled) {
        const squad = this.index.squadByKey.get(key) || [];
        const legal = squad.some(
          (player) =>
            !this.placed.has(player.id) &&
            this.openSlots.some((slot) =>
              this.isPlayerLegalForSlot(player, slot),
            ),
        );
        if (!legal) continue;
        const [team, era] = key.split("|");
        return { team, era, squad };
      }
      return null;
    }

    nextSpin() {
      if (this.drawnStep === this.step && this.current) return this.current;
      const draw = this.drawSpin();
      if (!draw) return null;
      this.drawnStep = this.step;
      this.current = draw;
      return draw;
    }

    remainingRespins(scope) {
      return (
        finiteNumber(this.respinBudget[scope]) -
        this.respins.filter((respin) => respin.scope === scope).length
      );
    }

    respin(scope) {
      if (!this.current || this.remainingRespins(scope) <= 0) return null;
      const options =
        scope === "team"
          ? { lockedEra: this.current.era, excludedTeam: this.current.team }
          : { lockedTeam: this.current.team, excludedEra: this.current.era };
      this.respins.push({ scope, at_slot: this.step });
      const draw = this.drawSpin(options);
      if (!draw) return null;
      this.current = draw;
      return draw;
    }

    resolvePlayerId(row) {
      return (
        this.index.idByKey.get(`${row.player}|${row.team}|${row.era}`) || null
      );
    }

    recordPick(requestedSlotId, playerId) {
      const player = this.index.byId.get(playerId);
      if (!player || this.placed.has(playerId) || !this.openSlots.length)
        return false;
      const compatible = (slot) => this.isPlayerLegalForSlot(player, slot);
      const slot =
        this.openSlots.find(
          (candidate) =>
            candidate.id === requestedSlotId && compatible(candidate),
        ) ||
        this.openSlots.find(compatible) ||
        this.openSlots[0];
      this.placed.add(playerId);
      this.openSlots = this.openSlots.filter(
        (candidate) => candidate.id !== slot.id,
      );
      this.step += 1;
      this.current = null;
      return true;
    }
  }

  const Core = {
    POSITIONS,
    TARGET_SCORE,
    normalizeDataset,
    calculateTeamResult,
    projectedWins,
    rawTeamScore,
    meaningfulRateAdvantage,
    bestRolloutSequenceRaw,
    stratifiedFutureKeys,
    rolloutCandidateShortlist,
    roundOne,
    positionMask,
    reachableRosterStates,
    shortestPlacementPlan,
    movePlanUpgradesOccupiedPosition,
    MulberryRng,
    buildStudioDrawIndex,
    criticalStudioPlayerIds,
    StudioShadowSession,
    ExactCeilingOptimizer,
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = Core;
  }
  if (typeof window === "undefined" || typeof document === "undefined") return;
  if (!/(^|\.)82-0\.com$/i.test(location.hostname)) return;

  let observedDatasetUrl = null;
  const datasetUrlWaiters = new Set();
  const studioDatasetUrl = (value) => {
    try {
      const url = new URL(
        typeof value === "string" ? value : value?.url || "",
        location.href,
      );
      return url.hostname === "storage.googleapis.com" &&
        /\/com\.vaultystudios\.eightytwoand0\/(?:nba\/)?players\/[^/]+\.json$/i.test(
          url.pathname,
        )
        ? url.href
        : null;
    } catch (_) {
      return null;
    }
  };

  const nativeFetch = window.fetch.bind(window);
  window.fetch = (...args) => {
    const datasetUrl = studioDatasetUrl(args[0]);
    if (datasetUrl) {
      observedDatasetUrl = datasetUrl;
      for (const resolve of datasetUrlWaiters) resolve(datasetUrl);
      datasetUrlWaiters.clear();
    }
    const request = nativeFetch(...args);
    request
      .then((response) => {
        if (!response.ok) return;
        const isSeededStart =
          /\/game-session\/api\/v(?:1|2)\/session\/start(?:$|[?#])/i.test(
            response.url,
          );
        const isDealtStart =
          /\/game-session\/api\/v3\/session\/start(?:$|[?#])/i.test(
            response.url,
          );
        const isDealtSpin =
          /\/game-session\/api\/v3\/session\/spin(?:$|[?#])/i.test(
            response.url,
          );
        let isVaultyApi = false;
        try {
          isVaultyApi =
            new URL(response.url).hostname === "api.vaultystudios.com";
        } catch (_) {}
        if (!isSeededStart && !isDealtStart && !isDealtSpin && !isVaultyApi)
          return;
        response
          .clone()
          .json()
          .then((payload) => {
            captureOfficialResult(payload);
            if (isDealtSpin) captureDealtSpin(payload);
            else if (isDealtStart) captureDealtSession(payload);
            else if (isSeededStart)
              captureStudioSession(payload, observedDatasetUrl);
          })
          .catch(() => {});
      })
      .catch(() => {});
    return request;
  };

  function waitForStudioDatasetUrl(timeoutMs = DATASET_WAIT_MS) {
    if (observedDatasetUrl) return Promise.resolve(observedDatasetUrl);
    return new Promise((resolve, reject) => {
      const finish = (datasetUrl) => {
        window.clearTimeout(timer);
        datasetUrlWaiters.delete(finish);
        resolve(datasetUrl);
      };
      const timer = window.setTimeout(() => {
        datasetUrlWaiters.delete(finish);
        reject(new Error("timed out waiting for the site's player dataset"));
      }, timeoutMs);
      datasetUrlWaiters.add(finish);
    });
  }

  const runtime = {
    dataReady: false,
    loadError: null,
    rows: [],
    names: [],
    nameToId: new Map(),
    namesSet: new Set(),
    byCell: new Map(),
    byKey: new Map(),
    rowsByName: new Map(),
    teams: new Set(),
    optimizer: null,
    tracked: new Map(),
    lastOffers: new Map(),
    recentOffers: new Map(),
    selectedRow: null,
    pendingPick: null,
    lastCell: null,
    lastAdvice: null,
    lastAdviceSignature: "",
    lastAnalysisKey: "",
    lastAnalysis: null,
    analysisInProgressKey: "",
    analysisGeneration: 0,
    persistedPicks: new Map(),
    pickOrder: 0,
    emptyTraySince: 0,
    sessionPayload: null,
    dealtSessionId: null,
    dealtCell: null,
    shadowSession: null,
    shadowReady: false,
    shadowSynced: false,
    shadowError: null,
    shadowPendingCell: null,
    shadowPendingFrom: null,
    criticalStudioIds: new Set(),
    scanTimer: 0,
    scanSerial: 0,
    idleRecoveryScans: 0,
    resultMismatchCandidate: null,
    officialResult: null,
    resultRecorded: false,
    modelMismatch: safeSessionGet(MISMATCH_KEY) === "1",
    mode: safeSessionGet(MODE_KEY) || "classic",
  };

  function safeSessionGet(key) {
    try {
      return sessionStorage.getItem(key);
    } catch (_) {
      return null;
    }
  }

  function safeSessionSet(key, value) {
    try {
      sessionStorage.setItem(key, value);
    } catch (_) {}
  }

  function safeSessionRemove(key) {
    try {
      sessionStorage.removeItem(key);
    } catch (_) {}
  }

  function captureOfficialResult(payload) {
    const roots = [payload, payload?.result, payload?.data].filter(Boolean);
    for (const root of roots) {
      const display = root?.score_display;
      if (!display || typeof display !== "object") continue;
      const values = display.values || display.detail || display;
      const wins = Number(values?.wins);
      const losses = Number(values?.losses);
      if (
        !Number.isInteger(wins) ||
        !Number.isInteger(losses) ||
        wins < 0 ||
        losses < 0 ||
        wins + losses !== 82
      )
        continue;
      const score = Number(root?.score);
      runtime.officialResult = {
        wins,
        losses,
        score: Number.isFinite(score) ? score : null,
      };
      if (document.body) scheduleScan(0);
      return;
    }
  }

  function escapeHtml(value) {
    return String(value ?? "")
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#039;");
  }

  function readUiState() {
    try {
      return {
        enabled: true,
        collapsed: false,
        details: false,
        hidden: false,
        ...JSON.parse(localStorage.getItem(UI_KEY) || "{}"),
      };
    } catch (_) {
      return {
        enabled: true,
        collapsed: false,
        details: false,
        hidden: false,
      };
    }
  }

  function writeUiState(next) {
    try {
      localStorage.setItem(UI_KEY, JSON.stringify(next));
    } catch (_) {}
  }

  function readResultHistory() {
    try {
      const value = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
      return Array.isArray(value) ? value : [];
    } catch (_) {
      return [];
    }
  }

  function writeResultHistory(history) {
    try {
      localStorage.setItem(
        HISTORY_KEY,
        JSON.stringify(history.slice(-HISTORY_LIMIT)),
      );
    } catch (_) {}
  }

  function recordCompletedGame(result, score) {
    if (runtime.resultRecorded || !result) return readResultHistory();
    const sessionId =
      runtime.dealtSessionId || runtime.sessionPayload?.session_id || null;
    const pickSignature = [...runtime.tracked.values()]
      .map((tracked) => tracked.row.key)
      .sort()
      .join(";");
    const id =
      sessionId ||
      `${runtime.mode}:${result.wins}:${Number.isFinite(score) ? score : "-"}:${hashText(pickSignature)}`;
    const history = readResultHistory();
    if (!history.some((entry) => entry.id === id)) {
      history.push({
        id,
        at: Date.now(),
        version: VERSION,
        mode: runtime.mode,
        wins: result.wins,
        score: Number.isFinite(score) ? score : null,
      });
      writeResultHistory(history);
    }
    runtime.resultRecorded = true;
    return history.slice(-HISTORY_LIMIT);
  }

  function resultHistorySummary(history) {
    const comparable = history.filter(
      (entry) =>
        entry.version === VERSION &&
        entry.mode === runtime.mode &&
        Number.isFinite(entry.wins),
    );
    if (!comparable.length) return "";
    const average =
      comparable.reduce((sum, entry) => sum + entry.wins, 0) /
      comparable.length;
    const best = Math.max(...comparable.map((entry) => entry.wins));
    return `Local ${modeLabel()} v${VERSION}: ${comparable.length} game${comparable.length === 1 ? "" : "s"} · ${average.toFixed(1)} average wins · ${best} best`;
  }

  function directText(element) {
    return [...element.childNodes]
      .filter((node) => node.nodeType === Node.TEXT_NODE)
      .map((node) => node.textContent)
      .join(" ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function isVisible(element) {
    if (!element || !element.isConnected) return false;
    const style = getComputedStyle(element);
    const rect = element.getBoundingClientRect();
    return (
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      rect.width > 0 &&
      rect.height > 0 &&
      element.getClientRects().length > 0
    );
  }

  function getPanel() {
    let host = document.getElementById(PANEL_ID);
    if (host) return host;
    host = document.createElement("div");
    host.id = PANEL_ID;
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
      <style>
        :host { all:initial; position:fixed; right:10px; bottom:12px; z-index:2147483646; color-scheme:dark; }
        * { box-sizing: border-box; }
        button { font: inherit; }
        #card { width:min(292px,calc(100vw - 20px)); color:#e5edf6; background:rgba(5,12,23,.965); border:1px solid #26364c; border-radius:14px; box-shadow:0 14px 38px rgba(0,0,0,.55); font:12px/1.35 system-ui,-apple-system,sans-serif; overflow:hidden; backdrop-filter:blur(12px); }
        #card.hidden { width:auto; border-radius:999px; }
        #card.disabled { width:auto; border-radius:999px; border-color:#374151; }
        header { height:34px; padding:0 8px 0 11px; display:flex; align-items:center; gap:7px; border-bottom:1px solid #1b293b; user-select:none; }
        #card.hidden header { border:0; padding:0 6px 0 10px; }
        #card.disabled header { border:0; padding:0 6px 0 10px; }
        #card.disabled main,
        #card.disabled .logo,
        #card.disabled .mode,
        #card.disabled #collapse,
        #card.disabled #hide { display:none; }
        #card.disabled .title { color:#94a3b8; }
        #card.disabled #power { color:#4ade80; background:#10271c; }
        .logo { font-size:14px; }
        .title { font-size:10px; font-weight:900; letter-spacing:.08em; text-transform:uppercase; color:#9fb0c4; flex:1; white-space:nowrap; }
        .mode { color:#64748b; font-size:9px; font-weight:800; }
        .icon { border:0; background:transparent; color:#7f93aa; width:23px; height:23px; border-radius:7px; cursor:pointer; padding:0; }
        .icon:hover { color:#fff; background:#1d2a3c; }
        main { padding:10px; }
        #card.collapsed main { display:none; }
        .status { display:flex; align-items:center; gap:7px; margin-bottom:7px; color:#aab8c8; font-size:10px; }
        .dot { width:7px; height:7px; border-radius:50%; flex:0 0 auto; background:var(--status,#38bdf8); box-shadow:0 0 9px var(--status,#38bdf8); }
        .action { --action:#38bdf8; border:1px solid color-mix(in srgb,var(--action) 55%,#172337); background:color-mix(in srgb,var(--action) 10%,#07101e); border-radius:10px; padding:9px 10px; }
        .eyebrow { color:var(--action); font-size:9px; font-weight:900; letter-spacing:.11em; text-transform:uppercase; }
        .primary { margin-top:2px; display:flex; align-items:baseline; gap:6px; min-width:0; }
        .name { font-size:16px; line-height:1.12; font-weight:900; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
        .arrow { color:#73869c; font-weight:700; }
        .position { color:#7dd3fc; font-size:15px; font-weight:900; }
        .sub { color:#9eafc2; font-size:10px; margin-top:4px; }
        .metrics { display:grid; grid-template-columns:1fr auto; gap:3px 8px; margin-top:8px; padding-top:7px; border-top:1px solid #1a2a3d; color:#7f93aa; font-size:10px; }
        .metrics strong { color:#d9e5f2; text-align:right; }
        #card:not(.details-open) .metrics,
        #card:not(.details-open) .fallback { display:none; }
        .details-toggle { width:100%; margin-top:7px; border:0; background:transparent; color:#6f8298; font-size:10px; padding:3px; cursor:pointer; }
        .details-toggle:hover { color:#c9d7e6; }
        .details { margin-top:8px; padding-top:8px; border-top:1px solid #182538; color:#8ea0b4; font-size:10px; }
        .row { display:flex; justify-content:space-between; gap:8px; padding:3px 0; }
        .row strong { color:#d3deea; text-align:right; }
        .route { margin-top:7px; padding-top:7px; border-top:1px solid #182538; }
        .route-title { margin-bottom:3px; color:#d3deea; font-weight:800; }
        .route-step { display:grid; grid-template-columns:20px 1fr; gap:5px; padding:2px 0; }
        .route-step span { color:#64748b; font-weight:800; }
        .route-step strong { min-width:0; color:#b8c6d6; font-weight:600; overflow-wrap:anywhere; }
        .fallback { margin-top:7px; padding:6px 7px; border-radius:7px; background:#0c1726; color:#9aacbf; }
        .fallback strong { color:#e7eef7; }
        .filter-hint { margin-top:7px; padding:6px 7px; border-radius:7px; background:#17233a; color:#bfdbfe; }
        .legend { display:flex; flex-wrap:wrap; gap:7px; margin-top:8px; color:#60748c; font-size:9px; }
        .swatch::before { content:''; display:inline-block; width:6px; height:6px; border-radius:2px; margin-right:3px; background:var(--c); }
        .loading { padding:5px 2px; color:#93a4b8; }
        .analyzing-dots { display:inline-flex; gap:3px; margin-left:5px; vertical-align:middle; }
        .analyzing-dots i { width:4px; height:4px; border-radius:50%; background:#38bdf8; animation:analyzing-dot 1s ease-in-out infinite; }
        .analyzing-dots i:nth-child(2) { animation-delay:.16s; }
        .analyzing-dots i:nth-child(3) { animation-delay:.32s; }
        @keyframes analyzing-dot { 0%,70%,100% { opacity:.25; transform:translateY(0); } 35% { opacity:1; transform:translateY(-2px); } }
        .error { color:#fca5a5; }
        @media (max-width:767px) {
          #card { width:min(238px,calc(100vw - 16px)); }
          :host { right:8px; bottom:calc(88px + env(safe-area-inset-bottom)); }
          header { height:30px; }
          main { padding:6px; }
          .status { margin-bottom:3px; font-size:9px; line-height:1.15; }
          .action { padding:5px 7px; }
          .primary { margin-top:0; }
          .name { font-size:14px; }
          .position { font-size:13px; }
          #card:not(.details-open) .sub { display:none; }
          .details-toggle { margin-top:2px; padding:1px; }
        }
        @media (prefers-reduced-motion:reduce) { * { animation:none !important; transition:none !important; } }
      </style>
      <div id="card"><header><span class="logo">🏀</span><span class="title">82-0 Coach</span><span class="mode"></span><button class="icon" id="power" title="Turn coach off">⏻</button><button class="icon" id="collapse" title="Collapse">—</button><button class="icon" id="hide" title="Hide (Alt+A restores)">×</button></header><main id="content" role="status" aria-live="polite" aria-atomic="true"></main></div>
    `;
    document.body.appendChild(host);

    const state = readUiState();
    const card = shadow.getElementById("card");
    card.classList.toggle("collapsed", state.collapsed);
    card.classList.toggle("hidden", state.hidden);
    card.classList.toggle("disabled", !state.enabled);
    card.classList.toggle("details-open", state.details);
    shadow.querySelector(".title").textContent = state.enabled
      ? "82-0 Coach"
      : "Coach off";
    shadow.getElementById("power").title = state.enabled
      ? "Turn coach off"
      : "Turn coach on";
    shadow.getElementById("collapse").textContent = state.collapsed ? "+" : "—";
    shadow.getElementById("collapse").onclick = () => {
      const current = readUiState();
      current.collapsed = !current.collapsed;
      current.hidden = false;
      writeUiState(current);
      card.classList.toggle("collapsed", current.collapsed);
      card.classList.remove("hidden");
      shadow.getElementById("collapse").textContent = current.collapsed
        ? "+"
        : "—";
    };
    shadow.getElementById("hide").onclick = () => {
      const current = readUiState();
      current.hidden = !current.hidden;
      current.collapsed = current.hidden ? true : current.collapsed;
      writeUiState(current);
      card.classList.toggle("hidden", current.hidden);
      card.classList.toggle("collapsed", current.collapsed);
      shadow.getElementById("collapse").textContent = current.collapsed
        ? "+"
        : "—";
    };
    shadow.getElementById("power").onclick = () => {
      const current = readUiState();
      current.enabled = !current.enabled;
      current.hidden = false;
      current.collapsed = false;
      writeUiState(current);
      card.classList.toggle("disabled", !current.enabled);
      card.classList.remove("hidden", "collapsed");
      shadow.querySelector(".title").textContent = current.enabled
        ? "82-0 Coach"
        : "Coach off";
      shadow.getElementById("power").title = current.enabled
        ? "Turn coach off"
        : "Turn coach on";
      clearHighlights();
      runtime.lastAdviceSignature = "";
      if (!current.enabled) runtime.analysisInProgressKey = "";
      if (current.enabled) scheduleScan(0);
    };
    return host;
  }

  function modeLabel() {
    if (runtime.mode === "hoopiq") return "HOOP IQ";
    if (runtime.mode === "1v1") return "1V1";
    return "CLASSIC";
  }

  function setMode(mode) {
    if (!["classic", "hoopiq", "1v1"].includes(mode)) return;
    runtime.mode = mode;
    safeSessionSet(MODE_KEY, mode);
  }

  function loadPersistedPicks() {
    runtime.persistedPicks.clear();
    runtime.pickOrder = 0;
    try {
      const payload = JSON.parse(safeSessionGet(PICKS_KEY) || "null");
      if (
        payload?.version !== 1 ||
        !Array.isArray(payload.picks) ||
        Date.now() - finiteNumber(payload.timestamp) > PICKS_MAX_AGE
      ) {
        safeSessionRemove(PICKS_KEY);
        return;
      }
      for (const saved of payload.picks) {
        const row = runtime.byKey.get(saved?.key);
        if (!row || POSITION_INDEX[saved.position] === undefined) continue;
        const tracked = {
          row,
          position: saved.position,
          originalPosition:
            POSITION_INDEX[saved.originalPosition] === undefined
              ? saved.position
              : saved.originalPosition,
          order: Math.max(1, Math.trunc(finiteNumber(saved.order))),
        };
        runtime.persistedPicks.set(row.player, tracked);
        runtime.pickOrder = Math.max(runtime.pickOrder, tracked.order);
      }
    } catch (_) {
      safeSessionRemove(PICKS_KEY);
    }
  }

  function persistTrackedPicks() {
    const picks = [...runtime.tracked.values()]
      .filter(
        (tracked) =>
          tracked?.row && POSITION_INDEX[tracked.position] !== undefined,
      )
      .sort(
        (left, right) => finiteNumber(left.order) - finiteNumber(right.order),
      )
      .map((tracked) => ({
        key: tracked.row.key,
        position: tracked.position,
        originalPosition: tracked.originalPosition,
        order: tracked.order,
      }));
    if (!picks.length) {
      safeSessionRemove(PICKS_KEY);
      runtime.persistedPicks.clear();
      runtime.pickOrder = 0;
      return;
    }
    safeSessionSet(
      PICKS_KEY,
      JSON.stringify({
        version: 1,
        timestamp: Date.now(),
        mode: runtime.mode,
        picks,
      }),
    );
    runtime.persistedPicks = new Map(
      [...runtime.tracked.entries()].map(([name, tracked]) => [
        name,
        { ...tracked },
      ]),
    );
  }

  function captureDealtSession(payload) {
    if (!payload?.session_id || !Array.isArray(payload.slots)) return;
    const sessionId = String(payload.session_id);
    if (runtime.dealtSessionId !== sessionId) resetRuntime(runtime.mode);
    runtime.dealtSessionId = sessionId;
    runtime.dealtCell = null;
    runtime.sessionPayload = null;
    runtime.shadowSession = null;
    runtime.shadowReady = false;
    runtime.shadowSynced = false;
    runtime.shadowPendingCell = null;
    runtime.shadowPendingFrom = null;
    runtime.shadowError =
      "The site now deals future rolls on the server; future cells are hidden until they are played.";
    runtime.lastAnalysisKey = "";
    runtime.lastAnalysis = null;
    if (document.body) scheduleScan(0);
  }

  function captureDealtSpin(payload) {
    const cell = payload?.cell;
    if (
      !cell ||
      !Number.isFinite(Number(cell.seq)) ||
      !cell.team ||
      !ERAS.has(cell.era) ||
      !Array.isArray(cell.squad)
    )
      return;
    runtime.dealtCell = {
      seq: Number(cell.seq),
      team: String(cell.team),
      era: String(cell.era),
      legal: Array.isArray(cell.legal) ? [...cell.legal] : [],
      boosters: cell.boosters || null,
    };
    runtime.lastAnalysisKey = "";
    runtime.lastAnalysis = null;
    runtime.analysisInProgressKey = "";
    runtime.analysisGeneration += 1;
    if (document.body) scheduleScan(0);
  }

  async function captureStudioSession(payload, capturedDatasetUrl = null) {
    const datasetUrl = payload?.dataset_url || capturedDatasetUrl;
    if (
      !payload?.session_id ||
      !Number.isFinite(Number(payload.seed)) ||
      !datasetUrl ||
      !Array.isArray(payload.slots) ||
      payload.slots.length !== 5 ||
      !payload.slots.every(
        (slot) =>
          POSITION_INDEX[slot?.id] !== undefined &&
          Array.isArray(slot.positions) &&
          slot.positions.every(
            (position) => POSITION_INDEX[position] !== undefined,
          ),
      )
    )
      return;

    const capturedSessionId = String(payload.session_id);
    if (runtime.sessionPayload?.session_id !== capturedSessionId) {
      resetRuntime(runtime.mode);
    }
    // Deliberately omit payload.user and any authentication-adjacent response data.
    runtime.sessionPayload = {
      session_id: capturedSessionId,
      seed: Number(payload.seed) >>> 0,
      dataset_version: String(payload.dataset_version || ""),
      dataset_url: String(datasetUrl),
      slots: payload.slots.map((slot) => ({
        id: String(slot.id),
        positions: [...(slot.positions || [])],
      })),
      respin_budget: { ...payload.respin_budget },
    };
    runtime.shadowReady = false;
    runtime.shadowSynced = false;
    runtime.shadowError = null;
    runtime.shadowPendingCell = null;
    runtime.shadowPendingFrom = null;

    try {
      const response = await nativeFetch(runtime.sessionPayload.dataset_url);
      if (!response.ok)
        throw new Error(`session dataset returned ${response.status}`);
      const dataset = await response.json();
      if (runtime.sessionPayload?.session_id !== capturedSessionId) return;
      const index = buildStudioDrawIndex(dataset?.players);
      if (
        !Array.isArray(dataset?.players) ||
        index.byId.size < 10_000 ||
        index.sortedKeys.length < 150 ||
        (runtime.sessionPayload.dataset_version &&
          String(dataset.version) !== runtime.sessionPayload.dataset_version)
      ) {
        throw new Error("session dataset failed completeness checks");
      }
      runtime.shadowSession = new StudioShadowSession(
        runtime.sessionPayload,
        dataset.players,
      );
      runtime.criticalStudioIds = criticalStudioPlayerIds(
        runtime.shadowSession.index,
      );
      runtime.shadowReady = true;
      runtime.shadowError = null;
      runtime.lastAnalysisKey = "";
      runtime.lastAnalysis = null;
      if (document.body) scheduleScan(0);
    } catch (error) {
      if (runtime.sessionPayload?.session_id !== capturedSessionId) return;
      console.warn(
        "[82-0 Coach] Exact seeded retry prediction unavailable",
        error,
      );
      runtime.shadowSession = null;
      runtime.shadowReady = false;
      runtime.shadowSynced = false;
      runtime.shadowError = String(error?.message || error);
    }
  }

  function sameCell(left, right) {
    return Boolean(
      left && right && left.team === right.team && left.era === right.era,
    );
  }

  function syncShadowToCell(cell) {
    const shadow = runtime.shadowSession;
    if (!runtime.shadowReady || !shadow) return "unavailable";

    if (runtime.shadowPendingCell) {
      if (sameCell(cell, runtime.shadowPendingCell)) {
        runtime.shadowPendingCell = null;
        runtime.shadowPendingFrom = null;
        runtime.shadowSynced = true;
        runtime.shadowError = null;
        return "synced";
      }
      if (sameCell(cell, runtime.shadowPendingFrom)) return "waiting";
      runtime.shadowSynced = false;
      runtime.shadowError = `predicted ${runtime.shadowPendingCell.team} ${runtime.shadowPendingCell.era}, saw ${cell.team} ${cell.era}`;
      runtime.shadowPendingCell = null;
      runtime.shadowPendingFrom = null;
      return "mismatch";
    }

    const predicted = shadow.current || shadow.nextSpin();
    if (sameCell(cell, predicted)) {
      runtime.shadowSynced = true;
      runtime.shadowError = null;
      return "synced";
    }
    runtime.shadowSynced = false;
    runtime.shadowError = predicted
      ? `predicted ${predicted.team} ${predicted.era}, saw ${cell.team} ${cell.era}`
      : "seeded draw reached a dead end";
    return "mismatch";
  }

  function commitShadowPick(row, requestedPosition) {
    const shadow = runtime.shadowSession;
    if (!runtime.shadowReady || !runtime.shadowSynced || !shadow?.current)
      return false;
    const playerId = shadow.resolvePlayerId(row);
    if (!playerId) {
      runtime.shadowSynced = false;
      runtime.shadowError = `could not resolve ${row.player}`;
      return false;
    }
    const from = { team: shadow.current.team, era: shadow.current.era };
    if (!shadow.recordPick(requestedPosition, playerId)) {
      runtime.shadowSynced = false;
      runtime.shadowError = `could not record ${row.player}`;
      return false;
    }
    if (shadow.openSlots.length) {
      const predicted = shadow.nextSpin();
      runtime.shadowPendingFrom = from;
      runtime.shadowPendingCell = predicted
        ? { team: predicted.team, era: predicted.era }
        : null;
    }
    return true;
  }

  function commitShadowRetry(scope) {
    const shadow = runtime.shadowSession;
    if (!runtime.shadowReady || !runtime.shadowSynced || !shadow?.current)
      return;
    const from = { team: shadow.current.team, era: shadow.current.era };
    const predicted = shadow.respin(scope);
    if (!predicted) {
      runtime.shadowSynced = false;
      runtime.shadowError = `${scope} retry prediction reached a dead end`;
      return;
    }
    runtime.shadowPendingFrom = from;
    runtime.shadowPendingCell = { team: predicted.team, era: predicted.era };
  }

  function renderPanel(html, signature) {
    const host = getPanel();
    const shadow = host.shadowRoot;
    shadow.querySelector(".mode").textContent = modeLabel();
    shadow
      .getElementById("card")
      .classList.toggle("details-open", readUiState().details);
    if (runtime.lastAdviceSignature === signature) return;
    runtime.lastAdviceSignature = signature;
    shadow.getElementById("content").innerHTML = html;

    const detailsButton = shadow.getElementById("details-toggle");
    if (detailsButton) {
      detailsButton.onclick = () => {
        const state = readUiState();
        state.details = !state.details;
        writeUiState(state);
        runtime.lastAdviceSignature = "";
        scheduleScan(0);
      };
    }
  }

  function renderLoading(message, error = false) {
    clearHighlights();
    renderPanel(
      `<div class="loading ${error ? "error" : ""}">${escapeHtml(message)}</div>`,
      `loading:${message}:${error}`,
    );
  }

  function renderAnalyzing() {
    clearHighlights();
    renderPanel(
      '<div class="loading"><span>Analyzing the roll</span><span class="analyzing-dots" aria-hidden="true"><i></i><i></i><i></i></span></div>',
      "loading:analyzing",
    );
  }

  async function loadRows() {
    const datasetUrl = await waitForStudioDatasetUrl();
    const response = await nativeFetch(datasetUrl);
    if (!response.ok)
      throw new Error(`player dataset returned ${response.status}`);
    const data = await response.json();

    const normalized = normalizeDataset(data);
    const coveredPositions = normalized.rows.reduce(
      (mask, row) => mask | row.posMask,
      0,
    );
    const cellCount = new Set(
      normalized.rows.map((row) => `${row.team}|${row.era}`),
    ).size;
    if (
      normalized.rows.length < 10_000 ||
      normalized.names.length < 3_000 ||
      cellCount < 150 ||
      coveredPositions !== FULL_POSITION_MASK
    ) {
      throw new Error("player dataset failed completeness checks");
    }
    runtime.rows = normalized.rows;
    runtime.names = normalized.names;
    runtime.nameToId = normalized.nameToId;
    runtime.namesSet = new Set(normalized.names);

    for (const row of runtime.rows) {
      runtime.byKey.set(row.key, row);
      const cell = `${row.team}|${row.era}`;
      if (!runtime.byCell.has(cell)) runtime.byCell.set(cell, []);
      runtime.byCell.get(cell).push(row);
      if (!runtime.rowsByName.has(row.player))
        runtime.rowsByName.set(row.player, []);
      runtime.rowsByName.get(row.player).push(row);
      runtime.teams.add(row.team);
    }

    loadPersistedPicks();

    runtime.optimizer = new ExactCeilingOptimizer(runtime.rows, runtime.names);
    runtime.dataReady = true;
  }

  function getPlayerListRoot() {
    const currentCard = document.querySelector('[data-testid="player-card"]');
    if (currentCard) return currentCard.parentElement || currentCard;
    const inputs = [...document.querySelectorAll("input")];
    const search = inputs.find((input) =>
      /search/i.test(input.getAttribute("placeholder") || ""),
    );
    if (search) {
      return (
        search.closest(".space-y-3") ||
        search.parentElement?.parentElement?.parentElement ||
        null
      );
    }
    // Localized copies may not use the English "Search..." placeholder.
    const fallbackCard = [
      ...document.querySelectorAll(
        '[data-testid="player-card"],div[draggable]',
      ),
    ].find((element) => Boolean(rowFromCard(element)));
    return fallbackCard?.parentElement || null;
  }

  function rowFromCard(card) {
    if (!card) return null;
    const datasetName = card.getAttribute("data-player")?.trim();
    const paragraphs = [...card.querySelectorAll("p")];
    const name =
      (datasetName && runtime.namesSet.has(datasetName) && datasetName) ||
      paragraphs
        .map((paragraph) => paragraph.textContent.trim())
        .find((text) => runtime.namesSet.has(text));
    if (!name) return null;
    if (runtime.dealtCell) {
      const dealtRow = runtime.byKey.get(
        `${name}|${runtime.dealtCell.team}|${runtime.dealtCell.era}`,
      );
      if (dealtRow) return dealtRow;
    }
    const cellText = paragraphs
      .map((paragraph) => paragraph.textContent.trim())
      .find((text) => /\b[A-Z0-9]{2,4}\s*·\s*(?:19|20)\d0s\b/.test(text));
    if (!cellText) return null;
    const match = cellText.match(/\b([A-Z0-9]{2,4})\s*·\s*((?:19|20)\d0s)\b/);
    if (!match) return null;
    return runtime.byKey.get(`${name}|${match[1]}|${match[2]}`) || null;
  }

  function findCards() {
    const cards = [];
    for (const candidate of document.querySelectorAll(
      '[data-testid="player-card"],div[draggable]',
    )) {
      const row = rowFromCard(candidate);
      if (!row) continue;
      cards.push({
        element: candidate,
        row,
        enabled:
          candidate.getAttribute("data-selectable") !== "false" &&
          candidate.getAttribute("draggable") !== "false",
      });
    }
    return cards;
  }

  function parseCell(cards) {
    if (runtime.dealtCell && cards.length)
      return { team: runtime.dealtCell.team, era: runtime.dealtCell.era };
    if (cards.length) return { team: cards[0].row.team, era: cards[0].row.era };
    return runtime.lastCell;
  }

  function parseTray() {
    const tray = document.querySelector("[data-lineup-tray]");
    const controls = new Set();
    if (tray) {
      for (const slot of tray.querySelectorAll('[role="button"]'))
        controls.add(slot);
    }
    for (const slot of document.querySelectorAll(
      'button[data-track-name="draft_slot_place"],[data-court-slot]',
    ))
      controls.add(slot);
    if (!controls.size) return { present: false, slots: new Map() };
    const slots = new Map();
    for (const slot of controls) {
      const position = controlPosition(slot);
      if (!position) continue;
      let name = [...slot.querySelectorAll("p")]
        .map((element) => element.textContent.trim())
        .find((text) => runtime.namesSet.has(text));
      if (!name) {
        const label = slot.getAttribute("aria-label") || "";
        const english = label.match(/^(PG|SG|SF|PF|C)\s*:\s*(.+?)(?:,|$)/);
        if (english && runtime.namesSet.has(english[2])) name = english[2];
        if (!name) {
          name = [...runtime.tracked.keys()].find((candidate) =>
            label.includes(candidate),
          );
        }
      }
      if (name) slots.set(position, name);
    }
    return { present: true, slots };
  }

  function commitPendingPickIfNeeded(trayState, cell) {
    const pending = runtime.pendingPick;
    if (!pending) return;
    const found = [...trayState.slots.entries()].find(
      ([, name]) => name === pending.row.player,
    );
    const onResults = findResultButton() !== null;
    const finalTransition =
      !trayState.present &&
      runtime.tracked.size === 4 &&
      !getPlayerListRoot() &&
      Date.now() - pending.time > 60;
    // On the current site, the next seeded cell can render before the lineup
    // tray exposes the pick that caused it. Treat that cell advance as the
    // placement confirmation so the shadow session advances before syncing.
    const cellAdvanced =
      cell && runtime.lastCell && !sameCell(cell, runtime.lastCell);
    if (found || onResults || finalTransition || cellAdvanced) {
      const position = found?.[0] || pending.position;
      runtime.tracked.set(pending.row.player, {
        row: pending.row,
        position,
        originalPosition: pending.position,
        order: ++runtime.pickOrder,
      });
      if (!pending.shadowCommitted)
        pending.shadowCommitted = commitShadowPick(
          pending.row,
          pending.position,
        );
      runtime.pendingPick = null;
      runtime.selectedRow = null;
      persistTrackedPicks();
    } else if (Date.now() - pending.time > PENDING_PICK_MAX_AGE) {
      runtime.pendingPick = null;
    }
  }

  function reconcileRoster(cell) {
    const trayState = parseTray();
    commitPendingPickIfNeeded(trayState, cell);
    if (!trayState.present) return trayState;

    if (trayState.slots.size === 0 && runtime.tracked.size) {
      // The redesigned desktop picker temporarily replaces the filled lineup
      // with five empty placement controls while a card is selected. Session
      // start/reset events are authoritative, so never erase the roster from
      // that transient empty view.
      runtime.emptyTraySince = Date.now();
      scheduleScan(850);
      return trayState;
    }
    runtime.emptyTraySince = 0;
    runtime.idleRecoveryScans = 0;

    let changed = false;
    const visibleNames = new Set(trayState.slots.values());
    for (const name of [...runtime.tracked.keys()]) {
      if (!visibleNames.has(name)) {
        runtime.tracked.delete(name);
        changed = true;
      }
    }

    for (const [position, name] of trayState.slots) {
      let tracked = runtime.tracked.get(name);
      if (!tracked) {
        const restored = runtime.persistedPicks.get(name);
        let row =
          restored?.row ||
          runtime.lastOffers.get(name) ||
          runtime.recentOffers.get(name);
        if (!row && runtime.selectedRow?.player === name)
          row = runtime.selectedRow;
        if (!row) {
          const candidates = runtime.rowsByName.get(name) || [];
          if (candidates.length === 1) row = candidates[0];
        }
        if (row) {
          tracked = {
            row,
            position,
            originalPosition: restored?.originalPosition || position,
            order: restored?.order || ++runtime.pickOrder,
          };
          runtime.tracked.set(name, tracked);
          changed = true;
        }
      }
      if (tracked && tracked.position !== position) {
        tracked.position = position;
        changed = true;
      }
    }
    if (changed) persistTrackedPicks();
    return trayState;
  }

  function currentEntries(trayState) {
    const entries = [];
    const included = new Set();
    for (const [position, name] of trayState.slots) {
      const tracked = runtime.tracked.get(name);
      if (tracked?.row) {
        entries.push({ row: tracked.row, position });
        included.add(name);
      }
    }
    for (const [name, tracked] of runtime.tracked) {
      if (!included.has(name) && tracked?.row)
        entries.push({ row: tracked.row, position: tracked.position });
    }
    return entries;
  }

  function occupiedMask(entries) {
    let mask = 0;
    for (const entry of entries) mask |= 1 << POSITION_INDEX[entry.position];
    return mask;
  }

  function compareActions(left, right) {
    if (!right) return 1;
    if (Math.abs(left.ceiling.raw - right.ceiling.raw) > EPSILON) {
      return left.ceiling.raw > right.ceiling.raw ? 1 : -1;
    }
    const leftImmediate = left.immediate?.raw ?? 0;
    const rightImmediate = right.immediate?.raw ?? 0;
    if (Math.abs(leftImmediate - rightImmediate) > EPSILON) {
      return leftImmediate > rightImmediate ? 1 : -1;
    }
    const leftMoves = left.moves?.length || 0;
    const rightMoves = right.moves?.length || 0;
    if (leftMoves !== rightMoves) return leftMoves < rightMoves ? 1 : -1;
    if (left.row.player !== right.row.player) {
      return right.row.player.localeCompare(left.row.player);
    }
    return (
      (POSITION_INDEX[right.position] ?? 5) -
      (POSITION_INDEX[left.position] ?? 5)
    );
  }

  function evaluateCell(cell, entries, withPlans = true) {
    const fixedRows = entries.map((entry) => entry.row);
    const usedNames = new Set(fixedRows.map((row) => row.player));
    const rows = runtime.byCell.get(`${cell.team}|${cell.era}`) || [];
    let best = null;
    const actions = [];

    for (const row of rows) {
      if (usedNames.has(row.player)) continue;
      const placement = permittedPlacement(
        row,
        entries,
        fixedRows,
        runtime.optimizer,
      );
      if (!placement) continue;
      const { ceiling, plan } = placement;
      const action = {
        row,
        position: plan.position,
        moves: withPlans ? plan.moves : [],
        ceiling,
        immediate: calculateTeamResult([...fixedRows, row]),
      };
      actions.push(action);
      if (compareActions(action, best) > 0) best = action;
    }
    return { cell, best, actions };
  }

  function hashText(value) {
    let hash = 0x811c9dc5;
    for (let index = 0; index < value.length; index += 1) {
      hash ^= value.charCodeAt(index);
      hash = Math.imul(hash, 0x01000193) >>> 0;
    }
    return hash >>> 0;
  }

  function shuffled(values, rng) {
    const copy = [...values];
    for (let index = copy.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(rng.next() * (index + 1));
      [copy[index], copy[swapIndex]] = [copy[swapIndex], copy[index]];
    }
    return copy;
  }

  function stratifiedFutureKeys(keys, rounds, sampleCount, seedText) {
    const keysByEra = new Map();
    for (const key of [...keys].sort()) {
      const era = key.split("|")[1];
      if (!keysByEra.has(era)) keysByEra.set(era, []);
      keysByEra.get(era).push(key);
    }
    const eras = [...keysByEra.keys()].sort();
    if (!eras.length || rounds <= 0 || sampleCount <= 0) return [];
    const rng = new MulberryRng(hashText(seedText));
    const scenarios = Array.from({ length: sampleCount }, () => []);

    for (let round = 0; round < rounds; round += 1) {
      const eraOrder = shuffled(eras, rng);
      const teamOrders = new Map(
        eras.map((era) => [era, shuffled(keysByEra.get(era), rng)]),
      );
      const eraVisits = new Map(eras.map((era) => [era, 0]));
      const teamOffsets = new Map(
        eras.map((era) => [
          era,
          Math.floor(rng.next() * teamOrders.get(era).length),
        ]),
      );
      const eraOffset = Math.floor(rng.next() * eras.length);
      for (let sample = 0; sample < sampleCount; sample += 1) {
        const era = eraOrder[(sample + eraOffset) % eraOrder.length];
        const teams = teamOrders.get(era);
        const visit = eraVisits.get(era);
        scenarios[sample].push(
          teams[(visit + teamOffsets.get(era)) % teams.length],
        );
        eraVisits.set(era, visit + 1);
      }
    }
    return scenarios;
  }

  function sampledFuturePools(rounds, sampleCount, seedText) {
    if (rounds <= 0) return [[]];
    return stratifiedFutureKeys(
      runtime.byCell.keys(),
      rounds,
      sampleCount,
      seedText,
    ).map((scenario) =>
      scenario.map((key) => runtime.byCell.get(key) || []),
    );
  }

  function rolloutCandidateShortlist(picked, mask, pool) {
    const usedNames = new Set(picked.map((row) => row.player));
    const candidates = [];
    for (const row of pool || []) {
      if (usedNames.has(row.player)) continue;
      const partialRaw = rawTeamScore([...picked, row]);
      const baseValue = rolloutRowValue(row);
      for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
        const bit = 1 << positionIndex;
        if (mask & bit || !(row.posMask & bit)) continue;
        candidates.push({ row, bit, positionIndex, partialRaw, baseValue });
      }
    }
    if (candidates.length <= 16) return candidates;

    const selected = new Map();
    const add = (candidate) =>
      selected.set(`${candidate.row.key}@${candidate.positionIndex}`, candidate);
    for (const candidate of [...candidates]
      .sort((left, right) => right.partialRaw - left.partialRaw)
      .slice(0, 8))
      add(candidate);
    for (const candidate of [...candidates]
      .sort((left, right) => right.baseValue - left.baseValue)
      .slice(0, 4))
      add(candidate);
    for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
      for (const candidate of candidates
        .filter((item) => item.positionIndex === positionIndex)
        .sort((left, right) => right.partialRaw - left.partialRaw)
        .slice(0, 2))
        add(candidate);
    }
    return [...selected.values()];
  }

  function rolloutSequencePolicyRaw(fixedRows, occupied, futurePools) {
    const picked = [...fixedRows];
    const usedNames = new Set(picked.map((row) => row.player));
    let mask = occupied;

    for (const pool of futurePools) {
      let best = null;
      const finalists = rolloutCandidateShortlist(picked, mask, pool);
      for (const finalist of finalists) {
          const { row, bit, partialRaw } = finalist;
          const postMask = mask | bit;
          const ceiling = runtime.optimizer.ceilingForMask(
            [...picked, row],
            postMask,
            false,
          );
          if (!ceiling) continue;
          // Benchmarked on balanced draws from the current 10,621-row pool.
          // Pure ceiling chasing averaged 65.3 wins; this 75/25 blend averaged
          // 66.7 by valuing production now without ignoring slot flexibility.
          const policyRaw = 0.75 * partialRaw + 0.25 * ceiling.raw;
          const candidate = {
            row,
            bit,
            ceilingRaw: ceiling.raw,
            partialRaw,
            policyRaw,
          };
          if (
            !best ||
            candidate.policyRaw > best.policyRaw + EPSILON ||
            (Math.abs(candidate.policyRaw - best.policyRaw) <= EPSILON &&
              candidate.partialRaw > best.partialRaw + EPSILON)
          ) {
            best = candidate;
          }
      }
      if (!best) return null;
      picked.push(best.row);
      usedNames.add(best.row.player);
      mask |= best.bit;
    }
    return rawTeamScore(picked);
  }

  function compareForecastActions(left, right) {
    if (!right) return 1;
    const leftPath =
      left.forecastPathRate ?? Number(left.ceiling.possible82);
    const rightPath =
      right.forecastPathRate ?? Number(right.ceiling.possible82);
    const leftTrials = left.forecastOutcomes ?? 1;
    const rightTrials = right.forecastOutcomes ?? 1;
    if (
      meaningfulRateAdvantage(
        leftPath,
        leftTrials,
        rightPath,
        rightTrials,
      )
    )
      return 1;
    if (
      meaningfulRateAdvantage(
        rightPath,
        rightTrials,
        leftPath,
        leftTrials,
      )
    )
      return -1;
    const leftForecast = left.forecastRaw ?? left.ceiling.raw;
    const rightForecast = right.forecastRaw ?? right.ceiling.raw;
    if (Math.abs(leftForecast - rightForecast) > EPSILON)
      return leftForecast > rightForecast ? 1 : -1;
    if (Math.abs(leftPath - rightPath) > EPSILON)
      return leftPath > rightPath ? 1 : -1;
    return compareActions(left, right);
  }

  function retryReserveBonus(remainingRounds, retryCount) {
    if (remainingRounds <= 0 || retryCount <= 0) return 0;
    const firstRetry = 0.55 + 0.18 * remainingRounds;
    return firstRetry * (retryCount === 1 ? 1 : 1.75);
  }

  function rolloutLimits() {
    return runtime.mode === "1v1"
      ? {
          currentSamples: ONE_V_ONE_CURRENT_SAMPLES,
          retrySamples: ONE_V_ONE_RETRY_SAMPLES,
          currentActions: ONE_V_ONE_CURRENT_ACTIONS,
          retryActions: ONE_V_ONE_RETRY_ACTIONS,
        }
      : {
          currentSamples: ROLLOUT_CURRENT_SAMPLES,
          retrySamples: ROLLOUT_RETRY_SAMPLES,
          currentActions: ROLLOUT_CURRENT_ACTIONS,
          retryActions: ROLLOUT_RETRY_ACTIONS,
        };
  }

  function analysisCancelledError() {
    const error = new Error("analysis superseded");
    error.name = "AnalysisCancelledError";
    return error;
  }

  async function yieldToBrowser(shouldContinue = () => true) {
    if (!shouldContinue()) throw analysisCancelledError();
    if (typeof window.scheduler?.yield === "function") {
      await window.scheduler.yield();
    } else {
      await new Promise((resolve) => window.setTimeout(resolve, 0));
    }
    if (!shouldContinue()) throw analysisCancelledError();
  }

  async function forecastEvaluation(
    evaluation,
    entries,
    {
      samples,
      maxActions,
      seed,
      retryCount = 0,
      deadline = Number.POSITIVE_INFINITY,
      shouldContinue = () => true,
    },
  ) {
    if (!evaluation?.actions?.length) return evaluation;
    const fixedRows = entries.map((entry) => entry.row);
    const remainingRounds = Math.max(0, 5 - fixedRows.length - 1);
    const perRanking = Math.max(1, Math.ceil(maxActions / 2));
    const shortlist = new Map();
    for (const action of [...evaluation.actions]
      .sort((left, right) => right.ceiling.raw - left.ceiling.raw)
      .slice(0, perRanking))
      shortlist.set(`${action.row.key}@${action.position}`, action);
    for (const action of [...evaluation.actions]
      .sort(
        (left, right) =>
          (right.immediate?.raw || 0) - (left.immediate?.raw || 0),
      )
      .slice(0, perRanking))
      shortlist.set(`${action.row.key}@${action.position}`, action);
    if (evaluation.best)
      shortlist.set(
        `${evaluation.best.row.key}@${evaluation.best.position}`,
        evaluation.best,
      );

    const sequences = sampledFuturePools(
      remainingRounds,
      samples,
      `${seed}|${fixedRows.map((row) => row.key).sort().join(";")}`,
    );
    let workSinceYield = 0;
    const forecasted = [];
    for (const action of shortlist.values()) {
      if (forecasted.length && performance.now() >= deadline) break;
      const pickedRows = [...fixedRows, action.row];
      const outcomes = [];
      for (const sequence of sequences) {
        if (outcomes.length >= 7 && performance.now() >= deadline) break;
        const raw = rolloutSequencePolicyRaw(
          pickedRows,
          action.ceiling.occupiedMask,
          sequence,
        );
        if (raw !== null) outcomes.push(raw);
        workSinceYield += 1;
        if (workSinceYield >= ANALYSIS_YIELD_EVERY) {
          workSinceYield = 0;
          await yieldToBrowser(shouldContinue);
        }
      }
      if (!outcomes.length) continue;
      outcomes.sort((left, right) => left - right);
      action.forecastRaw =
        outcomes.reduce((sum, raw) => sum + raw, 0) / outcomes.length;
      action.forecastScore = roundOne(action.forecastRaw);
      action.forecastWins =
        outcomes.reduce(
          (sum, raw) => sum + projectedWins(roundOne(raw)),
          0,
        ) / outcomes.length;
      action.forecastPathHits = outcomes.filter(
        (raw) => projectedWins(roundOne(raw)) === 82,
      ).length;
      action.forecastOutcomes = outcomes.length;
      action.forecastPathRate =
        action.forecastPathHits / action.forecastOutcomes;
      action.forecastDecisionRaw =
        action.forecastRaw + retryReserveBonus(remainingRounds, retryCount);
      action.forecastLow = roundOne(
        outcomes[Math.floor((outcomes.length - 1) * 0.25)],
      );
      forecasted.push(action);
    }
    if (workSinceYield) await yieldToBrowser(shouldContinue);
    if (forecasted.length) {
      evaluation.best = forecasted.reduce((winner, action) =>
        compareForecastActions(action, winner) > 0 ? action : winner,
      null);
    }
    evaluation.forecastSamples = sequences.length;
    return evaluation;
  }

  function studioOpenMask() {
    let openMask = FULL_POSITION_MASK;
    const ordered = [...runtime.tracked.values()].sort(
      (left, right) => finiteNumber(left.order) - finiteNumber(right.order),
    );
    for (const tracked of ordered) {
      const requestedBit = 1 << POSITION_INDEX[tracked.originalPosition];
      let consumedBit =
        requestedBit & openMask & tracked.row.posMask ? requestedBit : 0;
      if (!consumedBit) {
        for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
          const bit = 1 << positionIndex;
          if (bit & openMask & tracked.row.posMask) {
            consumedBit = bit;
            break;
          }
        }
      }
      if (!consumedBit) consumedBit = openMask & -openMask;
      openMask &= ~consumedBit;
    }
    return openMask;
  }

  function feasibleOccupiedMasks(rows) {
    const masks = new Set();
    const sorted = [...rows].sort(
      (left, right) => popcount(left.posMask) - popcount(right.posMask),
    );
    const visit = (index, mask) => {
      if (index === sorted.length) {
        masks.add(mask);
        return;
      }
      const row = sorted[index];
      for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
        const bit = 1 << positionIndex;
        if (!(row.posMask & bit) || mask & bit) continue;
        visit(index + 1, mask | bit);
      }
    };
    visit(0, 0);
    return [...masks];
  }

  function scenarioRowValue(row, spgCount, bpgCount) {
    return (
      COEFF_PPG * row.ppg +
      COEFF_RPG * row.rpg +
      COEFF_APG * row.apg +
      COEFF_SPG[spgCount] * row.spg +
      COEFF_BPG[bpgCount] * row.bpg
    );
  }

  function bestUniquePoolCombination(lists) {
    const order = lists
      .map((list, index) => ({ list, index }))
      .sort((left, right) => left.list.length - right.list.length);
    const suffixUpper = Array(order.length + 1).fill(0);
    for (let index = order.length - 1; index >= 0; index -= 1) {
      suffixUpper[index] = suffixUpper[index + 1] + order[index].list[0].value;
    }
    const usedNames = new Set();
    const selected = Array(lists.length);
    let bestValue = Number.NEGATIVE_INFINITY;
    let bestRows = null;

    const visit = (index, value) => {
      if (value + suffixUpper[index] <= bestValue + EPSILON) return;
      if (index === order.length) {
        bestValue = value;
        bestRows = [...selected];
        return;
      }
      const { list, index: originalIndex } = order[index];
      for (const candidate of list) {
        if (usedNames.has(candidate.row.nameId)) continue;
        usedNames.add(candidate.row.nameId);
        selected[originalIndex] = candidate.row;
        visit(index + 1, value + candidate.value);
        usedNames.delete(candidate.row.nameId);
      }
    };
    visit(0, 0);
    return bestRows ? { value: bestValue, rows: bestRows } : null;
  }

  function evaluatePlannerPools(fixedRows, pools, cache) {
    const cacheKey = pools.map((pool) => pool.key).join(">");
    if (cache.has(cacheKey)) return cache.get(cacheKey);
    const fixedNames = new Set(fixedRows.map((row) => row.nameId));
    const fixedSpg = fixedRows.filter((row) => row.spg > 0).length;
    const fixedBpg = fixedRows.filter((row) => row.bpg > 0).length;
    const remainingCount = pools.length;
    const availableSignatures = pools.map((pool) => [
      ...new Set(pool.rows.map((row) => row.sig)),
    ]);
    const signatures = Array(remainingCount);
    let best = null;

    const evaluateSignatures = () => {
      const spgCount =
        fixedSpg + signatures.reduce((sum, sig) => sum + (sig & 1 ? 1 : 0), 0);
      const bpgCount =
        fixedBpg + signatures.reduce((sum, sig) => sum + (sig & 2 ? 1 : 0), 0);
      const lists = [];
      for (let poolIndex = 0; poolIndex < pools.length; poolIndex += 1) {
        const byName = new Map();
        for (const row of pools[poolIndex].rows) {
          if (row.sig !== signatures[poolIndex] || fixedNames.has(row.nameId))
            continue;
          const value = scenarioRowValue(row, spgCount, bpgCount);
          const previous = byName.get(row.nameId);
          if (!previous || value > previous.value + EPSILON) {
            byName.set(row.nameId, { row, value });
          }
        }
        const list = [...byName.values()]
          .sort((left, right) => right.value - left.value)
          .slice(0, remainingCount);
        if (!list.length) return;
        lists.push(list);
      }
      const future = bestUniquePoolCombination(lists);
      if (!future) return;
      const fixedValue = fixedRows.reduce(
        (sum, row) => sum + scenarioRowValue(row, spgCount, bpgCount),
        0,
      );
      const raw = fixedValue + future.value;
      if (!best || raw > best.raw + EPSILON) {
        const rows = [...fixedRows, ...future.rows];
        best = { raw: rawTeamScore(rows), futureRows: future.rows };
      }
    };

    const visit = (index) => {
      if (index === remainingCount) {
        evaluateSignatures();
        return;
      }
      for (const sig of availableSignatures[index]) {
        signatures[index] = sig;
        visit(index + 1);
      }
    };
    visit(0);
    cache.set(cacheKey, best);
    return best;
  }

  function plannerRetryVariants(shadow) {
    const sequences = [[]];
    const team = shadow.remainingRespins("team") > 0;
    const era = shadow.remainingRespins("era") > 0;
    if (team) sequences.push(["team"]);
    if (era) sequences.push(["era"]);
    if (team && era) sequences.push(["team", "era"], ["era", "team"]);
    const variants = [];
    for (const sequence of sequences) {
      const next = shadow.clone();
      let valid = true;
      for (const scope of sequence) {
        if (next.remainingRespins(scope) <= 0) {
          valid = false;
          break;
        }
        const draw = next.respin(scope);
        if (!draw) {
          valid = false;
          break;
        }
      }
      if (valid && next.current) variants.push({ shadow: next, sequence });
    }
    return variants;
  }

  function backendSlotForPick(shadow, requestedPosition, sessionPlayer) {
    const compatible = (slot) =>
      slot.positions.some((position) =>
        sessionPlayer.positions.includes(position),
      );
    return (
      shadow.openSlots.find(
        (slot) => slot.id === requestedPosition && compatible(slot),
      ) ||
      shadow.openSlots.find(compatible) ||
      shadow.openSlots[0] ||
      null
    );
  }

  function solveExactSeededPlan(entries) {
    const sourceShadow = runtime.shadowSession;
    if (!runtime.shadowReady || !runtime.shadowSynced || !sourceShadow?.current)
      return null;
    const fixedRows = entries.map((entry) => entry.row);
    const remainingRounds = 5 - fixedRows.length;
    if (remainingRounds <= 0) {
      const result = calculateTeamResult(fixedRows);
      return { result, first: null, nodes: 0 };
    }

    const fixedNames = new Set(fixedRows.map((row) => row.player));
    const shadow = sourceShadow.clone();
    shadow.placed = new Set(
      [...shadow.placed].filter((id) => runtime.criticalStudioIds.has(id)),
    );
    const poolCache = new Map();
    let best = null;
    let nodes = 0;

    const visit = (state, remainingUiMask, pools, steps) => {
      nodes += 1;
      if (!state.openSlots.length) {
        if (pools.length !== remainingRounds) return;
        const lineup = evaluatePlannerPools(fixedRows, pools, poolCache);
        if (!lineup) return;
        const result = calculateTeamResult([
          ...fixedRows,
          ...lineup.futureRows,
        ]);
        const retryCount = steps.reduce(
          (sum, step) => sum + step.retries.length,
          0,
        );
        if (
          !best ||
          result.raw > best.result.raw + EPSILON ||
          (Math.abs(result.raw - best.result.raw) <= EPSILON &&
            retryCount < best.retryCount)
        ) {
          best = {
            result,
            retryCount,
            steps: steps.map((step, index) => ({
              ...step,
              row: lineup.futureRows[index],
            })),
          };
        }
        return;
      }

      for (const variant of plannerRetryVariants(state)) {
        const cell = variant.shadow.current;
        const cellRows = runtime.byCell.get(`${cell.team}|${cell.era}`) || [];
        for (let positionIndex = 0; positionIndex < 5; positionIndex += 1) {
          const bit = 1 << positionIndex;
          if (!(remainingUiMask & bit)) continue;
          const position = POSITIONS[positionIndex];
          const effectGroups = new Map();
          for (const row of cellRows) {
            if (fixedNames.has(row.player) || !(row.posMask & bit)) continue;
            const playerId = variant.shadow.resolvePlayerId(row);
            const sessionPlayer = playerId
              ? variant.shadow.index.byId.get(playerId)
              : null;
            if (!playerId || !sessionPlayer) continue;
            const slot = backendSlotForPick(
              variant.shadow,
              position,
              sessionPlayer,
            );
            if (!slot) continue;
            const critical = runtime.criticalStudioIds.has(playerId);
            const groupKey = critical
              ? `critical:${playerId}`
              : `slot:${slot.id}`;
            let group = effectGroups.get(groupKey);
            if (!group) {
              group = {
                rows: [],
                representative: row,
                playerId,
                critical,
                slotId: slot.id,
              };
              effectGroups.set(groupKey, group);
            }
            group.rows.push(row);
          }

          for (const [effectKey, group] of effectGroups) {
            const next = variant.shadow.clone();
            if (!next.recordPick(position, group.playerId)) continue;
            if (!group.critical) next.placed.delete(group.playerId);
            if (next.openSlots.length && !next.nextSpin()) continue;
            const openMask = variant.shadow.openSlots.reduce(
              (mask, slot) => mask | (1 << POSITION_INDEX[slot.id]),
              0,
            );
            const pool = {
              key: `${cell.team}|${cell.era}|${position}|${openMask}|${effectKey}`,
              rows: group.rows,
            };
            visit(
              next,
              remainingUiMask & ~bit,
              [...pools, pool],
              [
                ...steps,
                {
                  retries: variant.sequence,
                  cell: { team: cell.team, era: cell.era },
                  position,
                  postMask: FULL_POSITION_MASK & ~(remainingUiMask & ~bit),
                },
              ],
            );
          }
        }
      }
    };

    const reachableMasks = new Set(
      reachableRosterStates(entries).map((state) =>
        state.slots.reduce(
          (mask, row, positionIndex) => mask | (row ? 1 << positionIndex : 0),
          0,
        ),
      ),
    );
    for (const occupied of reachableMasks) {
      visit(shadow.clone(), FULL_POSITION_MASK & ~occupied, [], []);
    }
    if (!best) return null;
    return {
      result: best.result,
      first: best.steps[0] || null,
      steps: best.steps,
      nodes,
    };
  }

  function retryCells(scope, cell, entries) {
    const placedIds = new Set(
      [...runtime.tracked.values()].map((tracked) => tracked.row.id),
    );
    const openMask = studioOpenMask();
    const cells = [];
    for (const key of runtime.byCell.keys()) {
      const [team, era] = key.split("|");
      if (scope === "team" && (era !== cell.era || team === cell.team))
        continue;
      if (scope === "era" && (team !== cell.team || era === cell.era)) continue;
      const hasLegal = runtime.byCell
        .get(key)
        .some(
          (row) => !placedIds.has(row.id) && Boolean(row.posMask & openMask),
        );
      if (hasLegal) cells.push({ team, era });
    }
    return cells;
  }

  async function summarizeRetry(
    scope,
    cell,
    entries,
    remainingRetryCount = 0,
    deadline = Number.POSITIVE_INFINITY,
    shouldContinue = () => true,
  ) {
    if (
      runtime.shadowReady &&
      runtime.shadowSynced &&
      sameCell(runtime.shadowSession?.current, cell)
    ) {
      const shadow = runtime.shadowSession.clone();
      const predicted = shadow.respin(scope);
      if (!predicted) return null;
      const predictedCell = { team: predicted.team, era: predicted.era };
      const result = evaluateCell(predictedCell, entries, false);
      const action = result.best;
      const otherScope = scope === "team" ? "era" : "team";
      let chain = null;
      if (shadow.remainingRespins(otherScope) > 0) {
        const chainedShadow = shadow.clone();
        const chainedDraw = chainedShadow.respin(otherScope);
        if (chainedDraw) {
          const chainedCell = { team: chainedDraw.team, era: chainedDraw.era };
          const chainedAction = evaluateCell(
            chainedCell,
            entries,
            false,
          ).best;
          chain = {
            scope: otherScope,
            cell: chainedCell,
            action: chainedAction || null,
          };
        }
      }
      const bestReachable =
        chain?.action && (!action || compareActions(chain.action, action) > 0)
          ? chain.action
          : action;
      const chainRecommended = Boolean(
        chain?.action &&
          ((!action?.ceiling.possible82 && chain.action.ceiling.possible82) ||
            compareActions(chain.action, action) > 0),
      );
      return {
        scope,
        exact: true,
        predictedCell,
        chain,
        chainRecommended,
        outcomes: [{ cell: predictedCell, action: action || null }],
        count: 1,
        legalCount: action ? 1 : 0,
        legalRate: action ? 1 : 0,
        meanRaw: action?.ceiling.raw || 0,
        meanScore: action?.ceiling.score || 0,
        pathRate: action?.ceiling.possible82 ? 1 : 0,
        pathHits: action?.ceiling.possible82 ? 1 : 0,
        pathTrials: 1,
        best: action || null,
        reachableLegal: Boolean(action || chain?.action),
        reachablePath: Boolean(
          action?.ceiling.possible82 || chain?.action?.ceiling.possible82,
        ),
        decisionRaw: bestReachable?.ceiling.raw || 0,
        decisionScore: bestReachable?.ceiling.score || 0,
      };
    }

    const cells = shuffled(
      retryCells(scope, cell, entries),
      new MulberryRng(hashText(`retry-cells:${scope}:${cell.team}|${cell.era}`)),
    );
    const outcomes = [];
    let legalCount = 0;
    let totalRaw = 0;
    let totalDecisionRaw = 0;
    let totalWins = 0;
    let pathHits = 0;
    let pathTrials = 0;
    let ceilingPathCount = 0;
    const limits = rolloutLimits();
    for (const alternative of cells) {
      if (outcomes.length && performance.now() >= deadline) break;
      pathTrials += limits.retrySamples;
      await yieldToBrowser(shouldContinue);
      const result = await forecastEvaluation(
        evaluateCell(alternative, entries, false),
        entries,
        {
          samples: limits.retrySamples,
          maxActions: limits.retryActions,
          seed: `retry:${scope}:${cell.team}|${cell.era}:${alternative.team}|${alternative.era}`,
          retryCount: remainingRetryCount,
          deadline,
          shouldContinue,
        },
      );
      if (!result.best) {
        outcomes.push({ cell: alternative, action: null });
        continue;
      }
      legalCount += 1;
      if (result.actions.some((action) => action.ceiling.possible82))
        ceilingPathCount += 1;
      totalRaw += result.best.forecastRaw ?? result.best.ceiling.raw;
      totalDecisionRaw +=
        result.best.forecastDecisionRaw ??
        result.best.forecastRaw ??
        result.best.ceiling.raw;
      totalWins += result.best.forecastWins ?? result.best.ceiling.wins;
      pathHits +=
        result.best.forecastPathHits ??
        Number(result.best.ceiling.possible82);
      outcomes.push({ cell: alternative, action: result.best });
    }
    if (!outcomes.length) return null;
    const evaluatedCount = outcomes.length;
    const meanRaw = totalRaw / evaluatedCount;
    const best = outcomes.reduce((winner, outcome) => {
      const action = outcome.action;
      return action && (!winner || compareForecastActions(action, winner) > 0)
        ? action
        : winner;
    }, null);
    return {
      scope,
      outcomes,
      count: evaluatedCount,
      populationCount: cells.length,
      legalCount,
      legalRate: legalCount / evaluatedCount,
      meanRaw,
      meanScore: roundOne(meanRaw),
      meanWins: totalWins / evaluatedCount,
      pathRate: pathTrials ? pathHits / pathTrials : 0,
      pathHits,
      pathTrials,
      ceilingPathRate: ceilingPathCount / evaluatedCount,
      best,
      decisionRaw: totalDecisionRaw / evaluatedCount,
    };
  }

  function normalizedButtonText(button) {
    return (button?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
  }

  function findRetryButtons() {
    const buttons = [...document.querySelectorAll("button")];
    const team =
      document.querySelector('button[data-track-name="draft_skip_team"]') ||
      buttons.find(
        (button) =>
          normalizedButtonText(button) === "team" &&
          String(button.className).includes("amber"),
      ) ||
      buttons.find((button) =>
        String(button.className).includes("text-amber-400"),
      ) ||
      buttons.find(
        (button) =>
          normalizedButtonText(button) === "team" && isVisible(button),
      );
    const era =
      document.querySelector('button[data-track-name="draft_skip_era"]') ||
      buttons.find(
        (button) =>
          normalizedButtonText(button) === "era" &&
          String(button.className).includes("purple"),
      ) ||
      buttons.find((button) =>
        String(button.className).includes("text-purple-400"),
      ) ||
      buttons.find(
        (button) => normalizedButtonText(button) === "era" && isVisible(button),
      );
    return {
      team: {
        element: team || null,
        available: Boolean(team && !team.disabled),
      },
      era: { element: era || null, available: Boolean(era && !era.disabled) },
    };
  }

  function chooseAdvice(
    current,
    teamRetry,
    eraRetry,
    retries,
    priorCeiling,
    openSlots,
  ) {
    const retryLegal = (retry) =>
      retry?.reachableLegal ?? retry?.legalCount > 0;
    const retryValue = (retry) => retry?.decisionRaw ?? retry?.meanRaw ?? 0;
    const retryPath = (retry) =>
      retry?.reachablePath ? 1 : retry?.pathRate ?? 0;
    const retryTrials = (retry) => retry?.pathTrials ?? 1;
    const availableRetries = [
      retries.team.available && teamRetry ? teamRetry : null,
      retries.era.available && eraRetry ? eraRetry : null,
    ].filter(retryLegal);
    const bestRetry = availableRetries.reduce((winner, retry) => {
      if (!winner) return retry;
      if (
        meaningfulRateAdvantage(
          retryPath(retry),
          retryTrials(retry),
          retryPath(winner),
          retryTrials(winner),
        )
      )
        return retry;
      if (
        meaningfulRateAdvantage(
          retryPath(winner),
          retryTrials(winner),
          retryPath(retry),
          retryTrials(retry),
        )
      )
        return winner;
      if (Math.abs(retryValue(retry) - retryValue(winner)) > EPSILON) {
        return retryValue(retry) > retryValue(winner) ? retry : winner;
      }
      return winner;
    }, null);
    if (!current.best) {
      if (bestRetry)
        return {
          kind: bestRetry.scope,
          reason: "No legal player fits an open position.",
        };
      return { kind: "dead", reason: "No legal pick or retry is available." };
    }

    if (!bestRetry)
      return { kind: "pick", reason: "This has the strongest expected finish." };
    const currentValue =
      current.best.forecastDecisionRaw ??
      current.best.forecastRaw ??
      current.best.ceiling.raw;
    const currentPath =
      current.best.forecastPathRate ?? Number(current.best.ceiling.possible82);
    const expectedGain = retryValue(bestRetry) - currentValue;
    const pathGainIsMeaningful = meaningfulRateAdvantage(
      retryPath(bestRetry),
      retryTrials(bestRetry),
      currentPath,
      current.best.forecastOutcomes ?? 1,
    );
    if (pathGainIsMeaningful && expectedGain > -0.75) {
      return {
        kind: bestRetry.scope,
        reason: bestRetry.chainRecommended
          ? `Use ${bestRetry.scope.toUpperCase()} retry, then ${bestRetry.chain.scope.toUpperCase()} retry; this is the stronger route to 82-0.`
          : `This retry gives the stronger sampled route to 82-0 (${Math.round(currentPath * 100)}% → ${Math.round(retryPath(bestRetry) * 100)}%).`,
      };
    }
    if (expectedGain > 0.25 + EPSILON) {
      return {
        kind: bestRetry.scope,
        reason: bestRetry.chainRecommended
          ? `Use ${bestRetry.scope.toUpperCase()} retry, then ${bestRetry.chain.scope.toUpperCase()} retry; that branch adds about ${expectedGain.toFixed(1)} ceiling points.`
          : `The retry improves the expected final score by about ${expectedGain.toFixed(1)} points.`,
      };
    }
    return {
      kind: "pick",
      reason:
        expectedGain > 0
          ? "The small expected gain is not worth spending the retry this early."
          : "Picking now has the stronger expected finish; save both retries.",
    };
  }

  function clearHighlights() {
    // Panel-only mode deliberately leaves the website DOM untouched.
  }

  function controlPosition(element) {
    const texts = [
      element.getAttribute?.("aria-label") || "",
      element.getAttribute?.("data-position") || "",
      element.getAttribute?.("data-court-slot") || "",
      element.getAttribute?.("data-tray-slot") || "",
      ...[...(element.querySelectorAll?.("span") || [])].map((span) =>
        span.textContent.trim(),
      ),
    ];
    return (
      POSITIONS.find((position) =>
        texts.some(
          (text) =>
            text === position ||
            new RegExp(`^${position}(?:\\s*:|\\b)`).test(text),
        ),
      ) || null
    );
  }

  function scoreText(result) {
    return `${result.score.toFixed(1)} · ${result.wins}-${result.losses}`;
  }

  function renderAdvice(advice, entries, cards, retries) {
    const ui = readUiState();
    const current = advice.current;
    const best = current.best;
    const seededResult = advice.seededPlan?.result || null;
    const isRetry = advice.kind === "team" || advice.kind === "era";
    const move = advice.kind === "pick" ? best?.moves?.[0] : null;
    const retriesAvailable = retries.team.available || retries.era.available;
    const retryCanRestoreCeiling = Boolean(
      (advice.teamRetry?.reachablePath ??
        advice.teamRetry?.ceilingPathRate > 0) ||
        (advice.eraRetry?.reachablePath ??
          advice.eraRetry?.ceilingPathRate > 0),
    );
    const availableRetrySummaries = [
      retries.team.available ? advice.teamRetry : null,
      retries.era.available ? advice.eraRetry : null,
    ].filter(Boolean);
    const exactRetryTreeExhausted = Boolean(
      retriesAvailable &&
        availableRetrySummaries.length ===
          Number(retries.team.available) + Number(retries.era.available) &&
        availableRetrySummaries.every((retry) => retry.exact) &&
        !retryCanRestoreCeiling,
    );
    const impossible =
      !runtime.modelMismatch &&
      (seededResult
        ? !seededResult.possible82
        : advice.priorCeiling && !advice.priorCeiling.possible82);
    const currentCanKeepCeiling = current.actions.some(
      (action) => action.ceiling.possible82,
    );
    const forcedImpossible =
      !runtime.modelMismatch &&
      !seededResult &&
      !impossible &&
      !currentCanKeepCeiling &&
      (!retriesAvailable ||
        exactRetryTreeExhausted ||
        !retryCanRestoreCeiling);
    const chosenRetry =
      advice.kind === "team"
        ? advice.teamRetry
        : advice.kind === "era"
          ? advice.eraRetry
          : null;
    const recommendedKeepsCeiling = isRetry
      ? chosenRetry?.reachablePath ?? chosenRetry?.ceilingPathRate > 0
      : best?.ceiling.possible82;
    const atRisk =
      !runtime.modelMismatch &&
      !seededResult &&
      !impossible &&
      !forcedImpossible &&
      !recommendedKeepsCeiling;
    const sampledPathRate = seededResult
      ? Number(seededResult.possible82)
      : isRetry
        ? chosenRetry?.pathRate || 0
        : best?.forecastPathRate || 0;
    const sampledPathPercent = Math.round(sampledPathRate * 100);
    const statusColor = runtime.modelMismatch
      ? COLORS.team
      : impossible || forcedImpossible
        ? COLORS.impossible
        : atRisk || sampledPathPercent < 25
          ? COLORS.team
          : COLORS.pick;
    const statusText = runtime.modelMismatch
      ? "Site model changed — recommendations are provisional"
      : impossible
        ? seededResult
          ? `82-0 impossible · exact seeded max ${seededResult.score.toFixed(1)}`
          : `82-0 impossible · absolute max ${advice.priorCeiling.score.toFixed(1)}`
        : forcedImpossible
          ? `82-0 now impossible · best reachable max ${roundOne(
              Math.max(
                ...current.actions.map((action) => action.ceiling.raw),
                ...availableRetrySummaries.map(
                  (retry) => retry.best?.ceiling.raw || 0,
                ),
              ),
            ).toFixed(1)}`
          : atRisk
            ? "82-0 remains mathematically possible · recommendation favors the higher average"
            : seededResult
              ? `82-0 achievable · exact seeded max ${seededResult.score.toFixed(1)}`
              : sampledPathPercent
                ? `82-0 mathematically possible · ${sampledPathPercent}% of sampled futures`
                : "82-0 mathematically possible · not reached in sampled futures";
    const actionColor = isRetry
      ? COLORS[advice.kind]
      : move
        ? COLORS.position
        : advice.kind === "pick"
          ? COLORS.pick
          : COLORS.impossible;
    const eyebrow = move
      ? "MOVE FIRST"
      : advice.kind === "pick"
        ? "PICK NOW"
        : advice.kind === "team"
          ? "TEAM RETRY"
          : advice.kind === "era"
            ? "ERA RETRY"
            : "NO LEGAL ACTION";
    const primary = move
      ? `${move.player} · ${move.from}`
      : isRetry
        ? advice.kind === "team"
          ? `Keep ${advice.cell.era} · reroll team`
          : `Keep ${advice.cell.team} · reroll era`
        : best?.row.player || "Retry unavailable";
    const position = move
      ? move.to
      : advice.kind === "pick" && best
        ? best.position
        : "";
    const pickedResult = calculateTeamResult(entries.map((entry) => entry.row));
    const currentLine = best ? scoreText(best.ceiling) : "—";
    const expectedLine = Number.isFinite(best?.forecastScore)
      ? `${best.forecastScore.toFixed(1)} avg · ${best.forecastWins.toFixed(0)} wins avg`
      : currentLine;

    const stats = best
      ? `${best.row.ppg.toFixed(1)} PTS · ${best.row.rpg.toFixed(1)} REB · ${best.row.apg.toFixed(1)} AST · ${best.row.spg.toFixed(1)} STL · ${best.row.bpg.toFixed(1)} BLK`
      : "";
    const fallbackHtml =
      isRetry && best
        ? `<div class="fallback">Best fallback if you override: <strong>${escapeHtml(best.row.player)} → ${best.position}</strong><br>${escapeHtml(stats)}</div>`
        : "";
    const recommendedCardVisible = best
      ? cards.some(
          ({ row, element }) => row.key === best.row.key && isVisible(element),
        )
      : true;
    const filterHint =
      best && !recommendedCardVisible
        ? `<div class="filter-hint">Clear search/filters to show <strong>${escapeHtml(best.row.player)}</strong>.</div>`
        : "";
    const formatRetry = (retry, available) => {
      if (!retry) return available ? "no legal outcomes" : "used";
      if (retry.exact) {
        const cellText = `${retry.predictedCell.team} ${retry.predictedCell.era}`;
        const direct = retry.legalCount
          ? `${cellText} · ${retry.meanScore.toFixed(1)} · ${retry.pathRate ? "keeps 82 path" : "loses 82 path"}`
          : `${cellText} · no legal UI pick`;
        if (!retry.chainRecommended || advice.seededPlan) return direct;
        const chained = retry.chain;
        return `${direct}; then ${chained.scope.toUpperCase()} → ${chained.cell.team} ${chained.cell.era} · ${chained.action.ceiling.score.toFixed(1)}`;
      }
      return `${retry.meanScore.toFixed(1)} avg · ${retry.meanWins.toFixed(0)} wins avg · ${Math.round(retry.pathRate * 100)}% sampled 82`;
    };
    const teamForecast = formatRetry(advice.teamRetry, retries.team.available);
    const eraForecast = formatRetry(advice.eraRetry, retries.era.available);
    const actionMetric = chosenRetry
      ? seededResult
        ? scoreText(seededResult)
        : chosenRetry.exact
          ? `${(chosenRetry.chainRecommended ? chosenRetry.decisionScore : chosenRetry.meanScore).toFixed(1)} · ${(chosenRetry.reachablePath ?? chosenRetry.pathRate) ? "82 path" : "no 82 path"}`
          : `${chosenRetry.meanScore.toFixed(1)} avg · ${chosenRetry.meanWins.toFixed(0)} wins avg`
      : expectedLine;

    const seededRoute = advice.seededPlan?.steps?.length
      ? `<div class="route">
          <div class="route-title">Optimal remaining route</div>
          ${advice.seededPlan.steps
            .map((step, index) => {
              const retriesText = step.retries.length
                ? `${step.retries.map((scope) => scope.toUpperCase()).join(" → ")} → `
                : "PICK · ";
              const cellText = step.cell
                ? `${step.cell.team} ${step.cell.era} · `
                : "";
              return `<div class="route-step"><span>R${entries.length + index + 1}</span><strong>${escapeHtml(`${retriesText}${cellText}${step.row.player} → ${step.position}`)}</strong></div>`;
            })
            .join("")}
          <div class="sub">Rechecked after every action.</div>
        </div>`
      : "";

    const details = ui.details
      ? `<div class="details">
          <div class="row"><span>Picked team now</span><strong>${entries.length}/5 · ${scoreText(pickedResult)}</strong></div>
          <div class="row"><span>Expected final</span><strong>${escapeHtml(expectedLine)}</strong></div>
          <div class="row"><span>Best current-pool ceiling</span><strong>${escapeHtml(currentLine)}</strong></div>
          ${seededResult ? `<div class="row"><span>Exact seeded final maximum</span><strong>${escapeHtml(scoreText(seededResult))}</strong></div>` : ""}
          <div class="row"><span>Team retry forecast</span><strong>${escapeHtml(teamForecast)}</strong></div>
          <div class="row"><span>Era retry forecast</span><strong>${escapeHtml(eraForecast)}</strong></div>
          <div class="row"><span>Reason</span><strong>${escapeHtml(advice.reason)}</strong></div>
          <div class="row"><span>Model</span><strong>${advice.seededPlan ? "Exact seeded full draft" : runtime.shadowReady && runtime.shadowSynced ? "Exact seeded retries" : "Balanced adaptive rollouts"} · ${MODEL_VERIFIED}</strong></div>
          ${seededRoute}
          <div class="legend">
            <span class="swatch" style="--c:${COLORS.pick}">pick</span>
            <span class="swatch" style="--c:${COLORS.team}">team retry</span>
            <span class="swatch" style="--c:${COLORS.era}">era retry</span>
            <span class="swatch" style="--c:${COLORS.position}">position</span>
            <span class="swatch" style="--c:${COLORS.impossible}">impossible</span>
          </div>
        </div>`
      : "";

    const remainingAfterAction = POSITIONS.filter((openPosition) => {
      const bit = 1 << POSITION_INDEX[openPosition];
      if (occupiedMask(entries) & bit) return false;
      return advice.kind !== "pick" || move || openPosition !== best?.position;
    });
    const remainingMoveRoute = move
      ? [
          ...(best.moves || [])
            .slice(1)
            .map((nextMove) =>
              `move ${nextMove.player} ${nextMove.from} → ${nextMove.to}`,
            ),
          `pick ${best.row.player} → ${best.position}`,
        ].join("; then ")
      : "";
    const subline = move
      ? `Then ${remainingMoveRoute}`
      : isRetry
        ? advice.reason
        : stats;
    const html = `
      <div class="status" style="--status:${statusColor}"><span class="dot"></span><span>${escapeHtml(statusText)}</span></div>
      <div class="action" style="--action:${actionColor}">
        <div class="eyebrow">${eyebrow}</div>
        <div class="primary"><span class="name">${escapeHtml(primary)}</span>${position ? `<span class="arrow">→</span><span class="position">${position}</span>` : ""}</div>
        <div class="sub">${escapeHtml(subline)}</div>
        <div class="metrics"><span>${seededResult ? "Exact seeded final" : isRetry ? "Retry expected final" : "Expected final"}</span><strong>${escapeHtml(actionMetric)}</strong><span>${advice.kind === "pick" && !move ? "Open after pick" : "Open positions"}</span><strong>${escapeHtml(remainingAfterAction.join(" · ") || "Complete")}</strong></div>
      </div>
      ${fallbackHtml}
      ${filterHint}
      <button class="details-toggle" id="details-toggle">${ui.details ? "Hide details" : "Why this choice?"}</button>
      ${details}
    `;

    const signature = JSON.stringify({
      version: VERSION,
      kind: advice.kind,
      cell: advice.cellSignature,
      player: best?.row.key,
      position: best?.position,
      move: move ? `${move.player}:${move.from}:${move.to}` : "",
      impossible,
      forcedImpossible,
      seeded: seededResult?.raw,
      mismatch: runtime.modelMismatch,
      details: ui.details,
      team: teamForecast,
      era: eraForecast,
    });
    renderPanel(html, signature);
  }

  function findResultButton() {
    return (
      [...document.querySelectorAll("button,a")].find((element) =>
        /^build another(?: team)?$/i.test((element.textContent || "").trim()),
      ) || null
    );
  }

  function officialRecordFromPage() {
    const labels = [...document.querySelectorAll("span,p,div")].filter(
      (element) =>
        isVisible(element) &&
        /^projected record$/i.test(directText(element)),
    );
    for (const label of labels) {
      let container = label.parentElement;
      for (let depth = 0; container && depth < 6; depth += 1) {
        const text = (container.innerText || container.textContent || "")
          .replace(/\s+/g, " ")
          .trim();
        for (const match of text.matchAll(/\b(\d{1,2})\s*[-–—]\s*(\d{1,2})\b/g)) {
          const wins = Number(match[1]);
          const losses = Number(match[2]);
          if (wins + losses === 82) return { wins, losses, score: null };
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  function officialScoreFromPage() {
    for (const element of document.querySelectorAll("span,p")) {
      if (!isVisible(element)) continue;
      const match = directText(element).match(/^([\d,.]+)\s*pts$/i);
      if (!match) continue;
      const score = Number(match[1].replaceAll(",", ""));
      if (Number.isFinite(score) && score >= 0 && score <= 200) return score;
    }
    return null;
  }

  function renderResultsIfPresent() {
    const resultButton = findResultButton();
    if (!resultButton) return false;
    clearHighlights();
    const rows = [...runtime.tracked.values()].map((tracked) => tracked.row);
    const calculated = rows.length === 5 ? calculateTeamResult(rows) : null;
    const official = runtime.officialResult || officialRecordFromPage();
    if (!calculated && !official) {
      renderPanel(
        '<div class="loading">Final screen detected. Waiting for the official result…</div>',
        `result-missing:${rows.length}`,
      );
      return true;
    }
    const displayed = official || calculated;
    const officialScore = runtime.officialResult?.score;
    const pageScore = officialScoreFromPage();
    const score = Number.isFinite(officialScore)
      ? officialScore
      : calculated?.score ?? pageScore;
    const possible82 = displayed.wins === 82;
    const color = possible82 ? COLORS.pick : COLORS.impossible;
    const sourceLine = official
      ? calculated
        ? "Final result from 82-0 · score checked from all five selected peaks."
        : "Final result shown by 82-0."
      : "Record projected with the current 82-0 curve; score exactly recomputed from all five peaks.";
    const historySummary = official
      ? resultHistorySummary(recordCompletedGame(displayed, score))
      : "";
    renderPanel(
      `<div class="status" style="--status:${color}"><span class="dot"></span><span>${possible82 ? "82-0 achieved" : "Final team"}</span></div>
       <div class="action" style="--action:${color}"><div class="eyebrow">FINAL RESULT</div><div class="primary"><span class="name">${displayed.wins}-${displayed.losses}</span><span class="arrow">·</span><span class="position">${Number.isFinite(score) ? score.toFixed(1) : "—"}</span></div><div class="sub">${escapeHtml(sourceLine)}${historySummary ? `<br>${escapeHtml(historySummary)}` : ""}</div></div>`,
      `result:${score}:${displayed.wins}:${runtime.mode}:${official ? "official" : "projected"}`,
    );
    if (calculated) checkModelDrift(calculated);
    return true;
  }

  function checkModelDrift(calculated) {
    if (runtime.mode === "1v1" || runtime.modelMismatch) return;
    const candidates = [];
    for (const element of document.querySelectorAll("span,p")) {
      const text = directText(element);
      const match = text.match(/(?:^|·\s*)([\d,.]+)\s*pts\s*$/i);
      if (!match) continue;
      const value = Number(match[1].replaceAll(",", ""));
      if (Number.isFinite(value) && value >= 0 && value <= 200)
        candidates.push(value);
    }
    if (candidates.length !== 1) return;
    const displayed = candidates[0];
    if (Math.abs(displayed - calculated.score) <= 0.11) {
      runtime.resultMismatchCandidate = null;
      return;
    }
    if (runtime.resultMismatchCandidate === displayed) {
      runtime.modelMismatch = true;
      safeSessionSet(MISMATCH_KEY, "1");
      runtime.lastAdviceSignature = "";
      scheduleScan(0);
    } else {
      runtime.resultMismatchCandidate = displayed;
      scheduleScan(300);
    }
  }

  function detectModeFromPage() {
    const query = new URLSearchParams(location.search);
    const queryMode = query.get("mode") || query.get("play");
    const opponent = query.get("opponent");
    const stats = query.get("stats");
    // The redesigned site represents 1v1 as Classic + a bot variant rather
    // than mode=1v1. Check variants before the base mode so a later scan does
    // not overwrite the click-captured 1v1 label.
    if (opponent === "bot" || queryMode === "1v1") setMode("1v1");
    else if (stats === "hidden" || queryMode === "hoopiq") setMode("hoopiq");
    else if (queryMode === "classic") setMode("classic");
    const bodyText = document.body?.innerText || "";
    if (/\bHOOP\s*IQ\b/i.test(bodyText) && getPlayerListRoot())
      setMode("hoopiq");
    if (
      /finding an opponent|coin flip|you pick first|opponent is picking/i.test(
        bodyText,
      )
    )
      setMode("1v1");
  }

  function resetRuntime(mode) {
    runtime.tracked.clear();
    runtime.lastOffers.clear();
    runtime.recentOffers.clear();
    runtime.selectedRow = null;
    runtime.pendingPick = null;
    runtime.lastCell = null;
    runtime.lastAdvice = null;
    runtime.lastAnalysisKey = "";
    runtime.lastAnalysis = null;
    runtime.analysisInProgressKey = "";
    runtime.lastAdviceSignature = "";
    runtime.persistedPicks.clear();
    runtime.pickOrder = 0;
    runtime.emptyTraySince = 0;
    runtime.idleRecoveryScans = 0;
    runtime.officialResult = null;
    runtime.resultRecorded = false;
    runtime.sessionPayload = null;
    runtime.dealtSessionId = null;
    runtime.dealtCell = null;
    runtime.shadowSession = null;
    runtime.shadowReady = false;
    runtime.shadowSynced = false;
    runtime.shadowError = null;
    runtime.shadowPendingCell = null;
    runtime.shadowPendingFrom = null;
    runtime.criticalStudioIds = new Set();
    safeSessionRemove(PICKS_KEY);
    runtime.optimizer?.clearCache();
    if (mode) setMode(mode);
  }

  function inferPositionTarget(target) {
    const button = target.closest?.('button,[role="button"]');
    if (!button) return null;
    return controlPosition(button);
  }

  function handleDocumentClick(event) {
    const button = event.target.closest?.("button,a");
    const text = (button?.textContent || "")
      .replace(/\s+/g, " ")
      .trim()
      .toLowerCase();
    const trackName = button?.getAttribute("data-track-name") || "";
    if (text.includes("play 1v1") || trackName === "mode_play_1v1")
      resetRuntime("1v1");
    else if (
      text.includes("play hoop") ||
      text === "hoop iq" ||
      trackName === "mode_play_hoopiq"
    )
      resetRuntime("hoopiq");
    else if (
      text.includes("play classic") ||
      text === "classic" ||
      trackName === "mode_play_classic"
    )
      resetRuntime("classic");
    else if (/^build another(?: team)?$/.test(text)) resetRuntime(runtime.mode);

    // The new site can delay updating the lineup tray until the next roll.
    // A visible SPIN button proves the placement succeeded, so advance the
    // seeded shadow before the site renders the next cell.
    if (text === "spin" && runtime.pendingPick?.row) {
      if (!runtime.pendingPick.shadowCommitted)
        runtime.pendingPick.shadowCommitted = commitShadowPick(
          runtime.pendingPick.row,
          runtime.pendingPick.position,
        );
    }

    const retryButtons = findRetryButtons();
    if (
      button &&
      (button === retryButtons.team.element ||
        button === retryButtons.era.element)
    ) {
      commitShadowRetry(button === retryButtons.team.element ? "team" : "era");
      runtime.selectedRow = null;
      runtime.pendingPick = null;
      runtime.lastAnalysisKey = "";
      runtime.lastAnalysis = null;
      scheduleScan(80);
      // The current site resolves the booster request and retry animation in
      // separate React updates. Those changes are not always DOM mutations,
      // so make a few bounded follow-up scans instead of getting stuck idle.
      window.setTimeout(() => scheduleScan(0), 700);
      window.setTimeout(() => scheduleScan(0), 2_200);
      window.setTimeout(() => scheduleScan(0), 4_500);
      return;
    }

    const cardElement = event.target.closest?.(
      '[data-testid="player-card"],div[draggable]',
    );
    const cardRow = rowFromCard(cardElement);
    if (cardRow) runtime.selectedRow = cardRow;

    const position = inferPositionTarget(event.target);
    if (
      position &&
      runtime.selectedRow &&
      runtime.selectedRow.positions.includes(position) &&
      ![...parseTray().slots.keys()].includes(position)
    ) {
      runtime.pendingPick = {
        row: runtime.selectedRow,
        position,
        time: Date.now(),
      };
      scheduleScan(80);
    }
  }

  function handleDragStart(event) {
    const row = rowFromCard(
      event.target.closest?.('[data-testid="player-card"],div[draggable]'),
    );
    if (row) runtime.selectedRow = row;
  }

  function handleDrop(event) {
    const position = inferPositionTarget(event.target);
    if (position && runtime.selectedRow?.positions.includes(position)) {
      runtime.pendingPick = {
        row: runtime.selectedRow,
        position,
        time: Date.now(),
      };
      scheduleScan(80);
    }
  }

  function handleKeydown(event) {
    if (event.altKey && event.key.toLowerCase() === "a") {
      const state = readUiState();
      state.hidden = false;
      state.collapsed = !state.collapsed;
      writeUiState(state);
      const host = getPanel();
      host.shadowRoot.getElementById("card").classList.toggle("hidden", false);
      host.shadowRoot
        .getElementById("card")
        .classList.toggle("collapsed", state.collapsed);
      host.shadowRoot.getElementById("collapse").textContent = state.collapsed
        ? "+"
        : "—";
      event.preventDefault();
    }
  }

  function scheduleScan(delay = 140) {
    clearTimeout(runtime.scanTimer);
    runtime.scanTimer = window.setTimeout(scan, delay);
  }

  function scan() {
    runtime.scanSerial += 1;
    detectModeFromPage();
    if (!runtime.dataReady) {
      renderLoading(
        runtime.loadError || "Loading player peaks and expected-value optimizer…",
        Boolean(runtime.loadError),
      );
      return;
    }

    const cards = findCards();
    const cell = parseCell(cards);
    const trayState = reconcileRoster(cell);
    if (!readUiState().enabled) {
      clearHighlights();
      runtime.lastAdvice = null;
      runtime.analysisInProgressKey = "";
      return;
    }
    if (renderResultsIfPresent()) return;
    if (!cell || !getPlayerListRoot() || !trayState.present) {
      clearHighlights();
      const waiting = /spinning|respinning/i.test(
        document.body?.innerText || "",
      )
        ? "Waiting for the roll…"
        : "Coach ready — start Classic, Hoop IQ, or 1v1.";
      renderPanel(
        `<div class="loading">${escapeHtml(waiting)}</div>`,
        `idle:${waiting}:${runtime.mode}`,
      );
      if (
        trayState.present &&
        document.querySelector('[data-testid="player-card"],div[draggable]') &&
        runtime.idleRecoveryScans < MAX_IDLE_RECOVERY_SCANS
      ) {
        runtime.idleRecoveryScans += 1;
        scheduleScan(500);
      }
      return;
    }
    runtime.idleRecoveryScans = 0;

    if (
      runtime.lastCell &&
      (runtime.lastCell.team !== cell.team || runtime.lastCell.era !== cell.era)
    ) {
      runtime.selectedRow = null;
      runtime.pendingPick = null;
      runtime.lastAdvice = null;
      runtime.lastAnalysisKey = "";
      runtime.lastAnalysis = null;
      runtime.analysisInProgressKey = "";
    }
    runtime.lastCell = cell;
    const cellRows = runtime.byCell.get(`${cell.team}|${cell.era}`) || [];
    runtime.lastOffers = new Map(cellRows.map((row) => [row.player, row]));
    for (const row of cellRows) runtime.recentOffers.set(row.player, row);
    if (runtime.recentOffers.size > 700) runtime.recentOffers.clear();

    const entries = currentEntries(trayState);
    if (entries.length < trayState.slots.size) {
      renderLoading("Syncing your previously selected peaks…");
      return;
    }
    const openMask = FULL_POSITION_MASK & ~occupiedMask(entries);
    if (!openMask) return;

    const retries = findRetryButtons();
    const shadowState = syncShadowToCell(cell);
    if (shadowState === "waiting") {
      renderAnalyzing();
      return;
    }
    const analysisKey = `${cell.team}|${cell.era}|${entries
      .map((entry) => `${entry.row.key}@${entry.position}`)
      .sort()
      .join(
        ";",
      )}|${retries.team.available ? 1 : 0}|${retries.era.available ? 1 : 0}|${
      runtime.shadowSynced && runtime.shadowSession
        ? `seed:${runtime.shadowSession.sessionId}:${runtime.shadowSession.rng.state}`
        : "forecast"
    }`;
    let analysis =
      runtime.lastAnalysisKey === analysisKey ? runtime.lastAnalysis : null;
    if (!analysis) {
      renderAnalyzing();
      runtime.lastAdvice = null;
      if (runtime.analysisInProgressKey !== analysisKey) {
        runtime.analysisInProgressKey = analysisKey;
        runtime.analysisGeneration += 1;
        const analysisGeneration = runtime.analysisGeneration;
        const stillCurrent = () =>
          runtime.analysisInProgressKey === analysisKey &&
          runtime.analysisGeneration === analysisGeneration &&
          readUiState().enabled;
        requestAnimationFrame(() => {
          window.setTimeout(async () => {
            if (!stillCurrent()) return;
            try {
              const limits = rolloutLimits();
              const currentDeadline =
                performance.now() +
                (runtime.mode === "1v1"
                  ? ONE_V_ONE_ANALYSIS_MAX_MS
                  : CURRENT_ANALYSIS_MAX_MS);
              const current = await forecastEvaluation(
                evaluateCell(cell, entries, true),
                entries,
                {
                  samples: limits.currentSamples,
                  maxActions: limits.currentActions,
                  seed: `pick:${cell.team}|${cell.era}:${entries
                    .map((entry) => entry.row.key)
                    .sort()
                    .join(";")}`,
                  retryCount:
                    Number(retries.team.available) +
                    Number(retries.era.available),
                  deadline: currentDeadline,
                  shouldContinue: stillCurrent,
                },
              );
              const teamRetry = retries.team.available
                ? await summarizeRetry(
                    "team",
                    cell,
                    entries,
                    Number(retries.era.available),
                    performance.now() +
                      (runtime.mode === "1v1"
                        ? ONE_V_ONE_ANALYSIS_MAX_MS / 2
                        : RETRY_ANALYSIS_MAX_MS),
                    stillCurrent,
                  )
                : null;
              const eraRetry = retries.era.available
                ? await summarizeRetry(
                    "era",
                    cell,
                    entries,
                    Number(retries.team.available),
                    performance.now() +
                      (runtime.mode === "1v1"
                        ? ONE_V_ONE_ANALYSIS_MAX_MS / 2
                        : RETRY_ANALYSIS_MAX_MS),
                    stillCurrent,
                  )
                : null;
              await yieldToBrowser(stillCurrent);
              const completed = {
                current,
                teamRetry,
                eraRetry,
                priorCeiling: runtime.optimizer.relaxedCeiling(
                  entries.map((entry) => entry.row),
                ),
                seededPlan:
                  runtime.shadowReady && runtime.shadowSynced
                    ? solveExactSeededPlan(entries)
                    : null,
              };
              if (!stillCurrent()) return;
              runtime.lastAnalysisKey = analysisKey;
              runtime.lastAnalysis = completed;
            } catch (error) {
              if (error?.name !== "AnalysisCancelledError") {
                console.error("[82-0 Coach] Analysis failed", error);
                runtime.loadError = `Analysis failed: ${error.message || error}`;
              }
            } finally {
              if (
                runtime.analysisInProgressKey === analysisKey &&
                runtime.analysisGeneration === analysisGeneration
              ) {
                runtime.analysisInProgressKey = "";
                scheduleScan(0);
              }
            }
          }, 0);
        });
      }
      return;
    }
    let { current } = analysis;
    const { teamRetry, eraRetry, priorCeiling, seededPlan } = analysis;
    let decision = null;
    if (seededPlan?.first) {
      if (seededPlan.first.retries.length) {
        const firstRetry = seededPlan.first.retries[0];
        decision = {
          kind: firstRetry,
          reason: `The exact seeded optimum is ${scoreText(seededPlan.result)} and starts with ${firstRetry.toUpperCase()} retry${seededPlan.first.retries.length > 1 ? `, then ${seededPlan.first.retries[1].toUpperCase()} retry` : ""}.`,
        };
      } else {
        const placement = shortestPlacementPlan(
          reachableRosterStates(entries),
          seededPlan.first.row,
          seededPlan.first.postMask,
          seededPlan.first.position,
        );
        if (
          placement &&
          movePlanUpgradesOccupiedPosition(
            entries,
            seededPlan.first.row,
            placement,
          )
        ) {
          current = {
            ...current,
            best: {
              row: seededPlan.first.row,
              position: seededPlan.first.position,
              moves: placement.moves,
              ceiling: seededPlan.result,
              immediate: calculateTeamResult([
                ...entries.map((entry) => entry.row),
                seededPlan.first.row,
              ]),
              seeded: true,
            },
          };
          decision = {
            kind: "pick",
            reason: `This pick leads to the exact seeded maximum: ${scoreText(seededPlan.result)}.`,
          };
        }
      }
    }
    if (!decision)
      decision = chooseAdvice(
        current,
        teamRetry,
        eraRetry,
        retries,
        priorCeiling,
        popcount(openMask),
      );
    const cellSignature = `${cell.team}|${cell.era}|${entries
      .map((entry) => `${entry.row.key}@${entry.position}`)
      .sort()
      .join(";")}|${decision.kind}`;
    const advice = {
      ...decision,
      cell,
      cellSignature,
      current,
      teamRetry,
      eraRetry,
      priorCeiling,
      seededPlan,
    };
    runtime.lastAdvice = advice;
    renderAdvice(advice, entries, cards, retries);
  }

  function bootstrap() {
    getPanel();
    document.addEventListener("click", handleDocumentClick, true);
    document.addEventListener("dragstart", handleDragStart, true);
    document.addEventListener("drop", handleDrop, true);
    document.addEventListener("keydown", handleKeydown, true);
    const observer = new MutationObserver(() => scheduleScan());
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    renderLoading("Loading player peaks and expected-value optimizer…");
    loadRows()
      .then(() => scheduleScan(0))
      .catch((error) => {
        console.error("[82-0 Coach] Failed to load player data", error);
        runtime.loadError = `Could not load player data: ${error.message || error}`;
        scheduleScan(0);
      });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", bootstrap, { once: true });
  } else {
    bootstrap();
  }
})();
