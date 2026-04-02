// ─── LIFE4CUTS CAMERA CONTROLLER ─────────────────────────────────
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
let currentMode     = 'camera'; // 'camera' | 'upload'
let uploadedPhotos  = [];

// DOM refs
let videoEl, snapshotCanvas, countdownOverlay, countdownNumber, countdownLabel,
    flashOverlay, shotBarFill, shotLabelCurrent, shotLabelTotal, statusMsg,
    startBtn, cameraArea, readyState, permissionError, thumbnailsGrid,
    layoutBadgeName, layoutBadgeSub, layoutBadgeIcon, mobileThumbs;

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  const layoutId = sessionStorage.getItem('photobooth_layout');
  if (!layoutId || !LAYOUTS_CAM[layoutId]) {
    window.location.href = 'index.html';
    return;
  }
  layoutConfig = LAYOUTS_CAM[layoutId];

  // Bind DOM
  videoEl          = document.getElementById('video');
  snapshotCanvas   = document.getElementById('snapshot');
  countdownOverlay = document.getElementById('countdownOverlay');
  countdownNumber  = document.getElementById('countdownNumber');
  countdownLabel   = document.getElementById('countdownLabel');
  flashOverlay     = document.getElementById('flashOverlay');
  shotBarFill      = document.getElementById('shotBarFill');
  shotLabelCurrent = document.getElementById('shotLabelCurrent');
  shotLabelTotal   = document.getElementById('shotLabelTotal');
  statusMsg        = document.getElementById('statusMsg');
  startBtn         = document.getElementById('startBtn');
  cameraArea       = document.getElementById('cameraArea');
  readyState       = document.getElementById('readyState');
  permissionError  = document.getElementById('permissionError');
  thumbnailsGrid   = document.getElementById('thumbnailsGrid');
  layoutBadgeName  = document.getElementById('layoutBadgeName');
  layoutBadgeSub   = document.getElementById('layoutBadgeSub');
  layoutBadgeIcon  = document.getElementById('layoutBadgeIcon');
  mobileThumbs     = document.getElementById('mobileThumbs');

  // Set layout badge
  if (layoutBadgeName) layoutBadgeName.textContent = layoutConfig.name;
  if (layoutBadgeSub)  layoutBadgeSub.textContent  = `${layoutConfig.shots} shots · ${layoutConfig.format}`;
  if (layoutBadgeIcon) {
    layoutBadgeIcon.textContent = layoutConfig.kr;
    layoutBadgeIcon.style.color = layoutConfig.accentColor;
    layoutBadgeIcon.style.borderColor = layoutConfig.accentColor + '55';
  }

  // Progress bar accent
  if (shotBarFill) shotBarFill.style.background = `linear-gradient(90deg, ${layoutConfig.accentColor}, ${shiftHue(layoutConfig.accentColor)})`;
  if (shotLabelCurrent) shotLabelCurrent.style.color = layoutConfig.accentColor;
  if (shotLabelTotal)   shotLabelTotal.textContent   = `of ${layoutConfig.shots}`;

  const readyDesc  = document.getElementById('readyDesc');
  if (readyDesc)   readyDesc.textContent = `${layoutConfig.shots} shots will be taken — get ready to strike your poses!`;
  const poseBadge  = document.getElementById('poseBadge');
  if (poseBadge)   poseBadge.textContent = `${layoutConfig.shots} shots · ${layoutConfig.kr}`;

  // Strip style sidebar
  const savedColor = sessionStorage.getItem('photobooth_strip_color') || '#ffffff';
  const savedText  = sessionStorage.getItem('photobooth_custom_text') || '';
  updateStripStyleSidebar(savedColor, savedText);

  buildThumbnailGrid();
  startBtn?.addEventListener('click', beginSession);

  // Build upload slots
  buildUploadSlots();

  await initCamera();
});

// ─── STRIP STYLE SIDEBAR ─────────────────────────────────────────
function updateStripStyleSidebar(color, text) {
  const dot = document.getElementById('sidebarColorDot');
  const name = document.getElementById('sidebarColorName');
  const textPrev = document.getElementById('sidebarTextPreview');

  const COLOR_NAMES = {
    '#ffffff':'White','#ffe0ec':'Blush','#f0e6ff':'Lavender','#d6f5f0':'Mint',
    '#ffecd9':'Peach','#d4ecff':'Sky','#fff3c2':'Lemon','#fce4f8':'Lilac',
  };

  if (dot) {
    dot.style.background = color;
    dot.style.borderColor = color === '#ffffff' ? '#ddd' : color;
  }
  if (name) name.textContent = COLOR_NAMES[color] || 'Custom';
  if (textPrev && text) textPrev.textContent = `"${text}"`;
  else if (textPrev)    textPrev.textContent = '';
}

// ─── MODE TOGGLE ─────────────────────────────────────────────────
function switchMode(mode) {
  currentMode = mode;
  const cameraView = document.getElementById('cameraModeView');
  const uploadView = document.getElementById('uploadModeView');
  const camBtn     = document.getElementById('modeCameraBtn');
  const upBtn      = document.getElementById('modeUploadBtn');

  if (mode === 'camera') {
    cameraView.style.display = '';
    uploadView.style.display = 'none';
    camBtn.classList.add('active');
    upBtn.classList.remove('active');
    initCamera();
  } else {
    cameraView.style.display = 'none';
    uploadView.style.display = '';
    camBtn.classList.remove('active');
    upBtn.classList.add('active');
    // Stop camera stream when switching to upload
    if (stream) { stream.getTracks().forEach(t => t.stop()); stream = null; }
  }
}

// ─── CAMERA INIT ─────────────────────────────────────────────────
async function initCamera() {
  if (currentMode !== 'camera') return;
  if (stream) return; // already running
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 960 }, facingMode: 'user' },
      audio: false,
    });
    if (videoEl) { videoEl.srcObject = stream; await videoEl.play(); }
    readyState?.classList.remove('hidden');
  } catch (err) {
    console.error('Camera error:', err);
    if (permissionError) permissionError.classList.add('visible');
  }
}

// ─── THUMBNAIL GRID ──────────────────────────────────────────────
function buildThumbnailGrid() {
  if (!thumbnailsGrid) return;

  let colClass = 'cols-1';
  if (layoutConfig.type === 'doublestrip') colClass = 'cols-4';
  else if (layoutConfig.type === 'grid2x2') colClass = 'cols-2';

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

  // Mobile thumbnails
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

// ─── UPLOAD MODE ─────────────────────────────────────────────────
function buildUploadSlots() {
  const grid = document.getElementById('uploadSlotsGrid');
  const uploadTitle    = document.getElementById('uploadTitle');
  const uploadSubtitle = document.getElementById('uploadSubtitle');
  if (!grid) return;

  if (uploadTitle)    uploadTitle.textContent = `Upload ${layoutConfig.shots} Photo${layoutConfig.shots > 1 ? 's' : ''}`;
  if (uploadSubtitle) uploadSubtitle.textContent = `Tap each slot to choose a photo (${layoutConfig.shots} needed)`;

  uploadedPhotos = new Array(layoutConfig.shots).fill(null);

  let cols = 1;
  if (layoutConfig.type === 'grid2x2') cols = 2;
  else if (layoutConfig.type === 'doublestrip') cols = 4;
  else if (layoutConfig.shots > 4) cols = 2;

  grid.style.gridTemplateColumns = `repeat(${Math.min(cols, 4)}, 1fr)`;
  grid.innerHTML = '';

  for (let i = 0; i < layoutConfig.shots; i++) {
    const slot = document.createElement('div');
    slot.className = 'upload-slot';
    slot.id = `upload-slot-${i}`;
    slot.dataset.index = i;
    slot.innerHTML = `
      <div class="upload-slot-placeholder" id="upload-placeholder-${i}">
        <span class="upload-slot-icon">+</span>
        <span class="upload-slot-num">Photo ${i + 1}</span>
      </div>
      <img class="upload-slot-img" id="upload-img-${i}" src="" alt="Photo ${i+1}" style="display:none;">
      <button class="upload-slot-remove" id="upload-remove-${i}" style="display:none;" onclick="removeUploadedPhoto(${i}, event)">✕</button>
      <input type="file" accept="image/*" style="display:none;" id="upload-file-${i}" onchange="handleSingleUpload(event, ${i})">
    `;
    slot.addEventListener('click', () => triggerSingleUpload(i));
    grid.appendChild(slot);
  }
}

function triggerSingleUpload(index) {
  document.getElementById(`upload-file-${index}`)?.click();
}

function triggerBulkUpload() {
  const input = document.getElementById('bulkFileInput');
  if (input) { input.multiple = true; input.click(); }
}

function handleSingleUpload(event, index) {
  const file = event.target.files?.[0];
  if (!file) return;
  readFileAsDataUrl(file).then(dataUrl => {
    setUploadedPhoto(index, dataUrl);
  });
}

function handleBulkUpload(event) {
  const files = Array.from(event.target.files || []);
  const limit = Math.min(files.length, layoutConfig.shots);
  const promises = files.slice(0, limit).map(f => readFileAsDataUrl(f));
  Promise.all(promises).then(dataUrls => {
    dataUrls.forEach((url, i) => setUploadedPhoto(i, url));
  });
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = e => resolve(e.target.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function setUploadedPhoto(index, dataUrl) {
  uploadedPhotos[index] = dataUrl;

  const slot        = document.getElementById(`upload-slot-${index}`);
  const placeholder = document.getElementById(`upload-placeholder-${index}`);
  const img         = document.getElementById(`upload-img-${index}`);
  const removeBtn   = document.getElementById(`upload-remove-${index}`);

  if (slot)        slot.classList.add('filled');
  if (placeholder) placeholder.style.display = 'none';
  if (img)         { img.src = dataUrl; img.style.display = 'block'; }
  if (removeBtn)   removeBtn.style.display = 'flex';

  // Also update sidebar thumbnails
  updateThumbnail(index, dataUrl);

  // Update progress
  const filled   = uploadedPhotos.filter(Boolean).length;
  const progWrap = document.getElementById('uploadProgressWrap');
  const progFill = document.getElementById('uploadProgressFill');
  const progLbl  = document.getElementById('uploadProgressLabel');
  const contBtn  = document.getElementById('uploadContinueBtn');

  if (progWrap) progWrap.style.display = '';
  if (progFill) progFill.style.width   = `${(filled / layoutConfig.shots) * 100}%`;
  if (progLbl)  progLbl.textContent    = `${filled} of ${layoutConfig.shots} photos selected`;

  const allFilled = filled >= layoutConfig.shots;
  if (contBtn) {
    contBtn.disabled     = !allFilled;
    contBtn.style.opacity = allFilled ? '1' : '.5';
  }
}

function removeUploadedPhoto(index, event) {
  event?.stopPropagation();
  uploadedPhotos[index] = null;

  const slot        = document.getElementById(`upload-slot-${index}`);
  const placeholder = document.getElementById(`upload-placeholder-${index}`);
  const img         = document.getElementById(`upload-img-${index}`);
  const removeBtn   = document.getElementById(`upload-remove-${index}`);
  const fileInput   = document.getElementById(`upload-file-${index}`);

  if (slot)        slot.classList.remove('filled');
  if (placeholder) placeholder.style.display = '';
  if (img)         { img.src = ''; img.style.display = 'none'; }
  if (removeBtn)   removeBtn.style.display = 'none';
  if (fileInput)   fileInput.value = '';

  // Update sidebar thumbnail
  const thumbSlot = document.getElementById(`thumb-${index}`);
  const thumbImg  = document.getElementById(`thumb-img-${index}`);
  if (thumbSlot) thumbSlot.classList.remove('captured');
  if (thumbImg)  { thumbImg.src = ''; thumbImg.style.opacity = '0'; }

  const filled  = uploadedPhotos.filter(Boolean).length;
  const progFill = document.getElementById('uploadProgressFill');
  const progLbl  = document.getElementById('uploadProgressLabel');
  const contBtn  = document.getElementById('uploadContinueBtn');

  if (progFill) progFill.style.width   = `${(filled / layoutConfig.shots) * 100}%`;
  if (progLbl)  progLbl.textContent    = `${filled} of ${layoutConfig.shots} photos selected`;
  if (contBtn) {
    contBtn.disabled     = filled < layoutConfig.shots;
    contBtn.style.opacity = filled >= layoutConfig.shots ? '1' : '.5';
  }
}

function continueFromUpload() {
  if (uploadedPhotos.filter(Boolean).length < layoutConfig.shots) return;
  sessionStorage.setItem('photobooth_photos', JSON.stringify(uploadedPhotos));
  window.location.href = 'result.html';
}

// ─── CAMERA SESSION ──────────────────────────────────────────────
async function beginSession() {
  if (isCapturing) return;
  isCapturing = true;
  capturedPhotos = new Array(layoutConfig.shots).fill(null);

  readyState?.classList.add('hidden');
  if (videoEl)    videoEl.style.display = 'block';
  if (snapshotCanvas) snapshotCanvas.style.display = 'none';
  if (startBtn) { startBtn.disabled = true; startBtn.style.opacity = '.5'; }

  updateProgress(0);
  await captureSequence();
}

async function captureSequence() {
  for (let i = 0; i < layoutConfig.shots; i++) {
    updateStatus(`Photo ${i + 1} of ${layoutConfig.shots}`, true);
    updateProgress(i);
    if (shotLabelCurrent) shotLabelCurrent.textContent = `Photo ${i + 1}`;

    await runCountdown(3, `Shot ${i + 1} of ${layoutConfig.shots}`);

    const dataUrl = captureFrame();
    capturedPhotos[i] = dataUrl;
    updateThumbnail(i, dataUrl);
    triggerFlash();

    if (i < layoutConfig.shots - 1) {
      updateStatus('Nice! Get ready for the next one…', false);
      await sleep(850);
    }
  }

  updateProgress(layoutConfig.shots);
  updateStatus('All done! Building your strip…', true);
  sessionStorage.setItem('photobooth_photos', JSON.stringify(capturedPhotos));
  await sleep(650);
  window.location.href = 'result.html';
}

function runCountdown(from, label) {
  return new Promise(resolve => {
    let count = from;
    function tick() {
      if (count <= 0) { countdownOverlay.classList.remove('visible'); resolve(); return; }
      countdownNumber.textContent = count;
      if (countdownLabel) countdownLabel.textContent = label || '';
      countdownOverlay.classList.add('visible');
      countdownNumber.style.animation = 'none';
      countdownNumber.offsetHeight;
      countdownNumber.style.animation = '';
      count--;
      setTimeout(tick, 1000);
    }
    tick();
  });
}

function captureFrame() {
  if (!videoEl || !snapshotCanvas) return null;
  const w = videoEl.videoWidth || 1280;
  const h = videoEl.videoHeight || 960;
  snapshotCanvas.width = w;
  snapshotCanvas.height = h;
  const ctx = snapshotCanvas.getContext('2d');
  ctx.translate(w, 0); ctx.scale(-1, 1);
  ctx.drawImage(videoEl, 0, 0, w, h);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  return snapshotCanvas.toDataURL('image/jpeg', 0.92);
}

function triggerFlash() {
  if (!flashOverlay) return;
  flashOverlay.style.transition = 'opacity 0.05s';
  flashOverlay.style.opacity = '1';
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
}

function updateProgress(done) {
  const pct = (done / layoutConfig.shots) * 100;
  if (shotBarFill) shotBarFill.style.width = `${pct}%`;
}

function updateStatus(msg, active) {
  if (!statusMsg) return;
  statusMsg.textContent = msg;
  statusMsg.className = `status-msg${active ? ' active' : ''}`;
}

// ─── UTILS ───────────────────────────────────────────────────────
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function shiftHue(hex) {
  const map = { '#ff6b9d':'#c026d3','#a855f7':'#7c3aed','#2dd4bf':'#0891b2','#fbbf24':'#f97316' };
  return map[hex] || '#a855f7';
}

window.addEventListener('beforeunload', () => { stream?.getTracks().forEach(t => t.stop()); });
window.retakePhotos = () => { sessionStorage.removeItem('photobooth_photos'); window.location.reload(); };
