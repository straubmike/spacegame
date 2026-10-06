import type { CargoHold } from "../ship/CargoHold";
import type { MarketListing, StationMarket } from "../ship/market";
import type { ActiveMission, MissionOffer } from "../ship/missions";
import {
  ABANDONED_DERELICT_CARGO_ID,
  isDerelictRetrievalKind,
  isSurveyMissionKind,
  missionStatusLine,
  rebelCoverNeedsRegularSlot,
  stolenCargoId,
} from "../ship/missions";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type MarketClickResult =
  | "close"
  | { action: "buy"; commodityId: string; cu: number }
  | { action: "sell"; commodityId: string; cu: number }
  | { action: "acceptMission"; missionId: string }
  | { action: "claimMission"; missionId: string }
  | null;

export interface RebelMarketGates {
  rebelSlotFree: boolean;
  coverSlotFree: boolean;
  hasScoop: boolean;
  hasScanner: boolean;
}

interface RowWidgets {
  commodityId: string;
  buyMinus: Rect;
  buyPlus: Rect;
  buyBtn: Rect;
  sellMinus: Rect;
  sellPlus: Rect;
  sellBtn: Rect;
}

interface JobWidget {
  missionId: string;
  action: "acceptMission" | "claimMission";
  btn: Rect;
  enabled: boolean;
}

/**
 * Docked cargo exchange — buy/sell CU of station commodities.
 * Reused for Black Market with title "Black Market".
 */
export class MarketMenu {
  open = false;
  stationName = "";
  /** Panel heading — "Market" or "Black Market". */
  title = "Market";
  market: StationMarket | null = null;
  /** Pending purchase qty per commodity. */
  private buyQty = new Map<string, number>();
  /** Pending sell qty per commodity. */
  private sellQty = new Map<string, number>();
  private closeBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private rows: RowWidgets[] = [];
  private scroll = 0;
  /** Clip rect for the commodity list (set each draw). */
  private listRect: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private maxScroll = 0;
  private readonly rowH = 52;
  private readonly jobRowH = 78;
  /** Rebel contracts shown on the black market after Rebels are revealed. */
  private rebelOffers: MissionOffer[] = [];
  private rebelActive: ActiveMission[] = [];
  private rebelGates: RebelMarketGates = {
    rebelSlotFree: true,
    coverSlotFree: true,
    hasScoop: false,
    hasScanner: false,
  };
  private jobWidgets: JobWidget[] = [];

  show(
    stationName: string,
    market: StationMarket,
    title = "Market",
  ): void {
    this.open = true;
    this.stationName = stationName;
    this.market = market;
    this.title = title;
    this.buyQty.clear();
    this.sellQty.clear();
    this.scroll = 0;
    this.rebelOffers = [];
    this.rebelActive = [];
    this.jobWidgets = [];
    for (const listing of market.listings) {
      this.buyQty.set(listing.commodityId, 0);
      this.sellQty.set(listing.commodityId, 0);
    }
  }

  /** Offers to accept, and active rebel jobs (Claim when this dock can pay them). */
  setRebelJobs(
    offers: MissionOffer[],
    active: ActiveMission[],
    gates: RebelMarketGates,
  ): void {
    this.rebelOffers = offers;
    this.rebelActive = active;
    this.rebelGates = gates;
  }

  hide(): void {
    this.open = false;
    this.market = null;
    this.rows = [];
    this.jobWidgets = [];
    this.rebelOffers = [];
    this.rebelActive = [];
  }

  draw(
    ctx: CanvasRenderingContext2D,
    cargo: CargoHold,
    credits: number,
    width: number,
    height: number,
    pointerX: number,
    pointerY: number,
  ): void {
    if (!this.open || !this.market) return;

    ctx.fillStyle = "rgba(0, 0, 0, 0.45)";
    ctx.fillRect(0, 0, width, height);

    const jobCount = this.rebelOffers.length + this.rebelActive.length;
    const panelW = Math.min(780, width - 40);
    const panelH = Math.min(jobCount > 0 ? 640 : 520, height - 40);
    const panel: Rect = {
      x: Math.floor((width - panelW) / 2),
      y: Math.floor((height - panelH) / 2),
      w: panelW,
      h: panelH,
    };
    drawPanel(ctx, panel);

    ctx.font = FONT_TITLE;
    const isBlack = this.title === "Black Market";
    ctx.fillStyle = isBlack
      ? "rgba(230, 175, 140, 0.95)"
      : "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText(this.title, panel.x + 20, panel.y + 16);

    ctx.font = FONT;
    ctx.fillStyle = "rgba(150, 175, 210, 0.8)";
    ctx.fillText(this.stationName, panel.x + 20, panel.y + 40);
    ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
    ctx.fillText(
      `CR ${credits}   ·   Hold ${cargo.usedCu}/${cargo.capacityCu} CU`,
      panel.x + panel.w - 280,
      panel.y + 22,
    );

    const showJobs = this.title === "Black Market" && jobCount > 0;
    const headerY = panel.y + 64;
    if (!showJobs) {
      ctx.fillStyle = "rgba(140, 165, 195, 0.75)";
      ctx.fillText("Commodity", panel.x + 20, headerY);
      ctx.fillText("You buy", panel.x + 200, headerY);
      ctx.fillText("You sell", panel.x + 480, headerY);
    }

    const listTop = showJobs ? headerY : headerY + 22;
    const footerY = panel.y + panel.h - 50;
    const rowH = this.rowH;
    const visibleH = footerY - listTop - 8;
    // Sensitive Derelict Cargo is sell-only and only listed when carried.
    const listings =
      this.title === "Black Market"
        ? this.market.listings.filter((l) =>
            visibleBlackMarketListing(l, cargo),
          )
        : this.market.listings;
    const jobBlockH = showJobs
      ? 22 + jobCount * this.jobRowH + 22
      : 0;
    const contentH = jobBlockH + listings.length * rowH;
    this.listRect = {
      x: panel.x + 8,
      y: listTop,
      w: panel.w - 16,
      h: visibleH,
    };
    this.maxScroll = Math.max(0, contentH - visibleH);
    this.scroll = Math.min(Math.max(0, this.scroll), this.maxScroll);

    this.rows = [];
    this.jobWidgets = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.listRect.x, this.listRect.y, this.listRect.w, this.listRect.h);
    ctx.clip();

    let y = listTop - this.scroll;
    if (showJobs) {
      if (y + 22 >= listTop && y <= listTop + visibleH) {
        ctx.font = FONT;
        ctx.fillStyle = "rgba(210, 160, 120, 0.9)";
        ctx.textBaseline = "top";
        ctx.fillText("Rebel contracts", panel.x + 20, y + 2);
      }
      y += 22;
      for (const mission of this.rebelOffers) {
        if (y + this.jobRowH >= listTop && y <= listTop + visibleH) {
          this.drawRebelOfferRow(
            ctx,
            mission,
            panel.x,
            y,
            panel.w,
            pointerX,
            pointerY,
          );
        }
        y += this.jobRowH;
      }
      for (const mission of this.rebelActive) {
        if (y + this.jobRowH >= listTop && y <= listTop + visibleH) {
          this.drawRebelActiveRow(
            ctx,
            mission,
            panel.x,
            y,
            panel.w,
            pointerX,
            pointerY,
          );
        }
        y += this.jobRowH;
      }
      if (y + 22 >= listTop && y <= listTop + visibleH) {
        ctx.font = FONT;
        ctx.fillStyle = "rgba(140, 165, 195, 0.75)";
        ctx.textBaseline = "top";
        ctx.fillText("Commodity", panel.x + 20, y + 2);
        ctx.fillText("You buy", panel.x + 200, y + 2);
        ctx.fillText("You sell", panel.x + 480, y + 2);
      }
      y += 22;
    }

    listings.forEach((listing) => {
      if (y + rowH >= listTop && y <= listTop + visibleH) {
        this.drawRow(
          ctx,
          listing,
          cargo,
          credits,
          panel.x,
          y,
          panel.w,
          pointerX,
          pointerY,
        );
      }
      y += rowH;
    });
    ctx.restore();

    if (this.maxScroll > 0) {
      // Thin scrollbar so overflow is obvious.
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

  /**
   * Apply mouse-wheel delta (pixels) when the pointer is over the list
   * or the market panel. Returns true if scroll changed.
   */
  handleWheel(deltaY: number, px: number, py: number): boolean {
    if (!this.open || !this.market || this.maxScroll <= 0 || deltaY === 0) {
      return false;
    }
    // Accept wheel anywhere on the list or the wider panel so the catalog is easy to browse.
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

  private drawRebelOfferRow(
    ctx: CanvasRenderingContext2D,
    mission: MissionOffer,
    panelX: number,
    y: number,
    panelW: number,
    pointerX: number,
    pointerY: number,
  ): void {
    const btn: Rect = {
      x: panelX + panelW - 182,
      y: y + 22,
      w: 148,
      h: 32,
    };
    const textMaxW = btn.x - (panelX + 24) - 12;
    const needsCover = rebelCoverNeedsRegularSlot(mission.kind);
    const seatOk =
      this.rebelGates.rebelSlotFree &&
      (!needsCover || this.rebelGates.coverSlotFree);
    const scoopOk =
      !isDerelictRetrievalKind(mission.kind) || this.rebelGates.hasScoop;
    const scannerOk =
      !isSurveyMissionKind(mission.kind) || this.rebelGates.hasScanner;
    const enabled = seatOk && scoopOk && scannerOk;
    const label = enabled
      ? "Accept"
      : !this.rebelGates.rebelSlotFree
        ? "Full"
        : needsCover && !this.rebelGates.coverSlotFree
          ? "Requires slot"
          : !scannerOk
            ? "Requires Scanner"
            : !scoopOk
              ? "Requires Scoop"
              : "Full";
    this.paintJobRow(
      ctx,
      mission.title,
      mission.blurb,
      `+${mission.reward} cr`,
      panelX,
      y,
      panelW,
      textMaxW,
      btn,
      label,
      enabled,
      pointerX,
      pointerY,
    );
    this.jobWidgets.push({
      missionId: mission.id,
      action: "acceptMission",
      btn,
      enabled,
    });
  }

  private drawRebelActiveRow(
    ctx: CanvasRenderingContext2D,
    mission: ActiveMission,
    panelX: number,
    y: number,
    panelW: number,
    pointerX: number,
    pointerY: number,
  ): void {
    const btn: Rect = {
      x: panelX + panelW - 182,
      y: y + 22,
      w: 148,
      h: 32,
    };
    const textMaxW = btn.x - (panelX + 24) - 12;
    const enabled = mission.status === "readyToClaim";
    this.paintJobRow(
      ctx,
      mission.title,
      missionStatusLine(mission),
      `+${mission.reward} cr`,
      panelX,
      y,
      panelW,
      textMaxW,
      btn,
      enabled ? "Claim" : "Active",
      enabled,
      pointerX,
      pointerY,
    );
    this.jobWidgets.push({
      missionId: mission.id,
      action: "claimMission",
      btn,
      enabled,
    });
  }

  private paintJobRow(
    ctx: CanvasRenderingContext2D,
    title: string,
    detail: string,
    reward: string,
    panelX: number,
    y: number,
    panelW: number,
    textMaxW: number,
    btn: Rect,
    label: string,
    enabled: boolean,
    pointerX: number,
    pointerY: number,
  ): void {
    ctx.fillStyle = "rgba(36, 24, 18, 0.72)";
    ctx.fillRect(panelX + 12, y, panelW - 24, this.jobRowH - 8);
    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(240, 220, 200, 0.95)";
    ctx.fillText(truncateToWidth(ctx, title, textMaxW), panelX + 20, y + 6);
    ctx.fillStyle = "rgba(190, 165, 145, 0.9)";
    const lines = wrapTwo(ctx, detail, textMaxW);
    ctx.fillText(lines[0] ?? "", panelX + 20, y + 24);
    if (lines[1]) ctx.fillText(lines[1], panelX + 20, y + 40);
    ctx.fillStyle = "rgba(180, 210, 160, 0.9)";
    ctx.fillText(reward, panelX + 20, y + 56);
    drawButton(ctx, btn, label, {
      enabled,
      primary: enabled,
      hover: enabled && hit(btn, pointerX, pointerY),
    });
  }

  private drawRow(
    ctx: CanvasRenderingContext2D,
    listing: MarketListing,
    cargo: CargoHold,
    credits: number,
    panelX: number,
    y: number,
    panelW: number,
    pointerX: number,
    pointerY: number,
  ): void {
    const held =
      cargo.amountOf(listing.commodityId) +
      cargo.amountOf(stolenCargoId(listing.commodityId));
    const buyQ = this.buyQty.get(listing.commodityId) ?? 0;
    const sellQ = this.sellQty.get(listing.commodityId) ?? 0;

    ctx.fillStyle = "rgba(24, 32, 44, 0.55)";
    ctx.fillRect(panelX + 12, y, panelW - 24, 46);

    ctx.font = FONT;
    ctx.textBaseline = "top";
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.fillText(listing.name, panelX + 20, y + 8);
    const isDerelictFence = listing.commodityId === ABANDONED_DERELICT_CARGO_ID;
    if (isDerelictFence) {
      // No shortage / surplus / specialty — fence kickoff only.
      ctx.fillStyle = "rgba(130, 145, 165, 0.75)";
      ctx.fillText(`fence · hold ${held}`, panelX + 20, y + 26);
    } else {
      ctx.fillStyle = reasonColor(listing.priceReason);
      ctx.fillText(`${listing.priceReason} · hold ${held}`, panelX + 20, y + 26);
    }

    // Buy side (from station)
    const buyX = panelX + 200;
    const widgets: RowWidgets = {
      commodityId: listing.commodityId,
      buyMinus: emptyRect(),
      buyPlus: emptyRect(),
      buyBtn: emptyRect(),
      sellMinus: emptyRect(),
      sellPlus: emptyRect(),
      sellBtn: emptyRect(),
    };

    if (listing.playerBuyPrice !== null && listing.stock > 0) {
      ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
      ctx.fillText(
        `${listing.playerBuyPrice} cr/CU  ·  ${listing.stock} avail`,
        buyX,
        y + 6,
      );
      const maxBuy = maxBuyCu(listing, cargo, credits);
      widgets.buyMinus = { x: buyX, y: y + 24, w: 28, h: 20 };
      widgets.buyPlus = { x: buyX + 70, y: y + 24, w: 28, h: 20 };
      widgets.buyBtn = { x: buyX + 108, y: y + 22, w: 72, h: 24 };
      drawButton(ctx, widgets.buyMinus, "−", {
        enabled: buyQ > 0,
        hover: buyQ > 0 && hit(widgets.buyMinus, pointerX, pointerY),
      });
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(String(buyQ), buyX + 49, y + 34);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      drawButton(ctx, widgets.buyPlus, "+", {
        enabled: buyQ < maxBuy,
        hover: buyQ < maxBuy && hit(widgets.buyPlus, pointerX, pointerY),
      });
      const canBuy = buyQ > 0 && buyQ <= maxBuy;
      drawButton(ctx, widgets.buyBtn, "Buy", {
        primary: canBuy,
        enabled: canBuy,
        hover: canBuy && hit(widgets.buyBtn, pointerX, pointerY),
      });
    } else {
      ctx.fillStyle = "rgba(110, 125, 145, 0.7)";
      ctx.fillText("—", buyX, y + 16);
    }

    // Sell side (to station)
    const sellX = panelX + 480;
    if (listing.playerSellPrice !== null && listing.demand > 0) {
      ctx.fillStyle = "rgba(180, 200, 230, 0.9)";
      ctx.textBaseline = "top";
      ctx.fillText(
        `${listing.playerSellPrice} cr/CU  ·  want ${listing.demand}`,
        sellX,
        y + 6,
      );
      const maxSell = maxSellCu(listing, cargo);
      widgets.sellMinus = { x: sellX, y: y + 24, w: 28, h: 20 };
      widgets.sellPlus = { x: sellX + 70, y: y + 24, w: 28, h: 20 };
      widgets.sellBtn = { x: sellX + 108, y: y + 22, w: 72, h: 24 };
      drawButton(ctx, widgets.sellMinus, "−", {
        enabled: sellQ > 0,
        hover: sellQ > 0 && hit(widgets.sellMinus, pointerX, pointerY),
      });
      ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      ctx.fillText(String(sellQ), sellX + 49, y + 34);
      ctx.textAlign = "left";
      ctx.textBaseline = "top";
      drawButton(ctx, widgets.sellPlus, "+", {
        enabled: sellQ < maxSell,
        hover: sellQ < maxSell && hit(widgets.sellPlus, pointerX, pointerY),
      });
      const canSell = sellQ > 0 && sellQ <= maxSell;
      drawButton(ctx, widgets.sellBtn, "Sell", {
        primary: canSell,
        enabled: canSell,
        hover: canSell && hit(widgets.sellBtn, pointerX, pointerY),
      });
    } else {
      ctx.fillStyle = "rgba(110, 125, 145, 0.7)";
      ctx.textBaseline = "top";
      ctx.fillText(held > 0 ? "No demand" : "—", sellX, y + 16);
    }

    this.rows.push(widgets);
  }

  handleClick(
    cargo: CargoHold,
    credits: number,
    px: number,
    py: number,
  ): MarketClickResult {
    if (!this.open || !this.market) return null;
    if (hit(this.closeBtn, px, py)) return "close";

    if (hit(this.listRect, px, py)) {
      for (const job of this.jobWidgets) {
        if (!job.enabled || !hit(job.btn, px, py)) continue;
        return { action: job.action, missionId: job.missionId };
      }
    }

    for (const row of this.rows) {
      const listing = this.market.listing(row.commodityId);
      if (!listing) continue;

      if (hit(row.buyMinus, px, py)) {
        const q = this.buyQty.get(row.commodityId) ?? 0;
        this.buyQty.set(row.commodityId, Math.max(0, q - 1));
        return null;
      }
      if (hit(row.buyPlus, px, py)) {
        const q = this.buyQty.get(row.commodityId) ?? 0;
        const max = maxBuyCu(listing, cargo, credits);
        this.buyQty.set(row.commodityId, Math.min(max, q + 1));
        return null;
      }
      if (hit(row.buyBtn, px, py)) {
        const q = this.buyQty.get(row.commodityId) ?? 0;
        const max = maxBuyCu(listing, cargo, credits);
        if (q > 0 && q <= max) {
          this.buyQty.set(row.commodityId, 0);
          return { action: "buy", commodityId: row.commodityId, cu: q };
        }
        return null;
      }
      if (hit(row.sellMinus, px, py)) {
        const q = this.sellQty.get(row.commodityId) ?? 0;
        this.sellQty.set(row.commodityId, Math.max(0, q - 1));
        return null;
      }
      if (hit(row.sellPlus, px, py)) {
        const q = this.sellQty.get(row.commodityId) ?? 0;
        const max = maxSellCu(listing, cargo);
        this.sellQty.set(row.commodityId, Math.min(max, q + 1));
        return null;
      }
      if (hit(row.sellBtn, px, py)) {
        const q = this.sellQty.get(row.commodityId) ?? 0;
        const max = maxSellCu(listing, cargo);
        if (q > 0 && q <= max) {
          this.sellQty.set(row.commodityId, 0);
          return { action: "sell", commodityId: row.commodityId, cu: q };
        }
        return null;
      }
    }
    return null;
  }
}

function maxBuyCu(
  listing: MarketListing,
  cargo: CargoHold,
  credits: number,
): number {
  if (listing.playerBuyPrice === null || listing.playerBuyPrice <= 0) return 0;
  const byCredits = Math.floor(credits / listing.playerBuyPrice);
  return Math.max(0, Math.min(listing.stock, cargo.freeCu, byCredits));
}

function maxSellCu(listing: MarketListing, cargo: CargoHold): number {
  if (listing.playerSellPrice === null) return 0;
  const held =
    cargo.amountOf(listing.commodityId) +
    cargo.amountOf(stolenCargoId(listing.commodityId));
  return Math.max(0, Math.min(listing.demand, held));
}

/** Sensitive Derelict Cargo is hull-gated; other BM lines always show. */
function visibleBlackMarketListing(
  listing: MarketListing,
  cargo: CargoHold,
): boolean {
  if (listing.commodityId !== ABANDONED_DERELICT_CARGO_ID) return true;
  const held =
    cargo.amountOf(listing.commodityId) +
    cargo.amountOf(stolenCargoId(listing.commodityId));
  return held > 0;
}

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

function wrapTwo(
  ctx: CanvasRenderingContext2D,
  text: string,
  maxWidth: number,
): string[] {
  if (maxWidth <= 0) return [];
  const words = text.split(/\s+/).filter(Boolean);
  if (words.length === 0) return [""];
  let line1 = "";
  let i = 0;
  while (i < words.length) {
    const word = words[i]!;
    const next = line1 ? `${line1} ${word}` : word;
    if (line1 && ctx.measureText(next).width > maxWidth) break;
    line1 = next;
    i += 1;
  }
  line1 = truncateToWidth(ctx, line1, maxWidth);
  if (i >= words.length) return [line1];
  return [line1, truncateToWidth(ctx, words.slice(i).join(" "), maxWidth)];
}

function emptyRect(): Rect {
  return { x: 0, y: 0, w: 0, h: 0 };
}

function reasonColor(reason: MarketListing["priceReason"]): string {
  switch (reason) {
    case "local specialty":
      return "rgba(120, 210, 160, 0.9)";
    case "local surplus":
    case "regional surplus":
      return "rgba(140, 195, 170, 0.85)";
    case "local shortage":
    case "neighbor demand":
      return "rgba(220, 170, 120, 0.9)";
    default:
      return "rgba(130, 145, 165, 0.75)";
  }
}
