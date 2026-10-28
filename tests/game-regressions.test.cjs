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
  const documentEvents = new Map();
  const windowEvents = new Map();
  const listen = (map, name, callback) => { map.set(name, [...(map.get(name) || []), callback]); };
  const emit = (map, name, event) => (map.get(name) || []).forEach(callback => callback(event));
  const element = () => ({
    style: {}, classList: { add() {}, remove() {}, toggle() {} },
    addEventListener() {}, remove() {}, appendChild() {}, querySelector() { return null; },
    closest() { return null; }, removeEventListener() {}
  });
  const document = {
    documentElement: {style: {setProperty() {}}},
    addEventListener(name, callback) { listen(documentEvents, name, callback); }, querySelector() { return element(); },
    querySelectorAll() { return []; }, createElement: element,
    getElementById(id) {
      if (!elements.has(id)) elements.set(id, element());
      return elements.get(id);
    }
  };
  const addTimer = (fn, delay) => { const id = ++nextId; timers.set(id, {fn, delay}); return id; };
  const context = vm.createContext({
    console, document, window: { innerWidth: 1280, innerHeight: 720,
      matchMedia: () => ({matches:false}), screen: {},
      addEventListener(name, callback) {listen(windowEvents, name, callback);},
      dispatchEvent(event) {emit(windowEvents, event.type, event);} },
    CustomEvent: class {constructor(type, options) {this.type=type;this.detail=options.detail}},
    TextAliveApp: { Player: class { addListener(value) { listeners = value; } } },
    setTimeout: addTimer, setInterval: addTimer,
    clearTimeout: id => timers.delete(id), clearInterval: id => timers.delete(id),
    requestAnimationFrame: fn => { const id = ++nextId; frames.set(id, fn); return id; },
    cancelAnimationFrame: id => frames.delete(id), performance: { now: () => 0 },
    createImageBitmap: async () => ({close() {}}), Audio: class {}
  });
  vm.runInContext(source('display.js'), context);
  vm.runInContext(source('player.js'), context);
  vm.runInContext(source('track.js'), context);
  const run = code => vm.runInContext(code, context);
  return { context, run, timers, frames, elements,
    emitDocument: name => emit(documentEvents, name),
    get listeners() { return listeners; },
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
    getPianoRollPosition=()=>({x:0,y:0,width:127,height:500});triggerPianoKeyEffect=()=>{};
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

test('mobile start requests fullscreen in the click turn, then locks landscape', async () => {
  const h=harness();const calls=[];
  h.context.window.matchMedia=()=>({matches:true});
  h.context.document.documentElement.requestFullscreen=async()=>{calls.push('fullscreen');h.context.document.fullscreenElement={};};
  h.context.window.screen.orientation={lock:async value=>calls.push(value)};
  h.run('fullscreenManager.setActive(true);');
  const entering=h.run('fullscreenManager.enter()');
  assert.deepEqual(calls,['fullscreen']);
  await entering;
  assert.deepEqual(calls,['fullscreen','landscape']);
});

test('unsupported/rejected fullscreen and orientation show a rotatable fallback, not a rejection', async () => {
  const h=harness();
  h.context.window.matchMedia=()=>({matches:true});
  h.context.window.innerWidth=390;h.context.window.innerHeight=844;
  h.context.document.documentElement.requestFullscreen=async()=>{throw Error('not allowed')};
  h.context.window.screen.orientation={lock:async()=>{throw Error('unsupported')}};
  h.run('fullscreenManager.setActive(true);');
  await h.run('fullscreenManager.enter()');
  assert.equal(h.elements.get('orientation-prompt').hidden,false);
  h.context.window.innerWidth=844;h.context.window.innerHeight=390;
  h.run('fullscreenManager.update()');
  assert.equal(h.elements.get('orientation-prompt').hidden,true);
});

test('desktop fullscreen never requests an orientation lock', async () => {
  const h=harness();let locks=0;
  h.context.document.documentElement.requestFullscreen=async()=>{};
  h.context.window.screen.orientation={lock:async()=>{locks++}};
  h.run('fullscreenManager.setActive(true);');await h.run('fullscreenManager.enter()');
  assert.equal(locks,0);
});

test('exit during a pending fullscreen request releases fullscreen and orientation', async () => {
  const h=harness();let release;let exits=0;let locks=0;
  h.context.window.matchMedia=()=>({matches:true});
  h.context.document.documentElement.requestFullscreen=()=>new Promise(resolve=>{release=()=>{h.context.document.fullscreenElement={};resolve()}});
  h.context.document.exitFullscreen=async()=>{exits++;h.context.document.fullscreenElement=null};
  h.context.window.screen.orientation={lock:async()=>{locks++},unlock(){}};
  h.run('fullscreenManager.setActive(true)');const entering=h.run('fullscreenManager.enter()');
  await h.run('fullscreenManager.exit()');release();await entering;
  assert.equal(exits,1);assert.equal(locks,0);assert.equal(h.run('fullscreenManager.isActive()'),false);
});

test('portrait timer-ready waits for explicit continue after rotation', () => {
  const h=harness();h.emitDocument('DOMContentLoaded');
  let plays=0;h.context.play=()=>{plays++};
  h.context.window.matchMedia=()=>({matches:true});
  h.context.window.innerWidth=390;h.context.window.innerHeight=844;
  h.run('fullscreenManager.setActive(true);player.requestPlay=play;player.isPlaying=false;');
  h.listeners.onTimerReady();
  assert.equal(plays,0);assert.equal(h.run('gameState.isPaused'),true);
  h.run('continuePause()');assert.equal(plays,0);
  h.context.window.innerWidth=844;h.context.window.innerHeight=390;
  h.run('fullscreenManager.update()');
  assert.equal(plays,0);assert.equal(h.run('gameState.isPaused'),true);
  h.run('continuePause()');assert.equal(plays,1);
});

test('resize remaps note coordinates and rotating portrait pauses playback immediately', () => {
  const h=harness();h.emitDocument('DOMContentLoaded');
  let pauses=0;h.context.pause=()=>{pauses++};
  h.context.window.matchMedia=()=>({matches:true});
  h.run(`fullscreenManager.setActive(true);gameState.isPlaying=true;player.isPlaying=true;
    player.requestPause=pause;gameState.notes=[{x:640,y:360,vx:100,vy:50,element:{style:{}}}];`);
  h.context.window.innerWidth=360;h.context.window.innerHeight=640;
  h.run('fullscreenManager.update()');
  assert.equal(h.run('gameState.notes[0].x'),180);
  assert.equal(h.run('gameState.notes[0].y'),320);
  assert.equal(h.run('gameState.isPaused'),true);assert.equal(pauses,1);
  assert.match(h.run('gameState.notes[0].element.style.transform'),/180px, 320px/);
});

test('escape from fullscreen pauses, without trying to force fullscreen back', () => {
  const h=harness();h.emitDocument('DOMContentLoaded');let pauses=0;
  h.context.pause=()=>{pauses++};
  h.run('fullscreenManager.setActive(true);gameState.isPlaying=true;player.isPlaying=true;player.requestPause=pause;');
  h.context.document.fullscreenElement={};h.emitDocument('fullscreenchange');
  h.context.document.fullscreenElement=null;h.emitDocument('fullscreenchange');
  assert.equal(pauses,1);assert.equal(h.run('gameState.isPaused'),true);
});

test('late timer-ready after leaving the game cannot resume playback', () => {
  const h=harness();h.emitDocument('DOMContentLoaded');
  h.run('fullscreenManager.setActive(false);gameState.isPlaying=false;');
  h.listeners.onTimerReady();assert.equal(h.run('gameState.isPlaying'),false);
});

test('piano spawning follows actual rendered bounds on different screens', () => {
  const h=harness();let rect;
  h.context.document.querySelector=()=>({getBoundingClientRect:()=>rect});
  h.run(`getRandomPianoKey=()=> 'C4';getPianoKeyInfo=()=>({width:100,centerY:250,y:250});
    triggerPianoKeyEffect=()=>{};
    Note.prototype.createElement=function(){return {style:{},querySelector(){return null}}};`);
  for(const [width,height] of [[320,568],[568,320],[390,844],[844,390],[768,1024],[1024,768],[1366,768],[1920,1080],[2560,1080]]) {
    h.context.window.innerWidth=width;h.context.window.innerHeight=height;
    const pianoHeight=Math.min(500,height-140);
    rect={left:12,top:80,width:pianoHeight*0.254,height:pianoHeight};
    h.run("gameState.notes=[];spawnNote('test',0,500);");
    assert.ok(Math.abs(h.run('gameState.notes[0].x')-(12+100*rect.width/127+10))<1e-6);
    assert.equal(h.run('gameState.notes[0].y'),80+pianoHeight/2);
    assert.ok(h.run('gameState.notes[0].y')<height);
  }
});

test('hit selection prefers containing notes over margins, then the nearest margin regardless of order', () => {
  const h=harness();
  h.run(`gameState.isPlaying=true;gameState.beatState='high';
    handleNoteHit=note=>{window.selected=note.id};updateScoreDisplay=()=>{};
    function candidate(id,x,width){return {id,x,y:0,element:{style:{width:String(width)}},hit(){return 'hit'}}}`);
  h.run("gameState.notes=[candidate('margin',90,5),candidate('inside',0,200)];handleSlash(100,12)");
  assert.equal(h.context.window.selected,'inside');
  for(const reversed of [false,true]) {
    h.run(`gameState.notes=[candidate('far',60,20),candidate('near',85,10)];
      ${reversed?'gameState.notes.reverse();':''}handleSlash(100,12);`);
    assert.equal(h.context.window.selected,'near');
  }
  assert.equal('hitMargin' in h.context,false);
});

test('look-ahead beat intervals do not overlap across successive time updates', () => {
  const h=harness();playerWithStopEvents(h);const intervals=[];
  h.context.findBeat=(from,to)=>{intervals.push([from,to]);return {entered:from<100&&to>=100?[{index:1}]:[]}};
  h.run(`beatDuration=100;beatDelay=40;gameState.lastTime=-1;
    player.findBeatChange=findBeat;player.video={findWordChange:()=>({entered:[]})};
    window.highCount=0;updateCursorState=high=>{if(high)window.highCount++};`);
  h.listeners.onTimeUpdate(60);h.listeners.onTimeUpdate(80);h.listeners.onTimeUpdate(100);
  assert.deepEqual(intervals,[[-1,110],[110,130],[130,150]]);
  assert.equal(h.context.window.highCount,1);
});

test('pause clears delayed beat visuals and invalidated callbacks cannot affect the next session', () => {
  const h=harness();h.run('gameState.isPlaying=true;window.runs=0;scheduleBeatCallback(()=>window.runs++,100);');
  const stale=[...h.timers.values()][0].fn;
  h.run('showPauseModal();');assert.equal(h.timers.size,0);
  h.run('invalidateGameSession();gameState.isPlaying=true;gameState.isPaused=false;');
  stale();assert.equal(h.context.window.runs,0);
});

test('manual pause in the last second does not schedule completion', () => {
  const h=harness();playerWithStopEvents(h);
  h.run('player.video={duration:10000};player.timer={position:9500};showPauseModal();');
  assert.equal(h.timers.size,0);
  assert.equal(h.run('gameState.isPaused'),true);
});

test('achievements require all notes cleared without a broken combo, and low grade alone is not failure', () => {
  const h=harness();vm.runInContext(source('result.js'),h.context);
  const data={totalNotes:2,completedNotes:2,comboBroken:false,miss:0,bad:0,good:0,great:0,perfect:2,health:4,result:'completed',grade:'S'};
  const check=(changes,expected)=>{h.context.resultInput={...data,...changes};h.run('calculateAchievement(resultInput)');assert.equal(h.run('resultState.achievement'),expected)};
  check({},'allPerfect');check({great:1},'fullCombo');
  check({comboBroken:true},'liveClear');check({completedNotes:1},'liveClear');
  check({totalNotes:0,completedNotes:0},'liveClear');
  check({grade:'F',miss:1},'liveClear');check({result:'failed'},'liveFailed');
});

test('red-note contact records a combo break even without missed lyric notes', () => {
  const h=harness();
  h.run(`updateComboDisplay=()=>{};gameState.combo=10;
    handleNoteHit({type:'pseudo'},'pseudo',0);`);
  assert.equal(h.run('gameState.comboBroken'),true);
  assert.equal(h.run('gameState.combo'),0);assert.equal(h.run('gameState.miss'),0);
});

test('lost glowstick measurements do not keep hitting notes', () => {
  const h=harness();let clock=100;
  h.context.performance.now=()=>clock;
  h.run(`glowstickModeActive=true;gameState.isPlaying=true;window.hits=0;
    glowstickKalmanFilter=new KalmanTracker();glowstickKalmanFilter.initialize({x:10,y:10,timestamp:100,confidence:1});
    handleSlash=()=>window.hits++;updateGlowstickCursor=createGlowstickTrail=()=>{};`);
  h.context.document.getElementById=()=>null;
  h.run('processGlowstickInteraction(100)');assert.equal(h.context.window.hits,1);
  clock=400;h.run('processGlowstickInteraction(400)');assert.equal(h.context.window.hits,1);
  h.run('glowstickKalmanFilter.update({x:12,y:12,timestamp:400,confidence:1})');
  clock=420;h.run('processGlowstickInteraction(420)');assert.equal(h.context.window.hits,2);
});
