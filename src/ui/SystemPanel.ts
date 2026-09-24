import type { LocalView, SystemBodyRef } from "../galaxy/types";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type SystemClickResult = "travel" | "close" | null;

/**
 * System map menu: open with M, click a body, click Travel.
 */
export class SystemPanel {
  selectedBodyId: number | null = null;

  private rowRects: Rect[] = [];
  private travelBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private bodyIds: number[] = [];

  draw(
    ctx: CanvasRenderingContext2D,
    local: LocalView,
    width: number,
    height: number,
    pointerX: number,
    pointerY: number,
  ): void {
    // Dim flight view behind menu
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);

    const panelW = 420;
    const bodies = local.systemBodies;
    const rowH = 36;
    const headerH = 56;
    const footerH = 64;
    const listH = bodies ? bodies.length * rowH : 80;
    const panelH = Math.min(headerH + listH + footerH + 16, height - 48);
    const panel: Rect = {
      x: Math.floor((width - panelW) / 2),
      y: Math.floor((height - panelH) / 2),
      w: panelW,
      h: panelH,
    };
    drawPanel(ctx, panel);

    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    const title =
      local.poiType === "starSystem"
        ? `System  ·  ${local.poiName}`
        : local.locationName;
    ctx.fillText(title, panel.x + 20, panel.y + 18);

    this.rowRects = [];
    this.bodyIds = [];

    if (!bodies) {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(170, 190, 220, 0.85)";
      ctx.fillText(
        local.blurb ?? "No destinations here.",
        panel.x + 20,
        panel.y + headerH,
      );
      // wrap-ish truncate
      this.travelBtn = { x: 0, y: 0, w: 0, h: 0 };
      this.closeBtn = {
        x: panel.x + panel.w - 120,
        y: panel.y + panel.h - 50,
        w: 88,
        h: 36,
      };
      drawButton(ctx, this.closeBtn, "Close", {
        hover: hit(this.closeBtn, pointerX, pointerY),
      });
      return;
    }

    if (local.starClass) {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(150, 175, 210, 0.75)";
      ctx.fillText(`${local.starClass}-class`, panel.x + panel.w - 100, panel.y + 22);
    }

    let y = panel.y + headerH;
    const maxY = panel.y + panel.h - footerH;

    bodies.forEach((body) => {
      if (y + rowH > maxY) return;
      const row: Rect = {
        x: panel.x + 12,
        y,
        w: panel.w - 24,
        h: rowH - 4,
      };
      this.rowRects.push(row);
      this.bodyIds.push(body.id);

      const selected = body.id === this.selectedBodyId;
      const here = body.id === local.bodyId;
      const hovered = hit(row, pointerX, pointerY);

      if (selected) {
        ctx.fillStyle = "rgba(60, 120, 180, 0.35)";
        ctx.fillRect(row.x, row.y, row.w, row.h);
      } else if (hovered) {
        ctx.fillStyle = "rgba(40, 60, 90, 0.45)";
        ctx.fillRect(row.x, row.y, row.w, row.h);
      }

      ctx.font = FONT;
      ctx.fillStyle = selected
        ? "rgba(230, 240, 255, 0.98)"
        : "rgba(190, 205, 225, 0.9)";
      ctx.textBaseline = "middle";
      const suffix = here
        ? "  ·  here"
        : body.kind === "asteroidBelt"
          ? "  ·  belt"
          : body.stationCount > 0
            ? "  ·  station"
            : "";
      ctx.fillText(body.name + suffix, row.x + 12, row.y + row.h / 2);
      y += rowH;
    });

    const canTravel =
      this.selectedBodyId !== null && this.selectedBodyId !== local.bodyId;

    this.travelBtn = {
      x: panel.x + panel.w - 220,
      y: panel.y + panel.h - 50,
      w: 88,
      h: 36,
    };
    this.closeBtn = {
      x: panel.x + panel.w - 120,
      y: panel.y + panel.h - 50,
      w: 88,
      h: 36,
    };

    drawButton(ctx, this.travelBtn, "Travel", {
      primary: true,
      enabled: canTravel,
      hover: hit(this.travelBtn, pointerX, pointerY),
    });
    drawButton(ctx, this.closeBtn, "Close", {
      hover: hit(this.closeBtn, pointerX, pointerY),
    });
  }

  handleClick(local: LocalView, px: number, py: number): SystemClickResult {
    if (hit(this.closeBtn, px, py)) return "close";

    const canTravel =
      this.selectedBodyId !== null && this.selectedBodyId !== local.bodyId;
    if (hit(this.travelBtn, px, py) && this.travelBtn.w > 0) {
      return canTravel ? "travel" : null;
    }

    for (let i = 0; i < this.rowRects.length; i += 1) {
      if (hit(this.rowRects[i]!, px, py)) {
        this.selectedBodyId = this.bodyIds[i]!;
        return null;
      }
    }
    return null;
  }

  selectedBody(bodies: SystemBodyRef[] | null): SystemBodyRef | null {
    if (!bodies || this.selectedBodyId === null) return null;
    return bodies.find((b) => b.id === this.selectedBodyId) ?? null;
  }
}
