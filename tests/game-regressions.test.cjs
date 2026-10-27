const test = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');

const source = name => fs.readFileSync(path.join(__dirname, '..', 'js', name), 'utf8');

function harness() {
  let nextId = 0;
  let listeners;
  const timers = new Map();
  const frames = new Map();
  const elements = new Map();
  const element = () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    remove() {}, appendChild() {}, querySelector() { return null; },
    closest() { return null; }, removeEventListener() {}
  });
  const document = {
    addEventListener() {}, querySelector() { return element(); },
    querySelectorAll() { return []; }, createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  };
  const addTimer = (fn, delay) => { const id = ++nextId; timers.set(id, {fn, delay}); return id; };
  const context = vm.createContext({
    console, document, window: { innerWidth: 1280, innerHeight: 720 },
    TextAliveApp: { Player: class { addListener(value) { listeners = value; } } },
    setTimeout: addTimer, setInterval: addTimer,
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id), performance: { now: () => 0 },
    createImageBitmap: async () => ({close() {}}), Audio: class {}
  });
  vm.runInContext(source('player.js'), context);
  vm.runInContext(source('track.js'), context);
  const run = code => vm.runInContext(code, context);
  return { context, run, timers, frames, get listeners() { return listeners; },
    fire(id) { const timer = timers.get(id); timers.delete(id); return timer.fn(); } };
}

function activeCamera(h) {
  h.run(`cameraVideo = {videoWidth:640,videoHeight:480};
    glowstickWorker = {postMessage(){},terminate(){}};
    isGlowstickDetectionActive = true;`);
}

function playerWithStopEvents(h) {
  h.run('initPlayer(); gameState.isPlaying = true; gameState.health = 4;');
  h.context.stopEvent = h.listeners.onStop;
  h.context.pauseEvent = h.listeners.onPause;
  h.run(`player.isPlaying = true;
    player.requestPause = async () => {player.isPlaying=false; pauseEvent();};
    player.requestStop = async () => {stopEvent();};`);
}

test('tracker advances once per elapsed interval, including identical/backward timestamps', () => {
  const h = harness();
  h.run(`let tracker = new KalmanTracker();
    tracker.initialize({x:0,y:0,timestamp:0,confidence:1}); tracker.state[2]=100;
    tracker.getCurrentPosition(10); tracker.getCurrentPosition(20);`);
  assert.equal(h.run('tracker.state[0]'), 2);
  h.run('tracker.getCurrentPosition(20); tracker.getCurrentPosition(15);');
  assert.equal(h.run('tracker.state[0]'), 2);
  h.run('tracker.update({x:3,y:0,timestamp:30,confidence:1}); tracker.getCurrentPosition(40);');
  assert.equal(h.run('tracker.state[0]'), 4);
});

test('analysis and actual spawned notes agree, and perfect hits earn the note budget', () => {
  const h = harness();
  h.run(`getRandomPianoKey=()=> 'C4'; getPianoKeyInfo=()=>({width:100,centerY:100,y:100});
    getPianoRollPosition=()=>({x:0,y:0,height:500});triggerPianoKeyEffect=()=>{};
    Note.prototype.createElement=function(){return {style:{},querySelector(){return null}}};`);
  for (const difficulty of ['easy', 'normal', 'hard']) {
    for (const duration of [100, 500, 700, 2500, 3000, 10000]) {
      h.run(`gameState.difficulty='${difficulty}';gameState.notes=[];
        analyzeSongAndCalculateScores({phrases:[{startTime:0,endTime:${duration}}],
        words:[{startTime:0,endTime:${duration}}],chars:[{startTime:0,endTime:${duration}}]},100);
        spawnNote('test',0,${duration});`);
      assert.equal(h.run('songAnalysis.totalHits'), h.run('gameState.notes[0].hitCount'));
      assert.ok(Math.abs(h.run('scoreConfig.perfect * ((gameState.notes[0].hitCount-1)*0.5+1)') - 900000) < 1e-6);
    }
  }
});

test('partial multi hits preserve the highest combo after a later break', () => {
  const h = harness();
  h.run(`updateScoreDisplay=updateComboDisplay=checkComboMilestones=createEffect=showHitResult=()=>{};
    gameState.combo=10;gameState.maxCombo=10;
    handleNoteHit({width:100,x:0,y:0},'multi-continue',0);gameState.combo=0;`);
  assert.equal(h.run('gameState.maxCombo'), 11);
});

test('exit ignores synchronous stop callbacks and cancels existing completion/fade timers', async () => {
  const h = harness(); playerWithStopEvents(h);
  h.run(`gameState.health=0;checkGameOver();gameState.health=4;`);
  assert.equal(h.timers.size, 2);
  await h.run('exitGame()');
  assert.equal(h.timers.size, 0);
  assert.equal(h.run('gameState.isPlaying'), false);
});

test('restart ignores stop callbacks and old completion callbacks cannot end the new game', async () => {
  const h = harness(); playerWithStopEvents(h);
  h.run(`gameState.currentSong={id:'hello'};scheduleGameEnd('completed');
    startGame=async()=>{gameState.isPlaying=true};`);
  const oldCallback = [...h.timers.values()][0].fn;
  const restarting = h.run('restartGameFromPause()');
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.timers.size, 1);
  const [id, timer] = [...h.timers][0];
  assert.equal(timer.delay, 100);
  h.fire(id); await restarting;
  oldCallback();
  assert.equal(h.run('gameState.isPlaying'), true);
  assert.equal(h.timers.size, 0);
});

test('normal completion still produces one result for duplicate stop events', async () => {
  const h = harness(); playerWithStopEvents(h);
  const results = []; h.context.results = results;
  h.run(`player.isPlaying=false;window.Result={showResult(data){results.push(data)}};`);
  h.listeners.onStop();h.listeners.onStop();
  assert.equal(h.timers.size, 1);
  h.fire([...h.timers.keys()][0]);
  await Promise.resolve();
  assert.equal(results.length, 1);
  assert.equal(results[0].result, 'completed');
});

test('in-flight endGame cannot display results after session invalidation', async () => {
  const h = harness(); playerWithStopEvents(h);
  let release; h.context.pausePromise = new Promise(resolve => { release = resolve; });
  const results = [];h.context.results = results;
  h.run(`player.requestPause=()=>pausePromise;window.Result={showResult(data){results.push(data)}};`);
  const ending = h.run("endGame('completed')");
  h.run('invalidateGameSession();gameState.isPlaying=true;');
  release();await ending;
  assert.equal(results.length, 0);
  assert.equal(h.run('gameState.isPlaying'), true);
});

test('inactive detection does not schedule, and cleanup cancels pending retries/frames', async () => {
  const h = harness();
  await h.run('processGlowstickFrame()');
  assert.equal(h.timers.size + h.frames.size, 0);
  activeCamera(h);
  h.run('scheduleGlowstickFrame();cleanupGlowstickDetection();');
  assert.equal(h.frames.size, 0);
  activeCamera(h);
  h.run('cameraVideo.videoWidth=0;');
  await h.run('processGlowstickFrame()');
  assert.equal(h.timers.size, 1);
  h.run('cleanupGlowstickDetection();');
  assert.equal(h.timers.size + h.frames.size, 0);
});

test('capture rejection unlocks processing and retries successfully', async () => {
  const h = harness(); activeCamera(h);
  h.context.createImageBitmap = async () => { throw Error('capture failed'); };
  await h.run('processGlowstickFrame()');
  assert.equal(h.run('isWorkerProcessing'), false);
  assert.equal([...h.timers.values()][0].delay, 100);
  h.context.createImageBitmap = async () => ({close() {}});
  h.fire([...h.timers.keys()][0]);
  const frame = [...h.frames.values()][0];h.frames.clear();frame();await Promise.resolve();
  assert.equal(h.run('isWorkerProcessing'), true);
  h.run('handleGlowstickDetectionResult({position:null,debugData:null},activeGlowstickRequest);');
  assert.equal(h.run('isWorkerProcessing'), false);
  assert.equal(h.timers.size, 0);
  assert.equal(h.frames.size, 1);
});

test('late capture after cleanup closes its bitmap without posting to a new worker', async () => {
  const h = harness(); activeCamera(h);
  let release; let closed = 0; let posts = 0;
  h.context.createImageBitmap = () => new Promise(resolve => {release=resolve});
  const pending = h.run('processGlowstickFrame()');
  h.run('cleanupGlowstickDetection();');activeCamera(h);
  h.context.post = () => {posts++};h.run('glowstickWorker.postMessage=post;');
  release({close(){closed++}});await pending;
  assert.equal(closed, 1);assert.equal(posts, 0);
  assert.equal(h.timers.size + h.frames.size, 0);
});

test('timed-out requests cannot unlock or overwrite a newer detection', async () => {
  const h = harness(); activeCamera(h);
  await h.run('processGlowstickFrame()');
  const firstRequest = h.run('activeGlowstickRequest');
  h.fire([...h.timers.keys()][0]);
  assert.equal(h.run('isWorkerProcessing'), false);
  h.fire([...h.timers.keys()][0]);
  const frame = [...h.frames.values()][0];h.frames.clear();frame();await Promise.resolve();
  const nextRequest = h.run('activeGlowstickRequest');
  assert.notEqual(firstRequest, nextRequest);
  h.run(`handleGlowstickDetectionResult({position:null},${firstRequest});`);
  assert.equal(h.run('isWorkerProcessing'), true);
  assert.equal(h.run('activeGlowstickRequest'), nextRequest);
});

test('failed worker inference replies and disposes both tensors and bitmap', async () => {
  let disposed = 0;let closed = 0;const messages = [];
  const c = vm.createContext({importScripts(){},self:{location:{origin:'https://example.com',pathname:'/js/detect.js'},postMessage(msg){messages.push(msg)}}});
  vm.runInContext(source('detect.js'),c);
  c.tensor = {dispose(){disposed++}};
  vm.runInContext(`preprocessImage=()=>tensor;loadedModel={predict(){return tensor}};
    extractGlowstickPosition=async()=>{throw Error('inference failed')};`,c);
  await c.self.onmessage({data:{type:'DETECT',requestId:7,data:{imageBitmap:{close(){closed++}},width:640,height:480}}});
  assert.equal(disposed, 2);assert.equal(closed, 1);
  assert.equal(messages[0].requestId, 7);assert.equal(messages[0].data.position, null);
  assert.equal(vm.runInContext('isProcessing',c),false);
});

test('a stalled capture times out and its eventual bitmap is discarded', async () => {
  const h = harness(); activeCamera(h);
  let release;let closed=0;
  h.context.createImageBitmap=()=>new Promise(resolve=>{release=resolve});
  const pending=h.run('processGlowstickFrame()');
  h.fire([...h.timers.keys()][0]);
  assert.equal(h.run('isWorkerProcessing'),false);
  assert.equal([...h.timers.values()][0].delay,100);
  release({close(){closed++}});await pending;
  assert.equal(closed,1);
  assert.equal(h.run('isWorkerProcessing'),false);
});

test('failed bitmap transfer closes the frame and releases the processing lock', async () => {
  const h=harness();activeCamera(h);
  let closed=0;h.context.createImageBitmap=async()=>({close(){closed++}});
  h.run("glowstickWorker.postMessage=()=>{throw Error('worker terminated')}");
  await h.run('processGlowstickFrame()');
  assert.equal(closed,1);assert.equal(h.run('isWorkerProcessing'),false);
  assert.equal([...h.timers.values()][0].delay,100);
});

test('health depletion still ends the game as failed and cancels volume fading', async () => {
  const h=harness();playerWithStopEvents(h);
  const results=[];h.context.results=results;
  h.run('window.Result={showResult(data){results.push(data)}};gameState.health=0;checkGameOver();');
  const endTimer=[...h.timers].find(([,timer])=>timer.delay===2000)[0];
  h.fire(endTimer);
  await new Promise(resolve=>setImmediate(resolve));
  assert.equal(results.length,1);assert.equal(results[0].result,'failed');
  assert.equal(h.timers.size,0);
});
