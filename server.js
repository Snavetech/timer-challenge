const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// Serve static files
app.use(express.static(path.join(__dirname, 'public')));

// ─── Room Manager ────────────────────────────────────────────────

const rooms = new Map();

function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) {
    code += chars[Math.floor(Math.random() * chars.length)];
  }
  // Ensure uniqueness
  if (rooms.has(code)) return generateRoomCode();
  return code;
}

function createRoom(hostId, hostName, rounds, mode) {
  const code = generateRoomCode();
  const validMode = ['speed', 'grid'].includes(mode) ? mode : 'classic';
  const room = {
    code,
    hostId,
    hostName,
    maxRounds: Math.min(Math.max(parseInt(rounds) || 3, 1), 5),
    mode: validMode,
    currentRound: 0,
    state: 'lobby', // lobby | playing | results | finished
    players: new Map(),
    rounds: [],
    targetTime: null,
    roundTimeout: null,
    createdAt: Date.now(),
    // Grid mode state
    gridState: validMode === 'grid' ? {
      trapperIndex: -1,     // index in player order for rotation
      trapperCells: [],     // 4 cells selected by trapper
      runnerSelections: new Map(), // playerId -> cell index
      phase: 'idle'         // idle | trapper-picking | runners-picking | reveal
    } : null
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(roomCode, playerId, playerName) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };
  const maxPlayers = room.mode === 'grid' ? 5 : 15;
  if (room.players.size >= maxPlayers) return { error: `Room is full (max ${maxPlayers} players)` };
  if (room.state !== 'lobby') return { error: 'Game already in progress' };

  // Check for duplicate names
  for (const [, p] of room.players) {
    if (p.name.toLowerCase() === playerName.toLowerCase()) {
      return { error: 'Username already taken in this room' };
    }
  }

  room.players.set(playerId, {
    id: playerId,
    name: playerName,
    totalScore: 0,
    connected: true,
    color: generatePlayerColor(room.players.size)
  });

  return { room };
}

function generatePlayerColor(index) {
  const hues = [0, 30, 60, 120, 180, 210, 240, 270, 300, 330, 15, 45, 150, 195, 285];
  return `hsl(${hues[index % hues.length]}, 80%, 65%)`;
}

function getPlayerList(room) {
  return Array.from(room.players.values()).map(p => ({
    id: p.id,
    name: p.name,
    totalScore: p.totalScore,
    connected: p.connected,
    color: p.color
  }));
}

function startRound(room) {
  room.currentRound++;
  room.state = 'playing';

  if (room.mode === 'speed') {
    // Speed mode: target between 1 and 120 seconds (to 1 decimal)
    room.targetTime = Math.round((Math.random() * 119 + 1) * 10) / 10;
  } else {
    // Classic mode: target between 1 and 90 seconds (to 1 decimal)
    room.targetTime = Math.round((Math.random() * 89 + 1) * 10) / 10;
  }

  const roundData = {
    roundNumber: room.currentRound,
    targetTime: room.targetTime,
    submissions: new Map(),
    startedAt: Date.now()
  };
  room.rounds.push(roundData);

  // Auto-end round after target + 30s buffer (in case someone doesn't stop)
  if (room.roundTimeout) clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    autoEndRound(room);
  }, (room.targetTime + 30) * 1000);

  return roundData;
}

// Position-based scoring table
const POSITION_POINTS = [10, 7, 5, 3, 2];

function getPositionScore(position) {
  // position is 0-indexed
  return POSITION_POINTS[position] !== undefined ? POSITION_POINTS[position] : 1;
}

function submitTime(room, playerId, elapsed) {
  const currentRound = room.rounds[room.rounds.length - 1];
  if (!currentRound) return null;
  if (currentRound.submissions.has(playerId)) return null;

  const diff = Math.abs(elapsed - room.targetTime);

  currentRound.submissions.set(playerId, {
    playerId,
    playerName: room.players.get(playerId)?.name || 'Unknown',
    elapsed: Math.round(elapsed * 100) / 100,
    diff: Math.round(diff * 100) / 100,
    score: 0 // Will be assigned in endRound based on position
  });

  // Check if all connected players have submitted
  const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected);
  if (currentRound.submissions.size >= connectedPlayers.length) {
    return endRound(room);
  }

  return { submitted: true, waiting: connectedPlayers.length - currentRound.submissions.size };
}

function endRound(room) {
  if (room.roundTimeout) {
    clearTimeout(room.roundTimeout);
    room.roundTimeout = null;
  }

  const currentRound = room.rounds[room.rounds.length - 1];

  // Add "did not stop" entries for players who didn't submit
  for (const [playerId, player] of room.players) {
    if (player.connected && !currentRound.submissions.has(playerId)) {
      currentRound.submissions.set(playerId, {
        playerId,
        playerName: player.name,
        elapsed: null,
        diff: null,
        score: 0
      });
    }
  }

  // Sort by closest to target (smallest diff first), DNFs go last
  const results = Array.from(currentRound.submissions.values())
    .sort((a, b) => {
      if (a.diff === null && b.diff === null) return 0;
      if (a.diff === null) return 1;
      if (b.diff === null) return -1;
      return a.diff - b.diff;
    });

  // Assign position-based scores
  results.forEach((r, index) => {
    if (r.diff === null) {
      r.score = 0; // DNF gets 0
    } else {
      r.score = getPositionScore(index);
    }
    // Update player's total score
    const player = room.players.get(r.playerId);
    if (player) player.totalScore += r.score;
  });

  const standings = Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, totalScore: p.totalScore, color: p.color }))
    .sort((a, b) => b.totalScore - a.totalScore);

  const isLastRound = room.currentRound >= room.maxRounds;
  room.state = isLastRound ? 'finished' : 'results';

  return {
    roundNumber: room.currentRound,
    targetTime: room.targetTime,
    results,
    standings,
    isLastRound
  };
}

function autoEndRound(room) {
  if (room.state !== 'playing') return;
  const roundResults = endRound(room);
  io.to(room.code).emit('round-results', roundResults);
}

// ─── Grid Mode Functions ─────────────────────────────────────────

function getPlayerOrder(room) {
  return Array.from(room.players.entries())
    .filter(([, p]) => p.connected)
    .map(([id]) => id);
}

function startGridRound(room) {
  room.currentRound++;
  room.state = 'playing';

  const playerOrder = getPlayerOrder(room);
  if (playerOrder.length < 2) return null;

  // Rotate trapper
  room.gridState.trapperIndex = (room.gridState.trapperIndex + 1) % playerOrder.length;
  room.gridState.trapperCells = [];
  room.gridState.runnerSelections = new Map();
  room.gridState.phase = 'trapper-picking';

  const trapperId = playerOrder[room.gridState.trapperIndex];
  const trapperName = room.players.get(trapperId)?.name || 'Unknown';

  const roundData = {
    roundNumber: room.currentRound,
    trapperId,
    trapperName,
    startedAt: Date.now()
  };
  room.rounds.push(roundData);

  // Auto-timeout: give trapper 45s to pick
  if (room.roundTimeout) clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    autoSetTraps(room);
  }, 45 * 1000);

  return roundData;
}

function autoSetTraps(room) {
  if (!room.gridState || room.gridState.phase !== 'trapper-picking') return;
  // Auto-select random 4 cells
  const available = [0,1,2,3,4,5,6,7,8];
  const traps = [];
  for (let i = 0; i < 4; i++) {
    const idx = Math.floor(Math.random() * available.length);
    traps.push(available.splice(idx, 1)[0]);
  }
  room.gridState.trapperCells = traps;
  room.gridState.phase = 'runners-picking';

  io.to(room.code).emit('grid-traps-locked', {
    message: 'Trapper has set traps (auto)! Runners, pick your cell!'
  });

  // Auto-timeout: give runners 30s to pick
  if (room.roundTimeout) clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    autoEndGridRound(room);
  }, 30 * 1000);
}

function submitGridTraps(room, playerId, cells) {
  const playerOrder = getPlayerOrder(room);
  const trapperId = playerOrder[room.gridState.trapperIndex];
  if (playerId !== trapperId) return { error: 'You are not the trapper' };
  if (room.gridState.phase !== 'trapper-picking') return { error: 'Not in trapper phase' };

  // Validate: exactly 4 unique cells in range 0-8
  if (!Array.isArray(cells) || cells.length !== 4) return { error: 'Must select exactly 4 cells' };
  const uniqueCells = [...new Set(cells)];
  if (uniqueCells.length !== 4) return { error: 'Cells must be unique' };
  if (uniqueCells.some(c => c < 0 || c > 8 || !Number.isInteger(c))) return { error: 'Invalid cell index' };

  room.gridState.trapperCells = uniqueCells;
  room.gridState.phase = 'runners-picking';

  // Reset timeout for runner phase
  if (room.roundTimeout) clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    autoEndGridRound(room);
  }, 30 * 1000);

  return { success: true };
}

function submitGridRunnerChoice(room, playerId, cell) {
  if (room.gridState.phase !== 'runners-picking') return null;

  const playerOrder = getPlayerOrder(room);
  const trapperId = playerOrder[room.gridState.trapperIndex];
  if (playerId === trapperId) return { error: 'Trapper cannot pick a cell' };

  if (room.gridState.runnerSelections.has(playerId)) return { error: 'Already submitted' };
  if (cell < 0 || cell > 8 || !Number.isInteger(cell)) return { error: 'Invalid cell' };

  room.gridState.runnerSelections.set(playerId, cell);

  // Check if all runners have submitted
  const runners = playerOrder.filter(id => id !== trapperId);
  const connectedRunners = runners.filter(id => room.players.get(id)?.connected);
  if (room.gridState.runnerSelections.size >= connectedRunners.length) {
    return endGridRound(room);
  }

  return { submitted: true, waiting: connectedRunners.length - room.gridState.runnerSelections.size };
}

// Grid scoring constants
const GRID_SCORE_SURVIVE = 3;
const GRID_SCORE_CATCH = 2;
const GRID_SCORE_ALL_SURVIVE_BONUS = 1;
const GRID_SCORE_ALL_CAUGHT_BONUS = 3;

function endGridRound(room) {
  if (room.roundTimeout) {
    clearTimeout(room.roundTimeout);
    room.roundTimeout = null;
  }

  const playerOrder = getPlayerOrder(room);
  const trapperId = playerOrder[room.gridState.trapperIndex];
  const trapperPlayer = room.players.get(trapperId);
  const trapCells = room.gridState.trapperCells;

  // Build runner results
  const runnerResults = [];
  let caughtCount = 0;
  let survivedCount = 0;

  for (const [runnerId, cell] of room.gridState.runnerSelections) {
    const player = room.players.get(runnerId);
    const isCaught = trapCells.includes(cell);
    if (isCaught) caughtCount++;
    else survivedCount++;

    runnerResults.push({
      playerId: runnerId,
      playerName: player?.name || 'Unknown',
      cell,
      caught: isCaught,
      score: isCaught ? 0 : GRID_SCORE_SURVIVE
    });
  }

  // Add DNF entries for runners who didn't submit
  const runners = playerOrder.filter(id => id !== trapperId);
  for (const runnerId of runners) {
    const player = room.players.get(runnerId);
    if (!room.gridState.runnerSelections.has(runnerId) && player?.connected) {
      const randomCell = trapCells[0]; // DNF lands on trap
      runnerResults.push({
        playerId: runnerId,
        playerName: player?.name || 'Unknown',
        cell: randomCell,
        caught: true,
        score: 0,
        dnf: true
      });
      caughtCount++;
    }
  }

  // Trapper score: 2 points per catch
  let trapperScore = caughtCount * GRID_SCORE_CATCH;

  // Bonus: all caught
  const totalRunners = runnerResults.length;
  if (totalRunners > 0 && caughtCount === totalRunners) {
    trapperScore += GRID_SCORE_ALL_CAUGHT_BONUS;
  }

  // Bonus: all survived
  if (totalRunners > 0 && survivedCount === totalRunners) {
    runnerResults.forEach(r => { r.score += GRID_SCORE_ALL_SURVIVE_BONUS; });
  }

  // Apply scores
  if (trapperPlayer) trapperPlayer.totalScore += trapperScore;
  runnerResults.forEach(r => {
    const player = room.players.get(r.playerId);
    if (player) player.totalScore += r.score;
  });

  // Build standings
  const standings = Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, totalScore: p.totalScore, color: p.color }))
    .sort((a, b) => b.totalScore - a.totalScore);

  const isLastRound = room.currentRound >= room.maxRounds;
  room.state = isLastRound ? 'finished' : 'results';
  room.gridState.phase = 'reveal';

  return {
    roundNumber: room.currentRound,
    trapperName: trapperPlayer?.name || 'Unknown',
    trapperId,
    trapperScore,
    trapCells,
    runnerResults,
    standings,
    isLastRound,
    caughtCount,
    survivedCount
  };
}

function autoEndGridRound(room) {
  if (room.state !== 'playing' || !room.gridState) return;
  if (room.gridState.phase !== 'runners-picking') return;
  const result = endGridRound(room);
  io.to(room.code).emit('grid-round-results', result);
}

// ─── Room Cleanup ────────────────────────────────────────────────

setInterval(() => {
  const now = Date.now();
  for (const [code, room] of rooms) {
    // Remove rooms older than 2 hours or empty rooms older than 30 min
    const age = now - room.createdAt;
    if (age > 2 * 60 * 60 * 1000) {
      rooms.delete(code);
    } else if (room.players.size === 0 && age > 30 * 60 * 1000) {
      rooms.delete(code);
    }
  }
}, 60 * 1000);

// ─── Socket.IO Events ───────────────────────────────────────────

io.on('connection', (socket) => {
  let currentRoom = null;

  socket.on('create-room', ({ username, rounds, mode }) => {
    if (!username || username.trim().length === 0) {
      socket.emit('error-msg', { message: 'Username is required' });
      return;
    }
    if (username.trim().length > 20) {
      socket.emit('error-msg', { message: 'Username must be 20 characters or less' });
      return;
    }

    const room = createRoom(socket.id, username.trim(), rounds, mode);
    const result = addPlayer(room.code, socket.id, username.trim());

    if (result.error) {
      rooms.delete(room.code);
      socket.emit('error-msg', { message: result.error });
      return;
    }

    currentRoom = room.code;
    socket.join(room.code);
    socket.emit('room-created', {
      roomCode: room.code,
      maxRounds: room.maxRounds,
      mode: room.mode,
      players: getPlayerList(room),
      isHost: true
    });
  });

  socket.on('join-room', ({ roomCode, username }) => {
    if (!username || username.trim().length === 0) {
      socket.emit('error-msg', { message: 'Username is required' });
      return;
    }
    if (username.trim().length > 20) {
      socket.emit('error-msg', { message: 'Username must be 20 characters or less' });
      return;
    }

    const code = roomCode?.toUpperCase().trim();
    if (!code) {
      socket.emit('error-msg', { message: 'Room code is required' });
      return;
    }

    const result = addPlayer(code, socket.id, username.trim());
    if (result.error) {
      socket.emit('error-msg', { message: result.error });
      return;
    }

    currentRoom = code;
    socket.join(code);

    const room = result.room;
    socket.emit('room-joined', {
      roomCode: code,
      maxRounds: room.maxRounds,
      mode: room.mode,
      hostName: room.hostName,
      players: getPlayerList(room),
      isHost: false
    });

    // Notify others
    socket.to(code).emit('player-joined', {
      players: getPlayerList(room),
      newPlayer: username.trim()
    });
  });

  socket.on('start-round', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.hostId) {
      socket.emit('error-msg', { message: 'Only the host can start rounds' });
      return;
    }
    if (room.state !== 'lobby' && room.state !== 'results') return;

    if (room.mode === 'grid') {
      if (room.players.size < 2) {
        socket.emit('error-msg', { message: 'Need at least 2 players for Grid mode' });
        return;
      }
      const roundData = startGridRound(room);
      if (!roundData) {
        socket.emit('error-msg', { message: 'Cannot start grid round' });
        return;
      }
      io.to(roomCode).emit('grid-round-started', {
        roundNumber: roundData.roundNumber,
        trapperId: roundData.trapperId,
        trapperName: roundData.trapperName,
        maxRounds: room.maxRounds,
        players: getPlayerList(room)
      });
      return;
    }

    if (room.players.size < 1) {
      socket.emit('error-msg', { message: 'Need at least 1 player to start' });
      return;
    }

    const roundData = startRound(room);

    io.to(roomCode).emit('round-started', {
      roundNumber: roundData.roundNumber,
      targetTime: roundData.targetTime,
      maxRounds: room.maxRounds,
      mode: room.mode,
      players: getPlayerList(room)
    });
  });

  socket.on('player-stop', ({ roomCode, elapsed }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== 'playing') return;

    const result = submitTime(room, socket.id, elapsed);
    if (!result) return;

    if (result.submitted) {
      // Notify all players someone has submitted
      io.to(roomCode).emit('player-submitted', {
        playerId: socket.id,
        playerName: room.players.get(socket.id)?.name,
        waiting: result.waiting
      });
    } else {
      // All players submitted — send results
      io.to(roomCode).emit('round-results', result);
    }
  });

  socket.on('next-round', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.hostId) return;
    if (room.state !== 'results') return;

    if (room.mode === 'grid') {
      const roundData = startGridRound(room);
      if (!roundData) return;
      io.to(roomCode).emit('grid-round-started', {
        roundNumber: roundData.roundNumber,
        trapperId: roundData.trapperId,
        trapperName: roundData.trapperName,
        maxRounds: room.maxRounds,
        players: getPlayerList(room)
      });
      return;
    }

    const roundData = startRound(room);
    io.to(roomCode).emit('round-started', {
      roundNumber: roundData.roundNumber,
      targetTime: roundData.targetTime,
      maxRounds: room.maxRounds,
      mode: room.mode,
      players: getPlayerList(room)
    });
  });

  // ─── Grid Mode Events ───────────────────────────────────────

  socket.on('grid-set-traps', ({ roomCode, cells }) => {
    const room = rooms.get(roomCode);
    if (!room || room.mode !== 'grid' || room.state !== 'playing') return;

    const result = submitGridTraps(room, socket.id, cells);
    if (result.error) {
      socket.emit('error-msg', { message: result.error });
      return;
    }

    io.to(roomCode).emit('grid-traps-locked', {
      message: 'Trapper has set the traps! Runners, pick your cell!'
    });
  });

  socket.on('grid-pick-cell', ({ roomCode, cell }) => {
    const room = rooms.get(roomCode);
    if (!room || room.mode !== 'grid' || room.state !== 'playing') return;

    const result = submitGridRunnerChoice(room, socket.id, cell);
    if (!result) return;

    if (result.error) {
      socket.emit('error-msg', { message: result.error });
      return;
    }

    if (result.submitted) {
      io.to(roomCode).emit('grid-runner-submitted', {
        playerId: socket.id,
        playerName: room.players.get(socket.id)?.name,
        waiting: result.waiting
      });
    } else {
      // All runners submitted — send grid results
      io.to(roomCode).emit('grid-round-results', result);
    }
  });

  socket.on('play-again', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.hostId) return;

    // Reset room
    room.currentRound = 0;
    room.state = 'lobby';
    room.rounds = [];
    room.targetTime = null;
    for (const [, player] of room.players) {
      player.totalScore = 0;
    }

    io.to(roomCode).emit('game-reset', {
      roomCode: room.code,
      maxRounds: room.maxRounds,
      mode: room.mode,
      players: getPlayerList(room)
    });
  });

  socket.on('disconnect', () => {
    if (!currentRoom) return;
    const room = rooms.get(currentRoom);
    if (!room) return;

    const player = room.players.get(socket.id);
    if (player) {
      player.connected = false;

      // Notify others
      socket.to(currentRoom).emit('player-left', {
        players: getPlayerList(room),
        leftPlayer: player.name
      });

      // If host left, assign new host
      if (socket.id === room.hostId) {
        const connected = Array.from(room.players.entries())
          .find(([, p]) => p.connected);
        if (connected) {
          room.hostId = connected[0];
          room.hostName = connected[1].name;
          io.to(currentRoom).emit('new-host', {
            hostId: connected[0],
            hostName: connected[1].name
          });
        }
      }

      // Check if round should end (all connected players submitted)
      if (room.state === 'playing') {
        const currentRoundData = room.rounds[room.rounds.length - 1];
        const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected);
        if (connectedPlayers.length === 0) {
          rooms.delete(currentRoom);
        } else if (currentRoundData && currentRoundData.submissions.size >= connectedPlayers.length) {
          const result = endRound(room);
          io.to(currentRoom).emit('round-results', result);
        }
      }

      // Clean up disconnected players after a delay
      setTimeout(() => {
        const r = rooms.get(currentRoom);
        if (r) {
          const p = r.players.get(socket.id);
          if (p && !p.connected) {
            r.players.delete(socket.id);
            if (r.players.size === 0 && r.state !== 'lobby') {
              rooms.delete(currentRoom);
            }
          }
        }
      }, 60000);
    }
  });
});

// ─── Start Server ────────────────────────────────────────────────

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`\n⏱️  Timer Challenge server running at http://localhost:${PORT}\n`);
});
