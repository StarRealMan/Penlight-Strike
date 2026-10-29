// Viewport and presentation state. Gameplay coordinates stay in CSS pixels.
(() => {
  let active = false;
  let presentationRequested = false;
  let pendingEntry = null;
  let orientationLocked = false;
  let lockAttempt = 0;
  let pendingLock = null;
  let generation = 0;
  let wasFullscreen = false;
  let previousWidth = window.innerWidth;
  let previousHeight = window.innerHeight;

  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

  function update(interrupted = false) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    window.dispatchEvent(new CustomEvent('game-display-change', {
      detail: { width, height, previousWidth, previousHeight, interrupted }
    }));
    previousWidth = width;
    previousHeight = height;
  }

  function unlock() {
    try { window.screen.orientation?.unlock?.(); } catch (_) { /* Unsupported browser. */ }
  }

  function lockLandscape() {
    if (!presentationRequested || !isTouchDevice() || !window.screen.orientation?.lock) return;
    if (orientationLocked && window.innerWidth > window.innerHeight) return;
    if (pendingLock) return;
    const attempt = ++lockAttempt;
    pendingLock = attempt;
    const timeout = setTimeout(() => { if (pendingLock === attempt) pendingLock = null; }, 1500);
    const complete = () => {
      clearTimeout(timeout);
      if (pendingLock === attempt) pendingLock = null;
    };
    try {
      Promise.resolve(window.screen.orientation.lock('landscape')).then(() => {
        if (attempt !== lockAttempt) return;
        if (!presentationRequested) unlock();
        else orientationLocked = true;
      }, () => { if (attempt === lockAttempt) orientationLocked = false; }).finally(complete);
    } catch (_) { orientationLocked = false; complete(); }
  }

  function enter() {
    presentationRequested = true;
    if (isFullscreen()) {
      lockLandscape();
      return Promise.resolve();
    }
    if (pendingEntry) return pendingEntry;
    const currentGeneration = generation;
    const root = document.documentElement;
    let request;
    try {
      // Must run directly in the click/touchend handler, before any await.
      request = root.requestFullscreen ? root.requestFullscreen() : root.webkitRequestFullscreen?.();
    } catch (_) { return Promise.resolve(); }
    // A stalled browser request must not suppress every subsequent user gesture.
    const entry = Promise.resolve(request).then(() => {
      if (currentGeneration !== generation) {
        if (!presentationRequested && isFullscreen()) return exit();
        return;
      }
      lockLandscape();
      update();
    }, () => {});
    pendingEntry = entry;
    const timeout = setTimeout(() => { if (pendingEntry === entry) pendingEntry = null; }, 1500);
    entry.finally(() => {
      clearTimeout(timeout);
      if (pendingEntry === entry) pendingEntry = null;
    });
    return entry;
  }

  async function exit() {
    active = false;
    presentationRequested = false;
    generation++;
    pendingEntry = null;
    orientationLocked = false;
    lockAttempt++;
    pendingLock = null;
    unlock();
    update();
    try {
      if (isFullscreen()) {
        if (document.exitFullscreen) await document.exitFullscreen();
        else if (document.webkitExitFullscreen) await document.webkitExitFullscreen();
      }
    } catch (_) { /* The browser may have already exited fullscreen. */ }
  }

  function setActive(value) {
    active = value;
    // Presentation belongs to the whole site, independently of gameplay.
    update();
  }

  document.addEventListener('DOMContentLoaded', () => {
    update();
    window.addEventListener('resize', () => update());
    window.visualViewport?.addEventListener('resize', () => update());
    window.screen.orientation?.addEventListener('change', () => update());
    const fullscreenChanged = () => {
      const fullscreen = isFullscreen();
      const interrupted = active && wasFullscreen && !fullscreen;
      if (wasFullscreen && !fullscreen) {
        generation++;
        pendingEntry = null;
        orientationLocked = false;
        lockAttempt++;
        pendingLock = null;
        unlock();
      }
      if (fullscreen) { pendingEntry = null; lockLandscape(); }
      wasFullscreen = fullscreen;
      update(interrupted);
    };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    document.addEventListener('webkitfullscreenchange', fullscreenChanged);
    document.addEventListener('visibilitychange', () => {
      if (active && document.hidden) update(true);
    });
    // Mobile browsers may release fullscreen/rotation when backgrounded. Retry on
    // the next real gesture anywhere in the site, not only when starting a song.
    const restorePresentation = () => {
      if (presentationRequested && isTouchDevice() &&
          (!isFullscreen() || !orientationLocked || window.innerHeight > window.innerWidth)) enter();
    };
    document.addEventListener('touchend', restorePresentation, { passive: true });
    document.addEventListener('click', restorePresentation);
    window.addEventListener('pageshow', () => {
      generation++;
      lockAttempt++;
      pendingLock = null;
      pendingEntry = null;
      orientationLocked = false;
      update();
    });
  });

  window.GameDisplay = { enter, exit, isFullscreen, setActive, update, isActive: () => active };
  window.FullscreenManager = window.GameDisplay;
})();
