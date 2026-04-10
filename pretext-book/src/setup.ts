// ── Canvas ────────────────────────────────────────────────────────────────────
const DPR = window.devicePixelRatio || 1;

export const canvas = document.getElementById('canvas') as HTMLCanvasElement;

// Physical size: 576×864px (6×9 in at 96dpi)
const CSS_W = 576;
const CSS_H = 864;

canvas.style.width  = `${CSS_W}px`;
canvas.style.height = `${CSS_H}px`;
canvas.width  = CSS_W * DPR;
canvas.height = CSS_H * DPR;

export const ctx = canvas.getContext('2d')!;
ctx.scale(DPR, DPR);
ctx.textAlign    = 'left';
ctx.textBaseline = 'alphabetic';

// ── Column ────────────────────────────────────────────────────────────────────
// 6×9in page at 96dpi: equal 72px (0.75in) margins top/bottom/sides.
// height = 864 − 72 (top) − 72 (bottom) = 720px  →  bottom at y=792.
export const COLUMN = {
  x:          96,
  y:          72,
  width:      408,
  height:     720,
  lineHeight: 26,
} as const;

// ── Font ──────────────────────────────────────────────────────────────────────
export const BODY_FONT = '16px Lora';
