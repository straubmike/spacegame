import { ECONOMY } from "../game/config";
import { FONT, drawButton, drawPanel, hit, type Rect } from "./menu";
import type { Pirate } from "../entities/Pirate";

export type PirateFeeMenuAction = "pay" | "close" | null;

/**
 * Cursor popup to pay a pirate's protection fee during their comms window.
 */
export class PirateFeeMenu {
  open = false;
  pirate: Pirate | null = null;
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private payBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  show(
    pirate: Pirate,
    cursorX: number,
    cursorY: number,
    viewW: number,
    viewH: number,
  ): void {
    this.open = true;
    this.pirate = pirate;
    const w = 160;
    const h = 88;
    let x = cursorX + 8;
    let y = cursorY + 8;
    if (x + w > viewW - 8) x = cursorX - w - 8;
    if (y + h > viewH - 8) y = cursorY - h - 8;
    x = Math.max(8, x);
    y = Math.max(8, y);
    this.panel = { x, y, w, h };
    this.payBtn = { x: x + 12, y: y + 48, w: w - 24, h: 28 };
  }

  hide(): void {
    this.open = false;
    this.pirate = null;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    pointerX: number,
    pointerY: number,
    credits: number,
  ): void {
    if (!this.open || !this.pirate) return;
    drawPanel(ctx, this.panel);
    ctx.font = FONT;
    ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Pirate", this.panel.x + 12, this.panel.y + 10);
    ctx.fillStyle = "rgba(180, 150, 140, 0.9)";
    ctx.fillText(
      `Fee: ${ECONOMY.pirateFee} cr`,
      this.panel.x + 12,
      this.panel.y + 28,
    );

    const canPay = credits >= ECONOMY.pirateFee;
    drawButton(ctx, this.payBtn, `Pay ${ECONOMY.pirateFee} cr`, {
      primary: true,
      enabled: canPay,
      hover: canPay && hit(this.payBtn, pointerX, pointerY),
    });
  }

  handleClick(px: number, py: number): PirateFeeMenuAction {
    if (!this.open) return null;
    if (hit(this.payBtn, px, py)) return "pay";
    if (!hit(this.panel, px, py)) return "close";
    return null;
  }
}
