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

Song loading checks cover rejected/empty responses, return-to-selection when
stopping fails, clearing errors on a new attempt, and ignoring late ready/error
events after exit. TextAlive is pinned to 0.4.0 because the unversioned CDN moved
to a card-resolver flow whose endpoint currently redirects instead of returning
the expected JSON. Before upgrading, verify all six configured Piapro songs and
their explicit analysis/lyric IDs in a browser. The mocked suite does not confirm
live audio playback or upstream availability.

## Responsive presentation

The same suite also checks fullscreen-before-lock ordering, denied APIs,
portrait-start gating, manual resume after rotation, fullscreen exit pausing,
late timer events, and note coordinates at nine viewport sizes. These are mocked
API/geometry checks, not claims of native browser or CSS rendering coverage.

Manual browser matrix: 320×568, 568×320, 390×844, 844×390, 768×1024,
1024×768, 1366×768, 1920×1080, and 2560×1080. Inspect welcome, selection,
tutorial, gameplay, pause and results. Menus must scroll without clipping their
controls; the piano, HUD and notes must stay aligned in gameplay. Test mobile
browser bars, safe-area insets, desktop resizing and touch taps as well as drags.

On a touch device, starting requests document fullscreen, then landscape lock.
When either API is denied or unavailable, the game remains usable in the browser;
portrait gameplay waits behind a rotate prompt. Rotate, then press Continue.
Exiting fullscreen or hiding the tab pauses gameplay. Returning to selection
unlocks orientation. Embedded hosts must allow fullscreen and orientation locking;
the application cannot override host/browser restrictions.
