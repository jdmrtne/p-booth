// ─── P-BOOTH CAMERA CONTROLLER v4 (patched) ────────────────────────
const LAYOUTS_CAM = {
  CUT4:  { id:'CUT4',  name:'Classic 4-Cut', kr:'인생4컷',    shots:4, format:'4 × 1 strip', cols:1, rows:4, type:'strip',       accentColor:'#ff6b9d' },
  CUT2:  { id:'CUT2',  name:'2-Cut Wide',    kr:'인생2컷',    shots:2, format:'2 × 1 strip', cols:1, rows:2, type:'strip',       accentColor:'#a855f7' },
  WIDE4: { id:'WIDE4', name:'Wide 4-Cut',    kr:'4컷 와이드', shots:4, format:'2×2 grid',    cols:2, rows:2, type:'grid2x2',     accentColor:'#2dd4bf' },
  CUT8:  { id:'CUT8',  name:'Double Strip',  kr:'인생8컷',    shots:8, format:'2 strips × 4',cols:2, rows:4, type:'doublestrip', accentColor:'#fbbf24' },
};

let stream          = null;
let capturedPhotos  = [];
let isCapturing     = false;
let layoutConfig    = null;
let currentMode     = 'camera';
let uploadedPhotos  = [];

// ── FULLSCREEN CAPTURE MODE ───────────────────────────────────────
let fscCaptureMode    = 'auto';   // 'auto' | 'manual'
let fscAborted        = false;

// ── PAUSE STATE ──────────────────────────────────────────────────
let isPaused            = false;
let pauseResolveCallback = null;

// drag state for upload slots
let dragSrcIndex = null;
let isDragging   = false;

// drag state for rearrange grid
let rearrangeDragSrc = null;

let videoEl, snapshotCanvas, countdownOverlay, countdownNumber, countdownLabel,
    flashOverlay, capturedStateEl, capturedLabel, capturedSublabel,
    shotBarFill, shotLabelCurrent, shotLabelTotal, statusMsg,
    startBtn, pauseBtn, cameraArea, readyState, permissionError, thumbnailsGrid,
    layoutBadgeName, layoutBadgeSub, layoutBadgeIcon, mobileThumbs;

// ─── IMAGE COMPRESSION ────────────────────────────────────────────
function compressImage(dataUrl, maxSide=800, quality=0.75) {
  return new Promise(resolve => {
    const img = new Image();
    img.onload = () => {
      const scale  = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width  = Math.round(img.width  * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      resolve(canvas.toDataURL('image/jpeg', quality));
    };
    img.onerror = () => resolve(dataUrl);
    img.src = dataUrl;
  });
}

function safeSetPhotos(photos) {
  try {
    sessionStorage.setItem('photobooth_photos', JSON.stringify(photos));
  } catch(e) {
    if (e.name === 'QuotaExceededError') {
      Promise.all(photos.map(p => p ? compressImage(p, 600, 0.6) : Promise.resolve(null))).then(recompressed => {
        try { sessionStorage.setItem('photobooth_photos', JSON.stringify(recompressed)); }
        catch(e2) { savePhotosToIDB(recompressed); }
      });
    }
  }
}

function savePhotosToIDB(photos) {
  const req = indexedDB.open('pbooth', 1);
  req.onupgradeneeded = e => e.target.result.createObjectStore('photos');
  req.onsuccess = e => {
    const tx = e.target.result.transaction('photos', 'readwrite');
    tx.objectStore('photos').put(JSON.stringify(photos), 'current');
    tx.oncomplete = () => {
      sessionStorage.setItem('photobooth_photos_idb', '1');
      window.location.href = 'result.html';
    };
  };
}

// ─── LANDSCAPE / MOBILE DETECTION ─────────────────────────────────
function isMobileDevice() {
  return (window.innerWidth <= 900) &&
    ('ontouchstart' in window || navigator.maxTouchPoints > 0);
}

function isPortraitMode() {
  if (screen.orientation && screen.orientation.type) {
    return screen.orientation.type.startsWith('portrait');
  }
  return window.innerHeight > window.innerWidth;
}

function checkAndShowLandscapePrompt() {
  const overlay = document.getElementById('landscapeOverlay');
  if (!overlay) return;
  // Never show landscape overlay when the fullscreen camera overlay is active —
  // it has a lower z-index and would silently block all taps including the shutter.
  const fscOpen = document.getElementById('fullscreenCameraOverlay')?.classList.contains('fsc-open');
  // Show on ALL modes when in portrait — not just camera mode
  const shouldShow = !fscOpen && isMobileDevice() && isPortraitMode();
  overlay.classList.toggle('visible', shouldShow);
}

// ─── PAUSE / RESUME ───────────────────────────────────────────────
function pauseSession() {
  if (!isCapturing || isPaused) return;
  isPaused = true;

  // Show paused overlay on viewfinder
  const pausedOverlay = document.getElementById('pausedOverlay');
  if (pausedOverlay) pausedOverlay.classList.add('visible');

  // Hide countdown if active
  if (countdownOverlay) countdownOverlay.classList.remove('visible');

  // Update pause button
  if (pauseBtn) {
    pauseBtn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="5 3 19 12 5 21 5 3"/></svg> Resume';
    pauseBtn.classList.add('is-paused');
  }
  updateStatus('Session paused — press Resume to continue', false);
}

function resumeSession() {
  if (!isPaused) return;
  isPaused = false;

  // Hide paused overlay
  const pausedOverlay = document.getElementById('pausedOverlay');
  if (pausedOverlay) pausedOverlay.classList.remove('visible');

  // Restore pause button
  if (pauseBtn) {
    pauseBtn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
    pauseBtn.classList.remove('is-paused');
  }

  // Resolve any waiting promise
  if (pauseResolveCallback) {
    const cb = pauseResolveCallback;
    pauseResolveCallback = null;
    cb();
  }
}

function togglePause() {
  if (isPaused) resumeSession(); else pauseSession();
}

// Returns a promise that resolves immediately if not paused, or waits until resumed
function waitIfPaused() {
  if (!isPaused) return Promise.resolve();
  return new Promise(resolve => { pauseResolveCallback = resolve; });
}

function resetPauseState() {
  isPaused = false;
  pauseResolveCallback = null;
  const pausedOverlay = document.getElementById('pausedOverlay');
  if (pausedOverlay) pausedOverlay.classList.remove('visible');
  if (pauseBtn) {
    pauseBtn.style.display = 'none';
    pauseBtn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
    pauseBtn.classList.remove('is-paused');
  }
}

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const layoutId = sessionStorage.getItem('photobooth_layout');
  if (!layoutId || !LAYOUTS_CAM[layoutId]) { window.location.href = 'index.html'; return; }
  layoutConfig = LAYOUTS_CAM[layoutId];

  videoEl          = document.getElementById('video');
  snapshotCanvas   = document.getElementById('snapshot');
  countdownOverlay = document.getElementById('countdownOverlay');
  countdownNumber  = document.getElementById('countdownNumber');
  countdownLabel   = document.getElementById('countdownLabel');
  flashOverlay     = document.getElementById('flashOverlay');
  capturedStateEl  = document.getElementById('capturedState');
  capturedLabel    = document.getElementById('capturedLabel');
  capturedSublabel = document.getElementById('capturedSublabel');
  shotBarFill      = document.getElementById('shotBarFill');
  shotLabelCurrent = document.getElementById('shotLabelCurrent');
  shotLabelTotal   = document.getElementById('shotLabelTotal');
  statusMsg        = document.getElementById('statusMsg');
  startBtn         = document.getElementById('startBtn');
  pauseBtn         = document.getElementById('pauseBtn');
  cameraArea       = document.getElementById('cameraArea');
  readyState       = document.getElementById('readyState');
  permissionError  = document.getElementById('permissionError');
  thumbnailsGrid   = document.getElementById('thumbnailsGrid');
  layoutBadgeName  = document.getElementById('layoutBadgeName');
  layoutBadgeSub   = document.getElementById('layoutBadgeSub');
  layoutBadgeIcon  = document.getElementById('layoutBadgeIcon');
  mobileThumbs     = document.getElementById('mobileThumbs');

  if (layoutBadgeName) layoutBadgeName.textContent = layoutConfig.name;
  if (layoutBadgeSub)  layoutBadgeSub.textContent  = `${layoutConfig.shots} shots · ${layoutConfig.format}`;
  if (layoutBadgeIcon) {
    layoutBadgeIcon.textContent       = layoutConfig.kr;
    layoutBadgeIcon.style.color       = layoutConfig.accentColor;
    layoutBadgeIcon.style.borderColor = layoutConfig.accentColor + '55';
  }
  if (shotBarFill)      shotBarFill.style.background = `linear-gradient(90deg,${layoutConfig.accentColor},${shiftHue(layoutConfig.accentColor)})`;
  if (shotLabelCurrent) shotLabelCurrent.style.color  = layoutConfig.accentColor;
  if (shotLabelTotal)   shotLabelTotal.textContent    = `of ${layoutConfig.shots}`;

  const readyDesc = document.getElementById('readyDesc');
  if (readyDesc) readyDesc.textContent = `${layoutConfig.shots} shots — get ready to strike your poses!`;
  const poseBadge = document.getElementById('poseBadge');
  if (poseBadge)  poseBadge.textContent = `${layoutConfig.shots} shots · ${layoutConfig.kr}`;

  initCustomizePanel();
  buildThumbnailGrid();
  startBtn?.addEventListener('click', beginSession);
  buildUploadSlots();

  // Orientation listeners for landscape prompt
  window.addEventListener('resize', checkAndShowLandscapePrompt);
  window.addEventListener('orientationchange', () => setTimeout(checkAndShowLandscapePrompt, 300));
  if (screen.orientation) {
    screen.orientation.addEventListener('change', () => setTimeout(checkAndShowLandscapePrompt, 300));
  }

  // ── Check for existing photos (returning from result.html) ──
  const existingRaw = sessionStorage.getItem('photobooth_photos');
  if (existingRaw && !sessionStorage.getItem('photobooth_photos_idb')) {
    try {
      const existing = JSON.parse(existingRaw);
      if (Array.isArray(existing) && existing.filter(Boolean).length > 0) {
        capturedPhotos = existing.slice(0, layoutConfig.shots);
        while (capturedPhotos.length < layoutConfig.shots) capturedPhotos.push(null);
        capturedPhotos.forEach((p, i) => { if (p) updateThumbnail(i, p); });
        showRearrangeView(true);
        updateLivePreview();
        return;
      }
    } catch(e) {}
  }

  await initCamera();
  checkAndShowLandscapePrompt();
  updateLivePreview();
});

// ─── CUSTOMIZE PANEL ──────────────────────────────────────────────
function initCustomizePanel() {
  const savedColor = sessionStorage.getItem('photobooth_strip_color') || '#ffffff';
  const savedText  = sessionStorage.getItem('photobooth_custom_text') || '';
  const today      = new Date().toISOString().slice(0, 10);
  const savedDate  = sessionStorage.getItem('photobooth_custom_date') || today;

  document.querySelectorAll('.sidebar-swatch').forEach(sw => {
    sw.classList.toggle('selected', sw.dataset.color === savedColor);
    sw.addEventListener('click', () => {
      document.querySelectorAll('.sidebar-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      sessionStorage.setItem('photobooth_strip_color', sw.dataset.color);
      const nameEl = document.getElementById('sidebarColorName');
      if (nameEl) nameEl.textContent = sw.dataset.name;
      updateLivePreview();
    });
  });
  const nameEl = document.getElementById('sidebarColorName');
  const activeSwatch = document.querySelector(`.sidebar-swatch[data-color="${savedColor}"]`);
  if (nameEl && activeSwatch) nameEl.textContent = activeSwatch.dataset.name;

  const textInput = document.getElementById('sidebarTextInput');
  if (textInput) {
    textInput.value = savedText;
    textInput.addEventListener('input', () => {
      sessionStorage.setItem('photobooth_custom_text', textInput.value);
      updateLivePreview();
    });
  }
  const dateInput = document.getElementById('sidebarDateInput');
  if (dateInput) {
    dateInput.value = savedDate;
    sessionStorage.setItem('photobooth_custom_date', savedDate);
    dateInput.addEventListener('change', () => {
      sessionStorage.setItem('photobooth_custom_date', dateInput.value);
      updateLivePreview();
    });
  }
}

window.setSidebarText = function(text) {
  const input = document.getElementById('sidebarTextInput');
  if (!input) return;
  input.value = text;
  sessionStorage.setItem('photobooth_custom_text', text);
  updateLivePreview();
};

// ─── MODE TOGGLE ──────────────────────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  const cameraView = document.getElementById('cameraModeView');
  const uploadView  = document.getElementById('uploadModeView');
  const camBtn = document.getElementById('modeCameraBtn');
  const upBtn  = document.getElementById('modeUploadBtn');
  if (mode === 'camera') {
    cameraView.style.display = '';
    uploadView.style.display  = 'none';
    camBtn.classList.add('active');
    upBtn.classList.remove('active');
    initCamera();
    checkAndShowLandscapePrompt();
  } else {
    cameraView.style.display  = 'none';
    uploadView.style.display  = '';
    camBtn.classList.remove('active');
    upBtn.classList.add('active');
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
    // Re-check landscape prompt (still required in upload mode too)
    checkAndShowLandscapePrompt();
    updateLivePreview();
  }
}

// ─── CAMERA INIT ──────────────────────────────────────────────────
async function initCamera() {
  if (currentMode !== 'camera' || stream) return;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width:{ideal:1280}, height:{ideal:960}, facingMode:'user' },
      audio: false,
    });
    if (videoEl) { videoEl.srcObject = stream; await videoEl.play(); }
    readyState?.classList.remove('hidden');
  } catch(err) {
    console.error('Camera error:', err);
    if (permissionError) permissionError.classList.add('visible');
  }
}

// ─── THUMBNAIL GRID ───────────────────────────────────────────────
function buildThumbnailGrid() {
  if (!thumbnailsGrid) return;
  let colClass = 'cols-1';
  if (layoutConfig.type === 'doublestrip' || layoutConfig.type === 'grid2x2') colClass = 'cols-2';
  thumbnailsGrid.className = `thumbnails-grid ${colClass}`;
  thumbnailsGrid.innerHTML = '';
  for (let i = 0; i < layoutConfig.shots; i++) {
    const slot = document.createElement('div');
    slot.className = 'thumb-slot';
    slot.id = `thumb-${i}`;
    slot.innerHTML = `<img id="thumb-img-${i}" src="" alt="Shot ${i+1}">
      <div class="slot-num">${String(i+1).padStart(2,'0')}</div>`;
    thumbnailsGrid.appendChild(slot);
  }
  if (mobileThumbs) {
    mobileThumbs.innerHTML = '';
    const max = Math.min(layoutConfig.shots, 4);
    for (let i = 0; i < max; i++) {
      const s = document.createElement('div');
      s.style.cssText = 'width:50px;height:50px;background:linear-gradient(135deg,#fef0f6,#f4efff);border:2px dashed rgba(168,85,247,.2);border-radius:9px;overflow:hidden;';
      s.id = `mob-thumb-${i}`;
      const img = document.createElement('img');
      img.style.cssText = 'width:100%;height:100%;object-fit:cover;display:block;opacity:0;transition:opacity .3s;';
      img.id = `mob-img-${i}`;
      s.appendChild(img);
      mobileThumbs.appendChild(s);
    }
    if (layoutConfig.shots > 4) {
      const more = document.createElement('div');
      more.style.cssText = 'width:50px;height:50px;display:flex;align-items:center;justify-content:center;font-size:.72rem;font-weight:800;color:var(--text-muted);';
      more.textContent = `+${layoutConfig.shots - 4}`;
      mobileThumbs.appendChild(more);
    }
  }
}

// ─── UPLOAD MODE ──────────────────────────────────────────────────
function buildUploadSlots() {
  const grid = document.getElementById('uploadSlotsGrid');
  const uploadTitle    = document.getElementById('uploadTitle');
  const uploadSubtitle = document.getElementById('uploadSubtitle');
  if (!grid) return;
  if (uploadTitle)    uploadTitle.textContent    = `Upload ${layoutConfig.shots} Photo${layoutConfig.shots>1?'s':''}`;
  if (uploadSubtitle) uploadSubtitle.textContent = `Tap each slot to choose a photo (${layoutConfig.shots} needed)`;

  uploadedPhotos = new Array(layoutConfig.shots).fill(null);
  let cols = 1;
  if (layoutConfig.type === 'grid2x2') cols = 2;
  else if (layoutConfig.type === 'doublestrip') cols = 4;
  else if (layoutConfig.shots > 4) cols = 2;
  grid.style.gridTemplateColumns = `repeat(${Math.min(cols,4)}, 1fr)`;
  grid.innerHTML = '';

  for (let i = 0; i < layoutConfig.shots; i++) {
    const slot = document.createElement('div');
    slot.className     = 'upload-slot';
    slot.id            = `upload-slot-${i}`;
    slot.dataset.index = i;
    slot.draggable     = true;
    slot.innerHTML = `
      <div class="drag-handle" style="pointer-events:auto;cursor:grab;touch-action:none;">⠿</div>
      <div class="touch-handle" style="display:none;">⠿</div>
      <div class="upload-slot-placeholder" id="upload-placeholder-${i}">
        <span class="upload-slot-icon">+</span>
        <span class="upload-slot-num">Photo ${i+1}</span>
      </div>
      <img class="upload-slot-img" id="upload-img-${i}" src="" alt="Photo ${i+1}" style="display:none;">
      <button class="upload-slot-remove" id="upload-remove-${i}" style="display:none;" onclick="removeUploadedPhoto(${i},event)" aria-label="Remove"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" style="width:.8rem;height:.8rem;"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg></button>
      <input type="file" accept="image/*" capture="environment" style="display:none;" id="upload-file-${i}" onchange="handleSingleUpload(event,${i})">
    `;
    // Click → file picker (works on both desktop and mobile)
    slot.addEventListener('click', e => {
      if (!e.target.closest('.upload-slot-remove') && !isDragging) triggerSingleUpload(i);
    });

    // ── Desktop drag-and-drop reorder ──
    slot.addEventListener('dragstart', e => {
      if (uploadedPhotos[i] === null) { e.preventDefault(); return; }
      dragSrcIndex = i; isDragging = true;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      setTimeout(() => slot.classList.add('dragging'), 0);
    });
    slot.addEventListener('dragend', () => {
      slot.classList.remove('dragging');
      document.querySelectorAll('.upload-slot').forEach(s => s.classList.remove('drag-over'));
      setTimeout(() => { isDragging = false; }, 50);
    });
    slot.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      if (parseInt(slot.dataset.index) !== dragSrcIndex) slot.classList.add('drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault(); slot.classList.remove('drag-over');
      const toIndex = parseInt(slot.dataset.index);
      if (dragSrcIndex !== null && dragSrcIndex !== toIndex) swapUploadedPhotos(dragSrcIndex, toIndex);
      dragSrcIndex = null;
    });

    // ── Touch drag reorder via drag handle (mobile) ──
    // Non-passive touchstart on the handle calls preventDefault() BEFORE
    // the browser locks in scroll mode, so touchmove stays cancelable.
    const dragHandleEl = slot.querySelector('.drag-handle');
    if (dragHandleEl) {
      let hdlDragging = false;

      dragHandleEl.addEventListener('touchstart', e => {
        if (uploadedPhotos[i] === null) return;
        e.preventDefault();   // blocks scroll lock — MUST be non-passive
        e.stopPropagation();
        hdlDragging  = true;
        isDragging   = true;
        dragSrcIndex = i;
        slot.classList.add('dragging');
        if (navigator.vibrate) navigator.vibrate(25);
      }, { passive: false });

      dragHandleEl.addEventListener('touchmove', e => {
        if (!hdlDragging) return;
        e.preventDefault();   // keeps page from scrolling while dragging
        const touch = e.touches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetSlot = el?.closest('.upload-slot');
        document.querySelectorAll('.upload-slot').forEach(s => s.classList.remove('drag-over'));
        if (targetSlot && parseInt(targetSlot.dataset.index) !== dragSrcIndex) {
          targetSlot.classList.add('drag-over');
        }
      }, { passive: false });

      dragHandleEl.addEventListener('touchend', e => {
        if (!hdlDragging) return;
        const touch = e.changedTouches[0];
        const el = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetSlot = el?.closest('.upload-slot');
        if (targetSlot) {
          const toIndex = parseInt(targetSlot.dataset.index);
          if (toIndex !== dragSrcIndex) swapUploadedPhotos(dragSrcIndex, toIndex);
        }
        slot.classList.remove('dragging');
        document.querySelectorAll('.upload-slot').forEach(s => s.classList.remove('drag-over'));
        hdlDragging = false;
        setTimeout(() => { isDragging = false; dragSrcIndex = null; }, 80);
      }, { passive: true });

      dragHandleEl.addEventListener('touchcancel', () => {
        slot.classList.remove('dragging');
        document.querySelectorAll('.upload-slot').forEach(s => s.classList.remove('drag-over'));
        hdlDragging = false; isDragging = false; dragSrcIndex = null;
      }, { passive: true });
    }

    // ── FIX: Slot-level touch drag fallback (mobile) ──
    // On iOS, -webkit-overflow-scrolling:touch on the parent container can swallow
    // touch events before the handle's preventDefault() fires, making handle-based
    // drag unreliable.  We attach a secondary long-press-to-drag on the slot itself
    // so users can initiate a drag from anywhere on a filled slot (not just the handle).
    // A 180ms hold distinguishes drag-intent from a tap (file-picker).
    {
      let slotLongPressTimer = null;
      let slotTouchActive    = false;
      let slotTchX = 0, slotTchY = 0;
      let slotHdlDragging    = false;

      slot.addEventListener('touchstart', e => {
        // Only activate on filled slots; ignore touches on the remove button or handle
        if (uploadedPhotos[i] === null) return;
        if (e.target.closest('.upload-slot-remove,.drag-handle')) return;
        slotTchX = e.touches[0].clientX;
        slotTchY = e.touches[0].clientY;
        slotTouchActive = true;
        slotHdlDragging = false;

        slotLongPressTimer = setTimeout(() => {
          if (!slotTouchActive) return;
          // Commit to drag after hold threshold
          slotHdlDragging = true;
          isDragging      = true;
          dragSrcIndex    = i;
          slot.classList.add('dragging');
          if (navigator.vibrate) navigator.vibrate(30);
        }, 180);
      }, { passive: true });

      slot.addEventListener('touchmove', e => {
        if (!slotTouchActive) return;
        const dx = Math.abs(e.touches[0].clientX - slotTchX);
        const dy = Math.abs(e.touches[0].clientY - slotTchY);
        // If moved >8px before the timer fires, cancel long-press (user is scrolling)
        if (!slotHdlDragging && (dx > 8 || dy > 8)) {
          clearTimeout(slotLongPressTimer);
          slotTouchActive = false;
          return;
        }
        if (!slotHdlDragging) return;
        e.preventDefault();
        const touch = e.touches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetSlot = target?.closest('.upload-slot');
        document.querySelectorAll('.upload-slot').forEach(s => s.classList.remove('drag-over'));
        if (targetSlot && parseInt(targetSlot.dataset.index) !== dragSrcIndex) {
          targetSlot.classList.add('drag-over');
        }
      }, { passive: false });

      slot.addEventListener('touchend', e => {
        clearTimeout(slotLongPressTimer);
        slotTouchActive = false;
        if (!slotHdlDragging) return;
        const touch = e.changedTouches[0];
        const target = document.elementFromPoint(touch.clientX, touch.clientY);
        const targetSlot = target?.closest('.upload-slot');
        if (targetSlot) {
          const toIndex = parseInt(targetSlot.dataset.index);
          if (toIndex !== dragSrcIndex) swapUploadedPhotos(dragSrcIndex, toIndex);
        }
        slot.classList.remove('dragging');
        document.querySelectorAll('.upload-slot').forEach(s => s.classList.remove('drag-over'));
        slotHdlDragging = false;
        setTimeout(() => { isDragging = false; dragSrcIndex = null; }, 80);
      }, { passive: true });

      slot.addEventListener('touchcancel', () => {
        clearTimeout(slotLongPressTimer);
        slotTouchActive = false;
        slot.classList.remove('dragging');
        document.querySelectorAll('.upload-slot').forEach(s => s.classList.remove('drag-over'));
        slotHdlDragging = false; isDragging = false; dragSrcIndex = null;
      }, { passive: true });
    }

    grid.appendChild(slot);
  }
}

function swapUploadedPhotos(a, b) {
  const tmp = uploadedPhotos[a]; uploadedPhotos[a] = uploadedPhotos[b]; uploadedPhotos[b] = tmp;
  renderUploadSlot(a); renderUploadSlot(b);
  updateUploadProgress(); updateLivePreview();
}

function renderUploadSlot(index) {
  const dataUrl     = uploadedPhotos[index];
  const slot        = document.getElementById(`upload-slot-${index}`);
  const placeholder = document.getElementById(`upload-placeholder-${index}`);
  const img         = document.getElementById(`upload-img-${index}`);
  const removeBtn   = document.getElementById(`upload-remove-${index}`);
  if (!slot) return;
  if (dataUrl) {
    slot.classList.add('filled');
    if (placeholder) placeholder.style.display = 'none';
    if (img)         { img.src = dataUrl; img.style.display = 'block'; }
    if (removeBtn)   removeBtn.style.display = 'flex';
  } else {
    slot.classList.remove('filled');
    if (placeholder) placeholder.style.display = '';
    if (img)         { img.src = ''; img.style.display = 'none'; }
    if (removeBtn)   removeBtn.style.display = 'none';
  }
  const thumbSlot = document.getElementById(`thumb-${index}`);
  const thumbImg  = document.getElementById(`thumb-img-${index}`);
  if (thumbSlot) thumbSlot.classList.toggle('captured', !!dataUrl);
  if (thumbImg)  { thumbImg.src = dataUrl || ''; thumbImg.style.opacity = dataUrl ? '1' : '0'; }
}

function updateUploadProgress() {
  const filled = uploadedPhotos.filter(Boolean).length;
  const total  = layoutConfig.shots;
  const progWrap = document.getElementById('uploadProgressWrap');
  const progFill = document.getElementById('uploadProgressFill');
  const progLbl  = document.getElementById('uploadProgressLabel');
  const contBtn  = document.getElementById('uploadContinueBtn');
  const hint     = document.getElementById('reorderHint');
  if (progWrap) progWrap.style.display = filled > 0 ? '' : 'none';
  if (progFill) progFill.style.width   = `${(filled/total)*100}%`;
  if (progLbl)  progLbl.textContent    = `${filled} of ${total} photos selected`;
  const allFilled = filled >= total;
  if (contBtn) { contBtn.disabled = !allFilled; contBtn.style.opacity = allFilled ? '1' : '.5'; }
  if (hint)    hint.classList.toggle('visible', filled >= 2);
}

function triggerSingleUpload(index) { document.getElementById(`upload-file-${index}`)?.click(); }
function triggerBulkUpload() { const i = document.getElementById('bulkFileInput'); if (i) { i.multiple = true; i.click(); } }

async function handleSingleUpload(event, index) {
  const file = event.target.files?.[0];
  if (!file) return;
  const raw = await readFileAsDataUrl(file);
  const compressed = await compressImage(raw, 900, 0.78);
  setUploadedPhoto(index, compressed);
}
async function handleBulkUpload(event) {
  const files = Array.from(event.target.files || []);
  const limit = Math.min(files.length, layoutConfig.shots);
  const raws = await Promise.all(files.slice(0, limit).map(f => readFileAsDataUrl(f)));
  const compressed = await Promise.all(raws.map(r => compressImage(r, 900, 0.78)));
  compressed.forEach((url, i) => setUploadedPhoto(i, url));
}
function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = e => resolve(e.target.result);
    r.onerror = reject;
    r.readAsDataURL(file);
  });
}
function setUploadedPhoto(index, dataUrl) {
  uploadedPhotos[index] = dataUrl;
  renderUploadSlot(index); updateUploadProgress(); updateLivePreview();
}
function removeUploadedPhoto(index, event) {
  event?.stopPropagation();
  uploadedPhotos[index] = null;
  renderUploadSlot(index);
  const fi = document.getElementById(`upload-file-${index}`);
  if (fi) fi.value = '';
  updateUploadProgress(); updateLivePreview();
}
async function continueFromUpload() {
  if (uploadedPhotos.filter(Boolean).length < layoutConfig.shots) return;
  const btn = document.getElementById('uploadContinueBtn');
  if (btn) { btn.textContent = 'Preparing…'; btn.disabled = true; }
  const compressed = await Promise.all(uploadedPhotos.map(p => p ? compressImage(p, 900, 0.78) : Promise.resolve(null)));
  safeSetPhotos(compressed);
  if (!sessionStorage.getItem('photobooth_photos_idb')) window.location.href = 'result.html';
}

// ─── CAMERA SESSION ───────────────────────────────────────────────
async function beginSession() {
  if (isCapturing) return;
  await openFullscreenCamera();
}

// kept for internal use — no longer called from beginSession
async function _legacyCaptureSequence_UNUSED() {
  if (isCapturing) return;
  isCapturing    = true;
  isPaused       = false;
  capturedPhotos = new Array(layoutConfig.shots).fill(null);
  sessionStorage.removeItem('photobooth_photos');

  readyState?.classList.add('hidden');
  if (videoEl)        videoEl.style.display        = 'block';
  if (snapshotCanvas) snapshotCanvas.style.display = 'none';

  // Show pause button, disable start button
  if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '.5'; }
  if (pauseBtn) {
    pauseBtn.style.display = '';
    pauseBtn.innerHTML = '<svg class="ico" viewBox="0 0 24 24" fill="currentColor" stroke="none"><rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/></svg> Pause';
    pauseBtn.classList.remove('is-paused');
  }

  updateProgress(0);
  await captureSequence();
}

async function captureSequence() {
  for (let i = 0; i < layoutConfig.shots; i++) {

    // ── CHECK FOR PAUSE before each shot ──
    if (isPaused) {
      updateStatus('Session paused — press Resume to continue', false);
      await waitIfPaused();
    }

    updateStatus(`Photo ${i+1} of ${layoutConfig.shots}`, true);
    updateProgress(i);
    if (shotLabelCurrent) shotLabelCurrent.textContent = `Photo ${i+1}`;

    await runCountdown(3, `Shot ${i+1} of ${layoutConfig.shots}`);

    // ── CHECK FOR PAUSE after countdown (before capture) ──
    if (isPaused) {
      updateStatus('Session paused — press Resume to continue', false);
      await waitIfPaused();
    }

    const dataUrl    = captureFrame();
    const compressed = await compressImage(dataUrl, 900, 0.80);
    capturedPhotos[i] = compressed;
    updateThumbnail(i, compressed);

    triggerFlash();

    const isLast = (i === layoutConfig.shots - 1);
    await showCapturedPause(i + 1, isLast);
  }

  updateProgress(layoutConfig.shots);
  updateStatus('All shots done! Review your photos below.', true);

  // Hide pause button once session is complete
  if (pauseBtn) pauseBtn.style.display = 'none';

  showRearrangeView(false);
}

// ─── COUNTDOWN (pause-aware) ───────────────────────────────────────
function runCountdown(from, label) {
  return new Promise(resolve => {
    let count = from;

    function tick() {
      // If paused mid-countdown: hide overlay and wait for resume
      if (isPaused) {
        if (countdownOverlay) countdownOverlay.classList.remove('visible');
        waitIfPaused().then(() => tick()); // resume countdown after un-pause
        return;
      }

      if (count <= 0) {
        countdownOverlay.classList.remove('visible');
        resolve();
        return;
      }

      countdownNumber.textContent = count;
      if (countdownLabel) countdownLabel.textContent = label || '';
      countdownOverlay.classList.add('visible');
      countdownNumber.style.animation = 'none';
      countdownNumber.offsetHeight; // reflow
      countdownNumber.style.animation = '';
      count--;
      setTimeout(tick, 1000);
    }

    tick();
  });
}

// ─── CAPTURED PAUSE ───────────────────────────────────────────────
async function showCapturedPause(shotNum, isLast) {
  if (snapshotCanvas) snapshotCanvas.style.display = 'block';
  if (videoEl)        videoEl.style.display        = 'none';

  if (capturedLabel)    capturedLabel.textContent    = `Shot ${shotNum} captured!`;
  if (capturedSublabel) capturedSublabel.textContent = isLast ? 'All shots done!' : 'Get ready for the next one…';

  if (capturedStateEl) capturedStateEl.classList.add('visible');
  await sleep(1400);
  if (capturedStateEl) capturedStateEl.classList.remove('visible');
  await sleep(150);

  if (!isLast) {
    if (snapshotCanvas) snapshotCanvas.style.display = 'none';
    if (videoEl)        videoEl.style.display        = 'block';
    await sleep(500);
  }
}

function captureFrame() {
  if (!videoEl || !snapshotCanvas) return null;
  const w = videoEl.videoWidth  || 1280;
  const h = videoEl.videoHeight || 960;
  snapshotCanvas.width = w; snapshotCanvas.height = h;
  const ctx = snapshotCanvas.getContext('2d');
  ctx.translate(w, 0); ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return snapshotCanvas.toDataURL('image/jpeg', 0.85);
}

function triggerFlash() {
  if (!flashOverlay) return;
  flashOverlay.style.transition = 'opacity 0.05s';
  flashOverlay.style.opacity    = '1';
  setTimeout(() => { flashOverlay.style.transition = 'opacity 0.45s ease-out'; flashOverlay.style.opacity = '0'; }, 60);
}

function updateThumbnail(i, dataUrl) {
  const slot = document.getElementById(`thumb-${i}`);
  const img  = document.getElementById(`thumb-img-${i}`);
  if (slot) slot.classList.add('captured');
  if (img)  { img.src = dataUrl; img.style.opacity = '1'; }
  const mobSlot = document.getElementById(`mob-thumb-${i}`);
  const mobImg  = document.getElementById(`mob-img-${i}`);
  if (mobSlot) { mobSlot.style.borderStyle = 'solid'; mobSlot.style.borderColor = layoutConfig.accentColor + '88'; }
  if (mobImg)  { mobImg.src = dataUrl; mobImg.style.opacity = '1'; }
  updateLivePreview();
}

// ─── REARRANGE VIEW ───────────────────────────────────────────────
function showRearrangeView(fromStorage) {
  // FIX: Always switch to 'camera' mode so updateLivePreview() reads capturedPhotos
  // (which is always populated before showRearrangeView is called — either from
  // capture session, from sessionStorage on return, or now from continueFromUpload).
  currentMode = 'camera';

  const modeWrap   = document.getElementById('modeToggleWrap');
  const cameraView = document.getElementById('cameraModeView');
  const uploadView  = document.getElementById('uploadModeView');
  const rearrangeV  = document.getElementById('rearrangeView');

  if (modeWrap)   modeWrap.style.display   = 'none';
  if (cameraView) cameraView.style.display = 'none';
  if (uploadView)  uploadView.style.display  = 'none';
  if (rearrangeV)  rearrangeV.style.display  = '';

  const title    = document.getElementById('rearrangeTitle');
  const subtitle = document.getElementById('rearrangeSubtitle');
  if (title)    title.textContent    = fromStorage ? 'Rearrange Your Photos' : 'Review & Rearrange';
  if (subtitle) subtitle.textContent = fromStorage
    ? 'Drag photos to reorder, then rebuild your strip'
    : 'Drag your photos to change their order in the strip';

  buildRearrangeGrid();
  updateLivePreview();
}

function buildRearrangeGrid() {
  const grid = document.getElementById('rearrangeGrid');
  if (!grid) return;

  const cols = (layoutConfig.type === 'doublestrip') ? 4
             : (layoutConfig.shots <= 2)             ? 2
             :                                          2;
  grid.style.gridTemplateColumns = `repeat(${Math.min(cols, 4)}, 1fr)`;
  grid.innerHTML = '';

  capturedPhotos.forEach((photo, i) => {
    const slot = document.createElement('div');
    slot.className     = `rearrange-slot${photo ? ' filled' : ''}`;
    slot.dataset.index = i;
    slot.draggable     = !!photo;

    if (photo) {
      const img = document.createElement('img');
      img.src = photo; img.alt = `Shot ${i+1}`;
      slot.appendChild(img);
      const handle = document.createElement('div');
      handle.className = 'rearrange-drag-handle'; handle.innerHTML = '⠿';
      slot.appendChild(handle);
    } else {
      const empty = document.createElement('div');
      empty.className = 'rearrange-slot-empty';
      empty.innerHTML = `<span class="rearrange-empty-num">${i+1}</span>`;
      slot.appendChild(empty);
    }

    const numBadge = document.createElement('div');
    numBadge.className = 'rearrange-slot-num';
    numBadge.textContent = i + 1;
    slot.appendChild(numBadge);

    grid.appendChild(slot);

    if (!photo) return;

    slot.addEventListener('dragstart', e => {
      rearrangeDragSrc = i;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(i));
      setTimeout(() => slot.classList.add('rearrange-dragging'), 0);
    });
    slot.addEventListener('dragend', () => {
      slot.classList.remove('rearrange-dragging');
      grid.querySelectorAll('.rearrange-slot').forEach(s => s.classList.remove('rearrange-drag-over'));
    });
    slot.addEventListener('dragover', e => {
      e.preventDefault(); e.dataTransfer.dropEffect = 'move';
      if (parseInt(slot.dataset.index) !== rearrangeDragSrc) slot.classList.add('rearrange-drag-over');
    });
    slot.addEventListener('dragleave', () => slot.classList.remove('rearrange-drag-over'));
    slot.addEventListener('drop', e => {
      e.preventDefault(); slot.classList.remove('rearrange-drag-over');
      const toIdx = parseInt(slot.dataset.index);
      if (rearrangeDragSrc !== null && rearrangeDragSrc !== toIdx) swapCapturedPhotos(rearrangeDragSrc, toIdx);
      rearrangeDragSrc = null;
    });

    // Touch drag (mobile)
    let tSrcIdx = null, tStartX, tStartY, tDragging = false;
    slot.addEventListener('touchstart', e => {
      if (!photo) return;
      tSrcIdx = i; tDragging = false;
      tStartX = e.touches[0].clientX; tStartY = e.touches[0].clientY;
    }, { passive: true });
    slot.addEventListener('touchmove', e => {
      if (tSrcIdx === null) return;
      const dx = Math.abs(e.touches[0].clientX - tStartX);
      const dy = Math.abs(e.touches[0].clientY - tStartY);
      if (dx > 8 || dy > 8) {
        e.preventDefault(); tDragging = true;
        slot.classList.add('rearrange-dragging');
        const touch = e.touches[0];
        grid.querySelectorAll('.rearrange-slot').forEach(s => {
          const r = s.getBoundingClientRect();
          const over = touch.clientX >= r.left && touch.clientX <= r.right
                    && touch.clientY >= r.top  && touch.clientY <= r.bottom
                    && parseInt(s.dataset.index) !== tSrcIdx;
          s.classList.toggle('rearrange-drag-over', over);
        });
      }
    }, { passive: false });
    slot.addEventListener('touchend', e => {
      slot.classList.remove('rearrange-dragging');
      const touch = e.changedTouches[0]; let targetIdx = null;
      grid.querySelectorAll('.rearrange-slot').forEach(s => {
        s.classList.remove('rearrange-drag-over');
        if (!tDragging) return;
        const r = s.getBoundingClientRect();
        if (touch.clientX >= r.left && touch.clientX <= r.right
         && touch.clientY >= r.top  && touch.clientY <= r.bottom) targetIdx = parseInt(s.dataset.index);
      });
      if (tDragging && targetIdx !== null && targetIdx !== tSrcIdx) swapCapturedPhotos(tSrcIdx, targetIdx);
      tSrcIdx = null; tDragging = false;
    });

    // ── Touch drag via handle (mobile) — prevents scroll from starting ──
    const rearrangeHandleEl = slot.querySelector('.rearrange-drag-handle');
    if (rearrangeHandleEl) {
      let hdlDragging = false;

      rearrangeHandleEl.addEventListener('touchstart', e => {
        if (!photo) return;
        e.preventDefault();   // blocks scroll — MUST be non-passive
        e.stopPropagation();
        hdlDragging  = true;
        tSrcIdx      = i;
        tDragging    = false;
        tStartX      = e.touches[0].clientX;
        tStartY      = e.touches[0].clientY;
        slot.classList.add('rearrange-dragging');
        if (navigator.vibrate) navigator.vibrate(25);
      }, { passive: false });

      rearrangeHandleEl.addEventListener('touchmove', e => {
        if (!hdlDragging) return;
        e.preventDefault();
        tDragging = true;
        const touch = e.touches[0];
        grid.querySelectorAll('.rearrange-slot').forEach(s => {
          const r = s.getBoundingClientRect();
          const over = touch.clientX >= r.left && touch.clientX <= r.right
                    && touch.clientY >= r.top  && touch.clientY <= r.bottom
                    && parseInt(s.dataset.index) !== tSrcIdx;
          s.classList.toggle('rearrange-drag-over', over);
        });
      }, { passive: false });

      rearrangeHandleEl.addEventListener('touchend', e => {
        if (!hdlDragging) return;
        slot.classList.remove('rearrange-dragging');
        const touch = e.changedTouches[0];
        let targetIdx = null;
        grid.querySelectorAll('.rearrange-slot').forEach(s => {
          s.classList.remove('rearrange-drag-over');
          const r = s.getBoundingClientRect();
          if (touch.clientX >= r.left && touch.clientX <= r.right
           && touch.clientY >= r.top  && touch.clientY <= r.bottom) targetIdx = parseInt(s.dataset.index);
        });
        if (targetIdx !== null && targetIdx !== tSrcIdx) swapCapturedPhotos(tSrcIdx, targetIdx);
        hdlDragging = false; tSrcIdx = null; tDragging = false;
      }, { passive: true });

      rearrangeHandleEl.addEventListener('touchcancel', () => {
        slot.classList.remove('rearrange-dragging');
        grid.querySelectorAll('.rearrange-slot').forEach(s => s.classList.remove('rearrange-drag-over'));
        hdlDragging = false; tSrcIdx = null; tDragging = false;
      }, { passive: true });
    }
  });
}

// FIX: Track whether the rearrange view was entered from the upload flow.
// retakeFromRearrange() uses this to return the user to the right view.
let _rearrangeFromUpload = false;

function swapCapturedPhotos(a, b) {
  const tmp = capturedPhotos[a]; capturedPhotos[a] = capturedPhotos[b]; capturedPhotos[b] = tmp;
  buildRearrangeGrid();
  capturedPhotos.forEach((p, i) => {
    const ts = document.getElementById(`thumb-${i}`);
    const ti = document.getElementById(`thumb-img-${i}`);
    if (ts) ts.classList.toggle('captured', !!p);
    if (ti) { ti.src = p || ''; ti.style.opacity = p ? '1' : '0'; }
  });
  updateLivePreview();
}

async function buildStrip() {
  const btn = document.getElementById('buildStripBtn');
  if (btn) { btn.textContent = 'Preparing…'; btn.disabled = true; }

  const compressed = await Promise.all(capturedPhotos.map(p => p ? compressImage(p, 900, 0.78) : Promise.resolve(null)));
  safeSetPhotos(compressed);
  await sleep(100);
  if (!sessionStorage.getItem('photobooth_photos_idb')) window.location.href = 'result.html';
}

function retakeFromRearrange() {
  capturedPhotos = new Array(layoutConfig.shots).fill(null);
  sessionStorage.removeItem('photobooth_photos');
  sessionStorage.removeItem('photobooth_photos_idb');
  sessionStorage.removeItem('photobooth_stickers');

  const rearrangeV = document.getElementById('rearrangeView');
  const modeWrap   = document.getElementById('modeToggleWrap');
  const cameraView = document.getElementById('cameraModeView');
  const uploadView  = document.getElementById('uploadModeView');
  if (rearrangeV) rearrangeV.style.display = 'none';
  if (modeWrap)   modeWrap.style.display   = '';

  // FIX: Return to upload mode if that's where the user came from
  if (_rearrangeFromUpload) {
    _rearrangeFromUpload = false;
    if (cameraView) cameraView.style.display = 'none';
    if (uploadView)  uploadView.style.display  = '';
    currentMode = 'upload';
    document.getElementById('modeCameraBtn')?.classList.remove('active');
    document.getElementById('modeUploadBtn')?.classList.add('active');
    // Reset uploadedPhotos so all slots are empty again
    uploadedPhotos = new Array(layoutConfig.shots).fill(null);
    buildUploadSlots();
    updateLivePreview();
    return;
  }

  if (cameraView) cameraView.style.display = '';
  if (uploadView)  uploadView.style.display  = 'none';

  currentMode = 'camera';
  document.getElementById('modeCameraBtn')?.classList.add('active');
  document.getElementById('modeUploadBtn')?.classList.remove('active');

  isCapturing = false;
  resetPauseState();

  if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = '1'; startBtn.textContent = '▶ Start Session'; }
  if (snapshotCanvas) snapshotCanvas.style.display = 'none';
  if (videoEl)        videoEl.style.display        = 'block';
  readyState?.classList.remove('hidden');

  updateProgress(0);
  updateStatus('Press Start Session to begin', false);
  if (shotLabelCurrent) shotLabelCurrent.textContent = 'Ready to start';

  buildThumbnailGrid();
  updateLivePreview();
  initCamera();
  checkAndShowLandscapePrompt();
}

// ─── LIVE STRIP PREVIEW ───────────────────────────────────────────
let previewDebounce = null;
async function updateLivePreview() {
  const canvas      = document.getElementById('liveStripCanvas');
  const placeholder = document.getElementById('livePreviewPlaceholder');
  const countEl     = document.getElementById('previewShotCount');
  if (!canvas || !layoutConfig) return;

  const sourcePhotos = currentMode === 'upload' ? uploadedPhotos : capturedPhotos;
  const done = (sourcePhotos || []).filter(Boolean).length;
  if (countEl) countEl.textContent = `${done}/${layoutConfig.shots} shots`;

  clearTimeout(previewDebounce);
  previewDebounce = setTimeout(async () => {
    try {
      const photos = Array.from({ length: layoutConfig.shots }, (_, i) =>
        (sourcePhotos && sourcePhotos[i]) ? sourcePhotos[i] : null
      );
      const strip = await generatePhotoStrip(photos, layoutConfig);
      canvas.width  = strip.width;
      canvas.height = strip.height;
      canvas.getContext('2d').drawImage(strip, 0, 0);
      canvas.style.display = '';
      if (placeholder) placeholder.style.display = 'none';
    } catch(e) { console.warn('Preview error:', e); }
  }, 150);
}

function updateProgress(done) { if (shotBarFill) shotBarFill.style.width = `${(done/layoutConfig.shots)*100}%`; }
function updateStatus(msg, active) {
  if (!statusMsg) return;
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg${active ? ' active' : ''}`;
}

// ─── UTILS ────────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }
function shiftHue(hex) {
  return {'#ff6b9d':'#c026d3','#a855f7':'#7c3aed','#2dd4bf':'#0891b2','#fbbf24':'#f97316'}[hex] || '#a855f7';
}

// ═══════════════════════════════════════════════════════════════════
//  FULLSCREEN CAMERA OVERLAY ENGINE
// ═══════════════════════════════════════════════════════════════════

let fscStream         = null;
let fscFacingMode     = null;   // lazily set on first open
let fscShutterLocked  = false;

// ── OPEN / CLOSE ────────────────────────────────────────────────────
async function openFullscreenCamera() {
  // Initialize state — always reset shutter lock so retakes work correctly
  isCapturing      = true;
  isPaused         = false;
  fscAborted       = false;
  fscShutterLocked = false;
  capturedPhotos   = new Array(layoutConfig.shots).fill(null);
  sessionStorage.removeItem('photobooth_photos');

  // Default facing mode: front camera (selfie) — this is a photo booth app
  if (!fscFacingMode) {
    fscFacingMode = 'user';
  }

  // Build dynamic UI
  fscBuildShotDots();
  fscBuildThumbs();
  fscUpdateProgressIndicator(0, layoutConfig.shots);

  // Apply current mode UI
  fscApplyModeUI();

  // Hide landscape overlay — its z-index (99999) would block fsc (9999) and swallow shutter taps
  const lsOverlay = document.getElementById('landscapeOverlay');
  if (lsOverlay) lsOverlay.classList.remove('visible');

  // Prevent page scroll behind overlay
  document.body.style.overflow = 'hidden';

  // Show overlay
  const overlay = document.getElementById('fullscreenCameraOverlay');
  overlay.classList.add('fsc-open');

  // Wire up controls (remove old listeners by cloning)
  const closeBtn  = document.getElementById('fscCloseBtn');
  const flipBtn   = document.getElementById('fscFlipBtn');
  const shutterBtn = document.getElementById('fscShutterBtn');
  const modeAutoBtn   = document.getElementById('fscModeAuto');
  const modeManualBtn = document.getElementById('fscModeManual');

  [closeBtn, flipBtn, shutterBtn, modeAutoBtn, modeManualBtn].forEach(el => {
    if (!el) return;
    const clone = el.cloneNode(true);
    el.replaceWith(clone);
  });

  document.getElementById('fscCloseBtn').addEventListener('click', () => {
    fscCancel();
  });
  document.getElementById('fscFlipBtn').addEventListener('click', () => {
    if (!fscShutterLocked) fscFlip();
  });

  // ── Shutter: touchend for instant mobile response, click as fallback ──
  const newShutter = document.getElementById('fscShutterBtn');
  let shutterTouched = false;
  newShutter.addEventListener('touchend', (e) => {
    e.preventDefault(); // stops the delayed synthetic click from also firing
    if (!fscShutterLocked) {
      shutterTouched = true;
      fscStartBurst();
    }
  }, { passive: false });
  newShutter.addEventListener('click', () => {
    if (shutterTouched) { shutterTouched = false; return; } // already handled by touchend
    if (!fscShutterLocked) fscStartBurst();
  });

  document.getElementById('fscModeAuto')?.addEventListener('click', () => {
    if (!fscShutterLocked) fscSetMode('auto');
  });
  document.getElementById('fscModeManual')?.addEventListener('click', () => {
    if (!fscShutterLocked) fscSetMode('manual');
  });

  // Start camera stream
  await fscStartStream();
}

async function fscStartStream() {
  // Stop any existing fsc stream
  if (fscStream) { fscStream.getTracks().forEach(t => t.stop()); fscStream = null; }

  const video = document.getElementById('fscVideo');
  try {
    const constraints = {
      video: {
        width:  { ideal: 1920 },
        height: { ideal: 1080 },
        facingMode: fscFacingMode,
      },
      audio: false,
    };
    fscStream = await navigator.mediaDevices.getUserMedia(constraints);
    video.srcObject = fscStream;
    // Mirror only front camera
    video.style.transform = (fscFacingMode === 'user') ? 'scaleX(-1)' : 'scaleX(1)';
    await video.play();
  } catch(err) {
    // Fallback: try without facingMode constraint
    try {
      fscStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      video.srcObject = fscStream;
      video.style.transform = 'scaleX(-1)';
      await video.play();
    } catch(err2) {
      console.error('FSC: camera unavailable', err2);
    }
  }
}

async function fscFlip() {
  fscFacingMode = (fscFacingMode === 'user') ? 'environment' : 'user';
  // Quick visual flip effect
  const video = document.getElementById('fscVideo');
  if (video) { video.style.opacity = '0'; video.style.transition = 'opacity 0.2s'; }
  await fscStartStream();
  if (video) {
    await fscSleep(80);
    video.style.opacity = '1';
  }
}

function fscCancel() {
  fscAborted = true;
  fscShutterLocked = false;
  fscCloseOverlay();
  // Reset UI to ready state
  capturedPhotos = new Array(layoutConfig.shots).fill(null);
  isCapturing    = false;
  resetPauseState();
  if (startBtn) { startBtn.disabled = false; startBtn.style.opacity = '1'; }
  buildThumbnailGrid();
  updateLivePreview();
  // Restart background preview camera
  initCamera();
}

function fscCloseOverlay() {
  if (fscStream) { fscStream.getTracks().forEach(t => t.stop()); fscStream = null; }
  const overlay = document.getElementById('fullscreenCameraOverlay');
  if (overlay) {
    overlay.style.transition = 'opacity 0.25s';
    overlay.style.opacity    = '0';
    setTimeout(() => {
      overlay.classList.remove('fsc-open');
      overlay.style.opacity    = '';
      overlay.style.transition = '';
    }, 260);
  }
  document.body.style.overflow = '';
  // Re-evaluate landscape prompt now that fsc is closed
  setTimeout(checkAndShowLandscapePrompt, 100);
}

// ── BURST CAPTURE SEQUENCE ──────────────────────────────────────────
async function fscStartBurst() {
  if (fscShutterLocked) return;

  const startIndex = capturedPhotos.filter(p => p !== null).length;
  if (startIndex >= layoutConfig.shots) return;

  fscShutterLocked = true;

  // Safety net: if the lock isn't released within 45 s (e.g. due to a JS error),
  // auto-reset so the user is never permanently stuck.
  const lockResetTimer = setTimeout(() => {
    fscShutterLocked = false;
    const sb = document.getElementById('fscShutterBtn');
    const fb = document.getElementById('fscFlipBtn');
    if (sb) { sb.disabled = false; sb.classList.remove('fsc-capturing'); }
    if (fb) fb.disabled = false;
  }, 45000);

  const shutterBtn = document.getElementById('fscShutterBtn');
  if (shutterBtn) {
    shutterBtn.disabled = true;
    shutterBtn.classList.add('fsc-capturing');
    shutterBtn.classList.remove('fsc-ripple');
    shutterBtn.offsetHeight;
    shutterBtn.classList.add('fsc-ripple');
  }

  // Disable flip during capture
  const flipBtn = document.getElementById('fscFlipBtn');
  if (flipBtn) flipBtn.disabled = true;

  try {
    if (fscCaptureMode === 'auto') {
      // ── AUTO MODE: capture all shots automatically ──
      for (let i = startIndex; i < layoutConfig.shots; i++) {
        await fscCaptureOneShot(i);
        if (fscAborted) { clearTimeout(lockResetTimer); return; }
      }
      clearTimeout(lockResetTimer);
      fscFinishCapture();
    } else {
      // ── MANUAL MODE: capture one shot, then re-enable shutter ──
      await fscCaptureOneShot(startIndex);
      clearTimeout(lockResetTimer);
      if (fscAborted) return;

      const nextIndex = startIndex + 1;
      if (nextIndex >= layoutConfig.shots) {
        fscFinishCapture();
      } else {
        // Re-enable for next shot
        fscShutterLocked = false;
        if (shutterBtn) {
          shutterBtn.disabled = false;
          shutterBtn.classList.remove('fsc-capturing');
        }
        if (flipBtn) flipBtn.disabled = false;
      }
    }
  } catch (err) {
    // Unexpected error — release the lock so user isn't stuck
    clearTimeout(lockResetTimer);
    fscShutterLocked = false;
    if (shutterBtn) { shutterBtn.disabled = false; shutterBtn.classList.remove('fsc-capturing'); }
    if (flipBtn) flipBtn.disabled = false;
    console.error('fscStartBurst error:', err);
  }
}

// Captures ONE shot: countdown → flash → compress → update UI
async function fscCaptureOneShot(shotIndex) {
  fscUpdateDots(shotIndex, false);
  fscUpdateProgressIndicator(shotIndex + 1, layoutConfig.shots);

  await fscRunCountdown(3, shotIndex);
  if (fscAborted) return;

  fscTriggerFlash();
  const raw        = fscCaptureFrame();
  const compressed = await compressImage(raw, 900, 0.80);
  capturedPhotos[shotIndex] = compressed;

  fscUpdateThumb(shotIndex, compressed);
  updateThumbnail(shotIndex, compressed);
  fscUpdateDots(shotIndex, true);

  const isLast = (shotIndex === layoutConfig.shots - 1);
  await fscShowCaptureFeedback(shotIndex + 1, isLast);
}

// Called when all shots are done
function fscFinishCapture() {
  fscCloseOverlay();
  updateProgress(layoutConfig.shots);
  updateStatus('All shots done! Review your photos below.', true);
  updateLivePreview();
  showRearrangeView(false);
}

// ── COUNTDOWN ───────────────────────────────────────────────────────
function fscRunCountdown(from, shotIndex) {
  return new Promise(resolve => {
    const overlay  = document.getElementById('fscCountdown');
    const numEl    = document.getElementById('fscCountdownNumber');
    const subEl    = document.getElementById('fscCountdownSublabel');
    if (subEl) subEl.textContent = `Shot ${shotIndex + 1} of ${layoutConfig.shots}`;

    let count = from;
    overlay.classList.add('fsc-visible');

    function tick() {
      if (fscAborted) {
        overlay.classList.remove('fsc-visible');
        resolve(); return;
      }
      if (count <= 0) {
        overlay.classList.remove('fsc-visible');
        resolve(); return;
      }
      numEl.textContent = count;
      // Re-trigger pop animation each tick
      numEl.style.animation = 'none';
      numEl.offsetHeight;
      numEl.style.animation = '';
      count--;
      setTimeout(tick, 1000);
    }
    tick();
  });
}

// ── FRAME CAPTURE ───────────────────────────────────────────────────
function fscCaptureFrame() {
  const video  = document.getElementById('fscVideo');
  const canvas = document.getElementById('fscCaptureCanvas');
  if (!video || !canvas) return null;
  const w = video.videoWidth  || 1280;
  const h = video.videoHeight || 960;
  canvas.width  = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  // Front camera: save mirrored (matches the preview — what you see is what you get)
  // Rear camera: save natural orientation
  if (fscFacingMode === 'user') {
    ctx.translate(w, 0);
    ctx.scale(-1, 1);
  }
  ctx.drawImage(video, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return canvas.toDataURL('image/jpeg', 0.85);
}

// ── FLASH ────────────────────────────────────────────────────────────
function fscTriggerFlash() {
  const flash = document.getElementById('fscFlash');
  if (!flash) return;
  flash.style.transition = 'opacity 0.05s';
  flash.style.opacity    = '1';
  setTimeout(() => {
    flash.style.transition = 'opacity 0.42s ease-out';
    flash.style.opacity    = '0';
  }, 65);
}

// ── CAPTURED FEEDBACK ───────────────────────────────────────────────
async function fscShowCaptureFeedback(shotNum, isLast) {
  const fb   = document.getElementById('fscCapturedFeedback');
  const text = document.getElementById('fscCapturedText');
  const sub  = document.getElementById('fscCapturedSub');
  if (!fb) return;
  if (text) text.textContent = `Shot ${shotNum} of ${layoutConfig.shots}`;
  if (sub)  sub.textContent  = isLast ? 'All shots done!' : 'Get ready for the next one…';
  fb.classList.add('fsc-visible');
  await fscSleep(isLast ? 1000 : 1100);
  fb.classList.remove('fsc-visible');
  await fscSleep(180);
}

// ── SHOT DOTS ───────────────────────────────────────────────────────
function fscBuildShotDots() {
  const container = document.getElementById('fscShotDots');
  const label     = document.getElementById('fscShotLabel');
  if (!container) return;
  container.innerHTML = '';
  // Limit visible dots to 8 for aesthetic reasons; show count label otherwise
  const showDots = layoutConfig.shots <= 8;
  if (showDots) {
    for (let i = 0; i < layoutConfig.shots; i++) {
      const dot = document.createElement('div');
      dot.className = 'fsc-dot';
      dot.id        = `fsc-dot-${i}`;
      container.appendChild(dot);
    }
    container.style.display = 'flex';
  } else {
    container.style.display = 'none';
  }
  if (label) label.textContent = `${layoutConfig.name} · ${layoutConfig.shots} shots`;
}

function fscUpdateDots(index, captured) {
  for (let i = 0; i < layoutConfig.shots; i++) {
    const dot = document.getElementById(`fsc-dot-${i}`);
    if (!dot) continue;
    dot.classList.remove('captured', 'current');
    if (i < index || (i === index && captured))   dot.classList.add('captured');
    else if (i === index && !captured)             dot.classList.add('current');
  }
}

// ── THUMBNAIL STRIP ─────────────────────────────────────────────────
function fscBuildThumbs() {
  const strip = document.getElementById('fscThumbStrip');
  if (!strip) return;
  strip.innerHTML = '';
  const max = Math.min(layoutConfig.shots, 4);   // show up to 4 in overlay
  for (let i = 0; i < max; i++) {
    const thumb = document.createElement('div');
    thumb.className = 'fsc-thumb';
    thumb.id        = `fsc-thumb-${i}`;

    const num = document.createElement('div');
    num.className   = 'fsc-thumb-num';
    num.textContent = i + 1;
    thumb.appendChild(num);

    const img = document.createElement('img');
    img.id  = `fsc-thumb-img-${i}`;
    img.alt = `Shot ${i + 1}`;
    thumb.appendChild(img);
    strip.appendChild(thumb);
  }
  if (layoutConfig.shots > 4) {
    const more = document.createElement('div');
    more.style.cssText = 'font-size:.65rem;font-weight:800;color:rgba(255,255,255,.4);text-align:center;';
    more.textContent = `+${layoutConfig.shots - 4}`;
    strip.appendChild(more);
  }
}

function fscUpdateThumb(index, dataUrl) {
  const thumb = document.getElementById(`fsc-thumb-${index}`);
  const img   = document.getElementById(`fsc-thumb-img-${index}`);
  if (thumb) thumb.classList.add('fsc-captured');
  if (img)   img.src = dataUrl;
}

// ── UTILITY ─────────────────────────────────────────────────────────
function fscSleep(ms) { return new Promise(r => setTimeout(r, ms)); }

window.addEventListener('beforeunload', () => {
  stream?.getTracks().forEach(t => t.stop());
  fscStream?.getTracks().forEach(t => t.stop());
});

// Expose to inline HTML handlers
window.switchMode          = switchMode;
window.triggerBulkUpload   = triggerBulkUpload;
window.handleBulkUpload    = handleBulkUpload;
window.continueFromUpload  = continueFromUpload;
window.removeUploadedPhoto = removeUploadedPhoto;
window.handleSingleUpload  = handleSingleUpload;
window.buildStrip          = buildStrip;
window.retakeFromRearrange = retakeFromRearrange;
window.togglePause         = togglePause;
window.pauseSession        = pauseSession;
window.resumeSession       = resumeSession;

// ═══════════════════════════════════════════════════════════════════
//  CAPTURE MODE: AUTO / MANUAL
// ═══════════════════════════════════════════════════════════════════

function fscSetMode(mode) {
  fscCaptureMode = mode;
  fscApplyModeUI();
}

function fscApplyModeUI() {
  const autoBtn   = document.getElementById('fscModeAuto');
  const manualBtn = document.getElementById('fscModeManual');
  const indicator = document.getElementById('fscModeIndicator');
  if (autoBtn)   autoBtn.classList.toggle('fsc-mode-active',   fscCaptureMode === 'auto');
  if (manualBtn) manualBtn.classList.toggle('fsc-mode-active', fscCaptureMode === 'manual');
  if (indicator) {
    indicator.textContent = fscCaptureMode === 'auto'
      ? 'Auto Mode — tap once to capture all'
      : 'Manual Mode — tap for each shot';
  }
}

function fscUpdateProgressIndicator(current, total) {
  const el = document.getElementById('fscProgressLabel');
  if (!el) return;
  if (current === 0) { el.textContent = ''; return; }
  el.textContent = `Shot ${current} / ${total}`;
}

window.fscSetMode = fscSetMode;

// ═══════════════════════════════════════════════════════════════════
//  MOBILE CUSTOMIZE BOTTOM SHEET
// ═══════════════════════════════════════════════════════════════════

function openMobileCustomize() {
  const sheet = document.getElementById('mobileCustomizeSheet');
  if (!sheet) return;

  // Sync current values from sessionStorage / sidebar inputs
  const savedColor = sessionStorage.getItem('photobooth_strip_color') || '#ffffff';
  const savedText  = sessionStorage.getItem('photobooth_custom_text')  || '';
  const today      = new Date().toISOString().slice(0, 10);
  const savedDate  = sessionStorage.getItem('photobooth_custom_date')  || today;

  // Sync color swatches
  document.querySelectorAll('#msColorGrid .ms-swatch').forEach(sw => {
    const isSelected = sw.dataset.color === savedColor;
    sw.classList.toggle('selected', isSelected);
    if (isSelected) {
      const nameEl = document.getElementById('msColorName');
      if (nameEl) nameEl.textContent = sw.dataset.name;
    }
  });

  // Sync text
  const msText = document.getElementById('msTextInput');
  if (msText) msText.value = savedText;

  // Sync date
  const msDate = document.getElementById('msDateInput');
  if (msDate) msDate.value = savedDate;

  sheet.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeMobileCustomize(e) {
  // If called from backdrop click, only close if clicking the backdrop itself
  if (e && e.target !== document.getElementById('mobileCustomizeSheet')) return;
  const sheet = document.getElementById('mobileCustomizeSheet');
  if (!sheet) return;
  sheet.classList.remove('open');
  document.body.style.overflow = '';
}

function setMsText(val) {
  const inp = document.getElementById('msTextInput');
  const sidebar = document.getElementById('sidebarTextInput');
  if (inp) inp.value = val;
  if (sidebar) { sidebar.value = val; sidebar.dispatchEvent(new Event('input')); }
  sessionStorage.setItem('photobooth_custom_text', val);
  updateLivePreview();
}

// Wire up sheet swatches and inputs after DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // ── Sheet color swatches ──
  document.querySelectorAll('#msColorGrid .ms-swatch').forEach(sw => {
    // FIX: Replace sidebarSwatch.click() chain with a direct state update.
    // On mobile the programmatic .click() on a hidden sidebar element can
    // silently fail or lose its event (e.g. when the sidebar is display:none),
    // causing strip color changes from the mobile sheet to have no effect.
    // We now update sessionStorage + both swatch grids + preview directly.
    const applySheetColor = () => {
      const color = sw.dataset.color;
      const name  = sw.dataset.name;

      // Update mobile-sheet swatch selection
      document.querySelectorAll('#msColorGrid .ms-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      const nameEl = document.getElementById('msColorName');
      if (nameEl) nameEl.textContent = name;

      // Mirror selection state to sidebar swatch grid (visual only — no .click())
      document.querySelectorAll('.sidebar-swatch').forEach(s => s.classList.remove('selected'));
      const sidebarSwatch = document.querySelector(`.sidebar-swatch[data-color="${color}"]`);
      if (sidebarSwatch) sidebarSwatch.classList.add('selected');
      const sidebarNameEl = document.getElementById('sidebarColorName');
      if (sidebarNameEl) sidebarNameEl.textContent = name;

      // Persist and re-render — this is the authoritative update path
      sessionStorage.setItem('photobooth_strip_color', color);
      updateLivePreview();
    };

    sw.addEventListener('click', applySheetColor);
    // Also handle touchend so the color applies immediately on touch without
    // waiting for the synthesized click (relevant in scrollable sheets on iOS).
    sw.addEventListener('touchend', e => {
      e.preventDefault(); // suppress the follow-up click to avoid double-fire
      applySheetColor();
    }, { passive: false });
  });

  // ── Sheet text input ──
  const msText = document.getElementById('msTextInput');
  if (msText) {
    msText.addEventListener('input', () => {
      const sidebar = document.getElementById('sidebarTextInput');
      if (sidebar) { sidebar.value = msText.value; sidebar.dispatchEvent(new Event('input')); }
      else {
        sessionStorage.setItem('photobooth_custom_text', msText.value);
        updateLivePreview();
      }
    });
  }

  // ── Sheet date input ──
  const msDate = document.getElementById('msDateInput');
  if (msDate) {
    msDate.addEventListener('input', () => {
      const sidebar = document.getElementById('sidebarDateInput');
      if (sidebar) { sidebar.value = msDate.value; sidebar.dispatchEvent(new Event('input')); }
      else {
        sessionStorage.setItem('photobooth_custom_date', msDate.value);
        updateLivePreview();
      }
    });
  }
});

window.openMobileCustomize  = openMobileCustomize;
window.closeMobileCustomize = closeMobileCustomize;
window.setMsText            = setMsText;

// ── Mobile strip preview modal ──────────────────────────────────
function openMobilePreview() {
  const modal = document.getElementById('mobilePreviewModal');
  if (!modal) return;

  // Copy current live strip canvas into the modal canvas
  const src = document.getElementById('liveStripCanvas');
  const dst = document.getElementById('mobilePreviewCanvas');
  const placeholder = document.getElementById('mobilePreviewPlaceholder');

  if (src && dst && src.width > 0) {
    dst.width  = src.width;
    dst.height = src.height;
    dst.getContext('2d').drawImage(src, 0, 0);
    dst.style.display = 'block';
    if (placeholder) placeholder.style.display = 'none';
  } else {
    if (dst) dst.style.display = 'none';
    if (placeholder) placeholder.style.display = '';
  }

  modal.style.display = 'flex';
  document.body.style.overflow = 'hidden';
}

function closeMobilePreview(e) {
  if (e && e.target !== document.getElementById('mobilePreviewModal')) return;
  const modal = document.getElementById('mobilePreviewModal');
  if (modal) modal.style.display = 'none';
  document.body.style.overflow = '';
}

window.openMobilePreview  = openMobilePreview;
window.closeMobilePreview = closeMobilePreview;
