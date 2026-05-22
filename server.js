const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);

app.use(express.static(path.join(__dirname, 'public')));

// Configurações do grid
const CELL_SIZE = 20;
const COLS = 40;
const ROWS = 30;
const TICK_RATE = 100;
const GAME_DURATION = 60;
const RESTART_DELAY = 5000;

// Salas
const rooms = new Map(); // code -> { players: Map, apples: [], gameActive, startTime, restartTimeout }

function randomCell() {
  return { x: Math.floor(Math.random() * COLS), y: Math.floor(Math.random() * ROWS) };
}

function cellOccupied(room, x, y) {
  for (const p of room.players.values()) {
    if (p.x === x && p.y === y) return true;
  }
  return room.apples.some(a => a.x === x && a.y === y);
}

function spawnApple(room) {
  let pos;
  do {
    pos = randomCell();
  } while (cellOccupied(room, pos.x, pos.y));
  room.apples.push(pos);
}

function spawnInitialApples(room, count = 5) {
  room.apples = [];
  for (let i = 0; i < count; i++) spawnApple(room);
}

function respawnPlayer(room, player) {
  let pos;
  do {
    pos = randomCell();
  } while (cellOccupied(room, pos.x, pos.y));
  player.x = pos.x;
  player.y = pos.y;
}

function generateRoomCode() {
  let code;
  do {
    code = Math.floor(1000 + Math.random() * 9000).toString();
  } while (rooms.has(code));
  return code;
}

function startRound(room) {
  if (room.restartTimeout) clearTimeout(room.restartTimeout);
  room.restartTimeout = null;

  for (const p of room.players.values()) {
    p.score = 0;
    p.direction = 'right';
    respawnPlayer(room, p);
  }
  spawnInitialApples(room, 5);
  room.gameActive = true;
  room.startTime = Date.now();
  io.to(room.code).emit('roundStart', { duration: GAME_DURATION });
}

function endRound(room) {
  if (!room.gameActive) return;
  room.gameActive = false;
  if (room.restartTimeout) clearTimeout(room.restartTimeout);

  const scores = Array.from(room.players.values())
    .map(p => ({ id: p.id, score: p.score, color: p.color }))
    .sort((a, b) => b.score - a.score);

  io.to(room.code).emit('gameOver', { scores });
  room.restartTimeout = setTimeout(() => startRound(room), RESTART_DELAY);
}

function gameLoop() {
  for (const [code, room] of rooms) {
    if (!room.gameActive) continue;

    const elapsed = (Date.now() - room.startTime) / 1000;
    const timeLeft = Math.max(0, GAME_DURATION - elapsed);

    // Movimentação
    for (const player of room.players.values()) {
      let newX = player.x;
      let newY = player.y;
      switch (player.direction) {
        case 'up': newY--; break;
        case 'down': newY++; break;
        case 'left': newX--; break;
        case 'right': newX++; break;
      }
      if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS) {
        respawnPlayer(room, player);
      } else {
        player.x = newX;
        player.y = newY;
      }
    }

    // Maçãs
    for (const player of room.players.values()) {
      for (let i = room.apples.length - 1; i >= 0; i--) {
        if (player.x === room.apples[i].x && player.y === room.apples[i].y) {
          room.apples.splice(i, 1);
          player.score++;
          spawnApple(room);
        }
      }
    }

    const playersData = Array.from(room.players.values()).map(p => ({
      id: p.id, x: p.x, y: p.y, score: p.score, color: p.color, direction: p.direction
    }));

    io.to(code).emit('gameState', {
      players: playersData,
      apples: room.apples,
      timeLeft: Math.ceil(timeLeft)
    });

    if (timeLeft <= 0) endRound(room);
  }
}

// Socket.io
io.on('connection', (socket) => {
  console.log(`Jogador conectado: ${socket.id}`);

  // Criar sala
  socket.on('createRoom', () => {
    const code = generateRoomCode();
    socket.join(code);
    const color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    const player = {
      id: socket.id,
      x: 0, y: 0,
      direction: 'right',
      score: 0,
      color,
      roomCode: code
    };

    const room = {
      code,
      players: new Map([[socket.id, player]]),
      apples: [],
      gameActive: false,
      startTime: 0,
      restartTimeout: null
    };
    rooms.set(code, room);
    respawnPlayer(room, player);

    socket.emit('roomCreated', { code, playerId: socket.id });
    startRound(room);
  });

  // Entrar em sala
  socket.on('joinRoom', (code) => {
    const room = rooms.get(code);
    if (!room) {
      socket.emit('error', 'Sala não encontrada');
      return;
    }
    if (room.players.size >= 8) {
      socket.emit('error', 'Sala cheia (máx 8 jogadores)');
      return;
    }

    socket.join(code);
    const color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    const player = {
      id: socket.id,
      x: 0, y: 0,
      direction: 'right',
      score: 0,
      color,
      roomCode: code
    };
    room.players.set(socket.id, player);
    respawnPlayer(room, player);

    socket.emit('joinedRoom', {
      code,
      playerId: socket.id,
      players: Array.from(room.players.values()).map(p => ({
        id: p.id, x: p.x, y: p.y, score: p.score, color: p.color, direction: p.direction
      })),
      apples: room.apples,
      timeLeft: room.gameActive ? Math.ceil(GAME_DURATION - (Date.now() - room.startTime) / 1000) : 0
    });

    socket.to(code).emit('playerJoined', {
      id: player.id, x: player.x, y: player.y, score: player.score, color: player.color, direction: player.direction
    });
  });

  // Controle de direção
  socket.on('direction', (dir) => {
    for (const [code, room] of rooms) {
      const p = room.players.get(socket.id);
      if (p) {
        if (!room.gameActive) return;
        const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
        if (opposites[dir] !== p.direction) {
          p.direction = dir;
        }
        break;
      }
    }
  });

  // Chat simples (opcional, pra LAN)
  socket.on('chat', (msg) => {
    for (const [code, room] of rooms) {
      const p = room.players.get(socket.id);
      if (p) {
        io.to(code).emit('chatMessage', { id: socket.id, color: p.color, msg });
        break;
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Jogador desconectado: ${socket.id}`);
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.players.delete(socket.id);
        socket.to(code).emit('playerLeft', socket.id);

        if (room.players.size === 0) {
          if (room.gameActive) room.gameActive = false;
          if (room.restartTimeout) clearTimeout(room.restartTimeout);
          rooms.delete(code);
        }
        break;
      }
    }
  });
});

setInterval(gameLoop, TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`Servidor rodando em http://0.0.0.0:${PORT}`);
});
