/**
 * WebAudio SE — stretch hum, grab, release snap, hurt.
 */
(function () {
  const C = () => window.STRETCH_CONFIG;

  let ctx = null;
  let muted = false;
  let ambientNodes = null;
  let stretchHum = null;
  let cachedNoiseBuffer = null;

  function ensureCtx() {
    if (!ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      ctx = new AC();
    }
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  }

  function randPitch() {
    const f = C().pitchShiftRandomFraction;
    return 1 + (Math.random() * 2 - 1) * f;
  }

  function noiseBuffer() {
    const a = ensureCtx();
    if (!a) return null;
    if (cachedNoiseBuffer) return cachedNoiseBuffer;
    const len = Math.max(1, Math.floor(a.sampleRate * 0.25));
    const buf = a.createBuffer(1, len, a.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    cachedNoiseBuffer = buf;
    return buf;
  }

  function playTone({ freq, type, vol, attack, decay, pitchMul }) {
    const a = ensureCtx();
    if (!a || muted) return;
    const t0 = a.currentTime;
    const o = a.createOscillator();
    const g = a.createGain();
    o.type = type || 'square';
    o.frequency.value = freq * (pitchMul || 1);
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(Math.max(0.0001, vol), t0 + (attack || 0.005));
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (attack || 0.005) + (decay || 0.08));
    o.connect(g);
    g.connect(a.destination);
    o.start(t0);
    o.stop(t0 + (attack || 0.005) + (decay || 0.08) + 0.02);
  }

  function playNoiseBurst({ vol, decay, filterFreq, pitchMul }) {
    const a = ensureCtx();
    if (!a || muted) return;
    const buf = noiseBuffer();
    if (!buf) return;
    const t0 = a.currentTime;
    const src = a.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = pitchMul || 1;
    const filter = a.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.value = filterFreq || 1200;
    filter.Q.value = 0.8;
    const g = a.createGain();
    g.gain.setValueAtTime(Math.max(0.0001, vol), t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + (decay || 0.08));
    src.connect(filter);
    filter.connect(g);
    g.connect(a.destination);
    src.start(t0);
    src.stop(t0 + (decay || 0.08) + 0.02);
  }

  const AudioSys = {
    unlock() {
      ensureCtx();
      this.startAmbient();
    },

    toggleMute() {
      muted = !muted;
      if (muted) {
        this.stopStretchHum();
        this.stopAmbient();
      } else {
        this.startAmbient();
      }
      return muted;
    },

    isMuted() {
      return muted;
    },

    startAmbient() {
      const a = ensureCtx();
      if (!a || muted || ambientNodes) return;
      const o1 = a.createOscillator();
      const o2 = a.createOscillator();
      const g = a.createGain();
      o1.type = 'sine';
      o2.type = 'sine';
      o1.frequency.value = 48;
      o2.frequency.value = 72;
      g.gain.value = C().ambientVolumeLinear;
      o1.connect(g);
      o2.connect(g);
      g.connect(a.destination);
      o1.start();
      o2.start();
      ambientNodes = { o1, o2, g };
    },

    stopAmbient() {
      if (!ambientNodes) return;
      try {
        ambientNodes.o1.stop();
        ambientNodes.o2.stop();
      } catch (_) {}
      ambientNodes = null;
    },

    startStretchHum(tension01) {
      const a = ensureCtx();
      if (!a || muted) return;
      if (!stretchHum) {
        const o = a.createOscillator();
        const g = a.createGain();
        o.type = 'triangle';
        o.frequency.value = 120;
        g.gain.value = 0.0001;
        o.connect(g);
        g.connect(a.destination);
        o.start();
        stretchHum = { o, g };
      }
      const t = Math.max(0, Math.min(1, tension01 || 0));
      stretchHum.o.frequency.setTargetAtTime(110 + t * 220, a.currentTime, 0.05);
      stretchHum.g.gain.setTargetAtTime(C().stretchHumVolumeLinear * (0.35 + t * 0.9), a.currentTime, 0.05);
    },

    stopStretchHum() {
      if (!stretchHum) return;
      try {
        stretchHum.o.stop();
      } catch (_) {}
      stretchHum = null;
    },

    grab() {
      const p = randPitch();
      const base = C().grabVolumeLinear;
      playTone({
        freq: 380,
        type: 'triangle',
        vol: base * 0.8,
        attack: 0.002,
        decay: 0.1,
        pitchMul: p,
      });
      playTone({
        freq: 760,
        type: 'square',
        vol: base * 0.4,
        attack: 0.002,
        decay: 0.07,
        pitchMul: p,
      });
      playNoiseBurst({
        vol: base * 0.35,
        decay: 0.06,
        filterFreq: 1400,
        pitchMul: p,
      });
    },

    release() {
      const p = randPitch();
      playTone({
        freq: 180,
        type: 'sawtooth',
        vol: C().releaseVolumeLinear * 0.7,
        attack: 0.002,
        decay: 0.1,
        pitchMul: p,
      });
      playNoiseBurst({
        vol: C().releaseVolumeLinear * 0.45,
        decay: 0.08,
        filterFreq: 900,
        pitchMul: p,
      });
    },

    snap() {
      const p = randPitch();
      playNoiseBurst({
        vol: C().snapVolumeLinear,
        decay: 0.14,
        filterFreq: 500,
        pitchMul: p,
      });
      playTone({
        freq: 90,
        type: 'sawtooth',
        vol: C().snapVolumeLinear * 0.8,
        attack: 0.002,
        decay: 0.16,
        pitchMul: p,
      });
    },

    hurt() {
      const p = randPitch();
      playTone({
        freq: 150,
        type: 'sawtooth',
        vol: C().hurtVolumeLinear,
        attack: 0.002,
        decay: 0.12,
        pitchMul: p,
      });
      playNoiseBurst({
        vol: C().hurtVolumeLinear * 0.55,
        decay: 0.1,
        filterFreq: 380,
        pitchMul: p,
      });
    },

    ko() {
      const p = randPitch();
      playNoiseBurst({
        vol: C().koVolumeLinear,
        decay: 0.16,
        filterFreq: 450,
        pitchMul: p,
      });
      playTone({
        freq: 65,
        type: 'sawtooth',
        vol: C().koVolumeLinear * 0.85,
        attack: 0.002,
        decay: 0.2,
        pitchMul: p,
      });
    },
  };

  window.StretchAudio = AudioSys;
})();
