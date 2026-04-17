/* ═══════════════════════════════════════════════════════════════
   App Module — Main Application Coordinator
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── State ───
  let selectedRounds = 3;
  let selectedMode = 'classic';
  let hostId = null;
  let currentGameMode = 'classic';

  // ─── Init ───
  function init() {
    Socket.connect();
    setupEventListeners();
    setupSocketListeners();
    checkForRoomInURL();
  }

  // ─── Check URL for room code ───
  function checkForRoomInURL() {
    const params = new URLSearchParams(window.location.search);
    const roomFromURL = params.get('room');
    if (roomFromURL) {
      document.getElementById('join-code').value = roomFromURL.toUpperCase();
      UI.showView('join');
    }
  }

  // ─── UI Event Listeners ───
  function setupEventListeners() {
    // Landing
    document.getElementById('btn-create').addEventListener('click', () => UI.showView('create'));
    document.getElementById('btn-join').addEventListener('click', () => UI.showView('join'));

    // Back buttons
    document.getElementById('btn-back-create').addEventListener('click', () => UI.showView('landing'));
    document.getElementById('btn-back-join').addEventListener('click', () => UI.showView('landing'));

    // Mode selector
    document.querySelectorAll('.mode-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.mode-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedMode = btn.dataset.mode;
      });
    });

    // Rounds selector
    document.querySelectorAll('.round-option').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.round-option').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        selectedRounds = parseInt(btn.dataset.rounds);
      });
    });

    // Create room form
    document.getElementById('form-create').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('create-username').value.trim();
      if (!username) return UI.showToast('Please enter your name', 'error');
      Socket.createRoom(username, selectedRounds, selectedMode);
    });

    // Join room form
    document.getElementById('form-join').addEventListener('submit', (e) => {
      e.preventDefault();
      const username = document.getElementById('join-username').value.trim();
      const code = document.getElementById('join-code').value.trim().toUpperCase();
      if (!username) return UI.showToast('Please enter your name', 'error');
      if (!code || code.length < 4) return UI.showToast('Please enter a valid room code', 'error');
      Socket.joinRoom(code, username);
    });

    // Copy room link
    document.getElementById('btn-copy-code').addEventListener('click', () => {
      const code = Socket.getRoomCode();
      const url = `${window.location.origin}${window.location.pathname}?room=${code}`;
      UI.copyToClipboard(url);
    });

    // Start game (host)
    document.getElementById('btn-start-game').addEventListener('click', () => {
      Socket.startRound();
    });

    // Timer button
    document.getElementById('btn-timer').addEventListener('click', handleTimerClick);

    // Next round (host)
    document.getElementById('btn-next-round').addEventListener('click', () => {
      Socket.nextRound();
    });

    // Play again (host)
    document.getElementById('btn-play-again').addEventListener('click', () => {
      Socket.playAgain();
    });

    // Back to home
    document.getElementById('btn-new-game').addEventListener('click', () => {
      window.location.href = window.location.pathname;
    });

    // ─── Grid Mode Event Listeners ───
    setupGridEventListeners();
  }

  // ─── Grid Event Listeners ───
  function setupGridEventListeners() {
    // Grid cell clicks
    document.querySelectorAll('#grid-board .grid-cell').forEach(cell => {
      cell.addEventListener('click', () => handleGridCellClick(parseInt(cell.dataset.cell)));
    });

    // Confirm traps button
    document.getElementById('btn-grid-confirm').addEventListener('click', () => {
      const cells = Game.gridGetSelectedCells();
      if (cells.length !== 4) {
        UI.showToast('Select exactly 4 cells', 'error');
        return;
      }
      Socket.gridSetTraps(cells);

      // Lock the board
      document.querySelectorAll('#grid-board .grid-cell').forEach(c => {
        c.classList.add('grid-cell-locked');
      });
      document.getElementById('btn-grid-confirm').style.display = 'none';
      document.getElementById('grid-counter').style.display = 'none';
      document.getElementById('grid-waiting').style.display = 'flex';
      document.getElementById('grid-waiting-text').textContent = 'Traps set! Waiting for runners...';
      document.getElementById('grid-hint').textContent = 'Your traps are locked in. Waiting for runners to choose...';
    });

    // Grid next round button
    document.getElementById('btn-grid-next-round').addEventListener('click', () => {
      Socket.nextRound();
    });
  }

  // ─── Grid Cell Click Handler ───
  function handleGridCellClick(cellIndex) {
    const phase = Game.gridGetPhase();

    if (phase === 'trapper-picking' && Game.gridGetIsTrapper()) {
      // Trapper toggling cells
      const selected = Game.gridToggleCell(cellIndex);
      updateGridBoardUI(selected);
      document.getElementById('grid-selected-count').textContent = selected.length;
      document.getElementById('btn-grid-confirm').disabled = selected.length !== 4;
    } else if (phase === 'runners-picking' && !Game.gridGetIsTrapper()) {
      // Runner picking a single cell
      if (Game.gridGetRunnerCell() !== null) return; // Already picked

      Game.gridSetRunnerCell(cellIndex);
      Game.gridSetPhase('submitted');

      // Update UI
      document.querySelectorAll('#grid-board .grid-cell').forEach(c => {
        c.classList.remove('grid-cell-runner-pick');
        c.classList.add('grid-cell-locked');
      });
      const targetCell = document.querySelector(`#grid-board .grid-cell[data-cell="${cellIndex}"]`);
      if (targetCell) {
        targetCell.classList.add('grid-cell-runner-pick');
      }

      document.getElementById('grid-hint').textContent = 'Your choice is locked in. Waiting for other runners...';

      Socket.gridPickCell(cellIndex);
    }
  }

  // ─── Update Grid Board UI ───
  function updateGridBoardUI(selectedCells) {
    document.querySelectorAll('#grid-board .grid-cell').forEach(cell => {
      const idx = parseInt(cell.dataset.cell);
      cell.classList.remove('grid-cell-trap', 'grid-cell-runner-pick');
      if (selectedCells.includes(idx)) {
        cell.classList.add('grid-cell-trap');
      }
    });
  }

  // ─── Timer Button Handler ───
  function handleTimerClick() {
    const btn = document.getElementById('btn-timer');
    const state = btn.dataset.state;

    if (state === 'ready') {
      // Start the timer
      Game.startTimer();
      btn.dataset.state = 'running';
      btn.querySelector('.timer-btn-text').textContent = 'TAP TO STOP';

      // Show live timer for speed mode
      if (currentGameMode === 'speed') {
        document.getElementById('live-timer-section').style.display = 'flex';
        document.getElementById('timer-hint').textContent = 'Watch the timer — stop it as close to the target as you can!';
      } else {
        document.getElementById('timer-hint').textContent = 'Timer is running... Stop when you feel the target time has elapsed!';
      }
    } else if (state === 'running') {
      // Stop the timer
      const elapsed = Game.stopTimer();
      if (elapsed !== null) {
        btn.dataset.state = 'stopped';
        btn.querySelector('.timer-btn-text').textContent = 'STOPPED';
        document.getElementById('timer-hint').textContent = 'Your time has been submitted. Waiting for other players...';

        // Freeze the live timer display
        if (currentGameMode === 'speed') {
          document.getElementById('live-timer-value').textContent = elapsed.toFixed(3);
        }

        Socket.playerStop(elapsed);
      }
    }
    // If 'stopped', do nothing
  }

  // ─── Socket Event Listeners ───
  function setupSocketListeners() {
    // Room created
    Socket.on('room-created', (data) => {
      Socket.setRoomCode(data.roomCode);
      Socket.setIsHost(true);
      hostId = Socket.getMyId();
      currentGameMode = data.mode || 'classic';

      document.getElementById('lobby-room-code').textContent = data.roomCode;
      document.getElementById('lobby-rounds').textContent = data.maxRounds;
      updateLobbyMode(data.mode);
      updateLobbyPlayers(data.players, data.mode);
      showHostControls('lobby', true);

      UI.showView('lobby');
      UI.showToast('Room created! Share the code with friends', 'success');
    });

    // Player joined (for joining player)
    Socket.on('room-joined', (data) => {
      Socket.setRoomCode(data.roomCode);
      Socket.setIsHost(false);
      hostId = null;
      currentGameMode = data.mode || 'classic';

      document.getElementById('lobby-room-code').textContent = data.roomCode;
      document.getElementById('lobby-rounds').textContent = data.maxRounds;
      updateLobbyMode(data.mode);
      updateLobbyPlayers(data.players, data.mode);
      showHostControls('lobby', false);

      UI.showView('lobby');
      UI.showToast(`Joined ${data.hostName}'s room!`, 'success');
    });

    // Player joined (broadcast to others)
    Socket.on('player-joined', (data) => {
      updateLobbyPlayers(data.players, currentGameMode);
      UI.showToast(`${data.newPlayer} joined!`, 'info');
    });

    // Player left
    Socket.on('player-left', (data) => {
      updateLobbyPlayers(data.players, currentGameMode);
      UI.showToast(`${data.leftPlayer} disconnected`, 'error');
    });

    // New host assigned
    Socket.on('new-host', (data) => {
      hostId = data.hostId;
      const amNewHost = Socket.getSocket().id === data.hostId;
      Socket.setIsHost(amNewHost);

      if (amNewHost) {
        UI.showToast('You are now the host!', 'info');
      } else {
        UI.showToast(`${data.hostName} is the new host`, 'info');
      }

      // Update controls visibility
      const currentView = document.querySelector('.view.active')?.id.replace('view-', '');
      if (currentView === 'lobby') showHostControls('lobby', amNewHost);
      if (currentView === 'results') showHostControls('results', amNewHost);
      if (currentView === 'grid-results') showGridHostControls(amNewHost);
    });

    // Round started (classic/speed)
    Socket.on('round-started', (data) => {
      const mode = data.mode || 'classic';
      currentGameMode = mode;

      Game.reset();
      Game.setMode(mode);
      Game.setTarget(data.targetTime);
      Game.setRoundInfo(data.roundNumber, data.maxRounds);
      Game.setPlayers(data.players);

      // Update game UI
      document.getElementById('game-round-num').textContent = data.roundNumber;
      document.getElementById('game-max-rounds').textContent = data.maxRounds;
      document.getElementById('game-target-time').textContent = data.targetTime.toFixed(1);

      // Update mode badge
      if (mode === 'speed') {
        document.getElementById('game-mode-badge').classList.add('mode-badge-speed');
        document.getElementById('game-mode-badge').querySelector('.mode-badge-icon').textContent = '⚡';
        document.getElementById('game-mode-label').textContent = 'Speed';
      } else {
        document.getElementById('game-mode-badge').classList.remove('mode-badge-speed');
        document.getElementById('game-mode-badge').querySelector('.mode-badge-icon').textContent = '🙈';
        document.getElementById('game-mode-label').textContent = 'Classic';
      }

      // Reset live timer display
      document.getElementById('live-timer-section').style.display = 'none';
      document.getElementById('live-timer-value').textContent = '0.000';

      // Reset timer button
      const btn = document.getElementById('btn-timer');
      btn.dataset.state = 'ready';
      btn.querySelector('.timer-btn-text').textContent = 'TAP TO START';

      if (mode === 'speed') {
        document.getElementById('timer-hint').textContent = 'Press start, then stop the timer when it reaches the target time!';
      } else {
        document.getElementById('timer-hint').textContent = 'Press the button to start, then press again when you think the target time has elapsed';
      }

      // Reset player status dots
      UI.renderPlayerStatusDots(
        document.getElementById('game-players-status'),
        data.players,
        []
      );

      UI.showView('game');
    });

    // Player submitted their time
    Socket.on('player-submitted', (data) => {
      Game.addSubmitted(data.playerId);
      UI.renderPlayerStatusDots(
        document.getElementById('game-players-status'),
        Game.getPlayers(),
        Game.getSubmittedPlayers()
      );
    });

    // Round results (classic/speed)
    Socket.on('round-results', (data) => {
      document.getElementById('results-round-num').textContent = data.roundNumber;
      document.getElementById('results-target').textContent = data.targetTime.toFixed(1);

      UI.renderResultsTable(document.getElementById('results-tbody'), data.results);
      UI.renderStandings(document.getElementById('standings-list'), data.standings);

      if (data.isLastRound) {
        // Show final results
        showFinalResults(data.standings);
      } else {
        showHostControls('results', Socket.getIsHost());
        UI.showView('results');
      }
    });

    // ─── Grid Mode Socket Listeners ───
    setupGridSocketListeners();

    // Game reset (play again)
    Socket.on('game-reset', (data) => {
      currentGameMode = data.mode || 'classic';
      document.getElementById('lobby-room-code').textContent = data.roomCode;
      document.getElementById('lobby-rounds').textContent = data.maxRounds;
      updateLobbyMode(data.mode);
      updateLobbyPlayers(data.players, data.mode);
      showHostControls('lobby', Socket.getIsHost());
      UI.showView('lobby');
      UI.showToast('Game reset! Ready for a new session', 'info');
    });

    // Error messages
    Socket.on('error-msg', (data) => {
      UI.showToast(data.message, 'error');
    });
  }

  // ─── Grid Socket Listeners ───
  function setupGridSocketListeners() {
    // Grid round started
    Socket.on('grid-round-started', (data) => {
      currentGameMode = 'grid';
      Game.gridReset();
      Game.setPlayers(data.players);
      Game.setRoundInfo(data.roundNumber, data.maxRounds);

      const myId = Socket.getMyId();
      const isTrapper = (myId === data.trapperId);
      Game.gridSetIsTrapper(isTrapper);
      Game.gridSetPhase('trapper-picking');

      // Update round info
      document.getElementById('grid-round-num').textContent = data.roundNumber;
      document.getElementById('grid-max-rounds').textContent = data.maxRounds;

      // Update role badge
      const roleBadge = document.getElementById('grid-role-badge');
      const roleIcon = document.getElementById('grid-role-icon');
      const roleText = document.getElementById('grid-role-text');
      const roleDesc = document.getElementById('grid-role-desc');

      if (isTrapper) {
        roleBadge.className = 'grid-role-badge role-trapper';
        roleIcon.textContent = '🪤';
        roleText.textContent = 'You are the Trapper';
        roleDesc.textContent = 'Select 4 cells to set your traps';
        document.getElementById('grid-counter').style.display = 'block';
        document.getElementById('grid-selected-count').textContent = '0';
        document.getElementById('btn-grid-confirm').style.display = 'inline-flex';
        document.getElementById('btn-grid-confirm').disabled = true;
        document.getElementById('grid-waiting').style.display = 'none';
        document.getElementById('grid-hint').textContent = 'Choose 4 cells to trap runners. They won\'t see your picks!';
      } else {
        roleBadge.className = 'grid-role-badge role-runner';
        roleIcon.textContent = '🏃';
        roleText.textContent = 'You are a Runner';
        roleDesc.textContent = `${data.trapperName} is setting traps...`;
        document.getElementById('grid-counter').style.display = 'none';
        document.getElementById('btn-grid-confirm').style.display = 'none';
        document.getElementById('grid-waiting').style.display = 'flex';
        document.getElementById('grid-waiting-text').textContent = `Waiting for ${data.trapperName} to set traps...`;
        document.getElementById('grid-hint').textContent = `${data.trapperName} is placing 4 traps on the grid. You\'ll pick a cell next!`;
      }

      // Reset grid board
      document.querySelectorAll('#grid-board .grid-cell').forEach(cell => {
        cell.className = 'grid-cell';
        if (!isTrapper) {
          cell.classList.add('grid-cell-disabled');
        }
      });

      // Render player status dots
      UI.renderPlayerStatusDots(
        document.getElementById('grid-players-status'),
        data.players,
        []
      );

      UI.showView('grid-game');
    });

    // Traps locked — runners can now pick
    Socket.on('grid-traps-locked', (data) => {
      Game.gridSetPhase('runners-picking');

      if (!Game.gridGetIsTrapper()) {
        // Enable grid cells for runner
        document.querySelectorAll('#grid-board .grid-cell').forEach(cell => {
          cell.classList.remove('grid-cell-disabled');
        });
        document.getElementById('grid-waiting').style.display = 'none';
        document.getElementById('grid-role-desc').textContent = 'Pick 1 cell — avoid the traps!';
        document.getElementById('grid-hint').textContent = 'The trapper has placed 4 traps. Pick a safe cell!';
      }

      UI.showToast(data.message, 'info');
    });

    // Runner submitted their pick
    Socket.on('grid-runner-submitted', (data) => {
      Game.gridAddSubmittedRunner(data.playerId);
      UI.renderPlayerStatusDots(
        document.getElementById('grid-players-status'),
        Game.getPlayers(),
        Game.gridGetSubmittedRunners()
      );
    });

    // Grid round results
    Socket.on('grid-round-results', (data) => {
      document.getElementById('grid-results-round-num').textContent = data.roundNumber;
      document.getElementById('grid-results-trapper').textContent = data.trapperName;

      // Render reveal board
      UI.renderGridReveal(
        document.getElementById('grid-board-reveal'),
        data.trapCells,
        data.runnerResults,
        Game.getPlayers()
      );

      // Render outcomes
      UI.renderGridOutcomes(document.getElementById('grid-outcomes'), data.runnerResults);

      // Render trapper score
      UI.renderGridTrapperScore(
        document.getElementById('grid-trapper-score'),
        data.trapperName,
        data.trapperScore,
        data.caughtCount,
        data.runnerResults.length
      );

      // Render standings
      UI.renderStandings(document.getElementById('grid-standings-list'), data.standings);

      if (data.isLastRound) {
        showFinalResults(data.standings);
      } else {
        showGridHostControls(Socket.getIsHost());
        UI.showView('grid-results');
      }
    });
  }

  // ─── Helpers ───
  function updateLobbyMode(mode) {
    const modeEl = document.getElementById('lobby-mode');
    const gridInfo = document.getElementById('grid-mode-info');

    if (mode === 'speed') {
      modeEl.textContent = '⚡ Speed';
      gridInfo.style.display = 'none';
    } else if (mode === 'grid') {
      modeEl.textContent = '🔲 Grid';
      gridInfo.style.display = 'block';
    } else {
      modeEl.textContent = '🙈 Classic';
      gridInfo.style.display = 'none';
    }
  }

  function updateLobbyPlayers(players, mode) {
    Game.setPlayers(players);

    // Determine hostId from players if we don't have it
    // The first player is usually the host
    UI.renderPlayerList(
      document.getElementById('lobby-players'),
      players,
      hostId
    );

    const maxPlayers = mode === 'grid' ? 5 : 15;
    document.getElementById('lobby-player-count').textContent = `${players.length}/${maxPlayers}`;
  }

  function showHostControls(view, isHost) {
    if (view === 'lobby') {
      document.getElementById('lobby-host-controls').style.display = isHost ? 'block' : 'none';
      document.getElementById('lobby-waiting').style.display = isHost ? 'none' : 'flex';
    } else if (view === 'results') {
      document.getElementById('results-host-controls').style.display = isHost ? 'block' : 'none';
      document.getElementById('results-waiting').style.display = isHost ? 'none' : 'flex';
    }
  }

  function showGridHostControls(isHost) {
    document.getElementById('grid-results-host-controls').style.display = isHost ? 'block' : 'none';
    document.getElementById('grid-results-waiting').style.display = isHost ? 'none' : 'flex';
  }

  function showFinalResults(standings) {
    if (standings.length > 0) {
      document.getElementById('winner-name').textContent = standings[0].name;
      document.getElementById('winner-score').textContent = `${standings[0].totalScore} points`;
    }

    UI.renderFinalStandings(document.getElementById('final-standings'), standings);

    // Show host controls
    document.getElementById('final-host-controls').style.display = Socket.getIsHost() ? 'block' : 'none';

    UI.showView('final');

    // Confetti!
    setTimeout(() => UI.spawnConfetti(), 300);
  }

  // ─── Start ───
  document.addEventListener('DOMContentLoaded', init);
})();
