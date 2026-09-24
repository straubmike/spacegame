import {
  formatAmmo,
  formatWarp,
  rateOfFire,
  slotKindLabel,
  swapCost,
  tierLabel,
  type EquipModule,
  type ShipSlot,
} from "../ship/equipment";
import type { ShipLoadout } from "../ship/Loadout";
import type { CargoHold } from "../ship/CargoHold";
import {
  isMissionCargoId,
  missionStatusLine,
  type ActiveMission,
} from "../ship/missions";
import {
  stockForSlot,
  wealthLabel,
  type StationWealth,
} from "../ship/stationStock";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type ShipMenuMode = "view" | "bay";

export type ShipMenuClickResult =
  | "close"
  | { action: "install"; module: EquipModule }
  | { action: "eject"; commodityId: string; cu: number }
  | { action: "cancelMission"; missionId: string }
  | null;

interface StatRow {
  label: string;
  text: string;
  value: number | null;
}

interface EjectDraft {
  commodityId: string;
  name: string;
  max: number;
  qty: number;
  isMission: boolean;
  /** pickQty = choose amount; confirmMission = are-you-sure for mission freight */
  phase: "pickQty" | "confirmMission";
}

/**
 * Ship loadout inspector (L) and station Bay.
 * View mode: loadout + active missions + cargo (partial eject / mission warn).
 */
export class ShipMenu {
  mode: ShipMenuMode = "view";
  selectedIndex = 0;
  selectedOfferIndex = 0;
  stock: EquipModule[] = [];
  wealth: StationWealth | null = null;

  private slotRects: Rect[] = [];
  private offerRects: Rect[] = [];
  private installBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private offers: EquipModule[] = [];
  private cargoEjectBtns: { rect: Rect; commodityId: string }[] = [];
  private missionCancelBtns: { rect: Rect; missionId: string }[] = [];
  private ejectDraft: EjectDraft | null = null;
  private ejectMinusBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private ejectPlusBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private ejectConfirmBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private ejectCancelBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  openView(): void {
    this.mode = "view";
    this.stock = [];
    this.wealth = null;
    this.selectedOfferIndex = 0;
    this.ejectDraft = null;
  }

  openBay(stock: EquipModule[], wealth: StationWealth | null = null): void {
    this.mode = "bay";
    this.stock = stock;
    this.wealth = wealth;
    this.selectedOfferIndex = 0;
    this.ejectDraft = null;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    loadout: ShipLoadout,
    credits: number,
    width: number,
    height: number,
    pointerX: number,
    pointerY: number,
    hullName = "Ship",
    cargo: CargoHold | null = null,
    missions: readonly ActiveMission[] = [],
  ): void {
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);

    const panelW =
      this.mode === "bay" ? Math.min(920, width - 40) : Math.min(640, width - 40);
    const panelH = Math.min(this.mode === "bay" ? 560 : 600, height - 40);
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
    ctx.fillText(this.mode === "bay" ? "Bay" : hullName, panel.x + 20, panel.y + 18);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(150, 175, 210, 0.75)";
    const subtitle = this.mode === "bay" ? `${hullName} · Refit` : "Loadout";
    ctx.fillText(
      subtitle,
      panel.x + panel.w - (this.mode === "bay" ? 140 : 88),
      panel.y + 22,
    );

    if (this.mode === "bay") {
      ctx.fillStyle = "rgba(180, 200, 230, 0.85)";
      const wealthBit = this.wealth ? ` · ${wealthLabel(this.wealth)}` : "";
      ctx.fillText(`CR ${credits}${wealthBit}`, panel.x + 20, panel.y + 40);
    }

    const listX = panel.x + 16;
    const listY = panel.y + (this.mode === "bay" ? 64 : 56);
    const listW = 150;
    const rowH = 40;
    const footerY = panel.y + panel.h - 50;
    this.cargoEjectBtns = [];
    this.missionCancelBtns = [];
    this.ejectMinusBtn = { x: 0, y: 0, w: 0, h: 0 };
    this.ejectPlusBtn = { x: 0, y: 0, w: 0, h: 0 };
    this.ejectConfirmBtn = { x: 0, y: 0, w: 0, h: 0 };
    this.ejectCancelBtn = { x: 0, y: 0, w: 0, h: 0 };

    this.slotRects = [];
    loadout.slots.forEach((slot, i) => {
      const row: Rect = {
        x: listX,
        y: listY + i * rowH,
        w: listW,
        h: rowH - 6,
      };
      this.slotRects.push(row);
      const selected = i === this.selectedIndex;
      const hovered = hit(row, pointerX, pointerY);
      if (selected) ctx.fillStyle = "rgba(50, 110, 170, 0.45)";
      else if (hovered) ctx.fillStyle = "rgba(40, 55, 75, 0.55)";
      else ctx.fillStyle = "rgba(20, 28, 40, 0.55)";
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.strokeStyle = selected
        ? "rgba(140, 200, 255, 0.65)"
        : "rgba(90, 115, 145, 0.35)";
      ctx.strokeRect(row.x, row.y, row.w, row.h);
      ctx.font = FONT;
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.textBaseline = "top";
      ctx.fillText(slot.label, row.x + 10, row.y + 6);
      ctx.fillStyle = "rgba(150, 170, 200, 0.8)";
      ctx.fillText(
        slot.equipped ? slot.equipped.name : "Empty",
        row.x + 10,
        row.y + 22,
      );
    });

    const slot = loadout.slots[this.selectedIndex] ?? loadout.slots[0]!;
    this.offerRects = [];
    this.offers = [];
    this.installBtn = { x: 0, y: 0, w: 0, h: 0 };

    if (this.mode === "bay") {
      this.offers = stockForSlot(this.stock, slot.kind);
      if (this.selectedOfferIndex >= this.offers.length) {
        this.selectedOfferIndex = 0;
      }
      const offer = this.offers[this.selectedOfferIndex] ?? null;
      const compareX = listX + listW + 14;
      const stockListW = 168;
      const compareAreaW = panel.x + panel.w - 16 - stockListW - 12 - compareX;
      const colW = Math.floor((compareAreaW - 12) / 2);
      const offerColX = compareX + colW + 12;
      const stockListX = panel.x + panel.w - 16 - stockListW;
      this.drawCompareColumn(
        ctx, compareX, listY, colW, footerY - listY - 8,
        "Fitted", slot.equipped, offer, loadout, true,
      );
      this.drawCompareColumn(
        ctx, offerColX, listY, colW, footerY - listY - 8,
        "Selected stock", offer, null, loadout, false,
      );
      this.drawStockList(
        ctx, stockListX, listY, stockListW, footerY - listY - 64,
        slot, credits, pointerX, pointerY,
      );
    } else {
      const detailX = listX + listW + 14;
      const detailW = panel.w - listW - 48;
      const cargoH = 175;
      const missionH = 130;
      const detailH = Math.max(100, footerY - listY - cargoH - missionH - 16);
      this.drawCompareColumn(
        ctx, detailX, listY, detailW, detailH,
        slotKindLabel(slot.kind), slot.equipped, null, loadout, false,
      );
      this.drawMissions(
        ctx, detailX, listY + detailH + 4, detailW, missionH - 4,
        missions, pointerX, pointerY,
      );
      this.drawCargoHold(
        ctx, detailX, footerY - cargoH, detailW, cargoH - 8,
        cargo, pointerX, pointerY,
      );
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

  private drawMissions(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    missions: readonly ActiveMission[],
    pointerX: number,
    pointerY: number,
  ): void {
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Missions", x, y);

    ctx.font = FONT;
    if (missions.length === 0) {
      ctx.fillStyle = "rgba(120, 140, 165, 0.8)";
      ctx.fillText("No active contracts.", x, y + 26);
      return;
    }

    let ry = y + 26;
    const bottom = y + h;
    const rowH = 34;
    for (const m of missions) {
      if (ry + rowH > bottom) break;
      ctx.fillStyle = "rgba(28, 36, 28, 0.55)";
      ctx.fillRect(x, ry, w, rowH - 4);
      ctx.strokeStyle = "rgba(90, 130, 100, 0.4)";
      ctx.strokeRect(x, ry, w, rowH - 4);

      ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
      ctx.textBaseline = "top";
      const title = m.title.length > 28 ? `${m.title.slice(0, 27)}…` : m.title;
      ctx.fillText(title, x + 8, ry + 4);
      ctx.fillStyle = "rgba(150, 175, 210, 0.85)";
      const status = missionStatusLine(m);
      const statusShort =
        status.length > 36 ? `${status.slice(0, 35)}…` : status;
      ctx.fillText(statusShort, x + 8, ry + 18);

      const btn: Rect = {
        x: x + w - 78,
        y: ry + 3,
        w: 70,
        h: rowH - 10,
      };
      this.missionCancelBtns.push({ rect: btn, missionId: m.id });
      drawButton(ctx, btn, "Cancel", {
        hover: hit(btn, pointerX, pointerY),
      });
      ry += rowH;
    }
  }

  private drawCargoHold(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    cargo: CargoHold | null,
    pointerX: number,
    pointerY: number,
  ): void {
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    const used = cargo?.usedCu ?? 0;
    const cap = cargo?.capacityCu ?? 0;
    ctx.fillText(cap > 0 ? `Cargo  ${used}/${cap} CU` : "Cargo", x, y);

    ctx.font = FONT;
    if (!cargo || cap <= 0) {
      ctx.fillStyle = "rgba(120, 140, 165, 0.8)";
      ctx.fillText("No hold fitted — equip a rack or scoop.", x, y + 28);
      return;
    }

    if (this.ejectDraft) {
      this.drawEjectDraft(ctx, x, y + 26, w, h - 26, pointerX, pointerY);
      return;
    }

    const lots = cargo.list();
    if (lots.length === 0) {
      ctx.fillStyle = "rgba(120, 140, 165, 0.8)";
      ctx.fillText("Hold empty.", x, y + 28);
      return;
    }

    const rowH = 30;
    let ry = y + 28;
    const bottom = y + h;
    for (const lot of lots) {
      if (ry + rowH > bottom) break;
      const mission = isMissionCargoId(lot.id);
      ctx.fillStyle = mission
        ? "rgba(55, 40, 28, 0.65)"
        : "rgba(30, 40, 55, 0.55)";
      ctx.fillRect(x, ry, w, rowH - 4);
      ctx.strokeStyle = mission
        ? "rgba(210, 150, 90, 0.55)"
        : "rgba(90, 115, 145, 0.35)";
      ctx.strokeRect(x, ry, w, rowH - 4);

      ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
      ctx.textBaseline = "middle";
      const label =
        lot.name.length > 16 ? `${lot.name.slice(0, 15)}…` : lot.name;
      const flag = mission ? "  [MISSION]" : "";
      ctx.fillText(
        `${label}${flag}  ·  ${lot.cu} CU`,
        x + 10,
        ry + (rowH - 4) / 2,
      );

      const btn: Rect = {
        x: x + w - 78,
        y: ry + 2,
        w: 70,
        h: rowH - 8,
      };
      this.cargoEjectBtns.push({ rect: btn, commodityId: lot.id });
      drawButton(ctx, btn, "Eject", {
        hover: hit(btn, pointerX, pointerY),
      });
      ry += rowH;
    }
  }

  private drawEjectDraft(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    _h: number,
    pointerX: number,
    pointerY: number,
  ): void {
    const d = this.ejectDraft!;
    ctx.fillStyle = "rgba(24, 32, 44, 0.9)";
    ctx.fillRect(x, y, w, 120);
    ctx.strokeStyle = "rgba(140, 175, 220, 0.45)";
    ctx.strokeRect(x, y, w, 120);

    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";

    if (d.phase === "confirmMission") {
      ctx.fillText("Are you sure you want to eject", x + 12, y + 12);
      ctx.fillText("mission cargo?", x + 12, y + 30);
      ctx.fillStyle = "rgba(210, 170, 120, 0.95)";
      ctx.fillText(`${d.name}  ·  ${d.qty} CU`, x + 12, y + 52);

      this.ejectConfirmBtn = { x: x + 12, y: y + 78, w: 100, h: 32 };
      this.ejectCancelBtn = { x: x + 124, y: y + 78, w: 88, h: 32 };
      drawButton(ctx, this.ejectConfirmBtn, "Confirm", {
        primary: true,
        hover: hit(this.ejectConfirmBtn, pointerX, pointerY),
      });
      drawButton(ctx, this.ejectCancelBtn, "Cancel", {
        hover: hit(this.ejectCancelBtn, pointerX, pointerY),
      });
      return;
    }

    ctx.fillText(`Eject: ${d.name}`, x + 12, y + 12);
    if (d.isMission) {
      ctx.fillStyle = "rgba(210, 150, 90, 0.95)";
      ctx.fillText("MISSION freight", x + 12, y + 30);
    } else {
      ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
      ctx.fillText(`Hold has ${d.max} CU`, x + 12, y + 30);
    }

    this.ejectMinusBtn = { x: x + 12, y: y + 52, w: 36, h: 32 };
    this.ejectPlusBtn = { x: x + 120, y: y + 52, w: 36, h: 32 };
    drawButton(ctx, this.ejectMinusBtn, "−", {
      enabled: d.qty > 1,
      hover: d.qty > 1 && hit(this.ejectMinusBtn, pointerX, pointerY),
    });
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(`${d.qty}`, x + 84, y + 68);
    ctx.textAlign = "left";
    drawButton(ctx, this.ejectPlusBtn, "+", {
      enabled: d.qty < d.max,
      hover: d.qty < d.max && hit(this.ejectPlusBtn, pointerX, pointerY),
    });

    this.ejectConfirmBtn = { x: x + 12, y: y + 92, w: 110, h: 28 };
    this.ejectCancelBtn = { x: x + 132, y: y + 92, w: 80, h: 28 };
    drawButton(ctx, this.ejectConfirmBtn, `Eject ${d.qty}`, {
      primary: true,
      hover: hit(this.ejectConfirmBtn, pointerX, pointerY),
    });
    drawButton(ctx, this.ejectCancelBtn, "Back", {
      hover: hit(this.ejectCancelBtn, pointerX, pointerY),
    });
  }
  private drawCompareColumn(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    _maxH: number,
    title: string,
    mod: EquipModule | null,
    /** When set on fitted column, show deltas vs this candidate. */
    compareAgainst: EquipModule | null,
    loadout: ShipLoadout,
    showDeltas: boolean,
  ): void {
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText(title, x, y);

    if (!mod) {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
      ctx.fillText("Empty", x, y + 32);
      ctx.fillStyle = "rgba(120, 140, 165, 0.75)";
      const tip =
        this.mode === "bay"
          ? showDeltas
            ? "Choose stock to install."
            : "Select a module."
          : "Dock and open Bay to refit.";
      ctx.fillText(tip, x, y + 52);
      return;
    }

    ctx.font = FONT;
    ctx.fillStyle = "rgba(200, 220, 245, 0.95)";
    ctx.fillText(`${mod.name}  (${tierLabel(mod.tier)})`, x, y + 28);

    ctx.fillStyle = "rgba(140, 160, 190, 0.85)";
    const blurbLines = wrapText(mod.blurb, Math.max(18, Math.floor(w / 7)));
    let by = y + 50;
    for (const line of blurbLines.slice(0, 3)) {
      ctx.fillText(line, x, by);
      by += 16;
    }

    by += 10;
    const rows = moduleStatRows(mod, loadout);
    const otherRows =
      showDeltas && compareAgainst && compareAgainst.kind === mod.kind
        ? moduleStatRows(compareAgainst, loadout)
        : null;

    for (let i = 0; i < rows.length; i += 1) {
      const row = rows[i]!;
      ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
      ctx.fillText(`${row.label}  ${row.text}`, x, by);

      if (otherRows) {
        const other = otherRows[i];
        if (
          other &&
          row.value !== null &&
          other.value !== null &&
          Number.isFinite(row.value) &&
          Number.isFinite(other.value)
        ) {
          const delta = other.value - row.value;
          if (Math.abs(delta) > 1e-6) {
            const label = formatDelta(delta);
            const tw = ctx.measureText(`${row.label}  ${row.text}`).width;
            ctx.fillStyle =
              delta > 0 ? "rgba(90, 210, 130, 0.95)" : "rgba(230, 100, 100, 0.95)";
            ctx.fillText(label, x + tw + 8, by);
          }
        }
      }
      by += 18;
    }

    by += 6;
    ctx.fillStyle = "rgba(160, 180, 210, 0.8)";
    ctx.fillText(`List  ${mod.price} cr`, x, by);
  }

  private drawStockList(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    listH: number,
    slot: ShipSlot,
    credits: number,
    pointerX: number,
    pointerY: number,
  ): void {
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Stock", x, y);

    if (this.offers.length === 0) {
      ctx.font = FONT;
      ctx.fillStyle = "rgba(150, 170, 200, 0.8)";
      ctx.fillText("Nothing here.", x, y + 30);
      return;
    }

    const rowH = 34;
    let oy = y + 30;
    const listBottom = y + listH;

    this.offers.forEach((offer, i) => {
      if (oy + rowH > listBottom) return;
      const row: Rect = { x, y: oy, w, h: rowH - 4 };
      this.offerRects.push(row);
      const selected = i === this.selectedOfferIndex;
      const hovered = hit(row, pointerX, pointerY);
      const installed = slot.equipped?.id === offer.id;

      if (selected) ctx.fillStyle = "rgba(50, 110, 170, 0.4)";
      else if (hovered) ctx.fillStyle = "rgba(40, 55, 75, 0.5)";
      else ctx.fillStyle = "rgba(18, 26, 36, 0.55)";
      ctx.fillRect(row.x, row.y, row.w, row.h);
      ctx.strokeStyle = selected
        ? "rgba(140, 200, 255, 0.55)"
        : "rgba(80, 100, 130, 0.35)";
      ctx.strokeRect(row.x, row.y, row.w, row.h);

      ctx.font = FONT;
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.textBaseline = "middle";
      const mark = tierLabel(offer.tier);
      const base =
        offer.name.length > 12 ? `${offer.name.slice(0, 11)}…` : offer.name;
      const name = installed ? `${base} ✓` : `${base} ${mark}`;
      ctx.fillText(name, row.x + 8, row.y + row.h / 2);
      oy += rowH;
    });

    const offer = this.offers[this.selectedOfferIndex]!;
    const installed = slot.equipped?.id === offer.id;
    const cost = swapCost(slot.equipped, offer);
    const canAfford = credits >= cost;
    const canInstall = !installed && canAfford;

    ctx.font = FONT;
    ctx.fillStyle = "rgba(160, 180, 210, 0.85)";
    ctx.textBaseline = "top";
    const costY = listBottom + 4;
    const costLine = installed
      ? "Already fitted"
      : cost === 0
        ? "Free (trade-in)"
        : `${cost} cr`;
    ctx.fillText(costLine, x, costY);

    this.installBtn = {
      x,
      y: costY + 20,
      w,
      h: 32,
    };
    drawButton(
      ctx,
      this.installBtn,
      installed ? "Fitted" : cost === 0 ? "Install" : `Install (−${cost})`,
      {
        primary: canInstall,
        enabled: canInstall,
        hover: canInstall && hit(this.installBtn, pointerX, pointerY),
      },
    );
  }

  handleClick(
    loadout: ShipLoadout,
    px: number,
    py: number,
    cargo: CargoHold | null = null,
  ): ShipMenuClickResult {
    if (this.ejectDraft) {
      const d = this.ejectDraft;
      if (d.phase === "confirmMission") {
        if (hit(this.ejectConfirmBtn, px, py)) {
          const out = {
            action: "eject" as const,
            commodityId: d.commodityId,
            cu: d.qty,
          };
          this.ejectDraft = null;
          return out;
        }
        if (hit(this.ejectCancelBtn, px, py)) {
          d.phase = "pickQty";
          return null;
        }
        return null;
      }
      if (hit(this.ejectMinusBtn, px, py) && d.qty > 1) {
        d.qty -= 1;
        return null;
      }
      if (hit(this.ejectPlusBtn, px, py) && d.qty < d.max) {
        d.qty += 1;
        return null;
      }
      if (hit(this.ejectConfirmBtn, px, py)) {
        if (d.isMission) {
          d.phase = "confirmMission";
          return null;
        }
        const out = {
          action: "eject" as const,
          commodityId: d.commodityId,
          cu: d.qty,
        };
        this.ejectDraft = null;
        return out;
      }
      if (hit(this.ejectCancelBtn, px, py)) {
        this.ejectDraft = null;
        return null;
      }
      return null;
    }

    if (hit(this.closeBtn, px, py)) return "close";

    for (let i = 0; i < this.slotRects.length; i += 1) {
      if (hit(this.slotRects[i]!, px, py) && loadout.slots[i]) {
        this.selectedIndex = i;
        this.selectedOfferIndex = 0;
        return null;
      }
    }

    if (this.mode === "view") {
      for (const btn of this.missionCancelBtns) {
        if (hit(btn.rect, px, py)) {
          return { action: "cancelMission", missionId: btn.missionId };
        }
      }
      for (const btn of this.cargoEjectBtns) {
        if (hit(btn.rect, px, py)) {
          const lot = cargo?.list().find((l) => l.id === btn.commodityId);
          if (!lot || lot.cu <= 0) return null;
          this.ejectDraft = {
            commodityId: lot.id,
            name: lot.name,
            max: lot.cu,
            qty: lot.cu,
            isMission: isMissionCargoId(lot.id),
            phase: "pickQty",
          };
          return null;
        }
      }
    }

    if (this.mode === "bay") {
      for (let i = 0; i < this.offerRects.length; i += 1) {
        if (hit(this.offerRects[i]!, px, py) && this.offers[i]) {
          this.selectedOfferIndex = i;
          return null;
        }
      }
      if (hit(this.installBtn, px, py)) {
        const slot = loadout.slots[this.selectedIndex];
        const offer = this.offers[this.selectedOfferIndex];
        if (!slot || !offer) return null;
        if (slot.equipped?.id === offer.id) return null;
        return { action: "install", module: offer };
      }
    }

    return null;
  }
}


function moduleStatRows(mod: EquipModule, loadout: ShipLoadout): StatRow[] {
  if (mod.kind === "weapon") {
    const ammo =
      loadout.weapon?.id === mod.id
        ? loadout.ammo
        : mod.ammoMax === null
          ? Infinity
          : mod.ammoMax;
    const rof = rateOfFire(mod.fireCooldown);
    return [
      {
        label: "Rate of fire",
        text: `${rof.toFixed(2)} /s`,
        value: rof,
      },
      {
        label: "Ammunition",
        text: formatAmmo(mod.ammoMax, ammo),
        value: mod.ammoMax,
      },
      {
        label: "Damage",
        text: `${mod.damage}`,
        value: mod.damage,
      },
    ];
  }
  if (mod.kind === "drive") {
    const turnDeg = (mod.turnRate * 180) / Math.PI;
    const warp =
      loadout.drive?.id === mod.id
        ? loadout.warpCharges
        : mod.warpChargesMax === null
          ? Infinity
          : mod.warpChargesMax;
    return [
      {
        label: "Thrust",
        text: `${mod.thrustAccel.toFixed(0)}`,
        value: mod.thrustAccel,
      },
      {
        label: "Reverse",
        text: `${mod.reverseAccel.toFixed(0)}`,
        value: mod.reverseAccel,
      },
      {
        label: "Top speed",
        text: `${mod.maxSpeed.toFixed(0)}`,
        value: mod.maxSpeed,
      },
      {
        label: "Turn rate",
        text: `${turnDeg.toFixed(0)}°/s`,
        value: turnDeg,
      },
      {
        label: "Jump range",
        text: `${mod.jumpRange.toFixed(0)} ly`,
        value: mod.jumpRange,
      },
      {
        label: "Warp charges",
        text: formatWarp(mod.warpChargesMax, warp),
        value: mod.warpChargesMax,
      },
    ];
  }
  return [
    {
      label: "Shield max",
      text: `${mod.shieldMax}`,
      value: mod.shieldMax,
    },
    {
      label: "Regen delay",
      text: `${mod.shieldRegenDelay.toFixed(1)} s`,
      value: mod.shieldRegenDelay,
    },
    {
      label: "Regen rate",
      text: `${mod.shieldRegenRate.toFixed(1)} /s`,
      value: mod.shieldRegenRate,
    },
    {
      label: "Hull bonus",
      text: `+${mod.hullBonus}`,
      value: mod.hullBonus,
    },
    {
      label: "Cargo",
      text: `${mod.cargoCapacity} CU`,
      value: mod.cargoCapacity,
    },
    {
      label: "Passengers",
      text: `${mod.passengerCapacity}`,
      value: mod.passengerCapacity,
    },
    {
      label: "Ore scan",
      text:
        mod.mineralScanRange > 0
          ? `${mod.mineralScanRange.toFixed(0)} u`
          : "—",
      value: mod.mineralScanRange,
    },
    {
      label: "Scoop range",
      text: mod.scoopRange > 0 ? `${mod.scoopRange.toFixed(0)} u` : "—",
      value: mod.scoopRange,
    },
  ];
}

function formatDelta(delta: number): string {
  const rounded =
    Math.abs(delta) >= 10
      ? delta.toFixed(0)
      : Math.abs(delta) >= 1
        ? delta.toFixed(1)
        : delta.toFixed(2);
  const n = Number(rounded);
  if (n === 0) return "";
  return n > 0 ? `+${stripTrailingZeros(rounded)}` : stripTrailingZeros(rounded);
}

function stripTrailingZeros(s: string): string {
  if (!s.includes(".")) return s;
  return s.replace(/\.?0+$/, "");
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
