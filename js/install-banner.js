// ─── PWA Install Banner ───────────────────────────────────────────
// Shows a dismissible "Add to Home Screen" banner on mobile browsers.
// Dismissed state persists in localStorage so it won't nag the user.

(function() {
  const DISMISSED_KEY = 'pbooth_install_dismissed';
  let deferredPrompt = null;

  function isMobileBrowser() {
    return ('ontouchstart' in window || navigator.maxTouchPoints > 0)
        && !window.matchMedia('(display-mode: standalone)').matches
        && !navigator.standalone; // iOS standalone
  }

  function wasDismissed() {
    try { return localStorage.getItem(DISMISSED_KEY) === '1'; } catch(e) { return false; }
  }

  function markDismissed() {
    try { localStorage.setItem(DISMISSED_KEY, '1'); } catch(e) {}
  }

  function createBanner() {
    const banner = document.createElement('div');
    banner.id = 'pwa-install-banner';
    banner.innerHTML = `
      <div class="pib-inner">
        <div class="pib-icon">📸</div>
        <div class="pib-text">
          <strong>Add p-booth to your home screen</strong>
          <span>Better experience as an app!</span>
        </div>
        <div class="pib-actions">
          <button class="pib-install" id="pibInstallBtn">Add</button>
          <button class="pib-dismiss" id="pibDismissBtn" aria-label="Dismiss">✕</button>
        </div>
      </div>`;
    document.body.appendChild(banner);

    // Animate in
    requestAnimationFrame(() => { requestAnimationFrame(() => { banner.classList.add('pib-visible'); }); });

    document.getElementById('pibDismissBtn').onclick = () => {
      banner.classList.remove('pib-visible');
      setTimeout(() => banner.remove(), 350);
      markDismissed();
    };

    const installBtn = document.getElementById('pibInstallBtn');
    installBtn.onclick = async () => {
      if (deferredPrompt) {
        deferredPrompt.prompt();
        const { outcome } = await deferredPrompt.userChoice;
        deferredPrompt = null;
        markDismissed();
        banner.classList.remove('pib-visible');
        setTimeout(() => banner.remove(), 350);
      } else {
        // iOS: show manual instructions
        showIOSInstructions();
      }
    };
  }

  function showIOSInstructions() {
    const modal = document.createElement('div');
    modal.className = 'pib-ios-modal';
    modal.innerHTML = `
      <div class="pib-ios-card">
        <p class="pib-ios-title">Add to Home Screen</p>
        <ol class="pib-ios-steps">
          <li>Tap the <strong>Share</strong> button <span class="pib-ios-share">⬆</span> at the bottom</li>
          <li>Scroll down and tap <strong>"Add to Home Screen"</strong></li>
          <li>Tap <strong>Add</strong></li>
        </ol>
        <button class="pib-ios-close" onclick="this.closest('.pib-ios-modal').remove()">Got it!</button>
      </div>`;
    document.body.appendChild(modal);
    requestAnimationFrame(() => { requestAnimationFrame(() => { modal.classList.add('visible'); }); });
    modal.onclick = (e) => { if (e.target === modal) { modal.classList.remove('visible'); setTimeout(() => modal.remove(), 300); markDismissed(); } };
  }

  // Listen for Chrome's install prompt
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredPrompt = e;
    if (isMobileBrowser() && !wasDismissed()) {
      setTimeout(createBanner, 1500);
    }
  });

  // iOS: show if mobile, not standalone, not dismissed
  window.addEventListener('DOMContentLoaded', () => {
    const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent);
    if (isIOS && isMobileBrowser() && !wasDismissed()) {
      setTimeout(createBanner, 1500);
    }
  });

  // Listen for SW update messages and offer page reload
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.addEventListener('message', (event) => {
      if (event.data?.type === 'SW_UPDATED') {
        // Show a subtle update toast instead of forcing reload
        showUpdateToast();
      }
    });
  }

  function showUpdateToast() {
    // Don't show if already shown
    if (document.getElementById('sw-update-toast')) return;
    const toast = document.createElement('div');
    toast.id = 'sw-update-toast';
    toast.innerHTML = `<span>✨ p-booth updated!</span><button onclick="window.location.reload()">Reload</button>`;
    document.body.appendChild(toast);
    requestAnimationFrame(() => { requestAnimationFrame(() => { toast.classList.add('visible'); }); });
    setTimeout(() => {
      toast.classList.remove('visible');
      setTimeout(() => toast.remove(), 400);
    }, 8000);
  }
})();
