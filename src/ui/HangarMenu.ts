import {
  formatSlotLayout,
  hangarSaleStock,
  hullById,
  type HullDef,
} from "../ship/hulls";
import { moduleById } from "../ship/equipment";
import type { Fleet, OwnedShipSnapshot } from "../ship/Fleet";
import { isMissionCargoId, isStolenCargoId } from "../ship/missions";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type HangarClickResult =
  | "close"
  | { action: "buy"; hullId: string }
  | { action: "board"; instanceId: string }
  | null;

type ListRow =
  | { kind: "header"; label: string }
  | { kind: "owned"; ship: OwnedShipSnapshot; hull: HullDef }
  | { kind: "sale"; hull: HullDef };

/**
 * Station hangar — browse owned hulls (modules + cargo), buy catalog hulls,
 * swap the active ship.
 */
export class HangarMenu {
  open = false;
  stationName = "";
  private selectedIndex = 0;
  private rows: ListRow[] = [];
  private rowRects: Rect[] = [];
  private actionBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private detailScroll = 0;
  private detailMaxScroll = 0;
  private detailListRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  show(stationName: string): void {
    this.open = true;
    this.stationName = stationName;
    this.selectedIndex = 0;
    this.detailScroll = 0;
  }

  hide(): void {
    this.open = false;
    this.rows = [];
    this.rowRects = [];
    this.detailScroll = 0;
    this.detailMaxScroll = 0;
  }

  /** Wheel over the detail pane scrolls modules/cargo lists. */
  handleWheel(deltaY: number, pointerX: number, pointerY: number): boolean {
    if (!this.open || this.detailMaxScroll <= 0) return false;
    if (!hit(this.detailListRect, pointerX, pointerY)) return false;
    this.detailScroll = Math.min(
      this.detailMaxScroll,
      Math.max(0, this.detailScroll + deltaY * 0.5),
    );
    return true;
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

    const panelW = Math.min(820, width - 40);
    const panelH = Math.min(580, height - 40);
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
    if (
      this.selectedIndex >= this.rows.length ||
      this.rows[this.selectedIndex]?.kind === "header"
    ) {
      this.selectedIndex = this.rows.findIndex(
        (r) => r.kind === "owned" || r.kind === "sale",
      );
      if (this.selectedIndex < 0) this.selectedIndex = 0;
    }

    const listX = panel.x + 16;
    const listY = panel.y + 68;
    const listW = 220;
    const footerY = panel.y + panel.h - 50;
    const rowH = 48;
    const headerH = 22;

    this.rowRects = [];
    let yCursor = listY;
    this.rows.forEach((row, i) => {
      if (row.kind === "header") {
        this.rowRects.push({ x: 0, y: 0, w: 0, h: 0 });
        ctx.font = FONT;
        ctx.fillStyle = "rgba(140, 165, 200, 0.85)";
        ctx.textBaseline = "top";
        ctx.fillText(row.label, listX, yCursor);
        yCursor += headerH;
        return;
      }

      const rect: Rect = {
        x: listX,
        y: yCursor,
        w: listW,
        h: rowH - 6,
      };
      this.rowRects.push(rect);
      yCursor += rowH;

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
    const rawSelected = this.rows[this.selectedIndex] ?? null;
    const selected =
      rawSelected && rawSelected.kind !== "header" ? rawSelected : null;
    const detailH = footerY - listY - 56;
    this.detailListRect = { x: detailX, y: listY, w: detailW, h: detailH };
    this.drawDetail(
      ctx,
      detailX,
      listY,
      detailW,
      detailH,
      selected,
      fleet,
    );

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
    const rows: ListRow[] = [{ kind: "header", label: "Owned ships" }];
    for (const ship of fleet.owned) {
      const hull = hullById(ship.hullId);
      if (hull) rows.push({ kind: "owned", ship, hull });
    }
    const sales = hangarSaleStock().filter((h) => !fleet.ownsHullType(h.id));
    if (sales.length > 0) {
      rows.push({ kind: "header", label: "For sale" });
      for (const hull of sales) {
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
    maxH: number,
    row: Exclude<ListRow, { kind: "header" }> | null,
    fleet: Fleet,
  ): void {
    if (!row) {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
      ctx.textBaseline = "top";
      ctx.fillText("Select a hull.", x, y);
      this.detailMaxScroll = 0;
      this.detailScroll = 0;
      return;
    }

    const hull = row.hull;
    const lines: DetailLine[] = [];

    lines.push({ kind: "title", text: hull.name });
    lines.push({
      kind: "muted",
      text: `${hull.specialty}  ·  ${formatSlotLayout(hull)}`,
    });

    const blurbLines = wrapText(hull.blurb, Math.max(24, Math.floor(w / 7)));
    for (const line of blurbLines.slice(0, 3)) {
      lines.push({ kind: "body", text: line });
    }
    lines.push({ kind: "gap" });

    if (row.kind === "owned") {
      const active = row.ship.instanceId === fleet.activeInstanceId;
      lines.push({
        kind: "stat",
        text: `Status  ${active ? "Active in flight" : "Parked in hangar"}`,
      });
      lines.push({
        kind: "stat",
        text: `Condition  HP ${Math.ceil(row.ship.health)}  ·  CU ${row.ship.cargo.usedCu}/${row.ship.cargo.capacityCu}`,
      });
      lines.push({ kind: "gap" });

      lines.push({ kind: "section", text: "Modules" });
      for (const slot of row.ship.loadout.slots) {
        const fitted = slot.equipped?.name ?? "Empty";
        lines.push({
          kind: "slot",
          text: `${slot.label}`,
          value: fitted,
          empty: !slot.equipped,
        });
      }
      lines.push({ kind: "gap" });

      lines.push({
        kind: "section",
        text:
          row.ship.cargo.capacityCu > 0
            ? `Cargo  ${row.ship.cargo.usedCu}/${row.ship.cargo.capacityCu} CU`
            : "Cargo",
      });
      const lots = row.ship.cargo.list();
      if (row.ship.cargo.capacityCu <= 0) {
        lines.push({
          kind: "muted",
          text: "No hold fitted — equip a rack or scoop.",
        });
      } else if (lots.length === 0) {
        lines.push({ kind: "muted", text: "Hold empty." });
      } else {
        for (const lot of lots) {
          const tag = isMissionCargoId(lot.id)
            ? "mission"
            : isStolenCargoId(lot.id)
              ? "stolen"
              : "goods";
          lines.push({
            kind: "cargo",
            text: lot.name,
            value: `${lot.cu} CU`,
            tag,
          });
        }
      }
    } else {
      lines.push({ kind: "stat", text: `Price  ${hull.price} cr` });
      lines.push({
        kind: "stat",
        text: `Base hull  ${hull.baseHull} HP  ·  Base cargo  ${hull.baseCargo} CU`,
      });
      lines.push({
        kind: "stat",
        text:
          hull.fuelCapacityBonus > 0
            ? `Fuel tank  +${hull.fuelCapacityBonus}`
            : "Fuel tank  —",
      });
      lines.push({ kind: "gap" });
      lines.push({ kind: "section", text: "Factory fit" });
      hull.slots.forEach((spec, i) => {
        const modId = hull.defaultLoadout[i] ?? null;
        const name = modId
          ? prettyModuleName(modId)
          : "Empty";
        lines.push({
          kind: "slot",
          text: spec.label,
          value: name,
          empty: !modId,
        });
      });
    }

    const contentH = measureDetailHeight(lines);
    this.detailMaxScroll = Math.max(0, contentH - maxH);
    this.detailScroll = Math.min(
      Math.max(0, this.detailScroll),
      this.detailMaxScroll,
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, w, maxH);
    ctx.clip();

    let by = y - this.detailScroll;
    for (const line of lines) {
      by = drawDetailLine(ctx, x, by, w, line);
    }
    ctx.restore();

    if (this.detailMaxScroll > 0) {
      const trackH = maxH;
      const thumbH = Math.max(24, (maxH / contentH) * trackH);
      const thumbY =
        y + (this.detailScroll / this.detailMaxScroll) * (trackH - thumbH);
      ctx.fillStyle = "rgba(90, 115, 145, 0.35)";
      ctx.fillRect(x + w - 4, y, 3, trackH);
      ctx.fillStyle = "rgba(140, 180, 220, 0.55)";
      ctx.fillRect(x + w - 4, thumbY, 3, thumbH);
    }
  }

  private actionState(
    row: Exclude<ListRow, { kind: "header" }>,
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
      const row = this.rows[i];
      if (!row || row.kind === "header") continue;
      if (hit(this.rowRects[i]!, px, py)) {
        if (this.selectedIndex !== i) {
          this.selectedIndex = i;
          this.detailScroll = 0;
        }
        return null;
      }
    }

    if (hit(this.actionBtn, px, py)) {
      const row = this.rows[this.selectedIndex];
      if (!row || row.kind === "header") return null;
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

type DetailLine =
  | { kind: "title"; text: string }
  | { kind: "muted"; text: string }
  | { kind: "body"; text: string }
  | { kind: "stat"; text: string }
  | { kind: "section"; text: string }
  | { kind: "slot"; text: string; value: string; empty?: boolean }
  | { kind: "cargo"; text: string; value: string; tag: "mission" | "stolen" | "goods" }
  | { kind: "gap" };

function measureDetailHeight(lines: DetailLine[]): number {
  let h = 0;
  for (const line of lines) {
    switch (line.kind) {
      case "title":
        h += 26;
        break;
      case "muted":
      case "body":
      case "stat":
        h += 16;
        break;
      case "section":
        h += 22;
        break;
      case "slot":
      case "cargo":
        h += 20;
        break;
      case "gap":
        h += 10;
        break;
    }
  }
  return h;
}

function drawDetailLine(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  line: DetailLine,
): number {
  ctx.textBaseline = "top";
  switch (line.kind) {
    case "title":
      ctx.font = FONT_TITLE;
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.fillText(line.text, x, y);
      return y + 26;
    case "muted":
      ctx.font = FONT;
      ctx.fillStyle = "rgba(140, 160, 190, 0.85)";
      ctx.fillText(line.text, x, y);
      return y + 16;
    case "body":
      ctx.font = FONT;
      ctx.fillStyle = "rgba(140, 160, 190, 0.85)";
      ctx.fillText(line.text, x, y);
      return y + 16;
    case "stat":
      ctx.font = FONT;
      ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
      ctx.fillText(line.text, x, y);
      return y + 16;
    case "section":
      ctx.font = FONT_TITLE;
      ctx.fillStyle = "rgba(200, 220, 245, 0.95)";
      ctx.fillText(line.text, x, y + 2);
      // Divider under section title (L-menu-ish).
      ctx.strokeStyle = "rgba(90, 115, 145, 0.4)";
      ctx.beginPath();
      ctx.moveTo(x, y + 18);
      ctx.lineTo(x + Math.min(w - 8, 280), y + 18);
      ctx.stroke();
      return y + 22;
    case "slot": {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
      ctx.fillText(line.text, x, y);
      ctx.fillStyle = line.empty
        ? "rgba(120, 140, 165, 0.75)"
        : "rgba(210, 225, 245, 0.95)";
      const labelW = ctx.measureText(line.text).width;
      ctx.fillText(line.value, x + Math.max(88, labelW + 12), y);
      return y + 20;
    }
    case "cargo": {
      ctx.font = FONT;
      const swatch =
        line.tag === "mission"
          ? "rgba(210, 150, 90, 0.9)"
          : line.tag === "stolen"
            ? "rgba(200, 110, 120, 0.9)"
            : "rgba(150, 175, 210, 0.85)";
      ctx.fillStyle = swatch;
      ctx.fillRect(x, y + 3, 6, 10);
      ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
      const name =
        line.text.length > 28 ? `${line.text.slice(0, 27)}…` : line.text;
      ctx.fillText(name, x + 12, y);
      ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
      const vw = ctx.measureText(line.value).width;
      ctx.fillText(line.value, x + w - vw - 10, y);
      return y + 20;
    }
    case "gap":
      return y + 10;
  }
}

function prettyModuleName(modId: string): string {
  return moduleById(modId)?.name ?? modId;
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
