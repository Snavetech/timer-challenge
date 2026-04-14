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
  }

  function stopTimer() {
    if (!timerRunning) return null;
    const elapsed = (performance.now() - timerStartTime) / 1000;
    timerRunning = false;
    timerStartTime = null;
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

  return {
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
