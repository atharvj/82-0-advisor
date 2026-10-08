# 82-0 Perfect Team Coach

A userscript for [82-0](https://82-0.com/) that recommends the best player, exact position, lineup moves, and retries in Classic, Hoop IQ, and 1v1.

## Install

1. Install Tampermonkey or Violentmonkey.
2. Create a new userscript and paste in [`82-0-advisor.user.js`](./82-0-advisor.user.js).
3. Save it, refresh 82-0, and start a new game.

Version 2.7.0 moves the live planner to a **background worker without reducing the search or changing its recommendations**, and adds a draggable panel and synced pop-out window. It still prioritizes **final team score with full roster-position flexibility** on the October 2026 API v4 site. Jersey initials such as Paul George's “PG” are not mistaken for his court position. Occupied jerseys remain tracked when selecting a player turns them into non-interactive elements, and advice is validated against the current lineup before displaying a pick.

On v4, a finite-horizon dynamic program compares picking now, rerolling Team, and rerolling Era. Its state retains every legal occupied-position arrangement for the selected players, including hypothetical future selections. A PG/SG placed at PG therefore does not permanently block a future PG: the planner knows that player can move to SG. Future-roll estimates start with 69 anonymously observed team/era pools and incorporate Classic stats saved in your browser. Sparse Team/Era samples are smoothed toward the overall sample to limit overconfidence.

With two picks remaining, the planner evaluates completed five-player scores directly over sampled future offers, including exact recorded-defense normalization and excluding the current incoming player's name from the last offer. The last pick maximizes the calculated completed-team score across players who can fit after legal rearrangement. Early-round forecasts still approximate defensive-stat counts and hypothetical future player-name collisions.

These are **sample-based recommendations, not guaranteed optimal choices or guaranteed 82-0 runs**. The server hides future offers and the full current database, and its score-to-record conversion changed on v4. The coach therefore does not invent final-win forecasts or claim to prove 82-0 is impossible on v4. Actual picks remain restricted to the live offer. Older dataset-based sites retain the previous optimizer.

Hoop IQ now omits stats from its server responses. The coach saves stats encountered in Classic locally in your browser and uses them for matching Hoop IQ player/team/era cards. Unknown stats are clearly reported; a recommendation based on only part of an offer is labeled accordingly. No player data or history is uploaded.

The coach is advisory only and panel-only: it reads the draft state but never outlines, relabels, disables, or otherwise modifies the website's player cards, positions, and retry buttons. All instructions appear in the side panel. Use the `⏻` button in its header to turn the coach off for as many games as you want; the small **Coach off** pill remains available to turn it back on.

When a pick needs multiple lineup moves, the coach routes every move through a currently empty position and shows the rest of the sequence under the first instruction. It never begins with an occupied-position swap. Following each instruction shortens the route to the same incoming player. A move no longer requires the incoming player to outscore the incumbent: improving the complete team is the priority. Equal-score routes prefer fewer moves and natural positions that reduce later reshuffling.

Current v4 recommendations use the live offer directly and do not wait for a missing dataset. The live planner runs off the page's main thread, including the heavier exact two-pick scoring, so the site remains responsive while analyzing. It uses the same planner code, pools, scoring, and tie-breaks as the previous synchronous implementation—no shortened calculation, reduced samples, or weaker interim picks. Obsolete calculations are cancelled when the roll or lineup changes, the game finishes, or the coach is turned off. If the browser blocks workers, the coach falls back to the unchanged full calculation; that fallback can still pause the page. Animated dots beside **Analyzing the roll** indicate a pending calculation.

Drag the coach by its header to reposition it within the page; the position is remembered locally and kept on screen when resizing. Click **↗** to open a separate synced coach window, then drag that window's native title bar onto another monitor. Allow pop-ups for 82-0 if prompted. Click **↩** in either window to dock the coach back in its default corner. Closing the separate window restores the page panel automatically. Keep the game tab open: it supplies the live state and runs the calculations, and closing or navigating away from it closes the coach window. These controls only affect the coach, never the site's cards or buttons.

In 1v1, the coach shows the bot's target score when supplied by the session. On older dataset-based sites it optimizes sampled probability of beating that bot. On v4 it uses the score/position/retry planner; the final panel compares the two scores when available. It does not claim a guaranteed win.

At the time of verification, the website's 1v1 button opened an app-download prompt. Userscripts run in the browser and cannot run inside the native app.

Every live recommendation is restricted to the exact player squad returned by the server for that roll. In 1v1, known bot-owned players are excluded from planning samples when their identities can be matched. Historical planning samples never introduce a selectable player who is absent from the actual offer.

Forecast records are expected values used for planning. Because 82-0's returned result is authoritative, the coach reads and displays the result shown by the site on the final screen. It also stores up to 100 anonymous results locally in the browser and shows the current version's average and best result, making strategy changes measurable without uploading any history.

## Guide

- Green panel: pick this player
- Blue panel: make the displayed position move
- Orange panel: Team retry
- Purple panel: Era retry
- Red panel: final non-perfect result or lost matchup; older full-dataset versions also report impossible ceilings

Retry advice takes priority in the panel, in orange for Team and purple for Era. It never changes the website's button labels or blocks your picks, and it only recommends free retries on v4. Open **Why this choice?** for estimated retry gains and the planning sample count. Press `Alt+A` to hide or restore the coach.

## Validation

Run `node tests/core.test.js`, `node tests/live-worker.test.js`, and `node tests/live-planner.bench.js`. Tests compare compact roster eligibility with exhaustive assignment, exercise move-route progression, and check exact two-pick scoring and duplicate exclusion. Worker tests compare 61 full recommendations with the synchronous planner across all retry budgets and pick stages, and verify that the calling event loop keeps running. The benchmark compares greedy/no-retry, v2.5 fixed-slot planning, and v2.6/v2.7 flexible-roster planning across 500 paired simulated drafts from captured rolls. It is a regression test of the sampled model, **not a real-game win-rate claim**. Live Classic tests also verify selectable recommendations, position tracking, retries, and reading the site's final result.

Optional UI regression: with Playwright and its Chromium browser installed, run `node tests/panel.browser.test.js` (or set `PLAYWRIGHT_MODULE` to an existing Playwright module path). Local fixtures test background calculation, cancellation, blocked-worker fallback, dragging, viewport clamping, reset, pop-out syncing, docking, closing, and blocked pop-ups without making game API requests.
