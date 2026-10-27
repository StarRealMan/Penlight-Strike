# Regression checks

Run from the repository root with Node.js 18 or later (no dependencies required):

```sh
node --test tests/game-regressions.test.cjs
```

The suite executes the game scripts in isolated VM contexts with fake DOM,
player callbacks, animation frames, and timers. It covers session cancellation,
normal and failed completion, note scoring and combos, Kalman prediction timing,
and camera capture/worker cleanup including rejected, stalled, and late results.

These checks do not replace browser testing with TextAlive playback and a real
camera. Before release, smoke-test exit/restart, song completion, and repeated
camera-mode entry/exit on the target desktop and mobile browsers.
