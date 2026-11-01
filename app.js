(() => {
  'use strict';

  const root = document.documentElement;
  const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
  const canvas = document.querySelector('#resonance-canvas');
  const previewCanvas = document.querySelector('#preview-canvas');
  const previewWrap = document.querySelector('.spectrum-preview');
  const phaseReadout = document.querySelector('#phase-readout');
  const amplitudeReadout = document.querySelector('#amplitude-readout');
  const tensionReadout = document.querySelector('#tension-readout');
  const frequencyReadout = document.querySelector('#frequency-readout');
  const spectrumReadout = document.querySelector('#spectrum-readout');
  const afterglowFrequency = document.querySelector('#afterglow-frequency');
  const axisFrequency = document.querySelector('#axis-frequency');
  const frequencyAxis = document.querySelector('.frequency-axis');
  const instrument = document.querySelector('#instrument');
  const sceneNavLinks = [...document.querySelectorAll('.scene-nav a')];
  const startButton = document.querySelector('#start-button');
  const muteButtons = [...document.querySelectorAll('[data-mute]')];
  const restartButton = document.querySelector('#restart-button');
  const silenceButton = document.querySelector('#silence-button');
  const frequencyButtons = [...document.querySelectorAll('button[data-frequency]')];
  const headerState = document.querySelector('#header-state');
  const modeReadout = document.querySelector('#mode-readout');
  const audioStatus = document.querySelector('#audio-status');
  const residualTrace = document.querySelector('#residual-trace');
  const residualEchoA = document.querySelector('#residual-echo-a');
  const residualEchoB = document.querySelector('#residual-echo-b');
  const residualDecay = document.querySelector('#residual-decay');
  const residualResidue = document.querySelector('#residual-residue');
  const residualTraces = document.querySelector('#residual-traces');
  const residualPeak = document.querySelector('#residual-peak');
  const residualNode = document.querySelector('.residual-node');
  const residualEnvUpper = document.querySelector('#residual-env-upper');
  const residualEnvLower = document.querySelector('#residual-env-lower');
  const residualExplain = document.querySelector('#residual-explain-note');
  const residualLine = document.querySelector('.residual-line');
  const residualCursor = document.querySelector('.residual-cursor');
  const residualReadout = document.querySelector('#residual-readout');
  const residualLive = document.querySelector('#residual-live');
  const fallback = document.querySelector('#instrument-fallback');
  const sceneToggles = [...document.querySelectorAll('[data-scene-toggle]')];
  const sceneStates = [...document.querySelectorAll('[data-scene-state]')];
  const sceneMessages = [...document.querySelectorAll('[data-scene-message]')];
  const afterglowScene = document.querySelector('#act-afterglow');
  const TAU = Math.PI * 2;
  const R = window.Resonance;
  const decayCycles = { 42: 2.6, 96: 4.8, 180: 8.4 };
  const decayRates = { 42: 2.6, 96: 3.2, 180: 4.0 };
  // The explain line speaks in the tense of the record: future while the plot is
  // still waiting for a first vibration, past once one has been written.
  const EXPLAIN_WRITTEN = '这条线记录最近一次振动：<span class="nowrap">横轴</span>是停手后的四秒，<span class="nowrap">纵轴</span>是残留的振幅，<span class="nowrap">高度即力度</span>；指针或方向键可读任意时刻。';
  const EXPLAIN_EMPTY = '这里还没有记录。<span class="nowrap">起振一次</span>，停手后的四秒会写在这条轴上，<span class="nowrap">纵轴</span>是残留的振幅；虚线是它的上限。';

  function smoothPath(vertices) {
    const fixed = (value) => value.toFixed(2);
    let d = `M${fixed(vertices[0][0])} ${fixed(vertices[0][1])}`;
    for (let index = 0; index < vertices.length - 1; index++) {
      const before = vertices[index - 1] || vertices[index];
      const start = vertices[index];
      const end = vertices[index + 1];
      const after = vertices[index + 2] || end;
      const c1x = start[0] + (end[0] - before[0]) / 6;
      const c1y = start[1] + (end[1] - before[1]) / 6;
      const c2x = end[0] - (after[0] - start[0]) / 6;
      const c2y = end[1] - (after[1] - start[1]) / 6;
      d += ` C${fixed(c1x)} ${fixed(c1y)} ${fixed(c2x)} ${fixed(c2y)} ${fixed(end[0])} ${fixed(end[1])}`;
    }
    return d;
  }

  // The record is measured, not composed: 64 units is the range the dashed
  // envelope promises, and `swing` is how much of that range the vibration that
  // stopped actually filled. 1.00 reproduces the full envelope.
  function residualPath(frequency, swing = 1) {
    const cycles = decayCycles[frequency] || decayCycles[96];
    const rate = decayRates[frequency] || decayRates[96];
    const steps = frequency >= 180 ? 200 : 140;
    const vertices = [];
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      const decay = Math.exp(-rate * t);
      const x = 1200 * t;
      const y = 90 - Math.cos(t * TAU * cycles + 0.08) * 64 * swing * decay;
      vertices.push([x, y]);
    }
    return smoothPath(vertices);
  }

  // The record spans four seconds after the sound stops; T+ readouts use it.
  const WINDOW_SECONDS = 4.0;
  let residualT = 0.25;

  // The tuning the decay plot speaks for: the recorded vibration's, or the current
  // one while the plot is still empty and only previewing its range.
  function recordFrequency() {
    const target = state ? state.targetFrequency : 96;
    return recordedFrequency === null ? target : recordedFrequency;
  }

  // The ±1 amplitude boundary of the decay: 64 units at T+0, e-folded by the rate.
  // sign -1 draws the upper edge, +1 the lower one.
  function residualEnvelope(rate, sign) {
    const steps = 96;
    const vertices = [];
    for (let index = 0; index <= steps; index++) {
      const t = index / steps;
      vertices.push([1200 * t, 90 + sign * 64 * Math.exp(-rate * t)]);
    }
    return smoothPath(vertices);
  }

  function residualPoint(t) {
    const target = recordFrequency();
    const cycles = decayCycles[target] || decayCycles[96];
    const rate = decayRates[target] || decayRates[96];
    const decay = Math.exp(-rate * t);
    // The readout quotes the same fraction of the promised range that the drawn
    // trace is standing at, so a soft record never reads as a full one.
    const swing = Math.cos(t * TAU * cycles + 0.08) * decay * recordedSwing;
    return { swing, y: 90 - swing * 64 };
  }

  function showResidualCursor(t, announce) {
    // Nothing to read before a first vibration; the empty plot says so itself.
    if (root.dataset.record === 'empty') return;
    residualT = Math.min(1, Math.max(0, t));
    const point = residualPoint(residualT);
    residualLine.classList.add('is-reading');
    residualCursor.style.setProperty('--cursor-x', `${(residualT * 100).toFixed(2)}%`);
    residualCursor.style.setProperty('--cursor-y', `${((point.y / 180) * 100).toFixed(2)}%`);
    const shift = residualT < 0.15 ? '0%' : residualT > 0.85 ? '-100%' : '-50%';
    residualReadout.style.transform = `translateX(${shift})`;
    residualReadout.textContent = `T+${(residualT * WINDOW_SECONDS).toFixed(1)} S / AMP ${point.swing.toFixed(2)}`;
    if (announce) {
      residualLive.textContent = `T 加 ${(residualT * WINDOW_SECONDS).toFixed(1)} 秒，残留振幅 ${point.swing.toFixed(2)}`;
    }
  }

  function hideResidualCursor() {
    residualLine.classList.remove('is-reading');
  }

  residualLine.addEventListener('pointermove', (event) => {
    // Touch drags are scrolls, not readings; a tap reads instead.
    if (event.pointerType === 'touch') return;
    const rect = residualLine.getBoundingClientRect();
    if (rect.width <= 0) return;
    showResidualCursor((event.clientX - rect.left) / rect.width, false);
  });
  residualLine.addEventListener('pointerdown', (event) => {
    if (event.pointerType !== 'touch') return;
    const rect = residualLine.getBoundingClientRect();
    if (rect.width <= 0) return;
    showResidualCursor((event.clientX - rect.left) / rect.width, false);
  });
  document.addEventListener('pointerdown', (event) => {
    if (event.pointerType === 'touch' && !residualLine.contains(event.target)) hideResidualCursor();
  });
  residualLine.addEventListener('pointerleave', hideResidualCursor);
  residualLine.addEventListener('focus', () => showResidualCursor(residualT, false));
  residualLine.addEventListener('blur', hideResidualCursor);
  residualLine.addEventListener('keydown', (event) => {
    const step = event.shiftKey ? 0.01 : 0.05;
    if (event.key === 'ArrowRight') showResidualCursor(residualT + step, true);
    else if (event.key === 'ArrowLeft') showResidualCursor(residualT - step, true);
    else if (event.key === 'Home') showResidualCursor(0, true);
    else if (event.key === 'End') showResidualCursor(1, true);
    else if (event.key === 'Escape') hideResidualCursor();
    else return;
    event.preventDefault();
  });

  let state = R ? R.createState({ reducedMotion: motionQuery.matches }) : null;
  const audio = R ? R.createAudioController() : null;
  let renderer = null;
  let previewRenderer = null;
  let frame = 0;
  let previousTime = 0;
  let amplitudeTarget = 0.62;
  // Striking the instrument blooms the field once and lets it settle back, so
  // the onset of sound carries a visible onset of shape. Silence cancels it.
  let strikeAt = 0;
  function strikeMultiplier(now) {
    if (!strikeAt || (state && state.reducedMotion)) return 1;
    const age = (now - strikeAt) / 1000;
    if (age < 0 || age > 5) return 1;
    return 1 + 0.3 * Math.min(1, age / 0.14) * Math.exp(-age / 0.9);
  }
  function amplitudeGoal(now = performance.now()) {
    return amplitudeTarget * strikeMultiplier(now);
  }
  let audioQueue = Promise.resolve();
  let lifecycle = 'idle';
  let pendingStart = false;
  let suppressAfterglowPause = false;
  // Which record the write-on last drew: tuning plus the height that tuning was
  // stopped at. The stroke replays when either changed, not on every scroll back
  // into the act.
  let drawnResidualToken = null;
  // Tuning of the vibration that actually happened: frozen at the strike, moved by
  // a retune only while live. Null until the instrument has vibrated once, which is
  // what separates an honest empty plot from a curve nothing produced.
  let recordedFrequency = null;
  // Share of the promised range the recorded vibration filled, written when its
  // sound stops. 1 until then: before a stop has happened the plot shows the range
  // itself, not a height nothing earned.
  let recordedSwing = 1;

  // How hard the instrument was played, as a fraction of how hard it can be
  // played: the highest the field reached during the vibration, divided by the
  // peak the same tuning can reach at full tension with the pointer on its crest.
  // reliefAt is linear in amplitude, so dividing one peak by another cancels the
  // scene's own fade: scrolling into act 3 cannot change the reading, only the
  // hand can. Measured at 96 Hz: the resting field 0.52, full tension alone 0.75,
  // full tension with the pointer pressed on the crest 1.00.
  function swingOf(snapshot) {
    if (!snapshot || !R || !R.reliefAt) return 1;
    const peakOf = (sample) => {
      let highest = 0;
      for (let index = 0; index <= 160; index++) {
        highest = Math.max(highest, Math.abs(R.reliefAt(sample, index / 160)));
      }
      return highest;
    };
    const ceiling = peakOf({ ...snapshot, resonance: 1, probeX: 0.47, probeStrength: 1 });
    if (!(ceiling > 0)) return 1;
    return Math.min(1, Math.max(0, peakOf(snapshot) / ceiling));
  }

  // The best reading of the vibration running right now. Sampling keeps following
  // it because a hand that lets go of the terrain before the sound stops has still
  // played harder than the resting field it ends on.
  let livePeak = 1;
  let peakSampleAt = 0;
  function observePeak(now = performance.now(), force = false) {
    if (!state || !state.isPlaying) return;
    if (!force && now - peakSampleAt < 90) return;
    peakSampleAt = now;
    const reading = swingOf(state);
    if (reading > livePeak) livePeak = reading;
  }
  // Which record state the interface last applied; null forces the first
  // syncInterface to write the empty-state copy into the explain line.
  let appliedRecordState = null;
  let pausedForVisibility = false;
  let pointerEngaged = false;
  let autoTension = false;
  let intentVersion = 0;

  function queueAudio(operation) {
    const queued = audioQueue.then(operation, operation);
    audioQueue = queued.catch(() => {});
    return queued;
  }

  function syncTensionAria() {
    if (!state || !canvas) return;
    const percent = Math.round(state.resonance * 100);
    canvas.setAttribute('aria-valuenow', String(percent));
    canvas.setAttribute('aria-valuetext', `${percent}% 张力`);
  }

  function renderReadouts() {
    if (!state) return;
    phaseReadout.textContent = (state.phase % TAU).toFixed(2);
    amplitudeReadout.textContent = state.amplitude.toFixed(2);
    tensionReadout.textContent = state.resonance.toFixed(2);
    const target = Math.round(state.targetFrequency);
    frequencyReadout.textContent = `${target} Hz`;
    spectrumReadout.textContent = `${target} Hz`;
  }

  function render() {
    if (!state) return;
    if (renderer) renderer.render(state);
    if (previewRenderer) previewRenderer.render(state);
    renderReadouts();
  }

  function headerLabel(audioState) {
    if (lifecycle === 'error') return '启动失败';
    if (lifecycle === 'starting') return '正在启动';
    if (state.isPlaying) return audioState.muted ? '振动 / 已静音' : '共振进行中';
    if (lifecycle === 'paused') return '已暂停';
    return '静默待机';
  }

  // Writing the same value back would not restart the stroke, so the gate drops,
  // the style is flushed, and the trace draws itself in again at its new height.
  // A scene entry lands here too, one frame into the first stroke, which is early
  // enough that it reads as the stroke starting rather than as a second one.
  function replayResidualStroke() {
    root.dataset.residual = 'settled';
    residualLine.getBoundingClientRect();
    root.dataset.residual = 'draw';
  }

  function syncInterface(message) {
    if (!state || !audio) return;
    const audioState = audio.getState();
    const target = state.targetFrequency;
    // The record belongs to the vibration that happened, not to the dial: before
    // the first strike the plot stays empty and says so, afterwards it keeps the
    // tuning it was written at.
    const record = recordedFrequency;
    const recordState = record === null ? 'empty' : 'written';
    const recordToken = record === null ? null : `${record}/${recordedSwing.toFixed(3)}`;
    if (recordState !== appliedRecordState) {
      appliedRecordState = recordState;
      root.dataset.record = recordState;
      residualExplain.innerHTML = record === null ? EXPLAIN_EMPTY : EXPLAIN_WRITTEN;
      if (record === null) hideResidualCursor();
    }
    // A record whose shape changed while the act was on screen writes itself in
    // rather than swapping under the reader's eye: that is what happens when the
    // sound stops and the height the hand earned gets written down. Changing it
    // in another act leaves the token unconsumed, so the next entry draws it in.
    if (recordToken === null) {
      drawnResidualToken = null;
    } else if (recordToken !== drawnResidualToken && root.dataset.scene === 'afterglow') {
      drawnResidualToken = recordToken;
      replayResidualStroke();
    }
    const recordFreq = record === null ? target : record;
    root.dataset.playing = String(state.isPlaying);
    root.dataset.muted = String(audioState.muted);
    root.dataset.frequency = String(target);
    root.dataset.status = lifecycle;
    renderReadouts();
    const padded = String(recordFreq).padStart(3, '0');
    afterglowFrequency.textContent = record === null ? '--- / Hz' : `${padded} / Hz`;
    axisFrequency.textContent = String(target).padStart(3, '0');
    frequencyAxis.style.setProperty('--freq-pos', `${(target / 200) * 100}%`);
    residualTrace.setAttribute('d', residualPath(recordFreq, recordedSwing));
    const echoes = Object.keys(decayCycles).map(Number).filter((frequency) => frequency !== recordFreq);
    residualEchoA.setAttribute('d', residualPath(echoes[0], recordedSwing));
    residualEchoB.setAttribute('d', residualPath(echoes[1], recordedSwing));
    const rate = decayRates[recordFreq] || decayRates[96];
    residualEnvUpper.setAttribute('d', residualEnvelope(rate, -1));
    residualEnvLower.setAttribute('d', residualEnvelope(rate, 1));
    // The T+0 marker rides the crest of the record it labels, not a fixed height.
    residualNode.setAttribute('cy', residualPoint(0).y.toFixed(1));
    residualDecay.textContent = `DECAY / ${rate.toFixed(1)}`;
    residualTraces.textContent = record === null ? 'TRACES / 00' : 'TRACES / 03';
    // Measured when the sound stops; while still ringing the height is not known
    // yet, so the label keeps the dash it uses for an unmeasured record.
    residualPeak.textContent = record === null || state.isPlaying
      ? 'PEAK / —'
      : `PEAK / ${recordedSwing.toFixed(2)}`;
    if (record === null) {
      residualResidue.textContent = 'RESIDUE / —';
    } else {
      // Honest label: the share of the promised range the trace still occupies at the
      // end of the 4 s window. It carries `recordedSwing` because the envelope it is
      // measured against is the range the record filled, not the range it could fill.
      residualResidue.textContent = `RESIDUE / ${Math.round(Math.exp(-rate) * recordedSwing * 100)}%`;
    }
    if (residualLine.classList.contains('is-reading')) showResidualCursor(residualT, false);
    const nextLabel = pendingStart ? '取消启动' : state.isPlaying ? '暂停共振' : '启动共振';
    startButton.textContent = nextLabel;
    startButton.setAttribute('aria-busy', String(pendingStart));
    sceneToggles.forEach((button) => {
      const inAfterglow = Boolean(button.closest('#act-afterglow'));
      button.textContent = pendingStart
        ? '取消启动'
        : state.isPlaying
          ? '暂停共振'
          : inAfterglow ? '在这里演奏' : '启动共振';
      button.setAttribute('aria-busy', String(pendingStart));
    });
    muteButtons.forEach((button) => {
      button.textContent = audioState.muted ? '取消静音' : '静音';
      button.setAttribute('aria-label', audioState.muted ? '取消静音' : '静音');
      button.setAttribute('aria-pressed', String(audioState.muted));
    });
    const label = headerLabel(audioState);
    headerState.textContent = label;
    sceneStates.forEach((element) => {
      element.textContent = label;
    });
    modeReadout.textContent = lifecycle === 'starting' ? 'START' : state.isPlaying ? 'LIVE' : 'IDLE';
    frequencyButtons.forEach((button) => {
      button.setAttribute('aria-pressed', String(Number(button.dataset.frequency) === target));
    });
    if (message !== undefined) {
      audioStatus.textContent = message;
      sceneMessages.forEach((element) => {
        element.textContent = message;
      });
    }
  }

  function tick(time) {
    const delta = previousTime ? (time - previousTime) / 1000 : 0;
    previousTime = time;
    if (!state) {
      frame = 0;
      previousTime = 0;
      return;
    }
    let next = state;
    if (state.isPlaying || state.frequency !== state.targetFrequency) {
      next = R.advanceState(state, delta);
      if (!state.isPlaying) next = { ...next, phase: state.phase };
    }
    const goal = amplitudeGoal();
    if (next.amplitude !== goal) {
      // Scene changes and the strike bloom ease the field's depth instead of
      // snapping the terrain.
      const blend = state.reducedMotion ? 1 : 1 - Math.exp(-delta * 5.5);
      let amplitude = next.amplitude + (goal - next.amplitude) * blend;
      if (Math.abs(goal - amplitude) < 0.0015) amplitude = goal;
      next = { ...next, amplitude };
    }
    if (next !== state) {
      state = next;
      render();
      // rAF timestamps share the performance.now() clock, so the sample can be
      // throttled against the same timer.
      if (state.isPlaying) observePeak(time);
    }
    if (!state.reducedMotion && (state.isPlaying || state.frequency !== state.targetFrequency || state.amplitude !== amplitudeGoal())) {
      frame = requestAnimationFrame(tick);
    } else {
      frame = 0;
      previousTime = 0;
    }
  }

  function startLoop() {
    cancelAnimationFrame(frame);
    frame = 0;
    previousTime = 0;
    if (!state) return;
    render();
    if (!state.reducedMotion && (state.isPlaying || state.frequency !== state.targetFrequency || state.amplitude !== amplitudeGoal())) {
      frame = requestAnimationFrame(tick);
    }
  }

  function syncMotionPreference() {
    root.dataset.reducedMotion = String(motionQuery.matches);
    if (state) {
      state = { ...state, reducedMotion: motionQuery.matches };
      if (state.reducedMotion && state.frequency !== state.targetFrequency) {
        state = R.advanceState(state, 0);
      }
      if (state.reducedMotion && state.amplitude !== amplitudeTarget) {
        // Reduced motion must not animate a scene transition either.
        state = { ...state, amplitude: amplitudeTarget };
      }
      if (state.reducedMotion && state.isPlaying && state.resonance === 0) {
        state = R.setResonance(state, 0.55);
        autoTension = true;
      }
      syncTensionAria();
      startLoop();
    }
  }

  function beginStart() {
    if (!audio || !state || pendingStart) return;
    if (state.isPlaying && lifecycle === 'live') {
      syncInterface(audio.getState().muted ? '已静音，画面继续振动。' : '声音已接入，指针、指尖或方向键可改变张力。');
      return;
    }
    if (state.reducedMotion && state.resonance === 0) {
      state = R.setResonance(state, 0.55);
      autoTension = true;
      syncTensionAria();
    }
    const version = ++intentVersion;
    pendingStart = true;
    lifecycle = 'starting';
    syncInterface('正在接入声音。');
    queueAudio(async () => {
      if (version !== intentVersion) return;
      try {
        const started = await audio.start(state.targetFrequency);
        if (version !== intentVersion || !started) return;
        pendingStart = false;
        lifecycle = 'live';
        state = { ...state, isPlaying: true };
        recordedFrequency = state.targetFrequency;
        // A new vibration starts its own tally, and the record is the range itself
        // until the stop writes down the height this one actually reached.
        livePeak = swingOf(state);
        recordedSwing = 1;
        strikeAt = performance.now();
        syncInterface(audio.getState().muted ? '已静音，画面继续振动。' : '声音已接入，指针、指尖或方向键可改变张力。');
        startLoop();
      } catch {
        if (version !== intentVersion) return;
        pendingStart = false;
        state = { ...state, isPlaying: false };
        lifecycle = 'error';
        syncInterface('声音未能启动，请重试；画面仍可继续操作。');
        startLoop();
      }
    });
  }

  function cancelStart(message = '启动已取消，仪器保持静默。') {
    intentVersion++;
    pendingStart = false;
    if (state.reducedMotion && autoTension) {
      state = R.setResonance(state, 0);
      syncTensionAria();
    }
    autoTension = false;
    state = { ...state, isPlaying: false };
    lifecycle = 'idle';
    strikeAt = 0;
    if (audio) audio.cancel();
    syncInterface(message);
    startLoop();
  }

  function togglePlayback() {
    if (!state) return;
    if (pendingStart || lifecycle === 'starting') {
      cancelStart();
      return;
    }
    if (state.isPlaying) {
      queueAudio(() => pauseAudio());
      return;
    }
    if (root.dataset.scene === 'afterglow') suppressAfterglowPause = true;
    beginStart();
  }

  async function pauseAudio(message = '已回到静默，再次启动前不会发声。') {
    if (!audio || !state) return;
    if (!state.isPlaying && lifecycle !== 'starting') return;
    intentVersion++;
    pendingStart = false;
    // The record is written from what the vibration reached, measured before
    // reduced motion flattens the field back to rest.
    if (state.isPlaying) recordedSwing = livePeak;
    if (state.reducedMotion && autoTension) {
      state = R.setResonance(state, 0);
      syncTensionAria();
    }
    autoTension = false;
    state = { ...state, isPlaying: false };
    lifecycle = 'paused';
    strikeAt = 0;
    syncInterface(message);
    startLoop();
    try {
      await audio.pause();
    } catch {
      syncInterface('画面已停止，但音频设备未能确认暂停，请检查浏览器声音设置。');
    }
  }

  function applyResonance(value) {
    state = R.setResonance(state, value);
    autoTension = false;
    syncTensionAria();
    // A press is the loudest a player gets, and it can be over inside one frame.
    observePeak(performance.now(), true);
    render();
  }

  function clearProbe() {
    if (instrument) instrument.classList.remove('is-probing');
    if (!state || state.probeX === null) return;
    state = R.setProbe(state, null);
    // While paused nothing else redraws, so the probe marker would stay behind.
    if (!state.isPlaying) render();
  }

  function syncSceneNav(sceneId) {
    sceneNavLinks.forEach((link) => {
      if (link.getAttribute('href') === `#${sceneId}`) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }

  function chooseFrequency(frequency) {
    state = R.setFrequency(state, frequency);
    audio.setFrequency(frequency);
    // Retuning a live vibration continues it at the new pitch, so the record follows
    // and waits for this stop to measure its height.
    if (state.isPlaying) {
      recordedFrequency = frequency;
      recordedSwing = 1;
    }
    if (state.reducedMotion) state = R.advanceState(state, 0);
    syncInterface();
    startLoop();
  }

  if (R && canvas) {
    renderer = R.createRenderer(canvas);
    if (renderer) {
      root.classList.add('canvas-ready');
      if (previewCanvas) {
        previewRenderer = R.createRenderer(previewCanvas, {
          density: { rows: 10, samples: 240 },
          elevationScale: 0.34,
          band: [0.34, 0.5]
        });
        if (!previewRenderer) previewWrap.hidden = true;
      }
      fallback.setAttribute('aria-hidden', 'true');
      canvas.setAttribute('role', 'slider');
      canvas.setAttribute('tabindex', '0');
      canvas.setAttribute('aria-valuemin', '0');
      canvas.setAttribute('aria-valuemax', '100');
      canvas.setAttribute('aria-valuenow', '0');
      canvas.setAttribute('aria-valuetext', '0% 张力');
      canvas.setAttribute('aria-label', '共振张力（方向键调节）');
      render();
      startLoop();

      function updateResonance(event) {
        const bounds = canvas.getBoundingClientRect();
        const positionX = (event.clientX - bounds.left) / bounds.width;
        const positionY = (event.clientY - bounds.top) / bounds.height;
        const x = positionX - 0.5;
        const y = positionY - 0.5;
        const distance = Math.min(1, Math.hypot(x, y) * 2);
        if (event.pointerType !== 'touch') {
          instrument.style.setProperty('--probe-x', `${(positionX * 100).toFixed(2)}%`);
          instrument.style.setProperty('--probe-y', `${(positionY * 100).toFixed(2)}%`);
          instrument.classList.add('is-probing');
          state = R.setProbe(state, positionX, 0.85);
        }
        if (!pointerEngaged) {
          // Remember what the instrument was set to (keyboard, touch or idle) so a
          // transient hover preview can return to it instead of erasing it.
          pointerBaseline = state.resonance;
          pointerEngaged = true;
        }
        applyResonance(1 - distance * 0.65);
      }

      let pointerFrame = 0;
      let pointerSample = null;
      function cancelPointerFrame() {
        if (pointerFrame) cancelAnimationFrame(pointerFrame);
        pointerFrame = 0;
        pointerSample = null;
      }
      function scheduleResonance(event) {
        pointerSample = { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType };
        if (pointerFrame) return;
        pointerFrame = requestAnimationFrame(() => {
          pointerFrame = 0;
          if (pointerSample) updateResonance(pointerSample);
        });
      }

      let pointerBaseline = null;
      canvas.addEventListener('pointermove', scheduleResonance);
      canvas.addEventListener('pointerdown', (event) => {
        cancelPointerFrame();
        pointerBaseline = state.resonance;
        updateResonance(event);
      });
      canvas.addEventListener('pointerleave', (event) => {
        if (event.pointerType !== 'mouse' || !pointerEngaged) return;
        pointerEngaged = false;
        cancelPointerFrame();
        clearProbe();
        applyResonance(pointerBaseline ?? 0);
        pointerBaseline = null;
      });
      canvas.addEventListener('pointerup', (event) => {
        if (event.pointerType === 'mouse') return;
        pointerEngaged = false;
        cancelPointerFrame();
        pointerBaseline = null;
        clearProbe();
      });
      canvas.addEventListener('pointercancel', () => {
        pointerEngaged = false;
        cancelPointerFrame();
        clearProbe();
        if (pointerBaseline !== null) {
          applyResonance(pointerBaseline);
          pointerBaseline = null;
        }
      });
      canvas.addEventListener('keydown', (event) => {
        let next;
        if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = state.resonance + 0.1;
        else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = state.resonance - 0.1;
        else if (event.key === 'PageUp') next = state.resonance + 0.2;
        else if (event.key === 'PageDown') next = state.resonance - 0.2;
        else if (event.key === 'Home') next = 0;
        else if (event.key === 'End') next = 1;
        else return;
        event.preventDefault();
        pointerEngaged = false;
        clearProbe();
        applyResonance(Math.round(Math.min(1, Math.max(0, next)) * 10) / 10);
      });
    } else {
      canvas.setAttribute('aria-hidden', 'true');
    }
  }

  startButton.addEventListener('click', togglePlayback);
  sceneToggles.forEach((button) => button.addEventListener('click', togglePlayback));

  muteButtons.forEach((button) => button.addEventListener('click', () => {
    const muted = !audio.getState().muted;
    audio.setMuted(muted);
    if (lifecycle === 'error' && !state.isPlaying) {
      syncInterface();
      return;
    }
    if (!state.isPlaying) {
      syncInterface(muted ? '已静音；启动后不会发声。' : '声音已取消静音。');
    } else {
      syncInterface(muted ? '已静音，画面继续振动。' : '声音已取消静音。');
    }
  }));

  frequencyButtons.forEach((button) => {
    button.addEventListener('click', () => chooseFrequency(Number(button.dataset.frequency)));
  });

  restartButton.addEventListener('click', () => {
    suppressAfterglowPause = true;
    document.querySelector('#act-origin').scrollIntoView({ behavior: motionQuery.matches ? 'auto' : 'smooth' });
    startButton.focus({ preventScroll: true });
    if (pendingStart) cancelStart('回到首幕重新起振。');
    beginStart();
  });

  silenceButton.addEventListener('click', () => {
    if (!state.isPlaying) {
      if (lifecycle !== 'error') syncInterface('仪器没有发声，保持在静默。');
      return;
    }
    queueAudio(() => pauseAudio());
  });

  const scenes = [...document.querySelectorAll('#act-origin, #act-frequency, #act-afterglow')];
  const sceneVisible = new Map(scenes.map((scene) => [scene.id, false]));
  const sceneAmplitudes = { 'act-origin': 0.62, 'act-frequency': 0.84, 'act-afterglow': 0.08 };
  const sceneNames = { 'act-origin': 'origin', 'act-frequency': 'spectrum', 'act-afterglow': 'afterglow' };

  // intersectionRatio undercounts tall sections in short viewports (landscape phones):
  // act 3 can never reach half of its own height there even when it fills the screen.
  // Both the pause rule and the active-act handoff depend on how much of the *visible*
  // field a section covers, so every decision reads real pixels instead of a ratio.
  function visibleHeight(scene) {
    const rect = scene.getBoundingClientRect();
    const viewport = window.innerHeight || 1;
    return Math.max(0, Math.min(rect.bottom, viewport) - Math.max(rect.top, 0));
  }

  function afterglowCoverage() {
    if (!afterglowScene) return 0;
    const rect = afterglowScene.getBoundingClientRect();
    const viewport = window.innerHeight || 1;
    const reference = Math.min(rect.height || viewport, viewport);
    return reference > 0 ? visibleHeight(afterglowScene) / reference : 0;
  }

  function considerAfterglowPause() {
    if (!state || !state.isPlaying || suppressAfterglowPause) return;
    if (root.dataset.scene !== 'afterglow') return;
    if (afterglowCoverage() < 0.5) return;
    const version = intentVersion;
    queueAudio(() => {
      if (version !== intentVersion || !state.isPlaying || suppressAfterglowPause) return;
      if (root.dataset.scene !== 'afterglow') return;
      if (afterglowCoverage() < 0.5) return;
      return pauseAudio('共振自然衰减，余振形状仍在。');
    });
  }

  function adoptScene(sceneId) {
    const previousScene = root.dataset.scene;
    // Tuning plus height: two stops of the same tuning at different strengths are
    // different recordings, and each deserves its own stroke.
    const recordToken = recordedFrequency === null
      ? null
      : `${recordedFrequency}/${recordedSwing.toFixed(3)}`;
    if (previousScene !== sceneNames[sceneId]) {
      root.dataset.scene = sceneNames[sceneId];
      syncSceneNav(sceneId);
    }
    if (sceneId !== 'act-afterglow') suppressAfterglowPause = false;
    if (state) {
      const target = sceneAmplitudes[sceneId];
      if (amplitudeTarget !== target) {
        amplitudeTarget = target;
        if (state.reducedMotion) {
          // Reduced motion must not animate a scene transition either.
          if (state.amplitude !== target) {
            state = { ...state, amplitude: target };
            render();
          }
        } else {
          startLoop();
        }
      }
      if (sceneId === 'act-afterglow' && previousScene !== 'afterglow') {
        // Entering with a new recording: let the trace write itself in. Re-entering
        // the same recording shows the finished trace instead of redrawing it. An
        // empty plot has nothing to draw.
        root.dataset.residual = recordToken === null || recordToken === drawnResidualToken ? 'settled' : 'draw';
        drawnResidualToken = recordToken;
        considerAfterglowPause();
      } else if (sceneId === 'act-afterglow') {
        considerAfterglowPause();
      }
    }
  }

  const sceneThresholds = Array.from({ length: 21 }, (_, index) => index / 20);
  const sceneObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => sceneVisible.set(entry.target.id, entry.isIntersecting));
    const candidates = scenes.filter((scene) => sceneVisible.get(scene.id));
    if (!candidates.length) return;
    let activeScene = null;
    let activeHeight = 1;
    for (const scene of candidates) {
      const height = visibleHeight(scene);
      if (height > activeHeight) {
        activeHeight = height;
        activeScene = scene;
      }
    }
    if (activeScene) adoptScene(activeScene.id);
  }, { threshold: sceneThresholds });
  scenes.forEach((scene) => sceneObserver.observe(scene));

  let coverageFrame = 0;
  window.addEventListener('scroll', () => {
    if (coverageFrame || !state || !state.isPlaying || suppressAfterglowPause) return;
    coverageFrame = requestAnimationFrame(() => {
      coverageFrame = 0;
      considerAfterglowPause();
    });
  }, { passive: true });

  document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
      if (!state || !state.isPlaying) return;
      const version = intentVersion;
      pausedForVisibility = true;
      queueAudio(() => {
        if (version !== intentVersion || !state.isPlaying) return;
        return pauseAudio(document.hidden ? '页面已隐藏，共振已暂停。' : '页面已回到前台；共振保持暂停，需要你再次启动。');
      });
      return;
    }
    if (!pausedForVisibility) return;
    pausedForVisibility = false;
    if (lifecycle === 'paused') {
      syncInterface('页面已回到前台；共振保持暂停，需要你再次启动。');
    }
  });

  syncMotionPreference();
  syncInterface();
  syncSceneNav('act-origin');
  motionQuery.addEventListener('change', syncMotionPreference);
})();