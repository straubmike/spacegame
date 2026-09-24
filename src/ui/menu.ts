/** Shared menu chrome helpers — keep UI simple and consistent. */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function hit(r: Rect, px: number, py: number): boolean {
  return px >= r.x && px <= r.x + r.w && py >= r.y && py <= r.y + r.h;
}

export function drawPanel(
  ctx: CanvasRenderingContext2D,
  r: Rect,
): void {
  ctx.fillStyle = "rgba(8, 12, 20, 0.94)";
  ctx.strokeStyle = "rgba(130, 165, 210, 0.45)";
  ctx.lineWidth = 1;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeRect(r.x, r.y, r.w, r.h);
}

export function drawButton(
  ctx: CanvasRenderingContext2D,
  r: Rect,
  label: string,
  opts: { enabled?: boolean; primary?: boolean; hover?: boolean } = {},
): void {
  const enabled = opts.enabled !== false;
  const primary = opts.primary === true;
  const hover = opts.hover === true && enabled;

  if (primary && enabled) {
    ctx.fillStyle = hover ? "rgba(70, 130, 190, 0.85)" : "rgba(50, 110, 170, 0.75)";
  } else if (enabled) {
    ctx.fillStyle = hover ? "rgba(40, 55, 75, 0.9)" : "rgba(28, 38, 52, 0.9)";
  } else {
    ctx.fillStyle = "rgba(20, 26, 34, 0.7)";
  }
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.strokeStyle = enabled
    ? "rgba(140, 175, 220, 0.55)"
    : "rgba(80, 95, 115, 0.4)";
  ctx.strokeRect(r.x, r.y, r.w, r.h);

  ctx.font = "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
  ctx.fillStyle = enabled
    ? "rgba(220, 235, 255, 0.95)"
    : "rgba(120, 135, 155, 0.6)";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(label, r.x + r.w / 2, r.y + r.h / 2 + 0.5);
  ctx.textAlign = "left";
  ctx.textBaseline = "alphabetic";
}

export const FONT =
  "13px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
export const FONT_TITLE =
  "16px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
