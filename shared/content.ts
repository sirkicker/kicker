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
/** A coach's standing: 1 Academy, 2 First team, 3 Club legend. It sets how often the shelf offers it, never what it does. */
export type Tier = 1 | 2 | 3;
export interface CoachDef {
  id: string;
  name: string;
  cost: number;
  tier: Tier; // 1 Academy, 2 First team, 3 Club legend
  text: string;
  hue: number; // portrait colour
  /** Reads a number off the launches on your rods. */
  reads?: boolean;
}

export const COACHES: CoachDef[] = [
  { id: "ape", name: "Ape", cost: 3, tier: 1, text: "+1 fan for every goal", hue: 330 },
  { id: "maxi0", name: "ETH Maxi", cost: 5, tier: 1, text: "Your Ether-paired figures shoot with Power", hue: 190, reads: true },
  { id: "maxi1", name: "Stock Bro", cost: 5, tier: 1, text: "Your Stocks-paired figures shoot with Power", hue: 18, reads: true },
  { id: "maxi2", name: "Vibe Maxi", cost: 5, tier: 1, text: "Your Vibe-paired figures get Grip", hue: 310, reads: true },
  { id: "maxi3", name: "Pre-IPO Tourist", cost: 5, tier: 1, text: "Your Private-paired figures get Pace", hue: 48, reads: true },
  { id: "echo", name: "Echo Chamber", cost: 4, tier: 1, text: "The first straight pass of every possession costs no touch", hue: 200 },
  { id: "pile", name: "Pile-in Party", cost: 5, tier: 1, text: "Your midfield shoots with Power, like an attacker", hue: 280 },
  { id: "climber", name: "Curve Climber", cost: 5, tier: 1, text: "Shots off a side wall get Power", hue: 160 },
  { id: "purist", name: "Pair Purist", cost: 5, tier: 1, text: "+1 touch every possession while your three attackers share a pair", hue: 100, reads: true },
  { id: "dip", name: "Dip Buyer", cost: 4, tier: 1, text: "Figures whose price is down get Grip", hue: 355, reads: true },
  { id: "early", name: "Early Bird", cost: 5, tier: 1, text: "Figures launched under 6 h before the cut get Pace", hue: 60, reads: true },
  { id: "oldmoney", name: "Old Money", cost: 5, tier: 1, text: "Figures older than a day get Grip", hue: 30, reads: true },
  { id: "whale", name: "Whale Watcher", cost: 5, tier: 1, text: "Grip from 2 holders instead of 6", hue: 210, reads: true },
  { id: "volume", name: "Volume Guy", cost: 5, tier: 1, text: "Pace from 3 trades in 24h instead of 10", hue: 140, reads: true },
  { id: "snob", name: "Ticker Snob", cost: 5, tier: 1, text: "Figures with a ticker of 3 letters or fewer shoot with Power", hue: 250, reads: true },
  { id: "airdrop", name: "Gift Hunter", cost: 4, tier: 1, text: "+2 fans for a goal by a figure that runs a gift list", hue: 120, reads: true },
  { id: "paper", name: "Panic Seller", cost: 4, tier: 1, text: "+1 block slide on their first kick after you lose the ball", hue: 45 },
  { id: "gas", name: "Gas Rebate", cost: 4, tier: 1, text: "+1 free slide every possession", hue: 175 },
  { id: "copium", name: "Copium", cost: 4, tier: 1, text: "A shot with the last touch of a possession gets Power", hue: 300 },
  { id: "mm", name: "Market Maker", cost: 5, tier: 1, text: "+3 fans after every win", hue: 90 },
  { id: "moonboy", name: "Moonboy", cost: 6, tier: 2, text: "Power from 3% curve progress instead of 10%", hue: 270, reads: true },
  { id: "pumpchaser", name: "Pump Chaser", cost: 6, tier: 2, text: "Figures up 15% or more get Power and Pace", hue: 340, reads: true },
  { id: "diamond", name: "Diamond Gloves", cost: 6, tier: 2, text: "Power shots never get past your keeper", hue: 185 },
  { id: "bag", name: "Bagholder", cost: 6, tier: 2, text: "+1 fan for every ball you win back", hue: 25 },
  { id: "sniper", name: "Sniper Bot", cost: 7, tier: 2, text: "A shot straight after a pass (one touch) gets Power", hue: 0 },
  { id: "pockets", name: "Deep Pockets", cost: 6, tier: 2, text: "+1 touch every possession", hue: 230 },
  { id: "potato", name: "Hot Potato", cost: 6, tier: 2, text: "A rod with a Pace figure gets two free slides, not one", hue: 12 },
  { id: "index", name: "Index Fund", cost: 7, tier: 2, text: "+1 touch every possession while your attack and defence cover all four pairs", hue: 150, reads: true },
  { id: "valedictorian", name: "Valedictorian", cost: 8, tier: 3, text: "Your launch furthest along its curve shoots through two blockers", hue: 52, reads: true },
  { id: "front", name: "Front-runner", cost: 8, tier: 3, text: "+2 touches on your first possession of every match", hue: 320 },
  { id: "bonding", name: "Bonding Curve", cost: 8, tier: 3, text: "+1 touch every possession for every 4 wins this season (max +2)", hue: 170 },
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
/** How often each tier shows up on the dressing-room shelf. The shelf is fixed by the seed; you see every price. */
export const TIER_WEIGHT: Keyed<Tier, number> = { 1: 70, 2: 25, 3: 6 };
export const TIER_NAME: Keyed<Tier, string> = { 1: "Academy", 2: "First team", 3: "Club legend" };

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
  { id: "halt", name: "Trading Halt", text: "Your defence or your midfield is frozen until the first goal of the match" },
  { id: "vcheck", name: "Vibe Check", text: "Only figures with Power, Pace or Grip may shoot" },
  { id: "depeg", name: "The Depeg", text: "Your shots drift one lane as they travel" },
  { id: "gasspike", name: "Gas Spike", text: "Each slide costs two touches (free slides stay free)" },
  { id: "jam", name: "Mempool Jam", text: "Passes land a turn late: they react before the ball arrives, unless it goes to a Pace figure" },
  { id: "slip", name: "Max Slippage", text: "One touch fewer every possession" },
  { id: "lockup", name: "Lockup", text: "Your keeper is locked in place" },
  { id: "wash", name: "Wash Trade", text: "The rod facing yours copies every slide you make" },
];
export const FINAL_BOSS: ClubDef = { id: "bell", name: "Closing Bell", text: "The final: first to 3, they play their best, every figure of theirs shoots with Power, and their keeper takes three Power to beat" };
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

// ---------------------------------------------------------------- how a rival club plays
export type StyleId = "bus" | "press" | "long";
export const STYLES: Keyed<StyleId, { name: string; text: string }> = {
  bus: { name: "Parks the bus", text: "Sits deep: an extra slide at the back once your ball reaches your attack, and it only shoots from midfield up" },
  press: { name: "Presses high", text: "Shuts your passing lanes from the first whistle and sets up with an extra slide when you win the ball" },
  long: { name: "Shoots from distance", text: "Covers shots before passes; from round 3 its shots from deep go through one blocker" },
};
const CLUB_STYLE: StyleId[] = ["press", "bus", "long"];
/** A club always plays the same way: by its name for the everyday clubs, by its rule for a boss club. */
export function styleOf(club: string, boss: string | null): StyleId {
  if (boss) return BOSS_STYLE[boss] || "press";
  const h = HAUNT.clubs.indexOf(club);
  if (h >= 0) return HAUNT.clubStyle[h];
  const i = CLUBS.indexOf(club);
  return CLUB_STYLE[(i < 0 ? 0 : i) % 3];
}
const BOSS_STYLE: Keyed<string, StyleId> = {
  rug: "bus",
  halt: "press",
  vcheck: "long",
  depeg: "long",
  gasspike: "press",
  jam: "press",
  slip: "bus",
  lockup: "long",
  wash: "bus",
  bell: "press",
  haunt: "long",
};

// ---------------------------------------------------------------- Haunted table: a time-limited event mode
/**
 * Three matches against ghost clubs built from the quietest launches of the cut, with two ghost rules
 * (a phasing rod and a poltergeist) and the lights turned low. Live through Fri 6 Nov 2026, 23:59 UTC;
 * after that it stays playable as a past event.
 */
export const HAUNT = {
  end: Date.UTC(2026, 10, 6, 23, 59, 59),
  endLabel: "6 Nov",
  clubs: ["Crypt Rovers", "Graveyard United"],
  clubStyle: ["bus", "press"] as StyleId[],
  levels: [4, 7, 10],
  boss: { id: "haunt", name: "The Haunted XI", text: "The last of the ghost clubs: both ghost rules, lights low, and it has to be beaten" } as ClubDef,
};
/** Rules 3: the ghost clubs in order, easy to hard (2.1 had the friendly harder than the Haunted XI). */
export const HAUNT_LEVELS_R3 = [5, 2, 6];
export const hauntLive = (now = Date.now()) => now <= HAUNT.end;
BOSS.haunt = HAUNT.boss;
export const GHOST_RULES = {
  phasing: { name: "Phasing", text: "One of their rods is a ghost: it blocks on every other touch of yours. It shows SOLID or FADED at its handle." },
  polter: { name: "Poltergeist", text: "After each of your kicks one of their rods drifts a lane on its own. The arrow at its handle shows which, a touch before." },
  dark: { name: "Graveyard shift", text: "The lights are low. The ball carries a lantern; your kick lines and their threats stay lit." },
};

// ---------------------------------------------------------------- 3.0: the league season (rules 3)
/**
 * A rules-3 season: seven rounds. Each round is two league matchdays and a cup tie against a boss club; round 7's
 * cup tie is the Closing Bell final. The league is you and seven clubs, a double round robin over the fourteen
 * matchdays, so you meet every club twice. A league match can be lost; the table ends the season once you can no
 * longer finish in the top two. A cup tie has to be won. The top two after matchday fourteen meet in the final.
 */
export const ROUNDS_R3 = 7;
export const LEAGUE_CLUBS = 7; // the clubs beside you in the league
export const MATCHDAYS = ROUNDS_R3 * 2;
export const POINTS = { win: 3, draw: 1, loss: 0 };
/** How many go through to the final. */
export const FINAL_SPOTS = 2;
/** Fans for a league win, a league win, a cup tie win; a league draw is worth DRAW_FANS. */
export const WIN_FANS_R3 = [3, 3, 4];
export const DRAW_FANS_R3 = 1;
export const FIXTURE_NAME_R3 = ["League match", "League match", "Cup tie"];
/** Rounds in a run: the Haunted table is one round of three; a season is 8 rounds (legacy) or 7 (rules 3). */
export const roundsOf = (mode: "season" | "haunt" | "daily", rules: number) => (mode !== "season" ? 1 : rules >= 3 ? ROUNDS_R3 : ROUNDS);
/** The fixture's name under these rules ("Final" for the last cup tie of a rules-3 season; the Daily keeps 2.1's names). */
export function fixtureName(kind: number, rules: number, final = false, mode: "season" | "haunt" | "daily" = "season"): string {
  if (rules < 3 || mode !== "season") return FIXTURE_NAME[kind];
  return final ? "Final" : FIXTURE_NAME_R3[kind];
}
/**
 * A league club's form: 0 off the pace, 1 mid-table, 2 in form. It sets how sharp the club plays you and how its
 * other matches go. Drawn by the seed: three in form, two mid-table, two off the pace.
 */
export const FORM_BAG = [2, 2, 2, 1, 1, 0, 0];
export const FORM_NAME = ["Off the pace", "Mid-table", "In form"];

// ---------------------------------------------------------------- 3.0: seeded kickoffs (rules 3)
export interface Kickoff {
  id: number;
  name: string;
  /** Which club style opens this way; "any" is the classic opening. */
  style: StyleId | "any";
  /** Rod offsets, [your rods, their rods]. */
  off: [number[], number[]];
  /** Your midfield figure on the ball. */
  fig: number;
}
/** Each match opens from one of its club style's formations, picked by the seed. Id 0 is the 2.1 opening. */
export const KICKOFFS: Kickoff[] = [
  { id: 0, name: "Classic", style: "any", off: [START_OFF[0].slice(), START_OFF[1].slice()], fig: 2 },
  { id: 1, name: "High line", style: "press", off: [[4, 1, 1, 2], [4, 2, 0, 1]], fig: 2 },
  { id: 2, name: "Overload left", style: "press", off: [[3, 0, 0, 0], [5, 4, 1, 3]], fig: 1 },
  { id: 3, name: "Wing play", style: "press", off: [[5, 3, 1, 3], [4, 1, 0, 0]], fig: 3 },
  { id: 4, name: "Low block", style: "bus", off: [[4, 2, 1, 1], [4, 2, 0, 1]], fig: 2 },
  { id: 5, name: "Narrow", style: "bus", off: [[5, 1, 0, 2], [5, 2, 1, 2]], fig: 1 },
  { id: 6, name: "Wide at the back", style: "bus", off: [[4, 3, 1, 0], [4, 1, 0, 3]], fig: 3 },
  { id: 7, name: "Direct", style: "long", off: [[4, 2, 0, 3], [5, 3, 1, 1]], fig: 2 },
  { id: 8, name: "Split", style: "long", off: [[3, 4, 1, 1], [6, 1, 0, 2]], fig: 2 },
  { id: 9, name: "Long diagonal", style: "long", off: [[6, 0, 0, 2], [3, 4, 1, 0]], fig: 1 },
];

// ---------------------------------------------------------------- 3.0: table events (rules 3)
export type TableEventId = "volatile" | "thin" | "green" | "halfhalt";
/** One per league match, shown at kickoff. Deterministic and readable; nothing pays out. */
export const TABLE_EVENTS: Keyed<TableEventId, { name: string; text: string }> = {
  volatile: { name: "Volatile", text: "The side walls kick back hard: off a wall, the ball comes back two lanes for every one" },
  thin: { name: "Thin book", text: "One lane is sticky through midfield: no kick of either side runs along it there" },
  green: { name: "Green candle", text: "+1 touch on your first possession" },
  halfhalt: { name: "Halt on the half", text: "No long passes (over a rod) on either side's first possession" },
};
export const TABLE_EVENT_IDS: TableEventId[] = ["volatile", "thin", "green", "halfhalt"];
/** The lanes Thin book can make sticky: never the goal mouth. */
export const STICKY_LANES = [1, 2, 3, 6, 7, 8];

// ---------------------------------------------------------------- 3.0: club identities
export type CrestMotif = "candle" | "chain" | "bridge" | "eye" | "rocket" | "anchor" | "lock" | "block" | "wave" | "star" | "bolt" | "shield" | "key" | "tower" | "gear" | "leaf" | "bell" | "moon" | "skull" | "lantern";
/** How a club names its captain from its eleven: furthest along the curve, most traded, most held, most up, newest. */
export type CaptainRule = "curve" | "trades" | "holders" | "up" | "fresh";
export const CAPTAIN_RULE: Keyed<CaptainRule, string> = {
  curve: "the launch furthest along its curve",
  trades: "the most traded launch",
  holders: "the most held launch",
  up: "the launch most up on the day",
  fresh: "the newest launch",
};
export interface ClubIdentity {
  /** Kit pair: shirt and trim, as 0xRRGGBB. */
  kit: [number, number];
  crest: CrestMotif;
  captain: CaptainRule;
  /** One line, in the desk's voice. */
  chant: string;
}
/** Every club the season or the Haunted table can field, by name. Data only: streams B and C draw it. */
export const CLUB_ID: Keyed<string, ClubIdentity> = {
  "Floor Price FC": { kit: [0x2f6fb0, 0xf2e6c8], crest: "anchor", captain: "holders", chant: "Floor Price FC. The floor holds until it doesn't." },
  "Liquidity Town": { kit: [0x1f9e8f, 0x0d2a33], crest: "wave", captain: "trades", chant: "Liquidity Town. Deep book, shallow bench." },
  "Real Mempool": { kit: [0xe9e4d4, 0x7a2a8c], crest: "tower", captain: "fresh", chant: "Real Mempool. Pending since 2024." },
  "Sporting Slippage": { kit: [0xd1495b, 0xf6d04d], crest: "bolt", captain: "up", chant: "Sporting Slippage. You get what you get." },
  "Dynamo Dip": { kit: [0x7b2d26, 0xe8b04a], crest: "candle", captain: "curve", chant: "Dynamo Dip. Bought every one of them." },
  "Athletic Bagholders": { kit: [0x3d5a3a, 0xd9c8a0], crest: "lock", captain: "holders", chant: "Athletic Bagholders. Never sold, never will." },
  "Inter Testnet": { kit: [0x23314f, 0x58c4dd], crest: "gear", captain: "trades", chant: "Inter Testnet. Nothing here is real, including the defence." },
  "AC Airdrop": { kit: [0xc23b22, 0x111111], crest: "star", captain: "fresh", chant: "AC Airdrop. Free on arrival, priced on departure." },
  "Olympique Oracle": { kit: [0x5b3fa0, 0xf1f1f1], crest: "eye", captain: "curve", chant: "Olympique Oracle. Knew the score a block early." },
  "Borussia Bridge": { kit: [0xf2c12e, 0x1b1b1b], crest: "bridge", captain: "holders", chant: "Borussia Bridge. Seven confirmations to cross." },
  "Rapid Rebase": { kit: [0x2e8b57, 0xffffff], crest: "leaf", captain: "up", chant: "Rapid Rebase. Same share of the pitch, more of it." },
  "Union Unlock": { kit: [0x8c1c3a, 0x9ec5d9], crest: "key", captain: "fresh", chant: "Union Unlock. Supply arrives on schedule." },
  "Racing Rollup": { kit: [0x0f5c8c, 0xf59e0b], crest: "block", captain: "trades", chant: "Racing Rollup. Settles later, runs now." },
  "Atletico Allowlist": { kit: [0xb22234, 0x2b4c7e], crest: "shield", captain: "holders", chant: "Atletico Allowlist. Your name is not down." },
  "Deportivo Degen": { kit: [0x00a86b, 0xff4fa3], crest: "rocket", captain: "trades", chant: "Deportivo Degen. Full size, every touch." },
  "United Validators": { kit: [0x9a1f1f, 0xf4f1e6], crest: "chain", captain: "curve", chant: "United Validators. Signed, sealed, in the next block." },
  // boss clubs
  "The Rug": { kit: [0x6b4226, 0xe0b35a], crest: "wave", captain: "up", chant: "The Rug. It was all there a minute ago." },
  "Trading Halt": { kit: [0xe0e0e0, 0xc81d25], crest: "lock", captain: "holders", chant: "Trading Halt. Nobody moves until they say so." },
  "Vibe Check": { kit: [0xff6fb5, 0x2a1240], crest: "eye", captain: "curve", chant: "Vibe Check. Numbers at the door, please." },
  "The Depeg": { kit: [0x4f9d69, 0x15302a], crest: "anchor", captain: "up", chant: "The Depeg. One dollar, give or take." },
  "Gas Spike": { kit: [0xf08a24, 0x3a1a05], crest: "bolt", captain: "trades", chant: "Gas Spike. Every move costs double today." },
  "Mempool Jam": { kit: [0x8d6cab, 0x1e1630], crest: "block", captain: "fresh", chant: "Mempool Jam. Your pass is in the queue." },
  "Max Slippage": { kit: [0xc9a227, 0x2c2c2c], crest: "wave", captain: "trades", chant: "Max Slippage. One less than you asked for." },
  Lockup: { kit: [0x445566, 0xd4af37], crest: "key", captain: "holders", chant: "Lockup. Vesting begins after the whistle." },
  "Wash Trade": { kit: [0x5fb3d9, 0x5fb3d9], crest: "gear", captain: "trades", chant: "Wash Trade. Every move you make, twice." },
  "Closing Bell": { kit: [0x0b3d2e, 0xd4af37], crest: "bell", captain: "curve", chant: "Closing Bell. Last trade of the season." },
  // the Haunted table
  "Crypt Rovers": { kit: [0x2b3a42, 0x9fb8c4], crest: "lantern", captain: "holders", chant: "Crypt Rovers. Zero volume, full attendance." },
  "Graveyard United": { kit: [0x1d2b1f, 0xb7c9a8], crest: "moon", captain: "fresh", chant: "Graveyard United. Delisted, still turning up." },
  "The Haunted XI": { kit: [0x0d0d14, 0xff7a1c], crest: "skull", captain: "holders", chant: "The Haunted XI. Last traded a long time ago." },
};
/** A club with no identity on file gets a plain one, so nothing ever draws undefined. */
export const clubIdOf = (name: string): ClubIdentity => CLUB_ID[name] || { kit: [0x445566, 0xe6e6e6], crest: "shield", captain: "curve", chant: `${name}. In session.` };
