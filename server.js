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
const BOT_SPEED = 200;

const rooms = new Map();

const BOT_NAMES = [
  'PyBot', 'Cobra.NET', 'SnakeJS', 'Vibora.py', 'Slyder', 
  'Nagin', 'Kaa', 'SolidSnake', 'Anaconda', 'ByteBite',
  'Serpente', 'PixelViper', 'CodeCobra', 'DataNake'
];

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
  let attempts = 0;
  do {
    pos = randomCell();
    attempts++;
  } while (cellOccupied(room, pos.x, pos.y) && attempts < 100);
  room.apples.push(pos);
}

function spawnInitialApples(room, count = 5) {
  room.apples = [];
  for (let i = 0; i < count; i++) spawnApple(room);
}

function respawnPlayer(room, player) {
  let pos;
  let attempts = 0;
  do {
    pos = randomCell();
    attempts++;
  } while (cellOccupied(room, pos.x, pos.y) && attempts < 100);
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
  
  const appleCount = Math.max(5, room.players.size + 3);
  spawnInitialApples(room, appleCount);
  
  room.gameActive = true;
  room.startTime = Date.now();
  io.to(room.code).emit('roundStart', { duration: GAME_DURATION });
}

function endRound(room) {
  if (!room.gameActive) return;
  room.gameActive = false;
  if (room.restartTimeout) clearTimeout(room.restartTimeout);

  const scores = Array.from(room.players.values())
    .map(p => ({ id: p.id, name: p.name, score: p.score, color: p.color, isBot: p.isBot }))
    .sort((a, b) => b.score - a.score);

  io.to(room.code).emit('gameOver', { scores });
  room.restartTimeout = setTimeout(() => startRound(room), RESTART_DELAY);
}

function botDecision(room, bot) {
  let closestApple = null;
  let minDist = Infinity;
  
  for (const apple of room.apples) {
    const dist = Math.abs(apple.x - bot.x) + Math.abs(apple.y - bot.y);
    if (dist < minDist) {
      minDist = dist;
      closestApple = apple;
    }
  }

  const directions = ['up', 'down', 'left', 'right'];
  const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
  
  let chosenDir;
  
  if (closestApple && Math.random() < 0.7) {
    const dx = closestApple.x - bot.x;
    const dy = closestApple.y - bot.y;
    
    const possibleDirs = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) possibleDirs.push('right');
      if (dx < 0) possibleDirs.push('left');
      if (dy > 0) possibleDirs.push('down');
      if (dy < 0) possibleDirs.push('up');
    } else {
      if (dy > 0) possibleDirs.push('down');
      if (dy < 0) possibleDirs.push('up');
      if (dx > 0) possibleDirs.push('right');
      if (dx < 0) possibleDirs.push('left');
    }
    
    const validDirs = possibleDirs.filter(d => d !== opposites[bot.direction]);
    chosenDir = validDirs.length > 0 ? validDirs[0] : possibleDirs[0];
  } else {
    const validDirs = directions.filter(d => d !== opposites[bot.direction]);
    chosenDir = validDirs[Math.floor(Math.random() * validDirs.length)];
  }

  let nextX = bot.x;
  let nextY = bot.y;
  switch (chosenDir) {
    case 'up': nextY--; break;
    case 'down': nextY++; break;
    case 'left': nextX--; break;
    case 'right': nextX++; break;
  }

  if (nextX < 0 || nextX >= COLS || nextY < 0 || nextY >= ROWS) {
    const safeDirs = directions.filter(d => {
      let testX = bot.x;
      let testY = bot.y;
      switch (d) {
        case 'up': testY--; break;
        case 'down': testY++; break;
        case 'left': testX--; break;
        case 'right': testX++; break;
      }
      return testX >= 0 && testX < COLS && testY >= 0 && testY < ROWS;
    });
    chosenDir = safeDirs[Math.floor(Math.random() * safeDirs.length)] || 'right';
  }

  bot.direction = chosenDir;
}

function createBot(room) {
  const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const color = `hsl(${Math.floor(Math.random() * 360)}, 60%, 50%)`;
  
  const bot = {
    id: botId,
    name: botName,
    x: 0,
    y: 0,
    direction: 'right',
    score: 0,
    color,
    isBot: true,
    roomCode: room.code
  };
  
  room.players.set(botId, bot);
  respawnPlayer(room, bot);
  
  bot.interval = setInterval(() => {
    if (room.gameActive) botDecision(room, bot);
  }, BOT_SPEED + Math.random() * 100);
  
  return bot;
}

function removeBot(room, botId) {
  const bot = room.players.get(botId);
  if (bot && bot.interval) {
    clearInterval(bot.interval);
  }
  room.players.delete(botId);
}

function gameLoop() {
  for (const [code, room] of rooms) {
    if (!room.gameActive) continue;

    const elapsed = (Date.now() - room.startTime) / 1000;
    const timeLeft = Math.max(0, GAME_DURATION - elapsed);

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
      id: p.id,
      name: p.name || p.id.slice(0, 6),
      x: p.x,
      y: p.y,
      score: p.score,
      color: p.color,
      direction: p.direction,
      isBot: p.isBot || false
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
  socket.on('createRoom', (data = {}) => {
    const botCount = Math.min(7, Math.max(0, parseInt(data.botCount) || 0));
    const code = generateRoomCode();
    socket.join(code);
    
    const color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    const player = {
      id: socket.id,
      name: data.playerName || socket.id.slice(0, 6),
      x: 0,
      y: 0,
      direction: 'right',
      score: 0,
      color,
      isBot: false,
      roomCode: code
    };

    const room = {
      code,
      players: new Map([[socket.id, player]]),
      apples: [],
      gameActive: false,
      startTime: 0,
      restartTimeout: null,
      voiceUsers: new Set() // Usuários no chat de voz
    };
    rooms.set(code, room);
    respawnPlayer(room, player);

    const bots = [];
    for (let i = 0; i < botCount; i++) {
      const bot = createBot(room);
      bots.push({
        id: bot.id,
        name: bot.name,
        color: bot.color
      });
    }

    socket.emit('roomCreated', {
      code,
      playerId: socket.id,
      bots
    });
    
    startRound(room);
  });

  // Adicionar bot
  socket.on('addBot', () => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        const totalPlayers = room.players.size;
        if (totalPlayers >= 8) {
          socket.emit('error', 'Sala cheia (máx 8 jogadores)');
          return;
        }
        const bot = createBot(room);
        io.to(code).emit('playerJoined', {
          id: bot.id,
          name: bot.name,
          x: bot.x,
          y: bot.y,
          score: bot.score,
          color: bot.color,
          direction: bot.direction,
          isBot: true
        });
        break;
      }
    }
  });

  // Remover bot
  socket.on('removeBot', (botId) => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        const bot = room.players.get(botId);
        if (bot && bot.isBot) {
          removeBot(room, botId);
          io.to(code).emit('playerLeft', botId);
        }
        break;
      }
    }
  });

  // Entrar em sala
  socket.on('joinRoom', (data) => {
    const code = typeof data === 'string' ? data : data.code;
    const playerName = typeof data === 'object' ? data.playerName : null;
    
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
      name: playerName || socket.id.slice(0, 6),
      x: 0,
      y: 0,
      direction: 'right',
      score: 0,
      color,
      isBot: false,
      roomCode: code
    };
    room.players.set(socket.id, player);
    respawnPlayer(room, player);

    const playersData = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name || p.id.slice(0, 6),
      x: p.x,
      y: p.y,
      score: p.score,
      color: p.color,
      direction: p.direction,
      isBot: p.isBot || false
    }));

    socket.emit('joinedRoom', {
      code,
      playerId: socket.id,
      players: playersData,
      apples: room.apples,
      timeLeft: room.gameActive ? Math.ceil(GAME_DURATION - (Date.now() - room.startTime) / 1000) : 0
    });

    socket.to(code).emit('playerJoined', {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      score: player.score,
      color: player.color,
      direction: player.direction,
      isBot: false
    });
  });

  // ============ WEBRTC SINALIZAÇÃO ============
  
  // Usuário entrou no chat de voz
  socket.on('voice-join', () => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        room.voiceUsers.add(socket.id);
        socket.to(code).emit('voice-user-joined', socket.id);
        // Envia lista de usuários já no chat de voz
        const voiceUsers = Array.from(room.voiceUsers).filter(id => id !== socket.id);
        socket.emit('voice-users-list', voiceUsers);
        break;
      }
    }
  });

  // Usuário saiu do chat de voz
  socket.on('voice-leave', () => {
    for (const [code, room] of rooms) {
      if (room.voiceUsers.has(socket.id)) {
        room.voiceUsers.delete(socket.id);
        socket.to(code).emit('voice-user-left', socket.id);
        break;
      }
    }
  });

  // Oferta WebRTC
  socket.on('voice-offer', ({ to, offer }) => {
    console.log(`Encaminhando oferta de ${socket.id} para ${to}`);
    io.to(to).emit('voice-offer', {
      from: socket.id,
      offer
    });
  });

  // Resposta WebRTC
  socket.on('voice-answer', ({ to, answer }) => {
    console.log(`Encaminhando resposta de ${socket.id} para ${to}`);
    io.to(to).emit('voice-answer', {
      from: socket.id,
      answer
    });
  });

  // Candidato ICE
  socket.on('voice-ice-candidate', ({ to, candidate }) => {
    io.to(to).emit('voice-ice-candidate', {
      from: socket.id,
      candidate
    });
  });

  // ============ FIM WEBRTC ============

  // Controle de direção
  socket.on('direction', (dir) => {
    for (const [code, room] of rooms) {
      const p = room.players.get(socket.id);
      if (p && !p.isBot) {
        if (!room.gameActive) return;
        const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
        if (opposites[dir] !== p.direction) {
          p.direction = dir;
        }
        break;
      }
    }
  });

  // Chat texto
  socket.on('chat', (msg) => {
    for (const [code, room] of rooms) {
      const p = room.players.get(socket.id);
      if (p) {
        io.to(code).emit('chatMessage', {
          id: socket.id,
          name: p.name || socket.id.slice(0, 6),
          color: p.color,
          msg,
          isBot: false
        });
        break;
      }
    }
  });

  // Desconexão
  socket.on('disconnect', () => {
    console.log(`Jogador desconectado: ${socket.id}`);
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        
        // Sai do chat de voz
        if (room.voiceUsers.has(socket.id)) {
          room.voiceUsers.delete(socket.id);
          socket.to(code).emit('voice-user-left', socket.id);
        }
        
        if (!player.isBot) {
          room.players.delete(socket.id);
          socket.to(code).emit('playerLeft', socket.id);
        }
        
        if (room.players.size === 0) {
          if (room.gameActive) room.gameActive = false;
          if (room.restartTimeout) clearTimeout(room.restartTimeout);
          for (const p of room.players.values()) {
            if (p.isBot && p.interval) clearInterval(p.interval);
          }
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
  for (const apple of room.apples) {
    const dist = Math.abs(apple.x - bot.x) + Math.abs(apple.y - bot.y);
    if (dist < minDist) {
      minDist = dist;
      closestApple = apple;
    }
  }

  // Tenta ir na direção da maçã, mas com chance de movimento aleatório
  const directions = ['up', 'down', 'left', 'right'];
  const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
  
  let chosenDir;
  
  if (closestApple && Math.random() < 0.7) {
    // 70% chance de ir em direção à maçã
    const dx = closestApple.x - bot.x;
    const dy = closestApple.y - bot.y;
    
    const possibleDirs = [];
    if (Math.abs(dx) >= Math.abs(dy)) {
      if (dx > 0) possibleDirs.push('right');
      if (dx < 0) possibleDirs.push('left');
      if (dy > 0) possibleDirs.push('down');
      if (dy < 0) possibleDirs.push('up');
    } else {
      if (dy > 0) possibleDirs.push('down');
      if (dy < 0) possibleDirs.push('up');
      if (dx > 0) possibleDirs.push('right');
      if (dx < 0) possibleDirs.push('left');
    }
    
    // Remove direção oposta (evita bater em parede imediatamente)
    const validDirs = possibleDirs.filter(d => d !== opposites[bot.direction]);
    chosenDir = validDirs.length > 0 ? validDirs[0] : possibleDirs[0];
  } else {
    // 30% chance de movimento aleatório
    const validDirs = directions.filter(d => d !== opposites[bot.direction]);
    chosenDir = validDirs[Math.floor(Math.random() * validDirs.length)];
  }

  // Evita colisão com paredes no próximo movimento
  let nextX = bot.x;
  let nextY = bot.y;
  switch (chosenDir) {
    case 'up': nextY--; break;
    case 'down': nextY++; break;
    case 'left': nextX--; break;
    case 'right': nextX++; break;
  }

  if (nextX < 0 || nextX >= COLS || nextY < 0 || nextY >= ROWS) {
    // Se vai bater na parede, escolhe uma direção segura
    const safeDirs = directions.filter(d => {
      let testX = bot.x;
      let testY = bot.y;
      switch (d) {
        case 'up': testY--; break;
        case 'down': testY++; break;
        case 'left': testX--; break;
        case 'right': testX++; break;
      }
      return testX >= 0 && testX < COLS && testY >= 0 && testY < ROWS;
    });
    chosenDir = safeDirs[Math.floor(Math.random() * safeDirs.length)] || 'right';
  }

  bot.direction = chosenDir;
}

function createBot(room) {
  const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
  const botName = BOT_NAMES[Math.floor(Math.random() * BOT_NAMES.length)];
  const color = `hsl(${Math.floor(Math.random() * 360)}, 60%, 50%)`;
  
  const bot = {
    id: botId,
    name: botName,
    x: 0,
    y: 0,
    direction: 'right',
    score: 0,
    color,
    isBot: true,
    roomCode: room.code
  };
  
  room.players.set(botId, bot);
  respawnPlayer(room, bot);
  
  // Timer individual do bot
  bot.interval = setInterval(() => {
    if (room.gameActive) botDecision(room, bot);
  }, BOT_SPEED + Math.random() * 100); // Pequena variação para parecer mais natural
  
  return bot;
}

function removeBot(room, botId) {
  const bot = room.players.get(botId);
  if (bot && bot.interval) {
    clearInterval(bot.interval);
  }
  room.players.delete(botId);
}

function gameLoop() {
  for (const [code, room] of rooms) {
    if (!room.gameActive) continue;

    const elapsed = (Date.now() - room.startTime) / 1000;
    const timeLeft = Math.max(0, GAME_DURATION - elapsed);

    // Movimentação de todos os jogadores
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

    // Colisão com maçãs
    for (const player of room.players.values()) {
      for (let i = room.apples.length - 1; i >= 0; i--) {
        if (player.x === room.apples[i].x && player.y === room.apples[i].y) {
          room.apples.splice(i, 1);
          player.score++;
          spawnApple(room);
        }
      }
    }

    // Envia estado para todos (bots também são incluídos)
    const playersData = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name || p.id.slice(0, 6),
      x: p.x,
      y: p.y,
      score: p.score,
      color: p.color,
      direction: p.direction,
      isBot: p.isBot || false
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

  // Criar sala com opção de bots
  socket.on('createRoom', (data = {}) => {
    const botCount = Math.min(7, Math.max(0, parseInt(data.botCount) || 0));
    const code = generateRoomCode();
    socket.join(code);
    
    const color = `hsl(${Math.floor(Math.random() * 360)}, 70%, 60%)`;
    const player = {
      id: socket.id,
      name: data.playerName || socket.id.slice(0, 6),
      x: 0,
      y: 0,
      direction: 'right',
      score: 0,
      color,
      isBot: false,
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

    // Adiciona bots
    const bots = [];
    for (let i = 0; i < botCount; i++) {
      const bot = createBot(room);
      bots.push({
        id: bot.id,
        name: bot.name,
        color: bot.color
      });
    }

    socket.emit('roomCreated', {
      code,
      playerId: socket.id,
      bots
    });
    
    startRound(room);
  });

  // Adicionar bot durante o jogo
  socket.on('addBot', () => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        const totalPlayers = room.players.size;
        if (totalPlayers >= 8) {
          socket.emit('error', 'Sala cheia (máx 8 jogadores)');
          return;
        }
        const bot = createBot(room);
        io.to(code).emit('playerJoined', {
          id: bot.id,
          name: bot.name,
          x: bot.x,
          y: bot.y,
          score: bot.score,
          color: bot.color,
          direction: bot.direction,
          isBot: true
        });
        break;
      }
    }
  });

  // Remover bot específico
  socket.on('removeBot', (botId) => {
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        const bot = room.players.get(botId);
        if (bot && bot.isBot) {
          removeBot(room, botId);
          io.to(code).emit('playerLeft', botId);
        }
        break;
      }
    }
  });

  // Entrar em sala
  socket.on('joinRoom', (data) => {
    const code = typeof data === 'string' ? data : data.code;
    const playerName = typeof data === 'object' ? data.playerName : null;
    
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
      name: playerName || socket.id.slice(0, 6),
      x: 0,
      y: 0,
      direction: 'right',
      score: 0,
      color,
      isBot: false,
      roomCode: code
    };
    room.players.set(socket.id, player);
    respawnPlayer(room, player);

    const playersData = Array.from(room.players.values()).map(p => ({
      id: p.id,
      name: p.name || p.id.slice(0, 6),
      x: p.x,
      y: p.y,
      score: p.score,
      color: p.color,
      direction: p.direction,
      isBot: p.isBot || false
    }));

    socket.emit('joinedRoom', {
      code,
      playerId: socket.id,
      players: playersData,
      apples: room.apples,
      timeLeft: room.gameActive ? Math.ceil(GAME_DURATION - (Date.now() - room.startTime) / 1000) : 0
    });

    socket.to(code).emit('playerJoined', {
      id: player.id,
      name: player.name,
      x: player.x,
      y: player.y,
      score: player.score,
      color: player.color,
      direction: player.direction,
      isBot: false
    });
  });

  // Controle de direção
  socket.on('direction', (dir) => {
    for (const [code, room] of rooms) {
      const p = room.players.get(socket.id);
      if (p && !p.isBot) {
        if (!room.gameActive) return;
        const opposites = { up: 'down', down: 'up', left: 'right', right: 'left' };
        if (opposites[dir] !== p.direction) {
          p.direction = dir;
        }
        break;
      }
    }
  });

  // Chat
  socket.on('chat', (msg) => {
    for (const [code, room] of rooms) {
      const p = room.players.get(socket.id);
      if (p) {
        io.to(code).emit('chatMessage', {
          id: socket.id,
          name: p.name || socket.id.slice(0, 6),
          color: p.color,
          msg,
          isBot: false
        });
        break;
      }
    }
  });

  socket.on('disconnect', () => {
    console.log(`Jogador desconectado: ${socket.id}`);
    for (const [code, room] of rooms) {
      if (room.players.has(socket.id)) {
        const player = room.players.get(socket.id);
        if (!player.isBot) {
          room.players.delete(socket.id);
          socket.to(code).emit('playerLeft', socket.id);
        }
        if (room.players.size === 0) {
          if (room.gameActive) room.gameActive = false;
          if (room.restartTimeout) clearTimeout(room.restartTimeout);
          // Limpa intervalos dos bots
          for (const p of room.players.values()) {
            if (p.isBot && p.interval) clearInterval(p.interval);
          }
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
