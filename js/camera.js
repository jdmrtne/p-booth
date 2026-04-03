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
  const shouldShow = currentMode === 'camera' && isMobileDevice() && isPortraitMode();
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
    pauseBtn.innerHTML = '▶ Resume';
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
    pauseBtn.innerHTML = '⏸ Pause';
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
    pauseBtn.innerHTML = '⏸ Pause';
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
    // Hide landscape prompt when switching to upload mode
    const overlay = document.getElementById('landscapeOverlay');
    if (overlay) overlay.classList.remove('visible');
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
      <div class="drag-handle">⠿</div>
      <div class="upload-slot-placeholder" id="upload-placeholder-${i}">
        <span class="upload-slot-icon">+</span>
        <span class="upload-slot-num">Photo ${i+1}</span>
      </div>
      <img class="upload-slot-img" id="upload-img-${i}" src="" alt="Photo ${i+1}" style="display:none;">
      <button class="upload-slot-remove" id="upload-remove-${i}" style="display:none;" onclick="removeUploadedPhoto(${i},event)">✕</button>
      <input type="file" accept="image/*" style="display:none;" id="upload-file-${i}" onchange="handleSingleUpload(event,${i})">
    `;
    slot.addEventListener('click', e => {
      if (!e.target.closest('.upload-slot-remove') && !isDragging) triggerSingleUpload(i);
    });
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
    pauseBtn.innerHTML = '⏸ Pause';
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

  if (capturedLabel)    capturedLabel.textContent    = `Shot ${shotNum} captured! ✓`;
  if (capturedSublabel) capturedSublabel.textContent = isLast ? 'All shots done! 🎉' : 'Get ready for the next one…';

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
  });
}

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

  const rearrangeV = document.getElementById('rearrangeView');
  const modeWrap   = document.getElementById('modeToggleWrap');
  const cameraView = document.getElementById('cameraModeView');
  const uploadView  = document.getElementById('uploadModeView');
  if (rearrangeV) rearrangeV.style.display = 'none';
  if (modeWrap)   modeWrap.style.display   = '';
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

window.addEventListener('beforeunload', () => { stream?.getTracks().forEach(t => t.stop()); });

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
