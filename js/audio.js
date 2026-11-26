// Synthesized Web Audio API sound effects (zero external assets required)
window.QL = window.QL || {};

(function () {
  let ctx = null;
  let muted = localStorage.getItem('ql_muted') === '1';

  function getCtx() {
    if (muted) return null;
    if (!ctx && (window.AudioContext || window.webkitAudioContext)) {
      const AC = window.AudioContext || window.webkitAudioContext;
      ctx = new AC();
    }
    if (ctx && ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }
    return ctx;
  }

  function tone(freq, dur, type = 'sine', vol = 0.12, delay = 0) {
    const c = getCtx();
    if (!c) return;
    const now = c.currentTime + delay;
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(vol, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now);
    osc.stop(now + dur + 0.02);
  }

  window.QL.audio = {
    isMuted: () => muted,
    toggle() {
      muted = !muted;
      localStorage.setItem('ql_muted', muted ? '1' : '0');
      if (!muted) this.click();
      return muted;
    },
    click() {
      tone(580, 0.06, 'triangle', 0.08);
    },
    join() {
      tone(523.25, 0.1, 'sine', 0.1, 0);
      tone(659.25, 0.14, 'sine', 0.1, 0.08);
    },
    tick(urgent = false) {
      tone(urgent ? 880 : 440, 0.06, urgent ? 'square' : 'triangle', urgent ? 0.07 : 0.05);
    },
    lock() {
      tone(493.88, 0.08, 'triangle', 0.09, 0);
      tone(740, 0.12, 'triangle', 0.09, 0.06);
    },
    correct() {
      tone(523.25, 0.11, 'triangle', 0.12, 0);
      tone(659.25, 0.11, 'triangle', 0.12, 0.09);
      tone(783.99, 0.18, 'triangle', 0.14, 0.18);
    },
    wrong() {
      tone(220, 0.16, 'sawtooth', 0.08, 0);
      tone(185, 0.24, 'sawtooth', 0.08, 0.14);
    },
    reveal() {
      tone(392, 0.1, 'sine', 0.1, 0);
      tone(523.25, 0.16, 'sine', 0.12, 0.09);
    },
    fanfare() {
      const notes = [523.25, 659.25, 783.99, 1046.5];
      notes.forEach((n, i) => tone(n, i === 3 ? 0.4 : 0.14, 'triangle', 0.13, i * 0.11));
    }
  };
})();
