/* WebAudio の効果音。ファイルは置かない。先頭でピーク、残響は短い。 */
var KAudio = (function () {
  var ctx = null;
  var master = null;
  var enabled = true;

  function unlock() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return;
    if (!ctx) {
      ctx = new AC();
      master = ctx.createGain();
      master.gain.value = 0.85;
      master.connect(ctx.destination);
    }
    if (ctx.state === "suspended") ctx.resume();
  }

  function now() {
    return ctx ? ctx.currentTime : 0;
  }

  function tone(freq, dur, type, gain, slide) {
    if (!ctx || !enabled) return;
    var t = now();
    var osc = ctx.createOscillator();
    var g = ctx.createGain();
    osc.type = type || "square";
    osc.frequency.setValueAtTime(Math.max(40, freq), t);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(40, slide), t + dur);
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  function noise(dur, gain) {
    if (!ctx || !enabled) return;
    var n = Math.floor(ctx.sampleRate * dur);
    var buf = ctx.createBuffer(1, n, ctx.sampleRate);
    var data = buf.getChannelData(0);
    for (var i = 0; i < n; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / n);
    var src = ctx.createBufferSource();
    src.buffer = buf;
    var filter = ctx.createBiquadFilter();
    filter.type = "lowpass";
    filter.frequency.value = 900;
    var g = ctx.createGain();
    g.gain.value = gain;
    src.connect(filter);
    filter.connect(g);
    g.connect(master);
    src.start();
  }

  return {
    unlock: unlock,
    toggle: function () {
      enabled = !enabled;
      return enabled;
    },
    get enabled() {
      return enabled;
    },
    tick: function () {
      tone(520, 0.03, "square", 0.04, 700);
    },
    startLine: function () {
      tone(240, 0.05, "square", 0.06, 180);
    },
    cancel: function () {
      tone(180, 0.08, "triangle", 0.05, 90);
    },
    capture: function (count) {
      var base = 520 + Math.min(6, count) * 40;
      tone(base, 0.07, "square", 0.08, base * 1.02);
      tone(base * 1.25, 0.09, "square", 0.06, base * 1.5);
      tone(base * 1.5, 0.12, "triangle", 0.05, base * 2);
      if (count >= 4) tone(base * 2, 0.14, "square", 0.05, base * 2.4);
    },
    fizzle: function () {
      tone(200, 0.1, "triangle", 0.04, 120);
    },
    hit: function () {
      noise(0.12, 0.2);
      tone(150, 0.16, "square", 0.12, 48);
    },
    fuse: function () {
      tone(880, 0.05, "square", 0.05, 1320);
    },
    clear: function () {
      tone(523, 0.08, "square", 0.07, 523);
      tone(659, 0.1, "square", 0.06, 659);
      tone(784, 0.14, "triangle", 0.06, 1046);
    },
    fail: function () {
      tone(311, 0.16, "triangle", 0.08, 110);
      tone(196, 0.22, "square", 0.05, 80);
    },
    ui: function () {
      tone(660, 0.04, "square", 0.05, 880);
    },
  };
})();
