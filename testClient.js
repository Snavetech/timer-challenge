const io = require('socket.io-client');
const client1 = io('http://localhost:3000');
const client2 = io('http://localhost:3000');

let roomCode = null;

client1.on('connect', () => {
  console.log('Client 1 connected');
  client1.emit('create-room', { username: 'Host', rounds: 3, mode: 'whot' });
});

client1.on('room-created', (data) => {
  console.log('Room created:', data.roomCode);
  roomCode = data.roomCode;
  client2.emit('join-room', { roomCode: data.roomCode, username: 'Player 2' });
});

client2.on('room-joined', (data) => {
  console.log('Client 2 joined room');
  client1.emit('start-round', { roomCode });
});

client1.on('whot-round-started', (data) => {
  console.log('Client 1 received whot-round-started!', Object.keys(data));
  process.exit(0);
});

client1.on('error-msg', (data) => {
  console.error('Client 1 error:', data);
});
client2.on('error-msg', (data) => {
  console.error('Client 2 error:', data);
});

setTimeout(() => {
  console.log('Timeout');
  process.exit(1);
}, 2000);
