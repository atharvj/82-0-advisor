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
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries), { team: false, era: false });

      // Attribute-only animation completion used to be invisible to the observer.
      await page.evaluate(() => {
        for (const button of document.querySelectorAll('button[data-track-name^="draft_skip_"]')) button.disabled = false;
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "REROLL NOW");
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries), { team: true, era: true });
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

      // An enabled paid button after free uses are spent is not a free retry.
      boosters = { respin_team: { ...free, next_use: "coins", free_left: 0 },
        respin_era: { ...free, next_use: "owned", free_left: 0 } };
      await page.evaluate(async () => {
        for (const button of document.querySelectorAll('button[data-track-name^="draft_skip_"]')) button.disabled = false;
        await fetch("/game-session/api/v4/session/spin");
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "PICK NOW");
      assert.deepEqual(await page.evaluate(() => window.lastPlannerInput.retries), { team: false, era: false });
      assert.ok((await page.locator(`${host} .retry-summary`).textContent()).includes("no free retry"));
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
    console.log("Cross-mode browser tests passed: both retry kinds, animation readiness, paid/free budgets, bot-independent score planning, and 82-0 outlook.");
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
