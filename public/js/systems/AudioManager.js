// ============================================================
// systems/AudioManager.js
//
// EDM BACKGROUND MUSIC
// Built entirely with Web Audio API — no files needed.
// Uses a 16-step sequencer at 126 BPM running a classic
// four-on-the-floor pattern: kick, snare, hi-hat, bass, lead.
//
// CUSTOM GAME OVER SOUND
// Place your file at: public/audio/gameover.mp3
// The game loads it automatically. If missing it falls back
// to the built-in procedural death sequence.
// ============================================================

class AudioManager {

  constructor() {
    try {
      this.ctx = new (window.AudioContext || window.webkitAudioContext)();
      this.ok  = true;
    } catch(e) {
      this.ok = false;
    }

    // Master volumes
    this._sfxGain   = this._makeGain(0.28);
    this._musicGain = this._makeGain(0.0);  // starts silent, fades in
    this._masterGain = this._makeGain(1.0);
    if (this.ok) {
      this._sfxGain.connect(this._masterGain);
      this._musicGain.connect(this._masterGain);
      this._masterGain.connect(this.ctx.destination);
    }

    // Sequencer state
    this._bpm         = 126;
    this._step        = 0;
    this._nextStepTime = 0;
    this._seqInterval  = null;
    this._musicPlaying = false;
    this._wakaPhase    = 0;
    this._sirenInt     = null;

    // Custom game over audio element
    this._goAudio = null;
    this._loadCustomGameOver();
  }

  resume() {
    if (this.ok && this.ctx.state === 'suspended') this.ctx.resume();
  }

  // ============================================================
  // EDM BACKGROUND MUSIC
  // ============================================================

  startMusic() {
    if (!this.ok || this._musicPlaying) return;
    this._musicPlaying  = true;
    this._step          = 0;
    this._nextStepTime  = this.ctx.currentTime + 0.05;

    // Always resume — deployed HTTPS sites may suspend the context
    this.ctx.resume();

    this._musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this._musicGain.gain.setValueAtTime(0, this.ctx.currentTime);
    this._musicGain.gain.linearRampToValueAtTime(0.09, this.ctx.currentTime + 1.5);
    this._seqInterval = setInterval(() => this._scheduleSteps(), 40);
  }

  stopMusic(fadeDur = 1.0) {
    if (!this.ok || !this._musicPlaying) return;
    this._musicPlaying = false;
    if (this._seqInterval) { clearInterval(this._seqInterval); this._seqInterval = null; }
    this._musicGain.gain.cancelScheduledValues(this.ctx.currentTime);
    this._musicGain.gain.setValueAtTime(this._musicGain.gain.value, this.ctx.currentTime);
    this._musicGain.gain.linearRampToValueAtTime(0, this.ctx.currentTime + fadeDur);
  }

  _scheduleSteps() {
    // Lookahead: schedule all steps that fall within next 150ms
    const LOOKAHEAD  = 0.15;
    const STEP_TIME  = (60 / this._bpm) / 4; // 16th note duration

    while (this._nextStepTime < this.ctx.currentTime + LOOKAHEAD) {
      this._playStep(this._step, this._nextStepTime);
      this._step        = (this._step + 1) % 16;
      this._nextStepTime += STEP_TIME;
    }
  }

  // 16-step pattern — all at 126 BPM
  _playStep(step, time) {
    const S = (60 / this._bpm) / 4; // step duration in seconds

    // ---- KICK — four on the floor (steps 0, 4, 8, 12) ----
    if (step % 4 === 0) this._kick(time);

    // ---- CLAP/SNARE — beats 2 and 4 (steps 4 and 12) ----
    if (step === 4 || step === 12) this._snare(time);

    // ---- OPEN HI-HAT — every 8th note, accent on beat ----
    if (step % 2 === 0) {
      const vol = (step % 4 === 0) ? 0.6 : 0.3;
      this._hihat(time, vol, step === 6 || step === 14); // open on step 6,14
    }

    // ---- BASSLINE — syncopated pattern ----
    //   F2=87Hz  Ab2=104Hz  Bb2=116Hz  C3=130Hz
    const bassHz = [87,0,0,87, 0,104,0,0, 116,0,0,116, 0,104,87,0];
    if (bassHz[step] > 0) this._bass(time, bassHz[step], S * 0.85);

    // ---- LEAD SYNTH ARP — 8th-note pattern ----
    //   F4=349  Ab4=415  C5=523  Eb5=622  F5=698
    const arpHz = [349,0,415,0, 523,0,415,0, 523,0,622,0, 698,0,523,0];
    // Only play arp on even bars (every 2nd bar = 32 steps)
    // We use step within a 32-step cycle
    const barPos = (this._step + 16) % 32; // rough bar tracking
    if (arpHz[step] > 0 && barPos < 16) {
      this._lead(time, arpHz[step], S * 0.4);
    } else if (arpHz[step] > 0) {
      // Counter-melody in second bar
      this._lead(time, arpHz[step] * 1.5, S * 0.3);
    }
  }

  // ---- DRUM SYNTHESIS ----

  _kick(time) {
    if (!this.ok) return;
    try {
      // 808-style kick: oscillator with fast pitch drop
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this._musicGain);

      o.type = 'sine';
      o.frequency.setValueAtTime(180, time);
      o.frequency.exponentialRampToValueAtTime(40, time + 0.25);

      g.gain.setValueAtTime(1.8, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.35);

      o.start(time); o.stop(time + 0.36);
    } catch(e) {}
  }

  _snare(time) {
    if (!this.ok) return;
    try {
      // White noise through bandpass = snare body
      const n   = this._noiseBuffer(0.2);
      const src = this.ctx.createBufferSource();
      const bp  = this.ctx.createBiquadFilter();
      const g   = this.ctx.createGain();

      src.buffer = n; bp.type = 'bandpass';
      bp.frequency.value = 1200; bp.Q.value = 0.8;
      src.connect(bp); bp.connect(g); g.connect(this._musicGain);

      g.gain.setValueAtTime(0.9, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + 0.15);

      src.start(time); src.stop(time + 0.16);

      // Tone body
      const o2 = this.ctx.createOscillator();
      const g2 = this.ctx.createGain();
      o2.connect(g2); g2.connect(this._musicGain);
      o2.type = 'triangle'; o2.frequency.value = 200;
      g2.gain.setValueAtTime(0.5, time);
      g2.gain.exponentialRampToValueAtTime(0.001, time + 0.08);
      o2.start(time); o2.stop(time + 0.09);
    } catch(e) {}
  }

  _hihat(time, vol, isOpen) {
    if (!this.ok) return;
    try {
      const dur = isOpen ? 0.18 : 0.04;
      const n   = this._noiseBuffer(dur + 0.01);
      const src = this.ctx.createBufferSource();
      const hp  = this.ctx.createBiquadFilter();
      const g   = this.ctx.createGain();

      src.buffer = n; hp.type = 'highpass'; hp.frequency.value = 8000;
      src.connect(hp); hp.connect(g); g.connect(this._musicGain);

      g.gain.setValueAtTime(vol * 0.5, time);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);

      src.start(time); src.stop(time + dur + 0.01);
    } catch(e) {}
  }

  // ---- SYNTH SYNTHESIS ----

  _bass(time, freq, dur) {
    if (!this.ok) return;
    try {
      const o  = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g  = this.ctx.createGain();

      o.connect(lp); lp.connect(g); g.connect(this._musicGain);

      o.type = 'sawtooth'; o.frequency.value = freq;
      lp.type = 'lowpass'; lp.frequency.setValueAtTime(800, time);
      lp.frequency.exponentialRampToValueAtTime(200, time + dur);

      g.gain.setValueAtTime(0.7, time);
      g.gain.setValueAtTime(0.7, time + dur * 0.7);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);

      o.start(time); o.stop(time + dur + 0.01);
    } catch(e) {}
  }

  _lead(time, freq, dur) {
    if (!this.ok) return;
    try {
      const o  = this.ctx.createOscillator();
      const lp = this.ctx.createBiquadFilter();
      const g  = this.ctx.createGain();

      o.connect(lp); lp.connect(g); g.connect(this._musicGain);

      o.type = 'square'; o.frequency.value = freq;
      lp.type = 'lowpass'; lp.frequency.value = 2000;

      g.gain.setValueAtTime(0.0, time);
      g.gain.linearRampToValueAtTime(0.25, time + 0.01);
      g.gain.exponentialRampToValueAtTime(0.001, time + dur);

      o.start(time); o.stop(time + dur + 0.01);
    } catch(e) {}
  }

  // ---- NOISE BUFFER HELPER ----

  _noiseBuffer(dur) {
    const n   = Math.floor(this.ctx.sampleRate * dur);
    const buf = this.ctx.createBuffer(1, n, this.ctx.sampleRate);
    const dat = buf.getChannelData(0);
    for (let i = 0; i < n; i++) dat[i] = Math.random() * 2 - 1;
    return buf;
  }

  // ============================================================
  // CUSTOM GAME OVER SOUND
  // ============================================================

  _loadCustomGameOver() {
    // Try each format in order, stop as soon as one loads successfully
    const formats = ['mp3', 'wav', 'ogg'];
    let tried = 0;

    const tryNext = () => {
      if (tried >= formats.length) {
        console.log('[Audio] No custom game over file found — using built-in fallback');
        return;
      }
      const fmt   = formats[tried++];
      const audio = new Audio();

      audio.addEventListener('canplaythrough', () => {
        this._goAudio = audio;
        console.log(`[Audio] Custom game over sound LOADED OK: gameover.${fmt}`);
      }, { once: true });

      audio.addEventListener('error', (e) => {
        console.log(`[Audio] gameover.${fmt} not found (${e.message || 'load error'}) — trying next`);
        tryNext();
      }, { once: true });

      console.log(`[Audio] Trying to load gameover.${fmt}...`);
      audio.src = `audio/gameover.${fmt}`;
      audio.load();
    };

    tryNext();
  }

  gameOver() {
    this.stopSiren();
    this.stopMusic(0.5);

    if (this._goAudio) {
      console.log('[Audio] Playing custom game over sound');
      this._goAudio.currentTime = 0;
      this._goAudio.volume = 0.9;
      this._goAudio.play()
        .then(() => console.log('[Audio] Custom game over sound playing'))
        .catch(e => {
          console.log('[Audio] Custom play failed:', e.message, '— falling back to built-in');
          this._proceduralGameOver();
        });
    } else {
      console.log('[Audio] No custom file loaded — playing built-in game over sound');
      this._proceduralGameOver();
    }
  }

  _proceduralGameOver() {
    // Dramatic descending fanfare — clearly different from the single-death sound
    // Three falling chords then a final low thud
    const hits = [
      { freq:523, time:0.0,  dur:0.18 },
      { freq:494, time:0.2,  dur:0.18 },
      { freq:440, time:0.4,  dur:0.18 },
      { freq:392, time:0.6,  dur:0.18 },
      { freq:349, time:0.8,  dur:0.25 },
      { freq:294, time:1.1,  dur:0.25 },
      { freq:220, time:1.45, dur:0.5  },
      { freq:147, time:1.5,  dur:0.7  },
    ];
    hits.forEach(h => this._sfxTone(h.freq, 0.22, 'sawtooth', h.dur, h.time));
    // Low impact thud at the end
    if (!this.ok) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this._sfxGain);
      o.type = 'sine';
      const t = this.ctx.currentTime + 1.5;
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(30, t + 0.6);
      g.gain.setValueAtTime(0.5, t);
      g.gain.exponentialRampToValueAtTime(0.001, t + 0.7);
      o.start(t); o.stop(t + 0.75);
    } catch(e) {}
  }

  // ============================================================
  // SFX (unchanged from before, all go through _sfxGain)
  // ============================================================

  _sfxTone(freq, vol, type, dur, delay = 0) {
    if (!this.ok) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this._sfxGain);
      o.type = type;
      o.frequency.setValueAtTime(freq, this.ctx.currentTime + delay);
      g.gain.setValueAtTime(vol, this.ctx.currentTime + delay);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + delay + dur);
      o.start(this.ctx.currentTime + delay);
      o.stop(this.ctx.currentTime + delay + dur + 0.02);
    } catch(e) {}
  }

  _sfxSweep(f1, f2, vol, type, dur) {
    if (!this.ok) return;
    try {
      const o = this.ctx.createOscillator();
      const g = this.ctx.createGain();
      o.connect(g); g.connect(this._sfxGain);
      o.type = type;
      o.frequency.setValueAtTime(f1, this.ctx.currentTime);
      o.frequency.linearRampToValueAtTime(f2, this.ctx.currentTime + dur);
      g.gain.setValueAtTime(vol, this.ctx.currentTime);
      g.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + dur);
      o.start(); o.stop(this.ctx.currentTime + dur + 0.02);
    } catch(e) {}
  }

  waka() {
    const freq = this._wakaPhase === 0 ? 440 : 330;
    this._sfxTone(freq, 0.12, 'square', 0.07);
    this._wakaPhase = 1 - this._wakaPhase;
  }

  pellet()    { this._sfxSweep(200, 800, 0.14, 'square', 0.35); }
  eatGhost()  { this._sfxSweep(600, 100, 0.14, 'sawtooth', 0.25); }
  death() {
    const freqs = [494,466,440,415,392,370,349,330,311,294,277,262];
    freqs.forEach((f, i) => this._sfxTone(f, 0.12, 'sawtooth', 0.09, i * 0.07));
  }

  start() {
    const notes = [264,330,396,528,660,528,594,660];
    notes.forEach((f,i) => this._sfxTone(f, 0.1, 'square', 0.12, i * 0.09));
  }

  fruit() {
    [0,0.1,0.2].forEach((d,i) => this._sfxTone([880,1100,1320][i], 0.09, 'sine', 0.15, d));
  }

  lifeUp() {
    [0,0.12,0.24,0.36].forEach((d,i) => this._sfxTone([440,550,660,880][i], 0.1, 'sine', 0.18, d));
  }

  extraLife() { this.lifeUp(); }

  startSiren(frightened = false) {
    // Siren removed — EDM track serves as background audio
  }

  stopSiren() {
    if (this._sirenInt) { clearInterval(this._sirenInt); this._sirenInt = null; }
  }

  // ---- GAIN NODE HELPER ----

  _makeGain(val) {
    if (!this.ok) return { gain: { value: val, setValueAtTime:()=>{}, linearRampToValueAtTime:()=>{}, exponentialRampToValueAtTime:()=>{}, cancelScheduledValues:()=>{} }, connect:()=>{} };
    const g = this.ctx.createGain();
    g.gain.value = val;
    return g;
  }
}
