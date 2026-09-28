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

/** Row pitch — title + two-line blurb + reward, with Accept gutter. */
const ROW_H = 92;
const ROW_INNER_H = 84;
const SECTION_H = 28;

/**
 * Docked mission board — browse offers, accept contracts, claim completed pay.
 * Offer list scrolls with the mouse wheel when the board overflows.
 */
export class MissionBoardMenu {
  open = false;
  stationName = "";
  private offers: MissionOffer[] = [];
  private active: ActiveMission[] = [];
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rows: OfferRow[] = [];
  private listRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private scroll = 0;
  private maxScroll = 0;
  private freeCu = 0;
  private freeBerths = 0;
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
    freeBerths = 0,
  ): void {
    this.open = true;
    this.stationName = stationName;
    this.offers = offers;
    this.active = active;
    this.freeCu = freeCu;
    this.freeBerths = freeBerths;
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
    freeBerths = 0,
  ): void {
    if (!this.open) return;
    this.offers = offers;
    this.active = active;
    this.freeCu = freeCu;
    this.freeBerths = freeBerths;
    this.canAcceptMore = canAcceptMore;
    this.hasScoop = hasScoop;
    this.hasExpandedFuelTank = hasExpandedFuelTank;
  }

  hide(): void {
    this.open = false;
    this.offers = [];
    this.active = [];
    this.rows = [];
    this.maxScroll = 0;
    this.scroll = 0;
  }

  /**
   * Apply mouse-wheel delta (pixels) when the pointer is over the offer list
   * or the board panel. Returns true if scroll changed.
   */
  handleWheel(deltaY: number, px: number, py: number): boolean {
    if (!this.open || this.maxScroll <= 0 || deltaY === 0) return false;
    const overList = hit(this.listRect, px, py);
    const overPanel =
      px >= this.listRect.x - 8 &&
      px <= this.listRect.x + this.listRect.w + 8 &&
      py >= this.listRect.y - 40 &&
      py <= this.listRect.y + this.listRect.h + 50;
    if (!overList && !overPanel) return false;

    const next = Math.min(
      this.maxScroll,
      Math.max(0, this.scroll + deltaY),
    );
    if (next === this.scroll) return false;
    this.scroll = next;
    return true;
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
      `CR ${credits}   ·   Free CU ${this.freeCu}   ·   Berths ${this.freeBerths}`,
      panel.x + panel.w - 320,
      panel.y + 22,
    );

    const listTop = panel.y + 68;
    const footerY = panel.y + panel.h - 50;
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
    items.push({ kind: "section", title: "Faction missions" });
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
      (h, it) => h + (it.kind === "section" ? SECTION_H : ROW_H),
      0,
    );
    this.listRect = {
      x: panel.x + 8,
      y: listTop,
      w: panel.w - 16,
      h: visibleH,
    };
    this.maxScroll = Math.max(0, contentH - visibleH);
    this.scroll = Math.min(Math.max(0, this.scroll), this.maxScroll);

    this.rows = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.listRect.x, this.listRect.y, this.listRect.w, this.listRect.h);
    ctx.clip();

    let y = listTop - this.scroll;
    for (const item of items) {
      if (item.kind === "section") {
        if (y + SECTION_H >= listTop && y <= listTop + visibleH) {
          ctx.font = FONT;
          ctx.fillStyle = "rgba(140, 165, 195, 0.75)";
          ctx.textBaseline = "top";
          ctx.fillText(item.title, panel.x + 20, y + 6);
        }
        y += SECTION_H;
        continue;
      }

      if (y + ROW_H >= listTop && y <= listTop + visibleH) {
        if (item.kind === "offer") {
          this.drawOfferRow(ctx, item.mission, panel.x, y, panel.w, pointerX, pointerY);
        } else {
          this.drawActiveRow(ctx, item.mission, panel.x, y, panel.w, pointerX, pointerY);
        }
      }
      y += ROW_H;
    }
    ctx.restore();

    if (this.maxScroll > 0) {
      const trackX = panel.x + panel.w - 14;
      const trackY = listTop;
      const trackH = visibleH;
      ctx.fillStyle = "rgba(40, 52, 70, 0.7)";
      ctx.fillRect(trackX, trackY, 4, trackH);
      const thumbH = Math.max(18, (visibleH / contentH) * trackH);
      const thumbY =
        trackY + (this.scroll / this.maxScroll) * (trackH - thumbH);
      ctx.fillStyle = "rgba(150, 175, 210, 0.75)";
      ctx.fillRect(trackX, thumbY, 4, thumbH);
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
    ctx.fillRect(panelX + 14, y, panelW - 28, ROW_INNER_H);

    // Leave a clear gutter before the Accept column so long blurbs never overlap.
    const acceptBtn: Rect = {
      x: panelX + panelW - 130,
      y: y + 26,
      w: 96,
      h: 32,
    };
    const textX = panelX + 24;
    const textMaxW = acceptBtn.x - textX - 12;

    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
    // Faction section headers already name the guild; keep title clean.
    ctx.fillText(truncateToWidth(ctx, mission.title, textMaxW), textX, y + 6);
    ctx.fillStyle = "rgba(150, 175, 210, 0.85)";
    const blurbLines = wrapBlurb(ctx, mission.blurb, textMaxW, 2);
    ctx.fillText(blurbLines[0] ?? "", textX, y + 24);
    if (blurbLines[1]) {
      ctx.fillText(blurbLines[1], textX, y + 40);
    }
    ctx.fillStyle = "rgba(180, 210, 160, 0.9)";
    const rewardLine =
      mission.kind === "distressAnswer"
        ? "Fuel Rats reputation"
        : mission.kind === "cargo"
          ? `+${mission.reward} cr · Merchants Guild`
          : mission.kind === "explore"
            ? `+${mission.reward} cr · Cartographers`
            : `+${mission.reward} cr`;
    ctx.fillText(truncateToWidth(ctx, rewardLine, textMaxW), textX, y + 60);

    const needCu =
      mission.kind === "cargo" || mission.kind === "derelictCargo"
        ? (mission.cu ?? 0)
        : 0;
    const needBerths =
      mission.kind === "passenger" ? (mission.passengers ?? 0) : 0;
    const cargoOk = needCu === 0 || this.freeCu >= needCu;
    const berthOk = needBerths === 0 || this.freeBerths >= needBerths;
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
    const enabled = slotOk && cargoOk && berthOk && scoopOk && tankOk;
    const label = !enabled
      ? clearanceBusy
        ? "Active"
        : !tankOk
          ? "Need tank"
          : !scoopOk
            ? "Need Scoop"
            : !berthOk
              ? "Need berths"
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
    ctx.fillRect(panelX + 14, y, panelW - 28, ROW_INNER_H);

    const canClaim = mission.status === "readyToClaim";
    const cancelBtn: Rect = {
      x: panelX + panelW - 230,
      y: y + 26,
      w: 88,
      h: 32,
    };
    const claimBtn: Rect = {
      x: panelX + panelW - 130,
      y: y + 26,
      w: 96,
      h: 32,
    };
    // Text stops before Cancel so status lines never collide with buttons.
    const textX = panelX + 24;
    const textMaxW = cancelBtn.x - textX - 12;

    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(210, 225, 245, 0.95)";
    ctx.fillText(truncateToWidth(ctx, mission.title, textMaxW), textX, y + 6);
    ctx.fillStyle = "rgba(150, 175, 210, 0.85)";
    const statusLines = wrapBlurb(ctx, missionStatusLine(mission), textMaxW, 2);
    ctx.fillText(statusLines[0] ?? "", textX, y + 24);
    if (statusLines[1]) {
      ctx.fillText(statusLines[1], textX, y + 40);
    }
    ctx.fillStyle = "rgba(180, 210, 160, 0.9)";
    const activeReward =
      mission.kind === "distressAnswer"
        ? "Fuel Rats reputation"
        : mission.kind === "cargo"
          ? `+${mission.reward} cr · Merchants Guild`
          : mission.kind === "explore"
            ? `+${mission.reward} cr · Cartographers`
            : `+${mission.reward} cr`;
    ctx.fillText(truncateToWidth(ctx, activeReward, textMaxW), textX, y + 60);

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
    // Ignore Accept/Claim/Cancel on scrolled-off fragments outside the list clip.
    const inList = hit(this.listRect, px, py);
    for (const row of this.rows) {
      if (row.kind === "offer" && inList && hit(row.acceptBtn, px, py)) {
        return { action: "accept", missionId: row.missionId };
      }
      if (row.kind === "active" && inList && hit(row.cancelBtn, px, py)) {
        return { action: "cancel", missionId: row.missionId };
      }
      if (row.kind === "active" && inList && hit(row.claimBtn, px, py)) {
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

/**
 * Word-wrap blurb/status into at most `maxLines` rows; ellipsis the last line
 * when content still overflows so more offers fit without burying copy.
 */
function wrapBlurb(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
  maxLines: number,
): string[] {
  if (maxWidth <= 0 || maxLines <= 0) return [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];

  const lines: string[] = [];
  let current = "";
  let i = 0;

  while (i < words.length && lines.length < maxLines) {
    const word = words[i]!;
    const next = current ? `${current} ${word}` : word;
    if (ctx.measureText(next).width <= maxWidth) {
      current = next;
      i += 1;
      continue;
    }

    if (current) {
      if (lines.length + 1 >= maxLines) {
        const rest = [current, ...words.slice(i)].join(" ");
        lines.push(truncateToWidth(ctx, rest, maxWidth));
        current = "";
        break;
      }
      lines.push(current);
      current = "";
      continue;
    }

    // Single token wider than the column — hard-break by character.
    let chunk = "";
    let consumed = false;
    for (const ch of word) {
      const tryChunk = chunk + ch;
      if (ctx.measureText(tryChunk).width > maxWidth && chunk) {
        if (lines.length + 1 >= maxLines) {
          lines.push(truncateToWidth(ctx, word, maxWidth));
          current = "";
          consumed = true;
          break;
        }
        lines.push(chunk);
        chunk = ch;
      } else {
        chunk = tryChunk;
      }
    }
    i += 1;
    if (consumed || lines.length >= maxLines) break;
    current = chunk;
  }
  if (current && lines.length < maxLines) {
    lines.push(current);
  }
  return lines.length > 0 ? lines : [""];
}
