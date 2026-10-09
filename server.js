const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');
const os = require('os');
const QRCode = require('qrcode');
const fs = require('fs');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: { origin: '*' }
});

const PORT = process.env.PORT || 3000;

// Load questions
const questionsPath = path.join(__dirname, 'questions.json');
let questionDeck = [];
try {
  questionDeck = JSON.parse(fs.readFileSync(questionsPath, 'utf8'));
} catch (err) {
  console.error('Error loading questions:', err);
  questionDeck = [];
}

// Find local IPv4 address
function getLocalIp() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const LOCAL_IP = getLocalIp();

// Serve static assets
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

// API Info endpoint
app.get('/api/info', async (req, res) => {
  const room = req.query.room || '';
  const joinUrl = `http://${LOCAL_IP}:${PORT}${room ? `?room=${room}` : ''}`;
  let qrCodeData = '';
  try {
    qrCodeData = await QRCode.toDataURL(joinUrl, {
      margin: 1,
      width: 250,
      color: {
        dark: '#0f172a',
        light: '#ffffff'
      }
    });
  } catch (err) {
    console.error('QR Generation error:', err);
  }
  res.json({
    ip: LOCAL_IP,
    port: PORT,
    joinUrl,
    qrCode: qrCodeData
  });
});

// Helper: Generate 4-letter room code
function generateRoomCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

// Helper: Shuffle array
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

// Bot personalities
const BOT_NAMES = [
  { name: '🤖 LieBot 3000', avatar: '🤖', color: '#ec4899' },
  { name: '🦊 Foxy Faker', avatar: '🦊', color: '#f97316' },
  { name: '🎩 Baron Bluff', avatar: '🎩', color: '#8b5cf6' },
  { name: '👾 Glitchy Gary', avatar: '👾', color: '#06b6d4' }
];

// Room storage
const rooms = new Map();

class Room {
  constructor(code, hostSocketId) {
    this.code = code;
    this.hostSocketId = hostSocketId;
    this.players = new Map(); // id -> { id, name, avatar, color, score, streak, isBot, isHost, connected }
    this.gameState = 'LOBBY'; // LOBBY, QUESTION, VOTING, REVEAL, LEADERBOARD, GAME_OVER
    this.currentRound = 0;
    this.totalRounds = 3;
    this.usedQuestionIds = new Set();
    this.currentQuestion = null;
    this.submissions = new Map(); // playerId -> { text, isBot }
    this.shuffledOptions = []; // [ { id, text, authorId, authorName, isTruth } ]
    this.votes = new Map(); // playerId -> optionId
    this.roundResults = null;
    this.revealStep = 0;
    this.timer = 0;
    this.timerInterval = null;
  }

  addPlayer(id, name, avatar, color, isHost = false, isBot = false) {
    const player = {
      id,
      name: name.trim().slice(0, 16),
      avatar: avatar || '😎',
      color: color || '#6366f1',
      score: 0,
      streak: 0,
      roundPoints: 0,
      isHost,
      isBot,
      connected: true
    };
    this.players.set(id, player);
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    this.submissions.delete(id);
    this.votes.delete(id);
  }

  getPlayersList() {
    return Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      score: p.score,
      streak: p.streak,
      roundPoints: p.roundPoints,
      isHost: p.isHost,
      isBot: p.isBot,
      connected: p.connected,
      hasSubmitted: this.submissions.has(p.id),
      hasVoted: this.votes.has(p.id)
    }));
  }

  startTimer(duration, onTick, onComplete) {
    this.clearTimer();
    this.timer = duration;
    if (onTick) onTick(this.timer);

    this.timerInterval = setInterval(() => {
      this.timer--;
      if (onTick) onTick(this.timer);

      if (this.timer <= 0) {
        this.clearTimer();
        if (onComplete) onComplete();
      }
    }, 1000);
  }

  clearTimer() {
    if (this.timerInterval) {
      clearInterval(this.timerInterval);
      this.timerInterval = null;
    }
  }

  getNextQuestion() {
    const available = questionDeck.filter(q => !this.usedQuestionIds.has(q.id));
    const deck = available.length > 0 ? available : questionDeck;
    const q = deck[Math.floor(Math.random() * deck.length)];
    this.usedQuestionIds.add(q.id);
    return q;
  }

  startQuestionRound() {
    this.currentRound++;
    this.gameState = 'QUESTION';
    this.submissions.clear();
    this.votes.clear();
    this.shuffledOptions = [];
    this.roundResults = null;
    this.currentQuestion = this.getNextQuestion();

    // Reset roundPoints
    for (const p of this.players.values()) {
      p.roundPoints = 0;
    }

    // Schedule bots to submit bluffs
    for (const p of this.players.values()) {
      if (p.isBot) {
        const delay = 2000 + Math.random() * 4000;
        setTimeout(() => {
          if (this.gameState === 'QUESTION' && !this.submissions.has(p.id)) {
            // Pick from house bluffs
            const availableBluffs = this.currentQuestion.houseBluffs || ['something weird', 'a mystery'];
            const botBluff = availableBluffs[Math.floor(Math.random() * availableBluffs.length)];
            this.submitBluff(p.id, botBluff);
          }
        }, delay);
      }
    }
  }

  submitBluff(playerId, text) {
    if (this.gameState !== 'QUESTION') return false;
    const trimmed = (text || '').trim().toLowerCase();
    const truthClean = this.currentQuestion.answer.toLowerCase();

    // If answer is too close or exact truth, reject or warn player
    if (trimmed === truthClean || (trimmed.length > 3 && truthClean.includes(trimmed))) {
      return { error: "That's too close to the REAL TRUTH! Try making up a lie." };
    }

    this.submissions.set(playerId, {
      text: text.trim(),
      isBot: this.players.get(playerId)?.isBot || false
    });

    return { success: true };
  }

  checkAllSubmissions() {
    const activePlayers = Array.from(this.players.values()).filter(p => p.connected);
    return activePlayers.every(p => this.submissions.has(p.id));
  }

  buildVotingOptions() {
    this.gameState = 'VOTING';
    const options = [];

    // Add the Real Truth
    options.push({
      id: 'truth',
      text: this.currentQuestion.answer,
      authorId: 'TRUTH',
      authorName: 'The Real Truth',
      isTruth: true
    });

    // Add each player's bluff
    for (const [playerId, sub] of this.submissions.entries()) {
      const player = this.players.get(playerId);
      if (player) {
        options.push({
          id: `bluff_${playerId}`,
          text: sub.text,
          authorId: playerId,
          authorName: player.name,
          isTruth: false
        });
      }
    }

    // If fewer than 4 choices, fill with House Bluffs
    let houseIndex = 0;
    const houseBluffs = this.currentQuestion.houseBluffs || [];
    while (options.length < 4 && houseIndex < houseBluffs.length) {
      const bluffText = houseBluffs[houseIndex];
      // Check if not already in options
      if (!options.some(o => o.text.toLowerCase() === bluffText.toLowerCase())) {
        options.push({
          id: `house_${houseIndex}`,
          text: bluffText,
          authorId: 'HOUSE',
          authorName: 'House Lie',
          isTruth: false
        });
      }
      houseIndex++;
    }

    this.shuffledOptions = shuffle(options);

    // Schedule bots to vote
    for (const p of this.players.values()) {
      if (p.isBot) {
        const delay = 3000 + Math.random() * 5000;
        setTimeout(() => {
          if (this.gameState === 'VOTING' && !this.votes.has(p.id)) {
            // Pick any option that isn't their own
            const validOptions = this.shuffledOptions.filter(o => o.authorId !== p.id);
            if (validOptions.length > 0) {
              const pick = validOptions[Math.floor(Math.random() * validOptions.length)];
              this.submitVote(p.id, pick.id);
            }
          }
        }, delay);
      }
    }
  }

  submitVote(playerId, optionId) {
    if (this.gameState !== 'VOTING') return false;

    // Prevent voting for own bluff
    const option = this.shuffledOptions.find(o => o.id === optionId);
    if (option && option.authorId === playerId) {
      return { error: "You can't vote for your own lie!" };
    }

    this.votes.set(playerId, optionId);
    return { success: true };
  }

  checkAllVotes() {
    const activePlayers = Array.from(this.players.values()).filter(p => p.connected);
    return activePlayers.every(p => this.votes.has(p.id));
  }

  calculateScores() {
    this.gameState = 'REVEAL';
    const isFinalRound = this.currentRound === this.totalRounds;
    const multiplier = isFinalRound ? 2 : 1;

    // Tally votes for each option
    const optionTally = this.shuffledOptions.map(option => {
      const voters = [];
      for (const [voterId, chosenOptionId] of this.votes.entries()) {
        if (chosenOptionId === option.id) {
          const voter = this.players.get(voterId);
          if (voter) voters.push(voter);
        }
      }
      return {
        ...option,
        voters: voters.map(v => ({ id: v.id, name: v.name, avatar: v.avatar, color: v.color }))
      };
    });

    // Score calculations
    for (const opt of optionTally) {
      if (opt.isTruth) {
        // Truth: each voter gets +1,000 * multiplier
        for (const voterData of opt.voters) {
          const player = this.players.get(voterData.id);
          if (player) {
            const pts = 1000 * multiplier;
            player.roundPoints += pts;
            player.score += pts;
            player.streak += 1;
            // Streak bonus
            if (player.streak >= 2) {
              const bonus = 250 * multiplier;
              player.roundPoints += bonus;
              player.score += bonus;
            }
          }
        }
      } else if (opt.authorId !== 'HOUSE') {
        // Player Bluff: Author gets +500 * multiplier per voter fooled!
        const author = this.players.get(opt.authorId);
        if (author) {
          const pts = opt.voters.length * 500 * multiplier;
          author.roundPoints += pts;
          author.score += pts;
        }
      }
    }

    // Reset streaks for players who didn't vote truth
    for (const [playerId, optId] of this.votes.entries()) {
      const chosenOpt = this.shuffledOptions.find(o => o.id === optId);
      if (!chosenOpt || !chosenOpt.isTruth) {
        const player = this.players.get(playerId);
        if (player) player.streak = 0;
      }
    }

    this.roundResults = {
      isFinalRound,
      multiplier,
      options: optionTally,
      leaderboard: this.getLeaderboard()
    };
  }

  getLeaderboard() {
    const list = Array.from(this.players.values()).map(p => ({
      id: p.id,
      name: p.name,
      avatar: p.avatar,
      color: p.color,
      score: p.score,
      streak: p.streak,
      roundPoints: p.roundPoints,
      isBot: p.isBot
    }));
    list.sort((a, b) => b.score - a.score);
    return list;
  }
}

// Socket handler
io.on('connection', socket => {
  let currentRoom = null;
  let currentPlayerId = null;

  // 1. Create room
  socket.on('create_room', ({ playerName, avatar, color, isHostOnly }, callback) => {
    let code = generateRoomCode();
    while (rooms.has(code)) {
      code = generateRoomCode();
    }

    const room = new Room(code, socket.id);
    rooms.set(code, room);
    currentRoom = room;
    socket.join(code);

    let player = null;
    if (!isHostOnly) {
      player = room.addPlayer(socket.id, playerName || 'Host Player', avatar || '👑', color || '#6366f1', true);
      currentPlayerId = socket.id;
    }

    callback({
      success: true,
      roomCode: code,
      player,
      isHost: true,
      joinUrl: `http://${LOCAL_IP}:${PORT}?room=${code}`
    });

    broadcastRoomState(room);
  });

  // 2. Join room
  socket.on('join_room', ({ roomCode, playerName, avatar, color }, callback) => {
    const code = (roomCode || '').toUpperCase().trim();
    const room = rooms.get(code);

    if (!room) {
      return callback({ error: 'Room not found! Check the 4-letter room code.' });
    }

    if (room.gameState !== 'LOBBY') {
      return callback({ error: 'Game is already in progress! Please wait for the next round.' });
    }

    if (room.players.size >= 8) {
      return callback({ error: 'Room is full (max 8 players)!' });
    }

    currentRoom = room;
    currentPlayerId = socket.id;
    socket.join(code);

    const player = room.addPlayer(socket.id, playerName || 'Bluffer', avatar || '🕵️', color || '#ec4899', false);

    callback({
      success: true,
      roomCode: code,
      player,
      isHost: room.hostSocketId === socket.id,
      joinUrl: `http://${LOCAL_IP}:${PORT}?room=${code}`
    });

    broadcastRoomState(room);
  });

  // 3. Add AI / Bot Player
  socket.on('add_bot', (data, callback) => {
    if (!currentRoom) return;
    if (currentRoom.players.size >= 8) {
      if (callback) callback({ error: 'Room is full!' });
      return;
    }

    const existingBotCount = Array.from(currentRoom.players.values()).filter(p => p.isBot).length;
    const botTemplate = BOT_NAMES[existingBotCount % BOT_NAMES.length];
    const botId = `bot_${Date.now()}_${Math.random().toString(36).substr(2, 4)}`;

    currentRoom.addPlayer(botId, botTemplate.name, botTemplate.avatar, botTemplate.color, false, true);

    if (callback) callback({ success: true });
    broadcastRoomState(currentRoom);
  });

  // 4. Start Game
  socket.on('start_game', () => {
    if (!currentRoom) return;
    if (currentRoom.players.size < 2) {
      socket.emit('toast', { message: 'You need at least 2 players to start! Click "Add Bot" to test solo.' });
      return;
    }

    startRoundFlow(currentRoom);
  });

  // 5. Submit Bluff
  socket.on('submit_bluff', ({ text }, callback) => {
    if (!currentRoom || !currentPlayerId) return;
    const res = currentRoom.submitBluff(currentPlayerId, text);
    if (callback) callback(res);

    broadcastRoomState(currentRoom);

    // If everyone submitted, proceed early!
    if (currentRoom.checkAllSubmissions()) {
      currentRoom.clearTimer();
      startVotingFlow(currentRoom);
    }
  });

  // 6. Submit Vote
  socket.on('submit_vote', ({ optionId }, callback) => {
    if (!currentRoom || !currentPlayerId) return;
    const res = currentRoom.submitVote(currentPlayerId, optionId);
    if (callback) callback(res);

    broadcastRoomState(currentRoom);

    // If everyone voted, proceed early!
    if (currentRoom.checkAllVotes()) {
      currentRoom.clearTimer();
      startRevealFlow(currentRoom);
    }
  });

  // 7. Next Question or Play Again
  socket.on('next_round', () => {
    if (!currentRoom) return;
    if (currentRoom.currentRound >= currentRoom.totalRounds) {
      currentRoom.gameState = 'GAME_OVER';
      broadcastRoomState(currentRoom);
    } else {
      startRoundFlow(currentRoom);
    }
  });

  socket.on('play_again', () => {
    if (!currentRoom) return;
    currentRoom.gameState = 'LOBBY';
    currentRoom.currentRound = 0;
    currentRoom.usedQuestionIds.clear();
    for (const p of currentRoom.players.values()) {
      p.score = 0;
      p.streak = 0;
      p.roundPoints = 0;
    }
    broadcastRoomState(currentRoom);
  });

  // Disconnect
  socket.on('disconnect', () => {
    if (currentRoom && currentPlayerId) {
      const player = currentRoom.players.get(currentPlayerId);
      if (player) {
        player.connected = false;
        // If room is empty of humans, cleanup after 5 min
        const humans = Array.from(currentRoom.players.values()).filter(p => !p.isBot && p.connected);
        if (humans.length === 0) {
          setTimeout(() => {
            const h = Array.from(currentRoom.players.values()).filter(p => !p.isBot && p.connected);
            if (h.length === 0) {
              currentRoom.clearTimer();
              rooms.delete(currentRoom.code);
            }
          }, 60000);
        }
      }
      broadcastRoomState(currentRoom);
    }
  });
});

// Flow controllers
function startRoundFlow(room) {
  room.startQuestionRound();
  broadcastRoomState(room);

  // 35s timer for writing bluff
  room.startTimer(35, (remaining) => {
    io.to(room.code).emit('timer_tick', { remaining, total: 35 });
  }, () => {
    // If time runs out, auto-fill missing with house bluffs
    for (const p of room.players.values()) {
      if (!room.submissions.has(p.id)) {
        const availableBluffs = room.currentQuestion.houseBluffs || ['I panicked!'];
        const fallback = availableBluffs[Math.floor(Math.random() * availableBluffs.length)];
        room.submissions.set(p.id, { text: fallback, isBot: false });
      }
    }
    startVotingFlow(room);
  });
}

function startVotingFlow(room) {
  room.buildVotingOptions();
  broadcastRoomState(room);

  // 25s timer for voting
  room.startTimer(25, (remaining) => {
    io.to(room.code).emit('timer_tick', { remaining, total: 25 });
  }, () => {
    startRevealFlow(room);
  });
}

function startRevealFlow(room) {
  room.calculateScores();
  broadcastRoomState(room);

  // Auto transition to leaderboard after 15s or host can skip
  room.startTimer(15, (remaining) => {
    io.to(room.code).emit('timer_tick', { remaining, total: 15 });
  }, () => {
    if (room.currentRound >= room.totalRounds) {
      room.gameState = 'GAME_OVER';
    } else {
      room.gameState = 'LEADERBOARD';
    }
    broadcastRoomState(room);
  });
}

function broadcastRoomState(room) {
  if (!room) return;
  const statePayload = {
    code: room.code,
    gameState: room.gameState,
    currentRound: room.currentRound,
    totalRounds: room.totalRounds,
    players: room.getPlayersList(),
    currentQuestion: room.currentQuestion ? {
      category: room.currentQuestion.category,
      prompt: room.currentQuestion.prompt
    } : null,
    shuffledOptions: room.shuffledOptions.map(o => ({
      id: o.id,
      text: o.text,
      authorId: o.authorId
    })),
    roundResults: room.roundResults,
    leaderboard: room.getLeaderboard(),
    timer: room.timer
  };

  io.to(room.code).emit('room_update', statePayload);
}

// Start server
server.listen(PORT, '0.0.0.0', () => {
  console.log(`===============================================`);
  console.log(`🚀 Bluff Party Multiplayer Game is running!`);
  console.log(`📡 Local:   http://localhost:${PORT}`);
  console.log(`📱 Network: http://${LOCAL_IP}:${PORT}`);
  console.log(`===============================================`);
});
