// song selection module

// song information
const songs = [
  {
    id: 'streetlight',
    title: 'ストリートライト',
    artist: '加賀(ネギシャワーP)',
    illustrator: 'からながれ',
    vocalist: '初音ミク、鏡音リン、鏡音レン、巡音ルカ、KAITO、MEIKO',
    duration: '3:16',
    bpm: 117,
    cover: 'images/streetlight.jpg',
    preview: 'audios/streetlight.wav'
  },
  {
    id: 'alifration',
    title: 'アリフレーション',
    artist: '雨良 Amala',
    illustrator: 'Sirotuki',
    vocalist: '初音ミク',
    duration: '3:54',
    bpm: 130,
    cover: 'images/alifration.jpg',
    preview: 'audios/alifration.wav'
  },
  {
    id: 'informal',
    title: 'インフォーマルダイブ',
    artist: '99piano',
    illustrator: '99piano',
    vocalist: '鏡音リン',
    duration: '2:55',
    bpm: 195,
    cover: 'images/informal.jpg',
    preview: 'audios/informal.wav'
  },
  {
    id: 'hello',
    title: 'ハロー、フェルミ。',
    artist: 'ど～ぱみん',
    illustrator: 'アルセチカ',
    vocalist: '初音ミク',
    duration: '3:47',
    bpm: 181,
    cover: 'images/hello.jpg',
    preview: 'audios/hello.wav'
  },
  {
    id: 'parade',
    title: 'パレードレコード',
    artist: 'きさら',
    illustrator: 'きさら',
    vocalist: '初音ミク',
    duration: '3:37',
    bpm: 146,
    cover: 'images/parade.jpg',
    preview: 'audios/parade.wav'
  },
  {
    id: 'lonely',
    title: 'ロンリーラン',
    artist: '海風太陽',
    illustrator: '神侖',
    vocalist: '初音ミク',
    duration: '4:04',
    bpm: 100,
    cover: 'images/lonely.jpg',
    preview: 'audios/lonely.wav'
  }
];

// flags and global status variables
let currentSongIndex = 0;
let previewAudio = null;
let userHasInteracted = false;
let isPreviewMuted = false;
let isAnimating = false;
let coverCarousel = null;
let coverElements = [];
let currentCenterIndex = 2;

function setupCanvasSize() {
  if (!canvas) return;
  setTimeout(() => {
    const rect = canvas.getBoundingClientRect();
    const width = rect.width > 0 ? rect.width : 280;
    const height = rect.height > 0 ? rect.height : 50;
    canvas.width = width;
    canvas.height = height;
    if (canvasCtx) {
      canvasCtx = canvas.getContext('2d');
    }
  }, 100);
}

// for responsive cover spacing
function getCoverSpacing() {
  const screenWidth = window.innerWidth;
  if (screenWidth <= 480) {
    return 200;
  } else if (screenWidth <= 768) {
    return 250;
  } else {
    return 300;
  }
}

// parameters for frequency map
let audioContext = null;
let analyser = null;
let source = null;
let dataArray = null;
let bufferLength = 0;
let canvas = null;
let canvasCtx = null;
let animationFrame = null;
let isGlowStickModeEnabled = false;

// for song preview and frequency map
function initAudioContext() {
if (!audioContext) {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
    analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    bufferLength = analyser.frequencyBinCount;
    dataArray = new Uint8Array(bufferLength);
    
    canvas = document.getElementById('spectrum-canvas');
    if (canvas) {
      setupCanvasSize();
      canvasCtx = canvas.getContext('2d');
    }
  }
}

// connect audio source to frequency analyser
function connectAudioSource() {
  if (audioContext && analyser && previewAudio && !source) {
    source = audioContext.createMediaElementSource(previewAudio);
    source.connect(analyser);
    analyser.connect(audioContext.destination);
  }
}

function drawSpectrum() {
  if (!analyser || !canvasCtx || !canvas) return;
  
  animationFrame = requestAnimationFrame(drawSpectrum);
  analyser.getByteFrequencyData(dataArray);
  canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  
  const barCount = 24;
  const barWidth = (canvas.width - (barCount - 1) * 1.5) / barCount;
  let barHeight;
  let x = 0;
  
  const usableFreqRange = Math.floor(bufferLength * 0.6);
  
  for (let i = 0; i < barCount; i++) {
    const dataIndex = Math.floor(i * usableFreqRange / barCount);
    const rawHeight = dataArray[dataIndex] / 255;
    
    let enhancedHeight;    
    enhancedHeight = Math.pow(rawHeight, 2 * barCount / (i + 24));
    barHeight = enhancedHeight * canvas.height;
    
    barHeight = Math.max(barHeight, 1.5);
    const gradient = canvasCtx.createLinearGradient(0, canvas.height, 0, 0);
    const intensity = enhancedHeight;
    const freqRatio = i / barCount;
    
    if (freqRatio < 0.3) {
      gradient.addColorStop(0, `rgba(69, 183, 209, ${0.7 + intensity * 0.3})`);
      gradient.addColorStop(1, `rgba(78, 205, 196, ${0.5 + intensity * 0.5})`);
    } else if (freqRatio < 0.7) {
      gradient.addColorStop(0, `rgba(78, 205, 196, ${0.7 + intensity * 0.3})`);
      gradient.addColorStop(1, `rgba(150, 206, 180, ${0.5 + intensity * 0.5})`);
    } else {
      gradient.addColorStop(0, `rgba(150, 206, 180, ${0.6 + intensity * 0.4})`);
      gradient.addColorStop(1, `rgba(255, 206, 84, ${0.4 + intensity * 0.6})`);
    }
    canvasCtx.fillStyle = gradient;
    
    const radius = 1.5;
    canvasCtx.beginPath();
    if (canvasCtx.roundRect) {
      canvasCtx.roundRect(x, canvas.height - barHeight, barWidth, barHeight, [radius, radius, 0, 0]);
    } else {
      canvasCtx.rect(x, canvas.height - barHeight, barWidth, barHeight);
    }
    canvasCtx.fill();
    
    if (intensity > 0.6) {
      canvasCtx.shadowColor = freqRatio < 0.5 ? '#4ecdc4' : '#ffce54';
      canvasCtx.shadowBlur = 4;
      canvasCtx.fill();
      canvasCtx.shadowBlur = 0;
    }
    
    x += barWidth + 1.5;
  }
}

function stopSpectrum() {
  if (animationFrame) {
    cancelAnimationFrame(animationFrame);
    animationFrame = null;
  }
  if (canvasCtx && canvas) {
    canvasCtx.clearRect(0, 0, canvas.width, canvas.height);
  }
}

function createAudioElement() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio = null;
    source = null;
  }
  
  previewAudio = new Audio();
  previewAudio.loop = true;
  previewAudio.volume = 0.8;
  previewAudio.addEventListener('loadeddata', () => {
    if (userHasInteracted && !isPreviewMuted) {
      previewAudio.play();
    }
  });
  
  previewAudio.addEventListener('play', () => {
    initAudioContext();
    connectAudioSource();
    drawSpectrum();
  });
  previewAudio.addEventListener('pause', () => {
    stopSpectrum();
  });
}

// preview button to stop song preview and turn off the spectrum
function updatePreviewButton() {
  const toggleBtn = document.getElementById('preview-toggle');
  if (toggleBtn) {
    const icon = toggleBtn.querySelector('i');
    const coverContainer = document.getElementById('song-cover-container');
    
    if (isPreviewMuted) {
      toggleBtn.classList.add('muted');
      toggleBtn.classList.remove('playing');
      if (icon) {
        icon.classList.remove('fa-volume-up');
        icon.classList.add('fa-volume-mute');
        if (!icon.classList.contains('fas')) {
          icon.classList.add('fas');
        }
      }
      if (coverContainer) coverContainer.classList.remove('playing');
    } else {
      toggleBtn.classList.remove('muted');
      toggleBtn.classList.add('playing');
      if (icon) {
        icon.classList.remove('fa-volume-mute');
        icon.classList.add('fa-volume-up');
        if (!icon.classList.contains('fas')) {
          icon.classList.add('fas');
        }
      }
      if (coverContainer) coverContainer.classList.add('playing');
    }
  }
}

function togglePreviewAudio() {
  if (!userHasInteracted) {
    enableAudioAfterInteraction();
    return;
  }
  
  isPreviewMuted = !isPreviewMuted;
  if (previewAudio) {
    if (isPreviewMuted) {
      previewAudio.pause();
    } else {
      const currentSong = getCurrentSong();
      playPreview(currentSong);
      return;
    }
  } else if (!isPreviewMuted) {
    const currentSong = getCurrentSong();
    playPreview(currentSong);
    return;
  }
  
  updatePreviewButton();
}

function playPreview(song) {
  if (!song.preview || !userHasInteracted) return;
  
  createAudioElement();
  previewAudio.src = song.preview;
  
  const coverContainer = document.getElementById('song-cover-container');
  if (coverContainer) {
    coverContainer.classList.add('playing');
  }
  
  const spectrumContainer = document.getElementById('audio-spectrum');
  if (spectrumContainer) {
    spectrumContainer.classList.add('playing');
  }
  
  updatePreviewButton();
}

function stopPreview() {
  if (previewAudio) {
    previewAudio.pause();
    previewAudio.currentTime = 0;
  }
  
  stopSpectrum();
  const coverContainer = document.getElementById('song-cover-container');
  if (coverContainer) {
    coverContainer.classList.remove('playing');
  }
  
  const spectrumContainer = document.getElementById('audio-spectrum');
  if (spectrumContainer) {
    spectrumContainer.classList.remove('playing');
  }
}

function enableAudioAfterInteraction() {
  if (!userHasInteracted) {
    userHasInteracted = true;
    
    initAudioContext();
    
    if (audioContext && audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    const welcomePage = document.getElementById('welcome-page');
    if (welcomePage) {
      welcomePage.classList.add('hidden');
      setTimeout(() => {
        if (welcomePage.parentNode) {
          welcomePage.parentNode.removeChild(welcomePage);
        }
      }, 800);
    }
    
    // show song selection page
    const songSelection = document.getElementById('song-selection');
    if (songSelection) {
      songSelection.classList.remove('hidden');
    }
    
    const currentSong = getCurrentSong();
    playPreview(currentSong);
    
    updatePreviewButton();
  }
}

function updateSongInfo() {
  const song = songs[currentSongIndex];
  document.querySelector('.song-title').textContent = song.title;
  document.querySelector('.song-details').innerHTML = `
    <p><i class="fas fa-user"></i> ${song.artist}</p>
    <p><i class="fas fa-palette"></i> ${song.illustrator}</p>
    <p><i class="fas fa-microphone"></i> ${song.vocalist}</p>
    <p><i class="fas fa-clock"></i> Duration: ${song.duration}</p>
    <p><i class="fas fa-tachometer-alt"></i> BPM: ${song.bpm}</p>
  `;
  
  if (userHasInteracted && !isPreviewMuted) {
    playPreview(song);
  } else if (userHasInteracted && isPreviewMuted) {
    createAudioElement();
    previewAudio.src = song.preview;
  }
}

// five cover carousel system
function initCoverCarousel() {
  coverCarousel = document.querySelector('.cover-carousel');
  coverCarousel.innerHTML = '';
  
  for (let i = 0; i < 5; i++) {
    const coverDiv = document.createElement('div');
    coverDiv.className = 'cover-item';
    coverDiv.setAttribute('data-index', i);
    
    const img = document.createElement('img');
    img.alt = 'Song Cover';
    coverDiv.appendChild(img);
    
      if (i === 2) {
        coverDiv.classList.add('main-cover');
        coverDiv.id = 'song-cover-container';
        
        const previewBtn = document.createElement('button');
        previewBtn.className = 'preview-toggle-btn';
        previewBtn.id = 'preview-toggle';
        previewBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        coverDiv.appendChild(previewBtn);
      } else {
        coverDiv.classList.add('side-cover');
        if (i < 2) {
          coverDiv.classList.add('left-cover');
        } else {
          coverDiv.classList.add('right-cover');
        }
      }
    
    coverElements.push(coverDiv);
    coverCarousel.appendChild(coverDiv);
  }
  
  updateCoverPositions();
  updateAllCovers();
  coverCarousel.removeEventListener('click', handleCoverClick);
  coverCarousel.addEventListener('click', handleCoverClick);
  coverCarousel.addEventListener('mouseenter', handleCoverHover, true);
  coverCarousel.addEventListener('mouseleave', handleCoverLeave, true);
  setupResponsiveListener();
}

function handleCoverClick(event) {
  if (isAnimating) return;
  
  let clickedCover = event.target;
  while (clickedCover && !clickedCover.classList.contains('cover-item')) {
    clickedCover = clickedCover.parentElement;
  }
  
  if (!clickedCover) return;
  
  if (event.target.closest('.preview-toggle-btn')) {
    event.stopPropagation();
    togglePreviewAudio();
    return;
  }
  
  const coverIndex = parseInt(clickedCover.getAttribute('data-index'));
  
  if (coverIndex === 2) {
    enableAudioAfterInteraction();
    const currentSong = getCurrentSong();
    stopPreview();
    if (window.Player && typeof window.Player.startGame === 'function') {
      window.Player.startGame(currentSong);
    }
  } else if (coverIndex === 1) {
    prevSong();
  } else if (coverIndex === 3) {
    nextSong();
  }
}

function updateAllCovers() {
  for (let i = 0; i < 5; i++) {
    const songIndex = getSongIndexForPosition(i);
    const img = coverElements[i].querySelector('img');
    if (img && songs[songIndex]) {
      img.src = songs[songIndex].cover;
    }
  }
  
  updateSongInfo();
}

function getSongIndexForPosition(position) {
  const offset = position - currentCenterIndex;
  return (currentSongIndex + offset + songs.length * 2) % songs.length;
}

// translate of covers
function updateCoverPositions() {
  const spacing = getCoverSpacing();
  coverElements.forEach((cover, index) => {
    const xPos = (index - currentCenterIndex) * spacing;
    
    if (index === 0 || index === 4) {
      cover.style.transform = `translateX(${xPos}px) scale(0.8)`;
      cover.style.opacity = '0';
      cover.style.pointerEvents = 'none';
      cover.style.zIndex = '0';
    } else if (index === 1) {
      cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(5deg) scale(0.9)`;
      cover.style.opacity = '0.7';
      cover.style.pointerEvents = 'auto';
      cover.style.zIndex = '1';
      cover.style.transition = 'all 0.3s ease';
      cover.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.2)';
    } else if (index === 3) {
      cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(-5deg) scale(0.9)`;
      cover.style.opacity = '0.7';
      cover.style.pointerEvents = 'auto';
      cover.style.zIndex = '1';
      cover.style.transition = 'all 0.3s ease';
      cover.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.2)';
    } else {
      cover.style.transform = `translateX(${xPos}px) scale(1)`;
      cover.style.opacity = '1';
      cover.style.pointerEvents = 'auto';
      cover.style.zIndex = '2';
    }
  });
}

function nextSong() {
  enableAudioAfterInteraction();
  if (!slideToNext()) {
    currentSongIndex = (currentSongIndex + 1) % songs.length;
    updateAllCovers();
  }
}

function prevSong() {
  enableAudioAfterInteraction();
  if (!slideToPrev()) {
    currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    updateAllCovers();
  }
}

function randomSong() {
  enableAudioAfterInteraction();
  if (!animateRandom()) {
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * songs.length);
    } while (newIndex === currentSongIndex);
    currentSongIndex = newIndex;
    updateAllCovers();
  }
}

function getCurrentSong() {
  return songs[currentSongIndex];
}

// delete the leftmost cover and add the new cover to the rightmost
function slideToNext() {
  if (isAnimating) return false;
  isAnimating = true;
  coverCarousel.classList.add('animating');
  
  const newCover = createNewCover();
  const newSongIndex = getSongIndexForPosition(5);
  const img = newCover.querySelector('img');
  if (img && songs[newSongIndex]) {
    img.src = songs[newSongIndex].cover;
  }
  
  const spacing = getCoverSpacing();
  newCover.className = 'cover-item side-cover right-cover';
  newCover.setAttribute('data-index', '5');
  newCover.style.position = 'absolute';
  newCover.style.transform = `translateX(${spacing * 2}px) scale(0.8)`;
  newCover.style.opacity = '0';
  newCover.style.pointerEvents = 'none';
  newCover.style.zIndex = '0';
  newCover.style.visibility = 'hidden';
  coverCarousel.appendChild(newCover);
  newCover.offsetHeight;
  newCover.style.visibility = 'visible';
  
  setTimeout(() => {
    coverElements.forEach((cover, index) => {
      const newPos = index - 1;
      const xPos = (newPos - currentCenterIndex) * spacing;
      if (newPos === 0 || newPos === 4 || newPos < 0) {
        cover.style.transform = `translateX(${xPos}px) scale(0.8)`;
      } else if (newPos === 1) {
        cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(5deg) scale(0.9)`;
      } else if (newPos === 3) {
        cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(-5deg) scale(0.9)`;
      } else if (newPos === 2) {
        cover.style.transform = `translateX(${xPos}px) scale(1)`;
      }
      cover.style.transition = 'all 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)';
      updateCoverStyleForPosition(cover, newPos);
    });
  }, 50);
  
  setTimeout(() => {
    const leftmostCover = coverElements.shift();
    coverCarousel.removeChild(leftmostCover);
    coverElements.push(newCover);
    currentSongIndex = (currentSongIndex + 1) % songs.length;
    resetCoverElements();
    updateCoverDataIndices();
    coverCarousel.classList.remove('animating');
    isAnimating = false;
    updateSongInfo();
  }, 650);
  
  return true;
}

// reverse of the slideToNext function
function slideToPrev() {
  if (isAnimating) return false;
  isAnimating = true;
  coverCarousel.classList.add('animating');
  
  const newCover = createNewCover();
  const newSongIndex = getSongIndexForPosition(-1);
  const img = newCover.querySelector('img');
  if (img && songs[newSongIndex]) {
    img.src = songs[newSongIndex].cover;
  }
  
  const spacing = getCoverSpacing();
  newCover.className = 'cover-item side-cover left-cover';
  newCover.setAttribute('data-index', '-1');
  newCover.style.position = 'absolute';
  newCover.style.transform = `translateX(-${spacing * 2}px) scale(0.8)`;
  newCover.style.opacity = '0';
  newCover.style.pointerEvents = 'none';
  newCover.style.zIndex = '0';
  newCover.style.visibility = 'hidden';
  coverCarousel.insertBefore(newCover, coverElements[0]);
  newCover.offsetHeight;
  newCover.style.visibility = 'visible';
  
  setTimeout(() => {
    coverElements.forEach((cover, index) => {
      const newPos = index + 1;
      const xPos = (newPos - currentCenterIndex) * spacing;
      if (newPos === 0 || newPos === 4 || newPos > 4) {
        cover.style.transform = `translateX(${xPos}px) scale(0.8)`;
      } else if (newPos === 1) {
        cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(5deg) scale(0.9)`;
      } else if (newPos === 3) {
        cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(-5deg) scale(0.9)`;
      } else if (newPos === 2) {
        cover.style.transform = `translateX(${xPos}px) scale(1)`;
      }
      cover.style.transition = 'all 0.6s cubic-bezier(0.4, 0.0, 0.2, 1)';
      updateCoverStyleForPosition(cover, newPos);
    });
  }, 50);
  
  setTimeout(() => {
    const rightmostCover = coverElements.pop();
    coverCarousel.removeChild(rightmostCover);
    coverElements.unshift(newCover);
    currentSongIndex = (currentSongIndex - 1 + songs.length) % songs.length;
    resetCoverElements();
    updateCoverDataIndices();
    coverCarousel.classList.remove('animating');
    isAnimating = false;
    updateSongInfo();
  }, 650);
  
  return true;
}

function createNewCover() {
  const coverDiv = document.createElement('div');
  coverDiv.className = 'cover-item';
  const img = document.createElement('img');
  img.alt = 'Song Cover';
  coverDiv.appendChild(img);
  
  return coverDiv;
}

function updateCoverStyleForPosition(cover, position) {
  if (position === 0 || position === 4 || position < 0 || position > 4) {
    cover.style.opacity = '0';
    cover.style.pointerEvents = 'none';
    cover.style.zIndex = '0';
  } else if (position === 1 || position === 3) {
    cover.style.opacity = '0.7';
    cover.style.pointerEvents = 'auto';
    cover.style.zIndex = '1';
  } else if (position === 2) {
    cover.style.opacity = '1';
    cover.style.pointerEvents = 'auto';
    cover.style.zIndex = '2';
  }
}

function resetCoverElements() {
  coverElements.forEach((cover, index) => {
    cover.style.transition = '';
    cover.setAttribute('data-index', index);
    cover.className = 'cover-item';
    if (index === 2) {
      cover.classList.add('main-cover');
      cover.id = 'song-cover-container';
      
      if (!cover.querySelector('.preview-toggle-btn')) {
        const previewBtn = document.createElement('button');
        previewBtn.className = 'preview-toggle-btn';
        previewBtn.id = 'preview-toggle';
        
        if (isPreviewMuted) {
          previewBtn.classList.add('muted');
          previewBtn.innerHTML = '<i class="fas fa-volume-mute"></i>';
        } else {
          previewBtn.innerHTML = '<i class="fas fa-volume-up"></i>';
        }
        cover.appendChild(previewBtn);
      } else {
        const existingBtn = cover.querySelector('.preview-toggle-btn');
        updateButtonState(existingBtn);
      }
    } else {
      cover.classList.add('side-cover');
      if (index < 2) {
        cover.classList.add('left-cover');
      } else {
        cover.classList.add('right-cover');
      }
      cover.removeAttribute('id');
      const existingBtn = cover.querySelector('.preview-toggle-btn');
      if (existingBtn) {
        cover.removeChild(existingBtn);
      }
    }
  });
  
  updateCoverPositions();
  setTimeout(() => {
    updatePreviewButton();
  }, 10);
}

function updateCoverDataIndices() {
  coverElements.forEach((cover, index) => {
    cover.setAttribute('data-index', index);
  });
}

function setupResponsiveListener() {
  let resizeTimeout;
  
  window.addEventListener('resize', () => {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(() => {
      if (!isAnimating) {
        updateCoverPositions();
      }
    }, 100);
  });
  
  window.addEventListener('orientationchange', () => {
    setTimeout(() => {
      if (!isAnimating) {
        updateCoverPositions();
      }
    }, 200);
  });
}

function handleCoverHover(event) {
  if (isAnimating) return;
  
  let hoveredCover = event.target;
  while (hoveredCover && !hoveredCover.classList.contains('cover-item')) {
    hoveredCover = hoveredCover.parentElement;
  }
  
  if (!hoveredCover) return;
  
  const coverIndex = parseInt(hoveredCover.getAttribute('data-index'));
  
  if (coverIndex === 1 || coverIndex === 3) {
    applyCoverHoverEffect(hoveredCover, coverIndex);
  }
}

function handleCoverLeave(event) {
  if (isAnimating) return;
  
  let leftCover = event.target;
  while (leftCover && !leftCover.classList.contains('cover-item')) {
    leftCover = leftCover.parentElement;
  }
  
  if (!leftCover) return;
  
  const coverIndex = parseInt(leftCover.getAttribute('data-index'));
  
  if (coverIndex === 1 || coverIndex === 3) {
    removeCoverHoverEffect(leftCover, coverIndex);
  }
}

function applyCoverHoverEffect(cover, index) {
  const spacing = getCoverSpacing();
  const xPos = (index - currentCenterIndex) * spacing;
  
  if (index === 1) {
    cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(5deg) scale(0.95)`;
    cover.style.opacity = '0.9';
    cover.style.boxShadow = '0 12px 35px rgba(0, 0, 0, 0.3)';
  } else if (index === 3) {
    cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(-5deg) scale(0.95)`;
    cover.style.opacity = '0.9';
    cover.style.boxShadow = '0 12px 35px rgba(0, 0, 0, 0.3)';
  }
}

function removeCoverHoverEffect(cover, index) {
  const spacing = getCoverSpacing();
  const xPos = (index - currentCenterIndex) * spacing;
  
  if (index === 1) {
    cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(5deg) scale(0.9)`;
    cover.style.opacity = '0.7';
    cover.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.2)';
  } else if (index === 3) {
    cover.style.transform = `translateX(${xPos}px) perspective(400px) rotateY(-5deg) scale(0.9)`;
    cover.style.opacity = '0.7';
    cover.style.boxShadow = '0 8px 25px rgba(0, 0, 0, 0.2)';
  }
}

// random song animation
function animateRandom() {
  if (isAnimating) return false;
  
  isAnimating = true;
  
  coverElements.forEach((cover, index) => {
    if (index >= 1 && index <= 3) {
      if (index === 2) {
        cover.classList.add('random-shuffle');
      } else {
        cover.classList.add('random-shuffle-side');
      }
    }
  });
  
  setTimeout(() => {
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * songs.length);
    } while (newIndex === currentSongIndex);
    currentSongIndex = newIndex;
    updateAllCovers();
  }, 300);
  
  setTimeout(() => {
    coverElements.forEach(cover => {
      cover.classList.remove('random-shuffle', 'random-shuffle-side');
    });
    isAnimating = false;
  }, 600);
  
  return true;
}

function initInteractionModeToggle() {
  const glowStickToggle = document.getElementById('glow-stick-mode');
  if (glowStickToggle) {
    glowStickToggle.addEventListener('change', async (e) => {
      isGlowStickModeEnabled = e.target.checked;
      
      const toggleSlider = glowStickToggle.parentElement.querySelector('.toggle-slider');
      if (toggleSlider) {
        if (isGlowStickModeEnabled) {
          toggleSlider.style.transform = 'scale(1.1)';
          setTimeout(() => {
            toggleSlider.style.transform = '';
          }, 200);
        }
      }
    });
  }
}

function getInteractionMode() {
  return {
    isGlowStickMode: isGlowStickModeEnabled,
    mode: isGlowStickModeEnabled ? 'glow-stick' : 'mouse'
  };
}

function initSongSelection() {
  initCoverCarousel();
  initInteractionModeToggle();

  document.getElementById('random-song').addEventListener('click', randomSong);
  document.querySelectorAll('.difficulty-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.difficulty-btn').forEach(b => b.classList.remove('active'));
      e.target.classList.add('active');
    });
  });
}

function showSongSelection() {
  const songSelection = document.getElementById('song-selection');
  songSelection.classList.remove('hidden');
  songSelection.style.display = '';
  document.getElementById('tutorial-page').classList.add('hidden');
  document.getElementById('player-page').classList.add('hidden'); 
  updatePreviewButton();
  
  if (userHasInteracted && (!previewAudio || previewAudio.paused)) {
    const currentSong = getCurrentSong();
    playPreview(currentSong);
  }
}

function hideSongSelection(stopAudio = true) {
  const songSelection = document.getElementById('song-selection');
  songSelection.classList.add('hidden');
  if (stopAudio) {
    stopPreview();
  }
}

window.SongSelection = {
  init: initSongSelection,
  show: showSongSelection,
  hide: hideSongSelection,
  enableAudio: enableAudioAfterInteraction,
  stopPreview: stopPreview,
  getInteractionMode: getInteractionMode,
  songs: songs
}; 