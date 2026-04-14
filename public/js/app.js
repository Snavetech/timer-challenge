/* ═══════════════════════════════════════════════════════════════
   App Module — Main Application Coordinator
   ═══════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  // ─── State ───
  let selectedRounds = 3;
  let hostId = null;

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
      Socket.createRoom(username, selectedRounds);
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
      document.getElementById('timer-hint').textContent = 'Timer is running... Stop when you feel the target time has elapsed!';
    } else if (state === 'running') {
      // Stop the timer
      const elapsed = Game.stopTimer();
      if (elapsed !== null) {
        btn.dataset.state = 'stopped';
        btn.querySelector('.timer-btn-text').textContent = 'STOPPED';
        document.getElementById('timer-hint').textContent = 'Your time has been submitted. Waiting for other players...';
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

      document.getElementById('lobby-room-code').textContent = data.roomCode;
      document.getElementById('lobby-rounds').textContent = data.maxRounds;
      updateLobbyPlayers(data.players);
      showHostControls('lobby', true);

      UI.showView('lobby');
      UI.showToast('Room created! Share the code with friends', 'success');
    });

    // Player joined (for joining player)
    Socket.on('room-joined', (data) => {
      Socket.setRoomCode(data.roomCode);
      Socket.setIsHost(false);
      hostId = null; // Will get from player list

      document.getElementById('lobby-room-code').textContent = data.roomCode;
      document.getElementById('lobby-rounds').textContent = data.maxRounds;
      updateLobbyPlayers(data.players);
      showHostControls('lobby', false);

      UI.showView('lobby');
      UI.showToast(`Joined ${data.hostName}'s room!`, 'success');
    });

    // Player joined (broadcast to others)
    Socket.on('player-joined', (data) => {
      updateLobbyPlayers(data.players);
      UI.showToast(`${data.newPlayer} joined!`, 'info');
    });

    // Player left
    Socket.on('player-left', (data) => {
      updateLobbyPlayers(data.players);
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
    });

    // Round started
    Socket.on('round-started', (data) => {
      Game.reset();
      Game.setTarget(data.targetTime);
      Game.setRoundInfo(data.roundNumber, data.maxRounds);
      Game.setPlayers(data.players);

      // Update game UI
      document.getElementById('game-round-num').textContent = data.roundNumber;
      document.getElementById('game-max-rounds').textContent = data.maxRounds;
      document.getElementById('game-target-time').textContent = data.targetTime.toFixed(1);

      // Reset timer button
      const btn = document.getElementById('btn-timer');
      btn.dataset.state = 'ready';
      btn.querySelector('.timer-btn-text').textContent = 'TAP TO START';
      document.getElementById('timer-hint').textContent = 'Press the button to start, then press again when you think the target time has elapsed';

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

    // Round results
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

    // Game reset (play again)
    Socket.on('game-reset', (data) => {
      document.getElementById('lobby-room-code').textContent = data.roomCode;
      document.getElementById('lobby-rounds').textContent = data.maxRounds;
      updateLobbyPlayers(data.players);
      showHostControls('lobby', Socket.getIsHost());
      UI.showView('lobby');
      UI.showToast('Game reset! Ready for a new session', 'info');
    });

    // Error messages
    Socket.on('error-msg', (data) => {
      UI.showToast(data.message, 'error');
    });
  }

  // ─── Helpers ───
  function updateLobbyPlayers(players) {
    Game.setPlayers(players);

    // Determine hostId from players if we don't have it
    // The first player is usually the host
    UI.renderPlayerList(
      document.getElementById('lobby-players'),
      players,
      hostId
    );

    document.getElementById('lobby-player-count').textContent = `${players.length}/15`;
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
