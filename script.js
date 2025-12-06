// script.js

// Constants
const DEFAULT_DURATION = 5; // 5 seconds (default)
const TICK_INTERVAL = 250; // 250ms for smooth display

// DOM Elements
const timerElement = document.getElementById('timer');
const sessionBadge = document.getElementById('sessionBadge');
const durationInput = document.getElementById('durationInput');

// State variables
let endTimeMs = 0;
let intervalId = null;
let currentDuration = DEFAULT_DURATION; // Current duration in seconds
let pausedRemainingMs = DEFAULT_DURATION * 1000;
let running = false;
let muted = false;
let sessionCount = 0;
let audioContext = null;
let bgMusic = null;
let previousUrl = null; // Store previous tab URL

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

// Get current duration from input
function getCurrentDuration() {
  const inputValue = parseInt(durationInput.value, 10);
  if (isNaN(inputValue) || inputValue < 1) {
    return DEFAULT_DURATION;
  }
  return Math.min(Math.max(1, inputValue), 3600); // Clamp between 1 and 3600 seconds
}

// Update duration and reset timer display
function updateDuration() {
  const newDuration = getCurrentDuration();
  if (newDuration !== currentDuration) {
    currentDuration = newDuration;
    // If not running, update display
    if (!running) {
      pausedRemainingMs = currentDuration * 1000;
      timerElement.textContent = msToMMSS(pausedRemainingMs);
    }
    // Save to localStorage
    localStorage.setItem('shanti_duration', currentDuration.toString());
  }
}

// Convert milliseconds to MM:SS format
function msToMMSS(ms) {
  const totalSeconds = Math.ceil(Math.max(0, ms) / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
}

// Close current tab and reopen previous tab
function closeAndReopenPrevious() {
  // Try to get previous URL from sessionStorage
  const previousUrl = sessionStorage.getItem('shanti_previous_url');
  
  // First, try to navigate to previous URL if we have it
  if (previousUrl && previousUrl !== window.location.href) {
    window.location.href = previousUrl;
    return;
  }
  
  // If no previous URL, try to go back in history
  if (window.history.length > 1) {
    window.history.back();
    return;
  }
  
  // As a last resort, try to close the window
  // This will only work if the window was opened by JavaScript
  // Note: Most browsers will ignore this if the window wasn't opened by script
  window.close();
}

// Called when timer reaches 0
function onFinish() {
  timerElement.textContent = '00:00';
  timerElement.classList.add('finish');
  
  // Announce completion to screen readers
  const announcement = document.createElement('div');
  announcement.className = 'sr-only';
  announcement.setAttribute('aria-live', 'polite');
  announcement.textContent = 'Timer complete';
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
  
  // Close tab and reopen previous tab after a short delay
  setTimeout(() => {
    closeAndReopenPrevious();
  }, 1000);
}

// Set end time from current time
function setEndFromNow() {
  endTimeMs = Date.now() + currentDuration * 1000;
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
  
  // Update duration in case it changed
  updateDuration();
  
  running = true;
  
  // If we have paused time, use it; otherwise start fresh
  if (pausedRemainingMs > 0 && pausedRemainingMs < currentDuration * 1000) {
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

// Timer runs automatically - no pause/resume needed

// Restart timer
function restartTimer() {
  updateDuration();
  pausedRemainingMs = currentDuration * 1000;
  if (running) {
    setEndFromNow();
    tick(); // Update display immediately
  } else {
    timerElement.textContent = msToMMSS(pausedRemainingMs);
  }
  
  // Save state
  localStorage.setItem('shanti_paused_remaining', pausedRemainingMs.toString());
}

// Music plays automatically - no mute toggle needed

// Handle keyboard shortcuts - simplified since no buttons
function handleKeyboardShortcuts(e) {
  // Ignore if typing in an input field
  if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
  
  // Only restart timer on 'r' key
  if (e.key.toLowerCase() === 'r') {
    e.preventDefault();
    restartTimer();
  }
}

// Initialize on page load
document.addEventListener('DOMContentLoaded', () => {
  // Store previous URL before opening timer
  // Try to get referrer or use document.referrer
  if (document.referrer && document.referrer !== window.location.href) {
    sessionStorage.setItem('shanti_previous_url', document.referrer);
  }
  
  // Initialize audio
  initAudio();
  
  // Play background music - MUST WORK
  bgMusic = document.getElementById('bgMusic');
  if (bgMusic) {
    // Set volume and ensure it's not muted
    bgMusic.volume = 0.5;
    bgMusic.muted = false;
    
    // Function to play music - more aggressive
    const playMusic = async () => {
      if (!bgMusic) return;
      
      try {
        // Ensure audio context is resumed
        if (audioContext && audioContext.state === 'suspended') {
          await audioContext.resume();
        }
        
        // Try to play
        if (bgMusic.paused && !muted) {
          await bgMusic.play();
          console.log('Music started successfully');
        }
      } catch (err) {
        console.log('Audio play attempt:', err);
        // Don't give up - will retry on interaction
      }
    };
    
    // Wait for audio to be ready
    bgMusic.addEventListener('canplaythrough', () => {
      playMusic();
    }, { once: true });
    
    // Try to play immediately
    playMusic();
    
    // Try multiple times with delays
    setTimeout(playMusic, 100);
    setTimeout(playMusic, 300);
    setTimeout(playMusic, 500);
    setTimeout(playMusic, 1000);
    
    // CRITICAL: Play on ANY user interaction - this MUST work
    const unlockMusic = async (e) => {
      await playMusic();
      // Don't remove listeners - keep trying until it works
    };
    
    // Add listeners to EVERY possible interaction
    document.addEventListener('click', unlockMusic, true);
    document.addEventListener('mousedown', unlockMusic, true);
    document.addEventListener('mouseup', unlockMusic, true);
    document.addEventListener('keydown', unlockMusic, true);
    document.addEventListener('keyup', unlockMusic, true);
    document.addEventListener('touchstart', unlockMusic, true);
    document.addEventListener('touchend', unlockMusic, true);
    document.addEventListener('pointerdown', unlockMusic, true);
    window.addEventListener('focus', unlockMusic, true);
    
    // Also try when page becomes visible
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) {
        playMusic();
      }
    });
  }
  
  // Load saved state
  const savedMuted = localStorage.getItem('shanti_muted');
  const savedRunning = localStorage.getItem('shanti_running');
  const savedPausedRemaining = localStorage.getItem('shanti_paused_remaining');
  const savedSessionCount = localStorage.getItem('shanti_session_count');
  const savedDuration = localStorage.getItem('shanti_duration');
  
  // Restore duration
  if (savedDuration) {
    currentDuration = parseInt(savedDuration, 10);
    durationInput.value = currentDuration;
  }
  
  // Restore mute state
  if (savedMuted === 'true') {
    muted = true;
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
  } else {
    // Initialize with current duration
    pausedRemainingMs = currentDuration * 1000;
    timerElement.textContent = msToMMSS(pausedRemainingMs);
  }
  
  // Start or restore timer based on saved state
  if (savedRunning === '1') {
    startTimer();
  } else if (savedPausedRemaining) {
    // Show saved remaining time and start
    running = false;
    startTimer();
  }
  
  // Function to ensure music plays on interaction
  const ensureMusicPlays = () => {
    if (bgMusic && !muted && bgMusic.paused) {
      bgMusic.play().catch(() => {});
    }
  };
  
  // Add event listeners
  durationInput.addEventListener('change', () => {
    ensureMusicPlays();
    updateDuration();
  });
  durationInput.addEventListener('input', () => {
    ensureMusicPlays();
    // Update display in real-time while typing (only if not running)
    if (!running) {
      updateDuration();
    }
  });
  document.addEventListener('keydown', (e) => {
    ensureMusicPlays();
    handleKeyboardShortcuts(e);
  });
  
  // Also try to play music on any click anywhere
  document.addEventListener('click', ensureMusicPlays, true);
  
  // Start timer automatically if not previously paused
  if (savedRunning !== '0') {
    startTimer();
  }
});

// Also try to play music when window is fully loaded
window.addEventListener('load', () => {
  if (bgMusic) {
    bgMusic.volume = 0.5;
    bgMusic.muted = false;
    if (!muted && bgMusic.paused) {
      bgMusic.play().catch(err => {
        console.log('Audio play on window load failed:', err);
      });
    }
  }
});

// Try to play music when page becomes visible
document.addEventListener('visibilitychange', () => {
  if (!document.hidden && bgMusic && !muted && bgMusic.paused) {
    bgMusic.play().catch(() => {});
  }
});
