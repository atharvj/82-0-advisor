# 82-0 Perfect Team Coach

A userscript for [82-0](https://82-0.com/) that recommends the best player, exact position, lineup moves, and retries in Classic, Hoop IQ, and 1v1.

## Install

1. Install Tampermonkey or Violentmonkey.
2. Create a new userscript and paste in [`82-0-advisor.user.js`](./82-0-advisor.user.js).
3. Save it, refresh 82-0, and start a new game.

The current site deals future rolls from its server and no longer exposes them in advance. The coach exactly optimizes the visible pool, position assignment, and lineup moves, then evaluates Team/Era retries against balanced samples of the era-first roll distribution. It keeps recalculating after every server-dealt roll because unrevealed future rolls cannot be known at the start anymore.

Forecasts simulate the decision the coach could actually make when each future roll becomes visible; they do not select future players with hindsight. Every serious current action is compared, and simulated future picks use a real-dataset-tested blend of accumulated team score and positional ceiling. A sampled 82-0 advantage overrides expected score only when it is large enough to be statistically meaningful. The value of preserving unused retries is carried through the remaining rounds.

The coach is advisory only and panel-only: it reads the draft state but never outlines, relabels, disables, or otherwise modifies the website's player cards, positions, and retry buttons. All instructions appear in the side panel. Use the `⏻` button in its header to turn the coach off for as many games as you want; the small **Coach off** pill remains available to turn it back on.

When a pick needs multiple lineup moves, the coach routes every move through the currently empty position and shows the rest of the sequence under the first instruction. It never begins with an occupied-position swap that can reverse on the next scan.

The animated dots beside **Analyzing the roll** show that a calculation is still running. Classic and Hoop IQ use 28 balanced future scenarios. 1v1 uses 14 timer-safe scenarios and compares 18 serious current actions. Future pools are reduced to statistically strong finalists before expensive ceiling checks, and every analysis stage has a hard time budget so the panel always returns advice. Team and Era retry recommendations are written clearly in the panel while the site's controls remain untouched.

In 1v1, the site supplies the bot's completed score with the match session and decides the verdict by comparing the two raw scores. The coach now captures that target, shows it in the panel, and optimizes sampled probability of beating that specific bot instead of chasing the unrelated 82-0 threshold. Expected score breaks statistically uncertain ties. The final panel reports the actual score-versus-score matchup and also verifies the coach's score model against the site's returned user score.

Every live recommendation is restricted to the exact player squad returned by the server for that roll. In 1v1, bot-owned player IDs are also removed from future-roll and retry forecasts, so the coach never recommends a historical team/era player who is not actually available in the match.

Forecast records are expected values used for planning. Because 82-0's returned result is authoritative, the coach reads and displays the result shown by the site on the final screen. It also stores up to 100 anonymous results locally in the browser and shows the current version's average and best result, making strategy changes measurable without uploading any history.

## Guide

- Green panel: pick this player
- Blue panel: make the displayed position move
- Orange panel: Team retry
- Purple panel: Era retry
- Red panel: 82-0 is impossible; the coach still shows the highest-scoring route

Open **Why this choice?** to see the current ceiling and retry forecasts. Press `Alt+A` to hide or restore the coach.
