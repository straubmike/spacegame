import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";
import { POI_CHART_COLORS, STAR_COLORS } from "../galaxy/generateLocal";
import type { Galaxy } from "../galaxy/Galaxy";
import type { PoiRef } from "../galaxy/types";

export type GalaxyClickResult = "jump" | "close" | null;

/** Hints for out-of-range selection and quest markers. */
export interface ChartPoiHints {
  /** Selectable even outside jump range (quest targets + visited/scanned). */
  selectableOutOfRange: ReadonlySet<number>;
  /** Active quest destinations — always visually marked. */
  questPoiIds: ReadonlySet<number>;
}

const EMPTY_HINTS: ChartPoiHints = {
  selectableOutOfRange: new Set(),
  questPoiIds: new Set(),
};

/**
 * Galaxy map menu: open with G, click a target, click Jump.
 * Quest / visited / scanned POIs stay selectable with full footer info
 * even when outside jump range (Jump stays disabled until in range).
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

    const current = galaxy.get(currentId);
    const layout = this.layout(galaxy, this.mapRect);
    const hoverId = this.pickPoi(galaxy, pointerX, pointerY, layout);

    // Map backdrop
    ctx.fillStyle = "rgba(4, 8, 14, 0.65)";
    ctx.fillRect(this.mapRect.x, this.mapRect.y, this.mapRect.w, this.mapRect.h);
    ctx.strokeStyle = "rgba(100, 130, 170, 0.25)";
    ctx.strokeRect(this.mapRect.x, this.mapRect.y, this.mapRect.w, this.mapRect.h);

    const cur = this.toScreen(current.chartX, current.chartY, layout);
    ctx.beginPath();
    ctx.arc(cur.x, cur.y, jumpRange * layout.scale, 0, Math.PI * 2);
    ctx.strokeStyle = "rgba(100, 180, 255, 0.3)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([5, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    for (const poi of galaxy.pois) {
      const p = this.toScreen(poi.chartX, poi.chartY, layout);
      if (
        p.x < this.mapRect.x - 8 ||
        p.y < this.mapRect.y - 8 ||
        p.x > this.mapRect.x + this.mapRect.w + 8 ||
        p.y > this.mapRect.y + this.mapRect.h + 8
      ) {
        continue;
      }
      const inRange =
        poi.id === currentId || galaxy.distance(current, poi) <= jumpRange;
      const known = hints.selectableOutOfRange.has(poi.id);
      const isQuest = hints.questPoiIds.has(poi.id);
      const selected = poi.id === this.selectedId;
      const hovered = poi.id === hoverId;
      const color = inRange
        ? poiFill(poi)
        : known || isQuest
          ? fadedPoiFill(poi)
          : "rgba(90, 100, 120, 0.45)";
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

    // Footer
    const footerY = panel.y + panel.h - footerH;
    ctx.font = FONT;
    ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
    ctx.textBaseline = "middle";

    let status = current.name;
    let canJump = false;
    if (this.selectedId !== null) {
      const sel = galaxy.get(this.selectedId);
      const dist = galaxy.distance(current, sel);
      canJump = this.selectedId !== currentId && dist <= jumpRange;
      const questTag = hints.questPoiIds.has(this.selectedId) ? "  ·  quest" : "";
      const knownTag =
        !canJump &&
        this.selectedId !== currentId &&
        hints.selectableOutOfRange.has(this.selectedId) &&
        !hints.questPoiIds.has(this.selectedId)
          ? "  ·  known"
          : "";
      status = canJump
        ? `${sel.name}  ·  ${dist.toFixed(1)} ly${questTag}`
        : `${sel.name}  ·  ${dist.toFixed(1)} ly  ·  out of range${questTag}${knownTag}`;
    }
    ctx.fillText(status, panel.x + 24, footerY + footerH / 2);

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
    const id = this.pickPoi(galaxy, px, py, layout);
    if (id === null) {
      this.selectedId = null;
      return null;
    }
    if (id === currentId) {
      this.selectedId = null;
      return null;
    }
    const current = galaxy.get(currentId);
    const target = galaxy.get(id);
    const inRange = galaxy.distance(current, target) <= jumpRange;
    const selectable =
      inRange ||
      hints.selectableOutOfRange.has(id) ||
      hints.questPoiIds.has(id);
    if (selectable) {
      this.selectedId = id;
    }
    return null;
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
  ): number | null {
    const hitR = 14;
    let best: PoiRef | null = null;
    let bestDist = hitR;
    for (const poi of galaxy.pois) {
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

/** Dimmed but readable fill for known / quest POIs outside jump range. */
function fadedPoiFill(poi: PoiRef): string {
  const base = poiFill(poi);
  // Soften via overlay — keep hue recognizable for quest identification.
  if (base.startsWith("#") && (base.length === 7 || base.length === 4)) {
    return base.length === 7 ? `${base}cc` : base;
  }
  return "rgba(160, 175, 200, 0.75)";
}
