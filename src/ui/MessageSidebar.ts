import { DOCK } from "../game/config";
import { FONT, drawPanel, type Rect } from "./menu";

export type CommsTone = "neutral" | "pirate" | "station";

interface CommsLine {
  text: string;
  age: number;
  tone: CommsTone;
}

/**
 * Right-side log for station/comms messages. Full text wraps; lines expire.
 */
export class MessageSidebar {
  private readonly lines: CommsLine[] = [];

  push(text: string, tone: CommsTone = "neutral"): void {
    this.lines.push({ text, age: 0, tone });
    while (this.lines.length > DOCK.messageMax) {
      this.lines.shift();
    }
  }

  update(dt: number): void {
    for (const line of this.lines) {
      line.age += dt;
    }
    while (this.lines.length > 0 && this.lines[0]!.age >= DOCK.messageTtl) {
      this.lines.shift();
    }
  }

  draw(ctx: CanvasRenderingContext2D, width: number, height: number): void {
    if (this.lines.length === 0) return;

    const w = DOCK.messageSidebarWidth;
    const pad = 12;
    const lineH = 16;
    const headerH = 28;
    const gap = 6;
    const textW = w - pad * 2;
    const maxBottom = height - 24;

    ctx.font = FONT;

    // Layout oldest→newest; drop oldest wrapped blocks if they won't fit
    const blocks: { wrapped: string[]; alpha: number; tone: CommsTone }[] = [];
    for (const line of this.lines) {
      const fade = Math.min(1, (DOCK.messageTtl - line.age) / 1.2);
      blocks.push({
        wrapped: wrapText(ctx, line.text, textW),
        alpha: fade,
        tone: line.tone,
      });
    }

    let contentH = 0;
    for (let i = 0; i < blocks.length; i += 1) {
      contentH += blocks[i]!.wrapped.length * lineH;
      if (i < blocks.length - 1) contentH += gap;
    }

    const maxContentH = maxBottom - 12 - headerH - pad;
    while (blocks.length > 1 && contentH > maxContentH) {
      const removed = blocks.shift()!;
      contentH -= removed.wrapped.length * lineH + gap;
    }
    // If still too tall, trim top lines of the first block
    if (blocks.length === 1 && contentH > maxContentH) {
      const b = blocks[0]!;
      while (b.wrapped.length > 1 && b.wrapped.length * lineH > maxContentH) {
        b.wrapped.shift();
      }
      contentH = b.wrapped.length * lineH;
    }

    const h = headerH + contentH + pad;
    const panel: Rect = {
      x: width - w - 12,
      y: 12,
      w,
      h: Math.min(h, maxBottom - 12),
    };

    drawPanel(ctx, panel);

    ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
    ctx.textBaseline = "top";
    ctx.textAlign = "left";
    ctx.fillText("Comms", panel.x + pad, panel.y + 8);

    let y = panel.y + headerH;
    for (let bi = 0; bi < blocks.length; bi += 1) {
      const block = blocks[bi]!;
      ctx.fillStyle = toneFill(block.tone, block.alpha);
      for (const row of block.wrapped) {
        ctx.fillText(row, panel.x + pad, y);
        y += lineH;
      }
      if (bi < blocks.length - 1) y += gap;
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
