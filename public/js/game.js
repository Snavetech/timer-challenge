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

  // ─── Grid Mode State ───
  let gridSelectedCells = [];
  let gridIsTrapper = false;
  let gridPhase = 'idle'; // idle | trapper-picking | runners-picking | submitted | reveal
  let gridRunnerCells = [];
  let gridSubmittedRunners = [];

  function gridReset() {
    gridSelectedCells = [];
    gridIsTrapper = false;
    gridPhase = 'idle';
    gridRunnerCells = [];
    gridSubmittedRunners = [];
  }

  function gridSetIsTrapper(val) {
    gridIsTrapper = val;
  }

  function gridGetIsTrapper() {
    return gridIsTrapper;
  }

  function gridSetPhase(phase) {
    gridPhase = phase;
  }

  function gridGetPhase() {
    return gridPhase;
  }

  function gridToggleCell(cellIndex) {
    const idx = gridSelectedCells.indexOf(cellIndex);
    if (idx !== -1) {
      gridSelectedCells.splice(idx, 1);
    } else if (gridSelectedCells.length < 4) {
      gridSelectedCells.push(cellIndex);
    }
    return gridSelectedCells;
  }

  function gridGetSelectedCells() {
    return [...gridSelectedCells];
  }

  function gridToggleRunnerCell(cellIndex) {
    const idx = gridRunnerCells.indexOf(cellIndex);
    if (idx !== -1) {
      gridRunnerCells.splice(idx, 1);
    } else if (gridRunnerCells.length < 2) {
      gridRunnerCells.push(cellIndex);
    }
    return gridRunnerCells;
  }

  function gridGetRunnerCells() {
    return [...gridRunnerCells];
  }

  function gridAddSubmittedRunner(playerId) {
    if (!gridSubmittedRunners.includes(playerId)) {
      gridSubmittedRunners.push(playerId);
    }
  }

  function gridGetSubmittedRunners() {
    return gridSubmittedRunners;
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
    // Grid methods
    gridReset,
    gridSetIsTrapper,
    gridGetIsTrapper,
    gridSetPhase,
    gridGetPhase,
    gridToggleCell,
    gridGetSelectedCells,
    gridToggleRunnerCell,
    gridGetRunnerCells,
    gridAddSubmittedRunner,
    gridGetSubmittedRunners,
    get currentRound() { return currentRound; },
    get maxRounds() { return maxRounds; },
    get currentTarget() { return currentTarget; }
  };
})();
