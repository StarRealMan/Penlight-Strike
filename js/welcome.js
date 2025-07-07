// welcome module

function initWelcomePage() {    
    const enableAudio = window.SongSelection.enableAudio;
    const welcomePage = document.getElementById('welcome-page');
    
    preloadResources().then(() => {
        const loadingSection = document.querySelector('.loading-section');
        if (loadingSection) {
            loadingSection.classList.add('hidden');
        }
        
        const instruction = document.querySelector('.instruction');
        const welcomeAnimation = document.querySelector('.welcome-animation');
        
        if (instruction) {
            instruction.style.display = 'block';
            setTimeout(() => {
                instruction.classList.add('visible');
            }, 50);
        }
        
        if (welcomeAnimation) {
            welcomeAnimation.style.display = 'block';
            setTimeout(() => {
                welcomeAnimation.classList.add('visible');
            }, 50);
        }
        
        // add click event listeners
        if (welcomePage) {
            welcomePage.addEventListener('click', enableAudio);
        }
        document.addEventListener('click', enableAudio, { once: true });
        document.addEventListener('keydown', handleWelcomeKeydown, { once: true });
        document.addEventListener('touchstart', enableAudio, { once: true });
    });
}

async function preloadResources() {
    const resources = {
        // load welcome page resources first
        welcomeFonts: [
            'fonts/Audiowide-Regular.ttf',
            'fonts/KosugiMaru-Regular.ttf',
            'fonts/WDXLLubrifontJPN-Regular.ttf'
        ],
        welcomeImages: [
            'images/starrysky.png',
            'images/cursor-click.png',
            'images/cursor-default.png',
        ],
        fonts: [
            'fonts/BitcountGridDouble-VariableFont_CRSV,ELSH,ELXP,slnt,wght.ttf',
            'fonts/CherryBombOne-Regular.ttf',
            'fonts/Rubik-VariableFont_wght.ttf',
            'fonts/StalinistOne-Regular.ttf',
            'fonts/YuseiMagic-Regular.ttf'
        ],
        images: [
            'images/miku-cry.png',
            'images/miku-high.png',
            'images/miku-laugh.png',
            'images/miku-loading-0.png',
            'images/miku-loading-1.png',
            'images/miku-low.png',
            'images/miku-normal.png',
            'images/negi.png',
            'images/piano-black.png',
            'images/piano-white.png',
            'images/cursor-hover.png',
            'images/alifration.jpg',
            'images/hello.jpg',
            'images/informal.jpg',
            'images/lonely.jpg',
            'images/parade.jpg',
            'images/streetlight.jpg'
        ],
        audio: [
            'audios/alifration.wav',
            'audios/hello.wav',
            'audios/informal.wav',
            'audios/lonely.wav',
            'audios/over.wav',
            'audios/parade.wav',
            'audios/streetlight.wav',
            'audios/voice-0.wav',
            'audios/voice-1.wav',
            'audios/voice-2.wav',
            'audios/voice-3.wav',
            'audios/voice-4.wav',
            'audios/hit.wav',
            'audios/miss.wav',
            'audios/explosion.wav',
        ],
        video: [
            'videos/starrysky.mp4',
            'videos/tutorial-0.mp4',
            'videos/tutorial-1.mp4',
            'videos/tutorial-2.mp4',
            'videos/tutorial-3.mp4',
            'videos/tutorial-4.mp4',
            'videos/tutorial-5.mp4',
        ]
    };

    const totalResources = 
        resources.welcomeFonts.length + 
        resources.welcomeImages.length +
        resources.fonts.length + 
        resources.images.length + 
        resources.audio.length + 
        resources.video.length;
    let loadedResources = 0;

    function updateProgress() {
        const progress = (loadedResources / totalResources) * 100;
        const progressBar = document.querySelector('.progress-bar');
        if (progressBar) {
            progressBar.style.width = `${progress}%`;
        }
    }

    async function loadFont(src) {
        return new Promise((resolve, reject) => {
            const font = new FontFace(
                src.split('/').pop().split('.')[0],
                `url(${src})`
            );
            
            font.load().then(() => {
                document.fonts.add(font);
                loadedResources++;
                updateProgress();
                resolve();
            }).catch(reject);
        });
    }

    async function loadImage(src) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            img.onload = () => {
                loadedResources++;
                updateProgress();
                resolve();
            };
            img.onerror = reject;
            img.src = src;
        });
    }

    async function loadAudio(src) {
        return new Promise((resolve, reject) => {
            const audio = new Audio();
            audio.oncanplaythrough = () => {
                loadedResources++;
                updateProgress();
                resolve();
            };
            audio.onerror = reject;
            audio.src = src;
        });
    }

    async function loadVideo(src) {
        return new Promise((resolve, reject) => {
            const video = document.createElement('video');
            video.oncanplaythrough = () => {
                loadedResources++;
                updateProgress();
                resolve();
            };
            video.onerror = reject;
            video.src = src;
        });
    }

    async function loadResourcesBatch(resources, loadFunction, batchSize = 3) {
        const batches = [];
        for (let i = 0; i < resources.length; i += batchSize) {
            batches.push(resources.slice(i, i + batchSize));
        }
        for (const batch of batches) {
            await Promise.all(batch.map(loadFunction));
        }
    }

    for (const fontSrc of resources.welcomeFonts) {
        await loadFont(fontSrc);
    }
    for (const imageSrc of resources.welcomeImages) {
        await loadImage(imageSrc);
    }

    await loadResourcesBatch(resources.fonts, loadFont, 3);
    await loadResourcesBatch(resources.images, loadImage, 4);
    await loadResourcesBatch(resources.audio, loadAudio, 3);
    await loadResourcesBatch(resources.video, loadVideo, 3);
}

function handleWelcomeKeydown(event) {
    if (event.key === 'Enter' || event.keyCode === 13) {
        if (window.SongSelection && window.SongSelection.enableAudio) {
            window.SongSelection.enableAudio();
        }
    }
}

window.Welcome = {
    initWelcomePage: initWelcomePage,
}