import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";
import { POI_CHART_COLORS, STAR_COLORS } from "../galaxy/generateLocal";
import type { Galaxy } from "../galaxy/Galaxy";
import type { PoiRef } from "../galaxy/types";
import type { ChartReveal } from "../ship/chartCatalog";
import { jumpReachLy } from "../ship/fuel";

export type GalaxyClickResult = "jump" | "close" | null;

/**
 * Fog-of-war chart hints (per-player catalog).
 * Hidden POIs are never drawn; fuel still gates Jump separately.
 */
export interface ChartPoiHints {
  /** Visited POIs — colored icons; Station + letters + name + distance + fuel on select. */
  visitedPoiIds: ReadonlySet<number>;
  /**
   * Identified (in-range neighbors of visited + mission grants).
   * Grey icon; name on select. May include visited ids.
   */
  identifiedPoiIds: ReadonlySet<number>;
  /** Active mission destinations — amber ring when visible. */
  questPoiIds: ReadonlySet<number>;
  /** Deduped station menu letters for the current selection (visited only). */
  selectedMenuLetters: readonly string[];
}

const EMPTY_HINTS: ChartPoiHints = {
  visitedPoiIds: new Set(),
  identifiedPoiIds: new Set(),
  questPoiIds: new Set(),
  selectedMenuLetters: [],
};

const LETTER_COLOR = "rgba(120, 220, 170, 0.95)";
/** Unvisited identified neighbors / mission grants — shape only, no type color. */
const IDENTIFIED_GREY = "rgba(130, 140, 155, 0.9)";
/** Fuel-now reach — bright cyan, short dashes. Not the solid selection ring. */
const NOW_REACH_STROKE = "rgba(150, 220, 255, 0.95)";
const NOW_REACH_DASH = [5, 4];
const NOW_REACH_WIDTH = 2;
/** Full-tank reach — violet, long dashes. Not the amber mission ring ([3, 3]). */
const MAX_REACH_STROKE = "rgba(198, 154, 255, 0.95)";
const MAX_REACH_DASH = [12, 6];
const MAX_REACH_WIDTH = 1.5;

/**
 * Galaxy map menu: open with G, click a target, click Jump.
 * Fog-of-war: only visited / identified POIs appear. No full-galaxy fade.
 * Two unfilled dashed rings mark jump reach from the current system: fuel now,
 * and a full tank. Mission targets may be granted identified visibility.
 * Icons: visited = star-class / POI type color; identified-only = grey.
 */
export class GalaxyChart {
  selectedId: number | null = null;

  private jumpBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private mapRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  draw(
    ctx: CanvasRenderingContext2D,
    galaxy: Galaxy,
    currentId: number,
    width: number,
    height: number,
    pointerX: number,
    pointerY: number,
    jumpRange: number,
    hints: ChartPoiHints = EMPTY_HINTS,
    fuelInfo: {
      fuel: number;
      maxFuel: number;
      costForSelected: number | null;
    } = {
      fuel: 0,
      maxFuel: 0,
      costForSelected: null,
    },
  ): void {
    const margin = Math.max(40, Math.min(width, height) * 0.06);
    const panel: Rect = {
      x: margin,
      y: margin,
      w: width - margin * 2,
      h: height - margin * 2,
    };
    drawPanel(ctx, panel);

    const headerH = 52;
    const footerH = 64;
    this.mapRect = {
      x: panel.x + 20,
      y: panel.y + headerH,
      w: panel.w - 40,
      h: panel.h - headerH - footerH - 12,
    };
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Galaxy", panel.x + 24, panel.y + 18);
    ctx.font = FONT;
    ctx.fillStyle = "rgba(160, 190, 160, 0.85)";
    ctx.fillText(
      `Fuel ${Math.floor(fuelInfo.fuel)}`,
      panel.x + panel.w - 120,
      panel.y + 22,
    );

    const current = galaxy.get(currentId);
    const layout = this.layout(galaxy, this.mapRect);
    const hoverId = this.pickPoi(galaxy, pointerX, pointerY, layout, hints);

    // Map backdrop
    ctx.fillStyle = "rgba(4, 8, 14, 0.65)";
    ctx.fillRect(this.mapRect.x, this.mapRect.y, this.mapRect.w, this.mapRect.h);
    ctx.strokeStyle = "rgba(100, 130, 170, 0.25)";
    ctx.strokeRect(this.mapRect.x, this.mapRect.y, this.mapRect.w, this.mapRect.h);

    const here = this.toScreen(current.chartX, current.chartY, layout);
    this.drawReachRings(
      ctx,
      here.x,
      here.y,
      jumpReachLy(fuelInfo.fuel, jumpRange) * layout.scale,
      jumpReachLy(fuelInfo.maxFuel, jumpRange) * layout.scale,
    );

    for (const poi of galaxy.pois) {
      const reveal = this.revealFor(poi.id, currentId, hints);
      if (reveal === "hidden") continue;

      const p = this.toScreen(poi.chartX, poi.chartY, layout);
      if (
        p.x < this.mapRect.x - 8 ||
        p.y < this.mapRect.y - 8 ||
        p.x > this.mapRect.x + this.mapRect.w + 8 ||
        p.y > this.mapRect.y + this.mapRect.h + 8
      ) {
        continue;
      }
      const isQuest = hints.questPoiIds.has(poi.id);
      const selected = poi.id === this.selectedId;
      const hovered = poi.id === hoverId;
      // Visited (incl. current): designed type/star colors. Identified fog edge: grey.
      const color = reveal === "visited" ? poiFill(poi) : IDENTIFIED_GREY;
      const scale =
        selected || hovered || poi.id === currentId || isQuest ? 1.4 : 1;
      this.drawMarker(ctx, poi, p.x, p.y, color, scale);

      if (isQuest && poi.id !== currentId) {
        ctx.strokeStyle = "rgba(255, 190, 90, 0.95)";
        ctx.lineWidth = 1.5;
        ctx.setLineDash([3, 3]);
        ctx.beginPath();
        ctx.arc(p.x, p.y, 9, 0, Math.PI * 2);
        ctx.stroke();
        ctx.setLineDash([]);
      }

      if (poi.id === currentId || selected) {
        ctx.strokeStyle =
          poi.id === currentId
            ? "rgba(255,255,255,0.85)"
            : "rgba(120, 210, 255, 0.9)";
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    this.drawReachLegend(ctx);

    // Footer
    const footerY = panel.y + panel.h - footerH;
    ctx.font = FONT;
    ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
    ctx.textBaseline = "middle";

    let status = current.name;
    let canJump = false;
    let statusX = panel.x + 24;
    const statusY = footerY + footerH / 2;

    if (this.selectedId !== null) {
      const sel = galaxy.get(this.selectedId);
      const dist = galaxy.distance(current, sel);
      const inJumpRange =
        this.selectedId !== currentId && dist <= jumpRange;
      canJump = inJumpRange;
      const visited = hints.visitedPoiIds.has(this.selectedId);
      const questTag = hints.questPoiIds.has(this.selectedId)
        ? "  ·  mission"
        : "";

      if (visited) {
        // Station [letters] · name · distance · fuel
        ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
        ctx.fillText("Station", statusX, statusY);
        statusX += ctx.measureText("Station").width;

        if (hints.selectedMenuLetters.length > 0) {
          ctx.fillStyle = LETTER_COLOR;
          const letterBit = ` ${hints.selectedMenuLetters.join("")}`;
          ctx.fillText(letterBit, statusX, statusY);
          statusX += ctx.measureText(letterBit).width;
        }

        const fuelBit =
          fuelInfo.costForSelected !== null
            ? `  ·  ${fuelInfo.costForSelected} fuel`
            : "";
        const rangeBit = inJumpRange ? "" : "  ·  out of range";
        status = `  ${sel.name}  ·  ${dist.toFixed(1)} ly${fuelBit}${rangeBit}${questTag}`;
        ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
        ctx.fillText(status, statusX, statusY);

        if (
          inJumpRange &&
          fuelInfo.costForSelected !== null &&
          fuelInfo.fuel < fuelInfo.costForSelected
        ) {
          const low = "  ·  low fuel";
          statusX += ctx.measureText(status).width;
          ctx.fillText(low, statusX, statusY);
          canJump = false;
        }
      } else {
        // Identified only: icon + name (no distance / fuel / Station).
        status = `${sel.name}${questTag}`;
        ctx.fillText(status, statusX, statusY);
        if (
          inJumpRange &&
          fuelInfo.costForSelected !== null &&
          fuelInfo.fuel < fuelInfo.costForSelected
        ) {
          canJump = false;
        }
      }
    } else {
      ctx.fillText(status, statusX, statusY);
    }

    this.jumpBtn = {
      x: panel.x + panel.w - 220,
      y: footerY + 14,
      w: 88,
      h: 36,
    };
    this.closeBtn = {
      x: panel.x + panel.w - 120,
      y: footerY + 14,
      w: 88,
      h: 36,
    };

    drawButton(ctx, this.jumpBtn, "Jump", {
      primary: true,
      enabled: canJump,
      hover: hit(this.jumpBtn, pointerX, pointerY),
    });
    drawButton(ctx, this.closeBtn, "Close", {
      hover: hit(this.closeBtn, pointerX, pointerY),
    });
  }

  /**
   * Handle a click. Returns an action for Game, or null if only selection changed.
   */
  handleClick(
    galaxy: Galaxy,
    currentId: number,
    px: number,
    py: number,
    jumpRange: number,
    hints: ChartPoiHints = EMPTY_HINTS,
  ): GalaxyClickResult {
    if (hit(this.closeBtn, px, py)) return "close";

    const canJump =
      this.selectedId !== null &&
      this.selectedId !== currentId &&
      galaxy.distance(galaxy.get(currentId), galaxy.get(this.selectedId)) <=
        jumpRange;

    if (hit(this.jumpBtn, px, py)) {
      return canJump ? "jump" : null;
    }

    if (!hit(this.mapRect, px, py)) return null;

    const layout = this.layout(galaxy, this.mapRect);
    const id = this.pickPoi(galaxy, px, py, layout, hints);
    if (id === null) {
      this.selectedId = null;
      return null;
    }
    if (id === currentId) {
      this.selectedId = null;
      return null;
    }
    if (this.revealFor(id, currentId, hints) !== "hidden") {
      this.selectedId = id;
    }
    return null;
  }

  private revealFor(
    poiId: number,
    currentId: number,
    hints: ChartPoiHints,
  ): ChartReveal {
    if (poiId === currentId || hints.visitedPoiIds.has(poiId)) return "visited";
    if (hints.identifiedPoiIds.has(poiId)) return "identified";
    // Mission grants land in identifiedPoiIds; quest ring alone does not reveal.
    return "hidden";
  }

  /**
   * Unfilled dashed reach rings, same center and radii as the jump check.
   * Full tank first, fuel-now on top. No fill, so POIs stay readable.
   */
  private drawReachRings(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    currentR: number,
    maxR: number,
  ): void {
    if (!Number.isFinite(x) || !Number.isFinite(y)) return;
    ctx.save();
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    ctx.lineJoin = "round";
    ctx.lineCap = "butt";
    this.strokeReachRing(
      ctx,
      x,
      y,
      maxR,
      MAX_REACH_STROKE,
      MAX_REACH_DASH,
      MAX_REACH_WIDTH,
    );
    this.strokeReachRing(
      ctx,
      x,
      y,
      currentR,
      NOW_REACH_STROKE,
      NOW_REACH_DASH,
      NOW_REACH_WIDTH,
    );
    ctx.restore();
  }

  private strokeReachRing(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    radius: number,
    stroke: string,
    dash: readonly number[],
    width: number,
  ): void {
    if (!(radius > 0) || !Number.isFinite(radius)) return;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, Math.PI * 2);
    ctx.strokeStyle = stroke;
    ctx.lineWidth = width;
    ctx.setLineDash(dash.slice());
    ctx.stroke();
  }

  private drawReachLegend(ctx: CanvasRenderingContext2D): void {
    const rows = [
      {
        stroke: NOW_REACH_STROKE,
        dash: NOW_REACH_DASH,
        width: NOW_REACH_WIDTH,
        label: "Fuel now",
      },
      {
        stroke: MAX_REACH_STROKE,
        dash: MAX_REACH_DASH,
        width: MAX_REACH_WIDTH,
        label: "Full tank",
      },
    ];
    const x = this.mapRect.x + 10;
    const y0 = this.mapRect.y + 8;
    const rowH = 16;
    ctx.fillStyle = "rgba(8, 12, 20, 0.88)";
    ctx.strokeStyle = "rgba(130, 165, 210, 0.35)";
    ctx.lineWidth = 1;
    ctx.setLineDash([]);
    const boxW = 108;
    const boxH = rowH * rows.length + 6;
    ctx.fillRect(x, y0, boxW, boxH);
    ctx.strokeRect(x, y0, boxW, boxH);

    ctx.font = FONT;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    let y = y0 + 4 + rowH / 2;
    for (const row of rows) {
      ctx.beginPath();
      ctx.moveTo(x + 6, y);
      ctx.lineTo(x + 22, y);
      ctx.strokeStyle = row.stroke;
      ctx.lineWidth = row.width;
      ctx.setLineDash(row.dash.slice());
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
      ctx.fillText(row.label, x + 28, y + 0.5);
      y += rowH;
    }
    ctx.textBaseline = "alphabetic";
    ctx.setLineDash([]);
  }

  private drawMarker(
    ctx: CanvasRenderingContext2D,
    poi: PoiRef,
    x: number,
    y: number,
    color: string,
    scale: number,
  ): void {
    ctx.fillStyle = color;
    ctx.strokeStyle = color;
    const s = 3.2 * scale;

    switch (poi.type) {
      case "starSystem":
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.fill();
        break;
      case "derelict":
        ctx.fillRect(x - s, y - s, s * 2, s * 2);
        break;
      case "neutronStar": {
        // Compact core + faint beam tick
        ctx.beginPath();
        ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.moveTo(x - s * 1.6, y - s * 0.9);
        ctx.lineTo(x + s * 1.6, y + s * 0.9);
        ctx.lineWidth = 1.2;
        ctx.stroke();
        break;
      }
      case "brownDwarf":
        ctx.fillRect(x - s * 1.3, y - s * 0.5, s * 2.6, s);
        break;
      case "roguePlanet":
        ctx.beginPath();
        ctx.arc(x, y, s, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "nebula":
        ctx.beginPath();
        ctx.ellipse(x, y, s * 1.6, s * 0.9, 0.4, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case "blackHole":
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, s * 1.2, 0, Math.PI * 2);
        ctx.stroke();
        ctx.fillStyle = "#05070c";
        ctx.beginPath();
        ctx.arc(x, y, s * 0.55, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
  }

  private layout(
    galaxy: Galaxy,
    map: Rect,
  ): { scale: number; offsetX: number; offsetY: number } {
    // Fit the full world so chart coordinates stay stable as fog expands.
    let minX = Infinity;
    let maxX = -Infinity;
    let minY = Infinity;
    let maxY = -Infinity;
    for (const s of galaxy.pois) {
      minX = Math.min(minX, s.chartX);
      maxX = Math.max(maxX, s.chartX);
      minY = Math.min(minY, s.chartY);
      maxY = Math.max(maxY, s.chartY);
    }
    const pad = 28;
    const spanX = Math.max(1, maxX - minX);
    const spanY = Math.max(1, maxY - minY);
    const scale =
      Math.min((map.w - pad * 2) / spanX, (map.h - pad * 2) / spanY) * 0.92;
    const centerX = (minX + maxX) / 2;
    const centerY = (minY + maxY) / 2;
    return {
      scale,
      offsetX: map.x + map.w / 2 - centerX * scale,
      offsetY: map.y + map.h / 2 - centerY * scale,
    };
  }

  private toScreen(
    chartX: number,
    chartY: number,
    layout: { scale: number; offsetX: number; offsetY: number },
  ): { x: number; y: number } {
    return {
      x: chartX * layout.scale + layout.offsetX,
      y: chartY * layout.scale + layout.offsetY,
    };
  }

  private pickPoi(
    galaxy: Galaxy,
    screenX: number,
    screenY: number,
    layout: { scale: number; offsetX: number; offsetY: number },
    hints: ChartPoiHints,
  ): number | null {
    const hitR = 14;
    let best: PoiRef | null = null;
    let bestDist = hitR;
    for (const poi of galaxy.pois) {
      if (this.revealFor(poi.id, -1, hints) === "hidden") continue;
      const p = this.toScreen(poi.chartX, poi.chartY, layout);
      const d = Math.hypot(p.x - screenX, p.y - screenY);
      if (d < bestDist) {
        bestDist = d;
        best = poi;
      }
    }
    return best?.id ?? null;
  }
}

function poiFill(poi: PoiRef): string {
  if (poi.type === "starSystem" && poi.starClass) {
    return STAR_COLORS[poi.starClass];
  }
  return POI_CHART_COLORS[poi.type];
}
