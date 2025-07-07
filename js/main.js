// main initialization file

document.addEventListener('DOMContentLoaded', () => {

  if (window.Welcome) {
    window.Welcome.initWelcomePage();
  }

  if (window.SongSelection) {
    window.SongSelection.init();
  }
  
  if (window.Tutorial) {
    window.Tutorial.init();
  }

  if (window.Result) {
    window.Result.initResult();
  }

  // other pages' initialization are triggered by user interactions
}); 