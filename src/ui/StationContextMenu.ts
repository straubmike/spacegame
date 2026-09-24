import { FONT, drawButton, drawPanel, hit, type Rect } from "./menu";
import type { Landmark } from "../galaxy/types";

export type StationMenuAction = "hail" | "dock" | "close" | null;

/**
 * Small cursor-anchored menu for a clicked station.
 * Dock stays disabled until the station has granted clearance via Hail.
 */
export class StationContextMenu {
  open = false;
  station: Landmark | null = null;
  /** Cleared for approach — Game sets each frame / after hail. */
  dockEnabled = false;
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hailBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private dockBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  show(station: Landmark, cursorX: number, cursorY: number, viewW: number, viewH: number): void {
    this.open = true;
    this.station = station;
    this.dockEnabled = false;
    const w = 140;
    const h = 96;
    let x = cursorX + 8;
    let y = cursorY + 8;
    if (x + w > viewW - 8) x = cursorX - w - 8;
    if (y + h > viewH - 8) y = cursorY - h - 8;
    x = Math.max(8, x);
    y = Math.max(8, y);
    this.panel = { x, y, w, h };
    this.hailBtn = { x: x + 12, y: y + 36, w: w - 24, h: 24 };
    this.dockBtn = { x: x + 12, y: y + 64, w: w - 24, h: 24 };
  }

  hide(): void {
    this.open = false;
    this.station = null;
    this.dockEnabled = false;
  }

  draw(ctx: CanvasRenderingContext2D, pointerX: number, pointerY: number): void {
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
    drawButton(ctx, this.dockBtn, "Dock", {
      primary: this.dockEnabled,
      enabled: this.dockEnabled,
      hover: this.dockEnabled && hit(this.dockBtn, pointerX, pointerY),
    });
  }

  handleClick(px: number, py: number): StationMenuAction {
    if (!this.open) return null;
    if (hit(this.hailBtn, px, py)) return "hail";
    if (hit(this.dockBtn, px, py)) {
      return this.dockEnabled ? "dock" : null;
    }
    if (!hit(this.panel, px, py)) return "close";
    return null;
  }
}
