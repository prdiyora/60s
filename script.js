// script.js

// Constants
const DURATION = 60; // 60 seconds
const TICK_INTERVAL = 250; // 250ms for smooth display

// DOM Elements
const timerElement = document.getElementById('timer');
const toggleBtn = document.getElementById('toggleBtn');
const restartBtn = document.getElementById('restartBtn');
const muteBtn = document.getElementById('muteBtn');
const sessionBadge = document.getElementById('sessionBadge');

// State variables
let endTimeMs = 0;
let intervalId = null;
let pausedRemainingMs = DURATION * 1000;
let running = false;
let muted = false;
let sessionCount = 0;
let audioContext = null;
let bgMusic = null;

// Initialize Web Audio for chime
function initAudio() {
  try {
    audioContext = new (window.AudioContext || window.webkitAudioContext)();
  } catch (e) {
    console.warn('Web Audio not supported');
  }
}

// Play a soft chime sound
function playChime() {
  if (muted || !audioContext) return;
  
  try {
    if (audioContext.state === 'suspended') {
      audioContext.resume();
    }
    
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();
    
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(440, audioContext.currentTime);
    
    gainNode.gain.setValueAtTime(0.05, audioContext.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.001, audioContext.currentTime + 0.12);
    
    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);
    
    oscillator.start(audioContext.currentTime);
    oscillator.stop(audioContext.currentTime + 0.12);
  } catch (e) {
    console.warn('Failed to play chime:', e);
  }
}

// Trigger vibration if supported and not muted
function triggerVibration() {
  if (muted || !navigator.vibrate) return;
  navigator.vibrate([50, 30, 50]);
}

// Convert milliseconds to MM:SS format
function msToMMSS(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Called when timer reaches 0
function onFinish() {
  timerElement.textContent = '00:00';
  timerElement.classList.add('finish');
  
  // Announce completion to screen readers
  const announcement = document.createElement('div');
  announcement.className = 'sr-only';
  announcement.setAttribute('aria-live', 'polite');
  announcement.textContent = 'Minute complete';
  document.body.appendChild(announcement);
  
  // Remove announcement after it's been read
  setTimeout(() => {
    document.body.removeChild(announcement);
  }, 1000);
  
  // Play chime and vibrate
  playChime();
  triggerVibration();
  
  // Increment session counter
  sessionCount++;
  sessionBadge.textContent = `Cycles: ${sessionCount}`;
  
  // Save to localStorage
  localStorage.setItem('shanti_session_count', sessionCount.toString());
  
  // Remove finish animation class after animation completes
  setTimeout(() => {
    timerElement.classList.remove('finish');
  }, 600);
  
  // Start next cycle
  setEndFromNow();
}

// Set end time from current time
function setEndFromNow() {
  endTimeMs = Date.now() + DURATION * 1000;
}

// Update timer display
function tick() {
  const now = Date.now();
  const remainingMs = endTimeMs - now;
  
  if (remainingMs <= 0) {
    onFinish();
    return;
  }
  
  timerElement.textContent = msToMMSS(remainingMs);
}

// Start the timer
function startTimer() {
  if (running) return;
  
  running = true;
  toggleBtn.setAttribute('aria-pressed', 'false');
  toggleBtn.textContent = 'Pause';
  
  // If we have paused time, use it; otherwise start fresh
  if (pausedRemainingMs > 0 && pausedRemainingMs < DURATION * 1000) {
    endTimeMs = Date.now() + pausedRemainingMs;
  } else {
    setEndFromNow();
  }
  
  // Clear any existing interval
  if (intervalId) {
    clearInterval(intervalId);
  }
  
  // Start ticking
  intervalId = setInterval(tick, TICK_INTERVAL);
  
  // Save state
  localStorage.setItem('shanti_running', '1');
  localStorage.removeItem('shanti_paused_remaining');
}

// Pause the timer
function pauseTimer() {
  if (!running) return;
  
  running = false;
  toggleBtn.setAttribute('aria-pressed', 'true');
  toggleBtn.textContent = 'Resume';
  
  // Clear interval
  clearInterval(intervalId);
  intervalId = null;
  
  // Calculate remaining time
  pausedRemainingMs = Math.max(0, endTimeMs - Date.now());
  
  // Save state
  localStorage.setItem('shanti_running', '0');
  localStorage.setItem('shanti_paused_remaining', pausedRemainingMs.toString());
}

// Toggle pause/resume
function toggleTimer() {
  if (running) {
    pauseTimer();
  } else {
    startTimer();
  }
}

// Restart timer
function restartTimer() {
  pausedRemainingMs = DURATION * 1000;
  if (running) {
    setEndFromNow();
    tick(); // Update display immediately
  } else {
    timerElement.textContent = '01:00';
  }
  
  // Save state
  localStorage.setItem('shanti_paused_remaining', pausedRemainingMs.toString());
}

// Toggle mute
function toggleMute() {
  muted = !muted;
  muteBtn.setAttribute('aria-pressed', muted.toString());
  muteBtn.textContent = muted ? 'Unmute' : 'Mute';
  // Mute/unmute background music
  if (bgMusic) {
    bgMusic.muted = muted;
  }
  // Save to localStorage
  localStorage.setItem('shanti_muted', muted.toString());
}

// Handle keyboard shortcuts
function handleKeyboardShortcuts(e) {
  // Ignore if typing in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  switch (e.key.toLowerCase()) {
    case ' ':
      e.preventDefault();
      toggleTimer();
      break;
    case 'r':
      e.preventDefault();
      restartTimer();
      break;
    case 'm':
      e.preventDefault();
      toggleMute();
      break;
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Initialize audio
  initAudio();
  // Play background music
  bgMusic = document.getElementById('bgMusic');
  if (bgMusic) {
    // Try to play immediately (may be blocked by browser until user interacts)
    bgMusic.volume = 0.5;
    const playPromise = bgMusic.play();
    if (playPromise !== undefined) {
      playPromise.catch(() => {
        // If autoplay is blocked, play on first user interaction
        const unlock = () => {
          bgMusic.play();
          document.removeEventListener('click', unlock);
          document.removeEventListener('keydown', unlock);
        };
        document.addEventListener('click', unlock);
        document.addEventListener('keydown', unlock);
      });
    }
  }
  
  // Load saved state
  const savedMuted = localStorage.getItem('shanti_muted');
  const savedRunning = localStorage.getItem('shanti_running');
  const savedPausedRemaining = localStorage.getItem('shanti_paused_remaining');
  const savedSessionCount = localStorage.getItem('shanti_session_count');
  
  // Restore mute state
  if (savedMuted === 'true') {
    muted = true;
    muteBtn.setAttribute('aria-pressed', 'true');
    muteBtn.textContent = 'Unmute';
    if (bgMusic) bgMusic.muted = true;
  }
  
  // Restore session count
  if (savedSessionCount) {
    sessionCount = parseInt(savedSessionCount, 10);
    sessionBadge.textContent = `Cycles: ${sessionCount}`;
  }
  
  // Restore timer state
  if (savedPausedRemaining) {
    pausedRemainingMs = parseInt(savedPausedRemaining, 10);
    timerElement.textContent = msToMMSS(pausedRemainingMs);
  }
  
  // Start or restore timer based on saved state
  if (savedRunning === '1') {
    startTimer();
  } else if (savedPausedRemaining) {
    // Keep paused but show saved remaining time
    running = false;
    toggleBtn.setAttribute('aria-pressed', 'true');
    toggleBtn.textContent = 'Resume';
  }
  
  // Add event listeners
  toggleBtn.addEventListener('click', toggleTimer);
  restartBtn.addEventListener('click', restartTimer);
  muteBtn.addEventListener('click', toggleMute);
  document.addEventListener('keydown', handleKeyboardShortcuts);
  
  // Start timer automatically if not previously paused
  if (savedRunning !== '0') {
    startTimer();
  }
});