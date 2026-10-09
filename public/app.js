// Bluff Party Client Application
(function () {
  'use strict';

  // Available player avatars
  const AVATARS = [
    { emoji: '🕵️', color: '#6366f1' },
    { emoji: '🦊', color: '#f97316' },
    { emoji: '👑', color: '#eab308' },
    { emoji: '🦄', color: '#ec4899' },
    { emoji: '🚀', color: '#06b6d4' },
    { emoji: '🎭', color: '#8b5cf6' },
    { emoji: '👻', color: '#a855f7' },
    { emoji: '🍕', color: '#ef4444' },
    { emoji: '🤖', color: '#10b981' },
    { emoji: '🦁', color: '#f59e0b' },
    { emoji: '⚡', color: '#3b82f6' },
    { emoji: '🐙', color: '#14b8a6' }
  ];

  // Client State
  let socket = null;
  let currentRoomCode = null;
  let myPlayerId = null;
  let isHost = false;
  let selectedAvatar = AVATARS[0];
  let currentQuestion = null;
  let myBluffSubmitted = false;
  let myVoteSubmitted = false;
  let currentVotesCount = 0;
  let previousScores = new Map();

  // DOM Elements
  const screens = {
    landing: document.getElementById('screen-landing'),
    lobby: document.getElementById('screen-lobby'),
    question: document.getElementById('screen-question'),
    voting: document.getElementById('screen-voting'),
    reveal: document.getElementById('screen-reveal'),
    leaderboard: document.getElementById('screen-leaderboard'),
    gameover: document.getElementById('screen-gameover')
  };

  const tabs = {
    join: document.getElementById('tab-join'),
    create: document.getElementById('tab-create')
  };
  const formContainers = {
    join: document.getElementById('join-form-container'),
    create: document.getElementById('create-form-container')
  };

  // Sound Buttons
  const btnMusic = document.getElementById('btn-music');
  const btnSound = document.getElementById('btn-sound');
  const btnHowToPlay = document.getElementById('btn-how-to-play');
  const modalHowToPlay = document.getElementById('modal-how-to-play');
  const btnCloseModal = document.getElementById('btn-close-modal');
  const btnModalGotIt = document.getElementById('btn-modal-got-it');

  // Initialize Socket
  function initSocket() {
    socket = io();

    socket.on('connect', () => {
      myPlayerId = socket.id;
    });

    socket.on('room_update', (roomState) => {
      handleRoomUpdate(roomState);
    });

    socket.on('timer_tick', ({ remaining, total }) => {
      handleTimerTick(remaining, total);
    });

    socket.on('toast', ({ message }) => {
      showToast(message);
    });
  }

  // Switch Active Screen View
  function showScreen(name) {
    Object.keys(screens).forEach((key) => {
      if (screens[key]) {
        screens[key].style.display = key === name ? 'block' : 'none';
      }
    });
  }

  // Render Avatar Selectors
  function renderAvatarSelectors() {
    ['avatar-grid-join', 'avatar-grid-create'].forEach((gridId) => {
      const grid = document.getElementById(gridId);
      if (!grid) return;
      grid.innerHTML = '';

      AVATARS.forEach((av, idx) => {
        const chip = document.createElement('div');
        chip.className = `avatar-chip ${idx === 0 ? 'selected' : ''}`;
        chip.textContent = av.emoji;
        chip.dataset.index = idx;

        chip.addEventListener('click', () => {
          if (window.soundEngine) window.soundEngine.click();
          grid.querySelectorAll('.avatar-chip').forEach((c) => c.classList.remove('selected'));
          chip.classList.add('selected');
          selectedAvatar = av;
        });

        grid.appendChild(chip);
      });
    });
  }

  // Handle URL Parameters (e.g. ?room=ABCD)
  function handleUrlParams() {
    const params = new URLSearchParams(window.location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      const codeInput = document.getElementById('input-room-code');
      if (codeInput) {
        codeInput.value = roomFromUrl.toUpperCase();
        document.getElementById('input-player-name')?.focus();
      }
    }
  }

  // Setup Event Listeners
  function setupEvents() {
    // Tab switching
    tabs.join?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      tabs.join.classList.add('active');
      tabs.create.classList.remove('active');
      formContainers.join.style.display = 'block';
      formContainers.create.style.display = 'none';
    });

    tabs.create?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      tabs.create.classList.add('active');
      tabs.join.classList.remove('active');
      formContainers.create.style.display = 'block';
      formContainers.join.style.display = 'none';
    });

    // Sound and Beats buttons
    btnSound?.addEventListener('click', () => {
      if (!window.soundEngine) return;
      const isMuted = window.soundEngine.toggleMute();
      btnSound.textContent = isMuted ? '🔇' : '🔊';
      showToast(isMuted ? 'Sound FX Muted' : 'Sound FX Unmuted');
    });

    btnMusic?.addEventListener('click', () => {
      if (!window.soundEngine) return;
      const playing = window.soundEngine.toggleLobbyBeat();
      btnMusic.textContent = playing ? '⏸️' : '🎵';
      showToast(playing ? 'Party Beats Started 🎶' : 'Party Beats Stopped');
    });

    // Modal
    btnHowToPlay?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      modalHowToPlay?.showModal();
    });
    btnCloseModal?.addEventListener('click', () => modalHowToPlay?.close());
    btnModalGotIt?.addEventListener('click', () => modalHowToPlay?.close());

    // Join Form Submit
    document.getElementById('form-join')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (window.soundEngine) window.soundEngine.click();

      const roomCode = document.getElementById('input-room-code')?.value.toUpperCase().trim();
      const playerName = document.getElementById('input-player-name')?.value.trim();

      if (!roomCode || !playerName) return;

      socket.emit(
        'join_room',
        {
          roomCode,
          playerName,
          avatar: selectedAvatar.emoji,
          color: selectedAvatar.color
        },
        (res) => {
          if (res.error) {
            showToast(res.error, 'error');
          } else {
            currentRoomCode = res.roomCode;
            isHost = res.isHost;
            myPlayerId = socket.id;
            loadLobbyQr(currentRoomCode);
            showScreen('lobby');
            showToast(`Joined Room ${currentRoomCode}!`);
            if (window.soundEngine) window.soundEngine.playerJoined();
          }
        }
      );
    });

    // Create Form Submit
    document.getElementById('form-create')?.addEventListener('submit', (e) => {
      e.preventDefault();
      if (window.soundEngine) window.soundEngine.click();

      const hostName = document.getElementById('input-host-name')?.value.trim();
      const isHostOnly = document.getElementById('check-host-only')?.checked;

      socket.emit(
        'create_room',
        {
          playerName: hostName || 'Host',
          avatar: selectedAvatar.emoji,
          color: selectedAvatar.color,
          isHostOnly: !!isHostOnly
        },
        (res) => {
          if (res.error) {
            showToast(res.error, 'error');
          } else {
            currentRoomCode = res.roomCode;
            isHost = true;
            myPlayerId = socket.id;
            loadLobbyQr(currentRoomCode);
            showScreen('lobby');
            showToast(`Room ${currentRoomCode} created!`);
            if (window.soundEngine) window.soundEngine.playerJoined();
          }
        }
      );
    });

    // Copy Join Link
    document.getElementById('btn-copy-link')?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      const link = `${window.location.origin}?room=${currentRoomCode}`;
      navigator.clipboard
        .writeText(link)
        .then(() => {
          showToast('🔗 Room link copied to clipboard!');
        })
        .catch(() => {
          showToast(`Share Code: ${currentRoomCode}`);
        });
    });

    // Add Bot Player
    document.getElementById('btn-add-bot')?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      socket.emit('add_bot', {}, (res) => {
        if (res && res.error) showToast(res.error, 'error');
      });
    });

    // Start Game
    document.getElementById('btn-start-game')?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      socket.emit('start_game');
    });

    // Input Bluff char counter
    const inputBluff = document.getElementById('input-bluff');
    const bluffCounter = document.getElementById('bluff-char-count');
    inputBluff?.addEventListener('input', () => {
      if (bluffCounter) bluffCounter.textContent = `${inputBluff.value.length}/60`;
    });

    // Bluff Inspiration helper
    document.getElementById('btn-bluff-inspire')?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      const funnyIdeas = [
        'crushed diamond dust',
        'fermented pickle juice',
        'solid tungsten bricks',
        'underwater bagpipes',
        'laser-guided poodles',
        'frozen mayonnaise balls',
        'electric socks',
        'glow-in-the-dark cheese'
      ];
      const pick = funnyIdeas[Math.floor(Math.random() * funnyIdeas.length)];
      if (inputBluff) {
        inputBluff.value = pick;
        if (bluffCounter) bluffCounter.textContent = `${pick.length}/60`;
        inputBluff.focus();
      }
    });

    // Submit Bluff
    document.getElementById('btn-submit-bluff')?.addEventListener('click', () => {
      if (!inputBluff) return;
      const text = inputBluff.value.trim();
      if (!text) {
        showToast('Please type a lie first!', 'warning');
        return;
      }

      if (window.soundEngine) window.soundEngine.submitWhoosh();

      socket.emit('submit_bluff', { text }, (res) => {
        if (res && res.error) {
          showToast(res.error, 'error');
        } else {
          myBluffSubmitted = true;
          document.getElementById('bluff-submit-area').style.display = 'none';
          document.getElementById('bluff-waiting-area').style.display = 'block';
          const preview = document.getElementById('bluff-submitted-preview');
          if (preview) preview.innerHTML = `Your Lie: <strong style="color: var(--secondary)">"${text}"</strong>`;
        }
      });
    });

    // Skip reveal / Next
    document.getElementById('btn-skip-reveal')?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      socket.emit('next_round');
    });

    // Next Round from leaderboard
    document.getElementById('btn-next-round')?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      socket.emit('next_round');
    });

    // Play Again
    document.getElementById('btn-play-again')?.addEventListener('click', () => {
      if (window.soundEngine) window.soundEngine.click();
      socket.emit('play_again');
    });

    // Return Home
    document.getElementById('btn-home')?.addEventListener('click', () => {
      window.location.href = window.location.origin;
    });
  }

  // Load QR code from backend API
  function loadLobbyQr(roomCode) {
    const qrBox = document.getElementById('lobby-qr-box');
    const codeDisplay = document.getElementById('lobby-room-code');
    if (codeDisplay) codeDisplay.textContent = roomCode;

    fetch(`/api/info?room=${roomCode}`)
      .then((res) => res.json())
      .then((data) => {
        if (qrBox && data.qrCode) {
          qrBox.innerHTML = `<img src="${data.qrCode}" alt="Scan QR to join room ${roomCode}">`;
        }
      })
      .catch((err) => console.error('QR fetch error:', err));
  }

  // Central Room State Handler
  function handleRoomUpdate(state) {
    currentRoomCode = state.code;

    // 1. LOBBY
    if (state.gameState === 'LOBBY') {
      showScreen('lobby');
      renderLobby(state);
    }
    // 2. QUESTION / BLUFF PHASE
    else if (state.gameState === 'QUESTION') {
      showScreen('question');
      renderQuestionPhase(state);
    }
    // 3. VOTING PHASE
    else if (state.gameState === 'VOTING') {
      showScreen('voting');
      renderVotingPhase(state);
    }
    // 4. REVEAL PHASE
    else if (state.gameState === 'REVEAL') {
      showScreen('reveal');
      renderRevealPhase(state);
    }
    // 5. LEADERBOARD
    else if (state.gameState === 'LEADERBOARD') {
      showScreen('leaderboard');
      renderLeaderboard(state);
    }
    // 6. GAME OVER
    else if (state.gameState === 'GAME_OVER') {
      showScreen('gameover');
      renderGameOver(state);
    }
  }

  // Render Lobby
  function renderLobby(state) {
    const playerCount = document.getElementById('player-count');
    const playersList = document.getElementById('lobby-players-list');
    const btnStart = document.getElementById('btn-start-game');
    const hint = document.getElementById('lobby-status-hint');

    if (playerCount) playerCount.textContent = state.players.length;
    if (playersList) {
      playersList.innerHTML = '';
      state.players.forEach((p) => {
        const card = document.createElement('div');
        card.className = 'player-card';
        card.innerHTML = `
          <div class="player-card-avatar" style="border: 2px solid ${p.color};">${p.avatar}</div>
          <div class="player-card-info">
            <div class="player-card-name">${escapeHtml(p.name)}</div>
            <div class="player-card-tag">
              ${p.isHost ? '👑 Host' : p.isBot ? '🤖 AI Player' : '🎮 Player'}
              ${p.id === socket?.id ? ' (You)' : ''}
            </div>
          </div>
        `;
        playersList.appendChild(card);
      });
    }

    // Enable start game if host and >= 2 players
    const canStart = isHost && state.players.length >= 2;
    if (btnStart) {
      btnStart.disabled = !canStart;
      btnStart.style.opacity = canStart ? '1' : '0.5';
    }

    if (hint) {
      if (state.players.length < 2) {
        hint.textContent = 'Waiting for at least 2 players... (Click "Add AI Bot" to test solo!)';
      } else if (!isHost) {
        hint.textContent = 'Waiting for the host to start the game...';
      } else {
        hint.textContent = 'Ready to launch! Click "Start Game" when all players are in.';
      }
    }
  }

  // Render Question Phase
  function renderQuestionPhase(state) {
    myBluffSubmitted = false;
    currentQuestion = state.currentQuestion;

    document.getElementById('question-round-pill').textContent = `Round ${state.currentRound} / ${state.totalRounds}`;
    document.getElementById('question-category-pill').textContent = state.currentQuestion.category || 'Trivia';

    const formattedPrompt = escapeHtml(state.currentQuestion.prompt).replace(
      /________/g,
      '<span class="blank-highlight">___________</span>'
    );
    document.getElementById('question-prompt-text').innerHTML = formattedPrompt;

    const inputBluff = document.getElementById('input-bluff');
    if (inputBluff) {
      inputBluff.value = '';
      inputBluff.focus();
    }
    const bluffCounter = document.getElementById('bluff-char-count');
    if (bluffCounter) bluffCounter.textContent = '0/60';

    document.getElementById('bluff-submit-area').style.display = 'block';
    document.getElementById('bluff-waiting-area').style.display = 'none';
  }

  // Render Voting Phase
  function renderVotingPhase(state) {
    myVoteSubmitted = false;

    document.getElementById('voting-round-pill').textContent = `Round ${state.currentRound} / ${state.totalRounds}`;
    document.getElementById('voting-category-pill').textContent = state.currentQuestion?.category || 'Voting';

    const formattedPrompt = escapeHtml(state.currentQuestion?.prompt || '').replace(
      /________/g,
      '<span class="blank-highlight">___________</span>'
    );
    document.getElementById('voting-prompt-text').innerHTML = formattedPrompt;

    const grid = document.getElementById('voting-options-grid');
    grid.innerHTML = '';
    document.getElementById('vote-submitted-notice').style.display = 'none';

    state.shuffledOptions.forEach((opt) => {
      const isMyOwnBluff = opt.authorId === socket?.id;
      const card = document.createElement('div');
      card.className = `option-card ${isMyOwnBluff ? 'disabled' : ''}`;
      card.dataset.id = opt.id;

      card.innerHTML = `
        <div class="option-text">${escapeHtml(opt.text)}</div>
        ${isMyOwnBluff ? '<div class="option-author-note">🚫 Your lie (Can\'t vote for yourself)</div>' : ''}
      `;

      if (!isMyOwnBluff) {
        card.addEventListener('click', () => {
          if (myVoteSubmitted) return;
          if (window.soundEngine) window.soundEngine.click();

          grid.querySelectorAll('.option-card').forEach((c) => c.classList.remove('selected'));
          card.classList.add('selected');
          myVoteSubmitted = true;

          socket.emit('submit_vote', { optionId: opt.id }, (res) => {
            if (res && res.error) {
              showToast(res.error, 'error');
              myVoteSubmitted = false;
              card.classList.remove('selected');
            } else {
              document.getElementById('vote-submitted-notice').style.display = 'block';
            }
          });
        });
      }

      grid.appendChild(card);
    });
  }

  // Render Reveal Phase
  function renderRevealPhase(state) {
    const container = document.getElementById('reveal-cards-container');
    container.innerHTML = '';

    const results = state.roundResults;
    if (!results || !results.options) return;

    let foundTruth = false;

    // Check if player spotted the truth
    results.options.forEach((opt) => {
      if (opt.isTruth && opt.voters.some((v) => v.id === socket?.id)) {
        foundTruth = true;
      }
    });

    if (foundTruth) {
      if (window.soundEngine) window.soundEngine.correct();
      showToast('🌟 You found the REAL TRUTH! (+1,000 pts)', 'success');
    } else {
      if (window.soundEngine) window.soundEngine.tricked();
    }

    // Sort: show bluffs first, truth last for high suspense!
    const sortedOptions = [...results.options].sort((a, b) => {
      if (a.isTruth) return 1;
      if (b.isTruth) return -1;
      return b.voters.length - a.voters.length;
    });

    sortedOptions.forEach((opt, idx) => {
      const card = document.createElement('div');
      card.className = `reveal-card ${opt.isTruth ? 'is-truth' : 'is-bluff'}`;
      card.style.animation = `popIn 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) ${idx * 0.25}s both`;

      const authorDisplay = opt.isTruth
        ? '<span style="color: var(--accent-emerald); font-weight: 700;">🌟 THE REAL TRUTH</span>'
        : opt.authorId === 'HOUSE'
        ? '<span style="color: var(--text-dim);">🏠 House Lie</span>'
        : `<span style="color: var(--secondary); font-weight: 700;">✍️ Bluff written by ${escapeHtml(opt.authorName)}</span>`;

      let votersHtml = '';
      if (opt.voters.length === 0) {
        votersHtml = '<span style="color: var(--text-dim); font-size: 0.85rem;">Nobody fell for this!</span>';
      } else {
        opt.voters.forEach((v) => {
          const pillClass = opt.isTruth ? 'spotted-truth' : 'tricked';
          votersHtml += `
            <span class="voter-pill ${pillClass}">
              ${v.avatar} ${escapeHtml(v.name)}
              ${opt.isTruth ? '🎯 Spotter' : '🤡 Fooled!'}
            </span>
          `;
        });
      }

      card.innerHTML = `
        <div class="reveal-header">
          <span class="reveal-badge ${opt.isTruth ? 'badge-truth' : 'badge-bluff'}">
            ${opt.isTruth ? '✓ Truth' : '✗ Lie'}
          </span>
          <div class="reveal-author-tag">${authorDisplay}</div>
        </div>
        <div class="reveal-answer-text">"${escapeHtml(opt.text)}"</div>
        <div class="voters-row">
          <span style="font-size: 0.8rem; font-weight: 700; color: var(--text-muted); margin-right: 4px;">VOTED:</span>
          ${votersHtml}
        </div>
      `;

      container.appendChild(card);
    });

    // Host controls
    const skipBtn = document.getElementById('btn-skip-reveal');
    if (skipBtn) {
      skipBtn.style.display = isHost ? 'inline-flex' : 'none';
    }
  }

  // Render Leaderboard
  function renderLeaderboard(state) {
    const list = document.getElementById('leaderboard-list');
    list.innerHTML = '';

    const nextBtn = document.getElementById('btn-next-round');
    if (nextBtn) {
      nextBtn.style.display = isHost ? 'inline-flex' : 'none';
      nextBtn.textContent = state.currentRound >= state.totalRounds ? 'See Winner 🏆' : 'Next Question ▶';
    }

    state.leaderboard.forEach((player, idx) => {
      const item = document.createElement('div');
      item.className = `leaderboard-item ${idx < 3 ? `rank-${idx + 1}` : ''}`;
      item.style.animation = `slideUp 0.35s ease ${idx * 0.08}s both`;

      const streakBadge =
        player.streak >= 2 ? `<span style="color: #f97316; font-size: 0.85rem; font-weight: 800;">🔥 ${player.streak} Streak!</span>` : '';

      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px;">
          <div class="rank-badge">${idx + 1}</div>
          <div style="font-size: 2rem;">${player.avatar}</div>
          <div>
            <div style="font-family: 'Outfit'; font-weight: 800; font-size: 1.15rem;">
              ${escapeHtml(player.name)}
              ${player.id === socket?.id ? ' <span style="color: var(--primary); font-size: 0.85rem;">(You)</span>' : ''}
            </div>
            ${streakBadge}
          </div>
        </div>
        <div style="text-align: right;">
          <span class="player-score-badge">${player.score.toLocaleString()}</span>
          ${player.roundPoints > 0 ? `<span class="score-gain">+${player.roundPoints}</span>` : ''}
        </div>
      `;

      list.appendChild(item);
    });
  }

  // Render Game Over & Podium
  function renderGameOver(state) {
    if (window.soundEngine) window.soundEngine.fanfare();
    launchConfetti();

    const podium = document.getElementById('podium-container');
    const finalList = document.getElementById('final-leaderboard-list');
    podium.innerHTML = '';
    finalList.innerHTML = '';

    const top = state.leaderboard;

    // Podium layout: 2nd place (left), 1st place (center), 3rd place (right)
    const podiumOrder = [
      { player: top[1], rank: 2, class: 'podium-2' },
      { player: top[0], rank: 1, class: 'podium-1' },
      { player: top[2], rank: 3, class: 'podium-3' }
    ];

    podiumOrder.forEach((entry) => {
      if (!entry.player) return;
      const pillar = document.createElement('div');
      pillar.className = `podium-pillar ${entry.class}`;
      pillar.innerHTML = `
        <div class="podium-user">
          <div class="podium-avatar">${entry.player.avatar}</div>
          <div class="podium-name">${escapeHtml(entry.player.name)}</div>
          <div style="font-weight: 800; color: #f59e0b; font-size: 0.95rem;">${entry.player.score.toLocaleString()} pts</div>
        </div>
        <div class="podium-block">${entry.rank === 1 ? '🥇' : entry.rank === 2 ? '🥈' : '🥉'}</div>
      `;
      podium.appendChild(pillar);
    });

    // Full final list
    top.forEach((player, idx) => {
      const item = document.createElement('div');
      item.className = `leaderboard-item ${idx === 0 ? 'rank-1' : ''}`;
      item.innerHTML = `
        <div style="display: flex; align-items: center; gap: 14px;">
          <div class="rank-badge">${idx + 1}</div>
          <div style="font-size: 1.8rem;">${player.avatar}</div>
          <div style="font-family: 'Outfit'; font-weight: 800; font-size: 1.1rem;">
            ${escapeHtml(player.name)}
          </div>
        </div>
        <div class="player-score-badge">${player.score.toLocaleString()} pts</div>
      `;
      finalList.appendChild(item);
    });
  }

  // Timer Tick Handler
  function handleTimerTick(remaining, total) {
    const isUrgent = remaining <= 5 && remaining > 0;
    if (window.soundEngine && (isUrgent || remaining === 10)) {
      window.soundEngine.tick(isUrgent);
    }

    // Question screen
    const qCircle = document.getElementById('question-timer-circle');
    const qBar = document.getElementById('question-timer-bar');
    if (qCircle) {
      qCircle.textContent = remaining;
      qCircle.classList.toggle('timer-urgent', isUrgent);
    }
    if (qBar) {
      const pct = Math.max(0, (remaining / total) * 100);
      qBar.style.width = `${pct}%`;
    }

    // Voting screen
    const vCircle = document.getElementById('voting-timer-circle');
    const vBar = document.getElementById('voting-timer-bar');
    if (vCircle) {
      vCircle.textContent = remaining;
      vCircle.classList.toggle('timer-urgent', isUrgent);
    }
    if (vBar) {
      const pct = Math.max(0, (remaining / total) * 100);
      vBar.style.width = `${pct}%`;
    }

    // Reveal screen
    const rCircle = document.getElementById('reveal-timer-circle');
    if (rCircle) rCircle.textContent = remaining;
  }

  // Toast System
  function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = 'toast';
    if (type === 'error') toast.style.borderLeftColor = 'var(--danger)';
    if (type === 'success') toast.style.borderLeftColor = 'var(--accent-emerald)';
    if (type === 'warning') toast.style.borderLeftColor = 'var(--accent-amber)';

    toast.textContent = message;
    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateY(10px)';
      toast.style.transition = 'all 0.3s ease';
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // Confetti Animation Canvas
  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;

    const particles = [];
    const colors = ['#6366f1', '#ec4899', '#06b6d4', '#f59e0b', '#10b981', '#ffffff'];

    for (let i = 0; i < 150; i++) {
      particles.push({
        x: canvas.width / 2 + (Math.random() - 0.5) * 200,
        y: canvas.height * 0.4 + (Math.random() - 0.5) * 100,
        vx: (Math.random() - 0.5) * 18,
        vy: (Math.random() - 1.2) * 22,
        size: Math.random() * 8 + 4,
        color: colors[Math.floor(Math.random() * colors.length)],
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 10,
        gravity: 0.4,
        drag: 0.98
      });
    }

    let animationId;
    let frames = 0;

    function render() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      frames++;

      particles.forEach((p) => {
        p.vx *= p.drag;
        p.vy *= p.drag;
        p.vy += p.gravity;
        p.x += p.vx;
        p.y += p.vy;
        p.rotation += p.rotationSpeed;

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rotation * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size);
        ctx.restore();
      });

      if (frames < 240) {
        animationId = requestAnimationFrame(render);
      } else {
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        cancelAnimationFrame(animationId);
      }
    }

    render();
  }

  function escapeHtml(str) {
    if (!str) return '';
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  // App Startup
  window.addEventListener('DOMContentLoaded', () => {
    initSocket();
    renderAvatarSelectors();
    handleUrlParams();
    setupEvents();
  });
})();
