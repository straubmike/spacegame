import { ECONOMY } from "../game/config";
import { FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type DockedMenuAction =
  | "repair"
  | "bay"
  | "hangar"
  | "market"
  | "blackMarket"
  | "missions"
  | "launch"
  | null;

/**
 * Shown while the player is docked at a station.
 * Contracts live under Missions (including pirate clearance).
 */
export class DockedMenu {
  open = false;
  stationName = "";
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private repairBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private bayBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private hangarBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private marketBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private blackMarketBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private missionsBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private launchBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private missionBoardHint = "";
  /** e.g. "Rep Friendly (+24)" — empty when unknown. */
  private standingLine = "";
  /** When false, Black Market button is omitted (Must-have 9 / 10). */
  private showBlackMarket = false;

  show(
    stationName: string,
    viewW: number,
    viewH: number,
    missionBoardHint = "",
    standingLine = "",
    showBlackMarket = false,
  ): void {
    this.open = true;
    this.stationName = stationName;
    this.missionBoardHint = missionBoardHint;
    this.standingLine = standingLine;
    this.showBlackMarket = showBlackMarket;

    const w = 280;
    const rows = 6 + (showBlackMarket ? 1 : 0); // repair…launch (+ BM)
    const headerExtra = standingLine ? 16 : 0;
    const h = 56 + headerExtra + rows * 38 + 16;
    this.panel = {
      x: Math.floor((viewW - w) / 2),
      y: Math.floor((viewH - h) / 2),
      w,
      h,
    };

    let y = this.panel.y + 56 + headerExtra;
    this.repairBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.bayBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.hangarBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.marketBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    if (showBlackMarket) {
      this.blackMarketBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
      y += 38;
    } else {
      this.blackMarketBtn = { x: 0, y: 0, w: 0, h: 0 };
    }

    this.missionsBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.launchBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
  }

  /** Refresh label hint without closing. */
  refreshHint(
    viewW: number,
    viewH: number,
    missionBoardHint: string,
    standingLine = this.standingLine,
  ): void {
    if (!this.open) return;
    this.show(
      this.stationName,
      viewW,
      viewH,
      missionBoardHint,
      standingLine,
      this.showBlackMarket,
    );
  }

  hide(): void {
    this.open = false;
  }

  draw(
    ctx: CanvasRenderingContext2D,
    pointerX: number,
    pointerY: number,
    missingHp: number,
    credits: number,
  ): void {
    if (!this.open) return;
    drawPanel(ctx, this.panel);
    ctx.font = FONT_TITLE;
    ctx.fillStyle = "rgba(220, 235, 255, 0.95)";
    ctx.textBaseline = "top";
    ctx.fillText("Docked", this.panel.x + 24, this.panel.y + 16);
    ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, Consolas, monospace";
    ctx.fillStyle = "rgba(160, 180, 210, 0.85)";
    ctx.fillText(this.stationName, this.panel.x + 24, this.panel.y + 38);
    if (this.standingLine) {
      ctx.fillStyle = "rgba(190, 170, 140, 0.9)";
      ctx.fillText(this.standingLine, this.panel.x + 24, this.panel.y + 52);
    }

    const cost = missingHp * ECONOMY.repairCostPerHp;
    const canRepair = missingHp > 0 && credits >= ECONOMY.repairCostPerHp;
    const repairLabel =
      missingHp <= 0 ? "Repair (full)" : `Repair (${cost} cr)`;
    drawButton(ctx, this.repairBtn, repairLabel, {
      enabled: canRepair,
      hover: canRepair && hit(this.repairBtn, pointerX, pointerY),
    });

    drawButton(ctx, this.bayBtn, "Bay", {
      hover: hit(this.bayBtn, pointerX, pointerY),
    });

    drawButton(ctx, this.hangarBtn, "Hangar", {
      hover: hit(this.hangarBtn, pointerX, pointerY),
    });

    drawButton(ctx, this.marketBtn, "Market", {
      hover: hit(this.marketBtn, pointerX, pointerY),
    });

    if (this.showBlackMarket) {
      drawButton(ctx, this.blackMarketBtn, "Black Market", {
        hover: hit(this.blackMarketBtn, pointerX, pointerY),
      });
    }

    const missionsLabel = this.missionBoardHint
      ? `Missions (${this.missionBoardHint})`
      : "Missions";
    drawButton(ctx, this.missionsBtn, missionsLabel, {
      hover: hit(this.missionsBtn, pointerX, pointerY),
    });

    drawButton(ctx, this.launchBtn, "Launch", {
      primary: true,
      hover: hit(this.launchBtn, pointerX, pointerY),
    });
  }

  handleClick(px: number, py: number): DockedMenuAction {
    if (!this.open) return null;
    if (hit(this.repairBtn, px, py)) return "repair";
    if (hit(this.bayBtn, px, py)) return "bay";
    if (hit(this.hangarBtn, px, py)) return "hangar";
    if (hit(this.marketBtn, px, py)) return "market";
    if (this.showBlackMarket && hit(this.blackMarketBtn, px, py)) {
      return "blackMarket";
    }
    if (hit(this.missionsBtn, px, py)) return "missions";
    if (hit(this.launchBtn, px, py)) return "launch";
    return null;
  }
}
