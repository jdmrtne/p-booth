// ─── LIFE4CUTS LAYOUT DEFINITIONS ────────────────────────────────
const LAYOUTS = {
  CUT4: {
    id:'CUT4', name:'Classic 4-Cut', kr:'인생4컷', shots:4,
    format:'4 × 1 strip', cols:1, rows:4, type:'strip', tagColor:'pink',
  },
  CUT2: {
    id:'CUT2', name:'2-Cut Wide', kr:'인생2컷', shots:2,
    format:'2 × 1 strip', cols:1, rows:2, type:'strip', tagColor:'purple',
  },
  WIDE4: {
    id:'WIDE4', name:'Wide 4-Cut', kr:'4컷 와이드', shots:4,
    format:'2×2 grid', cols:2, rows:2, type:'grid2x2', tagColor:'mint',
  },
  CUT8: {
    id:'CUT8', name:'Double Strip', kr:'인생8컷', shots:8,
    format:'2 strips × 4', cols:2, rows:4, type:'doublestrip', tagColor:'yellow',
  },
};

const TAG_COLORS = {
  pink:  { text:'#ff6b9d', bg:'rgba(255,107,157,.1)',  border:'rgba(255,107,157,.3)' },
  purple:{ text:'#a855f7', bg:'rgba(168,85,247,.1)',   border:'rgba(168,85,247,.25)' },
  mint:  { text:'#2dd4bf', bg:'rgba(45,212,191,.1)',   border:'rgba(45,212,191,.25)' },
  yellow:{ text:'#b45309', bg:'rgba(251,191,36,.12)',  border:'rgba(251,191,36,.3)' },
};

// ─── STATE ────────────────────────────────────────────────────────
let selectedLayoutId  = null;
let selectedColor     = '#ffffff';
let selectedColorName = 'White';

// ─── REALISTIC SVG PREVIEWS ──────────────────────────────────────
// Mirror actual canvas output: tight spacing, NO rounded corners

function isDarkColor(hex) {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  return (0.2126*r + 0.7152*g + 0.0722*b) < 0.40;
}

function buildStripSVG(rows, bg) {
  // Matches canvas: STRIP_W=500, PAD_X=12, PAD_TOP=12, GAP=8, FOOTER_H=76
  const W     = 90;
  const sc    = W / 500;
  const padX  = Math.round(12 * sc);
  const padT  = Math.round(12 * sc);
  const gap   = Math.max(1, Math.round(8 * sc));
  const footH = Math.round(76 * sc);
  const phW   = W - padX * 2;
  const phH   = Math.round(phW * 0.75);
  const totalH = padT + rows * phH + (rows-1)*gap + footH;
  const dark   = isDarkColor(bg);
  const slotFill = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  const textFill = dark ? '#ffffff' : '#111111';
  const dateFill = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';

  let slots = '';
  for (let i = 0; i < rows; i++) {
    const y = padT + i * (phH + gap);
    slots += `<rect x="${padX}" y="${y}" width="${phW}" height="${phH}" rx="0" fill="${slotFill}"/>`;
  }

  const fy = padT + rows * phH + (rows-1) * gap;
  return `<svg viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${totalH}" fill="${bg || '#fff'}"/>
    ${slots}
    <text x="${W/2}" y="${fy + footH*0.46}" text-anchor="middle" font-size="5.5" font-weight="900" font-family="sans-serif" fill="${textFill}">인생네컷</text>
    <text x="${W/2}" y="${fy + footH*0.76}" text-anchor="middle" font-size="3.8" font-family="sans-serif" fill="${dateFill}">2026.04.03</text>
  </svg>`;
}

function buildGrid2x2SVG(bg) {
  const W     = 160;
  const sc    = W / 580;
  const padX  = Math.round(12 * sc);
  const padT  = Math.round(12 * sc);
  const gap   = Math.max(1, Math.round(8 * sc));
  const footH = Math.round(76 * sc);
  const phW   = (W - padX*2 - gap) / 2;
  const phH   = Math.round(phW * 0.75);
  const totalH = padT + 2*phH + gap + footH;
  const dark   = isDarkColor(bg);
  const slotFill = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  const textFill = dark ? '#ffffff' : '#111111';
  const dateFill = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';

  let slots = '';
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x = padX + c * (phW + gap);
      const y = padT + r * (phH + gap);
      slots += `<rect x="${x.toFixed(1)}" y="${y}" width="${phW.toFixed(1)}" height="${phH}" rx="0" fill="${slotFill}"/>`;
    }
  }

  const fy = padT + 2*phH + gap;
  return `<svg viewBox="0 0 ${W} ${totalH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${totalH}" fill="${bg || '#fff'}"/>
    ${slots}
    <text x="${W/2}" y="${fy + footH*0.46}" text-anchor="middle" font-size="6.5" font-weight="900" font-family="sans-serif" fill="${textFill}">인생네컷</text>
    <text x="${W/2}" y="${fy + footH*0.76}" text-anchor="middle" font-size="4.5" font-family="sans-serif" fill="${dateFill}">2026.04.03</text>
  </svg>`;
}

function buildDoubleStripSVG(bg) {
  const TOTAL_W = 180;
  const sc      = TOTAL_W / 668;  // 330*2+8
  const stripW  = Math.round(330 * sc);
  const stripGap= Math.max(1, Math.round(8 * sc));
  const padX    = Math.round(10 * sc);
  const padT    = Math.round(12 * sc);
  const gap     = Math.max(1, Math.round(8 * sc));
  const footH   = Math.round(76 * sc);
  const phW     = stripW - padX*2;
  const phH     = Math.round(phW * 0.75);
  const totalH  = padT + 4*phH + 3*gap + footH;
  const ROWS    = 4;
  const dark    = isDarkColor(bg);
  const slotFill = dark ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.10)';
  const textFill = dark ? '#ffffff' : '#111111';
  const dateFill = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';

  let slots = '';
  for (let s = 0; s < 2; s++) {
    const ox = s * (stripW + stripGap);
    for (let i = 0; i < ROWS; i++) {
      const x = ox + padX;
      const y = padT + i*(phH+gap);
      slots += `<rect x="${x}" y="${y}" width="${phW}" height="${phH}" rx="0" fill="${slotFill}"/>`;
    }
  }

  const fy = padT + ROWS*phH + (ROWS-1)*gap;
  return `<svg viewBox="0 0 ${TOTAL_W} ${totalH}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${TOTAL_W}" height="${totalH}" fill="${bg || '#fff'}"/>
    ${slots}
    <text x="${TOTAL_W/2}" y="${fy + footH*0.46}" text-anchor="middle" font-size="6.5" font-weight="900" font-family="sans-serif" fill="${textFill}">인생네컷</text>
    <text x="${TOTAL_W/2}" y="${fy + footH*0.76}" text-anchor="middle" font-size="4.5" font-family="sans-serif" fill="${dateFill}">2026.04.03</text>
  </svg>`;
}

function generatePreviewSVG(layout, bg) {
  switch (layout.type) {
    case 'strip':        return buildStripSVG(layout.rows, bg);
    case 'grid2x2':      return buildGrid2x2SVG(bg);
    case 'doublestrip':  return buildDoubleStripSVG(bg);
    default:             return buildStripSVG(4, bg);
  }
}

// ─── REFRESH ALL CARD PREVIEWS ───────────────────────────────────
function refreshAllPreviews() {
  Object.values(LAYOUTS).forEach(layout => {
    const previewEl = document.querySelector(`[data-layout-id="${layout.id}"] .layout-preview`);
    if (previewEl) {
      previewEl.innerHTML = generatePreviewSVG(layout, selectedColor);
    }
  });
}

// ─── RENDER LAYOUT CARDS ──────────────────────────────────────────
function renderLayoutCards() {
  const grid = document.getElementById('layoutGrid');
  if (!grid) return;

  Object.values(LAYOUTS).forEach((layout, idx) => {
    const tc   = TAG_COLORS[layout.tagColor] || TAG_COLORS.pink;
    const card = document.createElement('div');
    card.className       = 'layout-card fade-in';
    card.style.cssText   = `animation-delay:${idx * 0.08}s;`;
    card.dataset.layoutId = layout.id;

    card.innerHTML = `
      <div class="badge-selected">✓ Selected</div>
      <div class="layout-preview">${generatePreviewSVG(layout, selectedColor)}</div>
      <div class="layout-info">
        <div class="layout-name">
          ${layout.name}
          <span class="kr">${layout.kr}</span>
        </div>
        <div class="layout-meta">
          <span class="meta-tag" style="color:${tc.text};background:${tc.bg};border:1.5px solid ${tc.border};">${layout.format}</span>
          <span class="meta-tag" style="color:${tc.text};background:${tc.bg};border:1.5px solid ${tc.border};">${layout.shots} shot${layout.shots>1?'s':''}</span>
        </div>
        <button class="btn btn-primary" id="select-btn-${layout.id}" onclick="selectLayout('${layout.id}', event)">
          <span>✦</span> Select Layout
        </button>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ─── SELECT LAYOUT ────────────────────────────────────────────────
function selectLayout(id, event) {
  event?.stopPropagation();
  if (!LAYOUTS[id]) return;

  selectedLayoutId = id;
  const layout = LAYOUTS[id];

  document.querySelectorAll('.layout-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`[data-layout-id="${id}"]`);
  if (card) card.classList.add('selected');

  sessionStorage.setItem('photobooth_layout', id);
  sessionStorage.removeItem('photobooth_photos');

  const panel = document.getElementById('customizePanel');
  if (panel) {
    panel.classList.remove('hidden');
    panel.classList.add('panel-enter');
    setTimeout(() => panel.classList.remove('panel-enter'), 400);

    const badge = document.getElementById('selectedLayoutBadge');
    if (badge) badge.innerHTML = `<span class="badge-layout-dot" style="background:${TAG_COLORS[layout.tagColor]?.text||'#ff6b9d'}"></span>${layout.name}`;

    if (window.innerWidth < 768) {
      setTimeout(() => panel.scrollIntoView({ behavior:'smooth', block:'start' }), 100);
    }
  }

  updatePreview();
}

// ─── COLOR SELECTION ─────────────────────────────────────────────
function initColorSwatches() {
  document.querySelectorAll('.color-swatch').forEach(sw => {
    sw.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor     = sw.dataset.color;
      selectedColorName = sw.dataset.name;
      document.getElementById('colorNameLabel').textContent = selectedColorName;
      sessionStorage.setItem('photobooth_strip_color', selectedColor);
      updatePreview();
      refreshAllPreviews();   // ← update all layout cards live
    });
  });
}

// ─── LIVE MINI PREVIEW ───────────────────────────────────────────
function updatePreview() {
  const layout      = LAYOUTS[selectedLayoutId];
  const previewStrip = document.getElementById('previewStrip');
  const barTop      = document.getElementById('previewBarTop');
  const barBottom   = document.getElementById('previewBarBottom');
  const previewPhotos = document.getElementById('previewPhotos');
  const previewText = document.getElementById('previewText');
  const customText  = document.getElementById('customTextInput')?.value;
  const customDate  = document.getElementById('customDateInput')?.value;

  if (!previewStrip) return;

  previewStrip.style.background = selectedColor;

  if (layout) {
    const accent = TAG_COLORS[layout.tagColor]?.text || '#ff6b9d';
    if (barTop)    barTop.style.background    = 'transparent';
    if (barBottom) barBottom.style.background = 'transparent';

    if (previewPhotos) {
      const count = Math.min(layout.rows * layout.cols, 4);
      previewPhotos.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const slot = document.createElement('div');
        slot.className = 'preview-photo-slot';
        previewPhotos.appendChild(slot);
      }
      previewPhotos.style.gridTemplateColumns =
        (layout.type === 'grid2x2' || layout.type === 'doublestrip') ? 'repeat(2,1fr)' : '1fr';
    }
  }

  if (previewText) {
    const dateStr = customDate
      ? formatDisplayDate(customDate)
      : getTodayStr();
    previewText.textContent = (customText || '인생네컷') + ' · ' + dateStr;
  }
}

// ─── CUSTOM TEXT ─────────────────────────────────────────────────
function initCustomText() {
  const input   = document.getElementById('customTextInput');
  const counter = document.getElementById('charCounter');
  if (!input) return;
  input.addEventListener('input', () => {
    if (counter) counter.textContent = `${input.value.length}/40`;
    sessionStorage.setItem('photobooth_custom_text', input.value);
    updatePreview();
  });
}

function setCustomText(text) {
  const input   = document.getElementById('customTextInput');
  const counter = document.getElementById('charCounter');
  if (!input) return;
  input.value = text;
  if (counter) counter.textContent = `${text.length}/40`;
  sessionStorage.setItem('photobooth_custom_text', text);
  updatePreview();
}

// ─── DATE INPUT ──────────────────────────────────────────────────
function initDateInput() {
  const input = document.getElementById('customDateInput');
  if (!input) return;

  // Default to today
  const today = new Date().toISOString().slice(0, 10);
  const saved = sessionStorage.getItem('photobooth_custom_date') || today;
  input.value = saved;
  sessionStorage.setItem('photobooth_custom_date', saved);

  input.addEventListener('change', () => {
    sessionStorage.setItem('photobooth_custom_date', input.value);
    updatePreview();
  });
}

function formatDisplayDate(isoStr) {
  // isoStr = "2026-04-03" → "2026.04.03"
  return isoStr.replace(/-/g, '.');
}

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')}`;
}

// ─── CONTINUE ────────────────────────────────────────────────────
function continueToCamera() {
  if (!selectedLayoutId) return;
  sessionStorage.setItem('photobooth_strip_color', selectedColor);
  sessionStorage.setItem('photobooth_custom_text', document.getElementById('customTextInput')?.value || '');
  sessionStorage.setItem('photobooth_custom_date', document.getElementById('customDateInput')?.value || new Date().toISOString().slice(0,10));
  window.location.href = 'camera.html';
}

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  // Restore saved color before rendering cards so they start with right color
  const savedColor = sessionStorage.getItem('photobooth_strip_color');
  if (savedColor) {
    selectedColor = savedColor;
    document.querySelectorAll('.color-swatch').forEach(sw => {
      if (sw.dataset.color === savedColor) {
        sw.classList.add('selected');
        selectedColorName = sw.dataset.name;
        const lbl = document.getElementById('colorNameLabel');
        if (lbl) lbl.textContent = selectedColorName;
      } else {
        sw.classList.remove('selected');
      }
    });
  }

  renderLayoutCards();
  initColorSwatches();
  initCustomText();
  initDateInput();

  const savedText   = sessionStorage.getItem('photobooth_custom_text');
  const savedLayout = sessionStorage.getItem('photobooth_layout');

  if (savedText) {
    const input = document.getElementById('customTextInput');
    if (input) {
      input.value = savedText;
      const counter = document.getElementById('charCounter');
      if (counter) counter.textContent = `${savedText.length}/40`;
    }
  }
  if (savedLayout) selectLayout(savedLayout);

  document.addEventListener('click', e => {
    const card = e.target.closest('.layout-card');
    if (card && !e.target.closest('.btn')) selectLayout(card.dataset.layoutId, e);
  });
});
