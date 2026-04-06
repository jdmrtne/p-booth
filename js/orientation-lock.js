// ─── ORIENTATION LOCK UTILITY ────────────────────────────────────
// On mobile:
//   • App is always portrait-locked.
//   • When the device is rotated to landscape (outside of camera shooting),
//     a full-screen overlay hides all site content and asks to rotate back.
//   • During camera shooting (fsc-camera-active on body), landscape is
//     allowed and the overlay stays hidden.
// Desktop: no locking or overlays applied.

(function () {
  const isMobile = () =>
    ('ontouchstart' in window || navigator.maxTouchPoints > 0) &&
    window.screen.width <= 1024;

  if (!isMobile()) return;

  // ── Inject styles ─────────────────────────────────────────────
  function injectStyles() {
    if (document.getElementById('portraitGuardStyles')) return;
    const style = document.createElement('style');
    style.id = 'portraitGuardStyles';
    style.textContent = `
      #portraitGuard {
        display: none;
        position: fixed;
        inset: 0;
        z-index: 2147483647;
        background: #0a0014;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        padding: 40px 32px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
        overflow: hidden;
      }
      #portraitGuard.pg-visible { display: flex; }
      .pg-inner {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 20px;
        max-width: 280px;
      }
      .pg-phone {
        position: relative;
        display: flex;
        align-items: center;
        gap: 14px;
        margin-bottom: 4px;
      }
      .pg-phone-body {
        width: 52px;
        height: 88px;
        border: 3px solid rgba(255,107,157,.7);
        border-radius: 10px;
        background: rgba(255,107,157,.07);
        display: flex;
        align-items: center;
        justify-content: center;
        animation: pgRock 2.8s cubic-bezier(.4,0,.2,1) infinite;
      }
      .pg-phone-body svg { width: 26px; height: 26px; color: rgba(255,107,157,.6); }
      @keyframes pgRock {
        0%,30%   { transform: rotate(90deg); }
        65%,100% { transform: rotate(0deg); }
      }
      .pg-arrow {
        color: rgba(168,85,247,.7);
        animation: pgArrowPop 2.8s cubic-bezier(.4,0,.2,1) infinite;
      }
      .pg-arrow svg { width: 28px; height: 28px; }
      @keyframes pgArrowPop {
        0%,30%   { opacity: 0; transform: translateX(-6px); }
        65%,100% { opacity: 1; transform: translateX(0); }
      }
      .pg-title {
        font-size: 1.45rem;
        font-weight: 900;
        letter-spacing: -.01em;
        background: linear-gradient(135deg, #ff6b9d, #a855f7);
        -webkit-background-clip: text;
        -webkit-text-fill-color: transparent;
        background-clip: text;
        line-height: 1.2;
      }
      .pg-sub {
        font-size: .82rem;
        font-weight: 500;
        color: rgba(255,255,255,.48);
        line-height: 1.75;
        margin: 0;
      }
      .pg-badge {
        display: inline-flex;
        align-items: center;
        gap: 6px;
        background: rgba(255,107,157,.12);
        border: 1.5px solid rgba(255,107,157,.28);
        color: rgba(255,107,157,.85);
        font-size: .68rem;
        font-weight: 800;
        letter-spacing: .06em;
        text-transform: uppercase;
        padding: 6px 16px;
        border-radius: 20px;
        margin-top: 4px;
      }
    `;
    document.head.appendChild(style);
  }

  // ── Inject overlay HTML ────────────────────────────────────────
  function injectOverlay() {
    if (document.getElementById('portraitGuard')) return;
    const div = document.createElement('div');
    div.id = 'portraitGuard';
    div.innerHTML = `
      <div class="pg-inner">
        <div class="pg-phone">
          <div class="pg-phone-body">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"
                 stroke-linecap="round" stroke-linejoin="round">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2"/>
              <line x1="12" y1="18" x2="12.01" y2="18"/>
            </svg>
          </div>
          <div class="pg-arrow">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"
                 stroke-linecap="round" stroke-linejoin="round">
              <polyline points="9 18 15 12 9 6"/>
            </svg>
          </div>
        </div>
        <div class="pg-title">Portrait Mode Only</div>
        <p class="pg-sub">
          p-booth works in portrait.<br>
          Please rotate your device back upright to continue.
        </p>
        <div class="pg-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"
               stroke-linecap="round" stroke-linejoin="round" style="width:13px;height:13px">
            <rect x="5" y="2" width="14" height="20" rx="2"/>
            <line x1="12" y1="18" x2="12.01" y2="18"/>
          </svg>
          Rotate back to continue
        </div>
      </div>
    `;
    document.body.insertBefore(div, document.body.firstChild);
  }

  // ── Orientation helpers ────────────────────────────────────────
  function isLandscape() {
    if (screen.orientation && screen.orientation.type) {
      return screen.orientation.type.startsWith('landscape');
    }
    return window.innerWidth > window.innerHeight;
  }

  // ── Show/hide overlay based on current state ───────────────────
  function checkOrientation() {
    const overlay = document.getElementById('portraitGuard');
    if (!overlay) return;
    const cameraActive = document.body.classList.contains('fsc-camera-active');
    if (isLandscape() && !cameraActive) {
      overlay.classList.add('pg-visible');
      document.body.style.overflow = 'hidden';
    } else {
      overlay.classList.remove('pg-visible');
      if (!cameraActive) document.body.style.overflow = '';
    }
  }

  // ── Public API ─────────────────────────────────────────────────
  window.lockPortrait = async function () {
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('portrait');
      }
    } catch (e) { /* best-effort */ }
    checkOrientation();
  };

  window.lockLandscape = async function () {
    try {
      if (screen.orientation && screen.orientation.lock) {
        await screen.orientation.lock('landscape');
      }
    } catch (e) { /* best-effort */ }
    checkOrientation();
  };

  window.unlockOrientation = function () {
    try {
      if (screen.orientation && screen.orientation.unlock) {
        screen.orientation.unlock();
      }
    } catch (e) { }
  };

  // Expose so camera.js can call after toggling fsc-camera-active
  window._pgCheckOrientation = checkOrientation;

  // ── Init ───────────────────────────────────────────────────────
  if (document.body) {
    injectStyles();
    injectOverlay();
    checkOrientation();
  } else {
    document.addEventListener('DOMContentLoaded', () => {
      injectStyles();
      injectOverlay();
      checkOrientation();
    });
  }

  window.addEventListener('resize', checkOrientation);
  window.addEventListener('orientationchange', () => setTimeout(checkOrientation, 200));
  if (screen.orientation) {
    screen.orientation.addEventListener('change', () => setTimeout(checkOrientation, 200));
  }
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) checkOrientation();
  });

  window.lockPortrait();
})();
