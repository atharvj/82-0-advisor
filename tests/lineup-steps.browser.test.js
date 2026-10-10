"use strict";

// Local fixtures only: no real games, purchases, or account access.
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
    for (const mode of ["classic", "hoopiq", "1v1"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      page.on("pageerror", e => errors.push(e.message));
      const names = ["PG guard", "SG wing", "SF forward", "PF big", "Lenny Wilkens"];
      const players = names.map((name, i) => ({ name, player_id: i + 1,
        team_id: "TEST", era: "2000s", positions: i < 4 ? POSITIONS.slice(i, i + 2) : ["PG"],
        stats: { ppg: 1, rpg: 1, apg: 1, spg: 0.1, bpg: 0.1 } }));
      const expected = [
        "Move PF big from PF to C (empty).",
        "Move SF forward from SF to PF (empty).",
        "Move SG wing from SG to SF (empty).",
        "Move PG guard from PG to SG (empty).",
        "Pick Lenny Wilkens and place him at PG.",
      ];
      let funding = "free";
      let seq = 0;
      await context.route("https://www.82-0.com/**", route => {
        const url = route.request().url();
        if (url.endsWith("/session/start")) return route.fulfill({ json: {
          session_id: `steps-${mode}`, slots: [],
          ...(mode === "1v1" ? { opponent: { score: 100, roster: [] } } : {}),
        } });
        if (url.endsWith("/session/spin")) return route.fulfill({ json: { cell: {
          seq: ++seq, team: { team_id: "TEST", abbr: "TST" }, era: "2000s",
          squad: mode === "hoopiq" ? players.slice(4).map(({ stats, ...p }) => p) : players.slice(4),
          boosters: Object.fromEntries(["team", "era"].map(scope => [`respin_${scope}`,
            { enabled: true, next_use: funding, free_left: funding === "free" ? 1 : 0 } ])),
        } } });
        return route.fulfill({ contentType: "text/html", body: `<!doctype html><body>
          ${POSITIONS.map((p, i) => `<button data-track-name="draft_slot_place" data-court-slot="${p}"
            aria-label="${p}${i < 4 ? `: ${names[i]}` : ""}"><div data-slot-figure></div>${p}</button>`).join("")}
          <div data-testid="player-card" data-player="Lenny Wilkens" data-selectable="false"><p>Lenny Wilkens</p></div>
          <button data-track-name="draft_skip_team">TEAM</button><button data-track-name="draft_skip_era">ERA</button>
        </body>` });
      });
      await page.addInitScript(({ players, script }) => {
        localStorage.setItem("__82coach_live_rows_v4__", JSON.stringify(players.map(p =>
          ({ ...p, id: `${p.player_id}|TEST|2000s`, team: "TST", hasStats: true }))));
        (0, eval)(script);
      }, { players, script });
      await page.goto(`https://www.82-0.com/draft?mode=${mode}`);
      await page.evaluate(async () => {
        await fetch("/game-session/api/v4/session/start");
        await new Promise(resolve => setTimeout(resolve, 40));
        await fetch("/game-session/api/v4/session/spin");
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "REROLL NOW");
      await page.locator(`${host} #details-toggle`).click();
      const fallback = page.locator(`${host} .fallback`);
      await fallback.waitFor({ state: "visible" });
      assert.deepEqual(await fallback.locator(".lineup-steps li").allTextContents(), expected,
        `${mode}: a free-reroll fallback must explain the entire four-move chain`);
      assert.ok(!(await fallback.textContent()).includes("requires a lineup move"));

      // Purchase-only guidance keeps the same exact pick route visible even
      // with the coach's general details collapsed.
      funding = "none";
      await page.evaluate(() => fetch("/game-session/api/v4/session/spin"));
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "CONSIDER RETRY");
      await page.locator(`${host} #details-toggle`).click();
      assert.deepEqual(await page.locator(`${host} .filter-hint .lineup-steps li`).allTextContents(), expected);
      assert.ok(await page.locator(`${host} .filter-hint .lineup-steps`).isVisible());

      // Without retries, all steps must be visible under MOVE FIRST, not
      // buried in general details or replaced by a vague move count.
      await page.evaluate(() => {
        for (const button of document.querySelectorAll('button[data-track-name^="draft_skip_"]')) button.disabled = true;
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "MOVE FIRST");
      assert.deepEqual(await page.locator(`${host} .action .lineup-steps li`).allTextContents(), expected);
      assert.ok(await page.locator(`${host} .action .lineup-steps`).isVisible());

      // Following the first prerequisite must shorten the route, not ask the
      // user to move their PG into an occupied slot or reverse prior moves.
      for (let completed = 0; completed < 4; completed += 1) {
        const from = POSITIONS[3 - completed];
        const to = POSITIONS[4 - completed];
        await page.evaluate(({ from, to, name }) => {
          const origin = document.querySelector(`[data-court-slot="${from}"]`);
          const target = document.querySelector(`[data-court-slot="${to}"]`);
          if (target.getAttribute("aria-label") !== to) throw new Error("Move destination is occupied");
          origin.setAttribute("aria-label", from);
          target.setAttribute("aria-label", `${to}: ${name}`);
        }, { from, to, name: names[3 - completed] });
        if (completed < 3) {
          await page.waitForFunction(count => document.querySelector("#__82coach_host__").shadowRoot
            .querySelectorAll(".action .lineup-steps li").length === count, 4 - completed);
          assert.deepEqual(await page.locator(`${host} .action .lineup-steps li`).allTextContents(),
            expected.slice(completed + 1));
        } else {
          await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
            .querySelector(".eyebrow")?.textContent === "PICK NOW");
          assert.ok((await page.locator(`${host} .primary`).textContent()).includes("Lenny Wilkens"));
          assert.equal(await page.locator(`${host} .primary .position`).textContent(), "PG");
          assert.equal(await page.locator(`${host} .lineup-steps`).count(), 0);
        }
      }
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("Lineup browser tests passed across Classic, Hoop IQ, and 1v1: four-step prerequisites, free/purchase fallbacks, visible numbered moves, and route progression.");
  } finally { await browser.close(); }
}
main().catch(e => { console.error(e); process.exitCode = 1; });
