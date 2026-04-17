/* ═══════════════════════════════════════════════════════════════
   Game Module — Timer Logic & Game State
   ═══════════════════════════════════════════════════════════════ */

const Game = (() => {
  let timerStartTime = null;
  let timerRunning = false;
  let currentTarget = null;
  let currentRound = 0;
  let maxRounds = 3;
  let submittedPlayers = [];
  let players = [];
  let gameMode = 'classic'; // 'classic' or 'speed'
  let liveTimerRAF = null;

  function setMode(mode) {
    gameMode = mode || 'classic';
  }

  function getMode() {
    return gameMode;
  }

  function setTarget(target) {
    currentTarget = target;
  }

  function setRoundInfo(round, max) {
    currentRound = round;
    maxRounds = max;
  }

  function startTimer() {
    timerStartTime = performance.now();
    timerRunning = true;

    // If speed mode, start live timer animation
    if (gameMode === 'speed') {
      startLiveTimerLoop();
    }
  }

  function stopTimer() {
    if (!timerRunning) return null;
    const elapsed = (performance.now() - timerStartTime) / 1000;
    timerRunning = false;
    timerStartTime = null;

    // Stop live timer animation
    if (liveTimerRAF) {
      cancelAnimationFrame(liveTimerRAF);
      liveTimerRAF = null;
    }

    return Math.round(elapsed * 100) / 100; // 2 decimal precision
  }

  function isRunning() {
    return timerRunning;
  }

  function getElapsed() {
    if (!timerStartTime) return 0;
    return (performance.now() - timerStartTime) / 1000;
  }

  function reset() {
    timerStartTime = null;
    timerRunning = false;
    submittedPlayers = [];
    if (liveTimerRAF) {
      cancelAnimationFrame(liveTimerRAF);
      liveTimerRAF = null;
    }
  }

  function setPlayers(p) {
    players = p;
  }

  function getPlayers() {
    return players;
  }

  function addSubmitted(playerId) {
    if (!submittedPlayers.includes(playerId)) {
      submittedPlayers.push(playerId);
    }
  }

  function getSubmittedPlayers() {
    return submittedPlayers;
  }

  // ─── Live Timer Loop (Speed Mode) ───
  function startLiveTimerLoop() {
    const timerValueEl = document.getElementById('live-timer-value');

    function tick() {
      if (!timerRunning || !timerStartTime) return;

      const elapsed = (performance.now() - timerStartTime) / 1000;
      // Update displayed value with milliseconds
      if (timerValueEl) {
        timerValueEl.textContent = elapsed.toFixed(3);
      }

      liveTimerRAF = requestAnimationFrame(tick);
    }

    liveTimerRAF = requestAnimationFrame(tick);
  }

  return {
    setMode,
    getMode,
    setTarget,
    setRoundInfo,
    startTimer,
    stopTimer,
    isRunning,
    getElapsed,
    reset,
    setPlayers,
    getPlayers,
    addSubmitted,
    getSubmittedPlayers,
    get currentRound() { return currentRound; },
    get maxRounds() { return maxRounds; },
    get currentTarget() { return currentTarget; }
  };
})();
