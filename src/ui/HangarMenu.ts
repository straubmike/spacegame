import {
  formatSlotLayout,
  hangarSaleStock,
  hullById,
  type HullDef,
} from "../ship/hulls";
import type { Fleet, OwnedShipSnapshot } from "../ship/Fleet";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type HangarClickResult =
  | "close"
  | { action: "buy"; hullId: string }
  | { action: "board"; instanceId: string }
  | null;

type ListRow =
  | { kind: "owned"; ship: OwnedShipSnapshot; hull: HullDef }
  | { kind: "sale"; hull: HullDef };

/**
 * Station hangar — browse owned hulls, buy catalog hulls, swap the active ship.
 */
export class HangarMenu {
  open = false;
  stationName = "";
  private selectedIndex = 0;
  private rows: ListRow[] = [];
  private rowRects: Rect[] = [];
  private actionBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  show(stationName: string): void {
    this.open = true;
    this.stationName = stationName;
    this.selectedIndex = 0;
  }

  hide(): void {
    this.open = false;
    this.rows = [];
    this.rowRects = [];
  }

  draw(
    ctx: CanvasRenderingContext2D,
    fleet: Fleet,
    credits: number,
    activeHullName: string,
    width: number,
    height: number,
    pointerX: number,
    pointerY: number,
  ): void {
    if (!this.open) return;

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);

    const panelW = Math.min(760, width - 40);
    const panelH = Math.min(520, height - 40);
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
    ctx.fillText("Hangar", panel.x + 20, panel.y + 16);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(150, 175, 210, 0.8)";
    ctx.fillText(this.stationName, panel.x + 20, panel.y + 40);
    ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
    ctx.fillText(
      `CR ${credits}   ·   Active ${activeHullName}`,
      panel.x + panel.w - 300,
      panel.y + 22,
    );

    this.rows = this.buildRows(fleet);
    if (this.selectedIndex >= this.rows.length) this.selectedIndex = 0;

    const listX = panel.x + 16;
    const listY = panel.y + 68;
    const listW = 220;
    const footerY = panel.y + panel.h - 50;
    const rowH = 48;

    this.rowRects = [];
    this.rows.forEach((row, i) => {
      const rect: Rect = {
        x: listX,
        y: listY + i * rowH,
        w: listW,
        h: rowH - 6,
      };
      this.rowRects.push(rect);
      const selected = i === this.selectedIndex;
      const hovered = hit(rect, pointerX, pointerY);

      if (selected) ctx.fillStyle = "rgba(50, 110, 170, 0.45)";
      else if (hovered) ctx.fillStyle = "rgba(40, 55, 75, 0.55)";
      else ctx.fillStyle = "rgba(20, 28, 40, 0.55)";
      ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
      ctx.strokeStyle = selected
        ? "rgba(140, 200, 255, 0.65)"
        : "rgba(90, 115, 145, 0.35)";
      ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

      ctx.font = FONT;
      ctx.textBaseline = "top";
      const title =
        row.kind === "owned"
          ? row.ship.instanceId === fleet.activeInstanceId
            ? `${row.hull.name} ★`
            : row.hull.name
          : row.hull.name;
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.fillText(title, rect.x + 10, rect.y + 8);
      ctx.fillStyle = "rgba(150, 170, 200, 0.8)";
      const sub =
        row.kind === "owned"
          ? `Owned · ${row.hull.specialty}`
          : `${row.hull.price} cr · ${row.hull.specialty}`;
      ctx.fillText(sub, rect.x + 10, rect.y + 26);
    });

    const detailX = listX + listW + 18;
    const detailW = panel.x + panel.w - 16 - detailX;
    const selected = this.rows[this.selectedIndex] ?? null;
    this.drawDetail(ctx, detailX, listY, detailW, footerY - listY - 56, selected, fleet);

    this.actionBtn = { x: 0, y: 0, w: 0, h: 0 };
    if (selected) {
      const { label, enabled } = this.actionState(selected, fleet, credits);
      this.actionBtn = {
        x: detailX,
        y: footerY - 4,
        w: Math.min(220, detailW),
        h: 36,
      };
      drawButton(ctx, this.actionBtn, label, {
        primary: enabled,
        enabled,
        hover: enabled && hit(this.actionBtn, pointerX, pointerY),
      });
    }

    this.closeBtn = {
      x: panel.x + panel.w - 120,
      y: footerY,
      w: 88,
      h: 36,
    };
    drawButton(ctx, this.closeBtn, "Close", {
      hover: hit(this.closeBtn, pointerX, pointerY),
    });
  }

  private buildRows(fleet: Fleet): ListRow[] {
    const rows: ListRow[] = [];
    for (const ship of fleet.owned) {
      const hull = hullById(ship.hullId);
      if (hull) rows.push({ kind: "owned", ship, hull });
    }
    for (const hull of hangarSaleStock()) {
      if (!fleet.ownsHullType(hull.id)) {
        rows.push({ kind: "sale", hull });
      }
    }
    return rows;
  }

  private drawDetail(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    _maxH: number,
    row: ListRow | null,
    fleet: Fleet,
  ): void {
    if (!row) {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
      ctx.textBaseline = "top";
      ctx.fillText("Select a hull.", x, y);
      return;
    }

    const hull = row.hull;
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText(hull.name, x, y);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(160, 190, 220, 0.9)";
    ctx.fillText(
      `${hull.specialty}  ·  ${formatSlotLayout(hull)}`,
      x,
      y + 26,
    );

    ctx.fillStyle = "rgba(140, 160, 190, 0.85)";
    const blurbLines = wrapText(hull.blurb, Math.max(24, Math.floor(w / 7)));
    let by = y + 52;
    for (const line of blurbLines.slice(0, 4)) {
      ctx.fillText(line, x, by);
      by += 16;
    }

    by += 12;
    const stats: [string, string][] = [
      ["Base hull", `${hull.baseHull} HP`],
      ["Base cargo", `${hull.baseCargo} CU`],
      ["Jump bonus", hull.jumpRangeBonus > 0 ? `+${hull.jumpRangeBonus} ly` : "—"],
      ["Size", `${hull.size}`],
    ];
    if (row.kind === "owned") {
      stats.push([
        "Status",
        row.ship.instanceId === fleet.activeInstanceId ? "Active in flight" : "In hangar",
      ]);
      stats.push([
        "Condition",
        `HP ${Math.ceil(row.ship.health)}  ·  CU ${row.ship.cargo.usedCu}/${row.ship.cargo.capacityCu}`,
      ]);
    } else {
      stats.push(["Price", `${hull.price} cr`]);
    }

    for (const [label, value] of stats) {
      ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
      ctx.fillText(`${label}  ${value}`, x, by);
      by += 18;
    }
  }

  private actionState(
    row: ListRow,
    fleet: Fleet,
    credits: number,
  ): { label: string; enabled: boolean } {
    if (row.kind === "owned") {
      if (row.ship.instanceId === fleet.activeInstanceId) {
        return { label: "Active", enabled: false };
      }
      return { label: "Board", enabled: true };
    }
    if (credits < row.hull.price) {
      return { label: `Need ${row.hull.price} cr`, enabled: false };
    }
    return { label: `Buy (−${row.hull.price} cr)`, enabled: true };
  }

  handleClick(fleet: Fleet, credits: number, px: number, py: number): HangarClickResult {
    if (!this.open) return null;
    if (hit(this.closeBtn, px, py)) return "close";

    for (let i = 0; i < this.rowRects.length; i += 1) {
      if (hit(this.rowRects[i]!, px, py) && this.rows[i]) {
        this.selectedIndex = i;
        return null;
      }
    }

    if (hit(this.actionBtn, px, py)) {
      const row = this.rows[this.selectedIndex];
      if (!row) return null;
      if (row.kind === "owned") {
        if (row.ship.instanceId === fleet.activeInstanceId) return null;
        return { action: "board", instanceId: row.ship.instanceId };
      }
      if (credits < row.hull.price) return null;
      return { action: "buy", hullId: row.hull.id };
    }

    return null;
  }
}

function wrapText(text: string, maxChars: number): string[] {
  const words = text.split(/\s+/);
  const lines: string[] = [];
  let cur = "";
  for (const word of words) {
    const next = cur ? `${cur} ${word}` : word;
    if (next.length > maxChars && cur) {
      lines.push(cur);
      cur = word;
    } else {
      cur = next;
    }
  }
  if (cur) lines.push(cur);
  return lines;
}
