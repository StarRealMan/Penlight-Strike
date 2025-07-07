// result page module

// result parameters
let resultState = {
  gameData: {},
  achievement: 'live-clear',
  mikuState: 'normal',
  resultAudio: null,
  mikuAudio: null,
  mikuVoiceTimeout: null
};

const mikuDialogues = {
  S: {
    image: 'images/miku-laugh.png',
    dialogue: 'すごい！パーフェクトなパフォーマンス！！',
    audio: 'audios/voice-0.wav'
  },
  A: {
    image: 'images/miku-laugh.png',
    dialogue: 'ナイスパフォーマンス！',
    audio: 'audios/voice-1.wav'
  },
  B: {
    image: 'images/miku-normal.png',
    dialogue: 'いいね！この調子でがんばって！',
    audio: 'audios/voice-2.wav'
  },
  C: {
    image: 'images/miku-normal.png',
    dialogue: 'まだまだいけるよ！ファイト！',
    audio: 'audios/voice-3.wav'
  },
  F: {
    image: 'images/miku-cry.png',
    dialogue: '気にしないで、次こそは！',
    audio: 'audios/voice-4.wav'
  }
};

const achievements = {
  allPerfect: {
    text: 'ALL PERFECT',
    class: 'achievement-all-perfect'
  },
  fullCombo: {
    text: 'FULL COMBO',
    class: 'achievement-full-combo'
  },
  liveClear: {
    text: 'LIVE CLEAR',
    class: 'achievement-live-clear'
  },
  liveFailed: {
    text: 'LIVE FAILED',
    class: 'achievement-live-failed'
  }
};

// result audio
function createResultAudio() {
  if (!resultState.resultAudio) {
    resultState.resultAudio = new Audio('audios/over.wav');
    resultState.resultAudio.preload = 'auto';
    resultState.resultAudio.volume = 1.0;
  }
}

function playResultAudio() {
  createResultAudio();
  if (resultState.resultAudio) {
    resultState.resultAudio.currentTime = 0;
    resultState.resultAudio.play();
  }
}

function stopResultAudio() {
  if (resultState.resultAudio) {
    resultState.resultAudio.pause();
    resultState.resultAudio.currentTime = 0;
  }
}

// miku voice audio
function createMikuAudio(grade) {
  const mikuConfig = mikuDialogues[grade] || mikuDialogues['C'];
  if (!resultState.mikuAudio || resultState.mikuAudio.src !== mikuConfig.audio) {
    resultState.mikuAudio = new Audio(mikuConfig.audio);
    resultState.mikuAudio.preload = 'auto';
    resultState.mikuAudio.volume = 1.0;
  }
}

function playMikuVoice(grade) {
  createMikuAudio(grade);
  if (resultState.mikuAudio) {
    resultState.mikuAudio.currentTime = 0;
    resultState.mikuAudio.play();
  }
}

function playMikuVoiceWithDelay(grade) {
  // clear any existing timeout
  if (resultState.mikuVoiceTimeout) {
    clearTimeout(resultState.mikuVoiceTimeout);
  }
  
  // play Miku voice after 2 seconds delay
  resultState.mikuVoiceTimeout = setTimeout(() => {
    playMikuVoice(grade);
  }, 1000);
}

function stopMikuAudio() {
  if (resultState.mikuAudio) {
    resultState.mikuAudio.pause();
    resultState.mikuAudio.currentTime = 0;
  }
  if (resultState.mikuVoiceTimeout) {
    clearTimeout(resultState.mikuVoiceTimeout);
    resultState.mikuVoiceTimeout = null;
  }
}

function showResult(gameData) {
  resultState.gameData = gameData;
  hideAllPages();
  document.getElementById('result-page').classList.remove('hidden');
  playResultAudio();
  fillResultData(gameData);
  setMikuState(gameData.grade);
  calculateAchievement(gameData);
  addResultAnimations();
  
  // play Miku voice with 2-second delay
  playMikuVoiceWithDelay(gameData.grade);
}

function hideResult() {
  stopResultAudio();
  stopMikuAudio();
  document.getElementById('result-page').classList.add('hidden');
}

function hideAllPages() {
  document.getElementById('player-page').classList.add('hidden');
  document.getElementById('song-selection').classList.remove('hidden');
  document.getElementById('tutorial-page').classList.add('hidden');
}

function fillResultData(gameData) {
  document.getElementById('stat-perfect').textContent = gameData.perfect || 0;
  document.getElementById('stat-great').textContent = gameData.great || 0;
  document.getElementById('stat-good').textContent = gameData.good || 0;
  document.getElementById('stat-bad').textContent = gameData.bad || 0;
  document.getElementById('stat-miss').textContent = gameData.miss || 0;
  document.getElementById('stat-max-combo').textContent = gameData.maxCombo || 0;
  document.getElementById('stat-hp-left').textContent = gameData.health || 0;
  
  const gradeElement = document.getElementById('result-grade');
  const scoreElement = document.getElementById('result-score');
  
  gradeElement.textContent = gameData.grade || 'C';
  gradeElement.className = `result-grade grade-${gameData.grade || 'C'}`;
  scoreElement.textContent = (gameData.score || 0).toLocaleString();
}

function setMikuState(grade) {
  const mikuConfig = mikuDialogues[grade] || mikuDialogues['C'];
  const mikuImg = document.getElementById('result-miku-img');
  const mikuDialogue = document.getElementById('result-miku-dialogue');
  mikuImg.src = mikuConfig.image;
  mikuDialogue.textContent = mikuConfig.dialogue;
  resultState.mikuState = grade;
}

function calculateAchievement(gameData) {
  let achievement = 'liveClear';
  if (gameData.health <= 0 || gameData.grade === 'F') {
    achievement = 'liveFailed';
  } else if (gameData.miss === 0 && gameData.bad === 0 && gameData.good === 0 && gameData.great === 0) {
    achievement = 'allPerfect';
  } else if (gameData.miss === 0) {
    achievement = 'fullCombo';
  }
  
  const achievementElement = document.getElementById('result-achievement');
  const achievementConfig = achievements[achievement];
  achievementElement.textContent = achievementConfig.text;
  achievementElement.className = `result-achievement ${achievementConfig.class}`;
  resultState.achievement = achievement;
}

function addResultAnimations() {
  const gradeElement = document.getElementById('result-grade');
  gradeElement.style.transform = 'scale(0)';
  gradeElement.style.opacity = '0';
  
  setTimeout(() => {
    gradeElement.style.transition = 'all 0.5s ease-out';
    gradeElement.style.transform = 'scale(1)';
    gradeElement.style.opacity = '1';
  }, 100);
  
  const statItems = document.querySelectorAll('.stat-item');
  statItems.forEach((item, index) => {
    item.style.opacity = '0';
    item.style.transform = 'translateX(-30px)';
    
    setTimeout(() => {
      item.style.transition = 'all 0.3s ease-out';
      item.style.opacity = '1';
      item.style.transform = 'translateX(0)';
    }, 200 + index * 100);
  });
  
  const mikuContainer = document.querySelector('.result-miku');
  mikuContainer.style.opacity = '0';
  mikuContainer.style.transform = 'translateX(30px)';
  
  setTimeout(() => {
    mikuContainer.style.transition = 'all 0.5s ease-out';
    mikuContainer.style.opacity = '1';
    mikuContainer.style.transform = 'translateX(0)';
  }, 800);
  
  const achievementElement = document.getElementById('result-achievement');
  achievementElement.style.opacity = '0';
  achievementElement.style.transform = 'translateY(30px)';
  
  setTimeout(() => {
    achievementElement.style.transition = 'all 0.5s ease-out';
    achievementElement.style.opacity = '1';
    achievementElement.style.transform = 'translateY(0)';
  }, 1200);
}

function backToSongSelection() {
  stopResultAudio();
  stopMikuAudio();
  hideResult();
  
  if (window.FullscreenManager) {
    window.FullscreenManager.exit();
  }
  
  if (window.SongSelection) {
    window.SongSelection.show();
  }
}

function restartGame() {
  stopResultAudio();
  stopMikuAudio();
  hideResult();
  
  if (window.Player && resultState.gameData.currentSong) {
    window.Player.startGame(resultState.gameData.currentSong);
  }
}

function initResult() {
  function animateResult() {
    updateResultAnimations();
    requestAnimationFrame(animateResult);
  }
  requestAnimationFrame(animateResult);

  const resultPage = document.getElementById('result-page');
  if (resultPage) {
    resultPage.addEventListener('click', handleResultClick);
  }
}

function updateResultAnimations() {
  const resultElements = document.querySelectorAll('.result-element');
  resultElements.forEach(element => {
    const progress = element.dataset.progress || 0;
    element.style.transform = `translateY(${progress}px)`;
  });
}

function handleResultClick(e) {
  const target = e.target;
  if (target.id === 'result-back-btn') {
    backToSongSelection();
  } else if (target.id === 'result-restart-btn') {
    restartGame();
  }
}

window.Result = {
  showResult: showResult,
  initResult: initResult
}; 