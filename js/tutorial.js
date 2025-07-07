// tutorial module

let currentTutorialPage = 1;
let currentLanguage = 'zh';

function showTutorial() {
  if (window.SongSelection) {
    // keep song preview playing
    window.SongSelection.hide(false);
  }
  // above song selection page
  document.getElementById('tutorial-page').classList.remove('hidden');
  
  validateCurrentPage();
  updateTutorialDisplay();
}

function hideTutorial() {
  document.getElementById('tutorial-page').classList.add('hidden');
  if (window.SongSelection) {
    window.SongSelection.show();
  }
}

// check current page is valid
function validateCurrentPage() {
  const totalPages = 6;
  if (currentTutorialPage > totalPages) {
    currentTutorialPage = totalPages;
  } else if (currentTutorialPage < 1) {
    currentTutorialPage = 1;
  }
}

// if page changed, update tutorial display
function updateTutorialDisplay() {
  const totalPages = 6;

  validateCurrentPage();
  
  const titleElement = document.querySelector('.tutorial-title');
  if (titleElement) {
    const titleText = titleElement.getAttribute(`data-${currentLanguage}`);
    if (titleText) {
      titleElement.textContent = titleText;
    }
  }
  
  document.querySelectorAll('.tutorial-step').forEach((step, index) => {
    const pageNum = index + 1;
    if (pageNum === currentTutorialPage) {
      step.classList.remove('hidden');
      const pElement = step.querySelector('p');
      if (pElement) {
        const content = pElement.getAttribute(`data-${currentLanguage}`);
        if (content) {
          pElement.textContent = content;
        }
      }
    } else {
      step.classList.add('hidden');
    }
  });
  
  document.querySelectorAll('.tutorial-video-container').forEach((container, index) => {
    const pageNum = index + 1;
    if (pageNum === currentTutorialPage) {
      container.classList.remove('hidden');
    } else {
      container.classList.add('hidden');
    }
  });
  
  // update page info
  document.getElementById('current-page').textContent = currentTutorialPage;
  document.getElementById('total-pages').textContent = totalPages;
  document.getElementById('prev-tutorial').disabled = currentTutorialPage === 1;
  document.getElementById('next-tutorial').disabled = currentTutorialPage === totalPages;
}

function nextTutorialPage() {
  const totalPages = 6;
  if (currentTutorialPage < totalPages) {
    currentTutorialPage++;
    updateTutorialDisplay();
    saveStateIndicator();
  }
}

function prevTutorialPage() {
  if (currentTutorialPage > 1) {
    currentTutorialPage--;
    updateTutorialDisplay();
    saveStateIndicator();
  }
}

function switchLanguage(lang) {
  currentLanguage = lang;
  
  document.querySelectorAll('.lang-btn').forEach(btn => {
    if (btn.dataset.lang === lang) {
      btn.classList.add('active');
    } else {
      btn.classList.remove('active');
    }
  });
  
  updateTutorialDisplay();
}

// page change indicator (green)
function saveStateIndicator() {
  const pageInfo = document.querySelector('.page-info');
  if (pageInfo) {
    pageInfo.style.transform = 'scale(1.1)';
    pageInfo.style.color = '#90EE90';
    setTimeout(() => {
      pageInfo.style.transform = 'scale(1)';
      pageInfo.style.color = '#ffffff';
    }, 200);
  }
}

// init tutorial page
function initTutorial() {
  // show, hide, next-page, prev-page button listener
  document.getElementById('tutorial-btn').addEventListener('click', showTutorial);
  document.getElementById('tutorial-back').addEventListener('click', hideTutorial);
  document.getElementById('next-tutorial').addEventListener('click', nextTutorialPage);
  document.getElementById('prev-tutorial').addEventListener('click', prevTutorialPage);
  
  // language switch button listener
  document.querySelectorAll('.lang-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      switchLanguage(btn.dataset.lang);
    });
  });
}

window.Tutorial = {
  init: initTutorial
}; 