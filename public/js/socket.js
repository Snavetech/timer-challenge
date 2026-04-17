/* ═══════════════════════════════════════════════════════════════
   Socket Module — Socket.IO Client Wrapper
   ═══════════════════════════════════════════════════════════════ */

const Socket = (() => {
  let socket = null;
  let roomCode = null;
  let isHost = false;
  let myId = null;
  let connected = false;

  function connect() {
    socket = io({
      reconnection: true,
      reconnectionAttempts: 10,
      reconnectionDelay: 1000
    });

    socket.on('connect', () => {
      myId = socket.id;
      connected = true;
      console.log('[Socket] Connected to server:', myId);
    });

    socket.on('disconnect', (reason) => {
      connected = false;
      console.log('[Socket] Disconnected:', reason);
      UI.showToast('Disconnected from server. Reconnecting...', 'error');
    });

    socket.on('connect_error', (err) => {
      console.error('[Socket] Connection error:', err.message);
      UI.showToast('Cannot connect to server. Is it running?', 'error');
    });

    return socket;
  }

  function createRoom(username, rounds, mode) {
    if (!socket || !connected) {
      console.error('[Socket] Not connected, cannot create room');
      UI.showToast('Not connected to server. Please wait...', 'error');
      return;
    }
    console.log('[Socket] Emitting create-room:', { username, rounds, mode });
    socket.emit('create-room', { username, rounds, mode });
  }

  function joinRoom(code, username) {
    if (!socket || !connected) {
      UI.showToast('Not connected to server. Please wait...', 'error');
      return;
    }
    console.log('[Socket] Emitting join-room:', { roomCode: code, username });
    socket.emit('join-room', { roomCode: code, username });
  }

  function startRound() {
    socket.emit('start-round', { roomCode });
  }

  function playerStop(elapsed) {
    socket.emit('player-stop', { roomCode, elapsed });
  }

  function nextRound() {
    socket.emit('next-round', { roomCode });
  }

  function playAgain() {
    socket.emit('play-again', { roomCode });
  }

  // Grid mode methods
  function gridSetTraps(cells) {
    socket.emit('grid-set-traps', { roomCode, cells });
  }

  function gridPickCell(cell) {
    socket.emit('grid-pick-cell', { roomCode, cell });
  }

  function setRoomCode(code) {
    roomCode = code;
  }

  function getRoomCode() {
    return roomCode;
  }

  function setIsHost(val) {
    isHost = val;
  }

  function getIsHost() {
    return isHost;
  }

  function getMyId() {
    return myId;
  }

  function getSocket() {
    return socket;
  }

  function isConnected() {
    return connected;
  }

  // Register event handlers
  function on(event, callback) {
    if (socket) socket.on(event, callback);
  }

  return {
    connect,
    createRoom,
    joinRoom,
    startRound,
    playerStop,
    nextRound,
    playAgain,
    gridSetTraps,
    gridPickCell,
    setRoomCode,
    getRoomCode,
    setIsHost,
    getIsHost,
    getMyId,
    getSocket,
    isConnected,
    on
  };
})();
