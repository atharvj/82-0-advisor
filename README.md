# 82-0 Perfect Team Coach

A userscript for [82-0](https://82-0.com/) that recommends the best player, exact position, lineup moves, and retries in Classic, Hoop IQ, and 1v1.

## Install

1. Install Tampermonkey or Violentmonkey.
2. Create a new userscript and paste in [`82-0-advisor.user.js`](./82-0-advisor.user.js).
3. Save it, refresh 82-0, and start a new game.

The current site deals future rolls from its server and no longer exposes them in advance. The coach exactly optimizes the visible pool, position assignment, and lineup moves, then evaluates Team/Era retries against the era-first roll distribution. It keeps recalculating after every server-dealt roll because unrevealed future rolls cannot be known at the start anymore. Its main goal is the highest sampled chance of reaching 82-0, with expected score used as the tiebreaker.

The coach is advisory only: it highlights recommendations without blocking any player, position, or retry button. Use the `⏻` button in its header to turn the coach off for as many games as you want; the small **Coach off** pill remains available to turn it back on.

The animated dots beside **Analyzing the roll** show that a calculation is still running. 1v1 uses a shorter forecast so advice arrives before the turn timer expires. If Team or Era retry is the recommendation, the original retry button keeps its text and gets a prominent border/glow; the fallback player is not highlighted.

Forecast records are expected values used for planning. Because 82-0's returned result is authoritative, the coach reads and displays the result shown by the site on the final screen.

## Guide

- Green: pick this player
- Blue: use this position or make this move
- Orange: Team retry
- Purple: Era retry
- Red: 82-0 is impossible; the coach still shows the highest-scoring route

Open **Why this choice?** to see the current ceiling and retry forecasts. Press `Alt+A` to hide or restore the coach.
