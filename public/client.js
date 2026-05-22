const socket = io();
let playerId = null;
let currentRoom = null;
let gameState = null;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CELL = 20;
const COLS = 40;
const ROWS = 30;

// --- Elementos UI ---
const lobby = document.getElementById('lobby');
const gameContainer = document.getElementById('game-container');
const lobbyMessage = document.getElementById('lobby-message');
const roomInfo = document.getElementById('room-info');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomCodeInput = document.getElementById('roomCodeInput');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chat-messages');

// --- Botões do lobby ---
document.getElementById('createRoomBtn').addEventListener('click', () => {
  socket.emit('createRoom');
  lobbyMessage.textContent = 'Criando sala...';
});

document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  if (code.length === 4) {
    socket.emit('joinRoom', code);
    lobbyMessage.textContent = 'Entrando...';
  } else {
    lobbyMessage.textContent = 'Código inválido (4 dígitos)';
  }
});

roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('joinRoomBtn').click();
});

// --- Controles ---
document.addEventListener('keydown', (e) => {
  // Se tá focado no chat, não move
  if (document.activeElement === chatInput) return;

  let dir = null;
  if (e.key === 'ArrowUp' || e.key === 'w' || e.key === 'W') dir = 'up';
  else if (e.key === 'ArrowDown' || e.key === 's' || e.key === 'S') dir = 'down';
  else if (e.key === 'ArrowLeft' || e.key === 'a' || e.key === 'A') dir = 'left';
  else if (e.key === 'ArrowRight' || e.key === 'd' || e.key === 'D') dir = 'right';

  if (dir) {
    e.preventDefault();
    socket.emit('direction', dir);
  }
});

// Chat
chatInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    const msg = chatInput.value.trim();
    if (msg) {
      socket.emit('chat', msg);
      chatInput.value = '';
    }
  }
});

socket.on('chatMessage', ({ id, color, msg }) => {
  const li = document.createElement('li');
  li.innerHTML = `<span style="color:${color}">${id.slice(0, 6)}:</span> ${msg}`;
  chatMessages.appendChild(li);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// --- Socket Events ---
socket.on('roomCreated', ({ code, playerId: id }) => {
  playerId = id;
  currentRoom = code;
  roomCodeDisplay.textContent = code;
  roomInfo.style.display = 'block';
  lobbyMessage.textContent = '';
  enterGame();
});

socket.on('joinedRoom', ({ code, playerId: id, players, apples, timeLeft }) => {
  playerId = id;
  currentRoom = code;
  gameState = { players, apples, timeLeft };
  roomCodeDisplay.textContent = code;
  roomInfo.style.display = 'block';
  lobbyMessage.textContent = '';
  enterGame();
  render();
});

socket.on('error', (msg) => {
  lobbyMessage.textContent = msg;
});

socket.on('gameState', (state) => {
  gameState = state;
  render();
});

socket.on('roundStart', ({ duration }) => {
  console.log('Nova partida iniciada!');
});

socket.on('gameOver', ({ scores }) => {
  gameState = null;
  renderGameOver(scores);
});

socket.on('playerLeft', (id) => {
  if (gameState && gameState.players) {
    gameState.players = gameState.players.filter(p => p.id !== id);
    render();
  }
});

function enterGame() {
  lobby.style.display = 'none';
  gameContainer.style.display = 'flex';
}

// --- Renderização ---
function render() {
  if (!gameState) return;

  ctx.clearRect(0, 0, 800, 600);
  drawGrid();

  if (gameState.apples) {
    ctx.fillStyle = '#e74c3c';
    for (const apple of gameState.apples) {
      ctx.fillRect(apple.x * CELL, apple.y * CELL, CELL, CELL);
    }
  }

  if (gameState.players) {
    for (const p of gameState.players) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * CELL, p.y * CELL, CELL, CELL);

      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      const s = 5;
      switch (p.direction) {
        case 'up': ctx.moveTo(cx, cy - s); ctx.lineTo(cx - s, cy + s); ctx.lineTo(cx + s, cy + s); break;
        case 'down': ctx.moveTo(cx, cy + s); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx + s, cy - s); break;
        case 'left': ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy - s); ctx.lineTo(cx + s, cy + s); break;
        case 'right': ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx - s, cy + s); break;
      }
      ctx.fill();
    }
  }

  document.getElementById('timer').textContent = `⏱ ${gameState.timeLeft ?? 0}`;

  const scoreboard = document.getElementById('scoreboard');
  scoreboard.innerHTML = '';
  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  for (const p of sorted) {
    const li = document.createElement('li');
    li.textContent = `${p.id.slice(0, 6)}: ${p.score}`;
    li.style.color = p.color;
    if (p.id === playerId) li.style.fontWeight = 'bold';
    scoreboard.appendChild(li);
  }
}

function drawGrid() {
  ctx.strokeStyle = '#555';
  ctx.lineWidth = 0.5;
  for (let i = 0; i <= COLS; i++) {
    ctx.beginPath();
    ctx.moveTo(i * CELL, 0);
    ctx.lineTo(i * CELL, 600);
    ctx.stroke();
  }
  for (let j = 0; j <= ROWS; j++) {
    ctx.beginPath();
    ctx.moveTo(0, j * CELL);
    ctx.lineTo(800, j * CELL);
    ctx.stroke();
  }
}

function renderGameOver(scores) {
  ctx.clearRect(0, 0, 800, 600);
  ctx.fillStyle = 'rgba(0,0,0,0.75)';
  ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 40px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('FIM DE JOGO', 400, 200);
  ctx.font = '20px Arial';
  for (let i = 0; i < scores.length; i++) {
    ctx.fillStyle = scores[i].color;
    ctx.fillText(`${i + 1}º ${scores[i].id.slice(0, 6)} – ${scores[i].score} pts`, 400, 280 + i * 35);
  }
      }
