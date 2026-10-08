# 82-0 Perfect Team Coach

A userscript for [82-0](https://82-0.com/) that recommends the best player, exact position, lineup moves, and retries in Classic, Hoop IQ, and 1v1.

## Install

1. Install Tampermonkey or Violentmonkey.
2. Create a new userscript and paste in [`82-0-advisor.user.js`](./82-0-advisor.user.js).
3. Save it, refresh 82-0, and start a new game.

Version 2.4.0 supports the October 2026 API v4 update. The site removed the downloadable player pool, changed player identities, and now returns the current team's players directly with each roll. The coach reads those responses and immediately suggests a legal player and position. It waits on the home screen without a dataset timeout.

On v4, early picks use weighted stat production and legal placement. The last pick maximizes the calculated completed-team score. The full future pool is unavailable, so the panel does not claim a predicted final record, sampled win chance, optimal Team/Era retry, or proof that 82-0 is impossible. Older dataset-based sites still use the previous rollout optimizer.

Hoop IQ now omits stats from its server responses. The coach saves stats encountered in Classic locally in your browser and uses them for matching Hoop IQ player/team/era cards. Unknown stats are clearly reported; a recommendation based on only part of an offer is labeled accordingly. No player data or history is uploaded.

The coach is advisory only and panel-only: it reads the draft state but never outlines, relabels, disables, or otherwise modifies the website's player cards, positions, and retry buttons. All instructions appear in the side panel. Use the `⏻` button in its header to turn the coach off for as many games as you want; the small **Coach off** pill remains available to turn it back on.

When a pick needs multiple lineup moves, the coach routes every move through the currently empty position and shows the rest of the sequence under the first instruction. It never begins with an occupied-position swap that can reverse on the next scan.

Current v4 recommendations use the live offer directly and do not wait for a missing dataset. On older sites, animated dots beside **Analyzing the roll** show that the bounded rollout calculation is running.

In 1v1, the coach shows the bot's target score when supplied by the session. On older dataset-based sites it optimizes sampled probability of beating that bot. On v4 it recommends from the live offer; the final panel compares the two scores when available.

At the time of verification, the website's 1v1 button opened an app-download prompt. Userscripts run in the browser and cannot run inside the native app.

Every live recommendation is restricted to the exact player squad returned by the server for that roll. In 1v1, bot-owned player IDs are also removed from future-roll and retry forecasts, so the coach never recommends a historical team/era player who is not actually available in the match.

Forecast records are expected values used for planning. Because 82-0's returned result is authoritative, the coach reads and displays the result shown by the site on the final screen. It also stores up to 100 anonymous results locally in the browser and shows the current version's average and best result, making strategy changes measurable without uploading any history.

## Guide

- Green panel: pick this player
- Blue panel: make the displayed position move
- Orange panel: Team retry
- Purple panel: Era retry
- Red panel: 82-0 is impossible; the coach still shows the highest-scoring route

Open **Why this choice?** to see the current ceiling and retry forecasts. Press `Alt+A` to hide or restore the coach.
