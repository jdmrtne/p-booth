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

// ─── SVG PREVIEWS ────────────────────────────────────────────────
function isDarkColor(hex) {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  return (0.2126*r + 0.7152*g + 0.0722*b) < 0.40;
}

function buildStripSVG(rows, bg) {
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
  const sc      = TOTAL_W / 668;
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

// ─── RENDER LAYOUT CARDS ─────────────────────────────────────────
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
      <div class="layout-preview">${generatePreviewSVG(layout, '#ffffff')}</div>
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

// ─── SELECT LAYOUT → GO DIRECTLY TO CAMERA ───────────────────────
function selectLayout(id, event) {
  event?.stopPropagation();
  if (!LAYOUTS[id]) return;

  // Highlight card briefly
  document.querySelectorAll('.layout-card').forEach(c => c.classList.remove('selected'));
  const card = document.querySelector(`[data-layout-id="${id}"]`);
  if (card) card.classList.add('selected');

  // Save layout to session
  sessionStorage.setItem('photobooth_layout', id);
  sessionStorage.removeItem('photobooth_photos');

  // Animate button then navigate
  const btn = document.getElementById(`select-btn-${id}`);
  if (btn) { btn.textContent = '✓ Loading…'; btn.disabled = true; }
  setTimeout(() => { window.location.href = 'camera.html'; }, 200);
}

// ─── INIT ─────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  renderLayoutCards();

  // Restore previously selected layout highlight (no-op if none)
  const savedLayout = sessionStorage.getItem('photobooth_layout');
  if (savedLayout) {
    const card = document.querySelector(`[data-layout-id="${savedLayout}"]`);
    if (card) card.classList.add('selected');
  }

  document.addEventListener('click', e => {
    const card = e.target.closest('.layout-card');
    if (card && !e.target.closest('.btn')) selectLayout(card.dataset.layoutId, e);
  });
});
