import { DOCK } from "../game/config";
import { FONT, drawPanel, hit, type Rect } from "./menu";

export type CommsTone = "neutral" | "pirate" | "station" | "fuelRat";

interface CommsLine {
  text: string;
  age: number;
  tone: CommsTone;
}

/**
 * Right-side log for station/comms messages.
 * Fixed-size panel; live lines fade after TTL; hover reveals scrollable history.
 */
export class MessageSidebar {
  private readonly lines: CommsLine[] = [];
  /** Pixels scrolled down from the oldest (top) edge — history hover mode. */
  private scroll = 0;
  private maxScroll = 0;
  private hoverActive = false;
  /** Hit target — always the fixed panel rect, even when hidden. */
  private hitArea: Rect = { x: 0, y: 0, w: 0, h: 0 };
  /**
   * TEMP toll countdown. Drawn with comms and kept out of history
   * so a still can show the live seconds next to the demand.
   */
  liveLine: string | null = null;

  clear(): void {
    this.lines.length = 0;
    this.scroll = 0;
    this.maxScroll = 0;
    this.hoverActive = false;
    this.liveLine = null;
  }

  push(text: string, tone: CommsTone = "neutral"): void {
    this.lines.push({ text, age: 0, tone });
    while (this.lines.length > DOCK.messageMax) {
      this.lines.shift();
    }
    // New traffic pins history view to the newest end.
    this.scroll = Number.POSITIVE_INFINITY;
  }

  update(dt: number): void {
    for (const line of this.lines) {
      line.age += dt;
    }
    // History is retained until messageMax FIFO; fade is visual only.
  }

  /**
   * Wheel over the comms area scrolls older messages.
   * Returns true if the event was consumed.
   */
  handleWheel(deltaY: number, px: number, py: number): boolean {
    if (this.lines.length === 0 || deltaY === 0) return false;
    if (!hit(this.hitArea, px, py)) return false;
    const next = Math.min(
      this.maxScroll,
      Math.max(0, this.scroll + deltaY * 0.5),
    );
    this.scroll = next;
    return true;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    width: number,
    height: number,
    pointerX: number,
    pointerY: number,
  ): void {
    const w = DOCK.messageSidebarWidth;
    const h = Math.min(DOCK.messageSidebarHeight, height - 24);
    const panel: Rect = {
      x: width - w - 12,
      y: 12,
      w,
      h,
    };
    this.hitArea = panel;

    if (this.lines.length === 0 && !this.liveLine) return;

    const hovering = hit(panel, pointerX, pointerY);
    const hasFresh = this.lines.some((l) => l.age < DOCK.messageTtl);
    // Live view only while something is still fading in; hover always shows history.
    if (!hovering && !hasFresh && !this.liveLine) {
      this.hoverActive = false;
      return;
    }

    const pad = 12;
    const lineH = 16;
    const headerH = 28;
    const gap = 6;
    const textW = w - pad * 2;
    const bodyTop = panel.y + headerH;
    const bodyH = panel.h - headerH - pad;

    ctx.font = FONT;

    const blocks: { wrapped: string[]; alpha: number; tone: CommsTone }[] = [];
    for (const line of this.lines) {
      let alpha: number;
      if (hovering) {
        alpha = 1;
      } else {
        alpha = Math.min(1, Math.max(0, (DOCK.messageTtl - line.age) / 1.8));
        if (alpha <= 0) continue;
      }
      blocks.push({
        wrapped: wrapText(ctx, line.text, textW),
        alpha,
        tone: line.tone,
      });
    }
    if (this.liveLine) {
      blocks.push({
        wrapped: wrapText(ctx, this.liveLine, textW),
        alpha: 1,
        tone: "pirate",
      });
    }
    if (blocks.length === 0) {
      this.hoverActive = false;
      return;
    }

    let contentH = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      contentH += blocks[i]!.wrapped.length * lineH;
      if (i < blocks.length - 1) contentH += gap;
    }

    this.maxScroll = Math.max(0, contentH - bodyH);
    if (hovering) {
      if (!this.hoverActive || !Number.isFinite(this.scroll)) {
        this.scroll = this.maxScroll;
      } else {
        this.scroll = Math.min(Math.max(0, this.scroll), this.maxScroll);
      }
      this.hoverActive = true;
    } else {
      this.hoverActive = false;
    }
    const viewScroll = hovering ? this.scroll : this.maxScroll;

    drawPanel(ctx, panel);

    ctx.fillStyle = hovering
      ? "rgba(180, 200, 230, 0.95)"
      : "rgba(180, 200, 230, 0.9)";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText(
      hovering ? "Comms — history" : "Comms",
      panel.x + pad,
      panel.y + 8,
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x + 1, bodyTop, panel.w - 2, bodyH);
    ctx.clip();

    let y = bodyTop - viewScroll;
    for (let bi = 0; bi < blocks.length; bi += 1) {
      const block = blocks[bi]!;
      ctx.fillStyle = toneFill(block.tone, block.alpha);
      for (const row of block.wrapped) {
        if (y + lineH >= bodyTop && y <= bodyTop + bodyH) {
          ctx.fillText(row, panel.x + pad, y);
        }
        y += lineH;
      }
      if (bi < blocks.length - 1) y += gap;
    }

    ctx.restore();

    if (hovering && this.maxScroll > 0) {
      const trackH = bodyH;
      const thumbH = Math.max(18, (bodyH / contentH) * trackH);
      const thumbY =
        bodyTop + (this.scroll / this.maxScroll) * (trackH - thumbH);
      ctx.fillStyle = "rgba(140, 170, 210, 0.35)";
      ctx.fillRect(panel.x + panel.w - 5, thumbY, 3, thumbH);
    }
  }
}

function toneFill(tone: CommsTone, alpha: number): string {
  const a = 0.55 + 0.33 * alpha;
  switch (tone) {
    case "pirate":
      return `rgba(230, 90, 90, ${a})`;
    case "station":
      return `rgba(140, 200, 245, ${a})`;
    case "fuelRat":
      return `rgba(150, 210, 160, ${a})`;
    default:
      return `rgba(200, 215, 235, ${a})`;
  }
}

function wrapText(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxW: number,
): string[] {
  const words = text.split(/\s+/);
  const rows: string[] = [];
  let current = "";

  for (const word of words) {
    if (!word) continue;
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxW) {
      current = next;
      continue;
    }
    if (current) rows.push(current);
    // Long single token: hard-break by characters
    if (ctx.measureText(word).width > maxW) {
      let chunk = "";
      for (const ch of word) {
        const tryChunk = chunk + ch;
        if (ctx.measureText(tryChunk).width > maxW && chunk) {
          rows.push(chunk);
          chunk = ch;
        } else {
          chunk = tryChunk;
        }
      }
      current = chunk;
    } else {
      current = word;
    }
  }
  if (current) rows.push(current);
  return rows.length > 0 ? rows : [text];
}
