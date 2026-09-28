import type { ActiveMission, MissionOffer } from "../ship/missions";
import { missionStatusLine } from "../ship/missions";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type MissionBoardClickResult =
  | "close"
  | { action: "accept"; missionId: string }
  | { action: "claim"; missionId: string }
  | { action: "cancel"; missionId: string }
  | null;

interface OfferRow {
  missionId: string;
  kind: "offer" | "active";
  acceptBtn: Rect;
  claimBtn: Rect;
  cancelBtn: Rect;
}

/**
 * Docked mission board — browse offers, accept contracts, claim completed pay.
 */
export class MissionBoardMenu {
  open = false;
  stationName = "";
  private offers: MissionOffer[] = [];
  private active: ActiveMission[] = [];
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rows: OfferRow[] = [];
  private scroll = 0;
  private freeCu = 0;
  private canAcceptMore = true;
  private hasScoop = false;
  /** Expanded Fuel Tank fitted — required for Fuel Rat distress contracts. */
  private hasExpandedFuelTank = false;

  show(
    stationName: string,
    offers: MissionOffer[],
    active: ActiveMission[],
    freeCu: number,
    canAcceptMore: boolean,
    hasScoop = false,
    hasExpandedFuelTank = false,
  ): void {
    this.open = true;
    this.stationName = stationName;
    this.offers = offers;
    this.active = active;
    this.freeCu = freeCu;
    this.canAcceptMore = canAcceptMore;
    this.hasScoop = hasScoop;
    this.hasExpandedFuelTank = hasExpandedFuelTank;
    this.scroll = 0;
  }

  /** Refresh list state without closing (after accept/claim). */
  refresh(
    offers: MissionOffer[],
    active: ActiveMission[],
    freeCu: number,
    canAcceptMore: boolean,
    hasScoop = false,
    hasExpandedFuelTank = false,
  ): void {
    if (!this.open) return;
    this.offers = offers;
    this.active = active;
    this.freeCu = freeCu;
    this.canAcceptMore = canAcceptMore;
    this.hasScoop = hasScoop;
    this.hasExpandedFuelTank = hasExpandedFuelTank;
  }

  hide(): void {
    this.open = false;
    this.offers = [];
    this.active = [];
    this.rows = [];
  }

  draw(
    ctx: CanvasRenderingContext2D,
    credits: number,
    width: number,
    height: number,
    pointerX: number,
    pointerY: number,
  ): void {
    if (!this.open) return;

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);

    const panelW = Math.min(720, width - 40);
    const panelH = Math.min(540, height - 40);
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
    ctx.fillText("Mission Board", panel.x + 20, panel.y + 16);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(150, 175, 210, 0.8)";
    ctx.fillText(this.stationName, panel.x + 20, panel.y + 40);
    ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
    ctx.fillText(
      `CR ${credits}   ·   Free CU ${this.freeCu}`,
      panel.x + panel.w - 240,
      panel.y + 22,
    );

    const listTop = panel.y + 68;
    const footerY = panel.y + panel.h - 50;
    const rowH = 78;
    const visibleH = footerY - listTop - 8;

    type ListItem =
      | { kind: "section"; title: string }
      | { kind: "offer"; mission: MissionOffer }
      | { kind: "active"; mission: ActiveMission };

    /** Preferred faction section order on the board. */
    const factionSectionOrder = [
      "Fuel Rats",
      "Merchants Guild",
      "Cartographers",
    ];
    const factionOffers = this.offers.filter((m) => !!m.factionId);
    const stationOffers = this.offers.filter((m) => !m.factionId);
    const byFaction = new Map<string, MissionOffer[]>();
    for (const m of factionOffers) {
      const label = m.factionLabel ?? "Faction";
      const list = byFaction.get(label) ?? [];
      list.push(m);
      byFaction.set(label, list);
    }
    const factionLabels = [
      ...factionSectionOrder.filter((l) => byFaction.has(l)),
      ...[...byFaction.keys()].filter((l) => !factionSectionOrder.includes(l)),
    ];

    const items: ListItem[] = [];
    if (this.active.length > 0) {
      items.push({ kind: "section", title: "Active contracts" });
      for (const m of this.active) items.push({ kind: "active", mission: m });
    }
    items.push({ kind: "section", title: "Faction quests" });
    if (factionLabels.length === 0) {
      items.push({ kind: "section", title: "  (none available)" });
    } else {
      for (const label of factionLabels) {
        items.push({ kind: "section", title: `  ${label}` });
        for (const m of byFaction.get(label) ?? []) {
          items.push({ kind: "offer", mission: m });
        }
      }
    }
    items.push({ kind: "section", title: "Station contracts" });
    if (stationOffers.length === 0) {
      items.push({ kind: "section", title: "  (none available)" });
    } else {
      for (const m of stationOffers) items.push({ kind: "offer", mission: m });
    }

    const contentH = items.reduce(
      (h, it) => h + (it.kind === "section" ? 28 : rowH),
      0,
    );
    const maxScroll = Math.max(0, contentH - visibleH);
    this.scroll = Math.min(this.scroll, maxScroll);

    this.rows = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(panel.x + 8, listTop, panel.w - 16, visibleH);
    ctx.clip();

    let y = listTop - this.scroll;
    for (const item of items) {
      if (item.kind === "section") {
        if (y + 28 >= listTop && y <= listTop + visibleH) {
          ctx.font = FONT;
          ctx.fillStyle = "rgba(140, 165, 195, 0.75)";
          ctx.textBaseline = "top";
          ctx.fillText(item.title, panel.x + 20, y + 6);
        }
        y += 28;
        continue;
      }

      if (y + rowH >= listTop && y <= listTop + visibleH) {
        if (item.kind === "offer") {
          this.drawOfferRow(ctx, item.mission, panel.x, y, panel.w, pointerX, pointerY);
        } else {
          this.drawActiveRow(ctx, item.mission, panel.x, y, panel.w, pointerX, pointerY);
        }
      }
      y += rowH;
    }
    ctx.restore();

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

  private drawOfferRow(
    ctx: CanvasRenderingContext2D,
    mission: MissionOffer,
    panelX: number,
    y: number,
    panelW: number,
    pointerX: number,
    pointerY: number,
  ): void {
    ctx.fillStyle = "rgba(20, 28, 40, 0.55)";
    ctx.fillRect(panelX + 14, y, panelW - 28, 70);

    // Leave a clear gutter before the Accept column so long blurbs never overlap.
    const acceptBtn: Rect = {
      x: panelX + panelW - 130,
      y: y + 18,
      w: 96,
      h: 32,
    };
    const textX = panelX + 24;
    const textMaxW = acceptBtn.x - textX - 12;

    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
    // Faction section headers already name the guild; keep title clean.
    ctx.fillText(truncateToWidth(ctx, mission.title, textMaxW), textX, y + 8);
    ctx.fillStyle = "rgba(150, 175, 210, 0.85)";
    ctx.fillText(truncateToWidth(ctx, mission.blurb, textMaxW), textX, y + 28);
    ctx.fillStyle = "rgba(180, 210, 160, 0.9)";
    const rewardLine =
      mission.kind === "distressAnswer"
        ? "Fuel Rats reputation"
        : mission.kind === "cargo"
          ? `+${mission.reward} cr · Merchants Guild`
          : mission.kind === "explore"
            ? `+${mission.reward} cr · Cartographers`
            : `+${mission.reward} cr`;
    ctx.fillText(truncateToWidth(ctx, rewardLine, textMaxW), textX, y + 48);

    const needCu =
      mission.kind === "cargo" || mission.kind === "derelictCargo"
        ? (mission.cu ?? 0)
        : 0;
    const cargoOk = needCu === 0 || this.freeCu >= needCu;
    const scoopOk =
      mission.kind !== "derelictCargo" || this.hasScoop;
    const tankOk =
      mission.kind !== "distressAnswer" || this.hasExpandedFuelTank;
    const clearanceBusy =
      mission.kind === "clearance" &&
      this.active.some((m) => m.kind === "clearance");
    const slotOk =
      mission.kind === "clearance"
        ? !clearanceBusy
        : this.canAcceptMore;
    const enabled = slotOk && cargoOk && scoopOk && tankOk;
    const label = !enabled
      ? clearanceBusy
        ? "Active"
        : !tankOk
          ? "Need tank"
          : !scoopOk
            ? "Need Scoop"
            : cargoOk
              ? "Full"
              : "Need CU"
      : "Accept";
    drawButton(ctx, acceptBtn, label, {
      enabled,
      primary: enabled,
      hover: enabled && hit(acceptBtn, pointerX, pointerY),
    });
    this.rows.push({
      missionId: mission.id,
      kind: "offer",
      acceptBtn,
      claimBtn: { x: 0, y: 0, w: 0, h: 0 },
      cancelBtn: { x: 0, y: 0, w: 0, h: 0 },
    });
  }

  private drawActiveRow(
    ctx: CanvasRenderingContext2D,
    mission: ActiveMission,
    panelX: number,
    y: number,
    panelW: number,
    pointerX: number,
    pointerY: number,
  ): void {
    ctx.fillStyle = "rgba(28, 36, 28, 0.55)";
    ctx.fillRect(panelX + 14, y, panelW - 28, 70);

    const canClaim = mission.status === "readyToClaim";
    const cancelBtn: Rect = {
      x: panelX + panelW - 230,
      y: y + 18,
      w: 88,
      h: 32,
    };
    const claimBtn: Rect = {
      x: panelX + panelW - 130,
      y: y + 18,
      w: 96,
      h: 32,
    };
    // Text stops before Cancel so status lines never collide with buttons.
    const textX = panelX + 24;
    const textMaxW = cancelBtn.x - textX - 12;

    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
    ctx.fillText(truncateToWidth(ctx, mission.title, textMaxW), textX, y + 8);
    ctx.fillStyle = "rgba(150, 175, 210, 0.85)";
    ctx.fillText(
      truncateToWidth(ctx, missionStatusLine(mission), textMaxW),
      textX,
      y + 28,
    );
    ctx.fillStyle = "rgba(180, 210, 160, 0.9)";
    const activeReward =
      mission.kind === "distressAnswer"
        ? "Fuel Rats reputation"
        : mission.kind === "cargo"
          ? `+${mission.reward} cr · Merchants Guild`
          : mission.kind === "explore"
            ? `+${mission.reward} cr · Cartographers`
            : `+${mission.reward} cr`;
    ctx.fillText(truncateToWidth(ctx, activeReward, textMaxW), textX, y + 48);

    drawButton(ctx, cancelBtn, "Cancel", {
      hover: hit(cancelBtn, pointerX, pointerY),
    });
    drawButton(ctx, claimBtn, canClaim ? "Claim" : "Active", {
      enabled: canClaim,
      primary: canClaim,
      hover: canClaim && hit(claimBtn, pointerX, pointerY),
    });
    this.rows.push({
      missionId: mission.id,
      kind: "active",
      acceptBtn: { x: 0, y: 0, w: 0, h: 0 },
      claimBtn,
      cancelBtn,
    });
  }

  handleClick(px: number, py: number): MissionBoardClickResult {
    if (!this.open) return null;
    if (hit(this.closeBtn, px, py)) return "close";
    for (const row of this.rows) {
      if (row.kind === "offer" && hit(row.acceptBtn, px, py)) {
        return { action: "accept", missionId: row.missionId };
      }
      if (row.kind === "active" && hit(row.cancelBtn, px, py)) {
        return { action: "cancel", missionId: row.missionId };
      }
      if (row.kind === "active" && hit(row.claimBtn, px, py)) {
        return { action: "claim", missionId: row.missionId };
      }
    }
    return null;
  }
}

/** Ellipsis-truncate so mission copy never paints under action buttons. */
function truncateToWidth(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string {
  if (maxWidth <= 0) return "";
  if (ctx.measureText(text).width <= maxWidth) return text;
  const ellipsis = "…";
  let s = text;
  while (s.length > 1 && ctx.measureText(s + ellipsis).width > maxWidth) {
    s = s.slice(0, -1);
  }
  return s.length === 0 ? ellipsis : s + ellipsis;
}
