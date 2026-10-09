"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { POSITIONS } = require("../82-0-advisor.user.js");
const script = fs.readFileSync(path.join(__dirname, "../82-0-advisor.user.js"), "utf8");
const host = "#__82coach_host__";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const decisions = [];
    for (const mode of ["classic", "hoopiq", "1v1"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", (e) => errors.push(e.message));
      const players = POSITIONS.map((position, index) => ({ name: `Weak ${position}`, player_id: index + 1,
        team_id: "TEST", era: "2000s", positions: [position],
        stats: { ppg: 1, rpg: 1, apg: 1, spg: 0.1, bpg: 0.1 } }));
      const free = { enabled: true, next_use: "free", free_left: 1 };
      let squad = mode === "hoopiq" ? players.map(({ stats, ...p }) => p) : players;
      let boosters = { respin_team: { ...free }, respin_era: { ...free } };
      let seq = 0;
      let botScore = 40;
      let session = 0;
      let update = null;
      await context.route("https://www.82-0.com/**", (route) => {
        const url = route.request().url();
        if (url.endsWith("/session/start")) return route.fulfill({ json: {
          session_id: `test-${mode}-${++session}`, slots: [],
          ...(mode === "1v1" ? { opponent: { score: botScore, roster: [] } } : {}),
        } });
        if (url.endsWith("/session/spin")) return route.fulfill({ json: { cell: {
          seq: ++seq, team: { team_id: "TEST", abbr: "TST" }, era: "2000s",
          // Hoop IQ uses previously encountered Classic stats, just like v4.
          squad, boosters,
        } } });
        if (url.endsWith("/session/move")) return route.fulfill({ json: update });
        return route.fulfill({ contentType: "text/html", body: `<!doctype html><body>
          ${POSITIONS.map(p => `<button aria-label="${p}" data-track-name="draft_slot_place"><div data-slot-figure></div>${p}</button>`).join("")}
          <section>${players.map(p => `<div data-testid="player-card" data-player="${p.name}"><p>${p.name}</p></div>`).join("")}</section>
          <button data-track-name="draft_skip_team" disabled>TEAM</button><button data-track-name="draft_skip_era" disabled>ERA</button>
        </body>` });
      });
      await page.addInitScript(({ players, script }) => {
        const saved = players.map((p) => ({ ...p, id: `${p.player_id}|TEST|2000s`, team: "TST", hasStats: true }));
        localStorage.setItem("__82coach_live_rows_v4__", JSON.stringify(saved));
        const NativeWorker = window.Worker;
        window.lastPlannerInput = null;
        window.Worker = class extends NativeWorker {
          postMessage(input, ...args) {
            if (input?.pools) window.lastPlannerInput = input;
            return super.postMessage(input, ...args);
          }
        };
        (0, eval)(script);
      }, { players, script });
      await page.goto(`https://www.82-0.com/draft?mode=${mode}`);
      const deal = () => page.evaluate(async () => {
        await fetch("/game-session/api/v4/session/start");
        await new Promise(resolve => setTimeout(resolve, 40));
        await fetch("/game-session/api/v4/session/spin");
      });
      await deal();
      await page.locator(`${host} .eyebrow`).waitFor();
      assert.equal(await page.locator(`${host} .eyebrow`).textContent(), "PICK NOW");
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries),
        { team: false, era: false, purchase: { team: false, era: false } });

      // Attribute-only animation completion used to be invisible to the observer.
      await page.evaluate(() => {
        for (const button of document.querySelectorAll('button[data-track-name^="draft_skip_"]')) button.disabled = false;
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "REROLL NOW");
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries),
        { team: true, era: true, purchase: { team: false, era: false } });
      assert.ok((await page.locator(`${host} .retry-summary`).textContent()).includes("pts"));
      assert.equal(await page.locator(`${host} .outlook`).getAttribute("data-state"), "unlikely");
      assert.ok(!(await page.locator(`${host} #content`).textContent()).includes("impossible"));
      const decision = await page.locator(`${host} .primary`).textContent();
      decisions.push(decision);

      // Removing only one retry must leave the other eligible and recommended.
      for (const availableScope of ["era", "team"]) {
        await page.evaluate((availableScope) => {
          for (const scope of ["team", "era"])
            document.querySelector(`button[data-track-name="draft_skip_${scope}"]`).disabled = scope !== availableScope;
        }, availableScope);
        await page.waitForFunction((scope) => document.querySelector("#__82coach_host__").shadowRoot
          .querySelector(".primary")?.textContent.includes(`Reroll ${scope.toUpperCase()}`), availableScope);
      }
      if (mode === "1v1") {
        botScore = 140;
        await page.evaluate(() => {
          for (const button of document.querySelectorAll('button[data-track-name^="draft_skip_"]')) button.disabled = false;
        });
        await deal();
        await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
          .querySelector(".status")?.textContent.includes("140.0"));
        assert.equal(await page.locator(`${host} .primary`).textContent(), decision,
          "raising the bot score must not change the score-maximizing retry");
      }

      // Owned tokens remain usable even after the free retry has been spent.
      boosters = { respin_team: { ...free, next_use: "owned", free_left: 0, owned_left: 1 },
        respin_era: { ...free, next_use: "owned", free_left: 0, owned_left: 1 } };
      await page.evaluate(async () => {
        for (const button of document.querySelectorAll('button[data-track-name^="draft_skip_"]')) button.disabled = false;
        await fetch("/game-session/api/v4/session/spin");
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".action .sub")?.textContent.includes("owned retry token"));
      assert.equal(await page.locator(`${host} .eyebrow`).textContent(), "REROLL NOW");
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries),
        { team: true, era: true, purchase: { team: false, era: false } });
      assert.ok((await page.locator(`${host} .retry-summary`).textContent()).includes("owned token"));

      update = { seq, boosters: { respin_team: { next_use: "rv", rv_left: 1 },
        respin_era: { next_use: "rv", rv_left: 1 } } };
      await page.evaluate(() => fetch("/game-session/api/v4/session/move"));
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".action .sub")?.textContent.includes("site's ad"));
      assert.equal(await page.locator(`${host} .eyebrow`).textContent(), "REROLL NOW");
      assert.ok((await page.locator(`${host} .retry-summary`).textContent()).includes("watch ad"));

      // Partial session responses update funding without a new spin. Both
      // purchase routes are quoted, not added as future funded inventory.
      update = { seq, boosters: { respin_team: { next_use: "coins", free_left: 0, owned_left: 0 },
        respin_era: { next_use: "none", free_left: 0, owned_left: 0,
          used_coins: 0, coins_per_draft: 1 } } };
      await page.evaluate(() => fetch("/game-session/api/v4/session/move"));
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "CONSIDER RETRY");
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries),
        { team: false, era: false, purchase: { team: true, era: true } });
      const summary = await page.locator(`${host} .retry-summary`).textContent();
      assert.ok(summary.includes("coins required") && summary.includes("purchase option"));
      assert.ok(!(await page.locator(`${host} #content`).textContent()).includes("no free retry"));
      assert.ok((await page.locator(`${host} .action .sub`).textContent()).includes("Purchase required"));
      assert.ok(await page.locator(`${host} .filter-hint`).isVisible(), "no-purchase fallback stays visible when details are closed");

      // A remaining free retry, not a worse immediate pick, is the alternative
      // when the other scope needs a purchase.
      update = { seq, boosters: { respin_era: { ...free } } };
      await page.evaluate(() => fetch("/game-session/api/v4/session/move"));
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".retry-summary")?.textContent.includes("Era: free"));
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries),
        { team: false, era: true, purchase: { team: true, era: false } });
      if (await page.locator(`${host} .eyebrow`).textContent() === "CONSIDER RETRY") {
        assert.ok((await page.locator(`${host} .filter-hint`).textContent()).includes("Without buying: reroll ERA (free)"));
      } else {
        assert.ok((await page.locator(`${host} .primary`).textContent()).includes("Reroll ERA"));
      }
      const mixedSummary = await page.locator(`${host} .retry-summary`).textContent();

      // Old responses cannot restore spent retries or override a newer cell.
      update = { seq: seq - 1, boosters: { respin_team: { ...free }, respin_era: { ...free } } };
      await page.evaluate(() => fetch("/game-session/api/v4/session/move"));
      await page.waitForTimeout(150);
      assert.equal(await page.locator(`${host} .retry-summary`).textContent(), mixedSummary);

      // A purchase button at its coin cap must not create phantom budgets.
      update = { seq, boosters: { respin_team: { next_use: "none", used_coins: 1, coins_per_draft: 1 },
        respin_era: { next_use: "none", used_coins: 1, coins_per_draft: 1 } } };
      await page.evaluate(() => fetch("/game-session/api/v4/session/move"));
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "PICK NOW");
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries),
        { team: false, era: false, purchase: { team: false, era: false } });
      assert.ok((await page.locator(`${host} .retry-summary`).textContent()).includes("retry limit reached"));

      // Incomplete/config-only metadata no longer masquerades as zero retries.
      boosters = { respin_team: { effect: "respin" }, respin_era: { effect: "respin" } };
      await deal();
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".retry-summary")?.textContent.includes("check cost"));
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries),
        { team: true, era: true, purchase: { team: false, era: false } });
      if (mode === "hoopiq") {
        boosters = { respin_team: { ...free }, respin_era: { ...free } };
        squad = players.map(({ stats, ...p }) => ({ ...p, name: `Unknown ${p.name}`, player_id: `unknown-${p.player_id}` }));
        await page.evaluate(async () => {
          for (const card of document.querySelectorAll('[data-testid="player-card"]')) {
            const name = `Unknown ${card.getAttribute("data-player")}`;
            card.setAttribute("data-player", name);
            card.querySelector("p").textContent = name;
          }
          await fetch("/game-session/api/v4/session/spin");
        });
        await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
          .querySelector(".eyebrow")?.textContent === "ROLL GUIDANCE");
        assert.equal(await page.locator(`${host} .outlook`).getAttribute("data-state"), "uncertain");
        assert.ok((await page.locator(`${host} .retry-summary`).textContent()).includes("stats unknown"));
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    assert.equal(new Set(decisions).size, 1,
      "same stats, budgets, and samples must produce the same score objective in all three modes");
    console.log("Cross-mode browser tests passed: free/owned/ad funding, conditional purchase quotes, partial and stale metadata, animation readiness, bot-independent score planning, and 82-0 outlook.");
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
