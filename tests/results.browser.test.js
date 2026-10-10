"use strict";

// Local result fixtures; no real games or external requests are made.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const script = fs.readFileSync(path.join(__dirname, "../82-0-advisor.user.js"), "utf8");
const host = "#__82coach_host__";
const historyKey = "__82coach_results_v1__";
const resultCard = (ready = false) => `<div data-classic-result ${ready ? "data-buttons" : ""}>
  <p class="classic-result-record"><span class="classic-result-wins">68</span><span> - </span><span class="classic-result-losses">13</span></p>
  <p class="classic-result-verdict"><span class="classic-result-pts">95 </span><span>pts </span><span>A DYNASTY</span></p>
</div>`;

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    for (const mode of ["classic", "hoopiq", "1v1"]) {
      const context = await browser.newContext();
      const errors = [];
      let payload = { score: 94.5, score_display: { values: { wins: 69, losses: 13 } } };
      let markup = `<p>100 pts</p>${resultCard()}`;
      await context.route("**/*", route => {
        const url = route.request().url();
        if (!url.startsWith("https://www.82-0.com/")) return route.abort();
        if (url.endsWith("/session/start")) return route.fulfill({ json: {
          session_id: `result-${mode}`, slots: [],
          ...(mode === "1v1" ? { opponent: { score: 94.6, roster: [] } } : {}),
        } });
        if (url.endsWith("/session/submit")) return route.fulfill({ json: payload });
        return route.fulfill({ contentType: "text/html; charset=utf-8", body: `<!doctype html><body>
          <header>82-0 <span>100 coins</span></header>${markup}<button>Draft Again</button>
        </body>` });
      });
      async function openResult() {
        const page = await context.newPage();
        page.setDefaultTimeout(8_000);
        page.on("pageerror", error => errors.push(error.message));
        await page.addInitScript({ content: script });
        await page.goto(`https://www.82-0.com/draft?mode=${mode}`);
        await page.evaluate(async key => {
          localStorage.removeItem(key);
          await fetch("/game-session/api/v4/session/start");
          await new Promise(resolve => setTimeout(resolve, 40));
          await fetch("/game-session/api/v4/session/submit");
          await new Promise(resolve => setTimeout(resolve, 40));
        }, historyKey);
        return page;
      }
      const history = page => page.evaluate(key => JSON.parse(localStorage.getItem(key) || "[]"), historyKey);
      async function expectResult(page, wins, losses, score) {
        try {
          await page.waitForFunction(({ key, wins, losses, score }) => {
            const entries = JSON.parse(localStorage.getItem(key) || "[]");
            return entries.length === 1 && entries[0].wins === wins &&
              entries[0].losses === losses && entries[0].score === score;
          }, { key: historyKey, wins, losses, score });
        } catch (error) {
          console.error(mode, { expected: { wins, losses, score }, history: await history(page),
            panel: await page.locator(`${host} #content`).textContent(),
            section: await page.locator("section").allInnerTexts() });
          throw error;
        }
        if (mode !== "1v1") {
          await page.waitForFunction(expected => document.querySelector("#__82coach_host__")?.shadowRoot
            .querySelector(".primary .name")?.textContent === expected,
          `${wins}-${losses} · ${Number.isFinite(score) ? "95.0" : "—"}`);
        }
      }

      const page = await openResult();
      await page.waitForFunction(() => document.querySelector("#__82coach_host__")?.shadowRoot
        .querySelector("#content")?.textContent.includes("Waiting for 82-0's final record"));
      assert.deepEqual(await history(page), [], "animated counters must not enter history");
      // Only an attribute changes: the numeric counters already show their
      // finished values. This must wake the result reader without a timer.
      await page.evaluate(() => document.querySelector("[data-classic-result]").setAttribute("data-buttons", ""));
      await expectResult(page, 68, 13, 94.5);
      assert.ok(!(await page.locator(`${host} #content`).textContent()).includes("score checked"));
      if (mode === "1v1") {
        assert.equal(await page.locator(`${host} .primary .name`).textContent(), "94.5 · 94.6");
        assert.ok((await page.locator(`${host} .status`).textContent()).includes("1v1 lost"),
          "rounded page score must not flip a close matchup");
      }
      const timestamp = (await history(page))[0].at;
      await page.evaluate(() => document.querySelector(".classic-result-losses").textContent = "12");
      await expectResult(page, 68, 12, 94.5);
      assert.equal((await history(page))[0].at, timestamp, "correction must retain the original game timestamp");
      await page.close();

      // API first, then hydrated visible card: correct, don't duplicate, the
      // same session's history. The site display takes precedence over API.
      markup = "";
      const apiFirst = await openResult();
      await apiFirst.waitForFunction(key => JSON.parse(localStorage.getItem(key) || "[]")[0]?.wins === 69, historyKey);
      await apiFirst.evaluate(html => document.body.insertAdjacentHTML("afterbegin", html), resultCard(true));
      await expectResult(apiFirst, 68, 13, 94.5);
      await apiFirst.close();

      // Preserve an official 81-game record as supplied instead of deriving
      // another win/loss or substituting the legacy conversion curve.
      payload = { score: null, score_display: { values: { wins: 68, losses: 13 } } };
      const nullScore = await openResult();
      await expectResult(nullScore, 68, 13, null);
      await nullScore.close();

      // Older labeled result screens still work, including whole-token pts.
      markup = '<section><p>Projected Record</p><p>68–13</p><span>95 pts</span></section>';
      const legacy = await openResult();
      await expectResult(legacy, 68, 13, 95);
      await legacy.close();

      markup = "";
      payload = { score: 95, score_display: { values: { wins: null, losses: 13 } } };
      const incomplete = await openResult();
      await incomplete.waitForFunction(() => document.querySelector("#__82coach_host__")?.shadowRoot
        .querySelector("#content")?.textContent.includes("Waiting for 82-0's final record"));
      assert.deepEqual(await history(incomplete), [], "a missing win counter is not zero wins");
      await incomplete.close();
      assert.deepEqual(errors, []);
      await context.close();
    }
    console.log("Result browser tests passed: all modes, settled counters, page/API precedence, score rounding, precise 1v1 verdict, null score, history correction, legacy cards.");
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
