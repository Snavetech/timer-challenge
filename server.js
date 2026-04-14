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

function createRoom(hostId, hostName, rounds) {
  const code = generateRoomCode();
  const room = {
    code,
    hostId,
    hostName,
    maxRounds: Math.min(Math.max(parseInt(rounds) || 3, 1), 5),
    currentRound: 0,
    state: 'lobby', // lobby | playing | results | finished
    players: new Map(),
    rounds: [],
    targetTime: null,
    roundTimeout: null,
    createdAt: Date.now()
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(roomCode, playerId, playerName) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };
  if (room.players.size >= 15) return { error: 'Room is full (max 15 players)' };
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
  // Random target between 1 and 90 seconds (to 1 decimal)
  room.targetTime = Math.round((Math.random() * 89 + 1) * 10) / 10;

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

  socket.on('create-room', ({ username, rounds }) => {
    if (!username || username.trim().length === 0) {
      socket.emit('error-msg', { message: 'Username is required' });
      return;
    }
    if (username.trim().length > 20) {
      socket.emit('error-msg', { message: 'Username must be 20 characters or less' });
      return;
    }

    const room = createRoom(socket.id, username.trim(), rounds);
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
    if (room.players.size < 1) {
      socket.emit('error-msg', { message: 'Need at least 1 player to start' });
      return;
    }

    const roundData = startRound(room);

    io.to(roomCode).emit('round-started', {
      roundNumber: roundData.roundNumber,
      targetTime: roundData.targetTime,
      maxRounds: room.maxRounds,
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

    const roundData = startRound(room);
    io.to(roomCode).emit('round-started', {
      roundNumber: roundData.roundNumber,
      targetTime: roundData.targetTime,
      maxRounds: room.maxRounds,
      players: getPlayerList(room)
    });
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
