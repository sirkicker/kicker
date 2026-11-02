// The table, the coaches, the training drills, the set pieces, the rival clubs and the season.

// ---------------------------------------------------------------- the table
/** Lanes across the table, 0..LANES-1. The goal mouth is lanes MOUTH[0]..MOUTH[1]. */
export const LANES = 10;
export const MOUTH: [number, number] = [4, 5];

export type RoleId = "gk" | "def" | "mid" | "att";
export interface RodDef {
  role: RoleId;
  name: string;
  n: number; // figures on the rod
  gap: number; // lanes from one figure to the next
  min: number; // lowest offset (lane of the first figure)
  max: number;
  /** Column for your rod; theirs mirror it (9 - x). Goals sit at 0 (yours) and 9 (theirs). */
  x: number;
  /** First squad slot on this rod. */
  slot: number;
}
/** Your rods, back to front. Rod index 0..3 is used everywhere (actions, AI, UI). */
export const RODS: RodDef[] = [
  { role: "gk", name: "Keeper", n: 1, gap: 0, min: 2, max: 7, x: 1, slot: 0 },
  { role: "def", name: "Defence", n: 2, gap: 4, min: 0, max: 5, x: 2, slot: 1 },
  { role: "mid", name: "Midfield", n: 5, gap: 2, min: 0, max: 1, x: 4, slot: 3 },
  { role: "att", name: "Attack", n: 3, gap: 3, min: 0, max: 3, x: 6, slot: 8 },
];
export const GOAL_X = [0, 9];
/** Where each side's rods start a match. */
export const START_OFF = [
  [4, 2, 0, 1],
  [5, 3, 1, 2],
];

// ---------------------------------------------------------------- coaches
export type Rarity = 1 | 2 | 3;
export interface CoachDef {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity; // 1 common, 2 uncommon, 3 rare
  text: string;
  hue: number; // portrait colour
  /** Reads a number off the launches on your rods. */
  reads?: boolean;
}

export const COACHES: CoachDef[] = [
  { id: "ape", name: "Ape", cost: 3, rarity: 1, text: "+1 fan for every goal", hue: 330 },
  { id: "maxi0", name: "ETH Maxi", cost: 5, rarity: 1, text: "Your Ether-paired figures shoot with Power", hue: 190, reads: true },
  { id: "maxi1", name: "Stock Bro", cost: 5, rarity: 1, text: "Your Stocks-paired figures shoot with Power", hue: 18, reads: true },
  { id: "maxi2", name: "Vibe Maxi", cost: 5, rarity: 1, text: "Your Vibe-paired figures get Grip", hue: 310, reads: true },
  { id: "maxi3", name: "Pre-IPO Tourist", cost: 5, rarity: 1, text: "Your Private-paired figures get Pace", hue: 48, reads: true },
  { id: "echo", name: "Echo Chamber", cost: 4, rarity: 1, text: "The first straight pass of every possession costs no touch", hue: 200 },
  { id: "pile", name: "Pile-in Party", cost: 5, rarity: 1, text: "Your midfield shoots with Power, like an attacker", hue: 280 },
  { id: "climber", name: "Curve Climber", cost: 5, rarity: 1, text: "Shots off a side wall get Power", hue: 160 },
  { id: "purist", name: "Pair Purist", cost: 5, rarity: 1, text: "+1 touch every possession while your three attackers share a pair", hue: 100, reads: true },
  { id: "dip", name: "Dip Buyer", cost: 4, rarity: 1, text: "Figures whose price is down get Grip", hue: 355, reads: true },
  { id: "early", name: "Early Bird", cost: 5, rarity: 1, text: "Figures launched under 6 h before the cut get Pace", hue: 60, reads: true },
  { id: "oldmoney", name: "Old Money", cost: 5, rarity: 1, text: "Figures older than a day get Grip", hue: 30, reads: true },
  { id: "whale", name: "Whale Watcher", cost: 5, rarity: 1, text: "Grip from 2 holders instead of 6", hue: 210, reads: true },
  { id: "volume", name: "Volume Guy", cost: 5, rarity: 1, text: "Pace from 3 trades in 24h instead of 10", hue: 140, reads: true },
  { id: "snob", name: "Ticker Snob", cost: 5, rarity: 1, text: "Figures with a ticker of 3 letters or fewer shoot with Power", hue: 250, reads: true },
  { id: "airdrop", name: "Gift Hunter", cost: 4, rarity: 1, text: "+2 fans for a goal by a figure that runs a gift list", hue: 120, reads: true },
  { id: "paper", name: "Panic Seller", cost: 4, rarity: 1, text: "+1 block slide on their first kick after you lose the ball", hue: 45 },
  { id: "gas", name: "Gas Rebate", cost: 4, rarity: 1, text: "+1 free slide every possession", hue: 175 },
  { id: "copium", name: "Copium", cost: 4, rarity: 1, text: "A shot with the last touch of a possession gets Power", hue: 300 },
  { id: "mm", name: "Market Maker", cost: 5, rarity: 1, text: "+3 fans after every win", hue: 90 },
  { id: "moonboy", name: "Moonboy", cost: 6, rarity: 2, text: "Power from 3% curve progress instead of 10%", hue: 270, reads: true },
  { id: "pumpchaser", name: "Pump Chaser", cost: 6, rarity: 2, text: "Figures up 15% or more get Power and Pace", hue: 340, reads: true },
  { id: "diamond", name: "Diamond Gloves", cost: 6, rarity: 2, text: "Power shots never get past your keeper", hue: 185 },
  { id: "bag", name: "Bagholder", cost: 6, rarity: 2, text: "+1 fan for every ball you win back", hue: 25 },
  { id: "sniper", name: "Sniper Bot", cost: 7, rarity: 2, text: "A shot straight after a pass (one touch) gets Power", hue: 0 },
  { id: "pockets", name: "Deep Pockets", cost: 6, rarity: 2, text: "+1 touch every possession", hue: 230 },
  { id: "potato", name: "Hot Potato", cost: 6, rarity: 2, text: "A rod with a Pace figure gets two free slides, not one", hue: 12 },
  { id: "index", name: "Index Fund", cost: 7, rarity: 2, text: "+1 touch every possession while your attack and defence cover all four pairs", hue: 150, reads: true },
  { id: "valedictorian", name: "Valedictorian", cost: 8, rarity: 3, text: "Your launch furthest along its curve shoots through two blockers", hue: 52, reads: true },
  { id: "front", name: "Front-runner", cost: 8, rarity: 3, text: "+2 touches on your first possession of every match", hue: 320 },
  { id: "bonding", name: "Bonding Curve", cost: 8, rarity: 3, text: "+1 touch every possession for every 4 wins this season (max +2)", hue: 170 },
];
/** Each coach is played by one of the vibe/vibe vibers (redrawn in the game palette, public/vibers). */
export const COACH_VIBER: Keyed<string, string> = {
  ape: "bureau-roll-1-5",
  maxi0: "bureau-roll-44-4",
  maxi1: "bureau-roll-20-10",
  maxi2: "bureau-roll-2-4",
  maxi3: "bureau-roll-40-7",
  echo: "agent-71",
  pile: "viber-48",
  climber: "bureau-roll-35-5",
  purist: "bureau-roll-30-10",
  dip: "bureau-roll-31-5",
  early: "bureau-roll-31-7",
  oldmoney: "viber-extra-19",
  whale: "viber-71",
  volume: "bureau-roll-11-2",
  snob: "bureau-4",
  airdrop: "bureau-roll-9-2",
  paper: "bureau-roll-29-4",
  gas: "bureau-roll-9-5",
  copium: "viber-extra-15",
  mm: "bureau-roll-45-4",
  moonboy: "bureau-roll-26-1",
  pumpchaser: "agent-34",
  diamond: "bureau-roll-38-10",
  bag: "bureau-roll-29",
  sniper: "bureau-roll-47-10",
  pockets: "viber-103",
  potato: "bureau-roll-15-4",
  index: "bureau-roll-3-12",
  valedictorian: "bureau-roll-13",
  front: "bureau-roll-22-8",
  bonding: "viber-141",
};
export const COACH: Keyed<string, CoachDef> = Object.fromEntries(COACHES.map((j) => [j.id, j]));
/** How often each rarity shows up on the dressing-room shelf. The shelf is fixed by the seed; you see every price. */
export const RARITY_WEIGHT: Keyed<Rarity, number> = { 1: 70, 2: 25, 3: 6 };
export const RARITY_NAME: Keyed<Rarity, string> = { 1: "Common", 2: "Uncommon", 3: "Rare" };

// ---------------------------------------------------------------- training
export type DrillId = "shoot" | "pass" | "feet" | "block";
export interface DrillDef {
  id: DrillId;
  name: string;
  max: number;
  text: (lv: number) => string;
}
export const DRILLS: DrillDef[] = [
  { id: "shoot", name: "Finishing", max: 2, text: (n) => `The first ${n} shot${n === 1 ? "" : "s"} of every match get Power` },
  { id: "pass", name: "Passing", max: 3, text: (n) => `The first ${n} blocked pass${n === 1 ? "" : "es"} of every match keep the ball` },
  { id: "feet", name: "Footwork", max: 3, text: (n) => `+${n} free slide${n === 1 ? "" : "s"} every possession` },
  { id: "block", name: "Marking", max: 2, text: (n) => `+${n} block slide${n === 1 ? "" : "s"} before each of their kicks` },
];
export const DRILL: Keyed<DrillId, DrillDef> = Object.fromEntries(DRILLS.map((d) => [d.id, d])) as Keyed<DrillId, DrillDef>;
/** Fixed and printed: a drill costs 5 fans, then 3 more for every level you already have. */
export const drillCost = (lv: number) => 5 + 3 * lv;

// ---------------------------------------------------------------- set pieces (one use each)
export interface PlayDef {
  id: string;
  name: string;
  cost: number;
  /** When it can be used: while you have the ball, while they have it, or any time. */
  when: "attack" | "defend" | "any";
  text: string;
}
export const PLAYS: PlayDef[] = [
  { id: "freekick", name: "Free Kick", cost: 3, when: "attack", text: "Your next shot this possession goes through one more blocker" },
  { id: "onetwo", name: "One-Two", cost: 3, when: "attack", text: "+2 touches this possession" },
  { id: "dummy", name: "Dummy Run", cost: 4, when: "attack", text: "They don't react to your next 2 touches" },
  { id: "longball", name: "Long Ball", cost: 3, when: "attack", text: "Your next pass this possession can't be blocked" },
  { id: "bus", name: "Park the Bus", cost: 3, when: "defend", text: "+3 block slides before their next kick" },
  { id: "tickets", name: "Season Tickets", cost: 3, when: "any", text: "+1 fan for every fan you hold (max +10)" },
];
export const PLAY: Keyed<string, PlayDef> = Object.fromEntries(PLAYS.map((m) => [m.id, m]));

// ---------------------------------------------------------------- rival clubs
export interface ClubDef {
  id: string;
  name: string;
  text: string;
}
export const BOSSES: ClubDef[] = [
  { id: "rug", name: "The Rug", text: "Your defence rod is pulled off the table for the match" },
  { id: "halt", name: "Trading Halt", text: "Your defence or your midfield is frozen for the match" },
  { id: "vcheck", name: "Vibe Check", text: "Only figures with Power, Pace or Grip may shoot" },
  { id: "depeg", name: "The Depeg", text: "Your shots drift one lane as they travel" },
  { id: "gasspike", name: "Gas Spike", text: "Each slide costs two touches (free slides stay free)" },
  { id: "jam", name: "Mempool Jam", text: "Passes land a turn late: they react before the ball arrives" },
  { id: "slip", name: "Max Slippage", text: "One touch fewer every possession" },
  { id: "lockup", name: "Lockup", text: "Your keeper is locked in place" },
  { id: "wash", name: "Wash Trade", text: "The rod facing yours copies every slide you make" },
];
export const FINAL_BOSS: ClubDef = { id: "bell", name: "Closing Bell", text: "The final: first to 3, they play their best, and their keeper takes three Power to beat" };
export const BOSS: Keyed<string, ClubDef> = Object.fromEntries([...BOSSES, FINAL_BOSS].map((b) => [b.id, b]));

/** The two everyday fixtures of a round, then the boss club. */
export const FIXTURE_NAME = ["Friendly", "League match", "Boss club"];
/** Rival club names for the friendly and the league match of each round, picked by the seed. */
export const CLUBS = [
  "Floor Price FC",
  "Liquidity Town",
  "Real Mempool",
  "Sporting Slippage",
  "Dynamo Dip",
  "Athletic Bagholders",
  "Inter Testnet",
  "AC Airdrop",
  "Olympique Oracle",
  "Borussia Bridge",
  "Rapid Rebase",
  "Union Unlock",
  "Racing Rollup",
  "Atletico Allowlist",
  "Deportivo Degen",
  "United Validators",
];

// ---------------------------------------------------------------- the season
export const ROUNDS = 8;
/** Fans for a win: friendly, league match, boss club. */
export const WIN_FANS = [2, 3, 4];
export const MAX_COACHES = 5;
export const MAX_PLAYS = 2;
export const START_FANS = 4;
