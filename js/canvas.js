// ─── LIFE4CUTS-STYLE PHOTO STRIP GENERATOR ───────────────────────

function loadImage(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload  = () => resolve(img);
    img.onerror = reject;
    img.src = src;
  });
}

// ── Drawing Primitives ────────────────────────────────────────────
function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.arcTo(x + w, y,     x + w, y + r,     r);
  ctx.lineTo(x + w, y + h - r);
  ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
  ctx.lineTo(x + r, y + h);
  ctx.arcTo(x, y + h, x, y + h - r,         r);
  ctx.lineTo(x, y + r);
  ctx.arcTo(x, y,     x + r, y,              r);
  ctx.closePath();
}

function drawHeart(ctx, cx, cy, size, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.moveTo(cx, cy + size * 0.3);
  ctx.bezierCurveTo(cx, cy, cx - size * 0.5, cy, cx - size * 0.5, cy + size * 0.3);
  ctx.bezierCurveTo(cx - size * 0.5, cy + size * 0.65, cx, cy + size * 0.9, cx, cy + size);
  ctx.bezierCurveTo(cx, cy + size * 0.9, cx + size * 0.5, cy + size * 0.65, cx + size * 0.5, cy + size * 0.3);
  ctx.bezierCurveTo(cx + size * 0.5, cy, cx, cy, cx, cy + size * 0.3);
  ctx.fill();
  ctx.restore();
}

function drawStar(ctx, cx, cy, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  for (let i = 0; i < 5; i++) {
    const ao = (i * 4 * Math.PI / 5) - Math.PI / 2;
    const ai = ao + 2 * Math.PI / 10;
    if (i === 0) ctx.moveTo(cx + r * Math.cos(ao), cy + r * Math.sin(ao));
    else         ctx.lineTo(cx + r * Math.cos(ao), cy + r * Math.sin(ao));
    ctx.lineTo(cx + r * 0.4 * Math.cos(ai), cy + r * 0.4 * Math.sin(ai));
  }
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawDot(ctx, cx, cy, r, color, alpha = 1) {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

// ── Photo Slot ────────────────────────────────────────────────────
function drawPhotoSlot(ctx, img, x, y, w, h, borderW, radius = 4) {
  ctx.fillStyle = '#ffffff';
  roundRect(ctx, x, y, w + borderW * 2, h + borderW * 2, radius + borderW);
  ctx.fill();

  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.08)';
  ctx.shadowBlur = 8;
  ctx.shadowOffsetY = 2;
  ctx.fillStyle = '#f8f4ff';
  roundRect(ctx, x + borderW, y + borderW, w, h, radius);
  ctx.fill();
  ctx.restore();

  if (img) {
    ctx.save();
    roundRect(ctx, x + borderW, y + borderW, w, h, radius);
    ctx.clip();
    const aspect       = img.naturalWidth / img.naturalHeight;
    const targetAspect = w / h;
    let sx, sy, sw, sh;
    if (aspect > targetAspect) {
      sh = img.naturalHeight; sw = sh * targetAspect;
      sx = (img.naturalWidth - sw) / 2; sy = 0;
    } else {
      sw = img.naturalWidth; sh = sw / targetAspect;
      sx = 0; sy = (img.naturalHeight - sh) / 2;
    }
    ctx.drawImage(img, sx, sy, sw, sh, x + borderW, y + borderW, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = '#fce4f0';
    roundRect(ctx, x + borderW, y + borderW, w, h, radius);
    ctx.fill();
  }
}

// ── Header + Footer ───────────────────────────────────────────────
function drawStripHeader(ctx, cw, accent, title, subtitle) {
  const hh = 44;
  ctx.fillStyle = accent;
  roundRect(ctx, 0, 0, cw, hh, 0);
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.fillStyle = '#ffffff';
  ctx.font = `bold 14px 'Nunito', 'Noto Sans KR', sans-serif`;
  ctx.letterSpacing = '2px';
  ctx.fillText(title.toUpperCase(), cw / 2, 18);

  ctx.font = `600 10px 'Nunito', sans-serif`;
  ctx.fillStyle = 'rgba(255,255,255,.75)';
  ctx.letterSpacing = '1px';
  ctx.fillText(subtitle, cw / 2, 33);

  drawHeart(ctx, 8, 6, 8, 'rgba(255,255,255,.55)');
  drawHeart(ctx, cw - 16, 6, 8, 'rgba(255,255,255,.55)');
}

function drawStripFooter(ctx, cw, cy, accent, customText) {
  const fh = 52;
  ctx.fillStyle = accent;
  roundRect(ctx, 0, cy, cw, fh, 0);
  ctx.fill();

  // Custom text (if provided) or date
  const now     = new Date();
  const dateStr = now.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
  const line1   = customText || dateStr;
  const line2   = customText ? dateStr : null;

  ctx.textAlign = 'center';
  ctx.fillStyle = 'rgba(255,255,255,.95)';
  ctx.font = `bold 12px 'Nunito', sans-serif`;
  ctx.letterSpacing = '0.5px';
  ctx.fillText(line1, cw / 2, cy + 18);

  if (line2) {
    ctx.font = `600 9px 'Nunito', sans-serif`;
    ctx.fillStyle = 'rgba(255,255,255,.7)';
    ctx.fillText(line2, cw / 2, cy + 30);
  }

  // Decorative dots
  for (let d = 0; d < 5; d++) {
    drawDot(ctx, cw / 2 - 12 + d * 6, cy + fh - 12, 2, 'rgba(255,255,255,.55)');
  }
  drawStar(ctx, 14, cy + fh / 2, 6, 'rgba(255,255,255,.5)');
  drawStar(ctx, cw - 14, cy + fh / 2, 6, 'rgba(255,255,255,.5)');
}

function drawSideDecorations(ctx, cw, topY, bottomY, accent) {
  const totalH = bottomY - topY;
  const count  = 5;
  for (let i = 0; i < count; i++) {
    const y = topY + (i + 0.5) * (totalH / count);
    drawHeart(ctx, 5, y - 3, 6, accent, 0.25);
    drawHeart(ctx, cw - 11, y - 3, 6, accent, 0.25);
  }
}

// ── Background helper ─────────────────────────────────────────────
function drawStripBackground(ctx, cw, ch, stripBg) {
  // Solid pastel background
  ctx.fillStyle = stripBg || '#ffffff';
  ctx.fillRect(0, 0, cw, ch);

  // Subtle texture overlay (dots pattern)
  if (stripBg && stripBg !== '#ffffff') {
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = 'rgba(0,0,0,1)';
    const dotSpacing = 18;
    for (let x = dotSpacing; x < cw; x += dotSpacing) {
      for (let y = dotSpacing; y < ch; y += dotSpacing) {
        ctx.beginPath();
        ctx.arc(x, y, 1, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

// ─── STRIP LAYOUT (1-column: CUT4, CUT2) ─────────────────────────
async function generateStrip(photos, layout, stripBg, customText) {
  const accent      = layout.accentColor || '#ff6b9d';
  const STRIP_W     = 360;
  const MARGIN_X    = 22;
  const PHOTO_W     = STRIP_W - MARGIN_X * 2;
  const PHOTO_H     = Math.round(PHOTO_W * 0.75);
  const BORDER      = 4;
  const HEADER_H    = 44;
  const FOOTER_H    = 52;
  const GAP         = 10;
  const INNER_PAD_Y = 14;
  const rows        = layout.rows;

  const totalPhotoH = rows * (PHOTO_H + BORDER * 2) + (rows - 1) * GAP;
  const cH = HEADER_H + INNER_PAD_Y + totalPhotoH + INNER_PAD_Y + FOOTER_H;
  const cW = STRIP_W;

  const canvas = document.createElement('canvas');
  canvas.width = cW; canvas.height = cH;
  const ctx = canvas.getContext('2d');

  drawStripBackground(ctx, cW, cH, stripBg);
  drawStripHeader(ctx, cW, accent, layout.kr || layout.name, layout.format);
  drawStripFooter(ctx, cW, HEADER_H + INNER_PAD_Y + totalPhotoH + INNER_PAD_Y, accent, customText);
  drawSideDecorations(ctx, cW, HEADER_H, HEADER_H + INNER_PAD_Y + totalPhotoH + INNER_PAD_Y, accent);

  const images = await Promise.all(photos.map(s => s ? loadImage(s) : Promise.resolve(null)));

  for (let i = 0; i < rows; i++) {
    const y = HEADER_H + INNER_PAD_Y + i * (PHOTO_H + BORDER * 2 + GAP);
    drawPhotoSlot(ctx, images[i] || null, MARGIN_X, y, PHOTO_W, PHOTO_H, BORDER);

    if (i < rows - 1) {
      const midY = y + PHOTO_H + BORDER * 2 + GAP / 2 - 3;
      drawHeart(ctx, cW / 2 - 14, midY, 6, accent, 0.35);
      drawStar(ctx,  cW / 2,       midY + 1, 4, accent, 0.3);
      drawHeart(ctx, cW / 2 + 8,  midY, 6, accent, 0.35);
    }
  }

  return canvas;
}

// ─── GRID 2×2 (WIDE4) ────────────────────────────────────────────
async function generateGrid2x2(photos, layout, stripBg, customText) {
  const accent     = layout.accentColor || '#2dd4bf';
  const cW         = 580;
  const MARGIN_X   = 20;
  const MARGIN_Y   = 14;
  const HEADER_H   = 44;
  const FOOTER_H   = 52;
  const GAP        = 12;
  const BORDER     = 4;

  const photoW = Math.floor((cW - MARGIN_X * 2 - GAP - BORDER * 2 * 2) / 2);
  const photoH = Math.round(photoW * 0.75);
  const cH     = HEADER_H + MARGIN_Y + 2 * (photoH + BORDER * 2) + GAP + MARGIN_Y + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = cW; canvas.height = cH;
  const ctx = canvas.getContext('2d');

  drawStripBackground(ctx, cW, cH, stripBg);
  drawStripHeader(ctx, cW, accent, layout.kr || layout.name, layout.format);
  drawStripFooter(ctx, cW, cH - FOOTER_H, accent, customText);

  const images = await Promise.all(photos.map(s => s ? loadImage(s) : Promise.resolve(null)));

  let idx = 0;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 2; c++) {
      const x = MARGIN_X + c * (photoW + BORDER * 2 + GAP);
      const y = HEADER_H + MARGIN_Y + r * (photoH + BORDER * 2 + GAP);
      drawPhotoSlot(ctx, images[idx] || null, x, y, photoW, photoH, BORDER);
      idx++;
    }
  }

  const midX = cW / 2;
  const midY = HEADER_H + MARGIN_Y + photoH + BORDER * 2 + GAP / 2;
  drawHeart(ctx, midX - 10, midY - 4, 8, accent, 0.4);
  drawStar(ctx,  midX + 2,  midY - 3, 5, accent, 0.35);

  return canvas;
}

// ─── DOUBLE STRIP (CUT8) ──────────────────────────────────────────
async function generateDoubleStrip(photos, layout, stripBg, customText) {
  const accent      = layout.accentColor || '#fbbf24';
  const STRIP_W     = 280;
  const STRIP_GAP   = 18;
  const MARGIN_X    = 16;
  const PHOTO_W     = STRIP_W - MARGIN_X * 2;
  const PHOTO_H     = Math.round(PHOTO_W * 0.75);
  const BORDER      = 3;
  const HEADER_H    = 44;
  const FOOTER_H    = 52;
  const GAP         = 8;
  const INNER_PAD_Y = 12;
  const ROWS        = 4;
  const cW          = STRIP_W * 2 + STRIP_GAP;

  const totalPhotoH = ROWS * (PHOTO_H + BORDER * 2) + (ROWS - 1) * GAP;
  const cH = HEADER_H + INNER_PAD_Y + totalPhotoH + INNER_PAD_Y + FOOTER_H;

  const canvas = document.createElement('canvas');
  canvas.width = cW; canvas.height = cH;
  const ctx = canvas.getContext('2d');

  drawStripBackground(ctx, cW, cH, stripBg);
  drawStripHeader(ctx, cW, accent, layout.kr || layout.name, layout.format);
  drawStripFooter(ctx, cW, cH - FOOTER_H, accent, customText);

  // Divider
  ctx.strokeStyle = `rgba(${hexToRgb(accent)}, 0.2)`;
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 5]);
  ctx.beginPath();
  ctx.moveTo(STRIP_W + STRIP_GAP / 2, HEADER_H + 8);
  ctx.lineTo(STRIP_W + STRIP_GAP / 2, cH - FOOTER_H - 8);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.save();
  ctx.translate(STRIP_W + STRIP_GAP / 2, cH / 2);
  ctx.rotate(-Math.PI / 2);
  ctx.textAlign = 'center';
  ctx.font = `700 9px 'Nunito', sans-serif`;
  ctx.fillStyle = `rgba(${hexToRgb(accent)}, 0.4)`;
  ctx.letterSpacing = '1.5px';
  ctx.fillText('SHARE ONE ♡', 0, 3);
  ctx.restore();

  const images = await Promise.all(photos.map(s => s ? loadImage(s) : Promise.resolve(null)));

  for (let s = 0; s < 2; s++) {
    const ox = s * (STRIP_W + STRIP_GAP);
    for (let i = 0; i < ROWS; i++) {
      const x = ox + MARGIN_X;
      const y = HEADER_H + INNER_PAD_Y + i * (PHOTO_H + BORDER * 2 + GAP);
      drawPhotoSlot(ctx, images[s * ROWS + i] || null, x, y, PHOTO_W, PHOTO_H, BORDER);
    }
  }

  return canvas;
}

// ─── HEX → RGB ───────────────────────────────────────────────────
function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3), 16);
  const g = parseInt(hex.slice(3,5), 16);
  const b = parseInt(hex.slice(5,7), 16);
  return `${r},${g},${b}`;
}

// ─── MAIN EXPORT ─────────────────────────────────────────────────
async function generatePhotoStrip(photos, layoutConfig) {
  const stripBg    = sessionStorage.getItem('photobooth_strip_color') || '#ffffff';
  const customText = sessionStorage.getItem('photobooth_custom_text') || '';

  switch (layoutConfig.type) {
    case 'grid2x2':     return generateGrid2x2(photos, layoutConfig, stripBg, customText);
    case 'doublestrip': return generateDoubleStrip(photos, layoutConfig, stripBg, customText);
    default:            return generateStrip(photos, layoutConfig, stripBg, customText);
  }
}

// ─── DOWNLOAD ────────────────────────────────────────────────────
function downloadCanvas(canvas, filename) {
  const link = document.createElement('a');
  link.download = filename || 'photobooth.png';
  link.href = canvas.toDataURL('image/png', 1.0);
  link.click();
}
