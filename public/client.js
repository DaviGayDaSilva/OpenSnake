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
const voiceToggleBtn = document.getElementById('voiceToggleBtn');
const voiceIcon = document.getElementById('voiceIcon');
const voiceStatus = document.getElementById('voiceStatus');
const voiceUsers = document.getElementById('voice-users');

// ============ WEBRTC ============
let localStream = null;
let isVoiceActive = false;
const peerConnections = new Map(); // socketId -> RTCPeerConnection

const rtcConfig = {
  iceServers: [
    { urls: 'stun:stun.l.google.com:19302' },
    { urls: 'stun:stun1.l.google.com:19302' }
  ]
};

async function toggleVoice() {
  if (isVoiceActive) {
    leaveVoice();
  } else {
    await joinVoice();
  }
}

async function joinVoice() {
  try {
    localStream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }, 
      video: false 
    });
    
    isVoiceActive = true;
    voiceIcon.textContent = '🔴';
    voiceStatus.textContent = 'Sair';
    voiceToggleBtn.classList.add('active');
    
    socket.emit('voice-join');
    
    // Quando receber lista de usuários existentes, cria ofertas para cada um
    socket.on('voice-users-list', (users) => {
      users.forEach(userId => {
        createPeerConnection(userId);
        createOffer(userId);
      });
    });
    
    // Quando um novo usuário entrar
    socket.on('voice-user-joined', (userId) => {
      createPeerConnection(userId);
      createOffer(userId);
    });
    
    // Quando um usuário sair
    socket.on('voice-user-left', (userId) => {
      closePeerConnection(userId);
      updateVoiceUsersList();
    });
    
    // Receber oferta
    socket.on('voice-offer', async ({ from, offer }) => {
      const pc = createPeerConnection(from);
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      socket.emit('voice-answer', { to: from, answer });
    });
    
    // Receber resposta
    socket.on('voice-answer', async ({ from, answer }) => {
      const pc = peerConnections.get(from);
      if (pc && pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(new RTCSessionDescription(answer));
      }
    });
    
    // Receber candidato ICE
    socket.on('voice-ice-candidate', async ({ from, candidate }) => {
      const pc = peerConnections.get(from);
      if (pc) {
        try {
          await pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.error('Erro ao adicionar ICE:', e);
        }
      }
    });
    
    updateVoiceUsersList();
    
  } catch (err) {
    console.error('Erro ao acessar microfone:', err);
    alert('Não foi possível acessar o microfone. Verifique as permissões.');
    isVoiceActive = false;
    voiceIcon.textContent = '🎙️';
    voiceStatus.textContent = 'Entrar';
    voiceToggleBtn.classList.remove('active');
  }
}

function leaveVoice() {
  isVoiceActive = false;
  voiceIcon.textContent = '🎙️';
  voiceStatus.textContent = 'Entrar';
  voiceToggleBtn.classList.remove('active');
  
  // Fecha todas as conexões
  for (const [userId, pc] of peerConnections) {
    pc.close();
  }
  peerConnections.clear();
  
  // Para o stream local
  if (localStream) {
    localStream.getTracks().forEach(track => track.stop());
    localStream = null;
  }
  
  socket.emit('voice-leave');
  
  // Remove listeners
  socket.off('voice-users-list');
  socket.off('voice-user-joined');
  socket.off('voice-user-left');
  socket.off('voice-offer');
  socket.off('voice-answer');
  socket.off('voice-ice-candidate');
  
  updateVoiceUsersList();
}

function createPeerConnection(userId) {
  if (peerConnections.has(userId)) return peerConnections.get(userId);
  
  const pc = new RTCPeerConnection(rtcConfig);
  peerConnections.set(userId, pc);
  
  // Adiciona stream local
  if (localStream) {
    localStream.getTracks().forEach(track => {
      pc.addTrack(track, localStream);
    });
  }
  
  // Evento de track remoto (áudio do outro usuário)
  pc.ontrack = (event) => {
    const audio = new Audio();
    audio.srcObject = event.streams[0];
    audio.autoplay = true;
    audio.volume = 1.0;
    
    // Armazena referência para poder remover depois
    if (!pc.remoteAudio) {
      pc.remoteAudio = audio;
    }
  };
  
  // Candidatos ICE
  pc.onicecandidate = (event) => {
    if (event.candidate) {
      socket.emit('voice-ice-candidate', {
        to: userId,
        candidate: event.candidate
      });
    }
  };
  
  // Estado da conexão
  pc.onconnectionstatechange = () => {
    if (pc.connectionState === 'connected') {
      console.log(`Conectado via WebRTC com ${userId}`);
    } else if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected') {
      closePeerConnection(userId);
      updateVoiceUsersList();
    }
  };
  
  updateVoiceUsersList();
  return pc;
}

async function createOffer(userId) {
  const pc = peerConnections.get(userId);
  if (!pc) return;
  
  try {
    const offer = await pc.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: false
    });
    await pc.setLocalDescription(offer);
    socket.emit('voice-offer', { to: userId, offer });
  } catch (err) {
    console.error('Erro ao criar oferta:', err);
  }
}

function closePeerConnection(userId) {
  const pc = peerConnections.get(userId);
  if (pc) {
    if (pc.remoteAudio) {
      pc.remoteAudio.srcObject = null;
      pc.remoteAudio.remove();
    }
    pc.close();
    peerConnections.delete(userId);
  }
  updateVoiceUsersList();
}

function updateVoiceUsersList() {
  voiceUsers.innerHTML = '';
  
  if (!isVoiceActive) {
    voiceUsers.innerHTML = '<div class="voice-empty">Clique em Entrar para ativar o chat de voz</div>';
    return;
  }
  
  // Mostra você mesmo
  const myDiv = document.createElement('div');
  myDiv.className = 'voice-user self';
  myDiv.innerHTML = '<span class="voice-indicator speaking">●</span> Você (mudo)';
  voiceUsers.appendChild(myDiv);
  
  // Mostra peers conectados
  let connectedCount = 0;
  for (const [userId, pc] of peerConnections) {
    if (pc.connectionState === 'connected') {
      connectedCount++;
      const userDiv = document.createElement('div');
      userDiv.className = 'voice-user';
      userDiv.innerHTML = `<span class="voice-indicator">●</span> ${userId.slice(0, 8)}`;
      voiceUsers.appendChild(userDiv);
    }
  }
  
  if (connectedCount === 0 && peerConnections.size === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'voice-empty';
    emptyDiv.textContent = 'Aguardando outros jogadores...';
    voiceUsers.appendChild(emptyDiv);
  }
}

// Toggle voice
voiceToggleBtn.addEventListener('click', toggleVoice);

// ============ FIM WEBRTC ============

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
  if (botCount > 0) { botCount--; document.getElementById('botCount').textContent = botCount; }
});
document.getElementById('botPlus').addEventListener('click', () => {
  if (botCount < 7) { botCount++; document.getElementById('botCount').textContent = botCount; }
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

// Chat texto
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

// Bot controls
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
    lobbyMessage.textContent = `🤖 ${bots.length} bot(s): ${bots.map(b => b.name).join(', ')}`;
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
  // Fecha conexão WebRTC se existir
  closePeerConnection(id);
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

  if (gameState.players) {
    for (const p of gameState.players) {
      ctx.fillStyle = p.color;
      ctx.fillRect(p.x * CELL + 1, p.y * CELL + 1, CELL - 2, CELL - 2);

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

      if (p.isBot) {
        ctx.fillStyle = '#fff';
        ctx.font = '10px Arial';
        ctx.textAlign = 'center';
        ctx.fillText('🤖', cx, cy - 12);
      }

      ctx.fillStyle = '#fff';
      ctx.font = 'bold 11px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(p.name || p.id.slice(0, 6), cx, cy + 22);
    }
  }

  document.getElementById('timer').textContent = `⏱ ${gameState.timeLeft ?? 0}`;

  scoreboard.innerHTML = '';
  const sorted = [...gameState.players].sort((a, b) => b.score - a.score);
  for (let i = 0; i < sorted.length; i++) {
    const p = sorted[i];
    const li = document.createElement('li');
    const botIcon = p.isBot ? '🤖 ' : '';
    li.innerHTML = `<span>${i + 1}º ${botIcon}${p.name || p.id.slice(0, 6)}: ${p.score}</span>`;
    li.style.color = p.color;
    if (p.id === playerId) li.classList.add('current-player');
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
  ctx.fillStyle = 'rgba(0,0,0,0.85)';
  ctx.fillRect(0, 0, 800, 600);
  ctx.fillStyle = '#e94560';
  ctx.font = 'bold 48px Arial';
  ctx.textAlign = 'center';
  ctx.fillText('🏆 FIM DE JOGO', 400, 120);
  
  const podiumEmojis = ['🥇', '🥈', '🥉'];
  
  for (let i = 0; i < Math.min(3, scores.length); i++) {
    const y = 200 + i * 80;
    ctx.fillStyle = 'rgba(255,255,255,0.1)';
    ctx.fillRect(200, y - 25, 400, 60);
    ctx.font = '30px Arial';
    ctx.fillText(podiumEmojis[i], 240, y + 10);
    ctx.fillStyle = scores[i].color;
    ctx.font = 'bold 22px Arial';
    ctx.fillText(`${scores[i].name || scores[i].id.slice(0, 6)} ${scores[i].isBot ? '🤖' : ''}`, 380, y + 5);
    ctx.fillStyle = '#fff';
    ctx.font = '20px Arial';
    ctx.fillText(`${scores[i].score} pts`, 560, y + 5);
  }
  
  for (let i = 3; i < scores.length; i++) {
    const y = 430 + (i - 3) * 35;
    ctx.fillStyle = scores[i].color;
    ctx.font = '16px Arial';
    ctx.fillText(`${i + 1}º ${scores[i].name || scores[i].id.slice(0, 6)} ${scores[i].isBot ? '🤖' : ''} – ${scores[i].score} pts`, 400, y);
  }
  
  ctx.fillStyle = '#aaa';
  ctx.font = '14px Arial';
  ctx.fillText('Nova partida em breve...', 400, 570);
}

// Limpeza ao fechar a página
window.addEventListener('beforeunload', () => {
  if (isVoiceActive) leaveVoice();
});
