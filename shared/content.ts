// Hands, insiders (jokers), moves (one-shot cards) and boss blinds.
import type { Suit } from "./data.js";

// ---------------------------------------------------------------- hands
export type HandId =
  | "solo"
  | "echo"
  | "index"
  | "double"
  | "pile"
  | "run"
  | "flush"
  | "book"
  | "stockflush"
  | "stampede"
  | "gradrun";

export interface HandDef {
  id: HandId;
  name: string;
  chips: number;
  mult: number;
  upChips: number;
  upMult: number;
  rule: string;
}

/** Strongest first: a played hand counts as the first entry it satisfies. */
export const HANDS: HandDef[] = [
  { id: "gradrun", name: "Graduation Run", chips: 100, mult: 8, upChips: 40, upMult: 4, rule: "A Curve Run where all five cards share a suit" },
  { id: "stampede", name: "Stampede", chips: 60, mult: 7, upChips: 30, upMult: 3, rule: "Four cards of one rank" },
  { id: "stockflush", name: "Ticker Flush", chips: 60, mult: 6, upChips: 30, upMult: 3, rule: "Five Stocks or Private cards quoted in the very same asset (e.g. five NVDA pairs)" },
  { id: "book", name: "Full Book", chips: 40, mult: 4, upChips: 25, upMult: 2, rule: "Three of one rank plus two of another" },
  { id: "flush", name: "Quote Flush", chips: 35, mult: 4, upChips: 15, upMult: 2, rule: "Five cards of one suit" },
  { id: "run", name: "Curve Run", chips: 30, mult: 4, upChips: 30, upMult: 3, rule: "Five ranks in a row (A can sit low: A-2-3-4-5)" },
  { id: "pile", name: "Pile-in", chips: 30, mult: 3, upChips: 20, upMult: 2, rule: "Three cards of one rank" },
  { id: "double", name: "Double Echo", chips: 20, mult: 2, upChips: 20, upMult: 1, rule: "Two different pairs" },
  { id: "index", name: "Index", chips: 15, mult: 2, upChips: 15, upMult: 1, rule: "One card from each of the four suits" },
  { id: "echo", name: "Echo", chips: 10, mult: 2, upChips: 15, upMult: 1, rule: "Two cards of one rank" },
  { id: "solo", name: "Solo Bag", chips: 5, mult: 1, upChips: 10, upMult: 1, rule: "Nothing else: your highest card scores alone" },
];
export const HAND: Keyed<HandId, HandDef> = Object.fromEntries(HANDS.map((h) => [h.id, h])) as Keyed<HandId, HandDef>;

// ---------------------------------------------------------------- insiders
export type Rarity = 1 | 2 | 3;
export interface InsiderDef {
  id: string;
  name: string;
  cost: number;
  rarity: Rarity; // 1 common, 2 uncommon, 3 rare
  text: string;
  hue: number; // portrait colour
}

export const INSIDERS: InsiderDef[] = [
  { id: "ape", name: "Ape", cost: 3, rarity: 1, text: "+4 Mult", hue: 330 },
  { id: "maxi0", name: "ETH Maxi", cost: 5, rarity: 1, text: "+3 Mult for each Ether card scored", hue: 190 },
  { id: "maxi1", name: "Stock Bro", cost: 5, rarity: 1, text: "+3 Mult for each Stocks card scored", hue: 18 },
  { id: "maxi2", name: "Vibe Maxi", cost: 5, rarity: 1, text: "+3 Mult for each Vibe card scored", hue: 310 },
  { id: "maxi3", name: "Pre-IPO Tourist", cost: 5, rarity: 1, text: "+3 Mult for each Private card scored", hue: 48 },
  { id: "echo", name: "Echo Chamber", cost: 4, rarity: 1, text: "+8 Mult if the hand contains an Echo", hue: 200 },
  { id: "pile", name: "Pile-in Party", cost: 5, rarity: 1, text: "+12 Mult if the hand contains a Pile-in", hue: 280 },
  { id: "climber", name: "Curve Climber", cost: 5, rarity: 1, text: "+12 Mult if the hand is a Curve Run", hue: 160 },
  { id: "purist", name: "Pair Purist", cost: 5, rarity: 1, text: "+10 Mult if all played cards share a suit", hue: 100 },
  { id: "dip", name: "Dip Buyer", cost: 4, rarity: 1, text: "+25 Chips for each scored card whose price is down", hue: 355 },
  { id: "early", name: "Early Bird", cost: 5, rarity: 1, text: "+40 Chips for each scored card launched under 6h before the deal", hue: 60 },
  { id: "oldmoney", name: "Old Money", cost: 5, rarity: 1, text: "+4 Mult for each scored card older than 24h", hue: 30 },
  { id: "whale", name: "Whale Watcher", cost: 5, rarity: 1, text: "+3 Chips per holder of each scored card (max 50 a card)", hue: 210 },
  { id: "volume", name: "Volume Guy", cost: 5, rarity: 1, text: "+2 Chips per 24h trade of each scored card (max 60 a card)", hue: 140 },
  { id: "snob", name: "Ticker Snob", cost: 5, rarity: 1, text: "+5 Mult for each scored card with a ticker of 3 letters or fewer", hue: 250 },
  { id: "airdrop", name: "Gift Hunter", cost: 4, rarity: 1, text: "+25 Chips for each scored card that runs a gift list", hue: 120 },
  { id: "paper", name: "Paper Hands", cost: 4, rarity: 1, text: "+20 Chips for every card discarded this round", hue: 45 },
  { id: "gas", name: "Gas Rebate", cost: 4, rarity: 1, text: "+1 discard every round", hue: 175 },
  { id: "copium", name: "Copium", cost: 4, rarity: 1, text: "+15 Mult on the last hand of a round", hue: 300 },
  { id: "mm", name: "Market Maker", cost: 5, rarity: 1, text: "Earn $3 at the end of every round", hue: 90 },
  { id: "moonboy", name: "Moonboy", cost: 6, rarity: 2, text: "+1 Mult per 10% curve progress of each scored card", hue: 270 },
  { id: "pumpchaser", name: "Pump Chaser", cost: 6, rarity: 2, text: "Pump cards also give x1.5 Mult", hue: 340 },
  { id: "diamond", name: "Diamond Hands", cost: 6, rarity: 2, text: "+4 Mult for every discard left", hue: 185 },
  { id: "bag", name: "Bagholder", cost: 6, rarity: 2, text: "Gains +1 Mult for every card you discard (all run)", hue: 25 },
  { id: "sniper", name: "Sniper Bot", cost: 7, rarity: 2, text: "x2 Mult if you play 3 cards or fewer", hue: 0 },
  { id: "pockets", name: "Deep Pockets", cost: 6, rarity: 2, text: "+1 hand size", hue: 230 },
  { id: "potato", name: "Hot Potato", cost: 6, rarity: 2, text: "Hot cards score one extra time", hue: 12 },
  { id: "index", name: "Index Fund", cost: 7, rarity: 2, text: "x2 Mult if the scored cards cover all four suits", hue: 150 },
  { id: "valedictorian", name: "Valedictorian", cost: 8, rarity: 3, text: "Every Ace scored gives x1.5 Mult", hue: 52 },
  { id: "front", name: "Front-runner", cost: 8, rarity: 3, text: "x3 Mult on the first hand of every round", hue: 320 },
  { id: "bonding", name: "Bonding Curve", cost: 8, rarity: 3, text: "Gains x0.25 Mult for every blind cleared", hue: 170 },
];
/** Each insider is played by one of the vibe/vibe vibers (redrawn in the game palette, public/vibers). */
export const INSIDER_VIBER: Keyed<string, string> = {
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
export const INSIDER: Keyed<string, InsiderDef> = Object.fromEntries(INSIDERS.map((j) => [j.id, j]));
export const RARITY_WEIGHT: Keyed<Rarity, number> = { 1: 70, 2: 25, 3: 6 };
export const RARITY_NAME: Keyed<Rarity, string> = { 1: "Common", 2: "Uncommon", 3: "Rare" };

// ---------------------------------------------------------------- moves (one-shot cards)
export interface MoveDef {
  id: string;
  name: string;
  cost: number;
  min: number; // cards to select
  max: number;
  text: string;
}
export const MOVES: MoveDef[] = [
  { id: "shill", name: "Shill", cost: 3, min: 1, max: 2, text: "Raise up to 2 selected cards by one rank (A wraps to 2)" },
  { id: "burn", name: "Burn", cost: 3, min: 1, max: 2, text: "Destroy up to 2 selected cards for good" },
  { id: "pump", name: "Pump", cost: 3, min: 1, max: 2, text: "Up to 2 selected cards become Pump (+4 Mult)" },
  { id: "hype", name: "Hype", cost: 3, min: 1, max: 1, text: "1 selected card becomes Hot (scores twice)" },
  { id: "clone", name: "Clone", cost: 4, min: 1, max: 1, text: "Add a copy of 1 selected card to your hand and deck" },
  { id: "bridge0", name: "Bridge to ETH", cost: 3, min: 1, max: 3, text: "Up to 3 selected cards become Ether" },
  { id: "bridge1", name: "Bridge to Stocks", cost: 3, min: 1, max: 3, text: "Up to 3 selected cards become Stocks" },
  { id: "bridge2", name: "Bridge to Vibe", cost: 3, min: 1, max: 3, text: "Up to 3 selected cards become Vibe" },
  { id: "bridge3", name: "Bridge to Private", cost: 3, min: 1, max: 3, text: "Up to 3 selected cards become Private" },
  { id: "treasury", name: "Treasury Sweep", cost: 3, min: 0, max: 0, text: "Double your money (max +$12)" },
];
export const MOVE: Keyed<string, MoveDef> = Object.fromEntries(MOVES.map((m) => [m.id, m]));

// ---------------------------------------------------------------- blinds
export interface BossDef {
  id: string;
  name: string;
  text: string;
  debuff?: Suit;
}
export const BOSSES: BossDef[] = [
  { id: "rug", name: "The Rug", text: "Ether cards are debuffed", debuff: 0 },
  { id: "halt", name: "Trading Halt", text: "Stocks cards are debuffed", debuff: 1 },
  { id: "vcheck", name: "Vibe Check", text: "Vibe cards are debuffed", debuff: 2 },
  { id: "depeg", name: "The Depeg", text: "Private cards are debuffed", debuff: 3 },
  { id: "gasspike", name: "Gas Spike", text: "No discards this round" },
  { id: "jam", name: "Mempool Jam", text: "-1 hand size" },
  { id: "slip", name: "Max Slippage", text: "Base Chips and Mult of every hand are halved" },
  { id: "lockup", name: "Lockup", text: "Every hand must be 5 cards" },
  { id: "wash", name: "Wash Trade", text: "Repeating a hand type this round scores nothing" },
];
export const FINAL_BOSS: BossDef = { id: "bell", name: "Closing Bell", text: "Only 3 hands, and the target doubles again" };
export const BOSS: Keyed<string, BossDef> = Object.fromEntries([...BOSSES, FINAL_BOSS].map((b) => [b.id, b]));

export const ANTE_BASE = [300, 800, 2000, 5000, 11000, 20000, 35000, 50000];
export const BLIND_MULT = [1, 1.5, 2];
export const BLIND_NAME = ["Small Blind", "Big Blind", "Boss Blind"];
export const BLIND_REWARD = [3, 4, 5];
export const MAX_ANTE = 8;
export const MAX_INSIDERS = 5;
export const MAX_MOVES = 2;
