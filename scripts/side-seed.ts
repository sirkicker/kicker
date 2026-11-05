// DEV ONLY: forty demo men across the last four days, for screenshots and the brand assets. It writes into the
// in-memory KV of the process it runs in and refuses to run when real KV credentials are present, so it can never
// touch the live table. The vite dev server runs it when started with SIDE_SEED=1 (see vite.config.ts).
import { kvOn } from "../api/_kv.js";
import { seedMan, setFirst } from "../api/_side.js";
import { SET_SIZE, addDays, utcDay, type Kit, type Man, type Pattern } from "../shared/side.js";

type Row = [name: string, cap: string, pat: Pattern, a: number, b: number, c: number, head: number, hair: number, skin: number, gold?: boolean];
// [name, line, (5.0 shirt fields, now only used to vary the demo kits), holder]
const ROWS: Row[] = [
  ["ferro", "been on this rod since the open", "hoops", 0, 3, 3, 0, 1, 2],
  ["ana b.", "sideways is still a direction", "stripes", 8, 0, 1, 3, 0, 1],
  ["the accountant", "flat is the new up", "pin", 12, 14, 0, 4, 5, 0],
  ["lou", "no spinning. house rules", "halves", 4, 0, 12, 5, 7, 3],
  ["teo", "i saw the ball once. it was nice", "sash", 9, 8, 0, 2, 2, 4],
  ["gus", "left, right, left. that's the job", "chevron", 1, 12, 12, 6, 6, 1, true],
  ["nora", "my rod, my rules, mostly", "quarters", 10, 0, 0, 7, 3, 0],
  ["wes", "holding the line. literally", "plain", 3, 1, 1, 1, 4, 2],
  ["mara", "the market and i agree", "hoops", 7, 0, 1, 2, 0, 5],
  ["kip", "", "stripes", 5, 12, 0, 0, 3, 1],
  ["old dmitri", "i remember when we moved diagonally", "pin", 13, 0, 0, 4, 5, 2],
  ["juno", "range-bound and at peace", "sash", 15, 3, 3, 3, 1, 0],
  ["bo", "they bolted me here in 1974", "halves", 0, 10, 10, 5, 0, 3],
  ["pim", "a little to the left. no, back", "hoops", 11, 12, 12, 1, 2, 1],
  ["rosa", "chart says sideways. i say sideways", "chevron", 4, 1, 1, 6, 0, 4, true],
  ["hal", "keeper by trade, decor by choice", "plain", 12, 1, 1, 0, 7, 0],
  ["yuki", "i only turn for nobody", "quarters", 8, 15, 0, 2, 0, 1],
  ["sol", "slow is smooth. smooth is sideways", "stripes", 6, 3, 3, 7, 1, 2],
  ["ines", "", "hoops", 9, 3, 0, 3, 3, 3],
  ["mo", "the rod remembers", "pin", 10, 1, 0, 5, 6, 5],
  ["clem", "please do not spin the man", "halves", 1, 8, 8, 4, 5, 0],
  ["vera", "patience is a position", "sash", 0, 4, 4, 1, 2, 1],
  ["tomas", "up and down are for other people", "stripes", 3, 0, 0, 6, 1, 2],
  ["dot", "here for the felt", "plain", 15, 10, 10, 2, 4, 0],
  ["ruben", "nine to five, left to right", "chevron", 8, 1, 1, 0, 0, 4],
  ["ada", "", "quarters", 4, 12, 0, 7, 7, 1],
  ["fitz", "i was told there would be a ball", "hoops", 12, 5, 5, 5, 3, 2, true],
  ["marlo", "same spot as yesterday. bullish on it", "pin", 0, 8, 8, 3, 1, 0],
  ["edie", "it's a lifestyle", "sash", 10, 6, 6, 1, 0, 3],
  ["ozzie", "steady hands, no wrists", "stripes", 7, 12, 12, 0, 2, 1],
  ["pia", "the view is the same from everywhere", "halves", 3, 9, 9, 6, 6, 2],
  ["little sam", "smallest man, longest rod", "plain", 5, 0, 0, 4, 5, 5],
  ["greta", "i nod, i slide, i stay", "hoops", 1, 3, 3, 2, 3, 1],
  ["noel", "if it moves up i didn't do it", "chevron", 11, 3, 3, 7, 0, 0],
  ["bea", "my best side is the side", "quarters", 0, 7, 1, 3, 2, 3, true],
  ["igor", "", "pin", 8, 6, 6, 5, 1, 4],
  ["cass", "sideways since monday", "sash", 12, 0, 0, 1, 4, 1],
  ["leo", "they call it consolidation", "stripes", 4, 15, 15, 0, 6, 2],
  ["mina", "i stand where the rod stands", "plain", 9, 3, 3, 6, 0, 0],
  ["otto", "keep calm and slide", "halves", 13, 1, 1, 2, 7, 2],
];
const PER_DAY = [9, 11, 8, 12];
const OWN: Kit[] = [
  { a: "#cf5b3e", b: "#221419", p: "plain" },
  { a: "#8db5a3", b: "#1e4a53", p: "stripes" },
  { a: "#a3bad6", b: "#3e5d8c", p: "hoops" },
  { a: "#221419", b: "#d6b25e", p: "sash" },
  { a: "#e3a27a", b: "#6e2140", p: "quarters" },
];
void (0 as unknown as Pattern);

export async function seed(now = Date.now()): Promise<number> {
  if (kvOn()) throw new Error("side-seed: refusing to seed a real KV");
  const today = utcDay(new Date(now));
  const days = [3, 2, 1, 0].map((k) => addDays(today, -k));
  await setFirst(days[0]);
  let i = 0;
  for (let d = 0; d < days.length; d++) {
    for (let k = 0; k < PER_DAY[d]; k++, i++) {
      const [name, cap, pat, a, b, c, head, hair, skin, gold] = ROWS[i];
      // every demo man is a viber: spread over the whole set; one in four wears his own kit, the rest the team's
      const v = ((i * 53 + 7) % SET_SIZE) + 1;
      const man: Man = {
        id: "demo" + String(i + 1).padStart(3, "0"),
        n: i + 1,
        day: days[d],
        t: Date.parse(days[d] + "T00:00:00Z") + k * 1_800_000,
        name,
        cap,
        v,
      };
      if (i % 4 === 3) man.kit = OWN[(i >> 2) % OWN.length];
      void [pat, a, b, c, head, hair, skin];
      if (gold) man.gold = true;
      await seedMan(man);
    }
  }
  return i;
}
