// player page

const { Player } = TextAliveApp;

const gameAudio = {
  hit: null,
  miss: null,
  explosion: null
};

function preloadAudio() {
  gameAudio.hit = new Audio('audios/hit.wav');
  gameAudio.miss = new Audio('audios/miss.wav');
  gameAudio.explosion = new Audio('audios/explosion.wav');
  gameAudio.hit.volume = 0.3;
  gameAudio.miss.volume = 0.3;
  gameAudio.explosion.volume = 0.3;
}

function playGameAudio(audioType) {
    const audio = gameAudio[audioType];
    if (audio) {
      audio.currentTime = 0;
    audio.play();
  }
}

const fullscreenManager = {
  async enter() {
    if (this.isFullscreen()) return;
      const elem = document.documentElement;
      if (elem.requestFullscreen) {
        await elem.requestFullscreen();
      } else if (elem.webkitRequestFullscreen) {
        await elem.webkitRequestFullscreen();
      } else if (elem.msRequestFullscreen) {
        await elem.msRequestFullscreen();
      } else if (elem.mozRequestFullScreen) {
        await elem.mozRequestFullScreen();
    }
  },

  async exit() {
    if (!this.isFullscreen()) return;
      if (document.exitFullscreen) {
        await document.exitFullscreen();
      } else if (document.webkitExitFullscreen) {
        await document.webkitExitFullscreen();
      } else if (document.msExitFullscreen) {
        await document.msExitFullscreen();
      } else if (document.mozCancelFullScreen) {
        await document.mozCancelFullScreen();
    }
  },

  isFullscreen() {
    return !!(
      document.fullscreenElement ||
      document.webkitFullscreenElement ||
      document.msFullscreenElement ||
      document.mozFullScreenElement
    );
  }
};

window.difficultyConfig = {
  easy: {
    health: 5,
    textUnit: 'phrase',
    normalNote: {
      triggerMode: 'beat'
    },
    pseudoNote: {
      triggerMode: 'beat',
      spawnMultiplier: 2.2,
      durationMin: 400,
      durationMax: 1000
    },
    multiNote: {
      threshold: 2500,
      hitInterval: 1000,
      maxHitCount: 3
    }
  },
  
  normal: {
    health: 4,
    textUnit: 'word',
    normalNote: {
      triggerMode: 'beat'
    },
    pseudoNote: {
      triggerMode: 'contact',
      spawnMultiplier: 1.8,
      durationMin: 600,
      durationMax: 1200
    },
    multiNote: {
      threshold: 700,
      hitInterval: 500,
      maxHitCount: 4
    }
  },
  
  hard: {
    health: 3,
    textUnit: 'char',
    normalNote: {
      triggerMode: 'beat'
    },
    pseudoNote: {
      triggerMode: 'contact',
      spawnMultiplier: 1.4,
      durationMin: 600,
      durationMax: 1500
    },
    multiNote: {
      threshold: 500,
      hitInterval: 300,
      maxHitCount: 5
    }
  }
};

let player = null;
let gameState = {
  health: 5,
  score: 0,
  combo: 0,
  maxCombo: 0,
  notes: [],
  pseudoNotes: [],
  isPlaying: false,
  isPaused: false,
  currentSong: null,
  difficulty: 'normal',
  grade: 'F',
  beatState: 'low',
  mikuState: 'low',
  lastTime: -1,
  currentBeatIndex: -1,
  perfect: 0,
  great: 0,
  good: 0,
  bad: 0,
  miss: 0
};

let fpsData = {
  frameCount: 0,
  fps: 60,
  lastFpsUpdate: 0,
  fpsUpdateInterval: 500
};

const gradeConfig = {
  S: { minScore: 700000, color: '#FFD700', shadowColor: 'rgba(255, 250, 107, 0.8)', text: 'S' },
  A: { minScore: 450000, color: '#87CEEB', shadowColor: 'rgba(107, 255, 243, 0.8)', text: 'A' },
  B: { minScore: 250000, color: '#90EE90', shadowColor: 'rgba(171, 255, 107, 0.8)', text: 'B' },
  C: { minScore: 100000, color: '#FFA07A', shadowColor: 'rgba(255, 147, 107, 0.8)', text: 'C' },
  F: { minScore: 0, color: '#FF6B6B', text: 'F' }
};

const qualityConfig = {
  perfect: 0.4,
  great: 0.5,
  good: 0.7,
};

let scoreConfig = {
  perfect: 1000,
  great: 800,
  good: 600,
  bad: 300,
  miss: 0,
  swing: 100
};

const scoreDistribution = {
  swingRatio: 0.10,
  noteRatio: 0.90
};

let songAnalysis = {
  totalNotes: 0,
  totalHits: 0,
  totalHitScore: 0,
  totalBeats: 0,
  isAnalyzed: false
};

// camera global variables
let cameraStream = null;
let cameraVideo = null;

// detection web worker
let glowstickWorker = null;
let isGlowstickDetectionActive = false;
let isWorkerProcessing = false;
let lastGlowstickTrailTime = 0;
let glowstickModeActive = false;
let lastGlowstickUpdateTime = 0;
let glowstickKalmanFilter = null;

// debug mode
let debugMode = false;
let heatmapCanvas = null;
let heatmapContext = null;

// mouse interaction
let mouseEventHandler = null;
let lastMouseTrailTime = 0;
let currentMouseX = 0;
let currentMouseY = 0;
let hasRecentMouseMovement = false;
let lastMouseUpdateTime = 0;

let domUpdatesQueue = [];
const DOMBatcher = {
  queueUpdate(element, transform) {
    for (let i = 0; i < domUpdatesQueue.length; i++) {
      if (domUpdatesQueue[i].element === element) {
        domUpdatesQueue[i].transform = transform;
        return;
      }
    }
    domUpdatesQueue.push({ element, transform });
  },
  
  flushUpdates() {
    if (domUpdatesQueue.length === 0) return;
    
    for (const update of domUpdatesQueue) {
      if (update.element.parentNode) {
        update.element.style.transform = update.transform;
      }
    }
    domUpdatesQueue.length = 0;
  }
};

async function initGlowstickDetection() {
  if (glowstickWorker) {
    return true;
  }
  if (typeof createImageBitmap === 'undefined') {
    return false;
  }

  try {
    glowstickWorker = new Worker('js/detect.js');
    glowstickKalmanFilter = new window.KalmanTracker();
    
    let modelLoaded = 0;
    let modelLoadError = null;
    glowstickWorker.onmessage = function(e) {
      const { type, data } = e.data;
      switch (type) {
        case 'DETECTION_RESULT':
          handleGlowstickDetectionResult(data);
          break;
        case 'MODEL_LOADED':
          modelLoaded = data.success;
          if (data.success === -1) {
            modelLoadError = data.error;
            if (data.stack) {
            }
          } else if (data.success === 1) {
          }
          break;
      }
    };
    glowstickWorker.postMessage({ type: 'INIT' });
    
    const maxWaitTime = 5000;
    const startTime = Date.now();
    
    while (modelLoaded === 0) {
      if (Date.now() - startTime > maxWaitTime) {
        return false;
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    }

    if (modelLoaded === 1) {
      return true;
    } else {
      return false;
    }
  } catch (error) {
    return false;
  }
}

async function startGlowstickDetection() {
  if (!cameraVideo || !glowstickWorker) {
    return;
  }
  if (isGlowstickDetectionActive) {
    return;
  }
  
  isGlowstickDetectionActive = true;
  
  createDebugInterface();
  requestAnimationFrame(processGlowstickFrame);
}

function processGlowstickFrame() {
  if (!isGlowstickDetectionActive || !cameraVideo || !glowstickWorker) {
    setTimeout(() => {
      requestAnimationFrame(processGlowstickFrame);
    }, 100);
    return;
  }
  
  const videoWidth = cameraVideo.videoWidth;
  const videoHeight = cameraVideo.videoHeight;
  
  if (videoWidth === 0 || videoHeight === 0) {
    setTimeout(() => {
      requestAnimationFrame(processGlowstickFrame);
    }, 100);
    return;
  }
  if (isWorkerProcessing) {
    return;
  }

  isWorkerProcessing = true;
  const startTime = performance.now();
  
  createImageBitmap(cameraVideo)
    .then(imageBitmap => {
      const messageData = {
        imageBitmap: imageBitmap,
        width: videoWidth,
        height: videoHeight,
        returnDebugData: debugMode,
        startTime: startTime
      };
      
      glowstickWorker.postMessage({
        type: 'DETECT',
        data: messageData
      }, [imageBitmap]);
      
      // if the worker is not responding in 5s, restart the detection loop
      const timeoutId = setTimeout(() => {
        if (isWorkerProcessing) {
          isWorkerProcessing = false;
          requestAnimationFrame(processGlowstickFrame);
        }
      }, 5000);
      glowstickWorker._currentTimeoutId = timeoutId;
    });
}

function handleGlowstickDetectionResult(data) {
  isWorkerProcessing = false;
  
  if (glowstickWorker && glowstickWorker._currentTimeoutId) {
    clearTimeout(glowstickWorker._currentTimeoutId);
    glowstickWorker._currentTimeoutId = null;
  }
  
  const { position, debugData } = data;
  
  if (debugData) {
    updateDebugDisplay(debugData, position);
  }
  
  if (position && position.confidence > 0.2 && glowstickKalmanFilter) {
    const screenPosition = convertCameraToScreenCoords(position);
    
    if (screenPosition) {
      const measurement = {
        x: screenPosition.x,
        y: screenPosition.y,
        confidence: position.confidence,
        timestamp: performance.now()
      };
      
      glowstickKalmanFilter.update(measurement);
    }
  }
  
  requestAnimationFrame(processGlowstickFrame);
}

function convertCameraToScreenCoords(cameraPosition) {
  const videoWidth = cameraVideo.videoWidth;
  const videoHeight = cameraVideo.videoHeight;
  const windowWidth = window.innerWidth;
  const windowHeight = window.innerHeight;
  const windowAspectRatio = windowWidth / windowHeight;
  const videoAspectRatio = videoWidth / videoHeight;
  let displayX, displayY;
  
  if (videoAspectRatio > windowAspectRatio) {
    const targetWidth = videoHeight * windowAspectRatio;
    const cropX = (videoWidth - targetWidth) / 2;
    if (cameraPosition.x < cropX || cameraPosition.x > cropX + targetWidth) {
      return null;
    }
    displayX = ((videoWidth - cameraPosition.x - cropX) / targetWidth) * windowWidth;
    displayY = (cameraPosition.y / videoHeight) * windowHeight;
  } else {
    const targetHeight = videoWidth / windowAspectRatio;
    const cropY = (videoHeight - targetHeight) / 2;
    if (cameraPosition.y < cropY || cameraPosition.y > cropY + targetHeight) {
      return null;
    }
    displayX = ((videoWidth - cameraPosition.x) / videoWidth) * windowWidth;
    displayY = ((cameraPosition.y - cropY) / targetHeight) * windowHeight;
  }
  
  return {
    x: displayX,
    y: displayY,
    confidence: cameraPosition.confidence
  };
}

function processGlowstickInteraction(now) {
  if (!glowstickModeActive || !gameState.isPlaying || gameState.isPaused) {
    return;
  }
  
  const glowstickUpdateInterval = 16;
  if (now - lastGlowstickUpdateTime < glowstickUpdateInterval) {
    return;
  }
  lastGlowstickUpdateTime = now;
  
  const playerPage = document.getElementById('player-page');
  const trailInterval = 16;
  
  let position = null;
  if (glowstickKalmanFilter && glowstickKalmanFilter.initialized) {
    const currentTime = performance.now();
    const filteredPosition = glowstickKalmanFilter.getCurrentPosition(currentTime);
    
    if (filteredPosition && filteredPosition.confidence > 0.3) {
      position = {
        x: filteredPosition.x,
        y: filteredPosition.y,
        confidence: filteredPosition.confidence
      };
    }
  }
  
  if (!position) {
    hideGlowstickCursor();
    return;
  }
  
  updateGlowstickCursor(position.x, position.y);
  if (playerPage) {
    const xPercent = (position.x / window.innerWidth) * 100;
    const yPercent = (position.y / window.innerHeight) * 100;
    playerPage.style.setProperty('--mouse-x', `${xPercent}%`);
    playerPage.style.setProperty('--mouse-y', `${yPercent}%`);
  }
  if (now - lastGlowstickTrailTime > trailInterval) {
    createGlowstickTrail(position.x, position.y);
    lastGlowstickTrailTime = now;
  }

  handleSlash(position.x, position.y);
}

function updateGlowstickCursor(x, y) {
  let glowstickCursor = document.getElementById('glowstick-cursor');
  if (!glowstickCursor) {
    glowstickCursor = document.createElement('img');
    glowstickCursor.id = 'glowstick-cursor';
    glowstickCursor.src = 'images/cursor-glow.png';
    glowstickCursor.style.cssText = `
      position: fixed;
      left: 0px;
      top: 0px;
      pointer-events: none;
      z-index: 9999;
      width: 34px;
      height: 52px;
      transition: opacity 0.1s ease;
      will-change: transform, opacity;
      backface-visibility: hidden;
      transform-style: preserve-3d;
    `;
    document.getElementById('player-page').appendChild(glowstickCursor);
  }
  
  glowstickCursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
  glowstickCursor.style.opacity = '1';
}

function hideGlowstickCursor() {
  const glowstickCursor = document.getElementById('glowstick-cursor');
  if (glowstickCursor) {
    glowstickCursor.style.opacity = '0';
  }
}

function stopGlowstickLoop() {
  lastGlowstickTrailTime = 0; 
  hideGlowstickCursor();
  lastGlowstickUpdateTime = 0;
}

function stopMouseEvents() {
  const playerPage = document.getElementById('player-page');
  
  if (mouseEventHandler && playerPage) {
    playerPage.removeEventListener('pointermove', mouseEventHandler);
    mouseEventHandler = null;
  }
  
  hasRecentMouseMovement = false;
  lastMouseTrailTime = 0;
  lastMouseUpdateTime = 0;
}

function processMouseInteraction(now) {
  if (!hasRecentMouseMovement || !gameState.isPlaying || gameState.isPaused) {
    return;
  }
  
  const mouseUpdateInterval = 16;
  if (now - lastMouseUpdateTime < mouseUpdateInterval) {
    return;
  }
  lastMouseUpdateTime = now;
  
  const playerPage = document.getElementById('player-page');
  const trailInterval = 16;
  
  if (playerPage) {
    const xPercent = (currentMouseX / window.innerWidth) * 100;
    const yPercent = (currentMouseY / window.innerHeight) * 100;
    playerPage.style.setProperty('--mouse-x', `${xPercent}%`);
    playerPage.style.setProperty('--mouse-y', `${yPercent}%`);
  }
  
  if (now - lastMouseTrailTime > trailInterval) {
    createMouseTrail(currentMouseX, currentMouseY);
    lastMouseTrailTime = now;
  }
  
  handleSlash(currentMouseX, currentMouseY);
  hasRecentMouseMovement = false;
}

function createGlowstickTrail(x, y) {
  if (!gameState.isPlaying || gameState.isPaused) return;
  const trailContainer = document.getElementById('mouse-trail-container');
  if (!trailContainer) return;
  
  const trail = document.createElement('div');
  trail.className = 'trail-point glowstick-trail';
  
  if (gameState.beatState === 'high') {
    trail.classList.add('beat-enhanced');
  }
  
  const offset = gameState.beatState === 'high' ? 7 : 4;
  trail.style.left = '0px';
  trail.style.top = '0px';
  trail.style.position = 'absolute';
  trail.style.transform = `translate3d(${x - offset}px, ${y - offset}px, 0)`;
  trail.style.willChange = 'transform, opacity';
  trail.style.backfaceVisibility = 'hidden';
  trail.style.animation = 'none';
  
  trail.style.background = gameState.beatState === 'high' ? 
    'radial-gradient(circle, #00ff88 0%, #00ccff 50%, transparent 100%)' :
    'radial-gradient(circle, #00ccff 0%, #0088ff 50%, transparent 100%)';
  
  trail.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
  trailContainer.appendChild(trail);
  
  requestAnimationFrame(() => {
    trail.style.opacity = '0';
    trail.style.transform = `translate3d(${x - offset}px, ${y - offset}px, 0) scale(0.5)`;
  });
  
  setTimeout(() => {
    if (trail.parentNode) {
      trail.parentNode.removeChild(trail);
    }
  }, gameState.beatState === 'high' ? 1200 : 800);
}

function createDebugInterface() {
  if (document.getElementById('heatmap-interface')) {
    return;
  }
  
  const heatmapContainer = document.createElement('div');
  heatmapContainer.id = 'heatmap-interface';
  
  const heatmapToggle = document.createElement('button');
  heatmapToggle.textContent = 'HEATMAP';
  heatmapToggle.onclick = () => {
    debugMode = !debugMode;
    
    if (debugMode) {
      showDebugCanvases();
      heatmapContainer.classList.add('expanded');
    } else {
      hideDebugCanvases();
      heatmapContainer.classList.remove('expanded');
    }
  };
  
  heatmapContainer.appendChild(heatmapToggle);
  
  heatmapCanvas = document.createElement('canvas');
  heatmapCanvas.style.display = 'none';
  heatmapContext = heatmapCanvas.getContext('2d');
  heatmapContainer.appendChild(heatmapCanvas);
  
  document.body.appendChild(heatmapContainer);
}

function showDebugCanvases() {
  if (heatmapCanvas) heatmapCanvas.style.display = 'block';
}

function hideDebugCanvases() {
  if (heatmapCanvas) heatmapCanvas.style.display = 'none';
}

function updateDebugDisplay(debugData, position) {
  if (!debugMode || !debugData) return;
  
  const { heatmap, heatmapShape } = debugData;
  
  if (heatmap && heatmapContext && heatmapShape) {
    const [heatmapHeight, heatmapWidth] = heatmapShape;
    heatmapCanvas.width = heatmapWidth;
    heatmapCanvas.height = heatmapHeight;
    
    const heatmapImageData = heatmapContext.createImageData(heatmapWidth, heatmapHeight);
    for (let i = 0; i < heatmap.length; i++) {
      const pixelIndex = i * 4;
      const value = heatmap[i];
      heatmapImageData.data[pixelIndex] = value > 128 ? 255 : value * 2;
      heatmapImageData.data[pixelIndex + 1] = value > 64 ? 255 : value * 4;
      heatmapImageData.data[pixelIndex + 2] = value < 128 ? 255 : (255 - value) * 2;
      heatmapImageData.data[pixelIndex + 3] = 255;
    }
    
    heatmapContext.save();
    heatmapContext.scale(-1, 1);
    heatmapContext.translate(-heatmapWidth, 0);
    heatmapContext.putImageData(heatmapImageData, 0, 0);
    
    if (position) {
      drawPredictionPoint(heatmapContext, position, heatmapWidth, heatmapHeight, true);
    }
    
    heatmapContext.restore();
  }
}

function drawPredictionPoint(context, position, canvasWidth = 192, canvasHeight = 192, isFlipped = false) {
  if (!position || !context) return;
  
  const originalWidth = cameraVideo ? cameraVideo.videoWidth : 640;
  const originalHeight = cameraVideo ? cameraVideo.videoHeight : 480;
  
  const scaleX = canvasWidth / originalWidth;
  const scaleY = canvasHeight / originalHeight;
  
  let canvasX = position.x * scaleX;
  let canvasY = position.y * scaleY;
  
  if (isFlipped) {
    canvasX = canvasWidth - canvasX;
  }
  
  const confidence = position.confidence || 0;
  const radius = Math.max(3, Math.min(8, confidence * 10));
  
  if (confidence > 0.8) {
    context.strokeStyle = '#00FF00';
    context.fillStyle = 'rgba(0, 255, 0, 0.3)';
  } else if (confidence > 0.5) {
    context.strokeStyle = '#FFFF00';
    context.fillStyle = 'rgba(255, 255, 0, 0.3)';
  } else {
    context.strokeStyle = '#FF0000';
    context.fillStyle = 'rgba(255, 0, 0, 0.3)';
  }
  
  context.lineWidth = 2;
  
  context.beginPath();
  context.arc(canvasX, canvasY, radius, 0, 2 * Math.PI);
  context.fill();
  context.stroke();
  
  context.beginPath();
  context.moveTo(canvasX - radius * 1.5, canvasY);
  context.lineTo(canvasX + radius * 1.5, canvasY);
  context.moveTo(canvasX, canvasY - radius * 1.5);
  context.lineTo(canvasX, canvasY + radius * 1.5);
  context.stroke();
  
  context.fillStyle = '#FFFFFF';
  context.font = '10px Arial';
  
  const textOffsetX = isFlipped ? -60 : 10;
  const textOffsetY = -10;
  
  context.fillText(`(${Math.round(position.x)}, ${Math.round(position.y)})`, canvasX + textOffsetX, canvasY + textOffsetY);
  context.fillText(`${(confidence * 100).toFixed(1)}%`, canvasX + textOffsetX, canvasY + textOffsetY + 15);
}

function cleanupGlowstickDetection() {
  isGlowstickDetectionActive = false;
  glowstickModeActive = false;
  stopGlowstickLoop();
  glowstickKalmanFilter = null;
  
  const glowstickIndicator = document.getElementById('glowstick-indicator');
  if (glowstickIndicator) {
    glowstickIndicator.remove();
  }
  const glowstickCursor = document.getElementById('glowstick-cursor');
  if (glowstickCursor) {
    glowstickCursor.remove();
  }
  const heatmapInterface = document.getElementById('heatmap-interface');
  if (heatmapInterface) {
    heatmapInterface.remove();
  }
  
  if (glowstickWorker) {
    if (glowstickWorker._currentTimeoutId) {
      clearTimeout(glowstickWorker._currentTimeoutId);
      glowstickWorker._currentTimeoutId = null;
    }
    
    glowstickWorker.postMessage({ type: 'DISPOSE' });
    glowstickWorker.terminate();
    glowstickWorker = null;
  }
  
  debugMode = false;
  heatmapCanvas = null;
  heatmapContext = null;
  
  isWorkerProcessing = false;
}

async function enableCamera() {
  if (cameraStream) {
    return;
  }

  try {
    const testStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
    const track = testStream.getVideoTracks()[0];
    const settings = track.getSettings();
    const aspectRatio = settings.width / settings.height;

    track.stop();

    const idealWidth = 640;
    const idealHeight = Math.round(idealWidth / aspectRatio);

      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
        width: { ideal: idealWidth },
        height: { ideal: idealHeight },
        facingMode: 'user'
        },
        audio: false
      });

      cameraStream = stream;

      cameraVideo = document.getElementById('camera-video');
      if (!cameraVideo) {
        cameraVideo = document.createElement('video');
        cameraVideo.id = 'camera-video';
        cameraVideo.className = 'camera-video';
        cameraVideo.autoplay = true;
        cameraVideo.muted = true;
        cameraVideo.playsInline = true;
        
        const playerPage = document.getElementById('player-page');
        const backgroundVideo = document.getElementById('player-video-background');
        
        if (backgroundVideo && backgroundVideo.nextSibling) {
          playerPage.insertBefore(cameraVideo, backgroundVideo.nextSibling);
        } else {
          playerPage.appendChild(cameraVideo);
        }
      }

      cameraVideo.srcObject = stream;
      cameraVideo.addEventListener('loadedmetadata', () => {
        setupCameraCrop();
        if (glowstickWorker && !isGlowstickDetectionActive) {
          setTimeout(() => {
            startGlowstickDetection();
          }, 500);
        }
    });
    glowstickModeActive = true;
  } catch (error) {
    glowstickModeActive = false;
  }
}

function setupCameraCrop() {
  if (!cameraVideo) return;

  const updateCameraCrop = () => {
    const windowWidth = window.innerWidth;
    const windowHeight = window.innerHeight;
    const windowAspectRatio = windowWidth / windowHeight;

    const videoWidth = cameraVideo.videoWidth;
    const videoHeight = cameraVideo.videoHeight;
    const videoAspectRatio = videoWidth / videoHeight;

    if (videoWidth === 0 || videoHeight === 0) {
      setTimeout(updateCameraCrop, 100);
      return;
    }

    let scaleX, scaleY, translateX, translateY;

    if (videoAspectRatio > windowAspectRatio) {
      scaleY = windowHeight / videoHeight;
      scaleX = scaleY;
      const scaledVideoWidth = videoWidth * scaleX;
      translateX = (windowWidth - scaledVideoWidth) / 2;
      translateY = 0;
    } else {
      scaleX = windowWidth / videoWidth;
      scaleY = scaleX;
      const scaledVideoHeight = videoHeight * scaleY;
      translateX = 0;
      translateY = (windowHeight - scaledVideoHeight) / 2;
    }

    cameraVideo.style.width = videoWidth + 'px';
    cameraVideo.style.height = videoHeight + 'px';

    cameraVideo.style.transform = `
      translate(${translateX + videoWidth * scaleX}px, ${translateY}px)
      scale(${-scaleX}, ${scaleY})
    `;
  };

  setTimeout(updateCameraCrop, 200);
  const resizeHandler = () => {
    requestAnimationFrame(updateCameraCrop);
  };
  window.addEventListener('resize', resizeHandler);
  cameraVideo._resizeHandler = resizeHandler;
}

function disableCamera() {
  cleanupGlowstickDetection();
  
    if (cameraStream) {
      cameraStream.getTracks().forEach(track => {
        track.stop();
      });
      cameraStream = null;
    }
    if (cameraVideo && cameraVideo._resizeHandler) {
      window.removeEventListener('resize', cameraVideo._resizeHandler);
    }
    if (cameraVideo) {
      if (cameraVideo.parentNode) {
        cameraVideo.parentNode.removeChild(cameraVideo);
      }
      cameraVideo = null;
  }
}

function updateFPS(currentTime) {
  fpsData.frameCount++;
  
  if (currentTime - fpsData.lastFpsUpdate >= fpsData.fpsUpdateInterval) {
    const timeDelta = currentTime - fpsData.lastFpsUpdate;
    fpsData.fps = Math.round((fpsData.frameCount * 1000) / timeDelta);
    
    const fpsDisplay = document.getElementById('fps-display');
    const fpsNumber = fpsDisplay?.querySelector('.fps-number');
    
    if (fpsNumber) {
      fpsNumber.textContent = fpsData.fps;
      
      fpsDisplay.classList.remove('fps-high', 'fps-medium', 'fps-low');
      
      if (fpsData.fps >= 50) {
        fpsDisplay.classList.add('fps-high');
      } else if (fpsData.fps >= 30) {
        fpsDisplay.classList.add('fps-medium');
      } else {
        fpsDisplay.classList.add('fps-low');
      }
    }
    
    fpsData.frameCount = 0;
    fpsData.lastFpsUpdate = currentTime;
  }
}

function initFPSDisplay() {
  const fpsDisplay = document.getElementById('fps-display');
  if (fpsDisplay) {
    fpsDisplay.classList.add('fps-high');
  }
  
  fpsData.frameCount = 0;
  fpsData.fps = 60;
  fpsData.lastFpsUpdate = performance.now();
}

// precalculate scores to make sure the max score is 1000000
function analyzeSongAndCalculateScores(video, totalBeats) {
  if (!video) return;
  
  const currentConfig = window.difficultyConfig[gameState.difficulty];
  let totalNotes = 0;
  let totalHits = 0;
  
    let textUnits = [];
    if (currentConfig.textUnit === 'phrase') {
      textUnits = video.phrases || [];
    } else if (currentConfig.textUnit === 'word') {
      textUnits = video.words || [];
    } else {
      textUnits = video.chars || [];
    }
    
  let totalHitScore = 0;
    textUnits.forEach(unit => {
      if (unit && unit.startTime !== undefined && unit.endTime !== undefined) {
        totalNotes++;
        
        const duration = unit.endTime - unit.startTime;
        
        if (duration > currentConfig.multiNote.threshold) {
          const hitCount = 2 + Math.floor((duration - currentConfig.multiNote.threshold) / currentConfig.multiNote.hitInterval);
          totalHits += hitCount;
          
          const multiHitScoreWeight = (hitCount - 1) * 0.5 + 1;
          totalHitScore += multiHitScoreWeight;
        } else {
        totalHits += 1;
        totalHitScore += 1;
        }
      }
    });
    
    songAnalysis = {
      totalNotes,
      totalHits,
    totalHitScore,
      totalBeats,
      isAnalyzed: true
    };
    calculateDynamicScores();
}

  function calculateDynamicScores() {
    if (!songAnalysis.isAnalyzed) {
      return;
    }
    
  const targetTotalScore = 1000000;
    const { totalHitScore, totalBeats } = songAnalysis;
    const swingTotalScore = targetTotalScore * scoreDistribution.swingRatio;
    const noteTotalScore = targetTotalScore * scoreDistribution.noteRatio;
    const estimatedSwingCount = totalBeats
    const swingScore = estimatedSwingCount > 0 ? (swingTotalScore / estimatedSwingCount) : 0;
    const perfectScore = totalHitScore > 0 ? (noteTotalScore / totalHitScore) : 1000;
    
    scoreConfig = {
      perfect: perfectScore,
    great: perfectScore * 0.8,
    good: perfectScore * 0.5,
      bad: perfectScore * 0.2,
      miss: 0,
      swing: swingScore
    };
  }

function calculateTextWidth(text, fontSize = 15, fontWeight = 'bold', fontFamily = 'Arial') {
  try {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `${fontWeight} ${fontSize}px ${fontFamily}`;
    return context.measureText(text).width;
  } catch (error) {
    let width = 0;
    for (let i = 0; i < text.length; i++) {
      const char = text[i];
      if (/[\u3040-\u309F\u30A0-\u30FF\u4E00-\u9FFF\u3400-\u4DBF\uF900-\uFAFF]/.test(char)) {
        width += fontSize;
      } else {
        width += fontSize * 0.6;
      }
    }
    return width;
  }
}

const pianoHeight_white = 27;
const pianoWidth_white = 121;
const pianoHeight_black = 18;
const pianoWidth_black = 75;

// locate piano key position
const pianoPos = {
  "B4": 17.68,
  "A#4": 31.32,
  "A4": 44.96,
  "G#4": 58.60,
  "G4": 72.24,
  "F#4": 85.88,
  "F4": 99.52,
  "E4": 126.80,
  "D#4": 140.44,
  "D4": 154.08,
  "C#4": 167.72,
  "C4": 181.36,
  "B3": 208.64,
  "A#3": 222.28,
  "A3": 235.92,
  "G#3": 249.56,
  "G3": 263.20,
  "F#3": 276.84,
  "F3": 290.48,
  "E3": 317.76,
  "D#3": 331.40,
  "D3": 345.04,
  "C#3": 358.68,
  "C3": 372.32,
  "B2": 399.60,
  "A#2": 413.24,
  "A2": 426.88,
  "G#2": 440.52,
  "G2": 454.16,
  "F#2": 467.80,
  "F2": 481.44,
}

const songsConfig = {
  streetlight: {
    url: "https://piapro.jp/t/ULcJ/20250205120202",
    video: {
      beatId: 4694275,
      chordId: 2830730,
      repetitiveSegmentId: 2946478,
      lyricId: 67810,
      lyricDiffId: 20654
    },
    beatBase: 2,
    beatPM: 117
  },
  alifration: {
    url: "https://piapro.jp/t/SuQO/20250127235813",
    video: {
      beatId: 4694276,
      chordId: 2830731,
      repetitiveSegmentId: 2946479,
      lyricId: 67811,
      lyricDiffId: 20655
    },
    beatBase: 2,
    beatPM: 130
  },
  informal: {
    url: "https://piapro.jp/t/Ppc9/20241224135843",
    video: {
      beatId: 4694277,
      chordId: 2830732,
      repetitiveSegmentId: 2946480,
      lyricId: 67812,
      lyricDiffId: 20656
    },
    beatBase: 2,
    beatPM: 195
  },
  hello: {
    url: "https://piapro.jp/t/oTaJ/20250204234235",
    video: {
      beatId: 4694278,
      chordId: 2830733,
      repetitiveSegmentId: 2946481,
      lyricId: 67813,
      lyricDiffId: 20657
    },
    beatBase: 2,
    beatPM: 181
  },
  parade: {
    url: "https://piapro.jp/t/GCgy/20250202202635",
    video: {
      beatId: 4694279,
      chordId: 2830734,
      repetitiveSegmentId: 2946482,
      lyricId: 67814,
      lyricDiffId: 20658
    },
    beatBase: 2,
    beatPM: 146
  },
  lonely: {
    url: "https://piapro.jp/t/CyPO/20250128183915",
    video: {
      beatId: 4694280,
      chordId: 2830735,
      repetitiveSegmentId: 2946483,
      lyricId: 67815,
      lyricDiffId: 20659
    },
    beatBase: 3,
    beatPM: 100
  }
};

class Note {
  constructor(type, char, x, y, targetTime, duration = 500, hitCount = 1) {
    this.type = type;
    this.char = char;
    this.x = x;
    this.y = y;
    this.startY = y;
    this.lastX = x;
    this.lastY = y;
    this.targetTime = targetTime;
    this.duration = duration;
    this.width = 0;
    this.hitCount = hitCount;
    
    this.vx = 0;
    this.vy = 0;
    
    this.element = this.createElement();
    this.isHit = false;
    this.isDestroying = false;
    this.lastHitBeat = -1;
  }

  // note width is detemined by the duration and text width
  createElement() {
    const element = document.createElement('div');
    element.className = `note ${this.type}-note`;
    
    const minWidth = 40;
    const maxWidth = 200;
    const alpha = 0.2;
    const beta = 30;
    
    // linear mapping from duration to width
    let width = Math.max(minWidth, Math.min(maxWidth, alpha * this.duration + beta));
    if (this.type !== 'pseudo' && this.char) {
      const textWidth = calculateTextWidth(this.char, 15, 'bold');
      let padding = 16;
      if (this.type === 'multi') {
        const countText = this.hitCount.toString();
        const countWidth = calculateTextWidth(countText, 12, 'bold');
        padding += Math.max(35, countWidth + 25);
      }
      const requiredWidth = textWidth + padding;
      if (requiredWidth > width) {
        width = requiredWidth;
      }
    }
    this.width = width;
    
    if (this.type === 'pseudo') {
      element.textContent = '! ! !';
      element.style.background = ' #ff7f7f';
      element.style.color = '#000';
      element.style.border = '2px solid #ffa9a9';
    } else if (this.type === 'multi') {
      element.textContent = this.char;
      element.style.background = ' #7fffff';
      element.style.color = '#000';
      element.style.border = '2px solid #a9ffff';
      
        const countElement = document.createElement('span');
        countElement.className = 'hit-count';
        countElement.textContent = this.hitCount;
      countElement.style.position = 'absolute';
      countElement.style.top = '2px';
      countElement.style.right = '4px';
        element.appendChild(countElement);
    } else {
      element.textContent = this.char;
      element.style.background = ' #bfff7f';
      element.style.color = '#000';
      element.style.border = '2px solid #d4ffa9';
    }
    
    element.style.position = 'absolute';
    element.style.transform = `translate3d(${this.x}px, ${this.y}px, 0)`;
    element.style.width = width + 'px';
    element.style.height = '24px';
    element.style.borderRadius = '4px';
    element.style.display = 'flex';
    element.style.alignItems = 'left';
    element.style.justifyContent = 'left';
    element.style.fontSize = '15px';
    element.style.fontFamily = 'Arial, sans-serif';
    element.style.fontWeight = 'bold';
    element.style.boxShadow = '0 2px 8px rgba(255, 255, 255, 0.3)';
    element.style.zIndex = '10';
    element.style.overflow = 'hidden';
    element.style.whiteSpace = 'nowrap';
    element.style.textOverflow = 'ellipsis';
    element.style.willChange = 'transform';
    element.style.backfaceVisibility = 'hidden';
    element.style.transformStyle = 'preserve-3d';

    return element;
  }

  // physics simulation of notes
  update(deltaTime) {
    const dt = Math.min(deltaTime, 100) * 0.001;
    const dampening = 0.3 * dt;
    
    this.x += this.vx * dt;
    this.vx = Math.max(0, this.vx * (1 - dampening));

    this.y += this.vy * dt;
    this.vy += (200 - this.vy * dampening) * dt;

    const newX = this.x | 0;
    const newY = this.y | 0;
    
    if ((this.lastX ^ newX) | (this.lastY ^ newY)) {
      DOMBatcher.queueUpdate(this.element, `translate3d(${newX}px, ${newY}px, 0)`);
      this.lastX = newX;
      this.lastY = newY;
    }
    
    return this.y > window.innerHeight + 50 || this.x < -100 || this.x > window.innerWidth + 100;
  }

  hit() {
    const currentBeatIndex = gameState.currentBeatIndex;
    if (this.lastHitBeat === currentBeatIndex && currentBeatIndex !== -1) {
      return 'same-beat';
    }
    
    if (this.type === 'pseudo') {
      this.isHit = true;
      gameState.health--;
      updateHealthDisplay();
      createEffect('explosion', this.x + this.width / 2, this.y + 12);
      return 'pseudo';
    }
    
    if (this.type === 'multi') {
      this.lastHitBeat = currentBeatIndex;
      this.hitCount--;
      if (this.hitCount > 0) {
        const countElement = this.element.querySelector('.hit-count');
        if (countElement) {
          countElement.textContent = this.hitCount;
        }
        return 'multi-continue';
      } else {
        this.isHit = true;
        return 'hit';
      }
    }
    
    this.lastHitBeat = currentBeatIndex;
    this.isHit = true;
    return 'hit';
  }

  destroy() {
    if (this.element && this.element.parentNode && !this.isDestroying) {
      this.isDestroying = true;
      
      this.element.style.transition = 'opacity 0.3s ease-out, transform 0.3s ease-out';
      this.element.style.opacity = '0';
      this.element.style.transform = this.element.style.transform + ' scale(0.8)';
      
      setTimeout(() => {
        if (this.element && this.element.parentNode) {
          this.element.parentNode.removeChild(this.element);
        }
      }, 300);
    }
  }
}

// main function called by song-selection page
function showPlayer() {
  if (window.SongSelection) {
    window.SongSelection.stopPreview();
    window.SongSelection.hide();
  }
  document.getElementById('tutorial-page').classList.add('hidden');
  document.getElementById('player-page').classList.remove('hidden');
  
  fullscreenManager.enter();
  initGameUI();
}

function hidePlayer() {
  document.getElementById('game-ui').classList.add('hidden');
  document.getElementById('player-page').classList.add('hidden');
  fullscreenManager.exit();
  
  if (window.SongSelection) {
    window.SongSelection.show();
  }
  cleanupGame();
}

function initGameUI() {
  initHealthDisplay();
  initFPSDisplay();
  document.getElementById('game-ui').classList.remove('hidden');
}

function initHealthDisplay() {
  const healthDisplay = document.getElementById('health-display');
  const healthCount = window.difficultyConfig[gameState.difficulty].health;
  
  healthDisplay.innerHTML = '';
  
  for (let i = 0; i < healthCount; i++) {
    const healthIcon = document.createElement('img');
    healthIcon.src = 'images/negi.png';
    healthIcon.className = 'health-icon';
    healthIcon.setAttribute('data-index', i);
    healthIcon.alt = 'Health';
    healthDisplay.appendChild(healthIcon);
  }
}

function setupInteractionEvents() {
  stopMouseEvents();
  stopGlowstickLoop();
  
  if (!glowstickModeActive) {
    setupMouseEvents();
  }
}

function setupMouseEvents() {
  const playerPage = document.getElementById('player-page');
  
  if (mouseEventHandler) {
    playerPage.removeEventListener('pointermove', mouseEventHandler);
  }
  
  mouseEventHandler = (e) => {
    currentMouseX = e.clientX;
    currentMouseY = e.clientY;
    hasRecentMouseMovement = true;
  };
  
  playerPage.addEventListener('pointermove', mouseEventHandler);
}



function createMouseTrail(x, y) {
  if (!gameState.isPlaying || gameState.isPaused) return;
  
  const trailContainer = document.getElementById('mouse-trail-container');
  if (!trailContainer) return;
  
  const trail = document.createElement('div');
  trail.className = 'trail-point';
  
  if (gameState.beatState === 'high') {
    trail.classList.add('beat-enhanced');
  }
  
  const offset = gameState.beatState === 'high' ? 7 : 4;
  trail.style.left = '0px';
  trail.style.top = '0px';
  trail.style.position = 'absolute';
  trail.style.transform = `translate3d(${x - offset}px, ${y - offset}px, 0)`;
  trail.style.willChange = 'transform, opacity';
  trail.style.backfaceVisibility = 'hidden';
  trail.style.animation = 'none';
  trail.style.transition = 'opacity 0.8s ease-out, transform 0.8s ease-out';
  
  trailContainer.appendChild(trail);
  
  requestAnimationFrame(() => {
    trail.style.opacity = '0';
    trail.style.transform = `translate3d(${x - offset}px, ${y - offset}px, 0) scale(0.5)`;
  });
  
  setTimeout(() => {
    if (trail.parentNode) {
      trail.parentNode.removeChild(trail);
    }
  }, gameState.beatState === 'high' ? 1200 : 800);
}

let lastBeatState = 'low';
let lastPositionX = 0;
let lastPositionY = 0;

// handle interaction with the notes
function handleSlash(x, y) {
  if (!gameState.isPlaying || gameState.isPaused || isGameOverStarted) return;
  
  const currentConfig = window.difficultyConfig[gameState.difficulty];
  const canTriggerPseudo = currentConfig.pseudoNote.triggerMode === 'contact' || 
                          (currentConfig.pseudoNote.triggerMode === 'beat' && gameState.beatState === 'high');
  const canHitNormalNotes = currentConfig.normalNote.triggerMode === 'contact' || 
                           (currentConfig.normalNote.triggerMode === 'beat' && gameState.beatState === 'high');
  
  let hitNote = null;
  let hitDistance = Infinity;
  let OutDistance = Infinity;
  
  for (const note of gameState.notes) {
    if (note.isHit) continue;
    
    if (note.type === 'pseudo') {
      if (glowstickModeActive) {
        hitMargin = 10;
      } else {
        hitMargin = 30;
      }
      if (!canTriggerPseudo) {
        continue;
      }
    } else {
      if (glowstickModeActive) {
        hitMargin = 100;
      } else {
        hitMargin = 30;
      }
      if (!canHitNormalNotes) {
        continue;
      }
    }
    
    const noteElement = note.element;
    const noteRect = {
      left: note.x,
      top: note.y,
      right: note.x + parseFloat(noteElement.style.width),
      bottom: note.y + 24
    };

    const isInside = x >= noteRect.left && x <= noteRect.right && 
                     y >= noteRect.top && y <= noteRect.bottom;
    
    if (isInside) {
      const noteCenterX = noteRect.left + (noteRect.right - noteRect.left) / 2;
      const noteCenterY = noteRect.top + 12;
      const distance = Math.sqrt((x - noteCenterX) ** 2 + (y - noteCenterY) ** 2);
    
      if (distance < hitDistance) {
        hitNote = note;
        hitDistance = distance;
      }
    } else {

      // if is outside of the note, check the closest distance to the edge
      const edgeDistance = getDistanceToRect(x, y, noteRect);
      
      if (edgeDistance < hitMargin) {
        if (hitDistance == Infinity && edgeDistance < OutDistance) {
          hitNote = note;
          OutDistance = edgeDistance;
          const noteCenterX = noteRect.left + (noteRect.right - noteRect.left) / 2;
          const noteCenterY = noteRect.top + 12;
          hitDistance = Math.sqrt((x - noteCenterX) ** 2 + (y - noteCenterY) ** 2);
          hitDistance = hitDistance - edgeDistance;
        }
      }
    } 
  }
  
  if (hitNote) {
    const result = hitNote.hit();
    handleNoteHit(hitNote, result, hitDistance);
  }
  
  if (gameState.beatState === 'high' && lastBeatState === 'low') {
    const distance = Math.sqrt((x - lastPositionX) ** 2 + (y - lastPositionY) ** 2);
    if (distance > 100) {
      gameState.score += scoreConfig.swing;
      updateScoreDisplay();
    }
    lastBeatState = 'high';
  }
  else if (gameState.beatState === 'low' && lastBeatState === 'high') {
    lastPositionX = x;
    lastPositionY = y;
    lastBeatState = 'low';
  }
}

function getDistanceToRect(x, y, rect) {
  const dx = Math.max(rect.left - x, 0, x - rect.right);
  const dy = Math.max(rect.top - y, 0, y - rect.bottom);
  return Math.sqrt(dx * dx + dy * dy);
}

function handleNoteHit(note, result, distance) {
  if (result === 'same-beat') {
    return;
  }
  
  if (result === 'pseudo') {
    playGameAudio('explosion');
    gameState.combo = 0;
    updateComboDisplay();
    checkGameOver();
    
    const index = gameState.notes.indexOf(note);
    if (index > -1) {
      gameState.notes.splice(index, 1);
      note.destroy();
    }
    return;
  }
  
  if (result === 'multi-continue') {
    playGameAudio('hit');
    const hitQuality = getHitQuality(distance, note.width);
    const multiHitScore = scoreConfig[hitQuality] * 0.5;
    gameState.score += multiHitScore;
    gameState.combo++;
    
    createEffect('hit', note.x + note.width / 2, note.y + 12, hitQuality);
    showHitResult(hitQuality);
    
    updateScoreDisplay();
    updateComboDisplay();
    checkComboMilestones();
    return;
  }
  
  playGameAudio('hit');
  const hitQuality = getHitQuality(distance, note.width);
  gameState.score += scoreConfig[hitQuality];
  gameState.combo++;
  gameState.maxCombo = Math.max(gameState.maxCombo, gameState.combo);
  
  createEffect('hit', note.x + note.width / 2, note.y + 12, hitQuality);
  showHitResult(hitQuality);
  
  updateScoreDisplay();
  updateComboDisplay();
  checkComboMilestones();
  
  const index = gameState.notes.indexOf(note);
  if (index > -1) {
    gameState.notes.splice(index, 1);
    note.destroy();
  }
}

const greatminDistance = 30;
const goodminDistance = 40;
function getHitQuality(distance, noteLength) {
  let quality;
  const perfectDistance = noteLength * qualityConfig.perfect / 2 + 10;
  const greatDistance = noteLength * qualityConfig.great / 2 + 10;
  const goodDistance = noteLength * qualityConfig.good / 2 + 10;

  if (distance < perfectDistance) {
    quality = 'perfect';
    gameState.perfect++;
  } else if (distance < Math.max(greatDistance, greatminDistance)) {
    quality = 'great';
    gameState.great++;
  } else if (distance < Math.max(goodDistance, goodminDistance)) {
    quality = 'good';
    gameState.good++;
  } else {
    quality = 'bad';
    gameState.bad++;
  }
  return quality;
}

function createEffect(type, x, y, quality = null) {
  const effectsContainer = document.getElementById('effects-container');
  
  if (type === 'hit') {
    createHitEffect(x, y, quality, effectsContainer);
  } else if (type === 'miss') {
    createMissEffect(x, y, effectsContainer);
  } else if (type === 'explosion') {
    createExplosionEffect(x, y, effectsContainer);
  }
}

function createHitEffect(x, y, quality, container) {
  const qualityColors = {
    perfect: { primary: '#FFD700', secondary: '#FFF700', glow: '#FFD700' },
    great: { primary: '#00FF00', secondary: '#7FFF00', glow: '#00FF00' },
    good: { primary: '#87CEEB', secondary: '#B0E0E6', glow: '#87CEEB' },
    bad: { primary: '#FFA07A', secondary: '#FFB347', glow: '#FFA07A' }
  };
  
  const colors = qualityColors[quality] || qualityColors.good;
  
  const ripple = document.createElement('div');
  ripple.className = 'effect hit-ripple-effect';
  ripple.style.left = (x - 30) + 'px';
  ripple.style.top = (y - 30) + 'px';
  ripple.style.background = `radial-gradient(circle, ${colors.primary}bb 0%, ${colors.secondary}88 30%, transparent 60%)`;
  ripple.style.boxShadow = `0 0 15px ${colors.glow}66, 0 0 30px ${colors.glow}44`;
  
  container.appendChild(ripple);
  
  for (let i = 0; i < 3; i++) {
    const particle = document.createElement('div');
    particle.className = 'effect hit-particle-effect';
    particle.style.left = (x - 3) + 'px';
    particle.style.top = (y - 3) + 'px';
    particle.style.background = colors.primary + 'dd';
    particle.style.boxShadow = `0 0 8px ${colors.glow}66`;
    
    const angle = (i * 120 + Math.random() * 60) * Math.PI / 180;
    const distance = 60 + Math.random() * 40;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    
    particle.style.setProperty('--dx', dx + 'px');
    particle.style.setProperty('--dy', dy + 'px');
    
    container.appendChild(particle);
    
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 800);
  }
  
  setTimeout(() => {
    if (ripple.parentNode) {
      ripple.parentNode.removeChild(ripple);
    }
  }, 600);
}

function createMissEffect(x, y, container) {
  const missRipple = document.createElement('div');
  missRipple.className = 'effect miss-ripple-effect';
  missRipple.style.left = (x - 35) + 'px';
  missRipple.style.top = (y - 35) + 'px';
  
  container.appendChild(missRipple);
  
  for (let i = 0; i < 3; i++) {
    const particle = document.createElement('div');
    particle.className = 'effect miss-particle-effect';
    particle.style.left = (x - 3) + 'px';
    particle.style.top = (y - 3) + 'px';
    
    const angle = (i * 90 + Math.random() * 30 - 135) * Math.PI / 180;
    const distance = 50 + Math.random() * 30;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    
    particle.style.setProperty('--dx', dx + 'px');
    particle.style.setProperty('--dy', dy + 'px');
    
    container.appendChild(particle);
    
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 600);
  }
  
  setTimeout(() => {
    if (missRipple.parentNode) {
      missRipple.parentNode.removeChild(missRipple);
    }
  }, 600);
}

function createExplosionEffect(x, y, container) {
  const explosion = document.createElement('div');
  explosion.className = 'effect explosion-ripple-effect';
  explosion.style.left = (x - 40) + 'px';
  explosion.style.top = (y - 40) + 'px';
  
  container.appendChild(explosion);
  
  for (let i = 0; i < 5; i++) {
    const particle = document.createElement('div');
    particle.className = 'effect explosion-particle-effect';
    particle.style.left = (x - 4) + 'px';
    particle.style.top = (y - 4) + 'px';
    
    const angle = (i * 72 + Math.random() * 40) * Math.PI / 180;
    const distance = 80 + Math.random() * 60;
    const dx = Math.cos(angle) * distance;
    const dy = Math.sin(angle) * distance;
    
    particle.style.setProperty('--dx', dx + 'px');
    particle.style.setProperty('--dy', dy + 'px');
    
    container.appendChild(particle);
    
    setTimeout(() => {
      if (particle.parentNode) {
        particle.parentNode.removeChild(particle);
      }
    }, 1000);
  }
  
  setTimeout(() => {
    if (explosion.parentNode) {
      explosion.parentNode.removeChild(explosion);
    }
  }, 1000);
}

function updateHealthDisplay() {
  const healthIcons = document.querySelectorAll('.health-icon');
  healthIcons.forEach((icon, index) => {
    if (index >= gameState.health) {
      icon.classList.add('lost');
    } else {
      icon.classList.remove('lost');
    }
  });
}

function updateScoreDisplay() {
  const scoreElement = document.querySelector('.score-number');
  const gradeElement = document.querySelector('.grade-display');
  const progressFill = document.querySelector('.score-progress-fill');
  const gradeCircle = document.querySelector('.grade-circle');
  
  if (scoreElement) {
    const formattedScore = Math.ceil(gameState.score).toString().padStart(7, '0');
    scoreElement.textContent = formattedScore;
  }
  
  const maxScore = 1000000;
  const progressPercentage = Math.min((gameState.score / maxScore) * 100, 100);
  
  if (progressFill) {
    progressFill.style.width = progressPercentage + '%';
  }
  
  const newGrade = calculateGrade();
  const gradeClass = `grade-${newGrade.toLowerCase()}`;
  
  if (newGrade !== gameState.grade) {
    gameState.grade = newGrade;
    
    if (gradeCircle) {
      gradeCircle.classList.add('grade-up');
      setTimeout(() => {
        gradeCircle.classList.remove('grade-up');
      }, 600);
      
      gradeCircle.classList.remove('grade-f', 'grade-c', 'grade-b', 'grade-a', 'grade-s');
      gradeCircle.classList.add(gradeClass);
    }
    
    if (progressFill) {
      progressFill.classList.remove('grade-f', 'grade-c', 'grade-b', 'grade-a', 'grade-s');
      progressFill.classList.add(gradeClass);
    }
    
    if (gradeElement) {
      gradeElement.textContent = newGrade;
      gradeElement.style.color = gradeConfig[newGrade].color;
      gradeElement.style.textShadow = `0 0 8px ${gradeConfig[newGrade].shadowColor}88`;
    }
    
    if (newGrade == 'S') {
      showDialogue(`やったね！ランクSに昇格！`);
    }
    else if (newGrade == 'A') {
      showDialogue(`すごい！ランクがAになったよ！`);
    }
    else if (newGrade == 'B') {
      showDialogue(`いい感じ！Bランク獲得！`);
    }
    else if (newGrade == 'C') {
      showDialogue(`ランク ${newGrade} にアップ！`);
    }
  }
  
  if (gradeElement && !gradeElement.style.color) {
    gradeElement.style.color = gradeConfig[newGrade].color;
  }
}

function calculateGrade() {
  for (const grade of ['S', 'A', 'B', 'C']) {
    if (gameState.score >= gradeConfig[grade].minScore) {
      return grade;
    }
  }
  return 'F';
}

function updateComboDisplay() {
  const comboElement = document.querySelector('.combo-number');
  const comboDisplay = document.querySelector('.combo-display');
  
  if (comboElement) {
    comboElement.textContent = gameState.combo;
    
    const comboContent = comboElement.closest('.combo-content');
    if (comboContent) {
      comboContent.classList.toggle('active', gameState.combo > 0);
    }
    if (comboDisplay) {
      comboDisplay.classList.toggle('high-combo', gameState.combo >= 100);
    }
  }
}

function checkComboMilestones() {
  if (gameState.combo === 50) {
    showDialogue('50 Combo！');
  } else if (gameState.combo === 100) {
    showDialogue('100 Combo！Fever');
  } else if (gameState.combo === 200) {
    showDialogue('200 Combo！Well Done');
  } else if (gameState.combo === 300) {
    showDialogue('300 Combo！Amazing！');
  }
}

function showDialogue(text) {
  const dialogueBox = document.getElementById('dialogue-box');
  const dialogueText = document.getElementById('dialogue-text');
  
  if (dialogueBox && dialogueText && text && text.trim()) {
    dialogueText.textContent = text;
    dialogueBox.classList.remove('hidden');
    dialogueBox.style.display = 'block';
    
    requestAnimationFrame(() => {
      dialogueBox.style.opacity = '1';
    });
    
    setTimeout(() => {
      requestAnimationFrame(() => {
        dialogueBox.style.opacity = '0';
    setTimeout(() => {
      dialogueBox.classList.add('hidden');
      dialogueBox.style.display = 'none';
        }, 300);
      });
    }, 2000);
  }
}

let hitResultTimer = null;

function showHitResult(quality) {
  const hitResultText = document.getElementById('hit-result-text');
  if (!hitResultText) return;
  
  if (hitResultTimer) {
    clearTimeout(hitResultTimer);
    hitResultTimer = null;
  }
  
  hitResultText.className = 'hit-result-text';
  
  hitResultText.textContent = quality.toUpperCase();
  hitResultText.classList.add(quality.toLowerCase());
  
  requestAnimationFrame(() => {
    hitResultText.classList.add('show');
  });
  
  hitResultTimer = setTimeout(() => {
    hitResultText.classList.remove('show');
    hitResultTimer = null;
  }, 1500);
}

let activeBeat = false;
function updateCursorState(isHigh) {
  const playerPage = document.getElementById('player-page');
  if (playerPage) {
    gameState.beatState = isHigh ? 'high' : 'low';
    if (isHigh && !activeBeat) {
      activeBeat = true;
      if (glowstickModeActive) {
        playerPage.classList.add('beat-glow-stick');
      } else {
      playerPage.classList.add('beat-glow');
      }
    } else if (!isHigh && activeBeat) {
      activeBeat = false;
      if (glowstickModeActive) {
        playerPage.classList.remove('beat-glow-stick');
      } else {
        playerPage.classList.remove('beat-glow');
      }
    }
  }
}

function updateMikuState(isHigh, duration) {
  const mikuImg = document.getElementById('miku-character');
  if (!mikuImg) return;
  const newState = isHigh ? 'high' : 'low';
  if (gameState.mikuState === newState) return;

  mikuImg.style.transition = `transform ${duration / 2}ms ease-in-out`;
  mikuImg.style.transform = 'rotateY(90deg)';
  setTimeout(() => {
    gameState.mikuState = newState;
    mikuImg.src = `images/miku-${newState}.png`;
    mikuImg.style.transition = null;
    mikuImg.style.transform = 'rotateY(-90deg)';
    mikuImg.style.transition = `transform ${duration / 2}ms ease-in-out`;
    mikuImg.style.transform = 'rotateY(0deg)';
  }, duration / 2);
}

function getPianoKeyInfo(keyName) {
  if (!pianoPos[keyName]) return null;
  
  const isBlackKey = keyName.includes('#');
  const keyY = pianoPos[keyName];
  const keyHeight = isBlackKey ? pianoHeight_black : pianoHeight_white;
  const keyWidth = isBlackKey ? pianoWidth_black : pianoWidth_white;
  
  return {
    y: keyY,
    height: keyHeight,
    width: keyWidth,
    isBlackKey: isBlackKey,
    centerY: keyY + keyHeight / 2
  };
}

// no key information, just use a random key
function getRandomPianoKey() {
  const keys = Object.keys(pianoPos);
  return keys[Math.floor(Math.random() * keys.length)];
}

function getPianoRollPosition() {
  const playerPage = document.getElementById('player-page');
  const pianoRoll = playerPage.querySelector('.piano-roll');
  if (!pianoRoll) return { x: 20, y: window.innerHeight * 0.1, height: 500 };
  
  return {
    x: 20,
    y: window.innerHeight * 0.1,
    height: 500
  };
}

// higher y velocity to make notes not dropping down too fast
function calculateNoteVelocity(y) {
  const vyMin = -100 - (y / 500) * 200;
  const vyMax = -50 - (y / 500) * 100;
  const vy = vyMin + Math.random() * (vyMax - vyMin);
  const vxMin = 120;
  const vxMax = Math.max(vxMin + 100, window.innerWidth * 0.4);
  const vx = vxMin + Math.random() * (vxMax - vxMin);
  
  return { vx, vy };
}

function spawnNote(char, time, duration = 500) {
  const currentConfig = window.difficultyConfig[gameState.difficulty];
  const selectedKey = getRandomPianoKey();
  const keyInfo = getPianoKeyInfo(selectedKey);
  const pianoRollPos = getPianoRollPosition();

  const x = pianoRollPos.x + keyInfo.width + 10
  const y = pianoRollPos.y + (keyInfo.centerY / 500) * pianoRollPos.height;

  let type = 'single';
  let hitCount = 1;
  
  if (duration > currentConfig.multiNote.threshold) {
    type = 'multi';
    hitCount = 2 + Math.floor((duration - currentConfig.multiNote.threshold) / currentConfig.multiNote.hitInterval);
    hitCount = Math.min(hitCount, currentConfig.multiNote.maxHitCount);
  }
  
  const note = new Note(type, char, x, y, time, duration, hitCount);
  
  const velocity = calculateNoteVelocity(keyInfo.y);
  note.vx = velocity.vx;
  note.vy = velocity.vy;
  note.keyInfo = keyInfo;
  triggerPianoKeyEffect(keyInfo);
  
  gameState.notes.push(note);
  document.getElementById('game-area').appendChild(note.element);
}

function triggerPianoKeyEffect(keyInfo) {
  const effectsLayer = document.getElementById('piano-effects-layer');
  if (!effectsLayer) return;
  
  const keyEffect = document.createElement('div');
  keyEffect.className = `piano-key-effect ${keyInfo.isBlackKey ? 'black-key' : 'white-key'}`;
  
  keyEffect.style.top = keyInfo.y - keyInfo.height / 2 + 'px';
  keyEffect.style.width = keyInfo.width + 'px';
  keyEffect.style.height = keyInfo.height + 'px';
  
  keyEffect.classList.add('active');
  setTimeout(() => {
    if (keyEffect.parentNode) {
      keyEffect.parentNode.removeChild(keyEffect);
    }
  }, 600);
  
  effectsLayer.appendChild(keyEffect);
}

function clearPianoKeyEffects() {
  const effectsLayer = document.getElementById('piano-effects-layer');
  if (effectsLayer) {
    effectsLayer.innerHTML = '';
  }
}

function spawnPseudoNote() {
  const currentConfig = window.difficultyConfig[gameState.difficulty];
  
  const selectedKey = getRandomPianoKey();
  const keyInfo = getPianoKeyInfo(selectedKey);
  const pianoRollPos = getPianoRollPosition();
  
  const x = pianoRollPos.x + keyInfo.width + 10
  const y = pianoRollPos.y + (keyInfo.centerY / 500) * pianoRollPos.height;
  
  const durationRange = currentConfig.pseudoNote.durationMax - currentConfig.pseudoNote.durationMin;
  const duration = currentConfig.pseudoNote.durationMin + Math.random() * durationRange;
  
  const note = new Note('pseudo', '! ! !', x, y, Date.now(), duration, 1);
  
  const velocity = calculateNoteVelocity(keyInfo.y);
  note.vx = velocity.vx;
  note.vy = velocity.vy;
  note.keyInfo = keyInfo;
  triggerPianoKeyEffect(keyInfo);
  
  gameState.notes.push(note);
  document.getElementById('game-area').appendChild(note.element);
}

let pseudoNoteTimer = null;

// generate pseudo notes by a random interval
function startPseudoNoteGeneration() {
  stopPseudoNoteGeneration();
  
  function scheduleNextPseudo() {
    if (!gameState.isPlaying || gameState.isPaused) {
      pseudoNoteTimer = setTimeout(scheduleNextPseudo, 1000);
      return;
    }
    
    const currentConfig = window.difficultyConfig[gameState.difficulty];
    
    const baseInterval = 3000 + Math.random() * 5000;
    const interval = baseInterval * currentConfig.pseudoNote.spawnMultiplier;
    
    pseudoNoteTimer = setTimeout(() => {
      if (gameState.isPlaying && !gameState.isPaused) {
        spawnPseudoNote();
      }
      scheduleNextPseudo();
    }, interval);
  }
  
  scheduleNextPseudo();
}

function stopPseudoNoteGeneration() {
  if (pseudoNoteTimer) {
    clearTimeout(pseudoNoteTimer);
    pseudoNoteTimer = null;
  }
}

function gameLoop() {
  if (!gameState.isPlaying) {
    return;
  }
  
  if (gameState.isPaused) {
    gameState.lastUpdateTime = null;
    requestAnimationFrame(gameLoop);
    return;
  }
  
  const now = Date.now();
  const deltaTime = gameState.lastUpdateTime ? now - gameState.lastUpdateTime : 16;
  gameState.lastUpdateTime = now;
  updateFPS(now);

  if (glowstickModeActive) {
    processGlowstickInteraction(now);
  } else {
    processMouseInteraction(now);
  }

  const notesToRemove = [];
  for (let i = gameState.notes.length - 1; i >= 0; i--) {
    const note = gameState.notes[i];
    const shouldRemove = note.update(deltaTime);
    if (shouldRemove) {
      if (!note.isHit && note.type !== 'pseudo') {
        playGameAudio('miss');
        gameState.miss++;
        gameState.combo = 0;
        showHitResult('miss');
        updateComboDisplay();
        createEffect('miss', note.x + note.width / 2, window.innerHeight);
      }
      notesToRemove.push(i);
    }
  }
  
  notesToRemove.forEach(index => {
    const note = gameState.notes[index];
    note.destroy();
    gameState.notes.splice(index, 1);
  });
  
  DOMBatcher.flushUpdates();
  
  requestAnimationFrame(gameLoop);
}

let isGameOverStarted = false;

function checkGameOver() {
  if (gameState.health <= 0 && !isGameOverStarted) {
    isGameOverStarted = true;
    stopPseudoNoteGeneration();
    const initialVolume = player ? player.volume : 100;
    const fadeDuration = 2000;
    const fadeSteps = 20;
    const fadeInterval = fadeDuration / fadeSteps;
    
    let currentStep = 0;
    const volumeFadeTimer = setInterval(() => {
      currentStep++;
      const progress = currentStep / fadeSteps;
      const newVolume = initialVolume * (1 - progress);
      
      if (player) {
        player.volume = Math.max(0, newVolume);
      }
      
      if (currentStep >= fadeSteps) {
        clearInterval(volumeFadeTimer);
      }
          }, fadeInterval);
      
      const gameOverOverlay = document.getElementById('game-over-overlay');
      if (gameOverOverlay) {
        gameOverOverlay.classList.add('active');
      }
      
      setTimeout(() => {
        endGame('failed');
      }, fadeDuration);
  }
}

async function endGame(result) {
  gameState.isPlaying = false;
  gameState.isPaused = false;
  
  stopPseudoNoteGeneration();
  
  if (player && player.isPlaying) {
    await player.requestPause();
    await player.requestStop();
  }
  
  disableCamera();
  
  let finalGrade = result === 'failed' ? 'F' : calculateGrade();
  gameState.grade = finalGrade;
  
  const resultData = {
    perfect: gameState.perfect,
    great: gameState.great,
    good: gameState.good,
    bad: gameState.bad,
    miss: gameState.miss,
    score: Math.floor(gameState.score),
    maxCombo: gameState.maxCombo,
    health: gameState.health,
    grade: finalGrade,
    currentSong: gameState.currentSong,
    result: result
  };
  
  if (window.Result) {
    window.Result.showResult(resultData);
  }
}

function cleanupGame() {
  isGameOverStarted = false;
  stopPseudoNoteGeneration();
  
  if (hitResultTimer) {
    clearTimeout(hitResultTimer);
    hitResultTimer = null;
  }
  
  disableCamera();
  cleanupGlowstickDetection();
  stopMouseEvents();
  stopGlowstickLoop();
  
  gameState.notes.forEach(note => note.destroy());
  gameState.notes = [];
  gameState.pseudoNotes = [];
  gameState.isPlaying = false;
  gameState.isPaused = false;
  
  const trailContainer = document.getElementById('mouse-trail-container');
  if (trailContainer) {
    trailContainer.innerHTML = '';
    }
    
  const effectsContainer = document.getElementById('effects-container');
  if (effectsContainer) {
    effectsContainer.innerHTML = '';
  }
  
  clearPianoKeyEffects();
  
  const playerPage = document.getElementById('player-page');
  if (playerPage) {
    playerPage.classList.remove('beat-glow');
  }
  
  const gameOverOverlay = document.getElementById('game-over-overlay');
  if (gameOverOverlay) {
    gameOverOverlay.classList.remove('active');
  }

  const dynamicStyle = document.getElementById('dynamic-beat-style');
  if (dynamicStyle) {
    dynamicStyle.remove();
  }

  const swingIndicator = document.getElementById('swing-indicator');
  if (swingIndicator) {
    swingIndicator.classList.add('hidden');
  }

  const hitResultText = document.getElementById('hit-result-text');
  if (hitResultText) {
    hitResultText.classList.remove('show');
  }
}

function resetGameState() {
  isGameOverStarted = false;
  stopPseudoNoteGeneration();
  
  if (player) {
    player.volume = 100;
  }
  
  gameState.health = window.difficultyConfig[gameState.difficulty].health;
  gameState.score = 0;
  gameState.combo = 0;
  gameState.maxCombo = 0;
  gameState.grade = 'F';
  gameState.beatState = 'low';
  gameState.mikuState = 'low';
  gameState.lastTime = -1;
  gameState.lastUpdateTime = null;
  gameState.spawnedChars = new Set();
  gameState.currentBeatIndex = -1;
  gameState.perfect = 0;
  gameState.great = 0;
  gameState.good = 0;
  gameState.bad = 0;
  gameState.miss = 0;
  
  songAnalysis = {
    totalNotes: 0,
    totalHits: 0,
    totalHitScore: 0,
    totalBeats: 0,
    isAnalyzed: false
  };
  
  initHealthDisplay();
  initFPSDisplay();
  
  const progressFill = document.querySelector('.score-progress-fill');
  const gradeCircle = document.querySelector('.grade-circle');
  const gradeElement = document.querySelector('.grade-display');
  const scoreElement = document.querySelector('.score-number');
  
  if (progressFill) {
    progressFill.style.width = '0%';
    progressFill.classList.remove('grade-f', 'grade-c', 'grade-b', 'grade-a', 'grade-s');
    progressFill.classList.add('grade-f');
  }
  
  if (gradeCircle) {
    gradeCircle.classList.remove('grade-f', 'grade-c', 'grade-b', 'grade-a', 'grade-s');
    gradeCircle.classList.add('grade-f');
  }
  
  if (gradeElement) {
    gradeElement.textContent = 'F';
    gradeElement.style.color = gradeConfig['F'].color;
  }
  
  if (scoreElement) {
    scoreElement.textContent = '0000000';
  }
  
  updateScoreDisplay();
  updateComboDisplay();
  
  cleanupGame();
}

function getCurrentDifficulty() {
  const activeDifficultyBtn = document.querySelector('.difficulty-btn.active');
  if (activeDifficultyBtn) {
    if (activeDifficultyBtn.classList.contains('easy')) return 'easy';
    if (activeDifficultyBtn.classList.contains('normal')) return 'normal';
    if (activeDifficultyBtn.classList.contains('hard')) return 'hard';
  }
  return 'normal';
}

function createDynamicBeatGlowAnimation(duration) {
  let styleSheet = document.getElementById('dynamic-beat-style');
  if (!styleSheet) {
    styleSheet = document.createElement('style');
    styleSheet.id = 'dynamic-beat-style';
    document.head.appendChild(styleSheet);
  }
  
  const animationCSS = `
    .beat-glow::before {
      animation-duration: ${duration}ms !important;
    }
  `;
  
  styleSheet.textContent = animationCSS;
}

let beatBase = 2;
let beatPM = 117;
let beatDuration;
let beatDelay;

async function startGame(song) {
  const songConfig = songsConfig[song.id];
  
  if (songConfig) {
      gameState.difficulty = getCurrentDifficulty();
      const interactionMode = window.SongSelection ? window.SongSelection.getInteractionMode() : { isGlowStickMode: false };
      
      setCurrentSong(song);
      showPlayer();
      resetGameState();
      
    document.querySelector("#overlay").className = "";
    document.querySelector("#pause-btn").disabled = true;
    
      if (interactionMode.isGlowStickMode) {
      const initSuccess = await initGlowstickDetection();
      if (initSuccess) {
        await enableCamera();
      }
      }
      
      beatBase = songConfig.beatBase;
      beatPM = songConfig.beatPM;
      beatDuration = 60000 / beatPM / beatBase;
      beatDelay = 36000 / beatPM;
      
      await player.createFromSongUrl(songConfig.url, {
        video: songConfig.video
      });

      if (beatBase == 2) {
        createDynamicBeatGlowAnimation(beatDuration);
      } else {
        createDynamicBeatGlowAnimation(beatDuration * 3 / 2);
    }
  }
}

function initPlayer() {
  player = new Player({
    app: {
      token: "JNTa0zViko8kdTxb"
    },
    mediaElement: document.querySelector("#media"),
    mediaBannerPosition: "bottom right"
  });

  player.addListener({
    onAppReady(app) {
      if (app.managed) {
        document.querySelector("#pause-btn").style.display = "none";
      }
      document.querySelector("#media").className = "disabled";
    },

    onAppMediaChange() {
      document.querySelector("#pause-btn").disabled = true;
    },

    onVideoReady(video) {
      let beatLength = 0;
      
      beatsArray = player._data.songProvider._analysis.beats;
      beatLength = beatsArray.length;
      analyzeSongAndCalculateScores(video, beatLength);
    },

    onTimerReady() {
      document.querySelector("#overlay").className = "disabled";
      document.querySelector("#pause-btn").disabled = false;
      gameState.isPlaying = true;
      gameState.isPaused = false;
      gameLoop();
      
      startPseudoNoteGeneration();
      setupInteractionEvents();
      if (player && !player.isPlaying) {
        player.requestPlay();
      }
    },

    // get beat and lyrics information from TextAlive Player
    onTimeUpdate(position) {
      if (!gameState.isPlaying) return;
      
      const video = player.video;
      if (!video) return;

      const futureTime = position + (beatDuration / 2);
      const futureBeats = player.findBeatChange(gameState.lastTime, futureTime);
      if (futureBeats.entered.length > 0) {
        const latestBeat = futureBeats.entered[futureBeats.entered.length - 1];
        gameState.currentBeatIndex = latestBeat.index;
        
        updateCursorState(true);
        setTimeout(() => {
          updateCursorState(false);
        }, beatDuration);
        const isEvenBeat = (latestBeat.index % beatBase) === 0;
        setTimeout(() => {
          updateMikuState(isEvenBeat, beatDuration);
        }, beatDelay);
        
      }
      
      const currentConfig = window.difficultyConfig[gameState.difficulty];
      let textUnits = {entered: []};
      if (currentConfig.textUnit === 'phrase') {
        textUnits = player.video ? player.video.findPhraseChange(gameState.lastTime < 0 ? gameState.lastTime : gameState.lastTime + 500, position + 500) : {entered: []};
      } else if (currentConfig.textUnit === 'word') {
        textUnits = player.video ? player.video.findWordChange(gameState.lastTime < 0 ? gameState.lastTime : gameState.lastTime + 500, position + 500) : {entered: []};
      } else {
        textUnits = player.video ? player.video.findCharChange(gameState.lastTime < 0 ? gameState.lastTime : gameState.lastTime + 500, position + 500) : {entered: []};
      }
      
      textUnits.entered.forEach(unit => {
        if (!gameState.spawnedChars) gameState.spawnedChars = new Set();
        
        const unitKey = `${unit.text}_${unit.startTime}`;
        if (!gameState.spawnedChars.has(unitKey)) {
          gameState.spawnedChars.add(unitKey);
          
          const duration = unit.endTime - unit.startTime;
          spawnNote(unit.text, unit.startTime, duration);
        }
      });
      
      gameState.lastTime = position;
    },

    onPlay() {
      gameState.isPaused = false;
      gameState.lastUpdateTime = null;
    },

    onPause() {
      gameState.isPaused = true;
      
      if (player.video && player.timer) {
        const position = player.timer.position;
        const duration = player.video.duration;
        const isNearEnd = duration - position < 1000;
        
        if (isNearEnd && gameState.isPlaying && gameState.health > 0) {
          const gameOverOverlay = document.getElementById('game-over-overlay');
          if (gameOverOverlay) {
            gameOverOverlay.classList.add('active');
          }
          
          setTimeout(() => {
            endGame('completed');
          }, 2000);
        }
      }
    },

    onStop() {
      if (gameState.isPlaying) {
        if (gameState.health > 0) {
          const gameOverOverlay = document.getElementById('game-over-overlay');
          if (gameOverOverlay) {
            gameOverOverlay.classList.add('active');
          }
          
          setTimeout(() => {
            endGame('completed');
          }, 2000);
        }
      }
    }
  });
}

function setCurrentSong(song) {
  gameState.currentSong = song;
}

function showPauseModal() {
  const modal = document.getElementById('pause-modal');
  if (modal) {
    modal.classList.remove('hidden');
  }
  if (player && player.isPlaying) {
    player.requestPause();
  }
}

function hidePauseModal() {
  document.getElementById('pause-modal').classList.add('hidden');
}

async function exitGame() {
  hidePauseModal();
  
  if (player) {
    if (player.isPlaying) {
    await player.requestPause();
    }
    await player.requestStop();
  }
  
  gameState.isPlaying = false;
  gameState.isPaused = false;
  hidePlayer();
}

async function restartGameFromPause() {
  hidePauseModal();
  
  if (gameState.currentSong) {
      if (player) {
        if (player.isPlaying) {
          await player.requestPause();
        }
        await player.requestStop();
      }
      await new Promise(resolve => setTimeout(resolve, 100));
    await startGame(gameState.currentSong);
  }
}

function continuePause() {
  hidePauseModal();
  
  if (player && !player.isPlaying && gameState.isPlaying && gameState.isPaused) {
    gameState.isPaused = false;
    gameState.lastUpdateTime = null;
    player.requestPlay();
  }
}

document.addEventListener('DOMContentLoaded', () => {
  preloadAudio();
  initPlayer();
  document.getElementById('pause-btn').addEventListener('click', showPauseModal);
  
  const exitBtn = document.getElementById('exit-btn');
  const restartBtn = document.getElementById('restart-btn');
  const continueBtn = document.getElementById('continue-btn');
  
  if (exitBtn) {
    exitBtn.addEventListener('click', () => {
      exitGame();
    });
  }
  
  if (restartBtn) {
    restartBtn.addEventListener('click', async (e) => {
      e.preventDefault();
      e.stopPropagation();
        await restartGameFromPause();
    });
  }
  
  if (continueBtn) {
    continueBtn.addEventListener('click', () => {
      continuePause();
    });
  }
  
  const pauseModal = document.getElementById('pause-modal');
  if (pauseModal) {
    pauseModal.addEventListener('click', (e) => {
    });
  }
});

window.Player = {
  showPlayer,
  hidePlayer,
  startGame
};

window.FullscreenManager = fullscreenManager; 