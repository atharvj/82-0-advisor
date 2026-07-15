# 82-0 Perfect Team Coach

A userscript for [82-0](https://82-0.com/) that recommends the best player, exact position, lineup moves, and retries in Classic, Hoop IQ, and 1v1.

## Install

1. Install Tampermonkey or Violentmonkey.
2. Create a new userscript and paste in [`82-0-advisor.user.js`](./82-0-advisor.user.js).
3. Save it, refresh 82-0, and start a new game.

Starting a new game lets the coach read that game's seed and calculate the exact best remaining route.

## Guide

- Green: pick this player
- Blue: use this position or make this move
- Orange: Team retry
- Purple: Era retry
- Red: 82-0 is impossible; the coach still shows the highest-scoring route

Open **Why this choice?** to see the exact maximum, retry forecasts, and planned remaining route. Press `Alt+A` to hide or restore the coach.

## Test

```bash
node tests/core.test.js
```
