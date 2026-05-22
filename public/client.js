const socket = io();
let playerId = null;
let currentRoom = null;
let gameState = null;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const CELL = 20;
const COLS = 40;
const ROWS = 30;

// UI Elements
const lobby = document.getElementById('lobby');
const gameContainer = document.getElementById('game-container');
const lobbyMessage = document.getElementById('lobby-message');
const roomInfo = document.getElementById('room-info');
const roomCodeDisplay = document.getElementById('roomCodeDisplay');
const roomCodeInput = document.getElementById('roomCodeInput');
const chatInput = document.getElementById('chatInput');
const chatMessages = document.getElementById('chat-messages');
const scoreboard = document.getElementById('scoreboard');

// Tabs
document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
  });
});

// Bot selector
let botCount = 2;
document.getElementById('botMinus').addEventListener('click', () => {
  if (botCount > 0) {
    botCount--;
    document.getElementById('botCount').textContent = botCount;
  }
});
document.getElementById('botPlus').addEventListener('click', () => {
  if (botCount < 7) {
    botCount++;
    document.getElementById('botCount').textContent = botCount;
  }
});

// Criar sala
document.getElementById('createRoomBtn').addEventListener('click', () => {
  const playerName = document.getElementById('playerNameCreate').value.trim();
  socket.emit('createRoom', { botCount, playerName });
  lobbyMessage.textContent = 'Criando sala...';
});

// Entrar em sala
document.getElementById('joinRoomBtn').addEventListener('click', () => {
  const code = roomCodeInput.value.trim().toUpperCase();
  const playerName = document.getElementById('playerNameJoin').value.trim();
  if (code.length === 4) {
    socket.emit('joinRoom', { code, playerName });
    lobbyMessage.textContent = 'Entrando...';
  } else {
    lobbyMessage.textContent = 'Código inválido (4 dígitos)';
  }
});

roomCodeInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') document.getElementById('joinRoomBtn').click();
});

// Controles
document.addEventListener('keydown', (e) => {
  if (document.activeElement === chatInput || 
      document.activeElement === roomCodeInput ||
      document.activeElement.id === 'playerNameCreate' ||
      document.activeElement.id === 'playerNameJoin') return;

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

socket.on('chatMessage', ({ name, color, msg, isBot }) => {
  const li = document.createElement('li');
  li.innerHTML = `<span style="color:${color}">${isBot ? '🤖' : ''} ${name}:</span> ${msg}`;
  chatMessages.appendChild(li);
  chatMessages.scrollTop = chatMessages.scrollHeight;
});

// Bot controls in game
document.getElementById('addBotBtn').addEventListener('click', () => {
  socket.emit('addBot');
});

// Socket events
socket.on('roomCreated', ({ code, playerId: id, bots }) => {
  playerId = id;
  currentRoom = code;
  roomCodeDisplay.textContent = code;
  roomInfo.style.display = 'block';
  lobbyMessage.textContent = '';
  if (bots.length > 0) {
    lobbyMessage.textContent = `🤖 ${bots.length} bot(s) adicionado(s): ${bots.map(b => b.name).join(', ')}`;
    setTimeout(() => { lobbyMessage.textContent = ''; }, 3000);
  }
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

socket.on('playerJoined', (player) => {
  if (gameState) {
    gameState.players.push(player);
    render();
  }
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

// Renderização
function render() {
  if (!gameState) return;

  ctx.clearRect(0, 0, 800, 600);
  drawGrid();

  // Maçãs
  if (gameState.apples) {
    ctx.fillStyle = '#e74c3c';
    ctx.shadowColor = '#ff6b6b';
    ctx.shadowBlur = 6;
    for (const apple of gameState.apples) {
      ctx.beginPath();
      ctx.arc(apple.x * CELL + CELL/2, apple.y * CELL + CELL/2, CELL/2 - 2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.shadowBlur = 0;
  }

  // Jogadores
  if (gameState.players) {
    for (const p of gameState.players) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);

      // Indicador de direção
      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2;
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      const s = 5;
      switch (p.direction) {
        case 'up': ctx.moveTo(cx, cy - s); ctx.lineTo(cx - s, cy + s); ctx.lineTo(cx + s, cy + s); break;
        case 'down': ctx.moveTo(cx, cy + s); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx + s, cy - s); break;
        case 'left': ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy - s); ctx.lineTo(cx + s, cy + s); break;
        case 'right': ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx - s, cy + s); break;
      }
      ctx.fill();

      // Ícone de bot
      if (p.isBot) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🤖', cx, cy - 12);
      }

      // Nome do jogador
      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(p.name || p.id.slice(0, 6), cx, cy + 22);
    }
  }

  // Timer
  document.getElementById('timer').textContent = `⏱ ${gameState.timeLeft ?? 0}`;

  // Placar
  scoreboard.innerHTML = '';
  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const li = document.createElement('li');
    const botIcon = p.isBot ? '🤖 ' : '';
    li.innerHTML = `<span>${i + 1}º ${botIcon}${p.name || p.id.slice(0, 6)}: ${p.score}</span>`;
    li.style.color = p.color;
    if (p.id === playerId) {
      li.classList.add('current-player');
    }
    scoreboard.appendChild(li);
  }
}

function drawGrid() {
  ctx.strokeStyle = '#333';
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
  
  // Fundo
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, 800, 600);
  
  // Título
  ctx.fillStyle = '#e94560';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 FIM DE JOGO', 400, 120);
  
  // Pódio
  const podiumColors = ['#FFD700', '#C0C0C0', '#CD7F32'];
  const podiumEmojis = ['🥇', '🥈', '🥉'];
  
  for (let i = 0; i < Math.min(3, scores.length); i++) {
    const y = 200 + i * 80;
    
    // Fundo do pódio
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(200, y - 25, 400, 60);
    
    // Medalha
    ctx.font = '30px Arial';
    ctx.fillText(podiumEmojis[i], 240, y + 10);
    
    // Nome
    ctx.fillStyle = scores[i].color;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(
      `${scores[i].name || scores[i].id.slice(0, 6)} ${scores[i].isBot ? '🤖' : ''}`,
      380, y + 5
    );
    
    // Pontos
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText(`${scores[i].score} pts`, 560, y + 5);
  }
  
  // Resto dos jogadores
  for (let i = 3; i < scores.length; i++) {
    const y = 430 + (i - 3) * 35;
    ctx.fillStyle = scores[i].color;
    ctx.font = '16px Arial';
    ctx.fillText(
      `${i + 1}º ${scores[i].name || scores[i].id.slice(0, 6)} ${scores[i].isBot ? '🤖' : ''} – ${scores[i].score} pts`,
      400, y
    );
  }
  
  // Mensagem de reinício
  ctx.fillStyle = '#aaa';
  ctx.font = '14px Arial';
  ctx.fillText('Nova partida em breve...', 400, 570);
}});

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
