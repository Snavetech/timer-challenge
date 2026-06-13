const express = require('express');
const http = require('http');
const path = require('path');
const { Server } = require('socket.io');
const fs = require('fs');
const https = require('https');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

// ─── Word Duel Wordlist Loader ──────────────────────────────────
const WORDLIST_PATH = path.join(__dirname, 'wordlist.json');
let wordlist = null;

function loadWordlist() {
  const fallback = {
    3: ["cat", "dog", "sun", "run", "map", "pen", "cup", "car", "key", "box", "hat", "boy", "toy", "fly", "sky", "sea", "air", "ice", "bed", "day", "hot", "big", "red", "fun", "art", "job", "win", "try", "act", "dry", "wet", "fit", "sit", "out", "new", "old"],
    4: ["chat", "cast", "word", "game", "time", "play", "team", "gold", "blue", "pink", "star", "fire", "wind", "sand", "lake", "rock", "tree", "leaf", "bird", "fish", "frog", "lion", "bear", "deer", "duck", "ship", "boat", "road", "path", "door", "bell", "ring", "song", "book"],
    5: ["apple", "grape", "peach", "melon", "lemon", "berry", "onion", "bread", "water", "juice", "house", "table", "chair", "clock", "light", "paper", "glass", "plate", "knife", "spoon", "shirt", "pants", "shoes", "socks", "glove", "train", "plane", "truck", "wheel", "music"],
    6: ["banana", "cherry", "orange", "potato", "tomato", "carrot", "garlic", "cheese", "butter", "cookie", "pencil", "eraser", "marker", "wallet", "pocket", "jacket", "button", "zipper", "window", "mirror", "candle", "camera", "guitar", "violin", "flute", "castle", "bridge", "street"]
  };

  if (fs.existsSync(WORDLIST_PATH)) {
    try {
      wordlist = JSON.parse(fs.readFileSync(WORDLIST_PATH, 'utf8'));
      console.log('Loaded wordlist.json successfully');
      return;
    } catch (e) {
      console.error('Failed to parse wordlist.json, generating again...', e);
    }
  }

  // Set fallback first
  wordlist = fallback;
  try {
    fs.writeFileSync(WORDLIST_PATH, JSON.stringify(fallback, null, 2));
    console.log('Saved fallback wordlist.json');
  } catch (err) {
    console.error('Failed to write fallback wordlist.json:', err);
  }

  // Fetch from online source
  const url = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';
  https.get(url, (res) => {
    if (res.statusCode !== 200) return;
    let data = '';
    res.on('data', chunk => { data += chunk; });
    res.on('end', () => {
      try {
        const words = data.split('\n').map(w => w.trim().toLowerCase()).filter(w => /^[a-z]+$/.test(w));
        const wordMap = { 3: [], 4: [], 5: [], 6: [] };
        words.forEach(word => {
          const len = word.length;
          if (len >= 3 && len <= 6) {
            wordMap[len].push(word);
          }
        });
        for (let l = 3; l <= 6; l++) {
          const uniqueWords = new Set([...wordMap[l], ...fallback[l]]);
          wordMap[l] = Array.from(uniqueWords).sort();
        }
        wordlist = wordMap;
        fs.writeFileSync(WORDLIST_PATH, JSON.stringify(wordMap, null, 2));
        console.log('Asynchronously updated wordlist.json with online source');
      } catch (err) {
        console.error('Failed to update wordlist with online source:', err);
      }
    });
  }).on('error', (err) => {
    console.log('Offline/Network error: using fallback wordlist');
  });
}

// Load it
loadWordlist();

function isValidWord(word, length) {
  if (!wordlist) return true; // fallback if error loading
  const len = parseInt(length);
  const wordsForLength = wordlist[len];
  if (!wordsForLength) return false;
  return wordsForLength.includes(word.toLowerCase());
}

function getRandomWord(length) {
  if (!wordlist) return "game";
  const len = parseInt(length);
  const words = wordlist[len] || ["game"];
  return words[Math.floor(Math.random() * words.length)];
}

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

function createRoom(hostId, hostName, rounds, mode, wordLength) {
  const code = generateRoomCode();
  const validMode = ['speed', 'grid', 'tap', 'word'].includes(mode) ? mode : 'classic';
  const room = {
    code,
    hostId,
    hostName,
    maxRounds: Math.min(Math.max(parseInt(rounds) || 3, 1), 5),
    mode: validMode,
    wordLength: validMode === 'word' ? Math.min(Math.max(parseInt(wordLength) || 4, 3), 6) : null,
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
      currentTrapperId: null, // tracked safely
      trapperCells: [],     // 4 cells selected by trapper
      runnerSelections: new Map(), // playerId -> cell index
      phase: 'idle'         // idle | trapper-picking | runners-picking | reveal
    } : null,
    // Word Duel state
    wordState: null
  };
  rooms.set(code, room);
  return room;
}

function addPlayer(roomCode, playerId, playerName) {
  const room = rooms.get(roomCode);
  if (!room) return { error: 'Room not found' };
  const maxPlayers = room.mode === 'word' ? 2 : (room.mode === 'grid' ? 5 : 15);
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
    // Speed mode: target between 0.2 and 30 seconds (to 1 decimal)
    room.targetTime = Math.round((Math.random() * 29.8 + 0.2) * 10) / 10;
  } else if (room.mode === 'tap') {
    // Tap mode: target time between 3 and 60 seconds (to 1 decimal)
    room.targetTime = Math.round((Math.random() * 57 + 3) * 10) / 10;
  } else {
    // Classic mode: target between 0.2 and 30 seconds (to 1 decimal)
    room.targetTime = Math.round((Math.random() * 29.8 + 0.2) * 10) / 10;
  }

  const roundData = {
    roundNumber: room.currentRound,
    targetTime: room.targetTime,
    submissions: new Map(),
    startedAt: Date.now(),
    mode: room.mode
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
  let submittedConnected = 0;
  for (const p of connectedPlayers) {
    if (currentRound.submissions.has(p.id)) submittedConnected++;
  }

  if (submittedConnected >= connectedPlayers.length) {
    return endRound(room);
  }

  return { submitted: true, waiting: connectedPlayers.length - submittedConnected };
}

function submitTaps(room, playerId, taps) {
  const currentRound = room.rounds[room.rounds.length - 1];
  if (!currentRound) return null;
  if (currentRound.submissions.has(playerId)) return null;

  currentRound.submissions.set(playerId, {
    playerId,
    playerName: room.players.get(playerId)?.name || 'Unknown',
    taps: parseInt(taps) || 0,
    score: 0 // Will be assigned in endRound
  });

  // Check if all connected players have submitted
  const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected);
  let submittedConnected = 0;
  for (const p of connectedPlayers) {
    if (currentRound.submissions.has(p.id)) submittedConnected++;
  }

  if (submittedConnected >= connectedPlayers.length) {
    return endRound(room);
  }

  return { submitted: true, waiting: connectedPlayers.length - submittedConnected };
}

function endRound(room) {
  if (room.roundTimeout) {
    clearTimeout(room.roundTimeout);
    room.roundTimeout = null;
  }

  const currentRound = room.rounds[room.rounds.length - 1];

  // Add "did not submit" entries for players who didn't submit
  for (const [playerId, player] of room.players) {
    if (player.connected && !currentRound.submissions.has(playerId)) {
      if (room.mode === 'tap') {
        currentRound.submissions.set(playerId, {
          playerId,
          playerName: player.name,
          taps: 0,
          score: 0
        });
      } else {
        currentRound.submissions.set(playerId, {
          playerId,
          playerName: player.name,
          elapsed: null,
          diff: null,
          score: 0
        });
      }
    }
  }

  // Sort: 
  // Tap mode: Highest taps first
  // Classic/Speed: closest to target (smallest diff first), DNFs go last
  const results = Array.from(currentRound.submissions.values())
    .sort((a, b) => {
      if (room.mode === 'tap') {
        return b.taps - a.taps;
      } else {
        if (a.diff === null && b.diff === null) return 0;
        if (a.diff === null) return 1;
        if (b.diff === null) return -1;
        return a.diff - b.diff;
      }
    });

  // Assign position-based scores
  results.forEach((r, index) => {
    if (room.mode !== 'tap' && r.diff === null) {
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
    mode: room.mode,
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
  const trapperId = playerOrder[room.gridState.trapperIndex];
  room.gridState.currentTrapperId = trapperId;
  room.gridState.trapperCells = [];
  room.gridState.runnerSelections = new Map();
  room.gridState.phase = 'trapper-picking';
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
  const trapperId = room.gridState.currentTrapperId;
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

function submitGridRunnerChoice(room, playerId, cells) {
  if (room.gridState.phase !== 'runners-picking') return null;

  const trapperId = room.gridState.currentTrapperId;
  if (playerId === trapperId) return { error: 'Trapper cannot pick cells' };

  if (room.gridState.runnerSelections.has(playerId)) return { error: 'Already submitted' };
  
  if (!Array.isArray(cells) || cells.length !== 4) return { error: 'Must select exactly 4 cells' };
  const uniqueCells = [...new Set(cells)];
  if (uniqueCells.length !== 4) return { error: 'Cells must be unique' };
  if (uniqueCells.some(c => c < 0 || c > 8 || !Number.isInteger(c))) return { error: 'Invalid cell index' };

  room.gridState.runnerSelections.set(playerId, uniqueCells);

  // Check if all runners have submitted
  const playerOrder = getPlayerOrder(room);
  const connectedRunners = playerOrder.filter(id => id !== trapperId);
  
  let submittedConnected = 0;
  for (const rId of connectedRunners) {
    if (room.gridState.runnerSelections.has(rId)) submittedConnected++;
  }

  if (submittedConnected >= connectedRunners.length) {
    return endGridRound(room);
  }

  return { submitted: true, waiting: connectedRunners.length - submittedConnected };
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

  const trapperId = room.gridState.currentTrapperId;
  const trapperPlayer = room.players.get(trapperId);
  const trapCells = room.gridState.trapperCells;
  const playerOrder = getPlayerOrder(room);

  const runnerResults = [];
  let trapperScore = 0;
  let allRunnersHit = true;
  let someoneHit = false;
  let caughtCount = 0;

  const runners = playerOrder.filter(id => id !== trapperId);
  const dnfs = new Set();
  
  // Add DNF entries for runners who didn't submit
  for (const runnerId of runners) {
    const player = room.players.get(runnerId);
    if (!room.gridState.runnerSelections.has(runnerId) && player?.connected) {
      // DNF penalty: forced to pick 4 unique traps
      const dnfCells = trapCells.slice(0, 4);
      room.gridState.runnerSelections.set(runnerId, dnfCells);
      dnfs.add(runnerId);
    }
  }

  const runnersWhoSubmitted = Array.from(room.gridState.runnerSelections.keys());

  for (const runnerId of runnersWhoSubmitted) {
    const cells = room.gridState.runnerSelections.get(runnerId);
    const player = room.players.get(runnerId);
    
    let safe = 0;
    let hits = 0;

    for (const tile of cells) {
      if (trapCells.includes(tile)) {
        hits++;
      } else {
        safe++;
      }
    }

    let runnerScore = (safe * 10) - (hits * 12);
    if (safe === 4) runnerScore += 10;
    if (hits === 4) runnerScore -= 5;
    
    if (hits === 0) allRunnersHit = false;
    if (hits > 0) {
      someoneHit = true;
      caughtCount++;
    }

    // trapper gains
    if (hits > 0) trapperScore += 8;
    trapperScore += hits * 3;

    runnerResults.push({
      playerId: runnerId,
      playerName: player?.name || 'Unknown',
      cells,
      hits,
      safe,
      score: runnerScore,
      dnf: dnfs.has(runnerId)
    });
  }

  // Trapper bonuses
  if (runnersWhoSubmitted.length > 0) {
    if (allRunnersHit) trapperScore += 15;
    if (!someoneHit) trapperScore -= 10;
  }

  // Apply scores
  if (trapperPlayer) trapperPlayer.totalScore += trapperScore;
  runnerResults.forEach(r => {
    const player = room.players.get(r.playerId);
    if (player) player.totalScore += r.score;
  });

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
    caughtCount,
    trapCells,
    runnerResults,
    standings,
    isLastRound
  };
}

function autoEndGridRound(room) {
  if (room.state !== 'playing' || !room.gridState) return;
  if (room.gridState.phase !== 'runners-picking') return;
  const result = endGridRound(room);
  io.to(room.code).emit('grid-round-results', result);
}

// ─── Word Duel Functions ─────────────────────────────────────────

function startWordSetup(room) {
  room.currentRound++;
  room.state = 'playing';
  
  room.wordState = {
    wordLength: room.wordLength || 4,
    secretWords: new Map(),       // playerId -> secretWord
    revealedPatterns: new Map(),  // playerId -> string (revealed of opponent's word)
    history: new Map(),           // playerId -> array of guess objects
    playerOrder: Array.from(room.players.keys()),
    turnIndex: 0,
    phase: 'setup',               // setup | playing | finished
    winnerId: null
  };

  console.log('[Word] startWordSetup for room', room.code, 'playerOrder:', room.wordState.playerOrder);

  // Give players 60 seconds to lock their word
  if (room.roundTimeout) clearTimeout(room.roundTimeout);
  room.roundTimeout = setTimeout(() => {
    autoSetSecretWords(room);
  }, 60 * 1000);

  const setupData = {
    roundNumber: room.currentRound,
    maxRounds: room.maxRounds,
    wordLength: room.wordState.wordLength,
    players: getPlayerList(room)
  };
  console.log('[Word] Emitting word-setup-started to room', room.code, setupData);
  io.to(room.code).emit('word-setup-started', setupData);
}

function autoSetSecretWords(room) {
  if (!room.wordState || room.wordState.phase !== 'setup') return;

  const ws = room.wordState;
  const len = ws.wordLength;

  for (const pId of ws.playerOrder) {
    if (!ws.secretWords.has(pId)) {
      const randomWord = getRandomWord(len);
      ws.secretWords.set(pId, randomWord);
      
      // Notify player of their assigned word
      io.to(pId).emit('word-auto-assigned', { word: randomWord });
    }
  }

  startWordGuessing(room);
}

function startWordGuessing(room) {
  if (room.roundTimeout) clearTimeout(room.roundTimeout);

  const ws = room.wordState;
  ws.phase = 'playing';
  ws.turnIndex = (room.currentRound - 1) % 2; // alternates starting player
  
  const p1Id = ws.playerOrder[0];
  const p2Id = ws.playerOrder[1];

  ws.revealedPatterns.set(p1Id, '_'.repeat(ws.wordLength));
  ws.revealedPatterns.set(p2Id, '_'.repeat(ws.wordLength));
  ws.history.set(p1Id, []);
  ws.history.set(p2Id, []);

  setWordTurnTimeout(room);

  // Send start event to each player individually to hide secret words
  ws.playerOrder.forEach(pId => {
    const oppId = ws.playerOrder.find(id => id !== pId);
    io.to(pId).emit('word-started', {
      roundNumber: room.currentRound,
      maxRounds: room.maxRounds,
      wordLength: ws.wordLength,
      turnPlayerId: ws.playerOrder[ws.turnIndex],
      turnPlayerName: room.players.get(ws.playerOrder[ws.turnIndex])?.name || 'Unknown',
      mySecretWord: ws.secretWords.get(pId),
      myRevealedOfOpponent: ws.revealedPatterns.get(pId),
      opponentRevealedOfMine: ws.revealedPatterns.get(oppId),
      myHistory: [],
      opponentHistory: []
    });
  });
}

function setWordTurnTimeout(room) {
  if (room.roundTimeout) clearTimeout(room.roundTimeout);

  // 45s turn timeout
  room.roundTimeout = setTimeout(() => {
    handleWordTurnTimeout(room);
  }, 45 * 1000);
}

function handleWordTurnTimeout(room) {
  if (!room.wordState || room.wordState.phase !== 'playing') return;

  const ws = room.wordState;
  const activePlayerId = ws.playerOrder[ws.turnIndex];
  const activePlayerName = room.players.get(activePlayerId)?.name || 'Unknown';

  // Pass turn
  ws.turnIndex = (ws.turnIndex + 1) % 2;
  const nextPlayerId = ws.playerOrder[ws.turnIndex];
  const nextPlayerName = room.players.get(nextPlayerId)?.name || 'Unknown';

  io.to(room.code).emit('word-turn-timed-out', {
    message: `${activePlayerName}'s turn timed out!`,
    nextPlayerId,
    nextPlayerName
  });

  setWordTurnTimeout(room);

  // Send turn update to each player
  ws.playerOrder.forEach(pId => {
    const oppId = ws.playerOrder.find(id => id !== pId);
    io.to(pId).emit('word-turn-update', {
      turnPlayerId: ws.playerOrder[ws.turnIndex],
      turnPlayerName: nextPlayerName,
      myRevealedOfOpponent: ws.revealedPatterns.get(pId),
      opponentRevealedOfMine: ws.revealedPatterns.get(oppId),
      myHistory: ws.history.get(pId),
      opponentHistory: ws.history.get(oppId)
    });
  });
}

function endWordRound(room) {
  if (room.roundTimeout) {
    clearTimeout(room.roundTimeout);
    room.roundTimeout = null;
  }

  const ws = room.wordState;
  const p1Id = ws.playerOrder[0];
  const p2Id = ws.playerOrder[1];

  const p1 = room.players.get(p1Id);
  const p2 = room.players.get(p2Id);

  const p1Secret = ws.secretWords.get(p1Id);
  const p2Secret = ws.secretWords.get(p2Id);

  const p1Revealed = ws.revealedPatterns.get(p1Id);
  const p2Revealed = ws.revealedPatterns.get(p2Id);

  const winnerId = ws.winnerId;
  const loserId = ws.playerOrder.find(id => id !== winnerId);

  const winnerPlayer = room.players.get(winnerId);
  const loserPlayer = room.players.get(loserId);

  // Scoring
  const winnerScore = 10;
  // Loser score is the count of revealed letters in opponent's word
  const loserPattern = ws.revealedPatterns.get(loserId) || '';
  let loserScore = 0;
  for (let i = 0; i < loserPattern.length; i++) {
    if (loserPattern[i] !== '_') {
      loserScore++;
    }
  }

  if (winnerPlayer) winnerPlayer.totalScore += winnerScore;
  if (loserPlayer) loserPlayer.totalScore += loserScore;

  const standings = Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, totalScore: p.totalScore, color: p.color }))
    .sort((a, b) => b.totalScore - a.totalScore);

  const isLastRound = room.currentRound >= room.maxRounds;
  room.state = isLastRound ? 'finished' : 'results';
  ws.phase = 'finished';

  const results = [
    {
      playerId: winnerId,
      playerName: winnerPlayer?.name || 'Unknown',
      secretWord: winnerId === p1Id ? p1Secret : p2Secret,
      opponentWord: winnerId === p1Id ? p2Secret : p1Secret,
      revealedPattern: winnerId === p1Id ? p1Revealed : p2Revealed, // will be fully revealed
      score: winnerScore,
      isWinner: true
    },
    {
      playerId: loserId,
      playerName: loserPlayer?.name || 'Unknown',
      secretWord: loserId === p1Id ? p1Secret : p2Secret,
      opponentWord: loserId === p1Id ? p2Secret : p1Secret,
      revealedPattern: loserId === p1Id ? p1Revealed : p2Revealed,
      score: loserScore,
      isWinner: false
    }
  ];

  return {
    roundNumber: room.currentRound,
    results,
    standings,
    isLastRound
  };
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

  socket.on('create-room', ({ username, rounds, mode, wordLength }) => {
    if (!username || username.trim().length === 0) {
      socket.emit('error-msg', { message: 'Username is required' });
      return;
    }
    if (username.trim().length > 20) {
      socket.emit('error-msg', { message: 'Username must be 20 characters or less' });
      return;
    }

    const room = createRoom(socket.id, username.trim(), rounds, mode, wordLength);
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
      wordLength: room.wordLength,
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
      wordLength: room.wordLength,
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

    if (room.mode === 'word') {
      if (room.players.size !== 2) {
        socket.emit('error-msg', { message: 'Need exactly 2 players for Word Duel' });
        return;
      }
      startWordSetup(room);
      return;
    }

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
      mode: roundData.mode || room.mode,
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

  socket.on('tap-submit', ({ roomCode, taps }) => {
    const room = rooms.get(roomCode);
    if (!room || room.state !== 'playing' || room.mode !== 'tap') return;

    const result = submitTaps(room, socket.id, taps);
    if (!result) return;

    if (result.submitted) {
      io.to(roomCode).emit('player-submitted', {
        playerId: socket.id,
        playerName: room.players.get(socket.id)?.name,
        waiting: result.waiting
      });
    } else {
      io.to(roomCode).emit('round-results', result);
    }
  });

  socket.on('next-round', ({ roomCode }) => {
    const room = rooms.get(roomCode);
    if (!room) return;
    if (socket.id !== room.hostId) return;
    if (room.state !== 'results') return;

    if (room.mode === 'word') {
      startWordSetup(room);
      return;
    }

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

  // ─── Word Duel Events ─────────────────────────────────────────

  socket.on('word-submit-secret', ({ roomCode, word }) => {
    const room = rooms.get(roomCode);
    if (!room || room.mode !== 'word' || room.state !== 'playing') return;

    const ws = room.wordState;
    if (!ws || ws.phase !== 'setup') return;

    if (ws.secretWords.has(socket.id)) {
      socket.emit('error-msg', { message: 'Secret word already set' });
      return;
    }

    const cleanWord = word?.trim().toLowerCase();
    if (!cleanWord || cleanWord.length !== ws.wordLength) {
      socket.emit('error-msg', { message: `Word must be exactly ${ws.wordLength} letters` });
      return;
    }

    if (!/^[a-z]+$/.test(cleanWord)) {
      socket.emit('error-msg', { message: 'Word must contain only letters' });
      return;
    }

    if (!isValidWord(cleanWord, ws.wordLength)) {
      socket.emit('error-msg', { message: 'Not a valid English word' });
      return;
    }

    ws.secretWords.set(socket.id, cleanWord);

    // Notify player that their word is locked
    socket.emit('word-secret-locked', { word: cleanWord });

    // Check if both players have submitted
    const connectedPlayers = ws.playerOrder.filter(pId => {
      const p = room.players.get(pId);
      return p && p.connected;
    });

    const allSubmitted = ws.playerOrder.every(pId => ws.secretWords.has(pId));
    if (allSubmitted || (connectedPlayers.length === 2 && connectedPlayers.every(pId => ws.secretWords.has(pId)))) {
      startWordGuessing(room);
    } else {
      socket.to(roomCode).emit('word-opponent-submitted');
    }
  });

  socket.on('word-submit-guess', ({ roomCode, guess }) => {
    const room = rooms.get(roomCode);
    if (!room || room.mode !== 'word' || room.state !== 'playing') return;

    const ws = room.wordState;
    if (!ws || ws.phase !== 'playing') return;

    const activePlayerId = ws.playerOrder[ws.turnIndex];
    if (socket.id !== activePlayerId) {
      socket.emit('error-msg', { message: "It's not your turn!" });
      return;
    }

    const cleanGuess = guess?.trim().toLowerCase();
    if (!cleanGuess || cleanGuess.length !== ws.wordLength) {
      socket.emit('error-msg', { message: `Guess must be exactly ${ws.wordLength} letters` });
      return;
    }

    if (!/^[a-z]+$/.test(cleanGuess)) {
      socket.emit('error-msg', { message: 'Guess must contain only letters' });
      return;
    }

    const opponentId = ws.playerOrder.find(id => id !== socket.id);
    const opponentWord = ws.secretWords.get(opponentId);
    let currentPattern = ws.revealedPatterns.get(socket.id);

    // Compare guess with opponent's word at each position
    let newPattern = '';
    for (let i = 0; i < ws.wordLength; i++) {
      if (cleanGuess[i] === opponentWord[i]) {
        newPattern += opponentWord[i];
      } else {
        newPattern += currentPattern[i]; // keep existing revealed or '_'
      }
    }

    ws.revealedPatterns.set(socket.id, newPattern);

    // Count correct positions in this guess
    let matchesCount = 0;
    for (let i = 0; i < ws.wordLength; i++) {
      if (cleanGuess[i] === opponentWord[i]) {
        matchesCount++;
      }
    }

    // Add to history
    const entry = {
      guess: cleanGuess.toUpperCase(),
      patternAfter: newPattern.toUpperCase(),
      matchesCount: matchesCount,
      timestamp: Date.now()
    };
    ws.history.get(socket.id).push(entry);

    // Check if won
    if (newPattern === opponentWord) {
      ws.winnerId = socket.id;
      const result = endWordRound(room);
      io.to(roomCode).emit('word-round-results', result);
    } else {
      // Toggle turn
      ws.turnIndex = (ws.turnIndex + 1) % 2;
      const nextPlayerId = ws.playerOrder[ws.turnIndex];
      const nextPlayerName = room.players.get(nextPlayerId)?.name || 'Unknown';

      // Reset turn timeout
      setWordTurnTimeout(room);

      // Notify clients
      ws.playerOrder.forEach(pId => {
        const oppId = ws.playerOrder.find(id => id !== pId);
        io.to(pId).emit('word-turn-update', {
          turnPlayerId: nextPlayerId,
          turnPlayerName: nextPlayerName,
          myRevealedOfOpponent: ws.revealedPatterns.get(pId),
          opponentRevealedOfMine: ws.revealedPatterns.get(oppId),
          myHistory: ws.history.get(pId),
          opponentHistory: ws.history.get(oppId)
        });
      });
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
        const connectedPlayers = Array.from(room.players.values()).filter(p => p.connected);
        if (connectedPlayers.length === 0) {
          rooms.delete(currentRoom);
        } else if (room.mode === 'grid') {
          if (room.gridState && room.gridState.phase === 'runners-picking') {
            const trapperId = room.gridState.currentTrapperId;
            const connectedRunners = connectedPlayers.filter(p => p.id !== trapperId);
            let submittedConnected = 0;
            for (const p of connectedRunners) {
              if (room.gridState.runnerSelections.has(p.id)) submittedConnected++;
            }
            if (submittedConnected >= connectedRunners.length) {
              const result = endGridRound(room);
              io.to(currentRoom).emit('grid-round-results', result);
            }
          }
        } else if (room.mode === 'word') {
          if (room.roundTimeout) {
            clearTimeout(room.roundTimeout);
            room.roundTimeout = null;
          }
        } else {
          const currentRoundData = room.rounds[room.rounds.length - 1];
          if (currentRoundData) {
            let submittedConnected = 0;
            for (const p of connectedPlayers) {
              if (currentRoundData.submissions.has(p.id)) submittedConnected++;
            }
            if (submittedConnected >= connectedPlayers.length) {
              const result = endRound(room);
              io.to(currentRoom).emit('round-results', result);
            }
          }
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
