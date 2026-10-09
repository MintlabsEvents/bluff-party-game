// Web Audio API Sound Synthesizer for Bluff Party
// Runs 100% in-browser with zero external asset dependencies

class SoundEngine {
  constructor() {
    this.ctx = null;
    this.muted = false;
    this.musicPlaying = false;
    this.musicTimer = null;
    this.tempo = 115;
  }

  init() {
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume();
    }
  }

  toggleMute() {
    this.muted = !this.muted;
    if (this.muted && this.musicPlaying) {
      this.stopLobbyBeat();
    }
    return this.muted;
  }

  playTone(freq, type = 'sine', duration = 0.15, gainVal = 0.1, decay = true) {
    if (this.muted) return;
    this.init();
    if (!this.ctx) return;

    try {
      const osc = this.ctx.createOscillator();
      const gain = this.ctx.createGain();

      osc.type = type;
      osc.frequency.setValueAtTime(freq, this.ctx.currentTime);

      gain.gain.setValueAtTime(gainVal, this.ctx.currentTime);
      if (decay) {
        gain.gain.exponentialRampToValueAtTime(0.0001, this.ctx.currentTime + duration);
      }

      osc.connect(gain);
      gain.connect(this.ctx.destination);

      osc.start();
      osc.stop(this.ctx.currentTime + duration);
    } catch (e) {
      // Audio might be blocked by browser policy until gesture
    }
  }

  // UI button click
  click() {
    this.playTone(600, 'sine', 0.05, 0.08);
  }

  // Join or player enter sound
  playerJoined() {
    if (this.muted) return;
    this.init();
    const notes = [440, 554, 659];
    notes.forEach((freq, idx) => {
      setTimeout(() => {
        this.playTone(freq, 'triangle', 0.12, 0.1);
      }, idx * 60);
    });
  }

  // Submit sound
  submitWhoosh() {
    if (this.muted) return;
    this.init();
    this.playTone(320, 'sine', 0.08, 0.09);
    setTimeout(() => {
      this.playTone(480, 'sine', 0.12, 0.1);
    }, 60);
  }

  // Countdown timer tick
  tick(isUrgent = false) {
    if (isUrgent) {
      this.playTone(880, 'triangle', 0.08, 0.14);
    } else {
      this.playTone(520, 'sine', 0.04, 0.06);
    }
  }

  // Correct guess / Truth revealed chime
  correct() {
    if (this.muted) return;
    this.init();
    const chords = [523.25, 659.25, 783.99, 1046.5]; // C5, E5, G5, C6
    chords.forEach((f, i) => {
      setTimeout(() => {
        this.playTone(f, 'sine', 0.25, 0.15);
      }, i * 70);
    });
  }

  // Tricked / Fooled buzz
  tricked() {
    if (this.muted) return;
    this.init();
    this.playTone(220, 'sawtooth', 0.2, 0.12);
    setTimeout(() => {
      this.playTone(180, 'sawtooth', 0.25, 0.12);
    }, 120);
  }

  // Fanfare for winner
  fanfare() {
    if (this.muted) return;
    this.init();
    const melody = [
      { f: 440, d: 0.15 },
      { f: 554, d: 0.15 },
      { f: 659, d: 0.2 },
      { f: 880, d: 0.45 }
    ];
    let time = 0;
    melody.forEach(n => {
      setTimeout(() => {
        this.playTone(n.f, 'triangle', n.d, 0.18);
      }, time);
      time += n.d * 1000 + 30;
    });
  }

  // Catchy upbeat synth baseline loop for lobby
  toggleLobbyBeat() {
    if (this.musicPlaying) {
      this.stopLobbyBeat();
      return false;
    } else {
      this.startLobbyBeat();
      return true;
    }
  }

  startLobbyBeat() {
    if (this.muted) return;
    this.init();
    this.musicPlaying = true;
    const bassline = [130.81, 130.81, 155.56, 174.61, 196.00, 174.61, 155.56, 116.54];
    let step = 0;

    const intervalTime = (60 / this.tempo / 2) * 1000;
    this.musicTimer = setInterval(() => {
      if (!this.musicPlaying || this.muted) return;
      const freq = bassline[step % bassline.length];
      this.playTone(freq, 'triangle', 0.12, 0.04);
      step++;
    }, intervalTime);
  }

  stopLobbyBeat() {
    this.musicPlaying = false;
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}

window.soundEngine = new SoundEngine();
