import * as THREE from 'three';
import { Renderer } from './render/renderer.js';
import { Tweens } from './core/tween.js';
import { Interact } from './core/interact.js';
import { makeTextures } from './world/textures.js';
import { World } from './world/town.js';
import { Atmosphere } from './world/atmosphere.js';
import { buildRichieCar } from './world/props.js';
import { Player } from './player/player.js';
import { Hands } from './player/hands.js';
import { Dog } from './entities/dog.js';
import { AudioEngine } from './audio/audio.js';
import { Voice } from './audio/voice.js';
import { UI } from './ui/ui.js';
import { Seq } from './story/sequences.js';
import { Story } from './story/story.js';

// Sniff Sniff — boot, input, pause, main loop.

const params = new URLSearchParams(location.search);
const NOLOCK = params.has('nolock'); // for testing in browsers without pointer lock: drag to look

const g = {
  time: 0,
  busy: 0,
  paused: false,
  started: false,
  hooks: new Set(),
  settings: { sens: 1, vol: 0.9, voice: 1 },
  input: { keys: {}, dx: 0, dy: 0 },
};
window.game = g;

g.ui = new UI();
g.renderer = new Renderer(document.getElementById('game'));
g.scene = new THREE.Scene();
g.tw = new Tweens();
g.tex = makeTextures();
g.world = new World(g.scene, g.tex);
g.world.build();
g.atmos = new Atmosphere(g);
g.player = new Player(g);
g.renderer.setCamera(g.player.camera);
g.hands = new Hands(g);
g.dog = new Dog(g);
g.car = buildRichieCar(g.world, g.tex);
g.scene.add(g.car.root);
g.audio = new AudioEngine(g);
g.voice = new Voice(g.ui);
g.voice.tw = g.tw;
g.interact = new Interact(g);
g.seq = new Seq(g);
g.story = new Story(g);
g.story.init();

// Run a cutscene: input off, prompts hidden, control returns after.
g.cut = async (fn) => {
  g.busy++;
  g.player.control = false;
  g.ui.prompt(null);
  try {
    await fn();
  } catch (e) {
    console.error(e);
  } finally {
    g.busy = Math.max(0, g.busy - 1);
    if (!g.busy) g.player.control = true;
  }
};

function parkCar() {
  g.car.root.position.set(-24.4, 0, 13.6);
  g.car.root.rotation.y = Math.PI;
  g.car.radio.visible = false;
  g.world.addCollider(g.seq.carCollider());
}

// Park everything somewhere sensible and compile shaders up front (avoids hitches later).
parkCar();
g.player.place(-29.5, 10, 0);
g.atmos.setMode('day');
g.renderer.gl.compile(g.scene, g.player.camera);

// ---------------------------------------------------------------- input
const canvas = g.renderer.gl.domElement;
const lock = () => { if (!NOLOCK && canvas.requestPointerLock) { try { const p = canvas.requestPointerLock(); if (p && p.catch) p.catch(() => {}); } catch (e) { /* ignore */ } } };
let dragging = false;

document.addEventListener('keydown', (e) => {
  if (!g.started) return;
  if (['Space', 'ArrowUp', 'ArrowDown', 'Tab'].includes(e.code)) e.preventDefault();
  if (g.paused) return;
  if (g.ui.key(e.code)) return;
  if (e.repeat) return;
  g.input.keys[e.code] = true;
  if (e.code === 'KeyE') g.interact.press();
  if (NOLOCK && e.code === 'KeyP') pause(true);
  g.story.onKey(e.code);
});
document.addEventListener('keyup', (e) => { g.input.keys[e.code] = false; });
document.addEventListener('mousemove', (e) => {
  if (!g.started || g.paused) return;
  const locked = document.pointerLockElement === canvas;
  if (!locked && !(NOLOCK && dragging)) return;
  if (g.ui.mouse(e.movementY)) return;
  g.input.dx += e.movementX;
  g.input.dy += e.movementY;
});
canvas.addEventListener('mousedown', () => {
  if (!g.started) return;
  if (g.story.waitingRestart) { location.reload(); return; }
  dragging = true;
  if (document.pointerLockElement !== canvas && !NOLOCK) { lock(); return; }
  g.ui.click();
});
document.addEventListener('mouseup', () => { dragging = false; });
document.addEventListener('pointerlockchange', () => {
  if (document.pointerLockElement !== canvas && g.started && !g.story.waitingRestart) pause(true);
});
window.addEventListener('blur', () => { if (g.started && !g.story.waitingRestart) pause(true); });

// ---------------------------------------------------------------- pause + settings
const $ = (id) => document.getElementById(id);
function pause(on) {
  if (on === g.paused) return;
  g.paused = on;
  $('pause').classList.toggle('hidden', !on);
  g.input.keys = {};
  if (on) { g.audio.suspend(); g.voice.pause(); }
  else { g.audio.resume(); g.voice.resume(); lock(); }
}
$('btn-resume').onclick = () => pause(false);
$('btn-restart').onclick = () => location.reload();
$('opt-sens').oninput = (e) => { g.settings.sens = +e.target.value; };
$('opt-vol').oninput = (e) => { g.settings.vol = +e.target.value; g.audio.setVolume(g.settings.vol); };
$('opt-voice').oninput = (e) => { g.voice.volume = +e.target.value; };
$('opt-res').onchange = (e) => g.renderer.setInternalHeight(+e.target.value);

// ---------------------------------------------------------------- title
async function begin(mode) {
  if (g.started) return;
  // unlock audio + speech inside the click
  const ready = g.audio.init();
  if ('speechSynthesis' in window) speechSynthesis.speak(new SpeechSynthesisUtterance(' '));
  $('loading').classList.remove('hidden');
  await ready;
  g.audio.setVolume(g.settings.vol);
  $('title').classList.add('hidden');
  g.started = true;
  lock();
  if (mode === 'night') {
    if (params.get('bulb') === '1') g.story.flags.bulbFixed = true;
    g.story.flags.letterDelivered = true;
    g.story.startNight(false);
  } else {
    g.story.startDay();
  }
}
$('btn-play').onclick = () => begin('day');
$('btn-night').onclick = () => begin('night');

// ---------------------------------------------------------------- loop
function step(dt) {
  if (g.started && !g.paused) {
    g.time += dt;
    g.tw.update(dt);
    g.player.update(dt);
    g.story.update(dt);
    for (const h of g.hooks) h(dt);
    g.hands.update(dt);
    g.dog.update(dt);
    g.seq.update(dt);
    g.atmos.update(dt);
    g.interact.update();
    g.audio.update(dt);
  }
  g.input.dx = 0;
  g.input.dy = 0;
}

let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  step(dt);
  g.renderer.render(g.scene, g.time);
}
requestAnimationFrame(frame);

// Test hook: run the simulation forward even when the tab isn't painting.
const yieldNow = () => new Promise((r) => { const ch = new MessageChannel(); ch.port1.onmessage = () => r(); ch.port2.postMessage(0); });
g.testStart = async (mode = 'day') => {
  g.voice.volume = 0;
  g.settings.vol = 0;
  await begin(mode);
  g.audio.setVolume(0);
};
g.advance = async (sec, fps = 30) => {
  for (let t = 0; t < sec; t += 1 / fps) { step(1 / fps); await yieldNow(); }
  g.renderer.render(g.scene, g.time);
  return g.time;
};
