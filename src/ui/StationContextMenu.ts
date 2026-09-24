import { FONT, drawButton, drawPanel, hit, type Rect } from "./menu";
import type { Landmark } from "../galaxy/types";

export type StationMenuAction = "hail" | "dock" | "settle" | "close" | null;

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
   * Standing-scaled fine credits while Violation.
   * 0 = hide settle button. Shown regardless of whether a patrol is present.
   */
  settleFine = 0;
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hailBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private settleBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dockBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  show(station: Landmark, cursorX: number, cursorY: number, viewW: number, viewH: number): void {
    this.open = true;
    this.station = station;
    this.dockEnabled = false;
    this.settleFine = 0;
    this.layout(cursorX, cursorY, viewW, viewH);
  }

  /** Recompute button rects when settleFine toggles (panel grows/shrinks). */
  layout(cursorX?: number, cursorY?: number, viewW?: number, viewH?: number): void {
    const showSettle = this.settleFine > 0;
    const w = showSettle ? 168 : 140;
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

  /** Offer / refresh the Violation settle amount; relayout when visibility changes. */
  setSettleFine(fine: number): void {
    const next = Math.max(0, Math.floor(fine));
    const wasShown = this.settleFine > 0;
    const willShow = next > 0;
    this.settleFine = next;
    if (wasShown !== willShow) {
      this.layout();
    }
  }

  hide(): void {
    this.open = false;
    this.station = null;
    this.dockEnabled = false;
    this.settleFine = 0;
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

    if (this.settleFine > 0) {
      const canSettle = credits >= this.settleFine;
      drawButton(ctx, this.settleBtn, `Settle ${this.settleFine} cr`, {
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
    if (this.settleFine > 0 && hit(this.settleBtn, px, py)) return "settle";
    if (hit(this.dockBtn, px, py)) {
      return this.dockEnabled ? "dock" : null;
    }
    if (!hit(this.panel, px, py)) return "close";
    return null;
  }
}
