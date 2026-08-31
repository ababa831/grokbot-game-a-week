/**
 * WebAudio SE — punchy peaks, short tails. Flip / land / hurt / clear.
 */
(function () {
  const C = () => window.FLIP_GRAVITY_CONFIG;

  let ctx = null;
  let muted = false;
  let ambientNodes = null;
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

  function playWithTail(fn, volScale) {
    fn(1);
    setTimeout(() => {
      if (muted) return;
      fn(volScale || 0.28);
    }, Math.floor((C().attackReverbTailSeconds || 0.2) * 1000 * 0.35));
  }

  const AudioSys = {
    unlock() {
      ensureCtx();
      this.startAmbient();
    },

    toggleMute() {
      muted = !muted;
      if (muted) this.stopAmbient();
      else this.startAmbient();
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

    flip() {
      const p = randPitch();
      const base = C().flipVolumeLinear;
      playWithTail((scale) => {
        playTone({
          freq: 180,
          type: 'sawtooth',
          vol: base * 0.7 * scale,
          attack: 0.002,
          decay: C().attackPeakDecaySeconds,
          pitchMul: p,
        });
        playTone({
          freq: 420,
          type: 'triangle',
          vol: base * 0.55 * scale,
          attack: 0.003,
          decay: 0.1,
          pitchMul: p,
        });
        playNoiseBurst({
          vol: base * 0.5 * scale,
          decay: 0.07,
          filterFreq: 900,
          pitchMul: p,
        });
      }, 0.2);
    },

    land() {
      const p = randPitch();
      playNoiseBurst({
        vol: C().landVolumeLinear,
        decay: C().hitClickDecaySeconds,
        filterFreq: 700,
        pitchMul: p,
      });
      playTone({
        freq: 110,
        type: 'square',
        vol: C().landVolumeLinear * 0.6,
        attack: 0.002,
        decay: 0.05,
        pitchMul: p,
      });
    },

    hurt() {
      const p = randPitch();
      playTone({
        freq: 160,
        type: 'sawtooth',
        vol: C().hurtVolumeLinear,
        attack: 0.002,
        decay: 0.12,
        pitchMul: p,
      });
      playNoiseBurst({
        vol: C().hurtVolumeLinear * 0.6,
        decay: 0.1,
        filterFreq: 400,
        pitchMul: p,
      });
    },

    clear() {
      const p = randPitch();
      playTone({
        freq: 440,
        type: 'triangle',
        vol: C().clearVolumeLinear * 0.7,
        attack: 0.004,
        decay: 0.12,
        pitchMul: p,
      });
      setTimeout(() => {
        playTone({
          freq: 660,
          type: 'triangle',
          vol: C().clearVolumeLinear * 0.55,
          attack: 0.004,
          decay: 0.16,
          pitchMul: p,
        });
      }, 55);
    },

    ko() {
      const p = randPitch();
      playNoiseBurst({
        vol: C().koVolumeLinear,
        decay: 0.16,
        filterFreq: 500,
        pitchMul: p,
      });
      playTone({
        freq: 70,
        type: 'sawtooth',
        vol: C().koVolumeLinear * 0.85,
        attack: 0.002,
        decay: 0.18,
        pitchMul: p,
      });
    },
  };

  window.FlipGravityAudio = AudioSys;
})();
