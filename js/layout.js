// ─── LIFE4CUTS LAYOUT DEFINITIONS ────────────────────────────────
const LAYOUTS = {
  CUT4: {
    id: 'CUT4', name: 'Classic 4-Cut', kr: '인생4컷', shots: 4,
    label: 'Vertical Strip', format: '4 × 1 strip',
    desc: 'The signature Life4Cuts format — 4 portraits on a narrow strip, printed twice',
    cols: 1, rows: 4, type: 'strip', accentColor: '#ff6b9d', tagColor: 'pink',
  },
  CUT2: {
    id: 'CUT2', name: '2-Cut Wide', kr: '인생2컷', shots: 2,
    label: 'Vertical Strip', format: '2 × 1 strip',
    desc: 'Two large portrait photos on a wide strip — perfect for couples',
    cols: 1, rows: 2, type: 'strip', accentColor: '#a855f7', tagColor: 'purple',
  },
  WIDE4: {
    id: 'WIDE4', name: 'Wide 4-Cut', kr: '4컷 와이드', shots: 4,
    label: '2×2 Grid', format: '2×2 grid',
    desc: 'Four photos arranged in a square grid — great for groups',
    cols: 2, rows: 2, type: 'grid2x2', accentColor: '#2dd4bf', tagColor: 'mint',
  },
  CUT8: {
    id: 'CUT8', name: 'Double Strip', kr: '인생8컷', shots: 8,
    label: 'Double Strip', format: '2 strips × 4',
    desc: 'Eight photos across two side-by-side strips — share one with a friend!',
    cols: 2, rows: 4, type: 'doublestrip', accentColor: '#fbbf24', tagColor: 'yellow',
  },
};

// ─── STATE ────────────────────────────────────────────────────────
let selectedLayoutId = null;
let selectedColor    = '#ffffff';
let selectedColorName = 'White';

// ─── SVG PREVIEW GENERATORS ───────────────────────────────────────
function buildStripSVG(rows, accentColor) {
  const W = 72, H = 190, bg = '#ffffff', photoBg = '#ffe0ec';
  const margin = 8, gap = 5;
  const photoW = W - margin * 2;
  const photoH = (H - margin * 2 - gap * (rows - 1) - 28) / rows;

  let photos = '';
  for (let i = 0; i < rows; i++) {
    const y = margin + i * (photoH + gap);
    photos += `<rect x="${margin}" y="${y}" width="${photoW}" height="${photoH}" rx="3" fill="${photoBg}" stroke="${accentColor}" stroke-width="1.2" opacity="0.9"/>`;
    const cx = margin + photoW / 2;
    const by = y + photoH;
    const hr = photoH * 0.18;
    const th = photoH * 0.22;
    photos += `<ellipse cx="${cx}" cy="${by - th - hr}" rx="${hr}" ry="${hr * 1.05}" fill="${accentColor}" opacity="0.25"/>`;
    photos += `<rect x="${cx - hr * 0.85}" y="${by - th}" width="${hr * 1.7}" height="${th}" rx="2" fill="${accentColor}" opacity="0.18"/>`;
  }
  const fy = H - 22;
  let dots = '';
  for (let d = 0; d < 3; d++) {
    dots += `<circle cx="${W / 2 - 6 + d * 6}" cy="${fy + 10}" r="1.5" fill="${accentColor}" opacity="0.5"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" rx="5" fill="${bg}" stroke="${accentColor}" stroke-width="1.5" opacity="0.9"/>
    <rect width="${W}" height="5" rx="2" fill="${accentColor}" opacity="0.7"/>
    ${photos}
    <rect x="0" y="${H - 26}" width="${W}" height="26" rx="0" fill="${accentColor}" opacity="0.08"/>
    ${dots}
    <rect x="0" y="${H - 5}" width="${W}" height="5" rx="2" fill="${accentColor}" opacity="0.5"/>
  </svg>`;
}

function buildGrid2x2SVG(accentColor) {
  const W = 150, H = 120, bg = '#ffffff', photoBg = '#ffe0ec';
  const margin = 8, gap = 6;
  const photoW = (W - margin * 2 - gap) / 2;
  const photoH = (H - margin * 2 - gap - 18) / 2;

  let photos = '';
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x = margin + c * (photoW + gap);
      const y = margin + r * (photoH + gap);
      photos += `<rect x="${x}" y="${y}" width="${photoW}" height="${photoH}" rx="3" fill="${photoBg}" stroke="${accentColor}" stroke-width="1.2" opacity="0.9"/>`;
    }
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">
    <rect width="${W}" height="${H}" rx="5" fill="${bg}" stroke="${accentColor}" stroke-width="1.5" opacity="0.9"/>
    <rect width="${W}" height="4" rx="2" fill="${accentColor}" opacity="0.7"/>
    ${photos}
    <rect x="0" y="${H - 4}" width="${W}" height="4" rx="2" fill="${accentColor}" opacity="0.5"/>
  </svg>`;
}

function buildDoubleStripSVG(accentColor) {
  const SW = 60, H = 190, gap = 8, W = SW * 2 + gap, rows = 4;
  const bg = '#ffffff', photoBg = '#ffe0ec';
  const margin = 6, photoGap = 4;
  const photoW = SW - margin * 2;
  const photoH = (H - margin * 2 - photoGap * (rows - 1) - 22) / rows;

  let photos = '';
  for (let s = 0; s < 2; s++) {
    const ox = s * (SW + gap);
    photos += `<rect x="${ox}" y="0" width="${SW}" height="${H}" rx="4" fill="${bg}" stroke="${accentColor}" stroke-width="1.2" opacity="0.85"/>`;
    photos += `<rect x="${ox}" y="0" width="${SW}" height="4" rx="2" fill="${accentColor}" opacity="0.6"/>`;
    for (let i = 0; i < rows; i++) {
      const px = ox + margin;
      const py = margin + i * (photoH + photoGap);
      photos += `<rect x="${px}" y="${py}" width="${photoW}" height="${photoH}" rx="2.5" fill="${photoBg}" stroke="${accentColor}" stroke-width="1" opacity="0.9"/>`;
    }
    photos += `<rect x="${ox}" y="${H - 4}" width="${SW}" height="4" rx="2" fill="${accentColor}" opacity="0.45"/>`;
  }
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg">${photos}</svg>`;
}

function generatePreviewSVG(layout) {
  switch (layout.type) {
    case 'strip':        return buildStripSVG(layout.rows, layout.accentColor);
    case 'grid2x2':      return buildGrid2x2SVG(layout.accentColor);
    case 'doublestrip':  return buildDoubleStripSVG(layout.accentColor);
    default:             return buildStripSVG(4, layout.accentColor);
  }
}

// ─── RENDER LAYOUT CARDS ──────────────────────────────────────────
function renderLayoutCards() {
  const grid = document.getElementById('layoutGrid');
  if (!grid) return;

  Object.values(LAYOUTS).forEach((layout, idx) => {
    const card = document.createElement('div');
    card.className = 'layout-card fade-in';
    card.style.cssText = `animation-delay:${idx * 0.08}s; --card-accent:${layout.accentColor};`;
    card.dataset.layoutId = layout.id;

    card.innerHTML = `
      <div class="badge-selected">✓ Selected</div>
      <div class="layout-preview">${generatePreviewSVG(layout)}</div>
      <div class="layout-info">
        <div class="layout-name">
          ${layout.name}
          <span class="kr">${layout.kr}</span>
        </div>
        <div class="layout-meta">
          <span class="meta-tag ${layout.tagColor}">${layout.format}</span>
          <span class="meta-tag ${layout.tagColor}">${layout.shots} shot${layout.shots > 1 ? 's' : ''}</span>
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

  // Show customize panel
  const panel = document.getElementById('customizePanel');
  if (panel) {
    panel.classList.remove('hidden');
    panel.classList.add('panel-enter');
    setTimeout(() => panel.classList.remove('panel-enter'), 400);

    // Update badge
    const badge = document.getElementById('selectedLayoutBadge');
    if (badge) {
      badge.innerHTML = `<span class="badge-layout-dot" style="background:${layout.accentColor}"></span>${layout.name}`;
    }

    // Scroll to panel on mobile
    if (window.innerWidth < 768) {
      setTimeout(() => panel.scrollIntoView({ behavior: 'smooth', block: 'start' }), 100);
    }
  }

  updatePreview();
}

// ─── COLOR SELECTION ─────────────────────────────────────────────
function initColorSwatches() {
  const swatches = document.querySelectorAll('.color-swatch');
  swatches.forEach(sw => {
    sw.addEventListener('click', () => {
      swatches.forEach(s => s.classList.remove('selected'));
      sw.classList.add('selected');
      selectedColor = sw.dataset.color;
      selectedColorName = sw.dataset.name;
      document.getElementById('colorNameLabel').textContent = selectedColorName;
      sessionStorage.setItem('photobooth_strip_color', selectedColor);
      updatePreview();
    });
  });
}

// ─── LIVE PREVIEW ────────────────────────────────────────────────
function updatePreview() {
  const layout = LAYOUTS[selectedLayoutId];
  const previewStrip  = document.getElementById('previewStrip');
  const barTop        = document.getElementById('previewBarTop');
  const barBottom     = document.getElementById('previewBarBottom');
  const previewPhotos = document.getElementById('previewPhotos');
  const previewText   = document.getElementById('previewText');
  const customText    = document.getElementById('customTextInput')?.value;

  if (!previewStrip) return;

  previewStrip.style.background = selectedColor;
  if (layout) {
    barTop.style.background    = layout.accentColor;
    barBottom.style.background = layout.accentColor;

    // Rebuild photo slots based on layout
    if (previewPhotos) {
      const count = Math.min(layout.rows * layout.cols, 4);
      previewPhotos.innerHTML = '';
      for (let i = 0; i < count; i++) {
        const slot = document.createElement('div');
        slot.className = 'preview-photo-slot';
        slot.style.borderColor = layout.accentColor + '66';
        previewPhotos.appendChild(slot);
      }
      if (layout.type === 'grid2x2' || layout.type === 'doublestrip') {
        previewPhotos.style.gridTemplateColumns = 'repeat(2, 1fr)';
      } else {
        previewPhotos.style.gridTemplateColumns = '1fr';
      }
    }
  }

  if (previewText) {
    previewText.textContent = customText || 'p-booth ♡';
  }
}

// ─── CUSTOM TEXT ─────────────────────────────────────────────────
function initCustomText() {
  const input   = document.getElementById('customTextInput');
  const counter = document.getElementById('charCounter');
  if (!input) return;

  input.addEventListener('input', () => {
    const len = input.value.length;
    if (counter) counter.textContent = `${len}/40`;
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

function getTodayStr() {
  const d = new Date();
  return `${d.getFullYear()}.${String(d.getMonth()+1).padStart(2,'0')}.${String(d.getDate()).padStart(2,'0')} ♡`;
}

// ─── CONTINUE TO CAMERA ──────────────────────────────────────────
function continueToCamera() {
  if (!selectedLayoutId) return;
  sessionStorage.setItem('photobooth_strip_color', selectedColor);
  sessionStorage.setItem('photobooth_custom_text', document.getElementById('customTextInput')?.value || '');
  window.location.href = 'camera.html';
}

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderLayoutCards();
  initColorSwatches();
  initCustomText();

  // Restore from session if revisiting
  const savedLayout = sessionStorage.getItem('photobooth_layout');
  const savedColor  = sessionStorage.getItem('photobooth_strip_color');
  const savedText   = sessionStorage.getItem('photobooth_custom_text');

  if (savedColor) {
    selectedColor = savedColor;
    document.querySelectorAll('.color-swatch').forEach(sw => {
      sw.classList.toggle('selected', sw.dataset.color === savedColor);
      if (sw.dataset.color === savedColor) {
        selectedColorName = sw.dataset.name;
        const lbl = document.getElementById('colorNameLabel');
        if (lbl) lbl.textContent = selectedColorName;
      }
    });
  }
  if (savedText) {
    const input = document.getElementById('customTextInput');
    if (input) {
      input.value = savedText;
      const counter = document.getElementById('charCounter');
      if (counter) counter.textContent = `${savedText.length}/40`;
    }
  }
  if (savedLayout) {
    selectLayout(savedLayout);
  }

  document.addEventListener('click', (e) => {
    const card = e.target.closest('.layout-card');
    if (card && !e.target.closest('.btn')) selectLayout(card.dataset.layoutId, e);
  });
});
