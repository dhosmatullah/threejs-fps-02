// Every sound is synthesised with WebAudio: no audio files, no network. Short filtered
// noise bursts make the gunshots and the explosion, oscillators make the beeps, clicks
// and the little round jingles. The context is created lazily on the first user gesture
// (the Play click), so nothing tries to make noise before the browser allows it.
export function createAudio() {
  let ctx = null;
  let master = null;

  function ensure() {
    if (ctx) {
      if (ctx.state === 'suspended') ctx.resume();
      return true;
    }
    try {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      master = ctx.createGain();
      master.gain.value = 0.5;
      master.connect(ctx.destination);
      return true;
    } catch {
      return false;
    }
  }

  // One reusable noise buffer, filled once.
  let noiseBuffer = null;
  function noise() {
    if (!noiseBuffer) {
      noiseBuffer = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
      const data = noiseBuffer.getChannelData(0);
      for (let i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    }
    return noiseBuffer;
  }

  function burst({ duration = 0.12, freq = 1200, q = 0.8, gain = 0.5, type = 'lowpass', sweepTo = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime;
    const src = ctx.createBufferSource();
    src.buffer = noise();
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.setValueAtTime(freq, t);
    if (sweepTo > 0) filter.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    filter.Q.value = q;
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    src.connect(filter).connect(g).connect(master);
    src.start(t);
    src.stop(t + duration + 0.02);
  }

  function tone({ freq = 440, duration = 0.09, gain = 0.2, type = 'square', when = 0, sweepTo = 0 }) {
    if (!ensure()) return;
    const t = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t);
    if (sweepTo > 0) osc.frequency.exponentialRampToValueAtTime(sweepTo, t + duration);
    const g = ctx.createGain();
    g.gain.setValueAtTime(gain, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + duration);
    osc.connect(g).connect(master);
    osc.start(t);
    osc.stop(t + duration + 0.02);
  }

  return {
    unlock() {
      ensure();
    },
    shot(kind) {
      if (kind === 'sniper') {
        burst({ duration: 0.32, freq: 3000, gain: 0.8, sweepTo: 120 });
        tone({ freq: 120, duration: 0.22, gain: 0.5, type: 'sine', sweepTo: 40 });
      } else if (kind === 'shotgun') {
        burst({ duration: 0.24, freq: 1600, gain: 0.75, sweepTo: 200 });
      } else if (kind === 'smg') {
        burst({ duration: 0.08, freq: 2400, gain: 0.4, sweepTo: 500 });
      } else if (kind === 'pistol') {
        burst({ duration: 0.1, freq: 2000, gain: 0.45, sweepTo: 400 });
      } else {
        burst({ duration: 0.14, freq: 2200, gain: 0.55, sweepTo: 300 });
      }
    },
    enemyShot() {
      burst({ duration: 0.1, freq: 1500, gain: 0.16, sweepTo: 300 });
    },
    dryFire() {
      tone({ freq: 1400, duration: 0.03, gain: 0.12 });
    },
    reloadStart() {
      tone({ freq: 700, duration: 0.04, gain: 0.15 });
      tone({ freq: 500, duration: 0.04, gain: 0.15, when: 0.09 });
    },
    reloadEnd() {
      tone({ freq: 900, duration: 0.04, gain: 0.18 });
      tone({ freq: 1300, duration: 0.05, gain: 0.18, when: 0.06 });
    },
    hit(killed) {
      tone({ freq: killed ? 1560 : 1180, duration: 0.05, gain: 0.22, type: 'sine' });
      if (killed) tone({ freq: 1900, duration: 0.07, gain: 0.18, type: 'sine', when: 0.05 });
    },
    hurt() {
      tone({ freq: 190, duration: 0.12, gain: 0.3, type: 'sawtooth', sweepTo: 90 });
    },
    throwWhoosh() {
      burst({ duration: 0.16, freq: 900, gain: 0.12, type: 'bandpass', sweepTo: 2400 });
    },
    explosion() {
      burst({ duration: 0.7, freq: 900, gain: 0.9, sweepTo: 60 });
      tone({ freq: 70, duration: 0.6, gain: 0.7, type: 'sine', sweepTo: 30 });
    },
    flashPop() {
      burst({ duration: 0.2, freq: 4000, gain: 0.4, type: 'highpass' });
      tone({ freq: 3200, duration: 0.3, gain: 0.1, type: 'sine' });
    },
    beep(final = false) {
      tone({ freq: final ? 1760 : 1180, duration: final ? 0.3 : 0.06, gain: 0.2, type: 'sine' });
    },
    plant() {
      tone({ freq: 880, duration: 0.06, gain: 0.2 });
      tone({ freq: 880, duration: 0.06, gain: 0.2, when: 0.15 });
      tone({ freq: 1320, duration: 0.1, gain: 0.22, when: 0.3 });
    },
    buy() {
      tone({ freq: 1040, duration: 0.05, gain: 0.18, type: 'triangle' });
      tone({ freq: 1560, duration: 0.07, gain: 0.18, type: 'triangle', when: 0.05 });
    },
    denied() {
      tone({ freq: 220, duration: 0.09, gain: 0.2, type: 'square' });
    },
    roundWin() {
      tone({ freq: 660, duration: 0.11, gain: 0.2, type: 'triangle' });
      tone({ freq: 880, duration: 0.11, gain: 0.2, type: 'triangle', when: 0.11 });
      tone({ freq: 1320, duration: 0.2, gain: 0.22, type: 'triangle', when: 0.22 });
    },
    roundLose() {
      tone({ freq: 520, duration: 0.13, gain: 0.2, type: 'triangle' });
      tone({ freq: 390, duration: 0.13, gain: 0.2, type: 'triangle', when: 0.13 });
      tone({ freq: 262, duration: 0.24, gain: 0.2, type: 'triangle', when: 0.26 });
    },
    step() {
      burst({ duration: 0.05, freq: 500, gain: 0.05, sweepTo: 200 });
    },
  };
}
