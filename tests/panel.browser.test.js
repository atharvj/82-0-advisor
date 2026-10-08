"use strict";

// Optional browser regression. Install Playwright, or set PLAYWRIGHT_MODULE to
// the path of an existing Playwright installation. Uses only local fixtures.
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE || "playwright");
const { POSITIONS } = require("../82-0-advisor.user.js");
const script = fs.readFileSync(path.join(__dirname, "../82-0-advisor.user.js"), "utf8");
const hostSelector = "#__82coach_host__";

async function main() {
  const browser = await chromium.launch({ headless: true });
  try {
    const context = await browser.newContext({ viewport: { width: 1000, height: 760 } });
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    const players = POSITIONS.map((pos, index) => ({ name: `Test ${pos}`, player_id: index + 1,
      team_id: "TEST", era: "2000s", positions: [pos],
      stats: { ppg: 25 + index, rpg: 6 + index, apg: 7 - index, spg: 1, bpg: 1 } }));
    const occupied = { PG: "Test PG", SG: "Test SG", C: "Test C" };
    const fixture = `<!doctype html><body>
      <button id="site-button" onclick="this.textContent='Still clickable'">Site button</button>
      ${POSITIONS.map((pos) => `<button data-track-name="draft_slot_place" aria-label="${pos}${occupied[pos] ? `: ${occupied[pos]}` : ""}"><div data-slot-figure></div>${pos}</button>`).join("")}
      <section>${players.map((p) => `<div data-testid="player-card" data-player="${p.name}"><p>${p.name}</p></div>`).join("")}</section>
      <button data-track-name="draft_skip_team">TEAM</button><button data-track-name="draft_skip_era">ERA</button>
    </body>`;
    await context.route("https://www.82-0.com/**", (route) => {
      const url = route.request().url();
      if (url.endsWith("/session/start")) return route.fulfill({ json: { session_id: "test-session", slots: [] } });
      if (url.endsWith("/session/spin")) return route.fulfill({ json: { cell: {
        seq: 1, team: { team_id: "TEST", abbr: "TST" }, era: "2000s", squad: players,
      } } });
      return route.fulfill({ contentType: "text/html", body: fixture });
    });
    await context.addInitScript(() => {
      const NativeWorker = window.Worker;
      window.workerStats = { created: 0, terminated: 0, ticks: 0 };
      window.Worker = class extends NativeWorker {
        constructor(...args) { super(...args); window.workerStats.created += 1; }
        terminate() { window.workerStats.terminated += 1; return super.terminate(); }
        // Keep the completed response in flight long enough to test stale-job
        // cancellation and interaction. The actual calculation is unmodified.
        set onmessage(callback) { super.onmessage = (event) => setTimeout(() => callback(event), 400); }
      };
      setInterval(() => { window.workerStats.ticks += 1; }, 10);
    });
    await page.addInitScript({ content: script });
    await page.goto("https://www.82-0.com/draft?mode=classic");
    const host = page.locator(hostSelector);
    const card = host.locator("#card");
    const content = host.locator("#content");
    await host.waitFor();
    await page.evaluate(async () => {
      await fetch("/game-session/api/v4/session/start");
      await new Promise((resolve) => setTimeout(resolve, 40));
      await fetch("/game-session/api/v4/session/spin");
    });
    await page.waitForFunction(() => document.querySelector("#__82coach_host__").shadowRoot
      .querySelector("#content").textContent.includes("Analyzing the roll"));
    const ticks = await page.evaluate(() => window.workerStats.ticks);
    await page.locator("#site-button").click();
    assert.equal(await page.locator("#site-button").textContent(), "Still clickable");
    // Power off while the result is in flight; a stale completion must not revive advice.
    await host.locator("#power").click();
    await page.waitForTimeout(600);
    assert.ok((await card.getAttribute("class")).includes("disabled"));
    assert.ok((await page.evaluate(() => window.workerStats.ticks)) > ticks + 10);
    assert.equal(await page.evaluate(() => window.workerStats.created),
      await page.evaluate(() => window.workerStats.terminated));
    await host.locator("#power").click();
    await host.locator(".eyebrow").waitFor();
    assert.ok(!(await content.textContent()).includes("Could not analyze"));
    const initialAction = await host.locator(".primary").textContent();
    assert.equal(await page.evaluate(() => window.workerStats.created),
      await page.evaluate(() => window.workerStats.terminated));

    const title = await host.locator(".title").boundingBox();
    await page.mouse.move(title.x + 20, title.y + 5);
    await page.mouse.down();
    await page.mouse.move(140, 110, { steps: 8 });
    await page.mouse.up();
    const dragged = await host.boundingBox();
    assert.ok(dragged.x < 250 && dragged.y < 200);
    assert.ok(await page.evaluate(() => JSON.parse(localStorage.getItem("__82coach_ui_v1__")).position));
    await page.setViewportSize({ width: 240, height: 220 });
    await page.waitForTimeout(100);
    const clamped = await host.boundingBox();
    assert.ok(clamped.x >= 0 && clamped.x < 15 && clamped.y >= 0);
    await page.setViewportSize({ width: 1000, height: 760 });
    await host.locator("#home").click();
    const docked = await host.boundingBox();
    assert.ok(Math.abs(docked.x + docked.width - 990) < 1);
    assert.ok(Math.abs(docked.y + docked.height - 748) < 1);
    assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem("__82coach_ui_v1__")).position), null);

    const popupEvent = page.waitForEvent("popup");
    await host.locator("#popout").click();
    const popup = await popupEvent;
    await popup.waitForLoadState();
    const popupContent = popup.locator("#content");
    assert.equal(await popupContent.textContent(), await content.textContent());
    assert.ok((await card.getAttribute("class")).includes("detached"));
    await popup.locator("#details-toggle").click();
    await popup.locator(".details").waitFor();
    assert.equal(await popupContent.textContent(), await content.textContent());
    await popup.locator("#power").click();
    assert.ok((await card.getAttribute("class")).includes("disabled"));
    await popup.locator("#power").click();
    await popup.locator("#home").click();
    await page.waitForFunction(() => !document.querySelector("#__82coach_host__").shadowRoot
      .querySelector("#card").classList.contains("detached"));
    assert.ok(popup.isClosed());
    const secondPopupEvent = page.waitForEvent("popup");
    await host.locator("#popout").click();
    const secondPopup = await secondPopupEvent;
    await secondPopup.close();
    await page.waitForFunction(() => !document.querySelector("#__82coach_host__").shadowRoot
      .querySelector("#card").classList.contains("detached"));
    await page.evaluate(() => { window.open = () => null; });
    await host.locator("#popout").click();
    assert.ok((await host.locator("#window-note").textContent()).includes("Allow pop-ups"));
    assert.ok(await host.locator(".eyebrow").isVisible());
    assert.deepEqual(errors, []);

    const fallbackPage = await context.newPage();
    await fallbackPage.addInitScript(() => {
      window.Worker = class { constructor() { throw new Error("Workers blocked by browser policy"); } };
    });
    await fallbackPage.addInitScript({ content: script });
    await fallbackPage.goto("https://www.82-0.com/draft?mode=classic");
    await fallbackPage.evaluate(async () => {
      await fetch("/game-session/api/v4/session/start");
      await new Promise((resolve) => setTimeout(resolve, 40));
      await fetch("/game-session/api/v4/session/spin");
    });
    await fallbackPage.locator(`${hostSelector} .eyebrow`).waitFor();
    assert.equal(await fallbackPage.locator(`${hostSelector} .primary`).textContent(), initialAction,
      "blocked-worker fallback must give the same full-model recommendation");
    console.log("Browser tests passed: worker responsiveness/cancellation/fallback, drag/clamp/reset, popup sync/dock/close/block.");
  } finally { await browser.close(); }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
