"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { POSITIONS, buildReferenceStatsIndex, statContextKey } = require("../82-0-advisor.user.js");
const script = fs.readFileSync(path.join(__dirname, "../82-0-advisor.user.js"), "utf8");
const reference = buildReferenceStatsIndex();
const host = "#__82coach_host__";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ["hoopiq", "classic", "1v1"]) {
      const context = await browser.newContext();
      const page = await context.newPage();
      const errors = [];
      const requests = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => requests.push(request.url()));
      const offered = [
        ["Adonal Foyle", ["C"]], ["Alton Lister", ["C", "PF"]], ["Andre Spencer", ["SF"]],
        ["Andrew DeClercq", ["C"]], ["Antawn Jamison", ["PF", "SF"]],
        ["Avery Johnson", ["PG"]], ["B.J. Armstrong", ["PG"]], ["Billy Owens", ["PF", "SF", "SG"]],
      ].map(([name, positions], i) => ({ name, positions, player_id: `offered-${i}`, team_id: "349", era: "1990s" }));
      const picked = POSITIONS.slice(0, 3).map((position, i) => ({ name: `Already ${position}`,
        id: `picked-${i}|TEST|2000s`, player_id: `picked-${i}`, team_id: "TEST", team: "TST", era: "2000s",
        positions: [position], hasStats: true, statsSource: "live",
        stats: { ppg: 20, rpg: 5, apg: 3, spg: 1, bpg: 0.5 } }));
      let squad = offered;
      let seq = 0;
      await context.route("**/*", route => {
        const url = route.request().url();
        if (!url.startsWith("https://www.82-0.com/")) return route.abort();
        if (url.endsWith("/session/start")) return route.fulfill({ json: {
          session_id: `hidden-${mode}`, slots: [],
          ...(mode === "1v1" ? { opponent: { score: 100, roster: [] } } : {}),
        } });
        if (url.endsWith("/session/spin")) return route.fulfill({ json: { cell: {
          seq: ++seq, team: { team_id: "349", abbr: "GSW" }, era: "1990s", squad,
          boosters: { respin_team: { enabled: true, next_use: "free", free_left: 1 },
            respin_era: { enabled: true, next_use: "free", free_left: 1 } },
        } } });
        return route.fulfill({ contentType: "text/html", body: `<!doctype html><body>
          ${POSITIONS.map((pos, i) => `<button data-track-name="draft_slot_place"
            aria-label="${pos}${i < 3 ? `: Already ${pos}` : ""}"><div data-slot-figure></div>${pos}</button>`).join("")}
          <section>${offered.map(p => `<div data-testid="player-card" data-player="${p.name}" data-positions="${p.positions.join(",")}"><p>${p.name}</p></div>`).join("")}</section>
          <button data-track-name="draft_skip_team" disabled>TEAM</button><button data-track-name="draft_skip_era" disabled>ERA</button>
        </body>` });
      });
      await page.addInitScript(({ picked, script }) => {
        // No Classic cache exists for the offered GSW players.
        localStorage.setItem("__82coach_live_rows_v4__", JSON.stringify(picked));
        (0, eval)(script);
      }, { picked, script });
      await page.goto(`https://www.82-0.com/draft?mode=${mode}`);
      await page.evaluate(async () => {
        await fetch("/game-session/api/v4/session/start");
        await new Promise(resolve => setTimeout(resolve, 40));
        await fetch("/game-session/api/v4/session/spin");
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "PICK NOW");
      const action = await page.locator(`${host} .primary .name`).textContent();
      assert.ok(offered.some(p => p.name === action), "reference data must never invent a selectable player");
      assert.equal(await page.locator(`${host} .stats-reference`).textContent(), "Reference stats · 8 offered");
      assert.ok(!(await page.locator(`${host} #content`).textContent()).includes("unknown stats"));
      assert.ok(!(await page.locator(`${host} #content`).textContent()).includes("Player stats are hidden"));
      const saved = await page.evaluate(() => JSON.parse(localStorage.getItem("__82coach_live_rows_v4__")));
      assert.equal(saved.filter(p => p.statsSource === "reference").length, 8);
      assert.deepEqual(saved.find(p => p.name === "Antawn Jamison").stats,
        reference.get(statContextKey("Antawn Jamison", "GSW", "1990s")));
      assert.deepEqual(saved.find(p => p.name === "Antawn Jamison").positions, ["PF", "SF"]);

      // Recovered stats must also enable meaningful retry forecasts.
      await page.evaluate(() => {
        for (const button of document.querySelectorAll('button[data-track-name^="draft_skip_"]')) button.disabled = false;
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".eyebrow")?.textContent === "REROLL NOW");
      assert.ok((await page.locator(`${host} .retry-summary`).textContent()).includes("pts"));

      // Supply mock current-game stats with an obvious upgrade to prove the
      // reference is a fallback, not an authoritative override of the wire.
      squad = offered.map(p => ({ ...p, stats: p.name === "Antawn Jamison"
        ? { ppg: 40, rpg: 20, apg: 10, spg: 1.6, bpg: 1 }
        : reference.get(statContextKey(p.name, "GSW", "1990s")) }));
      await page.evaluate(async () => {
        for (const button of document.querySelectorAll('button[data-track-name^="draft_skip_"]')) button.disabled = true;
        await fetch("/game-session/api/v4/session/spin");
      });
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".primary .name")?.textContent === "Antawn Jamison");
      assert.equal(await page.locator(`${host} .stats-reference`).count(), 0);
      assert.ok((await page.locator(`${host} .action .sub`).textContent()).includes("40.0 PTS"));

      // Later hidden responses use the actual Classic observation, not the
      // older bundled number (9.6 PPG for this exact peak).
      squad = offered;
      await page.evaluate(() => fetch("/game-session/api/v4/session/spin"));
      await page.waitForFunction(() => {
        const saved = JSON.parse(localStorage.getItem("__82coach_live_rows_v4__"));
        return saved.find(p => p.name === "Antawn Jamison")?.statsSource === "cached";
      });
      assert.equal(await page.locator(`${host} .stats-reference`).count(), 0);
      assert.ok((await page.locator(`${host} .action .sub`).textContent()).includes("40.0 PTS"));

      // A genuinely new unmatched player remains unknown, never zero-valued.
      squad = [...offered, { name: "Not in the catalog", player_id: "new-player", team_id: "349", era: "1990s", positions: ["PF"] }];
      await page.evaluate(() => fetch("/game-session/api/v4/session/spin"));
      await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
        .querySelector(".filter-hint")?.textContent.includes("1 offered player has unknown stats"));
      assert.equal(await page.locator(`${host} .outlook`).getAttribute("data-state"), "uncertain");
      assert.ok(!(await page.locator(`${host} .primary`).textContent()).includes("Not in the catalog"));
      assert.ok(requests.every(url => url.startsWith("https://www.82-0.com/")), "no third-party stats fetches or hidden Classic games");
      assert.equal(requests.filter(url => url.endsWith("/session/start")).length, 1);
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("Hoop IQ stats browser tests passed across all modes: bundled recovery without warm-up, legal offer restriction, retry forecasts, source labels, live/cache precedence, unknown-player safety, and no external requests.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
