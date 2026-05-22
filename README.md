
# 🐍 OpenSnake Multiplayer

Jogo multiplayer competitivo de cobra focado em pontuação. Jogue com amigos via navegador, com chat de texto, chat de voz e bots.

---

## 🎮 Como Jogar

**Objetivo**: Coma maçãs, faça pontos e vença a partida com o maior score.

| Controle | Ação |
|----------|------|
| `WASD` ou `Setas` | Movimentar a cobra |
| `Enter` | Enviar mensagem no chat |

**Regras**:
- Cada maçã comida = +1 ponto
- Bater na parede = reposiciona aleatoriamente (sem perder pontos)
- Sem colisão entre jogadores (foco total em pontuação)
- Partidas de 60 segundos
- Ranking ao vivo na tela
- Pódio no final de cada partida

---

## 🚀 Rodar Localmente

```bash
# Instalar dependências
npm install

# Iniciar servidor
npm start
```

Acesse: http://localhost:3000

---

🌐 Jogar Online (Render)

1. Crie conta em render.com
2. Conecte seu GitHub com este repositório
3. Crie um novo Web Service
4. Configure:
   · Build Command: npm install
   · Start Command: node server.js
5. Clique em Deploy

A URL será: https://opensnake-multiplayer.onrender.com

---

🎙️ Chat de Voz

· Clique em 🎙️ Entrar na sidebar
· Permita o acesso ao microfone
· Conexão P2P via WebRTC
· Funciona em LAN e internet

---

🤖 Bots

Adicione bots pelo seletor no lobby ou pelo botão ➕ Bot durante o jogo.

---

📁 Estrutura

```
opensnake-multiplayer/
├── server.js          # Servidor Node.js + Socket.io
├── package.json       # Dependências
├── .gitignore
└── public/
    ├── index.html     # Interface
    ├── client.js      # Frontend + WebRTC
    └── style.css      # Estilos
```

---

🛠️ Tecnologias

· Node.js + Express
· Socket.io (tempo real)
· WebRTC (chat de voz)
· Canvas HTML (renderização)

---

📝 Licença

MIT
