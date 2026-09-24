import { FONT, drawButton, drawPanel, hit, type Rect } from "./menu";

export type PatrolFineMenuAction = "pay" | "close" | null;

export type PatrolFineKind = "violation" | "unfriendly";

/**
 * Click / warning popup to pay a station fine via a local patrol.
 * Violation → Unfriendly; Unfriendly → Neutral. Hostile cannot pay.
 */
export class PatrolFineMenu {
  open = false;
  stationName = "";
  fine = 0;
  standingLabel = "";
  kind: PatrolFineKind = "unfriendly";
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private payBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  show(
    stationName: string,
    fine: number,
    standingLabel: string,
    kind: PatrolFineKind,
    cursorX: number,
    cursorY: number,
    viewW: number,
    viewH: number,
  ): void {
    this.open = true;
    this.stationName = stationName;
    this.fine = fine;
    this.standingLabel = standingLabel;
    this.kind = kind;
    const w = 220;
    const h = 128;
    let x = cursorX + 8;
    let y = cursorY + 8;
    if (x + w > viewW - 8) x = cursorX - w - 8;
    if (y + h > viewH - 8) y = cursorY - h - 8;
    x = Math.max(8, x);
    y = Math.max(8, y);
    this.panel = { x, y, w, h };
    this.payBtn = { x: x + 12, y: y + 88, w: w - 24, h: 28 };
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
    ctx.fillText("Station patrol", this.panel.x + 12, this.panel.y + 10);
    ctx.fillStyle = "rgba(160, 185, 210, 0.9)";
    ctx.fillText(this.stationName, this.panel.x + 12, this.panel.y + 28);
    ctx.fillStyle = "rgba(190, 170, 140, 0.9)";
    ctx.fillText(
      `Fine: ${this.fine} cr · ${this.standingLabel}`,
      this.panel.x + 12,
      this.panel.y + 46,
    );
    ctx.fillStyle = "rgba(150, 170, 195, 0.85)";
    const outcome =
      this.kind === "violation"
        ? "Pay → Unfriendly (not Neutral)"
        : "Pay → Neutral";
    ctx.fillText(outcome, this.panel.x + 12, this.panel.y + 64);

    const canPay = credits >= this.fine && this.fine > 0;
    drawButton(ctx, this.payBtn, `Pay ${this.fine} cr`, {
      primary: true,
      enabled: canPay,
      hover: canPay && hit(this.payBtn, pointerX, pointerY),
    });
  }

  handleClick(px: number, py: number): PatrolFineMenuAction {
    if (!this.open) return null;
    if (hit(this.payBtn, px, py)) return "pay";
    if (!hit(this.panel, px, py)) return "close";
    return null;
  }
}
