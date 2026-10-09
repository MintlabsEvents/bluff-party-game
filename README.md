# Bluff Party 🎭 — Real-Time Multiplayer Deception Game

Built for the **Handshake AI Skills Studio** mission: *"Create a Multiplayer Game"*.

**Bluff Party** is an interactive, browser-based multiplayer party game (inspired by Fibbage & Jackbox). Players connect from separate phones, tablets, or computers using a simple 4-letter Room Code or QR Code — no app downloads or logins required.

---

## 🌟 Game Highlights

- **Multi-Device Support**: 2 to 8 players join from any device by room code or scanning the on-screen QR code.
- **Dual Display Modes**:
  - **Host View**: Perfect for projecting onto a TV or laptop screen.
  - **Player View**: Clean mobile controller interface optimized for quick typing and voting.
- **AI / Bot Players**: Includes built-in AI players (`🤖 LieBot 3000`, `🦊 Foxy Faker`, `🎩 Baron Bluff`) so you can test and play solo or fill empty room slots.
- **Synthesized Web Audio Engine**: Interactive sound effects (voting chimes, buzzer, timer countdown ticks, fanfare, and toggleable lobby party beats) powered by the Web Audio API with zero external file dependencies.
- **Jackbox-Style Reveals**: Step-by-step card reveals showing who wrote each bluff, who fell for it (+500 pts), and who spotted the Real Truth (+1,000 pts).
- **Streak & Final Round Multipliers**: 2x points in the final round with live animated podiums and confetti celebrations!

---

## 🚀 How to Run Locally & Play

### 1. Start the Server
```bash
npm install
npm start
```

The game server starts and prints your network access address:
```
===============================================
🚀 Bluff Party Multiplayer Game is running!
📡 Local:   http://localhost:3000
📱 Network: http://192.168.1.116:3000
===============================================
```

### 2. Join from Other Devices (Phones / Laptops)
- Ensure devices are on the same Wi-Fi network.
- Open the **Network URL** (e.g. `http://192.168.1.116:3000`) or simply point your phone's camera at the **QR Code** shown on the Host's screen.
- Enter your nickname, pick an avatar, and hit **Join Room**!

---

## 🎮 Rules & Scoring

1. **Phase 1: The Bluff** (35s)  
   An obscure, unbelievable, true fact with a blank is shown. Players secretly write a convincing lie to fill in the blank on their device.
2. **Phase 2: The Vote** (25s)  
   All submitted player bluffs, house bluffs, and the one Real Truth are shuffled. Players vote for which answer they believe is the truth (you cannot vote for your own lie).
3. **Phase 3: The Reveal & Standings**  
   - **+1,000 pts** for guessing the Real Truth.
   - **+500 pts** for each player you trick into voting for your Bluff.
   - **Streak Bonus**: Extra +250 pts for guessing the truth multiple rounds in a row.
   - **Final Round**: Double points for all bluffs and truth guesses!

---

## 📁 Project Architecture

- `server.js`: Node.js + Express + Socket.io server managing real-time rooms, game state machine, local IP detection, and AI bot simulations.
- `questions.json`: Bank of 25+ bizarre, obscure trivia facts across science, history, nature, food, and culture.
- `public/`:
  - `index.html`: Responsive interface for Landing, Lobby, Prompt, Voting, Reveal, and Leaderboard.
  - `style.css`: Modern glassmorphic theme with vibrant gradients, mobile responsiveness, and micro-animations.
  - `app.js`: Real-time client state controller, socket event handling, and confetti engine.
  - `audio.js`: In-browser Web Audio API sound effect synthesizer.
