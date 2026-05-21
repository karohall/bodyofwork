// Plays back a previously recorded mouse path during a new recording
// session, so the user can dance with their past self. Injected by
// record.mjs when --ghost=<path> is passed; samples are exposed via
// window.__bowGhostSamples (also injected). The page's startCaptureCycle
// triggers __bowStartGhost(startT) right after it kicks off the recorder,
// so the two streams begin at t=0 together.

window.__bowStartGhost = (startT) => {
  const samples = window.__bowGhostSamples || [];
  if (!samples.length) {
    console.log('[bow ghost] no samples to play');
    return;
  }
  console.log('[bow ghost] playback started, ' + samples.length + ' samples');
  let idx = 0;
  function tick() {
    const elapsed = performance.now() - startT;
    while (idx < samples.length && samples[idx].t <= elapsed) {
      const s = samples[idx++];
      if (s.type === 'move') {
        document.dispatchEvent(new MouseEvent('mousemove', {
          clientX: s.x, clientY: s.y, bubbles: true, cancelable: true,
        }));
      } else if (s.type === 'scroll') {
        // Skip — capture mode disables scroll anyway.
      }
    }
    if (idx < samples.length) requestAnimationFrame(tick);
    else console.log('[bow ghost] playback finished');
  }
  requestAnimationFrame(tick);
};
