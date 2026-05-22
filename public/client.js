const socket = io();
let playerId = null;
let gameState = null;

const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

const CELL = 20;
const COLS = 40;
const ROWS = 30;

// Controles
document.addEventListener('keydown', (e) => {
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

// Recepção de eventos
socket.on('playerId', (id) => { playerId = id; });

socket.on('currentState', (state) => {
  gameState = state;
  render();
});

socket.on('gameState', (state) => {
  gameState = state;
  render();
});

socket.on('gameOver', (data) => {
  gameState = null;
  renderGameOver(data.scores);
});

// Renderização
function render() {
  if (!gameState) return;

  ctx.clearRect(0, 0, 800, 600);
  drawGrid();

  // Maçãs
  if (gameState.apples) {
    ctx.fillStyle = '#e74c3c';
    for (const apple of gameState.apples) {
      ctx.fillRect(apple.x * CELL, apple.y * CELL, CELL, CELL);
    }
  }

  // Jogadores
  if (gameState.players) {
    for (const p of gameState.players) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * CELL, p.y * CELL, CELL, CELL);

      // Indicador de direção (triângulo)
      const cx = p.x * CELL + CELL / 2;
      const cy = p.y * CELL + CELL / 2;
      ctx.fillStyle = '#000';
      ctx.beginPath();
      const s = 5;
      switch (p.direction) {
        case 'up':    ctx.moveTo(cx, cy - s); ctx.lineTo(cx - s, cy + s); ctx.lineTo(cx + s, cy + s); break;
        case 'down':  ctx.moveTo(cx, cy + s); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx + s, cy - s); break;
        case 'left':  ctx.moveTo(cx - s, cy); ctx.lineTo(cx + s, cy - s); ctx.lineTo(cx + s, cy + s); break;
        case 'right': ctx.moveTo(cx + s, cy); ctx.lineTo(cx - s, cy - s); ctx.lineTo(cx - s, cy + s); break;
      }
      ctx.fill();
    }
  }

  // Timer
  document.getElementById('timer').textContent = `⏱ ${gameState.timeLeft ?? 0}`;

  // Placar ordenado
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
