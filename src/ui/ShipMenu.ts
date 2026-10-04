import {
  formatAmmo,
  rateOfFire,
  slotKindLabel,
  swapCost,
  moduleDetailTitle,
  moduleStockLabel,
  weaponSlotBinding,
  type EquipModule,
  type ShipSlot,
  type WeaponModule,
} from "../ship/equipment";
import {
  applyBayDiscount,
  formatPirateStanding,
  formatStanding,
  pirateStandingBand,
  standingBand,
  type ReputationListing,
} from "../ship/reputation";
import type { ShipLoadout } from "../ship/Loadout";
import type { CargoHold } from "../ship/CargoHold";
import {
  isMissionCargoId,
  isStolenCargoId,
  missionStatusLine,
  occupiedPassengerBerths,
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
  | { action: "distress" }
  | null;

interface StatRow {
  label: string;
  text: string;
  value: number | null;
  /** A smaller number is the upgrade (gun time-on-target). */
  lowerIsBetter?: boolean;
}

interface CargoRowWidgets {
  commodityId: string;
  minus: Rect;
  plus: Rect;
  eject: Rect;
}

/** Pending confirm dialog when ejecting mission-tagged freight. */
interface MissionEjectConfirm {
  commodityId: string;
  name: string;
  cu: number;
}

const EMPTY_REP: ReputationListing = { factions: [], stations: [] };

/**
 * Ship loadout inspector (L) and station Bay.
 * View mode: Loadout / Missions / Cargo / Reputation bands (no overlap).
 * Missions + Cargo + Reputation lists scroll with the mouse wheel when the
 * pointer is over that section. Cargo rows use market-style − / qty / + / Eject
 * (mission freight confirms).
 */
export class ShipMenu {
  mode: ShipMenuMode = "view";
  selectedIndex = 0;
  selectedOfferIndex = 0;
  stock: EquipModule[] = [];
  wealth: StationWealth | null = null;
  /** Bay net-cost discount fraction from station standing (0…1). */
  bayDiscount = 0;
  /** L-menu Reputation band payload. */
  reputation: ReputationListing = EMPTY_REP;

  private slotRects: Rect[] = [];
  private offerRects: Rect[] = [];
  private installBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private offers: EquipModule[] = [];
  private missionCancelBtns: { rect: Rect; missionId: string }[] = [];
  private cargoRows: CargoRowWidgets[] = [];
  /** Pending eject amount per commodity (market-style). */
  private ejectQty = new Map<string, number>();
  private missionConfirm: MissionEjectConfirm | null = null;
  private confirmYesBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private confirmNoBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private distressBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };

  /** L-menu Missions / Cargo / Reputation list scroll (wheel over section). */
  private missionsScroll = 0;
  private cargoScroll = 0;
  private repScroll = 0;
  private missionsMaxScroll = 0;
  private cargoMaxScroll = 0;
  private repMaxScroll = 0;
  private missionsListRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private cargoListRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private repListRect: Rect = { x: 0, y: 0, w: 0, h: 0 };

  openView(reputation: ReputationListing = EMPTY_REP): void {
    this.mode = "view";
    this.stock = [];
    this.wealth = null;
    this.bayDiscount = 0;
    this.reputation = reputation;
    this.selectedOfferIndex = 0;
    this.missionConfirm = null;
    this.missionsScroll = 0;
    this.cargoScroll = 0;
    this.repScroll = 0;
  }

  openBay(
    stock: EquipModule[],
    wealth: StationWealth | null = null,
    bayDiscount = 0,
    reputation: ReputationListing = EMPTY_REP,
  ): void {
    this.mode = "bay";
    this.stock = stock;
    this.wealth = wealth;
    this.bayDiscount = bayDiscount;
    this.reputation = reputation;
    this.selectedOfferIndex = 0;
    this.missionConfirm = null;
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
    reputation: ReputationListing = EMPTY_REP,
  ): void {
    this.reputation = reputation;
    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);

    const panelW =
      this.mode === "bay"
        ? Math.min(920, width - 40)
        : Math.min(760, width - 32);
    const panelH = Math.min(this.mode === "bay" ? 560 : 660, height - 32);
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
    ctx.fillText(
      this.mode === "bay" ? "Bay" : hullName,
      panel.x + 20,
      panel.y + 16,
    );

    ctx.font = FONT;
    ctx.fillStyle = "rgba(150, 175, 210, 0.75)";
    const subtitle = this.mode === "bay" ? `${hullName} · Refit` : "Ship";
    ctx.fillText(
      subtitle,
      panel.x + panel.w - (this.mode === "bay" ? 140 : 56),
      panel.y + 20,
    );

    if (this.mode === "bay") {
      ctx.fillStyle = "rgba(180, 200, 230, 0.85)";
      const wealthBit = this.wealth ? ` · ${wealthLabel(this.wealth)}` : "";
      const discBit =
        this.bayDiscount > 0
          ? ` · Rep −${Math.round(this.bayDiscount * 100)}% bay`
          : "";
      ctx.fillText(
        `CR ${credits}${wealthBit}${discBit}`,
        panel.x + 20,
        panel.y + 40,
      );
    }

    const listX = panel.x + 16;
    const listY = panel.y + (this.mode === "bay" ? 64 : 52);
    const listW = this.mode === "bay" ? 150 : 148;
    const rowH = 40;
    // Distress + Close live at the bottom of the left (modules) column.
    const btnH = 36;
    const btnGap = 8;
    const leftBtnStack =
      this.mode === "view" ? btnH * 2 + btnGap : btnH;
    const footerY = panel.y + panel.h - 16 - leftBtnStack - 10;
    this.missionCancelBtns = [];
    this.cargoRows = [];
    this.confirmYesBtn = { x: 0, y: 0, w: 0, h: 0 };
    this.confirmNoBtn = { x: 0, y: 0, w: 0, h: 0 };

    this.slotRects = [];
    let weaponOrdinal = 0;
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
      const binding =
        slot.kind === "weapon" ? weaponSlotBinding(weaponOrdinal) : null;
      if (slot.kind === "weapon") weaponOrdinal += 1;
      ctx.save();
      ctx.beginPath();
      ctx.rect(row.x + 4, row.y, row.w - 8, row.h);
      ctx.clip();
      ctx.fillText(
        binding ? `${slot.label} · ${binding}` : slot.label,
        row.x + 10,
        row.y + 6,
      );
      ctx.fillStyle = "rgba(150, 170, 200, 0.8)";
      ctx.fillText(
        slot.equipped ? moduleStockLabel(slot.equipped) : "Empty",
        row.x + 10,
        row.y + 22,
      );
      ctx.restore();
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
        ctx,
        compareX,
        listY,
        colW,
        footerY - listY - 8,
        "Fitted",
        slot.equipped,
        offer,
        loadout,
        true,
      );
      this.drawCompareColumn(
        ctx,
        offerColX,
        listY,
        colW,
        footerY - listY - 8,
        "Selected stock",
        offer,
        null,
        loadout,
        false,
      );
      this.drawStockList(
        ctx,
        stockListX,
        listY,
        stockListW,
        footerY - listY - 64,
        slot,
        credits,
        pointerX,
        pointerY,
      );
    } else {
      this.drawViewBands(
        ctx,
        panel,
        listX,
        listY,
        listW,
        footerY,
        slot,
        loadout,
        cargo,
        missions,
        pointerX,
        pointerY,
      );
    }

    this.closeBtn = {
      x: listX,
      y: panel.y + panel.h - 16 - btnH,
      w: listW,
      h: btnH,
    };
    if (this.mode === "view") {
      this.distressBtn = {
        x: listX,
        y: this.closeBtn.y - btnGap - btnH,
        w: listW,
        h: btnH,
      };
      drawButton(ctx, this.distressBtn, "Distress signal", {
        hover: !this.missionConfirm && hit(this.distressBtn, pointerX, pointerY),
      });
    } else {
      this.distressBtn = { x: 0, y: 0, w: 0, h: 0 };
    }
    drawButton(ctx, this.closeBtn, "Close", {
      hover: !this.missionConfirm && hit(this.closeBtn, pointerX, pointerY),
    });

    if (this.missionConfirm) {
      this.drawMissionConfirm(ctx, panel, pointerX, pointerY);
    }
  }

  /**
   * Four non-overlapping right-hand bands:
   * Loadout → Missions → Cargo → Reputation.
   */
  private drawViewBands(
    ctx: CanvasRenderingContext2D,
    panel: Rect,
    listX: number,
    listY: number,
    listW: number,
    footerY: number,
    slot: ShipSlot,
    loadout: ShipLoadout,
    cargo: CargoHold | null,
    missions: readonly ActiveMission[],
    pointerX: number,
    pointerY: number,
  ): void {
    const detailX = listX + listW + 16;
    const detailW = panel.x + panel.w - 16 - detailX;
    const contentTop = listY;
    const contentBottom = footerY - 10;
    const contentH = contentBottom - contentTop;
    const gap = 10;

    // Prefer title + 2×rowH(44) + frame pad ≈ 132 when the panel is tall;
    // otherwise shrink and rely on wheel scroll so every Cancel stays reachable.
    const missionH = Math.max(100, Math.min(132, Math.floor(contentH * 0.26)));
    const cargoH = Math.max(140, Math.min(190, Math.floor(contentH * 0.3)));
    // Reputation needs room for factions + non-zero stations (was clipping stations).
    const repH = Math.max(150, Math.min(220, Math.floor(contentH * 0.3)));
    const loadoutH = Math.max(
      90,
      contentH - missionH - cargoH - repH - gap * 3,
    );

    const loadoutY = contentTop;
    const missionY = loadoutY + loadoutH + gap;
    const cargoY = missionY + missionH + gap;
    const repY = cargoY + cargoH + gap;

    this.drawSectionFrame(ctx, detailX, loadoutY, detailW, loadoutH);
    this.drawCompareColumn(
      ctx,
      detailX + 10,
      loadoutY + 8,
      detailW - 20,
      loadoutH - 16,
      slotKindLabel(slot.kind),
      slot.equipped,
      null,
      loadout,
      false,
    );

    this.drawSectionFrame(ctx, detailX, missionY, detailW, missionH);
    this.drawMissionsBand(
      ctx,
      detailX + 10,
      missionY + 8,
      detailW - 20,
      missionH - 16,
      missions,
      pointerX,
      pointerY,
    );

    this.drawSectionFrame(ctx, detailX, cargoY, detailW, cargoH);
    const passengerCapacity = loadout
      .utilities()
      .reduce((sum, u) => sum + u.passengerCapacity, 0);
    this.drawCargoBand(
      ctx,
      detailX + 10,
      cargoY + 8,
      detailW - 20,
      cargoH - 16,
      cargo,
      occupiedPassengerBerths(missions),
      passengerCapacity,
      pointerX,
      pointerY,
    );

    this.drawSectionFrame(ctx, detailX, repY, detailW, repH);
    this.drawReputationBand(
      ctx,
      detailX + 10,
      repY + 8,
      detailW - 20,
      repH - 16,
    );
  }

  private drawSectionFrame(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    ctx.fillStyle = "rgba(14, 20, 30, 0.55)";
    ctx.fillRect(x, y, w, h);
    ctx.strokeStyle = "rgba(90, 115, 145, 0.4)";
    ctx.strokeRect(x, y, w, h);
  }

  private drawMissionsBand(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    missions: readonly ActiveMission[],
    pointerX: number,
    pointerY: number,
  ): void {
    const titleH = 28;
    const listTop = y + titleH;
    const listH = Math.max(0, h - titleH);
    this.missionsListRect = { x, y: listTop, w, h: listH };

    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Missions", x, y);

    ctx.font = FONT;
    if (missions.length === 0) {
      this.missionsMaxScroll = 0;
      this.missionsScroll = 0;
      ctx.fillStyle = "rgba(120, 140, 165, 0.8)";
      ctx.fillText("No active contracts.", x, listTop);
      return;
    }

    const rowH = 44;
    this.missionsMaxScroll = Math.max(0, missions.length * rowH - listH);
    this.missionsScroll = Math.min(
      Math.max(0, this.missionsScroll),
      this.missionsMaxScroll,
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listTop, w, listH);
    ctx.clip();

    missions.forEach((m, i) => {
      const ry = listTop + i * rowH - this.missionsScroll;
      if (ry + rowH < listTop || ry > listTop + listH) return;

      ctx.fillStyle = "rgba(28, 40, 30, 0.7)";
      ctx.fillRect(x, ry, w, rowH - 6);
      ctx.strokeStyle = "rgba(100, 140, 110, 0.4)";
      ctx.strokeRect(x, ry, w, rowH - 6);

      const textW = w - 90;
      ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
      ctx.textBaseline = "top";
      ctx.fillText(truncate(m.title, textW, ctx), x + 8, ry + 5);
      ctx.fillStyle = "rgba(150, 175, 210, 0.85)";
      ctx.fillText(truncate(missionStatusLine(m), textW, ctx), x + 8, ry + 22);

      const btn: Rect = {
        x: x + w - 78,
        y: ry + 6,
        w: 70,
        h: rowH - 18,
      };
      this.missionCancelBtns.push({ rect: btn, missionId: m.id });
      drawButton(ctx, btn, "Cancel", {
        hover: hit(btn, pointerX, pointerY),
      });
    });
    ctx.restore();

    this.drawBandScrollbar(
      ctx,
      x,
      listTop,
      w,
      listH,
      this.missionsScroll,
      this.missionsMaxScroll,
      missions.length * rowH,
    );
  }

  private drawCargoBand(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
    cargo: CargoHold | null,
    passengerUsed: number,
    passengerCapacity: number,
    pointerX: number,
    pointerY: number,
  ): void {
    this.syncEjectQty(cargo);

    const titleH = 46;
    const listTop = y + titleH;
    const listH = Math.max(0, h - titleH);
    this.cargoListRect = { x, y: listTop, w, h: listH };

    const used = cargo?.usedCu ?? 0;
    const cap = cargo?.capacityCu ?? 0;
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText(cap > 0 ? `Cargo  ${used}/${cap} CU` : "Cargo", x, y);

    const freeBerths = Math.max(0, passengerCapacity - passengerUsed);
    const berthLine =
      passengerCapacity <= 0 && passengerUsed <= 0
        ? "Berths  none fitted"
        : `Berths  ${freeBerths} free / ${passengerUsed} used`;
    ctx.font = FONT;
    ctx.fillStyle = "rgba(170, 205, 185, 0.95)";
    ctx.fillText(berthLine, x, y + 18);

    ctx.font = FONT;
    if (!cargo || cap <= 0) {
      this.cargoMaxScroll = 0;
      this.cargoScroll = 0;
      ctx.fillStyle = "rgba(120, 140, 165, 0.8)";
      ctx.fillText("No hold fitted — equip a rack or scoop.", x, listTop);
      return;
    }

    const lots = cargo.list();
    if (lots.length === 0) {
      this.cargoMaxScroll = 0;
      this.cargoScroll = 0;
      ctx.fillStyle = "rgba(120, 140, 165, 0.8)";
      ctx.fillText("Hold empty.", x, listTop);
      return;
    }

    const rowH = 50;
    this.cargoMaxScroll = Math.max(0, lots.length * rowH - listH);
    this.cargoScroll = Math.min(
      Math.max(0, this.cargoScroll),
      this.cargoMaxScroll,
    );

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listTop, w, listH);
    ctx.clip();

    lots.forEach((lot, i) => {
      const ry = listTop + i * rowH - this.cargoScroll;
      if (ry + rowH < listTop || ry > listTop + listH) return;

      const mission = isMissionCargoId(lot.id);
      const stolen = isStolenCargoId(lot.id);
      const qty = this.ejectQty.get(lot.id) ?? 1;

      ctx.fillStyle = mission
        ? "rgba(50, 36, 24, 0.7)"
        : stolen
          ? "rgba(48, 28, 32, 0.7)"
          : "rgba(24, 32, 44, 0.65)";
      ctx.fillRect(x, ry, w, rowH - 6);
      ctx.strokeStyle = mission
        ? "rgba(210, 150, 90, 0.5)"
        : stolen
          ? "rgba(200, 110, 120, 0.45)"
          : "rgba(90, 115, 145, 0.35)";
      ctx.strokeRect(x, ry, w, rowH - 6);

      ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
      ctx.textBaseline = "top";
      // Strip legacy "Contract: " prefix if present; keep the commodity name short.
      const displayName = lot.name.replace(/^Contract:\s*/i, "");
      const nameBit =
        displayName.length > 26 ? `${displayName.slice(0, 25)}…` : displayName;
      ctx.fillText(nameBit, x + 10, ry + 6);
      ctx.fillStyle = "rgba(150, 170, 200, 0.85)";
      const flag = mission ? "  [MISSION]" : stolen ? "  [STOLEN]" : "";
      ctx.fillText(`Hold ${lot.cu} CU${flag}`, x + 10, ry + 24);

      const minus: Rect = { x: x + w - 210, y: ry + 18, w: 28, h: 22 };
      const plus: Rect = { x: x + w - 146, y: ry + 18, w: 28, h: 22 };
      const eject: Rect = { x: x + w - 108, y: ry + 16, w: 96, h: 26 };

      drawButton(ctx, minus, "−", {
        enabled: qty > 1,
        hover: qty > 1 && hit(minus, pointerX, pointerY),
      });
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(String(qty), x + w - 164, ry + 29);
      ctx.textAlign = "left";
      drawButton(ctx, plus, "+", {
        enabled: qty < lot.cu,
        hover: qty < lot.cu && hit(plus, pointerX, pointerY),
      });
      drawButton(ctx, eject, "Eject", {
        primary: true,
        hover: hit(eject, pointerX, pointerY),
      });

      this.cargoRows.push({
        commodityId: lot.id,
        minus,
        plus,
        eject,
      });
    });
    ctx.restore();

    this.drawBandScrollbar(
      ctx,
      x,
      listTop,
      w,
      listH,
      this.cargoScroll,
      this.cargoMaxScroll,
      lots.length * rowH,
    );
  }

  /** Thin scrollbar when a Missions/Cargo list overflows its band. */
  private drawBandScrollbar(
    ctx: CanvasRenderingContext2D,
    x: number,
    listTop: number,
    w: number,
    listH: number,
    scroll: number,
    maxScroll: number,
    contentH: number,
  ): void {
    if (maxScroll <= 0 || listH <= 0 || contentH <= 0) return;
    const trackX = x + w - 6;
    const trackY = listTop;
    const trackH = listH;
    ctx.fillStyle = "rgba(40, 52, 70, 0.7)";
    ctx.fillRect(trackX, trackY, 4, trackH);
    const thumbH = Math.max(14, (listH / contentH) * trackH);
    const thumbY = trackY + (scroll / maxScroll) * (trackH - thumbH);
    ctx.fillStyle = "rgba(150, 175, 210, 0.75)";
    ctx.fillRect(trackX, thumbY, 4, thumbH);
  }

  /**
   * Apply mouse-wheel delta when the pointer is over the Missions, Cargo, or
   * Reputation list. Returns true if scroll changed.
   */
  handleWheel(deltaY: number, px: number, py: number): boolean {
    if (this.mode !== "view" || this.missionConfirm || deltaY === 0) {
      return false;
    }

    const tryScroll = (
      max: number,
      current: number,
      set: (n: number) => void,
      rect: Rect,
    ): boolean => {
      if (max <= 0) return false;
      const overList = hit(rect, px, py);
      const overTitle =
        px >= rect.x &&
        px <= rect.x + rect.w &&
        py >= rect.y - 28 &&
        py < rect.y;
      if (!overList && !overTitle) return false;
      const next = Math.min(max, Math.max(0, current + deltaY));
      if (next === current) return false;
      set(next);
      return true;
    };

    if (
      tryScroll(
        this.missionsMaxScroll,
        this.missionsScroll,
        (n) => {
          this.missionsScroll = n;
        },
        this.missionsListRect,
      )
    ) {
      return true;
    }
    if (
      tryScroll(
        this.cargoMaxScroll,
        this.cargoScroll,
        (n) => {
          this.cargoScroll = n;
        },
        this.cargoListRect,
      )
    ) {
      return true;
    }
    if (
      tryScroll(
        this.repMaxScroll,
        this.repScroll,
        (n) => {
          this.repScroll = n;
        },
        this.repListRect,
      )
    ) {
      return true;
    }

    return false;
  }

  /**
   * Stations (non-zero) first, then factions (Pirates/Fuel Rats/Imperial always;
   * Rebels when revealed; Merchants Guild + Cartographers always).
   * Wheel-scrolls when the list overflows.
   */
  private drawReputationBand(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    h: number,
  ): void {
    const titleH = 28;
    const listTop = y + titleH;
    const listH = Math.max(0, h - titleH);
    this.repListRect = { x, y: listTop, w, h: listH };

    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Reputation", x, y);

    // Measure content height (stations + factions + section headers).
    const stationLines =
      this.reputation.stations.length === 0
        ? 1
        : this.reputation.stations.length;
    const contentH =
      16 + // Stations header
      stationLines * 15 +
      8 + // gap
      16 + // Factions header
      this.reputation.factions.length * 15;
    this.repMaxScroll = Math.max(0, contentH - listH);
    this.repScroll = Math.min(Math.max(0, this.repScroll), this.repMaxScroll);

    ctx.save();
    ctx.beginPath();
    ctx.rect(x, listTop, w, listH);
    ctx.clip();

    ctx.font = FONT;
    let ry = listTop - this.repScroll;

    // --- Stations first (non-zero only) ---
    ctx.fillStyle = "rgba(140, 165, 195, 0.8)";
    ctx.fillText("Stations", x, ry);
    ry += 16;

    if (this.reputation.stations.length === 0) {
      ctx.fillStyle = "rgba(120, 140, 165, 0.75)";
      ctx.fillText("None above Neutral yet.", x + 8, ry);
      ry += 15;
    } else {
      for (const s of this.reputation.stations) {
        const name =
          s.name.length > 22 ? `${s.name.slice(0, 21)}…` : s.name;
        ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
        ctx.fillText(name, x + 8, ry);
        ctx.fillStyle = stationStandingColor(s.score);
        ctx.textAlign = "right";
        ctx.fillText(formatStanding(s.score), x + w - 4, ry);
        ctx.textAlign = "left";
        ry += 15;
      }
    }

    ry += 8;

    // --- Factions (always-visible + revealed) ---
    ctx.fillStyle = "rgba(140, 165, 195, 0.8)";
    ctx.fillText("Factions", x, ry);
    ry += 16;

    for (const f of this.reputation.factions) {
      ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
      ctx.fillText(f.label, x + 8, ry);
      ctx.fillStyle = pirateStandingColor(f.score);
      ctx.textAlign = "right";
      ctx.fillText(formatPirateStanding(f.score), x + w - 4, ry);
      ctx.textAlign = "left";
      ry += 15;
    }

    ctx.restore();

    this.drawBandScrollbar(
      ctx,
      x,
      listTop,
      w,
      listH,
      this.repScroll,
      this.repMaxScroll,
      contentH,
    );
  }

  private drawMissionConfirm(
    ctx: CanvasRenderingContext2D,
    panel: Rect,
    pointerX: number,
    pointerY: number,
  ): void {
    const c = this.missionConfirm!;
    ctx.fillStyle = "rgba(0, 0, 0, 0.55)";
    ctx.fillRect(panel.x, panel.y, panel.w, panel.h);

    const boxW = Math.min(420, panel.w - 40);
    const boxH = 160;
    const box: Rect = {
      x: panel.x + Math.floor((panel.w - boxW) / 2),
      y: panel.y + Math.floor((panel.h - boxH) / 2),
      w: boxW,
      h: boxH,
    };
    drawPanel(ctx, box);

    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Eject mission cargo?", box.x + 20, box.y + 18);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(200, 210, 230, 0.9)";
    ctx.fillText(
      "Are you sure you want to eject mission cargo?",
      box.x + 20,
      box.y + 50,
    );
    ctx.fillStyle = "rgba(210, 170, 120, 0.95)";
    ctx.fillText(`${c.name}  ·  ${c.cu} CU`, box.x + 20, box.y + 74);

    this.confirmYesBtn = { x: box.x + 20, y: box.y + box.h - 50, w: 110, h: 34 };
    this.confirmNoBtn = {
      x: box.x + 144,
      y: box.y + box.h - 50,
      w: 100,
      h: 34,
    };
    drawButton(ctx, this.confirmYesBtn, "Confirm", {
      primary: true,
      hover: hit(this.confirmYesBtn, pointerX, pointerY),
    });
    drawButton(ctx, this.confirmNoBtn, "Cancel", {
      hover: hit(this.confirmNoBtn, pointerX, pointerY),
    });
  }

  private syncEjectQty(cargo: CargoHold | null): void {
    if (!cargo) {
      this.ejectQty.clear();
      return;
    }
    const seen = new Set<string>();
    for (const lot of cargo.list()) {
      seen.add(lot.id);
      const cur = this.ejectQty.get(lot.id) ?? 1;
      this.ejectQty.set(lot.id, Math.min(lot.cu, Math.max(1, cur)));
    }
    for (const id of [...this.ejectQty.keys()]) {
      if (!seen.has(id)) this.ejectQty.delete(id);
    }
  }

  private drawCompareColumn(
    ctx: CanvasRenderingContext2D,
    x: number,
    y: number,
    w: number,
    maxH: number,
    title: string,
    mod: EquipModule | null,
    compareAgainst: EquipModule | null,
    loadout: ShipLoadout,
    showDeltas: boolean,
  ): void {
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - 2, y - 2, w + 4, maxH + 4);
    ctx.clip();

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
      ctx.restore();
      return;
    }

    ctx.font = FONT;
    ctx.fillStyle = "rgba(200, 220, 245, 0.95)";
    ctx.fillText(moduleDetailTitle(mod), x, y + 28);

    ctx.fillStyle = "rgba(140, 160, 190, 0.85)";
    const blurbLines = wrapText(mod.blurb, Math.max(18, Math.floor(w / 7)));
    let by = y + 50;
    const bottom = y + maxH - 4;
    for (const line of blurbLines.slice(0, 2)) {
      if (by + 16 > bottom) break;
      ctx.fillText(line, x, by);
      by += 16;
    }

    by += 8;
    const rows = moduleStatRows(mod, loadout);
    const otherRows =
      showDeltas && compareAgainst && compareAgainst.kind === mod.kind
        ? moduleStatRows(compareAgainst, loadout)
        : null;

    for (let i = 0; i < rows.length; i += 1) {
      if (by + 18 > bottom) break;
      const row = rows[i]!;
      ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
      ctx.fillText(`${row.label}  ${row.text}`, x, by);

      if (otherRows && compareAgainst) {
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
            const crossAmmo =
              row.label === "Ammunition" &&
              mod.kind === "weapon" &&
              compareAgainst.kind === "weapon" &&
              mod.family !== compareAgainst.family;
            const label = row.lowerIsBetter
              ? formatSignedSeconds(delta)
              : formatDelta(delta);
            const tw = ctx.measureText(`${row.label}  ${row.text}`).width;
            if (crossAmmo) {
              ctx.fillStyle = "rgba(150, 200, 255, 0.95)";
            } else if (row.lowerIsBetter) {
              ctx.fillStyle =
                delta < 0
                  ? "rgba(90, 210, 130, 0.95)"
                  : "rgba(230, 100, 100, 0.95)";
            } else {
              ctx.fillStyle =
                delta > 0
                  ? "rgba(90, 210, 130, 0.95)"
                  : "rgba(230, 100, 100, 0.95)";
            }
            ctx.fillText(label, x + tw + 8, by);
          }
        }
      }
      by += 18;
    }

    if (by + 18 <= bottom) {
      by += 4;
      ctx.fillStyle = "rgba(160, 180, 210, 0.8)";
      ctx.fillText(`List  ${mod.price} cr`, x, by);
    }
    ctx.restore();
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
      const raw = moduleStockLabel(offer);
      const base = raw.length > 18 ? `${raw.slice(0, 17)}…` : raw;
      const name = installed ? `${base} ✓` : base;
      ctx.fillText(name, row.x + 8, row.y + row.h / 2);
      oy += rowH;
    });

    const offer = this.offers[this.selectedOfferIndex]!;
    const installed = slot.equipped?.id === offer.id;
    const cost = applyBayDiscount(
      swapCost(slot.equipped, offer),
      this.bayDiscount,
    );
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
        : this.bayDiscount > 0
          ? `${cost} cr (rep discount)`
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
    if (this.missionConfirm) {
      if (hit(this.confirmYesBtn, px, py)) {
        const c = this.missionConfirm;
        this.missionConfirm = null;
        return { action: "eject", commodityId: c.commodityId, cu: c.cu };
      }
      if (hit(this.confirmNoBtn, px, py)) {
        this.missionConfirm = null;
        return null;
      }
      return null;
    }

    if (hit(this.closeBtn, px, py)) return "close";
    if (this.mode === "view" && this.distressBtn.w > 0 && hit(this.distressBtn, px, py)) {
      return { action: "distress" };
    }

    for (let i = 0; i < this.slotRects.length; i += 1) {
      if (hit(this.slotRects[i]!, px, py) && loadout.slots[i]) {
        this.selectedIndex = i;
        this.selectedOfferIndex = 0;
        return null;
      }
    }

    if (this.mode === "view") {
      // Only hit rows inside the clipped list (ignore scrolled-off fragments).
      if (hit(this.missionsListRect, px, py)) {
        for (const btn of this.missionCancelBtns) {
          if (hit(btn.rect, px, py)) {
            return { action: "cancelMission", missionId: btn.missionId };
          }
        }
      }

      if (hit(this.cargoListRect, px, py)) {
        for (const row of this.cargoRows) {
          const lot = cargo?.list().find((l) => l.id === row.commodityId);
          if (!lot) continue;
          const qty = this.ejectQty.get(row.commodityId) ?? 1;

          if (hit(row.minus, px, py) && qty > 1) {
            this.ejectQty.set(row.commodityId, qty - 1);
            return null;
          }
          if (hit(row.plus, px, py) && qty < lot.cu) {
            this.ejectQty.set(row.commodityId, qty + 1);
            return null;
          }
          if (hit(row.eject, px, py)) {
            const amount = Math.min(qty, lot.cu);
            if (amount <= 0) return null;
            if (isMissionCargoId(lot.id)) {
              this.missionConfirm = {
                commodityId: lot.id,
                name: lot.name,
                cu: amount,
              };
              return null;
            }
            return { action: "eject", commodityId: lot.id, cu: amount };
          }
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

function truncate(
  text: string,
  maxWidth: number,
  ctx: CanvasRenderingContext2D,
): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let s = text;
  while (s.length > 1 && ctx.measureText(`${s}…`).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return `${s}…`;
}

function moduleStatRows(mod: EquipModule, loadout: ShipLoadout): StatRow[] {
  if (mod.kind === "weapon") return weaponStatRows(mod, loadout);
  if (mod.kind === "drive") {
    const turnDeg = (mod.turnRate * 180) / Math.PI;
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
        text: `${mod.maxJumpRange} ly`,
        value: mod.maxJumpRange,
      },
      {
        label: "Fuel tank",
        text: `${mod.fuelCapacity}`,
        value: mod.fuelCapacity,
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
      label: "Plating",
      text: `${mod.hullBonus}`,
      value: mod.hullBonus,
    },
    {
      label: "Cargo",
      text: `${mod.cargoCapacity} CU`,
      value: mod.cargoCapacity,
    },
    {
      label: "Passengers",
      text:
        mod.passengerCapacity > 0
          ? `${mod.passengerCapacity} berth${mod.passengerCapacity === 1 ? "" : "s"}`
          : "—",
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
    {
      label: "Fuel tank",
      text: mod.fuelCapacity > 0 ? `+${mod.fuelCapacity}` : "—",
      value: mod.fuelCapacity,
    },
    {
      label: "Fuel scoop",
      text: mod.fuelScoop ? "Yes" : "—",
      value: mod.fuelScoop ? 1 : 0,
    },
    {
      label: "POI survey",
      text: mod.poiScan ? "Yes" : "—",
      value: mod.poiScan ? 1 : 0,
    },
  ];
}

function weaponStatRows(mod: WeaponModule, loadout: ShipLoadout): StatRow[] {
  let ammo = mod.ammoMax === null ? Number.POSITIVE_INFINITY : mod.ammoMax;
  for (const slot of loadout.slots) {
    if (slot.equipped === mod) {
      ammo = loadout.ammoIn(slot.id);
      break;
    }
  }
  const rof = rateOfFire(mod.fireCooldown);
  const shieldPct = Math.round(mod.shieldMultiplier * 100);
  const trackDeg = (mod.trackingTurn * 180) / Math.PI;
  return [
    {
      label: "Ammunition",
      text: formatAmmo(mod.ammoMax, ammo),
      value: mod.ammoMax,
    },
    {
      label: "Damage",
      text: mod.family === "gun" ? `${mod.damage} / chunk` : `${mod.damage}`,
      value: mod.damage,
    },
    {
      label: "Shield hit",
      text: `${shieldPct}%`,
      value: shieldPct,
    },
    {
      label: "Rate of fire",
      text: `${rof.toFixed(2)} /s`,
      value: rof,
    },
    {
      label: "Time on target",
      text: mod.family === "gun" ? `${mod.timeOnTarget.toFixed(2)} s` : "—",
      // Raw seconds. A negative delta is a shorter chunk timer (an upgrade).
      value: mod.family === "gun" ? mod.timeOnTarget : null,
      lowerIsBetter: mod.family === "gun",
    },
    {
      label: "Tracking",
      text: mod.family === "missile" ? `${trackDeg.toFixed(0)}°/s` : "—",
      value: mod.family === "missile" ? trackDeg : null,
    },
  ];
}

/** Signed seconds, two decimals, so a shorter gun timer reads as a reduction. */
function formatSignedSeconds(delta: number): string {
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)} s`;
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

function stationStandingColor(score: number): string {
  const band = standingBand(score);
  switch (band) {
    case "hostile":
      return "rgba(220, 100, 95, 0.95)";
    case "violation":
      return "rgba(220, 140, 90, 0.95)";
    case "unfriendly":
      return "rgba(210, 170, 120, 0.95)";
    case "friendly":
      return "rgba(160, 200, 170, 0.9)";
    case "allied":
      return "rgba(140, 210, 160, 0.95)";
    default:
      return "rgba(160, 180, 200, 0.85)";
  }
}

function pirateStandingColor(score: number): string {
  const band = pirateStandingBand(score);
  switch (band) {
    case "hostile":
      return "rgba(220, 100, 95, 0.95)";
    case "unfriendly":
      return "rgba(210, 170, 120, 0.95)";
    case "friendly":
      return "rgba(160, 200, 170, 0.9)";
    case "allied":
      return "rgba(140, 210, 160, 0.95)";
    default:
      return "rgba(160, 180, 200, 0.85)";
  }
}
