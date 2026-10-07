// The whole game as a pure state machine. The browser and the server run the same code:
// the server re-runs a shared run from its action list to check the score.
import { buildDeck, RANK_CHIPS, type Card, type Edition, type Enh, type Suit } from "./data.js";
import {
  ANTE_BASE,
  BLIND_MULT,
  BLIND_REWARD,
  BOSS,
  BOSSES,
  FINAL_BOSS,
  HAND,
  HANDS,
  INSIDERS,
  MAX_ANTE,
  MAX_INSIDERS,
  MAX_MOVES,
  MOVE,
  MOVES,
  RARITY_WEIGHT,
  type HandId,
} from "./content.js";
import { pickWeighted, shuffle, stream } from "./rng.js";

export type Phase = "blind" | "round" | "cashout" | "shop" | "over" | "won";

export interface Owned {
  id: string;
  v: number; // counter for scaling insiders
  paid: number;
}

export interface Offer {
  kind: "insider" | "alpha" | "move";
  id: string; // insider id, hand id or move id
  cost: number;
  sold: boolean;
}

export type Action =
  | { t: "go" }
  | { t: "play"; c: number[] }
  | { t: "disc"; c: number[] }
  | { t: "use"; i: number; c: number[] }
  | { t: "sell"; i: number }
  | { t: "cash" }
  | { t: "buy"; i: number }
  | { t: "roll" }
  | { t: "next" };

export interface Step {
  kind: "card" | "insider" | "base" | "debuff";
  card?: number; // card id
  ins?: number; // insider index
  chips?: number;
  mult?: number;
  xmult?: number;
  label?: string;
}

export interface Scored {
  hand: HandId;
  level: number;
  played: number[];
  scoring: number[];
  steps: Step[];
  chips: number;
  mult: number;
  total: number;
  zeroed?: string; // reason the hand scored nothing
}

export interface Cashout {
  reward: number;
  handsLeft: number;
  interest: number;
  extra: number;
  total: number;
}

export interface RunState {
  seed: string;
  edition: number;
  editionAt: number; // unix seconds
  deck: Card[];
  nextCardId: number;
  ante: number;
  blind: number; // 0 small, 1 big, 2 boss
  bosses: string[]; // boss id per ante
  phase: Phase;
  money: number;
  round: number; // blinds started so far
  hands: number;
  discards: number;
  target: number;
  score: number;
  draw: number[];
  hand: number[];
  used: number[];
  handsPlayedRound: number;
  discardedRound: number;
  typesRound: HandId[];
  insiders: Owned[];
  moves: string[];
  levels: Keyed<HandId, number>;
  offers: Offer[];
  rerolls: number;
  shopVisit: number;
  cashout: Cashout | null;
  best: { total: number; hand: HandId; cards: { t: string; s: string; c: string | null; rank: number; suit: number }[] } | null;
  cleared: number;
  handsTotal: number;
}

export const HAND_SIZE = 8;
export const HANDS_PER_ROUND = 4;
export const DISCARDS_PER_ROUND = 3;

export function targetFor(ante: number, blind: number, boss: string): number {
  const base = ANTE_BASE[Math.min(ante, MAX_ANTE) - 1] * BLIND_MULT[blind];
  return Math.round(boss === "bell" && blind === 2 ? base * 2 : base);
}

const has = (s: RunState, id: string) => s.insiders.some((j) => j.id === id);

export class Run {
  s: RunState;
  trail: Action[] = [];
  lastScored: Scored | null = null;
  lastDrawn: number[] = [];

  constructor(public ed: Edition, seed: string) {
    const deck = buildDeck(ed, seed);
    const bossRnd = stream(seed, "boss");
    const bag = shuffle(BOSSES.map((b) => b.id), bossRnd);
    const bosses: string[] = [];
    for (let a = 1; a <= MAX_ANTE; a++) bosses.push(a === MAX_ANTE ? FINAL_BOSS.id : bag[(a - 1) % bag.length]);
    const levels = Object.fromEntries(HANDS.map((h) => [h.id, 1])) as Keyed<HandId, number>;
    this.s = {
      seed,
      edition: ed.id,
      editionAt: Math.floor(Date.parse(ed.at) / 1000) || ed.id * 3600,
      deck,
      nextCardId: deck.length,
      ante: 1,
      blind: 0,
      bosses,
      phase: "blind",
      money: 4,
      round: 0,
      hands: 0,
      discards: 0,
      target: targetFor(1, 0, bosses[0]),
      score: 0,
      draw: [],
      hand: [],
      used: [],
      handsPlayedRound: 0,
      discardedRound: 0,
      typesRound: [],
      insiders: [],
      moves: [],
      levels,
      offers: [],
      rerolls: 0,
      shopVisit: 0,
      cashout: null,
      best: null,
      cleared: 0,
      handsTotal: 0,
    };
  }

  // ------------------------------------------------------------ helpers
  card(id: number): Card {
    const c = this.s.deck.find((d) => d.id === id);
    if (!c) throw new Error("no card " + id);
    return c;
  }
  bossNow(): string | null {
    return this.s.blind === 2 ? this.s.bosses[this.s.ante - 1] : null;
  }
  bossDef() {
    const b = this.bossNow();
    return b ? BOSS[b] : null;
  }
  handSize(): number {
    let n = HAND_SIZE + (has(this.s, "pockets") ? 1 : 0);
    if (this.s.phase === "round" && this.bossNow() === "jam") n -= 1;
    return n;
  }
  debuffed(c: Card): boolean {
    const b = this.bossDef();
    return !!b && b.debuff !== undefined && b.debuff === c.suit;
  }
  ageHours(c: Card): number {
    return (this.s.editionAt - c.l.a) / 3600;
  }
  minPlay(): number {
    return this.bossNow() === "lockup" ? Math.min(5, this.s.hand.length) : 1;
  }

  private drawUp(): number[] {
    const s = this.s;
    const got: number[] = [];
    while (s.hand.length < this.handSize() && s.draw.length) {
      const id = s.draw.shift()!;
      s.hand.push(id);
      got.push(id);
    }
    return got;
  }

  // ------------------------------------------------------------ hand evaluation
  evaluate(ids: number[]): { hand: HandId; scoring: number[] } {
    const cards = ids.map((i) => this.card(i));
    const byRank = new Map<number, Card[]>();
    for (const c of cards) byRank.set(c.rank, [...(byRank.get(c.rank) || []), c]);
    const groups = [...byRank.values()].sort((a, b) => b.length - a.length || b[0].rank - a[0].rank);
    const five = cards.length === 5;
    const flush = five && cards.every((c) => c.suit === cards[0].suit);
    const ranks = [...new Set(cards.map((c) => c.rank))].sort((a, b) => a - b);
    let straight = false;
    if (five && ranks.length === 5) {
      straight = ranks[4] - ranks[0] === 4 || ranks.join(",") === "2,3,4,5,14";
    }
    const tickerFlush = flush && (cards[0].suit === 1 || cards[0].suit === 3) && cards.every((c) => !c.bridged && c.q === cards[0].q);
    const all = cards.map((c) => c.id);
    const g0 = groups[0]?.length || 0;
    const g1 = groups[1]?.length || 0;
    if (straight && flush) return { hand: "gradrun", scoring: all };
    if (g0 >= 4) return { hand: "stampede", scoring: groups[0].slice(0, 4).map((c) => c.id) };
    if (tickerFlush) return { hand: "stockflush", scoring: all };
    if (g0 === 3 && g1 >= 2) return { hand: "book", scoring: all };
    if (flush) return { hand: "flush", scoring: all };
    if (straight) return { hand: "run", scoring: all };
    if (g0 === 3) return { hand: "pile", scoring: groups[0].map((c) => c.id) };
    if (g0 === 2 && g1 === 2) return { hand: "double", scoring: [...groups[0], ...groups[1]].map((c) => c.id) };
    const suits = new Set(cards.map((c) => c.suit));
    if (suits.size === 4) {
      const pick: number[] = [];
      for (const u of [0, 1, 2, 3] as Suit[]) {
        const best = cards.filter((c) => c.suit === u).sort((a, b) => b.rank - a.rank)[0];
        pick.push(best.id);
      }
      return { hand: "index", scoring: ids.filter((i) => pick.includes(i)) };
    }
    if (g0 === 2) return { hand: "echo", scoring: groups[0].map((c) => c.id) };
    const hi = cards.slice().sort((a, b) => b.rank - a.rank)[0];
    return { hand: "solo", scoring: hi ? [hi.id] : [] };
  }

  handValue(h: HandId): { chips: number; mult: number } {
    const d = HAND[h];
    const lv = this.s.levels[h] - 1;
    return { chips: d.chips + d.upChips * lv, mult: d.mult + d.upMult * lv };
  }

  /** Scores a hand without changing state (used for the preview and by play). */
  score(ids: number[], firstHand: boolean, lastHand: boolean): Scored {
    const s = this.s;
    const { hand, scoring } = this.evaluate(ids);
    const base = this.handValue(hand);
    let chips = base.chips;
    let mult = base.mult;
    if (this.bossNow() === "slip") {
      chips = Math.floor(chips / 2);
      mult = Math.max(1, Math.floor(mult / 2));
    }
    const steps: Step[] = [{ kind: "base", chips, mult, label: HAND[hand].name }];
    const played = ids.map((i) => this.card(i));
    const scored = scoring.map((i) => this.card(i));
    const ins = s.insiders;

    for (const c of scored) {
      if (this.debuffed(c)) {
        steps.push({ kind: "debuff", card: c.id, label: "Debuffed" });
        continue;
      }
      let times = 1;
      if (c.enh === "hot") times += 1 + (has(s, "potato") ? 1 : 0);
      for (let t = 0; t < times; t++) {
        const rc = RANK_CHIPS(c.rank);
        chips += rc;
        steps.push({ kind: "card", card: c.id, chips: rc, label: t > 0 ? "Again!" : undefined });
        const e: Enh | null = c.enh;
        if (e === "pump") {
          mult += 4;
          steps.push({ kind: "card", card: c.id, mult: 4, label: "Pump" });
        } else if (e === "dip") {
          chips += 30;
          steps.push({ kind: "card", card: c.id, chips: 30, label: "Dip" });
        } else if (e === "grad") {
          mult *= 1.5;
          steps.push({ kind: "card", card: c.id, xmult: 1.5, label: "Graduated" });
        }
        ins.forEach((j, ji) => {
          const add = (st: Omit<Step, "kind" | "ins">) => {
            if (st.chips) chips += st.chips;
            if (st.mult) mult += st.mult;
            if (st.xmult) mult *= st.xmult;
            steps.push({ kind: "insider", ins: ji, card: c.id, ...st });
          };
          switch (j.id) {
            case "maxi0":
            case "maxi1":
            case "maxi2":
            case "maxi3":
              if (c.suit === Number(j.id[4])) add({ mult: 3 });
              break;
            case "pumpchaser":
              if (e === "pump") add({ xmult: 1.5 });
              break;
            case "dip":
              if (c.l.x !== null && c.l.x < 0) add({ chips: 25 });
              break;
            case "early":
              if (this.ageHours(c) < 6) add({ chips: 40 });
              break;
            case "oldmoney":
              if (this.ageHours(c) >= 24) add({ mult: 4 });
              break;
            case "whale": {
              const v = Math.min(50, 3 * c.l.h);
              if (v > 0) add({ chips: v });
              break;
            }
            case "volume": {
              const v = Math.min(60, 2 * c.l.k);
              if (v > 0) add({ chips: v });
              break;
            }
            case "moonboy": {
              const v = Math.floor(c.l.p / 1000);
              if (v > 0) add({ mult: v });
              break;
            }
            case "snob":
              if (c.l.s.length <= 3) add({ mult: 5 });
              break;
            case "airdrop":
              if (c.l.d) add({ chips: 25 });
              break;
            case "valedictorian":
              if (c.rank === 14) add({ xmult: 1.5 });
              break;
          }
        });
      }
    }

    const ranks = new Map<number, number>();
    for (const c of played) ranks.set(c.rank, (ranks.get(c.rank) || 0) + 1);
    const maxSame = Math.max(0, ...ranks.values());
    const allSuit = played.length === 5 && played.every((c) => c.suit === played[0].suit);
    ins.forEach((j, ji) => {
      const add = (st: Omit<Step, "kind" | "ins">) => {
        if (st.chips) chips += st.chips;
        if (st.mult) mult += st.mult;
        if (st.xmult) mult *= st.xmult;
        steps.push({ kind: "insider", ins: ji, ...st });
      };
      switch (j.id) {
        case "ape":
          add({ mult: 4 });
          break;
        case "echo":
          if (maxSame >= 2) add({ mult: 8 });
          break;
        case "pile":
          if (maxSame >= 3) add({ mult: 12 });
          break;
        case "climber":
          if (hand === "run" || hand === "gradrun") add({ mult: 12 });
          break;
        case "purist":
          if (allSuit) add({ mult: 10 });
          break;
        case "paper":
          if (s.discardedRound > 0) add({ chips: 20 * s.discardedRound });
          break;
        case "copium":
          if (lastHand) add({ mult: 15 });
          break;
        case "diamond":
          if (s.discards > 0) add({ mult: 4 * s.discards });
          break;
        case "bag":
          if (j.v > 0) add({ mult: j.v });
          break;
        case "sniper":
          if (played.length <= 3) add({ xmult: 2 });
          break;
        case "index": {
          const su = new Set(scored.map((c) => c.suit));
          if (su.size === 4) add({ xmult: 2 });
          break;
        }
        case "front":
          if (firstHand) add({ xmult: 3 });
          break;
        case "bonding":
          if (j.v > 0) add({ xmult: 1 + 0.25 * j.v });
          break;
      }
    });

    mult = Math.round(mult * 100) / 100;
    let total = Math.floor(chips * mult);
    let zeroed: string | undefined;
    if (this.bossNow() === "wash" && s.typesRound.includes(hand)) {
      total = 0;
      zeroed = "Wash Trade: hand type already played";
    }
    return { hand, level: s.levels[hand], played: ids, scoring, steps, chips, mult, total, zeroed };
  }

  // ------------------------------------------------------------ shop
  private makeOffers(): Offer[] {
    const s = this.s;
    const rnd = stream(s.seed, "shop", s.shopVisit, s.rerolls);
    const out: Offer[] = [];
    const taken = new Set(s.insiders.map((j) => j.id));
    for (let k = 0; k < 2; k++) {
      const pool = INSIDERS.filter((j) => !taken.has(j.id));
      const j = pickWeighted(pool, (x) => RARITY_WEIGHT[x.rarity], rnd);
      if (!j) break;
      taken.add(j.id);
      out.push({ kind: "insider", id: j.id, cost: j.cost, sold: false });
    }
    const hand = pickWeighted(HANDS, (h) => ({ solo: 3, echo: 10, index: 7, double: 9, pile: 8, run: 7, flush: 7, book: 5, stockflush: 2, stampede: 3, gradrun: 1 })[h.id], rnd)!;
    out.push({ kind: "alpha", id: hand.id, cost: 3, sold: false });
    const mv = MOVES[Math.floor(rnd() * MOVES.length)];
    out.push({ kind: "move", id: mv.id, cost: mv.cost, sold: false });
    return out;
  }
  rerollCost(): number {
    return 4 + this.s.rerolls;
  }
  sellValue(o: Owned): number {
    return Math.max(1, Math.floor(o.paid / 2));
  }

  // ------------------------------------------------------------ actions
  apply(a: Action): void {
    const s = this.s;
    this.lastScored = null;
    this.lastDrawn = [];
    const fail = (m: string): never => {
      throw new Error(m);
    };
    switch (a.t) {
      case "go": {
        if (s.phase !== "blind") fail("not choosing a blind");
        s.phase = "round";
        s.round++;
        s.score = 0;
        s.target = targetFor(s.ante, s.blind, s.bosses[s.ante - 1]);
        const boss = this.bossNow();
        s.hands = boss === "bell" ? 3 : HANDS_PER_ROUND;
        s.discards = boss === "gasspike" ? 0 : DISCARDS_PER_ROUND + (has(s, "gas") ? 1 : 0);
        s.handsPlayedRound = 0;
        s.discardedRound = 0;
        s.typesRound = [];
        s.hand = [];
        s.used = [];
        s.draw = shuffle(
          s.deck.map((c) => c.id),
          stream(s.seed, "deal", s.round),
        );
        this.lastDrawn = this.drawUp();
        break;
      }
      case "play": {
        if (s.phase !== "round") fail("not in a round");
        const ids = this.validSel(a.c, this.minPlay(), 5);
        const first = s.handsPlayedRound === 0;
        const last = s.hands === 1;
        const sc = this.score(ids, first, last);
        this.lastScored = sc;
        s.hands--;
        s.handsPlayedRound++;
        s.handsTotal++;
        s.typesRound.push(sc.hand);
        s.score += sc.total;
        if (!s.best || sc.total > s.best.total)
          s.best = {
            total: sc.total,
            hand: sc.hand,
            cards: ids.map((i) => {
              const c = this.card(i);
              return { t: c.l.t, s: c.l.s, c: c.l.c, rank: c.rank, suit: c.suit };
            }),
          };
        s.hand = s.hand.filter((i) => !ids.includes(i));
        s.used.push(...ids);
        if (s.score >= s.target) {
          this.winRound();
        } else if (s.hands <= 0) {
          s.phase = "over";
        } else {
          this.lastDrawn = this.drawUp();
          if (s.hand.length === 0) s.phase = "over";
        }
        break;
      }
      case "disc": {
        if (s.phase !== "round") fail("not in a round");
        if (s.discards <= 0) fail("no discards left");
        const ids = this.validSel(a.c, 1, 5);
        s.discards--;
        s.discardedRound += ids.length;
        for (const j of s.insiders) if (j.id === "bag") j.v += ids.length;
        s.hand = s.hand.filter((i) => !ids.includes(i));
        s.used.push(...ids);
        this.lastDrawn = this.drawUp();
        break;
      }
      case "use": {
        const id = s.moves[a.i];
        if (!id) fail("no such move");
        const mv = MOVE[id];
        if (s.phase === "over" || s.phase === "won") fail("run is over");
        if (mv.id === "treasury") {
          s.money += Math.min(12, Math.max(0, s.money));
        } else {
          if (s.phase !== "round") fail("use this during a round");
          const ids = this.validSel(a.c, mv.min, mv.max);
          this.doMove(mv.id, ids);
        }
        s.moves.splice(a.i, 1);
        break;
      }
      case "sell": {
        const j = s.insiders[a.i];
        if (!j) fail("no such insider");
        if (s.phase === "over" || s.phase === "won") fail("run is over");
        s.money += this.sellValue(j);
        s.insiders.splice(a.i, 1);
        break;
      }
      case "cash": {
        if (s.phase !== "cashout" || !s.cashout) fail("nothing to cash");
        s.money += s.cashout!.total;
        s.cashout = null;
        s.phase = "shop";
        s.shopVisit++;
        s.rerolls = 0;
        s.offers = this.makeOffers();
        break;
      }
      case "buy": {
        if (s.phase !== "shop") fail("shop is closed");
        const o = s.offers[a.i];
        if (!o || o.sold) fail("not for sale");
        if (s.money < o.cost) fail("not enough money");
        if (o.kind === "insider") {
          if (s.insiders.length >= MAX_INSIDERS) fail("insider slots full");
          s.insiders.push({ id: o.id, v: 0, paid: o.cost });
        } else if (o.kind === "alpha") {
          s.levels[o.id as HandId]++;
        } else {
          if (s.moves.length >= MAX_MOVES) fail("move slots full");
          s.moves.push(o.id);
        }
        s.money -= o.cost;
        o.sold = true;
        break;
      }
      case "roll": {
        if (s.phase !== "shop") fail("shop is closed");
        const c = this.rerollCost();
        if (s.money < c) fail("not enough money");
        s.money -= c;
        s.rerolls++;
        s.offers = this.makeOffers();
        break;
      }
      case "next": {
        if (s.phase !== "shop") fail("shop is closed");
        s.phase = "blind";
        s.offers = [];
        s.target = targetFor(s.ante, s.blind, s.bosses[s.ante - 1]);
        break;
      }
    }
    this.trail.push(a);
  }

  private validSel(c: number[], min: number, max: number): number[] {
    const ids = [...new Set(c)];
    if (ids.length < min || ids.length > max) throw new Error(`select ${min === max ? min : `${min}-${max}`} cards`);
    for (const i of ids) if (!this.s.hand.includes(i)) throw new Error("card not in hand");
    return ids;
  }

  private doMove(id: string, ids: number[]): void {
    const s = this.s;
    const cards = ids.map((i) => this.card(i));
    if (id === "shill") for (const c of cards) c.rank = c.rank >= 14 ? 2 : c.rank + 1;
    else if (id === "pump") for (const c of cards) c.enh = "pump";
    else if (id === "hype") for (const c of cards) c.enh = "hot";
    else if (id === "burn") {
      s.deck = s.deck.filter((c) => !ids.includes(c.id));
      s.hand = s.hand.filter((i) => !ids.includes(i));
    } else if (id === "clone") {
      const src = cards[0];
      const copy: Card = { ...src, id: s.nextCardId++ };
      s.deck.push(copy);
      s.hand.push(copy.id);
    } else if (id.startsWith("bridge")) {
      const u = Number(id[6]) as Suit;
      for (const c of cards) {
        if (c.suit !== u) {
          c.suit = u;
          c.bridged = true;
        }
      }
    }
  }

  private winRound(): void {
    const s = this.s;
    s.cleared++;
    for (const j of s.insiders) if (j.id === "bonding") j.v++;
    const reward = BLIND_REWARD[s.blind];
    const interest = Math.min(5, Math.floor(Math.max(0, s.money) / 5));
    const extra = s.insiders.filter((j) => j.id === "mm").length * 3;
    s.cashout = { reward, handsLeft: s.hands, interest, extra, total: reward + s.hands + interest + extra };
    s.hand = [];
    s.draw = [];
    if (s.blind === 2 && s.ante >= MAX_ANTE) {
      s.money += s.cashout.total;
      s.phase = "won";
      return;
    }
    if (s.blind === 2) {
      s.ante++;
      s.blind = 0;
    } else s.blind++;
    s.phase = "cashout";
  }

  summary() {
    const s = this.s;
    return {
      seed: s.seed,
      edition: s.edition,
      ante: s.ante,
      blind: s.blind,
      cleared: s.cleared,
      won: s.phase === "won",
      over: s.phase === "over" || s.phase === "won",
      best: s.best,
      hands: s.handsTotal,
      money: s.money,
    };
  }
}

/** Re-runs an action list; throws on the first illegal move. */
export function rerun(ed: Edition, seed: string, actions: Action[]): Run {
  const r = new Run(ed, seed);
  for (const a of actions) r.apply(a);
  return r;
}

// ------------------------------------------------------------ compact action trail
export function encodeTrail(actions: Action[]): string {
  return actions
    .map((a) => {
      switch (a.t) {
        case "go":
          return "g";
        case "play":
          return "p" + a.c.join(".");
        case "disc":
          return "d" + a.c.join(".");
        case "use":
          return "u" + [a.i, ...a.c].join(".");
        case "sell":
          return "s" + a.i;
        case "cash":
          return "c";
        case "buy":
          return "b" + a.i;
        case "roll":
          return "r";
        case "next":
          return "n";
      }
    })
    .join("_");
}

export function decodeTrail(str: string): Action[] {
  if (!str) return [];
  return str.split("_").map((tok): Action => {
    const k = tok[0];
    const nums = tok.length > 1 ? tok.slice(1).split(".").map((x) => Number(x)) : [];
    if (nums.some((n) => !Number.isInteger(n) || n < 0 || n > 100000)) throw new Error("bad trail");
    switch (k) {
      case "g":
        return { t: "go" };
      case "p":
        return { t: "play", c: nums };
      case "d":
        return { t: "disc", c: nums };
      case "u":
        return { t: "use", i: nums[0] ?? -1, c: nums.slice(1) };
      case "s":
        return { t: "sell", i: nums[0] ?? -1 };
      case "c":
        return { t: "cash" };
      case "b":
        return { t: "buy", i: nums[0] ?? -1 };
      case "r":
        return { t: "roll" };
      case "n":
        return { t: "next" };
    }
    throw new Error("bad trail");
  });
}
