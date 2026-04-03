// ─── P-BOOTH PHOTO STRIP GENERATOR ───────────────────────────────
// Spacing ratios derived from Life4Cuts reference print (1200×1800px)
// PAD_X=0.4%, PAD_TOP=8.9%, PHOTO_GAP=4.7%, FOOTER_H=49.1% of strip_w
// Photo aspect: 0.6452 (height/width), ~11:7 landscape

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

function isDark(hex) {
  if (!hex || hex.length < 7) return false;
  const r = parseInt(hex.slice(1,3),16)/255;
  const g = parseInt(hex.slice(3,5),16)/255;
  const b = parseInt(hex.slice(5,7),16)/255;
  return (0.2126*r + 0.7152*g + 0.0722*b) < 0.40;
}

function drawPhoto(ctx, img, x, y, w, h) {
  ctx.save();
  ctx.beginPath();
  ctx.rect(x, y, w, h);
  ctx.clip();
  if (img) {
    const aspect = img.naturalWidth / img.naturalHeight;
    const target = w / h;
    let sx, sy, sw, sh;
    if (aspect > target) {
      sh = img.naturalHeight; sw = sh * target;
      sx = (img.naturalWidth - sw) / 2; sy = 0;
    } else {
      sw = img.naturalWidth; sh = sw / target;
      sx = 0; sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x, y, w, h);
  } else {
    ctx.fillStyle = 'rgba(0,0,0,0.07)';
    ctx.fillRect(x, y, w, h);
  }
  ctx.restore();
}

// Rotated side watermark — sits in the gap between strips (double) or outer edge (single)
function drawSideText(ctx, text, x, y, height, dark) {
  ctx.save();
  ctx.fillStyle = dark ? 'rgba(255,255,255,0.25)' : 'rgba(0,0,0,0.18)';
  ctx.font = '500 9px "Nunito", "Helvetica Neue", sans-serif';
  ctx.textAlign = 'center';
  ctx.translate(x, y + height / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.fillText(text.toUpperCase(), 0, 0);
  ctx.restore();
}

// Footer — exact reference proportions
// mainBaseline at 46.95% of footer_h, dateBaseline at 84.93%
// mainFont = 10.58% of strip_w, dateFont = 3.10% of strip_w
function drawFooter(ctx, offsetX, footerY, footerH, stripW, customText, bg) {
  const savedDate = sessionStorage.getItem('photobooth_custom_date');
  let dateStr;
  if (savedDate) {
    dateStr = savedDate.replace(/-/g, '.');
  } else {
    const now = new Date();
    dateStr = now.getFullYear() + '.' +
      String(now.getMonth()+1).padStart(2,'0') + '.' +
      String(now.getDate()).padStart(2,'0');
  }
  const mainLine  = customText || '인생네컷';
  const dark      = isDark(bg);
  const mainColor = dark ? '#ffffff' : '#111111';
  const subColor  = dark ? 'rgba(255,255,255,0.45)' : 'rgba(0,0,0,0.38)';
  const cx        = offsetX + stripW / 2;

  ctx.textAlign = 'center';

  // Main text (인생네컷 or custom)
  const mainSize = Math.round(stripW * 0.1058);
  ctx.font      = `900 ${mainSize}px 'Noto Sans KR', 'Nunito', sans-serif`;
  ctx.fillStyle = mainColor;
  ctx.fillText(mainLine, cx, footerY + footerH * 0.4695);

  // Date
  const subSize = Math.round(stripW * 0.0310);
  ctx.font      = `500 ${subSize}px 'Nunito', 'Helvetica Neue', sans-serif`;
  ctx.fillStyle = subColor;
  ctx.fillText(dateStr, cx, footerY + footerH * 0.8493);
}

// ─── Shared dimension calculator ─────────────────────────────────
function dims(stripW) {
  const PAD_X     = Math.round(stripW * 0.0036);   // ~0.4%
  const PAD_TOP   = Math.round(stripW * 0.0894);   // ~8.9%
  const PHOTO_GAP = Math.round(stripW * 0.0474);   // ~4.7%
  const PHOTO_W   = stripW - PAD_X * 2;
  const PHOTO_H   = Math.round(PHOTO_W * 0.6452);  // exact reference ratio
  const FOOTER_H  = Math.round(stripW * 0.4909);   // ~49.1%
  return { PAD_X, PAD_TOP, PHOTO_GAP, PHOTO_W, PHOTO_H, FOOTER_H };
}

// ─── STRIP (CUT4, CUT2) ──────────────────────────────────────────
async function generateStrip(photos, layout, stripBg, customText) {
  const BG        = stripBg || '#ffffff';
  const SW        = 560;
  const OUTER_PAD = Math.round(SW * 0.0484);   // ~27px outer margin each side
  const TOTAL_W   = SW + OUTER_PAD * 2;
  const d         = dims(SW);
  const rows      = layout.rows;

  const photoArea = rows * d.PHOTO_H + (rows - 1) * d.PHOTO_GAP;
  const totalH    = d.PAD_TOP + photoArea + d.FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = TOTAL_W; canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, TOTAL_W, totalH);

  const images = await Promise.all(photos.map(s => s ? loadImage(s) : Promise.resolve(null)));

  for (let i = 0; i < rows; i++) {
    const y = d.PAD_TOP + i * (d.PHOTO_H + d.PHOTO_GAP);
    drawPhoto(ctx, images[i] || null, OUTER_PAD + d.PAD_X, y, d.PHOTO_W, d.PHOTO_H);
  }

  drawFooter(ctx, OUTER_PAD, d.PAD_TOP + photoArea, d.FOOTER_H, SW, customText, BG);
  return canvas;
}

// ─── GRID 2×2 (WIDE4) ────────────────────────────────────────────
async function generateGrid2x2(photos, layout, stripBg, customText) {
  const BG        = stripBg || '#ffffff';
  const SW        = 620;
  const OUTER_PAD = Math.round(SW * 0.0484);
  const TOTAL_W   = SW + OUTER_PAD * 2;
  const PAD_X     = Math.round(SW * 0.0036);
  const PAD_TOP   = Math.round(SW * 0.0894);
  const GAP       = Math.round(SW * 0.0474);

  const PHOTO_W   = Math.floor((SW - PAD_X * 2 - GAP) / 2);
  const PHOTO_H   = Math.round(PHOTO_W * 0.6452);
  const FOOTER_H  = Math.round(SW * 0.4909);
  const photoArea = 2 * PHOTO_H + GAP;
  const totalH    = PAD_TOP + photoArea + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = TOTAL_W; canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, TOTAL_W, totalH);

  const images = await Promise.all(photos.map(s => s ? loadImage(s) : Promise.resolve(null)));

  let idx = 0;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x = OUTER_PAD + PAD_X + c * (PHOTO_W + GAP);
      const y = PAD_TOP + r * (PHOTO_H + GAP);
      drawPhoto(ctx, images[idx++] || null, x, y, PHOTO_W, PHOTO_H);
    }
  }

  drawFooter(ctx, OUTER_PAD, PAD_TOP + photoArea, FOOTER_H, SW, customText, BG);
  return canvas;
}

// ─── DOUBLE STRIP (CUT8) ─────────────────────────────────────────
// Reference: 27px outer margin each side, 30px gap — ratios preserved
async function generateDoubleStrip(photos, layout, stripBg, customText) {
  const BG        = stripBg || '#ffffff';
  const dark      = isDark(BG);
  const SW        = 580;                          // each strip width
  const STRIP_GAP = Math.round(SW * 0.0547);      // ~32px between strips
  const OUTER_PAD = Math.round(SW * 0.0484);      // ~28px outer margin each side
  const TOTAL_W   = OUTER_PAD + SW + STRIP_GAP + SW + OUTER_PAD;
  const ROWS      = 4;
  const d         = dims(SW);

  const photoArea = ROWS * d.PHOTO_H + (ROWS - 1) * d.PHOTO_GAP;
  const totalH    = d.PAD_TOP + photoArea + d.FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = TOTAL_W; canvas.height = totalH;
  const ctx = canvas.getContext('2d');
  ctx.fillStyle = BG;
  ctx.fillRect(0, 0, TOTAL_W, totalH);

  const images = await Promise.all(photos.map(s => s ? loadImage(s) : Promise.resolve(null)));

  for (let s = 0; s < 2; s++) {
    const ox = OUTER_PAD + s * (SW + STRIP_GAP);  // strip origin includes outer pad

    for (let i = 0; i < ROWS; i++) {
      const x = ox + d.PAD_X;
      const y = d.PAD_TOP + i * (d.PHOTO_H + d.PHOTO_GAP);
      drawPhoto(ctx, images[s * ROWS + i] || null, x, y, d.PHOTO_W, d.PHOTO_H);
    }

    drawSideText(ctx, 'p-booth', ox + SW - 6, d.PAD_TOP, photoArea, dark);
    drawFooter(ctx, ox, d.PAD_TOP + photoArea, d.FOOTER_H, SW, customText, BG);
  }

  return canvas;
}

// ─── MAIN ────────────────────────────────────────────────────────
async function generatePhotoStrip(photos, layoutConfig) {
  const stripBg    = sessionStorage.getItem('photobooth_strip_color') || '#ffffff';
  const customText = sessionStorage.getItem('photobooth_custom_text') || '';

  switch (layoutConfig.type) {
    case 'grid2x2':     return generateGrid2x2(photos, layoutConfig, stripBg, customText);
    case 'doublestrip': return generateDoubleStrip(photos, layoutConfig, stripBg, customText);
    default:            return generateStrip(photos, layoutConfig, stripBg, customText);
  }
}

function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename || 'p-booth.png';
  link.href = canvas.toDataURL('image/png', 1.0);
  link.click();
}
