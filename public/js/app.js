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
  let localWhotState = null;
  let pendingWhotCard = null;

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

    // Global Music Control
    const btnMusic = document.getElementById('btn-music-toggle');
    const bgMusic = document.getElementById('bg-music');
    if (btnMusic && bgMusic) {
      bgMusic.volume = 0.4;
      btnMusic.addEventListener('click', () => {
        if (bgMusic.paused) {
          bgMusic.play().then(() => {
            btnMusic.classList.add('playing');
            btnMusic.querySelector('.music-icon').textContent = '🔊';
          }).catch(e => console.log('Audio play failed', e));
        } else {
          bgMusic.pause();
          btnMusic.classList.remove('playing');
          btnMusic.querySelector('.music-icon').textContent = '🔇';
        }
      });
    }

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

    // ─── Whot Mode Event Listeners ───
    document.getElementById('whot-deck').addEventListener('click', () => {
      if (!localWhotState || localWhotState.turnIndex === -1) return;
      const myId = Socket.getMyId();
      if (localWhotState.playerIds[localWhotState.turnIndex] === myId) {
        Socket.whotDrawCard();
      } else {
        UI.showToast("It's not your turn!", "warning");
      }
    });

    document.querySelectorAll('.shape-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const shape = e.currentTarget.dataset.shape;
        document.getElementById('whot-shape-modal').style.display = 'none';
        if (pendingWhotCard) {
          Socket.whotPlayCard(pendingWhotCard.id, shape);
          pendingWhotCard = null;
        }
      });
    });

    // ─── Tap Mode Event Listeners ───
    document.getElementById('btn-tap-area').addEventListener('click', handleTapAreaClick);
  }

  // ─── Grid Event Listeners ───
  function setupGridEventListeners() {
    // Grid cell clicks
    document.querySelectorAll('#grid-board .grid-cell').forEach(cell => {
      cell.addEventListener('click', () => handleGridCellClick(parseInt(cell.dataset.cell)));
    });

    // Confirm button (Trapper & Runners)
    document.getElementById('btn-grid-confirm').addEventListener('click', () => {
      const isTrapper = Game.gridGetIsTrapper();
      
      if (isTrapper) {
        const cells = Game.gridGetSelectedCells();
        if (cells.length !== 4) {
          UI.showToast('Select exactly 4 cells', 'error');
          return;
        }
        Socket.gridSetTraps(cells);
        document.getElementById('grid-waiting-text').textContent = 'Traps set! Waiting for runners...';
        document.getElementById('grid-hint').textContent = 'Your traps are locked in. Waiting for runners to choose...';
      } else {
        const cells = Game.gridGetRunnerCells();
        if (cells.length !== 4) {
          UI.showToast('Select exactly 4 cells', 'error');
          return;
        }
        Game.gridSetPhase('submitted');
        Socket.gridPickCell(cells);
        document.getElementById('grid-waiting-text').textContent = 'Picks locked! Waiting for others...';
        document.getElementById('grid-hint').textContent = 'Your choices are locked in. Waiting for other runners...';
      }

      // Lock the board
      document.querySelectorAll('#grid-board .grid-cell').forEach(c => {
        c.classList.add('grid-cell-locked');
        if (!isTrapper && !c.classList.contains('grid-cell-runner-pick')) {
          c.classList.add('grid-cell-disabled');
        }
      });
      document.getElementById('btn-grid-confirm').style.display = 'none';
      document.getElementById('grid-counter').style.display = 'none';
      document.getElementById('grid-waiting').style.display = 'flex';
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
      // Runner toggling cells
      const selected = Game.gridToggleRunnerCell(cellIndex);
      
      // Update UI
      document.querySelectorAll('#grid-board .grid-cell').forEach(c => {
        const idx = parseInt(c.dataset.cell);
        c.classList.remove('grid-cell-runner-pick');
        if (selected.includes(idx)) {
          c.classList.add('grid-cell-runner-pick');
        }
      });
      
      document.getElementById('grid-selected-count').textContent = selected.length;
      document.getElementById('btn-grid-confirm').disabled = selected.length !== 4;
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

      const isTapMode = (mode === 'tap');
      if (isTapMode) {
        // Init tap game
        Game.tapReset();
        document.getElementById('tap-round-num').textContent = data.roundNumber;
        document.getElementById('tap-max-rounds').textContent = data.maxRounds;
        document.getElementById('tap-count').textContent = '0';
        document.getElementById('tap-timer').textContent = data.targetTime.toFixed(1);
        
        UI.renderPlayerStatusDots(
          document.getElementById('tap-players-status'),
          data.players,
          []
        );

        UI.showView('tap-game');

        // Start countdown after a small delay
        setTimeout(() => {
          Game.startTapGame(data.targetTime, 
            (remaining) => {
              document.getElementById('tap-timer').textContent = remaining.toFixed(1);
            },
            (finalTaps) => {
              UI.showToast('Time is up!', 'info');
              Socket.submitTaps(finalTaps);
            }
          );
        }, 1000);
      } else {
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
      }
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

      UI.renderResultsTable(document.getElementById('results-tbody'), data.results, data.mode);
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

    // ─── Whot Mode Socket Listeners ───
    setupWhotSocketListeners();

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
        document.getElementById('grid-counter-total').textContent = '4';
        document.getElementById('grid-counter-label').textContent = 'traps set';
        document.getElementById('btn-grid-confirm').style.display = 'inline-flex';
        document.getElementById('btn-grid-confirm').disabled = true;
        document.getElementById('btn-grid-confirm').innerHTML = '🪤 Confirm Traps';
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
        
        document.getElementById('grid-counter').style.display = 'block';
        document.getElementById('grid-selected-count').textContent = '0';
        document.getElementById('grid-counter-total').textContent = '4';
        document.getElementById('grid-counter-label').textContent = 'cells picked';
        
        document.getElementById('btn-grid-confirm').style.display = 'inline-flex';
        document.getElementById('btn-grid-confirm').disabled = true;
        document.getElementById('btn-grid-confirm').innerHTML = '🏃 Confirm Picks';

        document.getElementById('grid-role-desc').textContent = 'Pick 4 cells — avoid the traps!';
        document.getElementById('grid-hint').textContent = 'The trapper has placed 4 traps. Pick 4 safe cells!';
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

  // ─── Whot Socket Listeners ───
  function setupWhotSocketListeners() {
    Socket.on('whot-round-started', (data) => {
      try {
        currentGameMode = 'whot';
        Game.setRoundInfo(data.roundNumber, data.maxRounds);
        
        localWhotState = {
          turnIndex: data.turnIndex,
          playerIds: data.playerIds,
          topCard: data.discardPile[data.discardPile.length - 1],
          declaredShape: null,
          attackActive: false,
          attackCount: 0
        };

        document.getElementById('whot-round-num').textContent = data.roundNumber || 1;
        document.getElementById('whot-max-rounds').textContent = Game.maxRounds || 3;

        UI.renderWhotHand(document.getElementById('whot-hand'), data.hand, handleWhotCardClick);
        UI.renderWhotTopCard(document.getElementById('whot-discard'), localWhotState.topCard);
        
        const handsCounts = data.playerIds.map(id => ({ id, count: 4 }));
        UI.renderWhotOpponents(document.getElementById('whot-opponents'), handsCounts, data.turnIndex, data.playerIds, Game.getPlayers());
        
        updateWhotTurnIndicator();
        UI.showView('game-whot');
      } catch (err) {
        UI.showToast("Error starting Whot: " + err.message, "error");
        console.error("whot-round-started ERROR:", err);
      }
    });

    Socket.on('whot-card-played', (data) => {
      localWhotState.topCard = data.card;
      localWhotState.turnIndex = data.newState.turnIndex;
      localWhotState.declaredShape = data.newState.declaredShape;
      localWhotState.attackActive = data.newState.attackActive;
      localWhotState.attackCount = data.newState.attackCount;
      
      UI.renderWhotTopCard(document.getElementById('whot-discard'), localWhotState.topCard);
      UI.renderWhotOpponents(document.getElementById('whot-opponents'), data.newState.handsCounts, localWhotState.turnIndex, localWhotState.playerIds, Game.getPlayers());
      updateWhotTurnIndicator();
    });

    Socket.on('whot-player-drew', (data) => {
      localWhotState.turnIndex = data.newState.turnIndex;
      localWhotState.attackActive = data.newState.attackActive;
      localWhotState.attackCount = data.newState.attackCount;
      
      UI.renderWhotOpponents(document.getElementById('whot-opponents'), data.newState.handsCounts, localWhotState.turnIndex, localWhotState.playerIds, Game.getPlayers());
      updateWhotTurnIndicator();
    });

    Socket.on('whot-hand-updated', (data) => {
      UI.renderWhotHand(document.getElementById('whot-hand'), data.hand, handleWhotCardClick);
    });

    Socket.on('whot-round-over', (data) => {
      UI.showToast('Round over!', 'info');
      
      // Update results UI placeholders
      document.getElementById('results-round-num').textContent = Game.currentRound;
      document.getElementById('results-target').textContent = 'N/A';
      
      // Fake results data structure to re-use resultsTable
      const mappedResults = data.penalties.map(([id, pen]) => {
         const p = Game.getPlayers().find(pl => pl.id === id);
         return {
           playerName: p ? p.name : 'Unknown',
           diff: pen, // show penalty as diff
           score: pen === 0 ? "WIN" : -pen // show score change
         }
      });
      UI.renderResultsTable(document.getElementById('results-tbody'), mappedResults);
      UI.renderStandings(document.getElementById('standings-list'), data.players);
      
      const isLastRound = Game.currentRound >= Game.maxRounds;
      if (isLastRound) {
        showFinalResults(data.players);
      } else {
        showHostControls('results', Socket.getIsHost());
        UI.showView('results');
      }
    });

    Socket.on('whot-error', (data) => {
       UI.showToast(data.message, 'error');
    });
  }

  function handleWhotCardClick(card) {
    if (!localWhotState || localWhotState.turnIndex === -1) return;
    const myId = Socket.getMyId();
    if (localWhotState.playerIds[localWhotState.turnIndex] !== myId) {
      UI.showToast("It's not your turn!", "warning");
      return;
    }

    if (card.number === 20) {
      pendingWhotCard = card;
      document.getElementById('whot-shape-modal').style.display = 'flex';
    } else {
      Socket.whotPlayCard(card.id, null);
      // Remove locally instantly to avoid double clicks
      document.querySelector(`.whot-card[data-id="${card.id}"]`)?.remove();
    }
  }

  function updateWhotTurnIndicator() {
    if (!localWhotState) return;
    const myId = Socket.getMyId();
    const currentTurnId = localWhotState.playerIds[localWhotState.turnIndex];
    if (currentTurnId === myId) {
      document.getElementById('whot-turn-indicator').textContent = "Your Turn!";
    } else {
      const p = Game.getPlayers().find(pl => pl.id === currentTurnId);
      document.getElementById('whot-turn-indicator').textContent = `${p ? p.name : 'Someone'}'s Turn`;
    }
    
    // Update Alerts
    if (localWhotState.attackActive) {
      document.getElementById('whot-attack-banner').style.display = 'block';
      let pickStr = localWhotState.attackCount > 0 ? "2 / 5" : "";
      if (localWhotState.attackCount % 3 === 0 && localWhotState.attackCount > 0 && localWhotState.attackCount % 2 !== 0) pickStr = "5";
      if (localWhotState.attackCount % 2 === 0 && localWhotState.attackCount > 0) pickStr = "2";
      document.getElementById('whot-attack-type').textContent = pickStr;
      document.getElementById('whot-attack-stack').textContent = localWhotState.attackCount;
    } else {
      document.getElementById('whot-attack-banner').style.display = 'none';
    }

    if (localWhotState.declaredShape) {
      document.getElementById('whot-shape-indicator').style.display = 'block';
      document.getElementById('whot-active-shape').textContent = localWhotState.declaredShape.toUpperCase();
    } else {
      document.getElementById('whot-shape-indicator').style.display = 'none';
    }
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
    } else if (mode === 'tap') {
      modeEl.textContent = '👆 Tap';
      gridInfo.style.display = 'none';
    } else if (mode === 'whot') {
      modeEl.textContent = '🃏 Whot';
      gridInfo.style.display = 'none';
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

  // ─── Tap Area Click Handler ───
  function handleTapAreaClick(e) {
    if (!Game.isTapActive()) return;

    const count = Game.handleTap();
    document.getElementById('tap-count').textContent = count;

    // Create ripple effect
    createTapRipple(e);
  }

  function createTapRipple(e) {
    const btn = document.getElementById('btn-tap-area');
    const container = btn.querySelector('.tap-ripple-container');
    const ripple = document.createElement('div');
    ripple.className = 'tap-ripple';
    
    // Get position relative to button
    const rect = btn.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    
    ripple.style.left = x + 'px';
    ripple.style.top = y + 'px';
    
    container.appendChild(ripple);
    
    // Remove after animation
    setTimeout(() => ripple.remove(), 600);
  }

  // ─── Start ───
  document.addEventListener('DOMContentLoaded', init);
})();
