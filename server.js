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
const TICK_RATE = 100;        // ms entre atualizações
const GAME_DURATION = 60;     // segundos
const RESTART_DELAY = 5000;   // 5s entre partidas

let players = new Map();      // id -> {id, x, y, direction, score, color}
let apples = [];
let gameActive = false;
let startTime = 0;
let restartTimeout = null;

function randomCell() {
  return {
    x: Math.floor(Math.random() * COLS),
    y: Math.floor(Math.random() * ROWS)
  };
}

function cellOccupied(x, y) {
  for (const p of players.values()) {
    if (p.x === x && p.y === y) return true;
  }
  return apples.some(a => a.x === x && a.y === y);
}

function spawnApple() {
  let pos;
  do {
    pos = randomCell();
  } while (cellOccupied(pos.x, pos.y));
  apples.push(pos);
}

function spawnInitialApples(count = 5) {
  apples = [];
  for (let i = 0; i < count; i++) spawnApple();
}

function respawnPlayer(player) {
  let pos;
  do {
    pos = randomCell();
  } while (cellOccupied(pos.x, pos.y));
  player.x = pos.x;
  player.y = pos.y;
}

function endRound() {
  if (!gameActive) return;
  gameActive = false;
  if (restartTimeout) clearTimeout(restartTimeout);

  const scores = Array.from(players.values())
    .map(p => ({ id: p.id, score: p.score, color: p.color }))
    .sort((a, b) => b.score - a.score);

  io.emit('gameOver', { scores });
  restartTimeout = setTimeout(startRound, RESTART_DELAY);
}

function startRound() {
  if (restartTimeout) clearTimeout(restartTimeout);
  restartTimeout = null;

  for (const p of players.values()) {
    p.score = 0;
    p.direction = 'right';
    respawnPlayer(p);
  }
  spawnInitialApples(5);
  gameActive = true;
  startTime = Date.now();
  io.emit('roundStart', { duration: GAME_DURATION });
}

function gameLoop() {
  if (!gameActive) return;

  const elapsed = (Date.now() - startTime) / 1000;
  const timeLeft = Math.max(0, GAME_DURATION - elapsed);

  // Movimentação dos jogadores
  for (const player of players.values()) {
    let newX = player.x;
    let newY = player.y;
    switch (player.direction) {
      case 'up': newY--; break;
      case 'down': newY++; break;
      case 'left': newX--; break;
      case 'right': newX++; break;
    }

    // Colisão com paredes = respawn
    if (newX < 0 || newX >= COLS || newY < 0 || newY >= ROWS) {
      respawnPlayer(player);
    } else {
      player.x = newX;
      player.y = newY;
    }
  }

  // Colisão com maçãs
  for (const player of players.values()) {
    for (let i = apples.length - 1; i >= 0; i--) {
      if (player.x === apples[i].x && player.y === apples[i].y) {
        apples.splice(i, 1);
        player.score++;
        spawnApple();
      }
    }
  }

  // Envia estado para todos
  const playersData = Array.from(players.values()).map(p => ({
    id: p.id,
    x: p.x,
    y: p.y,
    score: p.score,
    color: p.color,
    direction: p.direction
  }));

  io.emit('gameState', {
    players: playersData,
    apples,
    timeLeft: Math.ceil(timeLeft)
  });

  if (timeLeft <= 0) endRound();
}

// --- Socket.io ---
io.on('connection', (socket) => {
  console.log(`Jogador conectado: ${socket.id}`);

  const color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
  const player = {
    id: socket.id,
    x: 0, y: 0,
    direction: 'right',
    score: 0,
    color
  };
  players.set(socket.id, player);
  respawnPlayer(player);

  // Se não há partida ativa, inicia uma
  if (!gameActive && players.size >= 1) {
    startRound();
  }

  // Envia estado atual ao novo jogador
  socket.emit('currentState', {
    players: Array.from(players.values()).map(p => ({
      id: p.id, x: p.x, y: p.y, score: p.score, color: p.color, direction: p.direction
    })),
    apples,
    timeLeft: gameActive ? Math.ceil(GAME_DURATION - (Date.now() - startTime) / 1000) : 0
  });
  socket.emit('playerId', socket.id);
  socket.broadcast.emit('playerJoined', {
    id: player.id, x: player.x, y: player.y, score: player.score, color: player.color, direction: player.direction
  });

  // Controle de direção
  socket.on('direction', (dir) => {
    const p = players.get(socket.id);
    if (!p || !gameActive) return;
    const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
    if (opposites[dir] !== p.direction) {
      p.direction = dir;
    }
  });

  socket.on('disconnect', () => {
    console.log(`Jogador desconectado: ${socket.id}`);
    players.delete(socket.id);
    socket.broadcast.emit('playerLeft', socket.id);

    if (players.size === 0 && gameActive) {
      gameActive = false;
      if (restartTimeout) clearTimeout(restartTimeout);
      io.emit('gameOver', { scores: [] });
    }
  });
});

// Loop principal do servidor
setInterval(gameLoop, TICK_RATE);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`Servidor rodando na porta ${PORT}`));
