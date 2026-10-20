/**
 * WebAudio SE for かこい商店 — capture / hit / UI / ambient.
 */
(function () {
  const C = () => window.KAKOI_CONFIG;

  let ctx = null;
  let muted = false;
  let ambientNodes = null;
  let drawHum = null;
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
    const len = Math.max(1, Math.floor(a.sampleRate * 0.2));
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
        this.stopAmbient();
        this.stopDrawHum();
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
      o1.frequency.value = 55;
      o2.frequency.value = 82;
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

    startDrawHum() {
      const a = ensureCtx();
      if (!a || muted || drawHum) return;
      const o = a.createOscillator();
      const g = a.createGain();
      o.type = 'triangle';
      o.frequency.value = 190;
      g.gain.value = C().drawHumVolumeLinear;
      o.connect(g);
      g.connect(a.destination);
      o.start();
      drawHum = { o, g };
    },

    stopDrawHum() {
      if (!drawHum) return;
      try {
        drawHum.o.stop();
      } catch (_) {}
      drawHum = null;
    },

    capture(count) {
      const p = randPitch();
      const base = C().captureVolumeLinear;
      const n = Math.max(1, count || 1);
      playTone({
        freq: 420 + n * 30,
        type: 'triangle',
        vol: base * 0.7,
        attack: 0.002,
        decay: 0.1,
        pitchMul: p,
      });
      playTone({
        freq: 660 + n * 40,
        type: 'square',
        vol: base * 0.45,
        attack: 0.002,
        decay: 0.12,
        pitchMul: p,
      });
      playNoiseBurst({
        vol: base * 0.35,
        decay: 0.07,
        filterFreq: 1800,
        pitchMul: p,
      });
    },

    hit() {
      const p = randPitch();
      playTone({
        freq: 110,
        type: 'sawtooth',
        vol: C().hitVolumeLinear,
        attack: 0.002,
        decay: 0.14,
        pitchMul: p,
      });
      playNoiseBurst({
        vol: C().hitVolumeLinear * 0.7,
        decay: 0.12,
        filterFreq: 450,
        pitchMul: p,
      });
    },

    dayClear() {
      const p = randPitch();
      playTone({
        freq: 392,
        type: 'triangle',
        vol: C().dayClearVolumeLinear * 0.7,
        attack: 0.004,
        decay: 0.1,
        pitchMul: p,
      });
      setTimeout(() => {
        playTone({
          freq: 523,
          type: 'triangle',
          vol: C().dayClearVolumeLinear * 0.55,
          attack: 0.004,
          decay: 0.14,
          pitchMul: p,
        });
      }, 70);
    },

    gameOver() {
      const p = randPitch();
      playNoiseBurst({
        vol: C().gameOverVolumeLinear,
        decay: 0.2,
        filterFreq: 380,
        pitchMul: p,
      });
      playTone({
        freq: 65,
        type: 'sawtooth',
        vol: C().gameOverVolumeLinear * 0.8,
        attack: 0.002,
        decay: 0.22,
        pitchMul: p,
      });
    },

    uiClick() {
      playTone({
        freq: 520,
        type: 'sine',
        vol: C().uiClickVolumeLinear,
        attack: 0.002,
        decay: 0.05,
        pitchMul: randPitch(),
      });
    },

    fuseWarn() {
      playTone({
        freq: 240,
        type: 'square',
        vol: 0.2,
        attack: 0.002,
        decay: 0.04,
        pitchMul: randPitch(),
      });
    },
  };

  window.KakoiAudio = AudioSys;
})();
