((global) => {
  'use strict';

  const TAU = Math.PI * 2;
  const FREQUENCIES = new Set([42, 96, 180]);

  function createState({ reducedMotion = false } = {}) {
    return {
      frequency: 96,
      targetFrequency: 96,
      amplitude: 0.62,
      resonance: 0,
      // The resting phase is a chosen representative state, not an arbitrary
      // zero: reduced motion and the static export freeze the field here, so
      // this is the outline a first-time visitor and every delivered image
      // actually see. Swept over 400 phases at 96 Hz (scripts/silhouette-bench.mjs):
      // 2.44 gives 8 separated silhouette features and a 39px saddle at u 0.31
      // while holding a 54.7px range, against 4 features and a 30px saddle at
      // phase 0. The optimum is broad (2.43-2.46 all score within 2%), so the
      // live drift does not slip off it.
      phase: 2.44,
      isPlaying: false,
      reducedMotion: Boolean(reducedMotion),
      probeX: null,
      probeStrength: 0
    };
  }

  function setProbe(state, x, strength = 1) {
    if (x === null || x === undefined) {
      return { ...state, probeX: null, probeStrength: 0 };
    }
    if (!Number.isFinite(x) || !Number.isFinite(strength)) {
      throw new TypeError('A finite probe position is required.');
    }
    return {
      ...state,
      probeX: Math.min(1, Math.max(0, x)),
      probeStrength: Math.min(1, Math.max(0, strength))
    };
  }

  function setFrequency(state, frequency) {
    if (!FREQUENCIES.has(frequency)) {
      throw new RangeError('Unsupported frequency: choose 42, 96 or 180 Hz.');
    }
    return { ...state, targetFrequency: frequency };
  }

  function setResonance(state, resonance) {
    if (!Number.isFinite(resonance)) {
      throw new TypeError('A finite resonance value is required.');
    }
    return { ...state, resonance: Math.min(1, Math.max(0, resonance)) };
  }

  function advanceState(state, deltaSeconds) {
    if (!Number.isFinite(deltaSeconds) || deltaSeconds < 0) {
      throw new TypeError('A finite, non-negative delta is required.');
    }
    const delta = Math.min(deltaSeconds, 0.05);
    const blend = state.reducedMotion ? 1 : 1 - Math.exp(-delta * 8);
    let frequency = state.reducedMotion
      ? state.targetFrequency
      : state.frequency + (state.targetFrequency - state.frequency) * blend;
    if (Math.abs(frequency - state.targetFrequency) < 0.25) frequency = state.targetFrequency;
    const phase = state.reducedMotion
      ? state.phase
      // The resting field breathes instead of boiling: a slower drift keeps the
      // contour family legible and lets a pointer dent read as the loudest
      // motion on screen (measured: idle churn must stay well below input).
      : state.phase + delta * (0.23 + frequency / 330) * TAU;
    return { ...state, frequency, phase };
  }

  function harmonicFor(frequency) {
    if (frequency <= 42) return 2.2;
    if (frequency <= 96) return 2.2 + (frequency - 42) * (1.9 / 54);
    if (frequency <= 180) return 4.1 + (frequency - 96) * (3.1 / 84);
    return 7.2;
  }

  function reliefAt(state, u, detailScale = 1, depth = 0) {
    if (!Number.isFinite(u)) {
      throw new TypeError('A finite position is required.');
    }
    const detail = Math.min(1, Math.max(0.2, Number.isFinite(detailScale) ? detailScale : 1));
    // Depth shears the same wave field instead of copying it. Each successive
    // trace samples the interference slightly later, so crests drift and the
    // contour family gathers and opens the way a real field does.
    const drift = Math.min(1, Math.max(0, Number.isFinite(depth) ? depth : 0));
    const phase = state.phase;
    const harmonic = harmonicFor(state.frequency);
    const amplitude = Math.max(0.04, state.amplitude);
    const centered = u - 0.5;
    const envelope = Math.exp(-Math.pow(centered * 2.4, 2));
    const travelling = Math.sin(u * TAU * harmonic + phase - drift * 1.15);
    const interference = Math.sin(u * TAU * (harmonic * 0.47 + 0.8) - phase * 0.63 + drift * 1.75);
    const detailWave = Math.sin(u * TAU * (harmonic * 1.7 + 1.4) - phase * 0.32 - drift * 2.6);
    // One flank is where the two wave families actually meet, so that is where
    // the contour spacing tightens. Gating the cross term to the left shoulder
    // makes the density asymmetric on purpose: tight ripples near u 0.29, open
    // swell toward the right. Without the gate the outline reads as one smooth
    // hump no matter which phase it is frozen at.
    const crossGate = Math.exp(-Math.pow((u - 0.29) / 0.2, 2));
    const crossWave = Math.sin(u * TAU * (harmonic * 1.12 + 2.1) - phase * 0.47 + drift * 2.05);
    const ridgeCenter = 0.47 + Math.sin(phase * 0.09 + drift * 0.7) * 0.03;
    // 0.18 rather than 0.23: the crest keeps its height but its flanks steepen,
    // so the peak separates from the shoulders instead of merging into them.
    const ridge = Math.exp(-Math.pow((u - ridgeCenter) / 0.18, 2));
    const leftShelf = Math.exp(-Math.pow((u - (0.24 + Math.sin(drift * 2.0 + 0.4) * 0.025)) / 0.17, 2)) * 0.2;
    const rightShoulder = Math.exp(-Math.pow((u - (0.75 - Math.sin(drift * 1.6 + 1.2) * 0.03)) / 0.16, 2)) * 0.36;
    // A real saddle between the crest and the right shoulder. At 0.02 the dip
    // was under a pixel deep and the two masses blended into one plateau.
    const saddle = Math.exp(-Math.pow((u - 0.62) / 0.085, 2)) * 0.05;
    const tension = 1 + state.resonance * ridge * 0.55;
    const wave = (travelling * 0.34 + interference * 0.26 + detailWave * 0.08 + crossWave * 0.26 * crossGate)
      * (0.28 + envelope * 0.72) * 0.5 * detail;
    const mountain = ridge * 0.58 + leftShelf + rightShoulder - saddle;
    const probe = Number.isFinite(state.probeX) && state.probeStrength > 0
      ? Math.exp(-Math.pow((u - state.probeX) / 0.14, 2)) * state.probeStrength
      : 0;
    // The pointer dent outweighs the resting drift, so a hand reads as the
    // cause of the shape it leaves (0.52 vs the 0.34 that vanished in it).
    return -(wave + mountain * 1.3 * tension + probe * 0.52) * amplitude;
  }

  // `density` overrides the row/sample count the `compact` branch would pick.
  // The act 2 preview strip needs it: a 120px tall field drawn at the desktop
  // 32 rows sits 2.5px apart and fills into one solid blob, so the strip runs
  // fewer traces over the same relief function.
  // `elevationScale` and `band` ([top, span] as fractions of height) re-fit the
  // same relief into a short canvas: the strip cannot borrow act 1's 0.22/0.64
  // band because a crest is ~0.9x elevation tall, so a taller silhouette needs
  // its band pushed down and compressed or the back row clips the top edge.
  function createRenderer(canvas, { density, elevationScale, band } = {}) {
    const context = canvas.getContext('2d');
    if (!context) return null;

    let width = 0;
    let height = 0;
    let destroyed = false;
    let currentState = null;
    let buffers = null;
    const rootStyles = getComputedStyle(document.documentElement);
    const vermilion = getComputedStyle(canvas).color || rootStyles.getPropertyValue('--vermilion').trim();
    const vermilionDeep = rootStyles.getPropertyValue('--vermilion-deep').trim() || vermilion;
    const ink = rootStyles.getPropertyValue('--ink').trim();
    const paper = rootStyles.getPropertyValue('--paper').trim();

    function ensureBuffers(rows, samples) {
      if (!buffers || buffers.rows !== rows || buffers.samples !== samples) {
        buffers = {
          rows,
          samples,
          stride: (samples + 1) * 2,
          relief: new Float32Array(samples + 1),
          points: new Float32Array(rows * (samples + 1) * 2),
          bases: new Float32Array(rows),
          centers: new Float32Array(rows),
          widths: new Float32Array(rows)
        };
      }
      return buffers;
    }

    function resize() {
      const bounds = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, 3);
      width = Math.max(1, bounds.width);
      height = Math.max(1, bounds.height);
      canvas.width = Math.round(width * ratio);
      canvas.height = Math.round(height * ratio);
      context.setTransform(ratio, 0, 0, ratio, 0, 0);
    }

    function render(state) {
      currentState = state;
      if (destroyed || !width || !height) return;
      context.clearRect(0, 0, width, height);

      const compact = width < 500;
      // 24 keeps the phone terrain at the same line rhythm as the 32-row desktop
      // field; the caption, the tests and the delivery notes all quote this number.
      const rows = (density && density.rows) || (compact ? 24 : 32);
      const samples = (density && density.samples) || (compact ? 320 : 576);
      const harmonic = harmonicFor(state.frequency);
      const phase = state.phase;
      const amplitude = Math.max(0.04, state.amplitude);
      const elevation = height * (Number.isFinite(elevationScale) ? elevationScale : 0.2);
      const bandTop = band && Number.isFinite(band[0]) ? band[0] : 0.22;
      const bandSpan = band && Number.isFinite(band[1]) ? band[1] : 0.64;
      const { stride, relief, points, bases, centers, widths } = ensureBuffers(rows, samples);

      context.save();
      context.lineJoin = 'round';
      context.lineCap = 'round';

      // 0.62, not the 0.3 it shipped with: at 0.3 the wave family was damped
      // hard enough that the phone outline collapsed to the smooth mountain
      // alone (2 features, no saddle) while desktop read as a structured field.
      // Measured across 96 phases x resonance {0, 0.55, 1} with the real
      // renderer (scripts/contour-tangle.mjs): 0 crossings and a 4.17px 2nd
      // percentile perpendicular gap at 0.62, the same as at 0.3, so the extra
      // detail costs nothing in contour legibility.
      const detailScale = compact ? 0.62 : 1;
      const foldFrequency = TAU * (harmonic * 0.31 + 0.6);
      for (let row = 0; row < rows; row++) {
        const depth = row / (rows - 1);
        const projectedDepth = Math.pow(depth, 1.24);
        const rhythm = (Math.sin(depth * 6.3 + phase * 0.04 + 0.9) * 0.016
          + Math.sin(depth * 12.9 - phase * 0.03 + 2.1) * 0.006)
          * height * projectedDepth;
        const baseY = height * (bandTop + projectedDepth * bandSpan) + rhythm;
        const rowWidth = width * (1.08 + projectedDepth * 0.1)
          * (1
            + Math.sin(projectedDepth * 3.1 + phase * 0.04 + 0.8) * 0.035
            + Math.sin(projectedDepth * 7.3 - phase * 0.03) * 0.012);
        const centerX = width * (0.5
          + Math.sin(projectedDepth * 2.2 + phase * 0.07 + 0.5) * (0.02 + projectedDepth * 0.02));
        bases[row] = baseY;
        centers[row] = centerX;
        widths[row] = rowWidth;
        const offset = row * stride;
        // A restrained vertical fold keeps the surface from reading as stacked
        // copies; the bundle wave below is what opens and closes the contour
        // spacing, so the fold no longer has to tangle the field.
        const foldDepth = projectedDepth * height * 0.052 * amplitude;
        const driftDepth = height * 0.014 * amplitude * Math.sin(Math.PI * depth);
        for (let point = 0; point <= samples; point++) {
          const u = point / samples;
          const relief = reliefAt(state, u, detailScale, depth) * elevation;
          const foregroundFold = foldDepth
            * (0.5 + 0.5 * Math.sin(u * foldFrequency - phase * 0.45 + projectedDepth * 1.7))
            + foldDepth * 0.26
              * (0.5 + 0.5 * Math.sin(u * foldFrequency * 2.13 + phase * 0.2 - projectedDepth * 2.6));
          const drift = driftDepth
            * (Math.sin(u * TAU * 1.1 + projectedDepth * 6.0 + 0.8) * 0.65
              + Math.sin(u * TAU * 0.63 - projectedDepth * 7.4 + 2.2) * 0.35);
          const bundle = height * 0.031 * amplitude * projectedDepth
            * Math.sin(u * TAU * 1.15 + projectedDepth * 7.2 - phase * 0.36);
          const index = offset + point * 2;
          points[index] = centerX + (u - 0.5) * rowWidth;
          points[index + 1] = baseY + relief + foregroundFold + drift + bundle;
        }
      }

      context.beginPath();
      for (let row = 0; row < rows; row++) {
        const offset = row * stride;
        context.moveTo(points[offset], points[offset + 1]);
        for (let point = 1; point <= samples; point++) {
          const index = offset + point * 2;
          context.lineTo(points[index], points[index + 1]);
        }
        if (row < rows - 1) {
          const next = (row + 1) * stride;
          for (let point = samples; point >= 0; point--) {
            const index = next + point * 2;
            context.lineTo(points[index], points[index + 1]);
          }
        } else {
          const rightX = centers[row] + widths[row] * 0.5;
          const leftX = centers[row] - widths[row] * 0.5;
          const bottomY = bases[row] + height * 0.02;
          context.lineTo(rightX, bottomY);
          context.quadraticCurveTo(centers[row], bottomY + height * 0.14, leftX, bottomY);
        }
        context.closePath();
      }
      context.globalAlpha = 1;
      context.fillStyle = vermilion;
      if (typeof context.createLinearGradient === 'function') {
        try {
          const field = context.createLinearGradient(0, height * 0.03, 0, height);
          field.addColorStop(0, vermilion);
          field.addColorStop(0.82, vermilion);
          field.addColorStop(1, vermilionDeep);
          context.fillStyle = field;
        } catch {
          context.fillStyle = vermilion;
        }
      }
      context.fill();

      const accentRows = new Set([
        0,
        Math.round((rows - 1) * 0.28),
        Math.round((rows - 1) * 0.62)
      ]);
      for (let row = 0; row < rows; row++) {
        const offset = row * stride;
        const depth = row / (rows - 1);
        context.beginPath();
        context.moveTo(points[offset], points[offset + 1]);
        for (let point = 1; point <= samples; point++) {
          const index = offset + point * 2;
          context.lineTo(points[index], points[index + 1]);
        }
        const accent = accentRows.has(row);
        const silhouette = row === 0;
        const major = !accent && row % 4 === 0;
        const band = 0.5 + 0.5 * Math.sin(depth * 17.4 + phase * 0.06 + 0.4);
        context.globalAlpha = accent
          ? (silhouette ? 0.96 : 0.76)
          : major
            ? 0.34 + depth * 0.13
            : 0.13 + depth * 0.14 + band * 0.05;
        context.strokeStyle = accent ? paper : ink;
        context.lineWidth = accent
          ? (row === 0 ? 1.35 : 1.05)
          : major
            ? 0.74 + depth * 0.14
            : 0.45 + depth * 0.12 + band * 0.04;
        context.stroke();
      }

      const rimX = widths[rows - 1] * 0.5;
      const rimY = bases[rows - 1] + height * 0.02;
      context.beginPath();
      context.moveTo(centers[rows - 1] + rimX, rimY);
      context.quadraticCurveTo(centers[rows - 1], rimY + height * 0.14, centers[rows - 1] - rimX, rimY);
      context.globalAlpha = 0.88;
      context.strokeStyle = paper;
      context.lineWidth = 1.1;
      context.stroke();
      context.globalAlpha = 1;

      const markerRow = Math.round((rows - 1) * 0.28);
      const markerOffset = markerRow * stride;
      const markerRadius = compact ? 1.7 : 2.3;
      context.beginPath();
      for (const u of [0.14, 0.26, 0.38, 0.5, 0.62, 0.74, 0.86]) {
        const index = markerOffset + Math.round(u * samples) * 2;
        const x = points[index];
        const y = points[index + 1];
        context.moveTo(x, y - markerRadius);
        context.lineTo(x + markerRadius, y);
        context.lineTo(x, y + markerRadius);
        context.lineTo(x - markerRadius, y);
        context.closePath();
      }
      context.globalAlpha = 0.92;
      context.fillStyle = paper;
      context.fill();

      context.restore();
    }

    function destroy() {
      destroyed = true;
      observer.disconnect();
    }

    const observer = new ResizeObserver(() => {
      resize();
      if (currentState) render(currentState);
    });
    observer.observe(canvas);
    resize();

    return { render, resize, destroy };
  }

  function createAudioController({ AudioContextClass = global.AudioContext || global.webkitAudioContext } = {}) {
    let context = null;
    let master = null;
    let oscillators = [];
    let state = { isPlaying: false, muted: false, frequency: 96 };
    let startToken = 0;
    const RESUME_TIMEOUT = 3500;
    const SUSPEND_TIMEOUT = 1500;
    // Release envelope for pause: the gain time constant and the wall-clock tail
    // that has to elapse before the context is allowed to freeze.
    const RELEASE_TIME = 0.07;
    const RELEASE_TAIL = 240;

    function ensureContext() {
      if (context) return;
      if (!AudioContextClass) throw new Error('Web Audio is not supported in this browser.');
      context = new AudioContextClass();

      const fundamental = context.createOscillator();
      const harmonic = context.createOscillator();
      const fundamentalGain = context.createGain();
      const harmonicGain = context.createGain();
      master = context.createGain();

      fundamental.type = 'sine';
      harmonic.type = 'sine';
      fundamental.frequency.setValueAtTime(state.frequency, context.currentTime);
      harmonic.frequency.setValueAtTime(state.frequency * 2, context.currentTime);
      fundamentalGain.gain.setValueAtTime(0.72, context.currentTime);
      harmonicGain.gain.setValueAtTime(0.16, context.currentTime);
      master.gain.setValueAtTime(0.0001, context.currentTime);

      fundamental.connect(fundamentalGain);
      harmonic.connect(harmonicGain);
      fundamentalGain.connect(master);
      harmonicGain.connect(master);
      master.connect(context.destination);
      fundamental.start();
      harmonic.start();
      oscillators = [fundamental, harmonic];
    }

    function setFrequency(frequency) {
      if (!FREQUENCIES.has(frequency)) {
        throw new RangeError('Unsupported frequency: choose 42, 96 or 180 Hz.');
      }
      state = { ...state, frequency };
      if (context) {
        // A short glide instead of a jump: the oscillator reaches the new pitch in
        // roughly 200 ms, which keeps a 42→180 Hz retune from clicking.
        oscillators.forEach((oscillator, index) => {
          oscillator.frequency.setTargetAtTime(frequency * (index + 1), context.currentTime, 0.055);
        });
      }
    }

    async function start(frequency) {
      setFrequency(frequency);
      ensureContext();
      const token = ++startToken;
      let timer;
      try {
        await Promise.race([
          context.resume(),
          new Promise((_, reject) => {
            timer = setTimeout(() => reject(new Error('Audio resume timed out.')), RESUME_TIMEOUT);
          })
        ]);
      } catch (error) {
        master.gain.setTargetAtTime(0, context.currentTime, 0.01);
        if (context.state === 'running') {
          try { await context.suspend(); } catch { /* stay silent */ }
        }
        throw error;
      } finally {
        clearTimeout(timer);
      }
      if (token !== startToken) {
        master.gain.setTargetAtTime(0, context.currentTime, 0.01);
        if (context.state === 'running') {
          try { await context.suspend(); } catch { /* stay silent */ }
        }
        return false;
      }
      state = { ...state, isPlaying: true };
      master.gain.setTargetAtTime(state.muted ? 0 : 0.11, context.currentTime, 0.04);
      return true;
    }

    function cancel() {
      startToken++;
      state = { ...state, isPlaying: false };
      if (!context) return;
      master.gain.setTargetAtTime(0, context.currentTime, 0.01);
      if (context.state === 'running') {
        context.suspend().catch(() => {});
      }
    }

    async function pause() {
      const token = ++startToken;
      if (!context) {
        state = { ...state, isPlaying: false };
        return;
      }
      // Suspending freezes the audio clock, so an immediate suspend cuts the tone
      // with a click. Let the master gain decay on an audible tail first, then stop.
      master.gain.setTargetAtTime(0, context.currentTime, RELEASE_TIME);
      let tailTimer;
      let suspendTimer;
      try {
        await new Promise((resolve) => {
          tailTimer = setTimeout(resolve, RELEASE_TAIL);
        });
        if (token === startToken) {
          await Promise.race([
            context.suspend(),
            new Promise((_, reject) => {
              suspendTimer = setTimeout(() => reject(new Error('Audio suspend timed out.')), SUSPEND_TIMEOUT);
            })
          ]);
        }
      } catch {
        // A suspend can reject or stall while the tab is being torn down. The
        // master gain is already at zero, so the interface must still report paused.
      } finally {
        clearTimeout(tailTimer);
        clearTimeout(suspendTimer);
        // A start() that landed during the tail owns the context now; it must
        // keep playing instead of inheriting this pause.
        if (token === startToken) state = { ...state, isPlaying: false };
      }
    }

    function setMuted(muted) {
      state = { ...state, muted: Boolean(muted) };
      if (!context) return;
      // Never open the master gain unless audio is genuinely running. Unmuting while
      // paused should only update intent; start() is what makes the output audible.
      const audible = !state.muted && state.isPlaying && context.state === 'running';
      master.gain.setTargetAtTime(audible ? 0.11 : 0, context.currentTime, 0.025);
    }

    function getState() {
      return { ...state };
    }

    return { start, cancel, setFrequency, pause, setMuted, getState };
  }

  const api = {
    createState,
    setFrequency,
    setResonance,
    setProbe,
    advanceState,
    harmonicFor,
    reliefAt,
    createRenderer,
    createAudioController
  };

  if (typeof module !== 'undefined' && module.exports) {
    module.exports = api;
  }
  global.Resonance = api;
})(typeof globalThis !== 'undefined' ? globalThis : window);
