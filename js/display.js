// Viewport and presentation state. Gameplay coordinates stay in CSS pixels.
(() => {
  let active = false;
  let generation = 0;
  let wasFullscreen = false;
  let previousWidth = window.innerWidth;
  let previousHeight = window.innerHeight;

  const isFullscreen = () => !!(document.fullscreenElement || document.webkitFullscreenElement);
  const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;
  const needsLandscape = () => active && isTouchDevice() && window.innerHeight > window.innerWidth;

  function update(interrupted = false) {
    const width = window.innerWidth;
    const height = window.innerHeight;
    document.documentElement.style.setProperty('--app-height', `${height}px`);
    const prompt = document.getElementById('orientation-prompt');
    if (prompt) prompt.hidden = !needsLandscape();
    window.dispatchEvent(new CustomEvent('game-display-change', {
      detail: { width, height, previousWidth, previousHeight, blocked: needsLandscape(), interrupted }
    }));
    previousWidth = width;
    previousHeight = height;
  }

  function unlock() {
    try { window.screen.orientation?.unlock?.(); } catch (_) { /* Unsupported browser. */ }
  }

  async function enter() {
    const currentGeneration = generation;
    try {
      if (!isFullscreen()) {
        const root = document.documentElement;
        // This call must occur synchronously in the user's click handler.
        if (root.requestFullscreen) await root.requestFullscreen();
        else if (root.webkitRequestFullscreen) await root.webkitRequestFullscreen();
      }
    } catch (_) { /* Keep playing in the browser viewport when fullscreen is denied. */ }
    if (currentGeneration !== generation || !active) {
      if (!active) await exit();
      return;
    }
    if (isTouchDevice() && window.screen.orientation?.lock) {
      try {
        await window.screen.orientation.lock('landscape');
        if (!active) unlock();
      } catch (_) { /* The rotate prompt is the fallback for unavailable orientation locking. */ }
    }
    update();
  }

  async function exit() {
    active = false;
    generation++;
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
    generation++;
    if (!value) unlock();
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
      wasFullscreen = fullscreen;
      update(interrupted);
    };
    document.addEventListener('fullscreenchange', fullscreenChanged);
    document.addEventListener('webkitfullscreenchange', fullscreenChanged);
    document.addEventListener('visibilitychange', () => {
      if (active && document.hidden) update(true);
    });
    document.getElementById('orientation-retry')?.addEventListener('click', enter);
    document.getElementById('orientation-exit')?.addEventListener('click', () => window.Player.exitGame());
    document.getElementById('fullscreen-btn')?.addEventListener('click', enter);
  });

  window.GameDisplay = { enter, exit, isFullscreen, needsLandscape, setActive, update, isActive: () => active };
  window.FullscreenManager = window.GameDisplay;
})();
