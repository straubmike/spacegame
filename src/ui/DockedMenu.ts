import { ECONOMY } from "../game/config";
import { FONT_TITLE, drawButton, drawPanel, hit, type Rect } from "./menu";

export type DockedMenuAction =
  | "repair"
  | "bay"
  | "market"
  | "missions"
  | "acceptQuest"
  | "claimQuest"
  | "launch"
  | null;

export interface DockedQuestUi {
  /** Station can offer a new clearance quest. */
  canOffer: boolean;
  /** Active quest for this system; waiting on pirate clears. */
  inProgress: boolean;
  /** All targets cleared — claim reward here. */
  canClaim: boolean;
  /** Remaining uncleared targets (for in-progress label). */
  remaining: number;
}

/**
 * Shown while the player is docked at a station.
 */
export class DockedMenu {
  open = false;
  stationName = "";
  private panel: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private repairBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private bayBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private marketBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private missionsBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private questBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private launchBtn: Rect = { x: 0, y: 0, w: 0, h: 0 };
  private quest: DockedQuestUi = {
    canOffer: false,
    inProgress: false,
    canClaim: false,
    remaining: 0,
  };
  private showQuestRow = false;
  private missionBoardHint = "";

  show(
    stationName: string,
    viewW: number,
    viewH: number,
    quest: DockedQuestUi,
    missionBoardHint = "",
  ): void {
    this.open = true;
    this.stationName = stationName;
    this.quest = quest;
    this.missionBoardHint = missionBoardHint;
    this.showQuestRow = quest.canOffer || quest.inProgress || quest.canClaim;

    const w = 280;
    const rows = (this.showQuestRow ? 1 : 0) + 5; // repair, bay, market, missions, [quest], launch
    const h = 56 + rows * 38 + 16;
    this.panel = {
      x: Math.floor((viewW - w) / 2),
      y: Math.floor((viewH - h) / 2),
      w,
      h,
    };

    let y = this.panel.y + 56;
    this.repairBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.bayBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.marketBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    this.missionsBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
    y += 38;

    if (this.showQuestRow) {
      this.questBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
      y += 38;
    } else {
      this.questBtn = { x: 0, y: 0, w: 0, h: 0 };
    }

    this.launchBtn = { x: this.panel.x + 24, y, w: w - 48, h: 28 };
  }

  /** Refresh quest row without closing (e.g. after accepting). */
  refreshQuest(
    quest: DockedQuestUi,
    viewW: number,
    viewH: number,
    missionBoardHint = this.missionBoardHint,
  ): void {
    if (!this.open) return;
    this.show(this.stationName, viewW, viewH, quest, missionBoardHint);
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

    drawButton(ctx, this.marketBtn, "Market", {
      hover: hit(this.marketBtn, pointerX, pointerY),
    });

    const missionsLabel = this.missionBoardHint
      ? `Missions (${this.missionBoardHint})`
      : "Missions";
    drawButton(ctx, this.missionsBtn, missionsLabel, {
      hover: hit(this.missionsBtn, pointerX, pointerY),
    });

    if (this.showQuestRow) {
      const { label, enabled } = this.questButtonState();
      drawButton(ctx, this.questBtn, label, {
        enabled,
        hover: enabled && hit(this.questBtn, pointerX, pointerY),
      });
    }

    drawButton(ctx, this.launchBtn, "Launch", {
      primary: true,
      hover: hit(this.launchBtn, pointerX, pointerY),
    });
  }

  private questButtonState(): { label: string; enabled: boolean } {
    if (this.quest.canClaim) {
      return {
        label: `Claim pirate bounty (+${ECONOMY.pirateQuestReward} cr)`,
        enabled: true,
      };
    }
    if (this.quest.canOffer) {
      return {
        label: `Accept: clear pirates (+${ECONOMY.pirateQuestReward} cr)`,
        enabled: true,
      };
    }
    if (this.quest.inProgress) {
      const n = this.quest.remaining;
      return {
        label:
          n <= 0
            ? "Quest: return with proof"
            : `Quest: ${n} pirate${n === 1 ? "" : "s"} left`,
        enabled: false,
      };
    }
    return { label: "No contracts", enabled: false };
  }

  handleClick(px: number, py: number): DockedMenuAction {
    if (!this.open) return null;
    if (hit(this.repairBtn, px, py)) return "repair";
    if (hit(this.bayBtn, px, py)) return "bay";
    if (hit(this.marketBtn, px, py)) return "market";
    if (hit(this.missionsBtn, px, py)) return "missions";
    if (this.showQuestRow && hit(this.questBtn, px, py)) {
      if (this.quest.canClaim) return "claimQuest";
      if (this.quest.canOffer) return "acceptQuest";
      return null;
    }
    if (hit(this.launchBtn, px, py)) return "launch";
    return null;
  }
}
