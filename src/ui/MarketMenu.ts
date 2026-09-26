import type { CargoHold } from "../ship/CargoHold";
import type { MarketListing, StationMarket } from "../ship/market";
import { stolenCargoId } from "../ship/missions";
import { FONT, FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type MarketClickResult =
  | "close"
  | { action: "buy"; commodityId: string; cu: number }
  | { action: "sell"; commodityId: string; cu: number }
  | null;

interface RowWidgets {
  commodityId: string;
  buyMinus: Rect;
  buyPlus: Rect;
  buyBtn: Rect;
  sellMinus: Rect;
  sellPlus: Rect;
  sellBtn: Rect;
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
    for (const listing of market.listings) {
      this.buyQty.set(listing.commodityId, 0);
      this.sellQty.set(listing.commodityId, 0);
    }
  }

  hide(): void {
    this.open = false;
    this.market = null;
    this.rows = [];
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

    const panelW = Math.min(780, width - 40);
    const panelH = Math.min(520, height - 40);
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

    // Column headers
    const headerY = panel.y + 64;
    ctx.fillStyle = "rgba(140, 165, 195, 0.75)";
    ctx.fillText("Commodity", panel.x + 20, headerY);
    ctx.fillText("You buy", panel.x + 200, headerY);
    ctx.fillText("You sell", panel.x + 480, headerY);

    const listTop = headerY + 22;
    const footerY = panel.y + panel.h - 50;
    const rowH = this.rowH;
    const visibleH = footerY - listTop - 8;
    const listings = this.market.listings;
    this.listRect = {
      x: panel.x + 8,
      y: listTop,
      w: panel.w - 16,
      h: visibleH,
    };
    this.maxScroll = Math.max(0, listings.length * rowH - visibleH);
    this.scroll = Math.min(Math.max(0, this.scroll), this.maxScroll);

    this.rows = [];
    ctx.save();
    ctx.beginPath();
    ctx.rect(this.listRect.x, this.listRect.y, this.listRect.w, this.listRect.h);
    ctx.clip();

    listings.forEach((listing, i) => {
      const y = listTop + i * rowH - this.scroll;
      if (y + rowH < listTop || y > listTop + visibleH) return;
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
    });
    ctx.restore();

    if (this.maxScroll > 0) {
      // Thin scrollbar so overflow is obvious.
      const trackX = panel.x + panel.w - 14;
      const trackY = listTop;
      const trackH = visibleH;
      ctx.fillStyle = "rgba(40, 52, 70, 0.7)";
      ctx.fillRect(trackX, trackY, 4, trackH);
      const thumbH = Math.max(18, (visibleH / (listings.length * rowH)) * trackH);
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
    ctx.fillStyle = reasonColor(listing.priceReason);
    ctx.fillText(`${listing.priceReason} · hold ${held}`, panelX + 20, y + 26);

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
