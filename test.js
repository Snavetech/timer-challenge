const { setupWhotState } = require('./whotEngine');
const players = new Map();
players.set('socketId1', { id: 'socketId1', name: 'Player 1' });
players.set('socketId2', { id: 'socketId2', name: 'Player 2' });
const state = setupWhotState(players);
console.log(state);
