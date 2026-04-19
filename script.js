// ============================================================
//  SHANTI — DEVOTIONAL TIMER  |  script.js
//  Infinite auto-restart · Ring progress · Chime · Session badge
// ============================================================

'use strict';

// ── CONSTANTS ────────────────────────────────────────────────
const DEFAULT_DURATION  = 5;     // seconds
const TICK_INTERVAL     = 250;   // ms — smooth display updates
const LOW_THRESHOLD_SEC = 5;     // seconds remaining → "low" style
const RING_CIRCUMFERENCE = 2 * Math.PI * 100; // matches SVG r="100"

// ── DOM ELEMENTS ─────────────────────────────────────────────
const timerEl      = document.getElementById('timer');
const sessionBadge = document.getElementById('sessionBadge');
const badgeText    = sessionBadge ? sessionBadge.querySelector('.badge-text') : null;
const durationInput = document.getElementById('durationInput');
const restartBtn   = document.getElementById('restartBtn');
const muteBtn      = document.getElementById('muteBtn');
const bgMusic      = document.getElementById('bgMusic');
const ringProgress = document.getElementById('timerProgress');

// ── INJECT SVG GRADIENT (needed because CSS can't reference SVG defs cross-file) ──
(function injectSvgDefs() {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.innerHTML = `
    <defs>
      <linearGradient id="ringGradient" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%"   stop-color="#FFC84A"/>
        <stop offset="50%"  stop-color="#F6A623"/>
        <stop offset="100%" stop-color="#C0274A"/>
      </linearGradient>
    </defs>`;
  document.body.prepend(svg);
})();

// ── STATE ────────────────────────────────────────────────────
let endTimeMs        = 0;
let intervalId       = null;
let currentDuration  = DEFAULT_DURATION; // seconds
let pausedRemainingMs = DEFAULT_DURATION * 1000;
let running          = false;
let muted            = false;
let sessionCount     = 0;
let audioCtx         = null;

// ── AUDIO INIT ───────────────────────────────────────────────
function initAudio() {
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio API not supported:', e);
  }
}

// Play a soft chime using Web Audio API
function playChime() {
  if (muted || !audioCtx) return;
  try {
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const now  = audioCtx.currentTime;
    const freqs = [523.25, 659.25, 783.99]; // C5, E5, G5 — a gentle major chord
    freqs.forEach((freq, i) => {
      const osc  = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + i * 0.12);
      gain.gain.setValueAtTime(0, now + i * 0.12);
      gain.gain.linearRampToValueAtTime(0.07, now + i * 0.12 + 0.04);
      gain.gain.exponentialRampToValueAtTime(0.001, now + i * 0.12 + 0.6);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start(now + i * 0.12);
      osc.stop(now + i * 0.12 + 0.7);
    });
  } catch (e) {
    console.warn('Chime failed:', e);
  }
}

// Vibration
function triggerVibration() {
  if (muted || !navigator.vibrate) return;
  navigator.vibrate([60, 40, 60, 40, 60]);
}

// ── MUSIC ────────────────────────────────────────────────────
function tryPlayMusic() {
  if (!bgMusic || muted) return;
  bgMusic.volume = 0.45;
  bgMusic.muted  = false;
  if (bgMusic.paused) {
    bgMusic.play().catch(() => {}); // suppress autoplay errors silently
  }
}

function stopMusic() {
  if (bgMusic && !bgMusic.paused) {
    bgMusic.pause();
  }
}

// ── MUTE TOGGLE ──────────────────────────────────────────────
function toggleMute() {
  muted = !muted;
  localStorage.setItem('shanti_muted', muted ? 'true' : 'false');

  if (bgMusic) bgMusic.muted = muted;
  if (muteBtn) {
    muteBtn.textContent = muted ? '🔕 Muted' : '🔔 Sound';
    muteBtn.classList.toggle('muted', muted);
  }
  if (!muted) tryPlayMusic();
}

// ── DURATION HELPERS ─────────────────────────────────────────
function getInputDuration() {
  const v = parseInt(durationInput ? durationInput.value : DEFAULT_DURATION, 10);
  if (isNaN(v) || v < 1) return DEFAULT_DURATION;
  return Math.min(Math.max(1, v), 3600);
}

function updateDuration() {
  const newDur = getInputDuration();
  if (newDur === currentDuration) return;
  currentDuration = newDur;
  if (!running) {
    pausedRemainingMs = currentDuration * 1000;
    renderTimer(pausedRemainingMs);
    setRingProgress(1);
  }
  localStorage.setItem('shanti_duration', currentDuration.toString());
}

// ── DISPLAY HELPERS ──────────────────────────────────────────
function msToMMSS(ms) {
  const totalSec = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

function renderTimer(remainingMs) {
  if (!timerEl) return;
  timerEl.textContent = msToMMSS(remainingMs);

  // Low-time style
  const remSec = remainingMs / 1000;
  if (remSec <= LOW_THRESHOLD_SEC && remSec > 0) {
    timerEl.classList.add('low');
  } else {
    timerEl.classList.remove('low');
  }
}

// Update SVG progress ring  (1 = full, 0 = empty)
function setRingProgress(fraction) {
  if (!ringProgress) return;
  const offset = RING_CIRCUMFERENCE * (1 - Math.max(0, Math.min(1, fraction)));
  ringProgress.style.strokeDashoffset = offset;
}

// ── TIMER CORE ───────────────────────────────────────────────
function tick() {
  const now         = Date.now();
  const remainingMs = endTimeMs - now;

  if (remainingMs <= 0) {
    onFinish();
    return;
  }

  renderTimer(remainingMs);
  setRingProgress(remainingMs / (currentDuration * 1000));
}

// Called each time the countdown reaches zero
function onFinish() {
  // Show 00:00 briefly
  if (timerEl) {
    timerEl.textContent = '00:00';
    timerEl.classList.remove('low');
    timerEl.classList.add('finish');
    setTimeout(() => timerEl.classList.remove('finish'), 1500);
  }
  setRingProgress(0);

  // Chime + vibrate
  playChime();
  triggerVibration();

  // Increment session count
  sessionCount++;
  localStorage.setItem('shanti_session_count', sessionCount.toString());
  if (badgeText) badgeText.textContent = `Cycles: ${sessionCount}`;
  if (sessionBadge) {
    sessionBadge.classList.add('bump');
    setTimeout(() => sessionBadge.classList.remove('bump'), 600);
  }

  // ──  AUTO-RESTART (infinite loop) ──
  //     Wait 1 s so user can see 00:00, then restart
  clearInterval(intervalId);
  running = false;
  setTimeout(() => {
    pausedRemainingMs = currentDuration * 1000;
    startTimer();
  }, 1000);
}

// ── START TIMER ──────────────────────────────────────────────
function startTimer() {
  if (running) return;

  updateDuration();
  running   = true;
  endTimeMs = Date.now() + (
    pausedRemainingMs > 0 && pausedRemainingMs < currentDuration * 1000
      ? pausedRemainingMs
      : currentDuration * 1000
  );

  clearInterval(intervalId);
  intervalId = setInterval(tick, TICK_INTERVAL);
  tick(); // immediate first render

  setRingProgress(pausedRemainingMs / (currentDuration * 1000));
  localStorage.setItem('shanti_running', '1');
}

// ── RESTART ──────────────────────────────────────────────────
function restartTimer() {
  updateDuration();
  clearInterval(intervalId);
  running           = false;
  pausedRemainingMs = currentDuration * 1000;
  setRingProgress(1);
  renderTimer(pausedRemainingMs);
  startTimer();
}

// ── KEYBOARD SHORTCUTS ───────────────────────────────────────
function handleKeyboard(e) {
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  if (e.key.toLowerCase() === 'r') { e.preventDefault(); restartTimer(); }
  if (e.key.toLowerCase() === 'm') { e.preventDefault(); toggleMute(); }
}

// ── UNLOCK AUDIO on first interaction ───────────────────────
function unlockAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
  tryPlayMusic();
}

// ── INIT ─────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {

  initAudio();

  // Restore saved state
  const savedMuted    = localStorage.getItem('shanti_muted');
  const savedDuration = localStorage.getItem('shanti_duration');
  const savedSessions = localStorage.getItem('shanti_session_count');
  const savedPaused   = localStorage.getItem('shanti_paused_remaining');

  if (savedDuration) {
    currentDuration = Math.min(Math.max(1, parseInt(savedDuration, 10)), 3600);
    if (durationInput) durationInput.value = currentDuration;
  }

  if (savedMuted === 'true') {
    muted = true;
    if (bgMusic)  bgMusic.muted = true;
    if (muteBtn) {
      muteBtn.textContent = '🔕 Muted';
      muteBtn.classList.add('muted');
    }
  }

  if (savedSessions) {
    sessionCount = parseInt(savedSessions, 10);
    if (badgeText) badgeText.textContent = `Cycles: ${sessionCount}`;
  }

  if (savedPaused) {
    pausedRemainingMs = parseInt(savedPaused, 10);
  } else {
    pausedRemainingMs = currentDuration * 1000;
  }

  // Initial display before starting
  renderTimer(pausedRemainingMs);
  setRingProgress(pausedRemainingMs / (currentDuration * 1000));

  // ── Event listeners ──
  if (durationInput) {
    durationInput.addEventListener('change', () => { unlockAudio(); updateDuration(); });
    durationInput.addEventListener('input',  () => { if (!running) updateDuration(); });
  }

  if (restartBtn) restartBtn.addEventListener('click', () => { unlockAudio(); restartTimer(); });
  if (muteBtn)    muteBtn.addEventListener('click',    () => { unlockAudio(); toggleMute(); });
  document.addEventListener('keydown', handleKeyboard);

  // Audio unlock on any user gesture
  const unlockEvents = ['click','mousedown','keydown','touchstart','pointerdown'];
  unlockEvents.forEach(ev => document.addEventListener(ev, unlockAudio, { once: false, passive: true }));
  window.addEventListener('focus', unlockAudio);

  // Resume music when tab regains focus
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) tryPlayMusic();
  });

  bgMusic?.addEventListener('canplaythrough', tryPlayMusic, { once: true });

  // Start the timer automatically
  startTimer();
  // Attempt music (may require user interaction per browser policy)
  tryPlayMusic();
});

// Also try after full page load
window.addEventListener('load', tryPlayMusic);
