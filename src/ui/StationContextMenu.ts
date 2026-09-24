import { FONT, drawButton, drawPanel, hit, type Rect } from "./menu";
import type { Landmark } from "../galaxy/types";

export type StationMenuAction = "hail" | "dock" | "settle" | "close" | null;

/** Dual-path Violation settle offer (standing fine or scan debt). */
export type StationSettleOffer = {
  /** Credits due (standing fine, or scan-debt shortfall fee). */
  credits: number;
  /** CU confiscated on scan-debt settle (0 for standing fine). */
  handOverCu: number;
  /** True when settling knownIllegalDebt rather than a standing fine. */
  scanDebt: boolean;
};

/**
 * Small cursor-anchored menu for a clicked station.
 * Dock stays disabled until the station has granted clearance via Hail.
 * While Violation, a Settle / pay-fine button appears (same rules as patrol click;
 * offered even when a host patrol is present — dual redemption path).
 */
export class StationContextMenu {
  open = false;
  station: Landmark | null = null;
  /** Cleared for approach — Game sets each frame / after hail. */
  dockEnabled = false;
  /**
   * Violation settle offer. null / credits≤0 with no scanDebt hides the button.
   * Shown regardless of whether a patrol is present.
   */
  settleOffer: StationSettleOffer | null = null;
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hailBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private settleBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dockBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  show(station: Landmark, cursorX: number, cursorY: number, viewW: number, viewH: number): void {
    this.open = true;
    this.station = station;
    this.dockEnabled = false;
    this.settleOffer = null;
    this.layout(cursorX, cursorY, viewW, viewH);
  }

  /** Recompute button rects when settle offer toggles (panel grows/shrinks). */
  layout(cursorX?: number, cursorY?: number, viewW?: number, viewH?: number): void {
    const showSettle = this.hasSettleButton();
    const w = showSettle ? 188 : 140;
    const h = showSettle ? 128 : 96;
    let x = this.panel.x;
    let y = this.panel.y;
    if (cursorX !== undefined && cursorY !== undefined && viewW !== undefined && viewH !== undefined) {
      x = cursorX + 8;
      y = cursorY + 8;
      if (x + w > viewW - 8) x = cursorX - w - 8;
      if (y + h > viewH - 8) y = cursorY - h - 8;
      x = Math.max(8, x);
      y = Math.max(8, y);
    } else {
      // Keep top-left; clamp if panel grew past the prior edge.
      if (viewW !== undefined && x + w > viewW - 8) x = Math.max(8, viewW - 8 - w);
      if (viewH !== undefined && y + h > viewH - 8) y = Math.max(8, viewH - 8 - h);
    }
    this.panel = { x, y, w, h };
    this.hailBtn = { x: x + 12, y: y + 36, w: w - 24, h: 24 };
    if (showSettle) {
      this.settleBtn = { x: x + 12, y: y + 64, w: w - 24, h: 24 };
      this.dockBtn = { x: x + 12, y: y + 92, w: w - 24, h: 24 };
    } else {
      this.settleBtn = { x: 0, y: 0, w: 0, h: 0 };
      this.dockBtn = { x: x + 12, y: y + 64, w: w - 24, h: 24 };
    }
  }

  private hasSettleButton(): boolean {
    if (!this.settleOffer) return false;
    if (this.settleOffer.scanDebt) return true;
    return this.settleOffer.credits > 0;
  }

  /**
   * Offer / refresh the Violation settle amount; relayout when visibility changes.
   * @deprecated Prefer setSettleOffer — kept as a thin wrapper for standing fines.
   */
  setSettleFine(fine: number): void {
    if (fine <= 0) {
      this.setSettleOffer(null);
      return;
    }
    this.setSettleOffer({ credits: fine, handOverCu: 0, scanDebt: false });
  }

  setSettleOffer(offer: StationSettleOffer | null): void {
    const wasShown = this.hasSettleButton();
    this.settleOffer = offer
      ? {
          credits: Math.max(0, Math.floor(offer.credits)),
          handOverCu: Math.max(0, Math.floor(offer.handOverCu)),
          scanDebt: offer.scanDebt,
        }
      : null;
    const willShow = this.hasSettleButton();
    if (wasShown !== willShow) {
      this.layout();
    }
  }

  hide(): void {
    this.open = false;
    this.station = null;
    this.dockEnabled = false;
    this.settleOffer = null;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    pointerX: number,
    pointerY: number,
    credits: number,
  ): void {
    if (!this.open || !this.station) return;
    drawPanel(ctx, this.panel);
    ctx.font = FONT;
    ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
    ctx.textBaseline = "top";
    const name =
      this.station.name.length > 16
        ? `${this.station.name.slice(0, 15)}…`
        : this.station.name;
    ctx.fillText(name, this.panel.x + 12, this.panel.y + 10);

    drawButton(ctx, this.hailBtn, "Hail", {
      hover: hit(this.hailBtn, pointerX, pointerY),
    });

    if (this.hasSettleButton() && this.settleOffer) {
      const fee = this.settleOffer.credits;
      const canSettle = this.settleOffer.scanDebt
        ? credits >= fee
        : credits >= fee && fee > 0;
      let label: string;
      if (this.settleOffer.scanDebt) {
        if (fee > 0 && this.settleOffer.handOverCu > 0) {
          label = `Settle ${fee} cr`;
        } else if (fee > 0) {
          label = `Settle ${fee} cr`;
        } else {
          label = "Turn in & settle";
        }
      } else {
        label = `Settle ${fee} cr`;
      }
      drawButton(ctx, this.settleBtn, label, {
        primary: true,
        enabled: canSettle,
        hover: canSettle && hit(this.settleBtn, pointerX, pointerY),
      });
    }

    drawButton(ctx, this.dockBtn, "Dock", {
      primary: this.dockEnabled,
      enabled: this.dockEnabled,
      hover: this.dockEnabled && hit(this.dockBtn, pointerX, pointerY),
    });
  }

  handleClick(px: number, py: number): StationMenuAction {
    if (!this.open) return null;
    if (hit(this.hailBtn, px, py)) return "hail";
    if (this.hasSettleButton() && hit(this.settleBtn, px, py)) return "settle";
    if (hit(this.dockBtn, px, py)) {
      return this.dockEnabled ? "dock" : null;
    }
    if (!hit(this.panel, px, py)) return "close";
    return null;
  }
}
