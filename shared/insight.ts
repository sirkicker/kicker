// The live side of a card, made visible: the data tag, the Insider highlights and the shop's deck line.
// Everything here reads the same fields and thresholds the engine scores with (cardInsider in engine.ts),
// so what the table shows is what the score does.
import { ENH, RANK_LABEL, SUITS, type Card } from "./data.js";
import { INSIDER } from "./content.js";
import { CARD_INSIDER_MAX, cardInsider } from "./engine.js";

export interface CardFacts {
  title: string;
  lines: [string, string][];
}

const pct = (bps: number) => `${(bps / 100).toFixed(bps < 1000 ? 1 : 0)}%`;

export function ageLabel(hours: number): string {
  const h = Math.max(0, hours);
  if (h < 1) return `${Math.max(1, Math.round(h * 60))} min`;
  if (h < 48) return `${Math.round(h)} h`;
  return `${Math.round(h / 24)} days`;
}

/** The tag: what the Insiders read off this card, in their words. `ageHours` is Run.ageHours(card). */
export function cardFacts(c: Card, ageHours: number): CardFacts {
  const l = c.l;
  const price = l.x === null ? "no trades to compare yet" : l.x < 0 ? `down ${pct(-l.x)} (latest window)` : l.x > 0 ? `up ${pct(l.x)} (latest window)` : "flat";
  const badge = c.enh ? `${ENH[c.enh].name}: ${ENH[c.enh].text.toLowerCase()}` : "none";
  return {
    title: `${RANK_LABEL(c.rank)} · $${l.s}`,
    lines: [
      ["Launch", l.n],
      ["Suit", `${SUITS[c.suit].name}, ${c.bridged ? "bridged by a move" : `paired with ${c.q}`}`],
      ["Rank", `${RANK_LABEL(c.rank)}: curve progress ${pct(l.p)}`],
      ["Holders", l.h.toLocaleString("en-US")],
      ["Trades 24h", l.k.toLocaleString("en-US")],
      ["Age", `launched ${ageLabel(ageHours)} before the deal`],
      ["Price", price],
      ["Graduated", l.g ? "yes" : "no"],
      ["Gift list", l.d ? "yes" : "no"],
      ["Badge", badge],
    ],
  };
}

export interface Highlight {
  id: string; // insider id
  slot: number; // index in the player's insiders
  hue: number;
  /** 0..1: how much of that Insider's top reward this card gets (1 for the yes/no ones). */
  strength: number;
}

/** Which held Insiders would reward this card if it scored. True exactly when cardInsider gives a step. */
export function highlights(insiders: { id: string }[], c: Card, ageHours: number): Highlight[] {
  const out: Highlight[] = [];
  insiders.forEach((j, slot) => {
    const st = cardInsider(j.id, c, ageHours);
    if (!st) return;
    const cap = CARD_INSIDER_MAX[j.id];
    const v = (st.chips || 0) + (st.mult || 0);
    out.push({ id: j.id, slot, hue: INSIDER[j.id]?.hue ?? 0, strength: cap ? Math.min(1, v / cap) : 1 });
  });
  return out;
}

// ------------------------------------------------------------ the shop's line about this deck
interface Fact {
  insider: string;
  count: number;
  line: (n: number, total: number) => string;
}

/** True facts about the 52 cards of this run, each tied to the Insider it feeds. Zero counts never make a line. */
export function deckFacts(deck: Card[], ageOf: (c: Card) => number): Fact[] {
  const n = (f: (c: Card) => boolean) => deck.filter(f).length;
  // a quarter of the deck earns the adjective; below that, just the count
  const many = (k: number, t: number) => k * 4 >= t;
  const cards = (k: number) => `${k} ${k === 1 ? "card" : "cards"}`;
  const is = (k: number) => (k === 1 ? "is" : "are");
  const has = (k: number) => (k === 1 ? "has" : "have");
  const runs = (k: number) => (k === 1 ? "runs" : "run");
  const facts: Fact[] = [
    { insider: "early", count: n((c) => ageOf(c) < 6), line: (k, t) => `${many(k, t) ? "This deck is young: " : ""}${k} of ${t} launched under 6 h before the deal.` },
    { insider: "oldmoney", count: n((c) => ageOf(c) >= 24), line: (k, t) => `${many(k, t) ? "Old stock: " : ""}${k} of ${t} ${is(k)} more than a day old.` },
    { insider: "dip", count: n((c) => c.l.x !== null && c.l.x < 0), line: (k, t) => `${many(k, t) ? "Lots of red: " : ""}${cards(k)} ${is(k)} down.` },
    { insider: "volume", count: n((c) => c.l.k >= 30), line: (k, t) => `${many(k, t) ? "Heavy trading: " : ""}${cards(k)} did 30+ trades in 24h.` },
    { insider: "whale", count: n((c) => c.l.h >= 17), line: (k, t) => `${many(k, t) ? "Crowded tables: " : ""}${cards(k)} ${has(k)} 17+ holders.` },
    { insider: "snob", count: n((c) => c.l.s.length <= 3), line: (k) => `${cards(k)} ${has(k)} a ticker of 3 letters or fewer.` },
    { insider: "airdrop", count: n((c) => c.l.d), line: (k) => `${cards(k)} ${runs(k)} a gift list.` },
    { insider: "moonboy", count: n((c) => c.l.p >= 5000), line: (k) => `${cards(k)} ${is(k)} past half their curve.` },
    { insider: "pumpchaser", count: n((c) => c.enh === "pump"), line: (k) => `${k} Pump ${k === 1 ? "card" : "cards"} in this deck.` },
    { insider: "potato", count: n((c) => c.enh === "hot"), line: (k) => `${k} Hot ${k === 1 ? "card" : "cards"} in this deck.` },
  ];
  return facts.filter((f) => f.count > 0);
}

/**
 * One dry line for the shop. Prefers a fact about an Insider on offer (the one that touches the most cards);
 * with none on offer, the strongest fact, naming who would like it.
 */
export function shopHint(deck: Card[], ageOf: (c: Card) => number, offerIds: string[]): { text: string; insider: string; count: number } | null {
  const facts = deckFacts(deck, ageOf).sort((a, b) => b.count - a.count);
  if (!facts.length) return null;
  const onOffer = facts.find((f) => offerIds.includes(f.insider));
  const f = onOffer || facts[0];
  const name = INSIDER[f.insider]?.name || f.insider;
  const text = `${f.line(f.count, deck.length)} ${name} ${onOffer ? "likes that" : "would like that"}.`;
  return { text, insider: f.insider, count: f.count };
}
