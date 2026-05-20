// Recorder overlay — injected into the live site via Puppeteer.
// Captures mousemove + scroll with timestamps, exposes a tiny UI.
// The Node-side launcher exposes window.__saveRecording(jsonString) to persist.

function __bowRecorderInit() {
  if (window.__bowRecorderLoaded) return;
  window.__bowRecorderLoaded = true;

  const state = {
    recording: false,
    startedAt: 0,
    samples: [], // { t, type: 'move'|'scroll', x?, y?, scrollY? }
    lastMoveT: 0,
    viewport: { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 },
  };

  // Throttle mousemove to ~120 Hz worst case — still way denser than 60 fps
  // playback needs, but keeps file size reasonable.
  const MOVE_MIN_INTERVAL_MS = 8;

  function now() { return performance.now(); }

  function onMove(e) {
    if (!state.recording) return;
    const t = now() - state.startedAt;
    if (t - state.lastMoveT < MOVE_MIN_INTERVAL_MS) return;
    state.lastMoveT = t;
    state.samples.push({ t, type: 'move', x: e.clientX, y: e.clientY });
  }

  function onScroll() {
    if (!state.recording) return;
    state.samples.push({ t: now() - state.startedAt, type: 'scroll', scrollY: window.scrollY });
  }

  function start() {
    state.samples.length = 0;
    state.startedAt = now();
    state.lastMoveT = -Infinity;
    state.recording = true;
    state.viewport = { w: window.innerWidth, h: window.innerHeight, dpr: window.devicePixelRatio || 1 };
    // Seed with an initial scroll + mouse sample so replay has a starting pose.
    state.samples.push({ t: 0, type: 'scroll', scrollY: window.scrollY });
    statusEl.textContent = 'REC';
    statusEl.style.color = '#ff5050';
    btnStart.disabled = true;
    btnStop.disabled = false;
    btnDownload.disabled = true;
  }

  function stop() {
    if (!state.recording) return;
    // Terminal sample with type 'end' marks the auto-stop moment so the
    // saved durationMs covers the full cycle even if the user stopped moving
    // the mouse mid-way. capture.mjs ignores unknown sample types.
    state.samples.push({ t: now() - state.startedAt, type: 'end' });
    state.recording = false;
    statusEl.textContent = `${state.samples.length} samples · ${(now() - state.startedAt).toFixed(0)} ms`;
    statusEl.style.color = '#9ad';
    btnStart.disabled = false;
    btnStop.disabled = true;
    btnDownload.disabled = false;
  }

  function payload() {
    return {
      version: 1,
      recordedAt: new Date().toISOString(),
      viewport: state.viewport,
      url: location.href,
      durationMs: state.samples.length ? state.samples[state.samples.length - 1].t : 0,
      samples: state.samples,
    };
  }

  function download() {
    const json = JSON.stringify(payload());
    // Prefer Node-side save if the launcher exposed it; else fall back to browser download.
    if (typeof window.__saveRecording === 'function') {
      window.__saveRecording(json).then((p) => {
        statusEl.textContent = `saved → ${p}`;
      }).catch((err) => {
        statusEl.textContent = `save failed: ${err.message}`;
      });
      return;
    }
    const blob = new Blob([json], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `recording-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  // ── UI ─────────────────────────────────────────────────────────
  const host = document.createElement('div');
  host.id = '__bow_recorder';
  Object.assign(host.style, {
    position: 'fixed',
    bottom: '12px',
    left: '12px',
    zIndex: 2147483647,
    background: 'rgba(18,20,26,0.92)',
    color: '#e6edf7',
    font: '12px/1.4 ui-monospace, "SF Mono", Menlo, monospace',
    padding: '8px 10px',
    borderRadius: '8px',
    border: '1px solid rgba(255,255,255,0.08)',
    boxShadow: '0 4px 16px rgba(0,0,0,0.25)',
    display: 'flex',
    gap: '6px',
    alignItems: 'center',
    pointerEvents: 'auto',
    userSelect: 'none',
  });

  const mkBtn = (label) => {
    const b = document.createElement('button');
    b.textContent = label;
    Object.assign(b.style, {
      background: '#222732',
      color: '#e6edf7',
      border: '1px solid rgba(255,255,255,0.12)',
      borderRadius: '4px',
      padding: '4px 8px',
      cursor: 'pointer',
      font: 'inherit',
    });
    b.onmouseenter = () => (b.style.background = '#2c3240');
    b.onmouseleave = () => (b.style.background = '#222732');
    return b;
  };

  const btnStart = mkBtn('● Record');
  const btnStop = mkBtn('■ Stop');
  const btnDownload = mkBtn('↓ Save');
  const statusEl = document.createElement('span');
  statusEl.textContent = 'idle';
  statusEl.style.color = '#9aa3b2';
  statusEl.style.marginLeft = '4px';

  btnStop.disabled = true;
  btnDownload.disabled = true;
  btnStart.onclick = start;
  btnStop.onclick = stop;
  btnDownload.onclick = download;

  host.append(btnStart, btnStop, btnDownload, statusEl);
  document.documentElement.appendChild(host);

  // Hotkeys: R = start, S = stop, D = save
  window.addEventListener('keydown', (e) => {
    if (e.target && /^(input|textarea)$/i.test(e.target.tagName)) return;
    if (e.key === 'r' || e.key === 'R') start();
    else if (e.key === 's' || e.key === 'S') stop();
    else if (e.key === 'd' || e.key === 'D') download();
  });

  // Listen at capture phase so we record before the site's own handlers run.
  window.addEventListener('mousemove', onMove, { capture: true, passive: true });
  window.addEventListener('scroll', onScroll, { capture: true, passive: true });

  // Auto-record hooks — the capture-mode cycle calls these to start at its
  // own t=0 and stop+save once the cycle (plus 5s tail) finishes. Manual
  // hotkeys / overlay buttons still work alongside them.
  window.__bowAutoStart = () => { if (!state.recording) start(); };
  window.__bowAutoStop = () => {
    if (!state.recording) return;
    stop();
    download();
  };

  console.log('[bow recorder] loaded — R=record, S=stop, D=save (auto in ?capture mode)');
}

// Puppeteer's evaluateOnNewDocument fires before <html> exists, so we can't
// touch document.documentElement at script time. Defer until the DOM is
// parsed; if it's already past loading by the time this runs, init now.
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', __bowRecorderInit, { once: true });
} else {
  __bowRecorderInit();
}
