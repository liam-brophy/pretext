import './style.css';
import { canvas, ctx, COLUMN, BODY_FONT } from './setup';
import type { PreparedTextWithSegments } from '@chenglou/pretext';

type ExperimentModule = {
  start: (
    ctx: CanvasRenderingContext2D,
    prepared: PreparedTextWithSegments | null,
    column: typeof COLUMN,
  ) => () => void;
};

const EXPERIMENTS: Record<string, () => Promise<ExperimentModule>> = {
  tree:        () => import('./experiments/tree'),
  orb:         () => import('./experiments/orb'),
  redaction:   () => import('./experiments/redaction'),
  compression: () => import('./experiments/compression'),
  marquee:     () => import('./experiments/marquee'),
};

let cancelCurrent: (() => void) | null = null;

async function loadExperiment(name: string) {
  // Cancel previous loop
  if (cancelCurrent) {
    cancelCurrent();
    cancelCurrent = null;
  }

  // Clear canvas
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  const mod = await EXPERIMENTS[name]();
  cancelCurrent = mod.start(ctx, null, COLUMN);

  // Update active button state
  document.querySelectorAll<HTMLButtonElement>('#nav button').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.exp === name);
  });
}

// Wire up buttons
document.querySelectorAll<HTMLButtonElement>('#nav button').forEach(btn => {
  btn.addEventListener('click', () => {
    const name = btn.dataset.exp;
    if (name) loadExperiment(name);
  });
});

// Boot: wait for Lora font, then start first experiment
await document.fonts.ready;

// Verify Lora is loaded by setting it on the hidden measurement canvas
ctx.font = BODY_FONT;

loadExperiment('orb');
