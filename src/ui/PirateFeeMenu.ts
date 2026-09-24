import { ECONOMY } from "../game/config";
import { FONT, drawButton, drawPanel, hit, type Rect } from "./menu";

export type PirateFeeMenuAction = "pay" | "close" | null;

/**
 * One popup for the whole pirate encounter (pack or lone ship).
 * Fee / title come from the shared pack event — not from individual hulls.
 */
export class PirateFeeMenu {
  open = false;
  /** Shared pack tribute. */
  fee: number = ECONOMY.pirateFee;
  /** True when more than one ship is in the encounter. */
  isPack = false;
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private payBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  show(
    fee: number,
    isPack: boolean,
    cursorX: number,
    cursorY: number,
    viewW: number,
    viewH: number,
  ): void {
    this.open = true;
    this.fee = fee;
    this.isPack = isPack;
    const w = 176;
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
  }

  draw(
    ctx: CanvasRenderingContext2D,
    pointerX: number,
    pointerY: number,
    credits: number,
  ): void {
    if (!this.open) return;
    drawPanel(ctx, this.panel);
    ctx.font = FONT;
    ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText(
      this.isPack ? "Pirate pack" : "Pirate",
      this.panel.x + 12,
      this.panel.y + 10,
    );
    ctx.fillStyle = "rgba(180, 150, 140, 0.9)";
    ctx.fillText(
      `Fee: ${this.fee} cr`,
      this.panel.x + 12,
      this.panel.y + 28,
    );

    const canPay = credits >= this.fee;
    drawButton(ctx, this.payBtn, `Pay ${this.fee} cr`, {
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
