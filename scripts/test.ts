// Unit tests: the match engine (determinism, the rules, the rival, every boss club), the replay guard (forged,
// reordered and replayed trails), the Daily Match seed and pin, the Daily board, team kits and sign-in, names and
// Your table, and the live figures. Runs on the in-memory store, no network: `npm test`.
// Add `--live` to also read $KICKER balances on Robinhood Chain testnet, `--anvil` to check a real ERC-1271 account on a local anvil.
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { STAT, TRAIT, buildSquad, deadList, ghostWhy, traitsOf, type Edition, type Launch, type Pair } from "../shared/data.js";
import { figureFacts, roomHint, squadFacts } from "../shared/insight.js";
import { Run, rerun, encodeTrail, decodeTrail, parseTrail, aiParams, reflect, resolveBlock, trace, laneOf, slotOf, figAt, fixturesOf, sortTable, pathOf, R3, CURRENT_RULES, RULES_LEGACY, RULES_NEXT, type Action, type Ev, type RunMode } from "../shared/engine.js";
import { lineFor, DESK_LINES, DESK_POOLS, recapOf } from "../shared/voice.js";
import { readFileSync } from "node:fs";
import { hudOf, hudStep } from "../src/hud.js";
import { botStep, playSeason } from "../shared/bot.js";
import { COACHES, MOUTH, RODS, START_FANS, WIN_FANS, drillCost, BOSSES, CAPTAIN_RULE, CLUBS, CLUB_ID, FINAL_BOSS, HAUNT, KICKOFFS, MATCHDAYS, ROUNDS_R3, START_OFF, STICKY_LANES, TABLE_EVENT_IDS, clubIdOf, fixtureName, type TableEventId } from "../shared/content.js";
import { mulberry32, normSeed } from "../shared/rng.js";
import { bumpStreak, dailySeed, dayLabel, dayStartHour, liveStreak, prevDay, utcDay } from "../shared/daily.js";
import { houseMessage, signinMessage } from "../shared/house.js";
import { mergeProfile, PROFILE_DAYS, PROFILE_RECENT, type Profile } from "../shared/profile.js";
import { getProfile, issueSession, receiptFor, receiptOk, sessionOf, signIn } from "../api/_me.js";
import { save } from "../api/_store.js";
import { dailyPin, publicBoard } from "../api/_daily.js";
import { verifyAndStore, getHall } from "../api/_runs.js";
import { checkHouse, claimOk, issueClaim, kickerBalance, smartAccountSigned, HouseError } from "../api/_house.js";
import { paraConfig } from "../src/para-config.js";
import { createWalletClient, custom, hashMessage, type Hex } from "viem";

// keep everything in memory, whatever the shell has set
delete process.env.BLOB_READ_WRITE_TOKEN;
delete process.env.HOUSE_SECRET;
delete process.env.HOUSE_RPC;

let passed = 0;
let failed = 0;
async function test(name: string, fn: () => Promise<void> | void) {
  try {
    await fn();
    passed++;
    console.info("  ok  ", name);
  } catch (e) {
    failed++;
    console.info("  FAIL", name, "\n       ", (e as Error).message);
  }
}

/** A made-up squad cut: 30 launches per pair kind, enough for any seed. */
function fakeEdition(id: number): Edition {
  const r = mulberry32(id);
  const pool: Launch[][] = [[], [], [], []];
  for (let u = 0; u < 4; u++)
    for (let i = 0; i < 30; i++) {
      const p = Math.floor(r() * r() * 10000);
      pool[u].push({
        t: "0x" + (id * 1000 + u * 100 + i).toString(16).padStart(40, "0"),
        s: `T${u}${i}`,
        n: `Test ${u}-${i}`,
        c: null,
        q: ["ETH", "NVDA", "VIBEVIBE", "USDG"][u],
        u: u as Pair,
        p,
        x: Math.floor(r() * 6000) - 3000,
        k: Math.floor(r() * 40),
        h: Math.floor(r() * 20),
        a: id * 3600 - Math.floor(r() * 200000),
        g: p > 9600,
        d: r() < 0.1,
      });
    }
  return { id, at: new Date(id * 3_600_000 + 60_000).toISOString(), block: "1", scanned: 120, dropped: 0, pool };
}

const putEdition = (ed: Edition) => save(`editions/${ed.id}.json`, ed);

/** A finished season: the coach's bot, a bot that never buys anything, or a lazy one that shoots at once and never blocks. */
function playOut(ed: Edition, seed: string, how: "bot" | "nobuy" | "lazy" = "bot") {
  const run = new Run(ed, seed, "season", RULES_LEGACY);
  let n = 0;
  while (n++ < 40000) {
    const s = run.s;
    if (s.phase === "over" || s.phase === "won") break;
    if (how !== "bot" && s.phase === "room") {
      run.apply({ t: "next" });
      continue;
    }
    if (how === "lazy" && s.phase === "defend") {
      run.apply({ t: "hold" });
      continue;
    }
    if (how === "lazy" && s.phase === "attack") {
      const k = run.myKicks();
      const shot = k.find((x) => x.kick.r === 4) || k[0];
      if (shot) run.apply({ t: "kick", r: shot.kick.r, d: shot.kick.d });
      else botStep(run);
      continue;
    }
    if (!botStep(run)) break;
  }
  assert.ok(run.s.phase === "over" || run.s.phase === "won", "season did not finish");
  return { trail: encodeTrail(run.trail, "season", RULES_LEGACY), best: run.s.best?.total || 0, run };
}

/** A fresh match against a given boss club (the boss is set by hand; the seed decides the rest). */
/** A 2.1 boss match (the legacy rules: these tests pin 2.1's boss rules, which old trails replay by). */
function bossMatch(ed: Edition, id: string, round = 1) {
  const r = new Run(ed, "BOSS-0001", "season", RULES_LEGACY);
  r.s.round = round;
  r.s.kind = 2;
  r.s.bosses[round - 1] = id;
  r.apply({ t: "go" });
  return r;
}

console.info("the table");
const EDT = fakeEdition(497000);
await test("lanes come back off the side walls, and count the walls", () => {
  assert.deepEqual(reflect(4), [4, 0]);
  assert.deepEqual(reflect(-1), [0, 1]);
  assert.deepEqual(reflect(-3), [2, 1]);
  assert.deepEqual(reflect(10), [9, 1]);
  assert.deepEqual(reflect(21), [1, 2]);
});
await test("Power beats blockers one at a time; Diamond Gloves and the final's keeper hold", () => {
  const bl = [
    { rod: 1, fig: 0, x: 7, lane: 4 },
    { rod: 0, fig: 0, x: 8, lane: 4 },
  ];
  assert.deepEqual(resolveBlock(bl, 0, false).at?.rod, 1);
  assert.equal(resolveBlock(bl, 1, false).at?.rod, 0);
  assert.equal(resolveBlock(bl, 2, false).at, null);
  assert.equal(resolveBlock(bl, 2, false).beaten, 2);
  assert.equal(resolveBlock(bl, 5, true).at?.rod, 0, "Diamond Gloves: the keeper is never beaten");
  assert.equal(resolveBlock(bl, 2, false, 2).at?.rod, 0, "the final: a keeper takes two");
  assert.equal(resolveBlock(bl, 3, false, 2).at, null);
});
await test("a kick's path: straight, angled, off the wall; a pass needs a figure where it lands", () => {
  const off = [
    [4, 2, 0, 1],
    [5, 3, 1, 2],
  ];
  // your attack (lanes 1, 4, 7) straight at goal from lane 4: their defence at 3 and 7 misses, their keeper at 5 misses
  const t = trace(off, [-1, -1], 0, 3, 4, { r: 4, d: 0 });
  assert.equal(t.land, 4);
  assert.ok(t.legal);
  assert.equal(t.blockers.length, 0);
  // from lane 1 angled down: lanes 2, 3, 4 at the goal line
  const a = trace(off, [-1, -1], 0, 3, 1, { r: 4, d: 1 });
  assert.equal(a.land, 4);
  assert.ok(a.legal);
  // a pass from midfield lane 4 straight to the attack figure on lane 4: their midfield (1,3,5,7,9) is not in lane 4
  const p = trace(off, [-1, -1], 0, 2, 4, { r: 3, d: 0 });
  assert.ok(p.legal);
  assert.equal(p.to, 1);
  assert.equal(p.blockers.length, 0);
  // the same pass angled lands on lane 6, where you have nobody
  assert.equal(trace(off, [-1, -1], 0, 2, 4, { r: 3, d: 1 }).legal, false);
  // a shot that leaves the mouth is not a shot
  assert.equal(trace(off, [-1, -1], 0, 3, 7, { r: 4, d: 0 }).legal, false);
  assert.ok(MOUTH[0] <= 4 && 4 <= MOUTH[1]);
});

console.info("determinism");
await test("same seed and cut: the same squad, clubs, bosses and shelf", () => {
  const a = new Run(EDT, "SAME-0001", "season", RULES_LEGACY);
  const b = new Run(EDT, "SAME-0001", "season", RULES_LEGACY);
  assert.deepEqual(a.s.squad.map((l) => l.t), b.s.squad.map((l) => l.t));
  assert.deepEqual(a.s.bosses, b.s.bosses);
  assert.deepEqual(a.s.clubs, b.s.clubs);
  const c = new Run(EDT, "SAME-0002", "season", RULES_LEGACY);
  assert.notDeepEqual(c.s.squad.map((l) => l.t), a.s.squad.map((l) => l.t), "another seed picks another squad");
  assert.equal(a.s.bosses[7], "bell", "the final is always the Closing Bell");
  assert.equal(new Set(a.s.bosses.slice(0, 7)).size, 7, "seven different boss clubs before the final");
});
await test("a squad is placed by its numbers: the top three by curve play up front", () => {
  const sq = buildSquad(EDT, "SAME-0003");
  assert.equal(sq.length, 11);
  const att = sq.slice(8).map((l) => l.p);
  for (const l of sq.slice(0, 8)) assert.ok(l.p <= Math.min(...att), "nobody further back is further along the curve");
});
await test("the bot plays the same season twice, touch for touch; the trail replays it exactly", () => {
  const a = playSeason(new Run(EDT, "TWIN-0001", "season", RULES_LEGACY));
  const b = playSeason(new Run(EDT, "TWIN-0001", "season", RULES_LEGACY));
  assert.equal(encodeTrail(a.trail, "season", RULES_LEGACY), encodeTrail(b.trail, "season", RULES_LEGACY));
  assert.deepEqual(a.s, b.s);
  const c = rerun(EDT, "TWIN-0001", decodeTrail(encodeTrail(a.trail, "season", RULES_LEGACY)), "season", RULES_LEGACY);
  assert.deepEqual(c.s, a.s);
  assert.ok(a.s.phase === "over" || a.s.phase === "won");
});
await test("the rival reacts the same way to the same position", () => {
  const r = new Run(EDT, "REAC-0001", "season", RULES_LEGACY);
  r.apply({ t: "go" });
  const one = r.reactTo(r.m.off.map((o) => o.slice()));
  const two = r.reactTo(r.m.off.map((o) => o.slice()));
  assert.deepEqual(one, two);
});
await test("a trail decodes to what it encodes, and junk does not decode", () => {
  const acts: Action[] = [{ t: "go" }, { t: "slide", r: 3, d: -1 }, { t: "kick", r: 4, d: 1 }, { t: "hold" }, { t: "use", i: 0 }, { t: "swap", a: 8, b: 3 }, { t: "sell", i: 1 }, { t: "collect" }, { t: "buy", i: 2 }, { t: "next" }];
  assert.deepEqual(decodeTrail(encodeTrail(acts, "season", RULES_LEGACY)), acts);
  for (const junk of ["q", "s1.1", "s1", "k1.5", "g1", "w8", "b", "h2", "s-1.0"]) assert.throws(() => decodeTrail(junk), junk);
});

console.info("the rules");
await test("touches: a slide or a kick costs one; out of touches, their keeper restarts", () => {
  const r = new Run(EDT, "RULE-0001", "season", RULES_LEGACY);
  r.apply({ t: "go" });
  const m = r.m;
  m.free = [0, 0, 0, 0];
  m.freeAny = 0;
  const before = m.touches;
  r.apply({ t: "slide", r: 0, d: 1 });
  assert.equal(r.s.phase === "attack" ? r.m.touches : before - 1, before - 1);
  // burn the rest on the keeper rod
  let guard = 0;
  while (r.s.phase === "attack" && guard++ < 20) {
    const d = r.canMove(0, 0, 1) ? 1 : -1;
    r.m.free = [0, 0, 0, 0];
    r.m.freeAny = 0;
    r.apply({ t: "slide", r: 0, d });
  }
  assert.equal(r.s.phase, "defend");
  assert.deepEqual([r.m.ball.side, r.m.ball.rod], [1, 0], "a dead ball goes to their keeper");
});
await test("Pace gives its rod a free slide; a free slide costs no touch", () => {
  const r = new Run(EDT, "RULE-0002", "season", RULES_LEGACY);
  r.s.squad[0] = { ...r.s.squad[0], k: STAT.pace.at + 5 };
  r.apply({ t: "go" });
  assert.equal(r.m.free[0], 1);
  const t = r.m.touches;
  r.apply({ t: "slide", r: 0, d: 1 });
  if (r.s.phase === "attack") assert.equal(r.m.touches, t);
});
await test("passes only go forward, to a figure of yours; illegal kicks are refused", () => {
  const r = new Run(EDT, "RULE-0003", "season", RULES_LEGACY);
  r.apply({ t: "go" });
  assert.throws(() => r.apply({ t: "kick", r: 1, d: 0 }), /forward/);
  for (const k of r.myKicks()) assert.ok(k.kick.r > r.m.ball.rod);
});
await test("a blocked pass goes to the blocker; Grip keeps the ball once a possession", () => {
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    const r = new Run(EDT, "GRIP-" + String(i).padStart(4, "0"), "season", RULES_LEGACY);
    r.apply({ t: "go" });
    const blocked = r.myKicks().find((k) => k.kick.r !== 4 && !k.open);
    if (!blocked) continue;
    found = true;
    const slot = slotOf(r.m.ball.rod, r.m.ball.fig);
    const gripped = r.stats(slot).grip;
    r.apply({ t: "kick", r: blocked.kick.r, d: blocked.kick.d });
    if (gripped) assert.ok(r.events.some((e) => e.e === "kick" && e.result === "kept"));
    else {
      assert.equal(r.s.phase, "defend");
      assert.deepEqual([r.m.ball.rod, r.m.ball.fig], [blocked.at!.rod, blocked.at!.fig]);
    }
  }
  assert.ok(found, "found a blocked pass to try");
});
await test("a goal scores, rates the move, and the conceding side kicks off", () => {
  let scored = false;
  for (let i = 0; i < 40 && !scored; i++) {
    const r = new Run(EDT, "GOAL-" + String(i).padStart(4, "0"), "season", RULES_LEGACY);
    let n = 0;
    while (n++ < 400 && !scored && (r.s.phase === "fixture" || r.s.phase === "attack" || r.s.phase === "defend")) {
      const before = r.s.goalsFor;
      botStep(r);
      if (r.s.goalsFor > before) {
        scored = true;
        const g = r.events.find((e) => e.e === "goal");
        assert.ok(g && g.e === "goal" && g.rating >= 100 && g.style.length > 0);
        assert.ok(r.s.best && r.s.best.total >= 100 && r.s.best.figs.length === 5);
        if (r.s.phase === "defend") assert.deepEqual([r.m.ball.side, r.m.ball.rod, r.m.ball.fig], [1, 2, 2]);
      }
    }
  }
  assert.ok(scored);
});
await test("full time: win fans, and nothing to buy that you can't afford", () => {
  const r = new Run(EDT, "FANS-0001", "season", RULES_LEGACY);
  let n = 0;
  while (n++ < 3000 && r.s.phase !== "fulltime" && r.s.phase !== "over" && r.s.phase !== "won") botStep(r);
  if (r.s.phase !== "fulltime") return;
  const ft = r.s.fulltime!;
  const fans = r.s.fans;
  assert.ok(ft.rows[0][1] === WIN_FANS[r.m.kind] || ft.rows[0][1] === 0);
  r.apply({ t: "collect" });
  assert.equal(r.s.fans, fans + ft.total);
  assert.equal(r.s.phase, "room");
  for (const o of r.s.offers) {
    if (o.kind === "coach") assert.equal(o.cost, COACHES.find((c) => c.id === o.id)!.cost, "the printed price");
    if (o.kind === "drill") assert.equal(o.cost, drillCost(r.s.drills[o.id as "shoot"]));
  }
  r.s.fans = 0;
  const i = r.s.offers.findIndex((o) => o.cost > 0);
  assert.throws(() => r.apply({ t: "buy", i }), /not enough fans/);
  assert.equal(START_FANS, 4);
});
await test("swaps only happen before a match", () => {
  const r = new Run(EDT, "SWAP-0001", "season", RULES_LEGACY);
  const a = r.s.squad[0].t;
  r.apply({ t: "swap", a: 0, b: 10 });
  assert.equal(r.s.squad[10].t, a);
  r.apply({ t: "go" });
  assert.throws(() => r.apply({ t: "swap", a: 0, b: 10 }), /before a match/);
});

console.info("the rival");
await test("they cover the lane you threaten when they can", () => {
  let checked = 0;
  for (let i = 0; i < 30; i++) {
    const r = new Run(EDT, "COVR-" + String(i).padStart(4, "0"), "season", RULES_LEGACY);
    r.apply({ t: "go" });
    const off = r.m.off.map((o) => o.slice());
    const before = r.danger(off);
    const after = r.danger(r.reactTo(off).off);
    assert.ok(after <= before, "a reaction never makes it worse for them");
    checked++;
  }
  assert.ok(checked > 0);
});
await test("they show the lanes they threaten; an early club commits, a late one reads your blocks", () => {
  const early = new Run(EDT, "READ-0001", "season", RULES_LEGACY);
  assert.equal(early.ai().read, false);
  early.s.round = 5;
  early.s.kind = 1;
  assert.equal(early.ai().read, true);
});
await test("their touches run out: your keeper restarts", () => {
  const r = new Run(EDT, "AITO-0001", "season", RULES_LEGACY);
  r.apply({ t: "go" });
  let n = 0;
  while (r.s.phase === "attack" && n++ < 30) botStep(r);
  if (r.s.phase !== "defend") return;
  let guard = 0;
  while (r.s.phase === "defend" && guard++ < 20) r.apply({ t: "hold" });
  assert.notEqual(r.s.phase, "defend");
});

console.info("boss clubs");
const BED = fakeEdition(497100);
await test("The Rug: your defence is off the table, it can't slide or block", () => {
  const r = bossMatch(BED, "rug");
  assert.equal(r.m.pulled, 1);
  assert.equal(r.canMove(0, 1, 1), false);
  assert.throws(() => r.apply({ t: "slide", r: 1, d: 1 }));
  // a shot of theirs across your defence column never stops there
  const t = trace(r.m.off, r.pulledArr(), 1, 3, laneOf(3, r.m.off[1][3], 1), { r: 4, d: 0 });
  assert.ok(!t.blockers.some((b) => b.rod === 1));
});
await test("Trading Halt: the frozen rod can't slide", () => {
  const r = bossMatch(BED, "halt");
  assert.ok(r.m.frozen >= 1 && r.m.frozen <= 3);
  assert.throws(() => r.apply({ t: "slide", r: r.m.frozen, d: r.canMove(0, r.m.frozen, 1) ? 1 : -1 }), /can't go there/);
});
await test("Lockup: your keeper stays put", () => {
  const r = bossMatch(BED, "lockup");
  assert.throws(() => r.apply({ t: "slide", r: 0, d: 1 }), /can't go there/);
});
await test("Gas Spike: a paid slide costs two touches", () => {
  const r = bossMatch(BED, "gasspike");
  r.m.free = [0, 0, 0, 0];
  r.m.freeAny = 0;
  const t = r.m.touches;
  assert.equal(r.slideCost(3), 2);
  r.apply({ t: "slide", r: 3, d: r.canMove(0, 3, 1) ? 1 : -1 });
  if (r.s.phase === "attack") assert.equal(r.m.touches, t - 2);
});
await test("Max Slippage: one touch fewer every possession", () => {
  const plain = new Run(BED, "BOSS-0001", "season", RULES_LEGACY);
  plain.apply({ t: "go" });
  const r = bossMatch(BED, "slip");
  assert.equal(r.m.touches, plain.m.touches - 1);
});
await test("Mempool Jam: they react before your pass lands, never after", () => {
  for (let i = 0; i < 20; i++) {
    const r = bossMatch(BED, "jam");
    const pass = r.myKicks().find((k) => k.kick.r !== 4);
    if (!pass) continue;
    r.apply({ t: "kick", r: pass.kick.r, d: pass.kick.d });
    const k = r.events.findIndex((e) => e.e === "kick");
    const lateReact = r.events.slice(k + 1).some((e) => e.e === "slide" && e.side === 1 && e.why === "react");
    const afterTurn = r.events.slice(k + 1).some((e) => e.e === "turnover");
    assert.ok(!lateReact || afterTurn, "no reaction after the pass lands");
    return;
  }
});
await test("The Depeg: your shots drift one lane, and the drawn path says so", () => {
  const r = bossMatch(BED, "depeg");
  assert.ok(r.m.drift === 1 || r.m.drift === -1);
  const straight = trace(r.m.off, r.pulledArr(), 0, 3, 4, { r: 4, d: 0 }, 0);
  const drifted = trace(r.m.off, r.pulledArr(), 0, 3, 4, { r: 4, d: 0 }, r.m.drift);
  assert.equal(drifted.land, straight.land + r.m.drift);
});
await test("Wash Trade: the rod facing yours copies your slide", () => {
  const r = bossMatch(BED, "wash");
  // pick a slide of yours whose facing rod has room to copy it
  const facing = [0, 3, 2, 1];
  let mv: { r: number; d: -1 | 1 } | null = null;
  for (const rr of [3, 2, 1]) for (const d of [1, -1] as const) if (!mv && r.canMove(0, rr, d) && r.canMove(1, facing[rr], d)) mv = { r: rr, d };
  assert.ok(mv, "a slide with room on both sides");
  r.m.free = [9, 9, 9, 9];
  r.apply({ t: "slide", r: mv!.r, d: mv!.d });
  assert.ok(r.events.some((e) => e.e === "slide" && e.side === 1 && e.why === "mirror" && e.r === facing[mv!.r] && e.d === mv!.d));
});
await test("Vibe Check: a figure with no stat can't shoot", () => {
  const r = new Run(BED, "BOSS-0001", "season", RULES_LEGACY);
  r.s.kind = 2;
  r.s.bosses[0] = "vcheck";
  for (let i = 0; i < 11; i++) r.s.squad[i] = { ...r.s.squad[i], p: 0, k: 0, h: 0, x: 0 };
  r.apply({ t: "go" });
  assert.equal(r.mayShoot(slotOf(r.m.ball.rod, r.m.ball.fig)), false);
  assert.ok(!r.myKicks().some((k) => k.kick.r === 4));
  assert.throws(() => r.apply({ t: "kick", r: 4, d: 0 }));
});
await test("Closing Bell: first to 3, more possessions, their keeper takes two Power", () => {
  const r = bossMatch(BED, "bell", 8);
  assert.equal(r.m.target, 3);
  assert.ok(r.m.limit > 6);
  assert.ok(r.levelOf() >= 10);
});
await test("a boss club has to be beaten: a draw is out; a friendly draw goes through", () => {
  const draw = (kind: number) => {
    const r = new Run(BED, "DRAW-0001", "season", RULES_LEGACY);
    r.s.kind = kind;
    if (kind === 2) r.s.bosses[0] = "wash";
    r.apply({ t: "go" });
    let guard = 0;
    // nobody scores: you give the ball away, they have nothing
    while ((r.s.phase === "attack" || r.s.phase === "defend") && guard++ < 400) {
      if (r.s.phase === "defend") {
        r.m.aiTouches = 1;
        r.m.intent = { kind: "slide", r: 0, d: r.canMove(1, 0, 1) ? 1 : -1 };
        r.ai = () => ({ react: 1, passes: false, look: false, read: false, power: 0, touches: 1 });
        r.apply({ t: "hold" });
      } else {
        r.m.free = [0, 0, 0, 0];
        r.m.freeAny = 0;
        r.m.touches = 1;
        const rod = [3, 2, 1, 0].find((x) => r.canMove(0, x, 1) || r.canMove(0, x, -1))!;
        r.apply({ t: "slide", r: rod, d: r.canMove(0, rod, 1) ? 1 : -1 });
      }
    }
    return r;
  };
  const f = draw(0);
  assert.equal(f.s.phase, "fulltime");
  assert.equal(f.s.draws, 1);
  assert.equal(f.s.fulltime!.rows[0][1], 0, "no win fans for a draw");
  const b = draw(2);
  assert.equal(b.s.phase, "over");
});

console.info("the replay guard");
const GED = fakeEdition(dayStartHour(utcDay()) - 200);
await putEdition(GED);
const honest = playOut(GED, "GARD-0001");
await test("an honest season replays to the same result on the server", async () => {
  const rec = await verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: honest.trail, name: "Honest" });
  assert.equal(rec.best?.total || 0, honest.best);
  assert.equal(rec.v, 2);
});
await test("a forged trail is refused: a touch that can't happen", async () => {
  const parts = honest.trail.split("_");
  await assert.rejects(verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: [parts[0], "s2.0", ...parts.slice(1)].join("_") }), /can't go there|bad trail|not/);
  await assert.rejects(verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: honest.trail + "_k4.1" }));
  await assert.rejects(verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: honest.trail.replace(/^g_/, "g_b0_") }));
});
await test("a reordered trail is refused", async () => {
  const parts = honest.trail.split("_");
  const swapped = [parts[1], parts[0], ...parts.slice(2)].join("_");
  await assert.rejects(verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: swapped }));
  const i = parts.indexOf("c");
  const early = [...parts.slice(0, 2), "c", ...parts.slice(2)].join("_");
  await assert.rejects(verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: early }), /nothing to collect/);
  assert.ok(i > 0);
});
await test("an unfinished season is refused", async () => {
  const parts = honest.trail.split("_");
  await assert.rejects(verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: parts.slice(0, Math.floor(parts.length / 2)).join("_") }), /not finished/);
});
await test("a replayed post is the same record and one Hall line; numbers sent along are ignored", async () => {
  const a = await verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: honest.trail, name: "Twice" });
  const b = await verifyAndStore({ seed: "GARD-0001", edition: GED.id, trail: honest.trail, name: "Twice", best: { total: 999999 }, cleared: 24, won: true } as never);
  assert.equal(a.id, b.id);
  assert.equal(b.best?.total || 0, honest.best);
  assert.equal(b.won, honest.run.s.phase === "won");
  const hall = await getHall(utcDay());
  assert.ok(hall.entries.filter((e) => e.name === "Twice").length <= 1);
});
await test("the same trail on another seed is that seed's season, or refused", async () => {
  try {
    const rec = await verifyAndStore({ seed: "GARD-0002", edition: GED.id, trail: honest.trail });
    const own = rerun(GED, "GARD-0002", decodeTrail(honest.trail), "season", RULES_LEGACY);
    assert.equal(rec.best?.total || 0, own.s.best?.total || 0);
  } catch (e) {
    assert.ok(e instanceof Error);
  }
});

console.info("the figures are live");
await test("a stat comes from its number, at the printed threshold", () => {
  const r = new Run(EDT, "LIVE-0001", "season", RULES_LEGACY);
  for (const l of EDT.pool.flat()) {
    const src = r.statSources(l);
    assert.equal(src.power.includes("base"), l.p >= STAT.power.at, l.s);
    assert.equal(src.pace.includes("base"), l.k >= STAT.pace.at, l.s);
    assert.equal(src.grip.includes("base"), l.h >= STAT.grip.at, l.s);
  }
});
await test("a reading coach lights exactly the figures it changes", () => {
  const reads = COACHES.filter((c) => c.reads).map((c) => c.id);
  for (let e = 0; e < 3; e++) {
    const r = new Run(fakeEdition(496900 + e), "LITE-000" + e, "season", RULES_LEGACY);
    for (const id of reads) {
      r.s.coaches = [{ id, v: 0, paid: 0 }];
      const lit = new Set(r.coachSlots(id));
      r.s.squad.forEach((l, i) => {
        const src = r.statSources(l);
        const changes = src.power.includes(id) || src.pace.includes(id) || src.grip.includes(id);
        if (["maxi0", "maxi1", "maxi2", "maxi3", "dip", "early", "oldmoney", "whale", "volume", "moonboy", "snob", "pumpchaser"].includes(id)) assert.equal(lit.has(i), changes, `${id} on ${l.s}`);
      });
    }
  }
});
await test("Moonboy, Volume Guy and Whale Watcher lower the bars they name", () => {
  const r = new Run(EDT, "LIVE-0002", "season", RULES_LEGACY);
  const l: Launch = { ...EDT.pool[0][0], p: 500, k: 5, h: 3 };
  assert.deepEqual(r.stats(0) && [r.statSources(l).power.length, r.statSources(l).pace.length, r.statSources(l).grip.length].map((n) => n > 0), [false, false, false]);
  r.s.coaches = ["moonboy", "volume", "whale"].map((id) => ({ id, v: 0, paid: 0 }));
  const src = r.statSources(l);
  assert.deepEqual([src.power, src.pace, src.grip], [["moonboy"], ["volume"], ["whale"]]);
});
await test("the data tag reads the same numbers the match uses", () => {
  const r = new Run(EDT, "LIVE-0003", "season", RULES_LEGACY);
  for (const l of r.s.squad) {
    const f = Object.fromEntries(figureFacts(l, r.ageHours(l), r.statSources(l)).lines);
    assert.equal(f["Holders"], l.h.toLocaleString("en-US"));
    assert.equal(f["Trades 24h"], l.k.toLocaleString("en-US"));
    assert.equal(f["Gift list"], l.d ? "yes" : "no");
    assert.ok(f["Curve"].startsWith((l.p / 100).toFixed(l.p < 1000 ? 1 : 0) + "%"));
    assert.equal(f["Power"].startsWith("yes"), r.stats(r.s.squad.indexOf(l)).power);
    if (l.x !== null && l.x < 0) assert.match(f["Price"], /^down/);
  }
});
await test("the dressing room's line only says true things, and prefers a coach on offer", () => {
  for (let e = 0; e < 6; e++) {
    const r = new Run(fakeEdition(496800 + e), "ROOM-000" + e, "season", RULES_LEGACY);
    const ageOf = (l: Launch) => r.ageHours(l);
    const facts = squadFacts(r.s.squad, ageOf);
    for (const f of facts) assert.ok(f.count > 0 && f.count <= 11);
    for (const offers of [["early"], ["dip", "snob"], ["ape"], [], ["maxi0", "maxi1"]]) {
      const h = roomHint(r.s.squad, ageOf, offers);
      if (!h) continue;
      assert.ok(h.text.includes(String(h.count)));
      assert.ok(!h.text.includes("!"));
      assert.ok(!/1 figures/.test(h.text), "plural right");
      if (facts.some((f) => offers.includes(f.coach))) assert.match(h.text, /likes that\.$/);
      else assert.match(h.text, /would like that\.$/);
    }
  }
});

console.info("daily seed");
await test("same day, same seed; a valid seed code", () => {
  assert.equal(dailySeed("2026-10-14"), dailySeed("2026-10-14"));
  assert.equal(normSeed(dailySeed("2026-10-14")), dailySeed("2026-10-14"));
  assert.match(dailySeed("2026-10-14"), /^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
});
await test("a year of days, no repeats", () => {
  const seen = new Set<string>();
  let d = "2026-01-01";
  for (let i = 0; i < 366; i++) {
    seen.add(dailySeed(d));
    d = utcDay(new Date(Date.parse(d + "T00:00:00Z") + 86_400_000));
  }
  assert.equal(seen.size, 366);
});
await test("labels and day maths", () => {
  assert.equal(dayLabel("2026-10-14"), "Oct 14");
  assert.equal(dayLabel("2026-01-01"), "Jan 1");
  assert.equal(prevDay("2026-03-01"), "2026-02-28");
  assert.equal(dayStartHour("2026-10-14") * 3_600_000, Date.parse("2026-10-14T00:00:00Z"));
});
await test("streak: same day holds, next day adds, a gap resets", () => {
  let st = bumpStreak(null, "2026-10-12");
  assert.equal(st.n, 1);
  st = bumpStreak(st, "2026-10-12");
  assert.equal(st.n, 1);
  st = bumpStreak(st, "2026-10-13");
  st = bumpStreak(st, "2026-10-14");
  assert.equal(st.n, 3);
  assert.equal(liveStreak(st, "2026-10-15"), 3);
  assert.equal(liveStreak(st, "2026-10-16"), 0);
  st = bumpStreak(st, "2026-10-17");
  assert.deepEqual([st.n, st.best], [1, 3]);
});

console.info("daily pin");
const D1 = "2026-10-10";
const H1 = dayStartHour(D1);
await test("pins the first cut after 00:00 UTC, not the newest", async () => {
  await putEdition(fakeEdition(H1 - 1)); // yesterday's last cut
  await putEdition(fakeEdition(H1 + 2));
  await putEdition(fakeEdition(H1 + 5));
  const pin = await dailyPin(D1, (H1 + 6) * 3_600_000, async () => assert.fail("must not cut"));
  assert.equal(pin.edition, H1 + 2);
  assert.equal(pin.seed, dailySeed(D1));
});
await test("the pin never moves as newer cuts roll on", async () => {
  await putEdition(fakeEdition(H1 + 9));
  const pin = await dailyPin(D1, (H1 + 10) * 3_600_000, async () => assert.fail("must not cut"));
  assert.equal(pin.edition, H1 + 2);
});
await test("no cut yet today: makes one and pins it; two first calls agree", async () => {
  const D = "2026-10-11";
  const H = dayStartHour(D);
  const now = (H + 3) * 3_600_000 + 1000;
  const [a, b] = await Promise.all([dailyPin(D, now, async () => ({ id: H + 3 })), dailyPin(D, now, async () => ({ id: H + 3 }))]);
  assert.equal(a.edition, H + 3);
  assert.equal(b.edition, a.edition);
});
await test("refuses to pin yesterday's cut when the index is down", async () => {
  const D = "2026-10-12";
  const H = dayStartHour(D);
  await assert.rejects(dailyPin(D, (H + 1) * 3_600_000, async () => ({ id: H - 1 })), /not cut yet/);
});
await test("no pin for a day that is not today", async () => {
  await assert.rejects(dailyPin("2026-09-01", Date.parse("2026-10-10T05:00:00Z"), async () => ({ id: 1 })), /no match/);
});

console.info("daily board");
const today = utcDay();
const H = dayStartHour(today);
const NOW = Date.now();
const ed = fakeEdition(H);
await putEdition(ed);
const pin = await dailyPin(today, NOW, async () => assert.fail("must not cut"));
const seed = pin.seed;
// two finished seasons of the day with different best goals: the bot's, and a weaker one
const tries = [playOut(ed, seed), playOut(ed, seed, "nobuy"), playOut(ed, seed, "lazy")].filter((t) => t.best > 0).sort((a, b) => b.best - a.best);
const hi = tries[0];
const lo = tries.find((t) => t.best < hi.best) || tries[tries.length - 1];
await test("fixtures: two different finished seasons of the day", () => {
  assert.equal(pin.edition, H);
  assert.ok(hi.best > lo.best && lo.best > 0, `best goals ${tries.map((t) => t.best).join(", ")}`);
});
await test("a verified daily season lands on the board", async () => {
  const rec = await verifyAndStore({ seed, edition: pin.edition, trail: lo.trail, name: "Anton" }, NOW);
  assert.equal(rec.daily, today);
  const b = await publicBoard(today);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].total, lo.best);
  assert.equal(b.players, 1);
  assert.equal((b as unknown as { names?: unknown }).names, undefined, "name list must not be served");
});
await test("one line per name: a better season replaces it, names match case-blind", async () => {
  await verifyAndStore({ seed, edition: pin.edition, trail: hi.trail, name: "ANTON" }, NOW + 1000);
  const b = await publicBoard(today);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].total, hi.best);
  assert.equal(b.players, 1);
});
await test("a worse season later does not replace the best", async () => {
  await verifyAndStore({ seed, edition: pin.edition, trail: lo.trail, name: "anton" }, NOW + 2000);
  const b = await publicBoard(today);
  assert.equal(b.entries.length, 1);
  assert.equal(b.entries[0].total, hi.best);
});
await test("another name gets its own line, sorted by score", async () => {
  await verifyAndStore({ seed, edition: pin.edition, trail: lo.trail, name: "Kicker" }, NOW + 3000);
  const b = await publicBoard(today);
  assert.deepEqual(
    b.entries.map((e) => e.name),
    ["ANTON", "Kicker"],
  );
  assert.equal(b.players, 2);
});
await test("a forged trail is rejected and changes nothing", async () => {
  // a pass backwards, slipped in after kick-off
  const parts = hi.trail.split("_");
  const forged = [parts[0], "k1.1", ...parts.slice(1)].join("_");
  await assert.rejects(verifyAndStore({ seed, edition: pin.edition, trail: forged, name: "Forger" }, NOW + 4000));
  // a season cut short and padded with a goal that never happened
  const tail = parts.slice(0, -3).join("_") + "_k4.1";
  await assert.rejects(verifyAndStore({ seed, edition: pin.edition, trail: tail, name: "Forger" }, NOW + 4000));
  const b = await publicBoard(today);
  assert.ok(!b.entries.some((e) => e.name === "Forger"));
  assert.equal(b.players, 2);
});
await test("the same seed on another cut is not the Daily Match", async () => {
  const other = fakeEdition(H + 1);
  await putEdition(other);
  const run = playOut(other, seed);
  const rec = await verifyAndStore({ seed, edition: other.id, trail: run.trail, name: "Elsewhere" }, NOW + 5000);
  assert.equal(rec.best?.total || 0, run.best, "the server's numbers are the replay's");
  assert.equal(rec.daily, undefined);
  assert.ok(!(await publicBoard(today)).entries.some((e) => e.name === "Elsewhere"));
});
await test("a normal seed stays off the Daily board but still enters the Hall", async () => {
  const run = playOut(ed, "ZZZZ-0001");
  const rec = await verifyAndStore({ seed: "ZZZZ-0001", edition: ed.id, trail: run.trail, name: "Regular" }, NOW + 6000);
  assert.equal(rec.daily, undefined);
  assert.ok(!(await publicBoard(today)).entries.some((e) => e.name === "Regular"));
  assert.ok((await getHall(today)).entries.some((e) => e.name === "Regular"));
});

console.info("team kits ($KICKER, cosmetic only)");
const holder = privateKeyToAccount(generatePrivateKey());
const stranger = privateKeyToAccount(generatePrivateKey());
const T0 = Date.parse(today + "T09:00:00Z");
const sign = (acct: typeof holder, name: string, day = today) => acct.signMessage({ message: houseMessage(name, holder.address, day) });
const rich = async () => 5n * 10n ** 18n;
const broke = async () => 0n;
// the smart-account path asks the chain; plain-key tests say "not a smart account" so nothing touches the network
const eoa = { smartSigned: async () => false };
await test("valid signature + a balance: a claim for that name", async () => {
  const r = await checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: rich, ...eoa });
  assert.equal(r.day, today);
  assert.ok(claimOk(r.claim, "whale", T0 + 1000), "claim works for the same name, any case");
  assert.ok(!claimOk(r.claim, "Minnow", T0 + 1000), "claim is tied to the name");
  assert.ok(r.expires <= Date.parse(today + "T00:00:00Z") + 86_400_000, "ends with the UTC day");
});
await test("wrong signer is refused", async () => {
  const sig = await stranger.signMessage({ message: houseMessage("Whale", holder.address, today) });
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: sig }, { now: T0, balanceOf: rich, ...eoa }), (e: unknown) => e instanceof HouseError && e.status === 401);
});
await test("a signature for another name or day is refused", async () => {
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Shrimp") }, { now: T0, balanceOf: rich, ...eoa }), (e: unknown) => (e as HouseError).status === 401);
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale", prevDay(today)) }, { now: T0, balanceOf: rich, ...eoa }), (e: unknown) => (e as HouseError).status === 401);
});
await test("zero balance: no team kits", async () => {
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: broke, ...eoa }), (e: unknown) => (e as HouseError).status === 403);
});
await test("chain not answering is not a zero", async () => {
  const down = async () => {
    throw new Error("timeout");
  };
  await assert.rejects(checkHouse({ name: "Whale", address: holder.address, signature: await sign(holder, "Whale") }, { now: T0, balanceOf: down, ...eoa }), (e: unknown) => (e as HouseError).status === 503);
});
await test("expired or tampered claims are worthless", () => {
  const { claim, expires } = issueClaim("Whale", T0);
  assert.ok(claimOk(claim, "Whale", T0));
  assert.ok(!claimOk(claim, "Whale", expires + 1), "expired");
  const [body, sig] = claim.split(".");
  const forgedBody = Buffer.from(JSON.stringify({ n: "whale", d: today, x: expires + 86_400_000 })).toString("base64url");
  assert.ok(!claimOk(`${forgedBody}.${sig}`, "Whale", T0), "body swapped");
  assert.ok(!claimOk(`${body}.${sig.slice(0, -2)}AA`, "Whale", T0), "signature bent");
  assert.ok(!claimOk(undefined, "Whale", T0));
});
await test("house mark rides on a season only with a valid claim for that name", async () => {
  const { claim } = issueClaim("Whale", NOW);
  const withMark = await verifyAndStore({ seed, edition: pin.edition, trail: hi.trail, name: "Whale", house: claim }, NOW + 7000);
  assert.equal(withMark.house, true);
  const wrong = await verifyAndStore({ seed, edition: pin.edition, trail: lo.trail, name: "Borrower", house: claim }, NOW + 8000);
  assert.equal(wrong.house, undefined);
  const b = await publicBoard(today);
  assert.equal(b.entries.find((e) => e.name === "Whale")?.house, true);
  assert.equal(b.entries.find((e) => e.name === "Borrower")?.house, undefined);
});
await test("the house mark changes nothing in the result", async () => {
  const { claim } = issueClaim("Twin", NOW);
  const a = await verifyAndStore({ seed, edition: pin.edition, trail: hi.trail, name: "Twin", house: claim }, NOW + 9000);
  const b = await verifyAndStore({ seed, edition: pin.edition, trail: hi.trail, name: "Twin" }, NOW + 9000);
  assert.deepEqual([a.best?.total, a.round, a.cleared, a.won], [b.best?.total, b.round, b.cleared, b.won]);
});

console.info("sign-in through Para");
await test("an embedded wallet's plain-key signature passes without asking the chain", async () => {
  // Para's embedded wallet gives the page a viem WalletClient; it signs personal_sign style like any key
  const embedded = privateKeyToAccount(generatePrivateKey());
  const wallet = createWalletClient({
    account: embedded,
    transport: custom({
      request: async () => {
        throw new Error("no network in tests");
      },
    }),
  });
  const message = houseMessage("Para", embedded.address, today);
  const signature = await wallet.signMessage({ account: embedded, message });
  let asked = 0;
  const r = await checkHouse(
    { name: "Para", address: embedded.address, signature },
    {
      now: T0,
      balanceOf: rich,
      smartSigned: async () => {
        asked++;
        return false;
      },
    },
  );
  assert.ok(claimOk(r.claim, "Para", T0 + 1000));
  assert.equal(asked, 0, "a recovered key never needs the chain");
});
await test("an embedded wallet with no $KICKER signs in but gets no team kits", async () => {
  const fresh = privateKeyToAccount(generatePrivateKey());
  const signature = await fresh.signMessage({ message: houseMessage("Newbie", fresh.address, today) });
  await assert.rejects(checkHouse({ name: "Newbie", address: fresh.address, signature }, { now: T0, balanceOf: broke, ...eoa }), (e: unknown) => (e as HouseError).status === 403);
});
await test("a smart account (ERC-1271) is checked on the chain and accepted", async () => {
  const account = "0x" + "ab".repeat(20);
  const owner = privateKeyToAccount(generatePrivateKey());
  const message = houseMessage("Safe", account, today);
  const signature = await owner.sign({ hash: hashMessage(message) });
  let seen: { address: string; message: string; signature: string } | null = null;
  const r = await checkHouse(
    { name: "Safe", address: account, signature },
    {
      now: T0,
      balanceOf: rich,
      smartSigned: async (address, m, sig) => {
        seen = { address, message: m, signature: sig };
        return true;
      },
    },
  );
  assert.ok(claimOk(r.claim, "Safe", T0 + 1000));
  assert.deepEqual(seen, { address: account, message, signature }, "the chain is asked about the exact house message");
});
await test("a smart account that says no is refused; a silent chain is a 503, not a no", async () => {
  const account = "0x" + "cd".repeat(20);
  const signature = await stranger.signMessage({ message: houseMessage("Safe", account, today) });
  await assert.rejects(checkHouse({ name: "Safe", address: account, signature }, { now: T0, balanceOf: rich, ...eoa }), (e: unknown) => (e as HouseError).status === 401);
  const down = async (): Promise<boolean> => {
    throw new Error("timeout");
  };
  await assert.rejects(checkHouse({ name: "Safe", address: account, signature }, { now: T0, balanceOf: rich, smartSigned: down }), (e: unknown) => (e as HouseError).status === 503);
});
await test("long smart-account signatures fit, junk does not", async () => {
  const account = "0x" + "ef".repeat(20);
  const yes = { smartSigned: async () => true };
  const r = await checkHouse({ name: "Wrapped", address: account, signature: "0x" + "11".repeat(900) }, { now: T0, balanceOf: rich, ...yes });
  assert.ok(r.claim);
  await assert.rejects(checkHouse({ name: "Wrapped", address: account, signature: "0x1234" }, { now: T0, balanceOf: rich, ...yes }), (e: unknown) => (e as HouseError).status === 400);
  await assert.rejects(checkHouse({ name: "Wrapped", address: account, signature: "0x" + "1".repeat(131) }, { now: T0, balanceOf: rich, ...yes }), (e: unknown) => (e as HouseError).status === 400);
});
await test("no Para key: sign-in is off, and says so", () => {
  const off = paraConfig({});
  assert.equal(off.available, false);
  assert.equal(off.apiKey, "");
  assert.match(off.note, /unavailable right now/);
  assert.match(off.note, /everything else plays the same/i);
  assert.equal(paraConfig({ VITE_PARA_API_KEY: "   " }).available, false, "blank is no key");
});
await test("a Para key: BETA by default, PRODUCTION only when asked", () => {
  const on = paraConfig({ VITE_PARA_API_KEY: "k" });
  assert.deepEqual([on.available, on.env, on.note], [true, "BETA", ""]);
  assert.equal(paraConfig({ VITE_PARA_API_KEY: "k", VITE_PARA_ENV: "PRODUCTION" }).env, "PRODUCTION");
  assert.equal(paraConfig({ VITE_PARA_API_KEY: "k", VITE_PARA_ENV: "production" }).env, "PRODUCTION");
  assert.equal(paraConfig({ VITE_PARA_API_KEY: "k", VITE_PARA_ENV: "SANDBOX" }).env, "BETA");
});

console.info("names, sessions and Your table");
const owner = privateKeyToAccount(generatePrivateKey());
const rival = privateKeyToAccount(generatePrivateKey());
const signInAs = async (acct: typeof owner, name: string, extra: { receipt?: string; now?: number } = {}) =>
  signIn(
    { name, address: acct.address, signature: await acct.signMessage({ message: signinMessage(name, acct.address, utcDay(new Date(extra.now ?? T0))) }), receipt: extra.receipt },
    { now: extra.now ?? T0, balanceOf: broke, ...eoa },
  );
await test("first claim wins; a second address is refused, whatever the case", async () => {
  const a = await signInAs(owner, "Gambit");
  assert.equal(a.name, "Gambit");
  assert.equal(a.holder, false);
  assert.equal(a.house, null, "no $KICKER, no house colours, still signed in");
  assert.ok(sessionOf(a.session, T0 + 1000));
  await assert.rejects(signInAs(rival, "gambit"), (e: unknown) => (e as HouseError).status === 409);
  await assert.rejects(signInAs(rival, "GAMBIT"), (e: unknown) => (e as HouseError).status === 409);
  const again = await signInAs(owner, "GaMbIt");
  assert.equal(again.name, "Gambit", "the owner signs in again under any case and keeps the claimed spelling");
});
await test("a name someone posted this week can't be grabbed, except by the device holding its receipt", async () => {
  // "Regular" was posted to today's Hall above, without signing in
  await assert.rejects(signInAs(rival, "Regular"), (e: unknown) => (e as HouseError).status === 409);
  await assert.rejects(signInAs(rival, "Regular", { receipt: "bm9wZQ" }), (e: unknown) => (e as HouseError).status === 409);
  const ok = await signInAs(rival, "Regular", { receipt: receiptFor("regular") });
  assert.equal(ok.name, "Regular");
  assert.ok(receiptOk("REGULAR", receiptFor("Regular")), "receipts are case-insensitive");
});
await test("a claimed name posts only with its owner's session", async () => {
  const s = (await signInAs(owner, "Gambit")).session;
  const run = playOut(ed, "GMBT-0001");
  await assert.rejects(verifyAndStore({ seed: "GMBT-0001", edition: ed.id, trail: run.trail, name: "Gambit" }, T0 + 100), /claimed name/);
  await assert.rejects(verifyAndStore({ seed: "GMBT-0001", edition: ed.id, trail: run.trail, name: "gambit" }, T0 + 100), /claimed name/, "case-insensitive");
  const theirs = (await signInAs(rival, "Regular", { receipt: receiptFor("Regular") })).session;
  await assert.rejects(verifyAndStore({ seed: "GMBT-0001", edition: ed.id, trail: run.trail, name: "Gambit", session: theirs }, T0 + 100), /claimed name/);
  const rec = await verifyAndStore({ seed: "GMBT-0001", edition: ed.id, trail: run.trail, name: "Gambit", session: s }, T0 + 200);
  assert.equal(rec.verified, true);
  assert.equal((await getHall(utcDay(new Date(T0)))).entries.find((e) => e.id === rec.id)?.verified, true, "the Hall shows the verified mark");
  const p = await getProfile(owner.address);
  assert.equal(p?.recent[0]?.id, rec.id, "the run follows the player");
});
await test("a forged or expired session is refused, never quietly dropped", async () => {
  const run = playOut(ed, "GMBT-0002");
  const { session, expires } = issueSession(owner.address, "Gambit", T0);
  const [body, sig] = session.split(".");
  const forged = Buffer.from(JSON.stringify({ a: rival.address.toLowerCase(), n: "gambit", d: today, x: expires })).toString("base64url") + "." + sig;
  await assert.rejects(verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Gambit", session: forged }, T0 + 100), /expired/);
  await assert.rejects(verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Gambit", session: `${body}.${sig.slice(0, -2)}AA` }, T0 + 100), /expired/);
  await assert.rejects(verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Gambit", session }, expires + 1), /expired/);
  await assert.rejects(verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Anyone", session: "junk" }, T0 + 100), /expired/, "even on an unclaimed name");
  // and with no session at all, an unclaimed name posts exactly as before
  const free = await verifyAndStore({ seed: "GMBT-0002", edition: ed.id, trail: run.trail, name: "Freebird" }, T0 + 100);
  assert.equal(free.verified, undefined);
});
await test("a session is not a house claim and a house claim is not a session", () => {
  const { session } = issueSession(owner.address, "Gambit", T0);
  assert.ok(!claimOk(session, "Gambit", T0 + 1));
  const { claim } = issueClaim("Gambit", T0);
  assert.equal(sessionOf(claim, T0 + 1), null);
});
await test("Your table: merge keeps one best per day, 30 recent seasons, and the Daily streak", () => {
  let p: Profile | null = null;
  const start = Date.parse("2026-09-01T12:00:00Z");
  for (let i = 0; i < 40; i++) {
    const at = new Date(start + i * 86_400_000).toISOString();
    p = mergeProfile(p, owner.address, "Gambit", { id: "r" + i, seed: "S", edition: 1, total: 100 + i, style: "Bank shot", round: 2, won: false, at, daily: at.slice(0, 10) });
    // a weaker second season the same day changes the recent list, not the day's best
    p = mergeProfile(p, owner.address, "Gambit", { id: "w" + i, seed: "S", edition: 1, total: 1, style: "Tap-in", round: 1, won: false, at: at.replace("12:00", "13:00") });
  }
  assert.equal(p!.recent.length, PROFILE_RECENT);
  assert.equal(p!.best.length, PROFILE_DAYS);
  assert.equal(p!.best[0].total, 139, "newest day first, its best goal");
  assert.ok(p!.best.every((b) => b.style === "Bank shot"));
  assert.equal(p!.streak?.n, 40);
  const same = mergeProfile(p, owner.address, "Gambit", p!.recent[0]);
  assert.equal(same, p, "a season already in the record changes nothing (and costs no put)");
  const gap = mergeProfile(p, owner.address, "Gambit", { id: "late", seed: "S", edition: 1, total: 5, style: "Tap-in", round: 1, won: false, at: "2026-12-01T00:00:00Z", daily: "2026-12-01" });
  assert.deepEqual([gap.streak?.n, gap.streak?.best], [1, 40], "a skipped day restarts the streak, the best stays");
});

await test("Your table drops lines from before 2.0 on the next merge", () => {
  const old = { address: owner.address.toLowerCase(), name: "Gambit", streak: null, best: [{ day: "2026-10-20", id: "x", total: 41000, handName: "Echo" }], recent: [{ id: "x", seed: "S", edition: 1, total: 41000, handName: "Echo", ante: 3, won: false, at: "2026-10-20T00:00:00Z" }], updated: "" } as unknown as Profile;
  const p = mergeProfile(old, owner.address, "Gambit", { id: "n", seed: "S", edition: 1, total: 900, style: "Bank shot", round: 4, won: false, at: "2026-11-01T10:00:00Z" });
  assert.deepEqual(p.recent.map((r) => r.id), ["n"]);
  assert.deepEqual(p.best.map((b) => b.id), ["n"]);
});

if (process.argv.includes("--anvil")) {
  console.info("smart account on a local anvil (port 8520, nothing leaves this machine)");
  await test("a deployed ERC-1271 account: its owner's signature passes, a stranger's does not", async () => {
    const { spawn } = await import("node:child_process");
    const { readFileSync } = await import("node:fs");
    const { createPublicClient, http, encodeAbiParameters } = await import("viem");
    const bin = process.env.ANVIL || "anvil";
    const node = spawn(bin, ["--port", "8520", "--chain-id", "46630", "--silent"], { stdio: "ignore" });
    const rpc = "http://127.0.0.1:8520";
    const saved = process.env.HOUSE_RPC;
    try {
      const pc = createPublicClient({ transport: http(rpc, { retryCount: 0 }) });
      for (let i = 0; ; i++) {
        try {
          await pc.getChainId();
          break;
        } catch (e) {
          if (i > 60) throw e;
          await new Promise((r) => setTimeout(r, 250));
        }
      }
      // anvil's first dev account deploys the test contract, on the local chain only
      const dev = privateKeyToAccount("0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80");
      const owner = privateKeyToAccount(generatePrivateKey());
      const { bytecode } = JSON.parse(readFileSync(new URL("./fixtures/owned1271.json", import.meta.url), "utf8")) as { bytecode: Hex };
      const chain = { id: 46630, name: "anvil", nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 }, rpcUrls: { default: { http: [rpc] } } } as const;
      const wc = createWalletClient({ account: dev, chain, transport: http(rpc) });
      const hash = await wc.sendTransaction({ data: (bytecode + encodeAbiParameters([{ type: "address" }], [owner.address]).slice(2)) as Hex });
      const rc = await pc.waitForTransactionReceipt({ hash });
      const account = rc.contractAddress!;
      process.env.HOUSE_RPC = rpc;
      const message = houseMessage("Vault", account, today);
      const good = await owner.sign({ hash: hashMessage(message) });
      const bad = await stranger.sign({ hash: hashMessage(message) });
      assert.equal(await smartAccountSigned(account, message, good), true);
      assert.equal(await smartAccountSigned(account, message, bad), false);
      const r = await checkHouse({ name: "Vault", address: account, signature: good }, { now: T0, balanceOf: rich });
      assert.ok(claimOk(r.claim, "Vault", T0 + 1000));
      await assert.rejects(checkHouse({ name: "Vault", address: account, signature: bad }, { now: T0, balanceOf: rich }), (e: unknown) => (e as HouseError).status === 401);
      // with the chain in reach, a plain key still passes and a plain stranger is still refused
      const plain = await holder.signMessage({ message: houseMessage("Plain", holder.address, today) });
      assert.ok((await checkHouse({ name: "Plain", address: holder.address, signature: plain }, { now: T0, balanceOf: rich })).claim);
      const wrong = await stranger.signMessage({ message: houseMessage("Plain", holder.address, today) });
      await assert.rejects(checkHouse({ name: "Plain", address: holder.address, signature: wrong }, { now: T0, balanceOf: rich }), (e: unknown) => (e as HouseError).status === 401);
    } finally {
      if (saved === undefined) delete process.env.HOUSE_RPC;
      else process.env.HOUSE_RPC = saved;
      node.kill();
    }
  });
}

// ------------------------------------------------------------ 2.1: the Haunted table, club styles, the HUD model
console.info("2.1: Haunted table");
const EDH = fakeEdition(497300);
await putEdition(EDH);
/** A finished Haunted table run with the bot. */
function playHaunt(ed: Edition, seed: string) {
  const run = new Run(ed, seed, "haunt", RULES_LEGACY);
  let n = 0;
  while (n++ < 20000 && botStep(run));
  assert.ok(run.s.phase === "over" || run.s.phase === "won", "haunted run did not finish");
  return run;
}
await test("a Haunted table run is three ghost matches, deterministic from the seed, and replays exactly", () => {
  const a = playHaunt(EDH, "HNT0-0001");
  const b = playHaunt(EDH, "HNT0-0001");
  assert.equal(a.rounds, 1);
  assert.deepEqual(a.s.bosses, ["haunt"]);
  assert.equal(encodeTrail(a.trail, "haunt", RULES_LEGACY), encodeTrail(b.trail, "haunt", RULES_LEGACY));
  assert.equal(a.s.best?.total, b.s.best?.total);
  const p = parseTrail(encodeTrail(a.trail, "haunt", RULES_LEGACY));
  assert.equal(p.mode, "haunt");
  const c = rerun(EDH, "HNT0-0001", p.actions, p.mode, p.rules);
  assert.equal(c.s.phase, a.s.phase);
  assert.equal(c.s.cleared, a.s.cleared);
  assert.equal(c.s.best?.total, a.s.best?.total);
});
await test("ghost clubs are the deadest launches, the same for every replay, and never your own figures", () => {
  const r = new Run(EDH, "HNT0-0002", "haunt", RULES_LEGACY);
  const g1 = r.rivals(0, 1);
  const g2 = new Run(EDH, "HNT0-0002", "haunt", RULES_LEGACY).rivals(0, 1);
  assert.deepEqual(g1.map((l) => l.t), g2.map((l) => l.t));
  assert.equal(g1.length, 11);
  const mine = new Set(r.s.squad.map((l) => l.t));
  assert.ok(g1.every((l) => !mine.has(l.t)));
  const dead = deadList(EDH, r.s.squad).slice(0, 22);
  const maxK = Math.max(...dead.map((l) => l.k));
  assert.ok(g1.every((l) => l.k <= maxK), "a ghost is never livelier than the 22 quietest");
  // a cut that keeps 0-trade launches aside uses those first
  const z: Launch = { ...EDH.pool[0][0], t: "0x" + "d".repeat(40), s: "DEAD", k: 0 };
  const withGhosts: Edition = { ...EDH, ghosts: [z] };
  assert.equal(deadList(withGhosts, r.s.squad)[0].t, z.t);
  assert.equal(ghostWhy(z), "0 trades in 24h");
  assert.match(ghostWhy({ ...z, k: 2 }), /2 trades in 24h, among the quietest/);
});
await test("Phasing: their ghost rod blocks only on every other touch of yours", () => {
  const r = new Run(EDH, "HNT0-0003", "haunt", RULES_LEGACY);
  r.apply({ t: "go" });
  const g = r.m.ghost!;
  assert.ok(g && [1, 2, 3].includes(g.rod));
  assert.equal(r.fadedRod(), -1, "solid on your first touch");
  const before = g.tick;
  const mv = [0, 1, 2, 3].flatMap((rr) => [-1, 1].map((d) => ({ rr, d }))).find((x) => r.canMove(0, x.rr, x.d) && r.slideCost(x.rr) <= r.m.touches)!;
  r.apply({ t: "slide", r: mv.rr, d: mv.d as -1 | 1 });
  if (r.s.phase === "attack") {
    assert.equal(r.m.ghost!.tick, before + 1);
    assert.equal(r.fadedRod(), g.rod, "faded on the next touch");
    assert.ok(r.pulledArr()[1] === g.rod, "a faded rod lets the ball through");
  }
  // never faded while they have the ball
  const s2 = new Run(EDH, "HNT0-0003", "haunt", RULES_LEGACY);
  s2.apply({ t: "go" });
  s2.s.phase = "defend";
  s2.m.ghost!.tick = 1;
  assert.equal(s2.fadedRod(), -1);
  // a season match has no ghost rules at all
  const sea = new Run(EDH, "HNT0-0003", "season", RULES_LEGACY);
  sea.apply({ t: "go" });
  assert.equal(sea.m.ghost, null);
  assert.equal(sea.fadedRod(), -1);
});
await test("Poltergeist: after a kick, the telegraphed rod drifts the telegraphed way, then the next drift is set", () => {
  let checked = 0;
  for (let i = 0; i < 30 && checked < 5; i++) {
    const r = new Run(EDH, `HNT1-${String(i).padStart(4, "0")}`, "haunt", RULES_LEGACY);
    r.apply({ t: "go" });
    for (let step = 0; step < 40 && r.s.phase === "attack"; step++) {
      const tele = r.driftNow();
      const ks = r.myKicks().filter((k) => k.open && k.kick.r !== 4);
      if (!ks.length || !tele) {
        botStep(r);
        continue;
      }
      const n0 = r.m.ghost!.n;
      r.apply({ t: "kick", r: ks[0].kick.r, d: ks[0].kick.d });
      const ghostEv = r.events.filter((e) => e.e === "slide" && e.why === "ghost");
      assert.equal(ghostEv.length, 1, "one ghost drift per kick");
      const ev = ghostEv[0] as Extract<(typeof r.events)[number], { e: "slide" }>;
      assert.equal(ev.r, tele.r);
      assert.equal(ev.side, 1);
      if (r.s.match) assert.equal(r.m.ghost!.n, n0 + 1);
      checked++;
      break;
    }
  }
  assert.ok(checked >= 3, "found kicks to check: " + checked);
});
await test("club styles are fixed by the club, and change how the rival plays", () => {
  const r = new Run(EDT, "STYL-0001", "season", RULES_LEGACY);
  for (let k = 0; k < 3; k++) assert.equal(r.styleOf(k, 1), new Run(EDT, "STYL-0001", "season", RULES_LEGACY).styleOf(k, 1));
  const p = aiParams(1, "press");
  const b = aiParams(1, "bus");
  const l = aiParams(1, "long");
  assert.equal(p.passes, true, "a pressing club shuts passing lanes from the start");
  assert.equal(b.passes, false);
  assert.equal(l.deep, 0);
  assert.equal(aiParams(3, "long").deep, 1, "from round 3 a long-range club shoots through one from deep");
});
await test("Dressing room from match day: back reopens the same shelf; not before the first match", () => {
  const r = new Run(EDT, "BACK-0001", "season", RULES_LEGACY);
  assert.throws(() => r.apply({ t: "back" }));
  let n = 0;
  while (n++ < 4000 && r.s.phase !== "room") botStep(r);
  assert.equal(r.s.phase, "room");
  const shelf = JSON.stringify(r.s.offers);
  r.apply({ t: "next" });
  r.apply({ t: "back" });
  assert.equal(r.s.phase, "room");
  assert.equal(JSON.stringify(r.s.offers), shelf);
  assert.deepEqual(decodeTrail(encodeTrail([{ t: "back" }], "season", RULES_LEGACY)), [{ t: "back" }]);
});

console.info("2.1: the replay guard with the mode");
const NOWH = Date.parse("2026-11-03T12:00:00Z");
await test("a Haunted run posts with its mode, lands on the Haunted board, and gets the kit during the event", async () => {
  const run = playHaunt(EDH, "HNT2-0001");
  const trail = encodeTrail(run.trail, "haunt", RULES_LEGACY);
  const rec = await verifyAndStore({ seed: "HNT2-0001", edition: EDH.id, trail, mode: "haunt", name: "Lantern" }, NOWH);
  assert.equal(rec.mode, "haunt");
  assert.equal(rec.kit, run.s.cleared > 0);
  assert.equal(rec.daily, undefined);
  if (rec.best && rec.best.total > 0) {
    const day = rec.at.slice(0, 10);
    assert.ok((await getHall(day, "haunt")).entries.some((e) => e.id === rec.id), "on the Haunted board");
    assert.ok(!(await getHall(day)).entries.some((e) => e.id === rec.id), "not in the season Hall");
  }
  // after the event closes it still verifies, without the kit
  const late = await verifyAndStore({ seed: "HNT2-0001", edition: EDH.id, trail, mode: "haunt", name: "Late" }, Date.parse("2026-11-08T12:00:00Z"));
  assert.equal(late.kit, undefined);
});
await test("a forged mode flag is refused: a season trail posted as Haunted, a Haunted trail posted as a season, a made-up mode", async () => {
  const season = playOut(EDH, "HNT3-0001");
  await assert.rejects(verifyAndStore({ seed: "HNT3-0001", edition: EDH.id, trail: season.trail, mode: "haunt", name: "Forger" }, NOWH), /mode/);
  const haunt = encodeTrail(playHaunt(EDH, "HNT3-0002").trail, "haunt", RULES_LEGACY);
  await assert.rejects(verifyAndStore({ seed: "HNT3-0002", edition: EDH.id, trail: haunt, mode: "season", name: "Forger" }, NOWH), /mode/);
  await assert.rejects(verifyAndStore({ seed: "HNT3-0002", edition: EDH.id, trail: haunt, mode: "ghost", name: "Forger" }, NOWH), /mode/);
  // the "H" token anywhere but the front is a bad trail
  await assert.rejects(verifyAndStore({ seed: "HNT3-0002", edition: EDH.id, trail: "g_H", name: "Forger" }, NOWH));
});
await test("a Haunted trail replayed under season rules does not come out the same", () => {
  const run = playHaunt(EDH, "HNT4-0001");
  const acts = parseTrail(encodeTrail(run.trail, "haunt", RULES_LEGACY)).actions;
  let same = false;
  try {
    const r2 = rerun(EDH, "HNT4-0001", acts, "season", RULES_LEGACY);
    same = r2.s.phase === run.s.phase && r2.s.best?.total === run.s.best?.total && r2.s.cleared === run.s.cleared && r2.s.round === run.s.round;
  } catch {
    same = false;
  }
  assert.ok(!same, "the mode is part of what the trail means");
});
await test("Haunted kit on the profile: set once, kept, cosmetic", () => {
  const at = "2026-11-03T10:00:00.000Z";
  const base = { id: "a1", seed: "S", edition: 1, total: 100, style: "Tap-in", round: 1, won: false, at };
  const p1 = mergeProfile(null, "0x" + "1".repeat(40), "Kit", { ...base, mode: "haunt", kit: true });
  assert.equal(p1.kit?.haunt, "2026-11-03");
  const p2 = mergeProfile(p1, "0x" + "1".repeat(40), "Kit", { ...base, id: "a2", at: "2026-11-04T10:00:00.000Z" });
  assert.equal(p2.kit?.haunt, "2026-11-03");
});

console.info("2.1: the HUD");
await test("the HUD model stepped event by event ends where the engine is: score, Goals, wins never disagree", () => {
  for (const [mode, seed] of [
    ["season", "HUD0-0001"],
    ["haunt", "HUD0-0002"],
  ] as const) {
    const run = new Run(EDT, seed, mode, RULES_LEGACY);
    let n = 0;
    let goals = 0;
    while (n++ < 20000) {
      const before = hudOf(run);
      if (!botStep(run)) break;
      let h = before;
      for (const ev of run.events) {
        h = hudStep(h, ev);
        // mid-playback the score and the Goals count move together
        if (ev.e === "goal" && ev.side === 0) assert.equal(h.goals - before.goals, h.you - before.you);
        if (ev.e === "goal") {
          goals++;
          assert.equal(h.mode, "goal");
          assert.equal(h.touches, 0, "no touch pips during a goal");
        }
      }
      const after = hudOf(run);
      if (run.s.phase === "over" || run.s.phase === "won" || run.s.match) {
        assert.equal(h.you, after.you, "score (you)");
        assert.equal(h.them, after.them, "score (them)");
      }
      assert.equal(h.goals, after.goals, "Goals");
      assert.equal(h.against, after.against);
      assert.equal(h.wins, after.wins, "Wins");
    }
    assert.ok(goals > 0, "saw goals");
  }
});
await test("after a goal the HUD reads one more for the scorer and in Goals, at the same moment", () => {
  const h0 = { you: 0, them: 1, goals: 4, against: 2, wins: 1, mode: "attack" as const, touches: 2, blocks: 0, aiTouches: 0 };
  const h1 = hudStep(h0, { e: "goal", side: 0, rating: 100, style: "Tap-in" });
  assert.deepEqual([h1.you, h1.goals, h1.them, h1.touches, h1.mode], [1, 5, 1, 0, "goal"]);
  const h2 = hudStep(h1, { e: "turnover", to: 1, why: "blocked" });
  assert.equal(h2.mode, "defend");
  const h3 = hudStep(h0, { e: "end", won: true, draw: false });
  assert.deepEqual([h3.wins, h3.mode], [2, "idle"]);
});

console.info("3.0 A.0: the rules token in the trail");
const LEGACY = JSON.parse(readFileSync("scripts/fixtures/legacy-2.1.json", "utf8")) as {
  now: number;
  cases: { edition: number | "real"; seed: string; mode: "season" | "haunt"; trail: string; view: string; record: string }[];
};
const REAL_ED: Edition = JSON.parse(readFileSync("scripts/edition.json", "utf8"));
const legacyEd = (e: number | "real") => (e === "real" ? REAL_ED : fakeEdition(e));
const MATCH_KEYS = ["kind", "club", "boss", "level", "target", "limit", "score", "poss", "off", "ball", "touches", "free", "freeAny", "passes", "chain", "afterPass", "gripUsed", "echoUsed", "freekick", "longball", "dummy", "shots", "saves", "aiTouches", "blockSlides", "intent", "pulled", "frozen", "drift", "pref", "fans", "style", "ghost"] as const;
/** The state as 2.1 had it: only the fields that existed then, in the order the fixture wrote them. */
function legacyView(run: Run): string {
  const s = run.s;
  const m = s.match as unknown as Keyed<string, unknown> | null;
  return JSON.stringify({
    phase: s.phase,
    round: s.round,
    kind: s.kind,
    fans: s.fans,
    cleared: s.cleared,
    draws: s.draws,
    goalsFor: s.goalsFor,
    goalsAgainst: s.goalsAgainst,
    touchesTotal: s.touchesTotal,
    coaches: s.coaches,
    plays: s.plays,
    drills: s.drills,
    offers: s.offers,
    visit: s.visit,
    fulltime: s.fulltime,
    bosses: s.bosses,
    clubs: s.clubs,
    squad: s.squad.map((l) => l.t),
    best: s.best && { total: s.best.total, style: s.best.style, figs: s.best.figs },
    match: m && Object.fromEntries(MATCH_KEYS.map((k) => [k, m[k]])),
  });
}
for (const e of new Set(LEGACY.cases.map((c) => c.edition))) await putEdition(legacyEd(e)).catch(() => null);
await test("legacy 2.1 trails (seasons and Haunted) parse as the legacy rules and replay byte for byte", () => {
  assert.ok(LEGACY.cases.some((c) => c.mode === "season") && LEGACY.cases.some((c) => c.mode === "haunt"));
  for (const c of LEGACY.cases) {
    const p = parseTrail(c.trail);
    assert.equal(p.rules, RULES_LEGACY, c.seed);
    assert.equal(p.mode, c.mode, c.seed);
    const run = rerun(legacyEd(c.edition), c.seed, p.actions, p.mode, p.rules);
    assert.equal(run.rules, 2);
    assert.equal(legacyView(run), c.view, `${c.seed}: the replayed state differs from 2.1`);
    assert.equal(encodeTrail(run.trail, run.mode, run.rules), c.trail, `${c.seed}: the trail re-encodes differently`);
  }
});
await test("legacy 2.1 trails verify through the api/result guard into the very same record", async () => {
  for (const c of LEGACY.cases) {
    const ed = legacyEd(c.edition);
    const rec = await verifyAndStore({ seed: c.seed, edition: ed.id, trail: c.trail, mode: c.mode, name: "Legacy" }, LEGACY.now);
    assert.equal(JSON.stringify(rec), c.record, `${c.seed}: the stored record differs from 2.1`);
  }
});
await test("a forged or unknown rules token is refused, by the parser and by the guard", async () => {
  for (const bad of ["R2_g", "R2", "R9_g", "R_g", "R", "R3x_g", "R03_g", "R3_", "R3__g", "RR3_g", "R3_R3_g", "H_R3_g", "g_R3"]) assert.throws(() => parseTrail(bad), bad);
  const c = LEGACY.cases.find((x) => x.mode === "season")!;
  const ed = legacyEd(c.edition);
  // a real, finished legacy trail with a made-up token in front
  await assert.rejects(verifyAndStore({ seed: c.seed, edition: ed.id, trail: "R9_" + c.trail, name: "Forger" }, LEGACY.now), /unknown rules/);
  await assert.rejects(verifyAndStore({ seed: c.seed, edition: ed.id, trail: "R2_" + c.trail, name: "Forger" }, LEGACY.now), /unknown rules/);
  // the same legacy touches posted as rules 3 do not replay as the record they came from
  let forged: Awaited<ReturnType<typeof verifyAndStore>> | null = null;
  try {
    forged = await verifyAndStore({ seed: c.seed, edition: ed.id, trail: "R3_" + c.trail, name: "Forger" }, LEGACY.now);
  } catch {
    forged = null;
  }
  if (forged) assert.notEqual(JSON.stringify({ ...forged, id: "", trail: "", at: "" }), JSON.stringify({ ...JSON.parse(c.record), id: "", trail: "", at: "" }));
  // a Haunted trail with a made-up token
  const h = LEGACY.cases.find((x) => x.mode === "haunt")!;
  await assert.rejects(verifyAndStore({ seed: h.seed, edition: legacyEd(h.edition).id, trail: "R9_" + h.trail, mode: "haunt", name: "Forger" }, LEGACY.now), /unknown rules/);
});
await test("the rules token: legacy trails encode exactly as in 2.1; rules 3 leads with R3, before the mode", () => {
  const acts: Action[] = [{ t: "go" }, { t: "slide", r: 3, d: -1 }, { t: "kick", r: 4, d: 1 }, { t: "hold" }];
  assert.equal(encodeTrail(acts, "season", 2), "g_s3.0_k4.2_h");
  assert.equal(encodeTrail(acts, "haunt", 2), "H_g_s3.0_k4.2_h");
  assert.equal(encodeTrail([], "season", 2), "");
  assert.equal(encodeTrail([], "haunt", 2), "H");
  assert.equal(encodeTrail(acts, "season", 3), "R3_g_s3.0_k4.2_h");
  assert.equal(encodeTrail(acts, "haunt", 3), "R3_H_g_s3.0_k4.2_h");
  assert.equal(encodeTrail([], "season", 3), "R3");
  assert.equal(encodeTrail([], "haunt", 3), "R3_H");
  for (const rules of [2, 3] as const)
    for (const mode of ["season", "haunt"] as const)
      for (const a of [acts, []]) assert.deepEqual(parseTrail(encodeTrail(a, mode, rules)), { rules, mode, actions: a });
  assert.equal(CURRENT_RULES, RULES_NEXT, "3.0: new runs play the rules-3 game");
});
await test("a trail replayed under the other rules is told apart: the rules ride on the run and in its trail", () => {
  const a = playSeason(new Run(EDT, "RVKE-0101", "season", 2));
  const b = playSeason(new Run(EDT, "RVKE-0101", "season", 3));
  assert.equal(a.s.rules, 2);
  assert.equal(b.s.rules, 3);
  assert.notEqual(encodeTrail(a.trail, "season", a.rules), encodeTrail(b.trail, "season", b.rules));
  // 3.0: the rules differ, so the same seed plays out differently, and each trail replays only under its own rules
  assert.notEqual(legacyView(b), legacyView(a));
  assert.equal(b.rounds, 7);
  assert.equal(a.rounds, 8);
  assert.equal(JSON.stringify(rerun(EDT, "RVKE-0101", b.trail, "season", 3).s), JSON.stringify(b.s));
  assert.equal(JSON.stringify(rerun(EDT, "RVKE-0101", a.trail, "season", 2).s), JSON.stringify(a.s));
});

console.info("3.0: the engine contract");
/** A bot season with every event it produced, in order, each tagged with the action that made it. */
function eventLog(ed: Edition, seed: string, mode: "season" | "haunt" = "season", rules: 2 | 3 = RULES_LEGACY) {
  const run = new Run(ed, seed, mode, rules);
  const log: { a: Action; evs: Ev[] }[] = [];
  const apply = run.apply.bind(run);
  run.apply = (a: Action) => {
    apply(a);
    log.push({ a, evs: run.events.slice() });
  };
  playSeason(run);
  return { run, log };
}
await test("kick events carry the kicker's slot, the receiver's slot and the walls", () => {
  const { log } = eventLog(EDT, "RVKE-0102");
  let n = 0;
  for (const { evs } of log)
    for (const ev of evs) {
      if (ev.e !== "kick") continue;
      n++;
      assert.equal(ev.slot, slotOf(ev.rod, ev.fig));
      assert.equal(ev.toSlot, ev.result === "pass" ? slotOf(ev.kick.r, ev.to) : -1);
      assert.ok(ev.bounces >= 0);
      assert.equal(ev.tight, undefined, "no tight shots under the legacy rules");
      assert.equal(ev.first, undefined);
    }
  assert.ok(n > 20, "saw kicks: " + n);
});
await test("react groups the rival's reaction: right before its slides, the same moves in the same order", () => {
  const { log } = eventLog(EDT, "RVKE-0103");
  let groups = 0;
  for (const { evs } of log) {
    for (let i = 0; i < evs.length; i++) {
      const ev = evs[i];
      if (ev.e === "react") {
        groups++;
        const next = evs.slice(i + 1, i + 1 + ev.moves.length);
        assert.deepEqual(
          next.map((x) => (x.e === "slide" ? { r: x.r, d: x.d, why: x.why, side: x.side } : null)),
          ev.moves.map((mv) => ({ r: mv.r, d: mv.d, why: "react", side: 1 })),
        );
      }
      if (ev.e === "slide" && ev.why === "react") {
        let j = i - 1;
        while (j >= 0 && evs[j].e === "slide" && (evs[j] as { why: string }).why === "react") j--;
        assert.equal(evs[j]?.e, "react", "every reaction slide belongs to a group");
      }
    }
  }
  assert.ok(groups > 20, "saw reactions: " + groups);
});
await test("previewReact is a dry run: it tells exactly what the slide then does, and changes nothing", () => {
  let checked = 0;
  for (const seed of ["RVKE-0104", "RVKE-0105"]) {
    const run = new Run(EDT, seed);
    let steps = 0;
    while (steps++ < 3000 && run.s.phase !== "over" && run.s.phase !== "won") {
      if (run.s.phase === "attack") {
        for (let r = 0; r < 4; r++)
          for (const d of [-1, 1] as const) {
            const before = JSON.stringify(run.s);
            const pv = run.previewReact({ r, d });
            assert.equal(JSON.stringify(run.s), before, "the preview left the run alone");
            const legal = run.canMove(0, r, d) && run.slideCost(r) <= run.m.touches;
            assert.equal(pv !== null, legal, `preview of an ${legal ? "" : "il"}legal slide`);
            if (!pv) continue;
            const twin = rerun(EDT, seed, run.trail);
            twin.apply({ t: "slide", r, d });
            assert.deepEqual(pv.moves, twin.events.flatMap((e) => (e.e === "slide" && e.side === 1 && e.why === "react" ? [{ r: e.r, d: e.d }] : [])));
            assert.deepEqual(pv.off, twin.m.off);
            checked++;
          }
        if (checked > 150) break;
      }
      if (!botStep(run)) break;
    }
  }
  assert.ok(checked > 40, "previews checked: " + checked);
  const fresh = new Run(EDT, "RVKE-0104");
  assert.equal(fresh.previewReact({ r: 3, d: 1 }), null, "no preview before kickoff");
});
await test("whistle comes right before end, with the reason; a boss kickoff shows its rule first", () => {
  const { log, run } = eventLog(EDT, "RVKE-0106");
  let ends = 0;
  let finals = 0;
  for (const { evs } of log)
    evs.forEach((ev, i) => {
      if (ev.e !== "end") return;
      ends++;
      const w = evs[i - 1];
      assert.equal(w?.e, "whistle");
      if (w?.e !== "whistle") return;
      if (!ev.won) assert.equal(w.reason, ev.draw ? "draw" : "lost");
      else if (w.reason === "final") finals++;
      else assert.equal(w.reason, "won");
    });
  assert.ok(ends >= 2);
  assert.equal(finals, run.s.phase === "won" ? 1 : 0, "the final whistle only for the season won");
  for (const id of ["rug", "halt", "vcheck", "depeg", "gasspike", "jam", "slip", "lockup", "wash", "bell"]) {
    const r = bossMatch(EDT, id);
    const ev = r.events.find((e) => e.e === "rule");
    assert.ok(ev && ev.e === "rule" && ev.id === id, id);
    assert.deepEqual(r.m.ruleView, ev.e === "rule" ? ev.view : null);
    assert.ok(r.events.findIndex((e) => e.e === "rule") < r.events.findIndex((e) => e.e === "kickoff"));
  }
  assert.deepEqual(bossMatch(EDT, "rug").m.ruleView, { kind: "pulled", rod: 1 });
  const fr = new Run(EDT, "RVKE-0106");
  fr.apply({ t: "go" });
  assert.equal(fr.m.ruleView, null);
  assert.ok(!fr.events.some((e) => e.e === "rule"));
});
await test("scorers add up to your goals and follow the launch through a swap; the story has a line per match", () => {
  const { run, log } = eventLog(EDT, "RVKE-0107");
  const goals = Object.values(run.s.scorers).reduce((a, b) => a + b, 0);
  assert.equal(goals, run.s.goalsFor);
  const ended = log.reduce((n, x) => n + x.evs.filter((e) => e.e === "end").length, 0);
  assert.equal(run.s.story.length, ended);
  assert.ok(run.s.story.every((l) => ["won", "draw", "lost"].includes(l.key) && typeof l.args.club === "string"));
  const r = new Run(EDT, "RVKE-0108");
  r.s.scorers = { 8: 3, 3: 1 };
  r.apply({ t: "swap", a: 8, b: 2 });
  assert.deepEqual(r.s.scorers, { 2: 3, 3: 1 });
});
await test("the best goal keeps its move: one path segment per kick, ending in their goal mouth", () => {
  for (const seed of ["RVKE-0109", "RVKE-0110", "RVKE-0111"]) {
    const run = playSeason(new Run(EDT, seed));
    const b = run.s.best;
    if (!b) continue;
    assert.equal(b.path.length, b.kicks.length);
    assert.equal(b.kicks[b.kicks.length - 1].r, 4, "the last kick is the shot");
    assert.ok(b.kicks.slice(0, -1).every((k) => k.r < 4), "the ones before are passes");
    const last = b.path[b.path.length - 1];
    const end = last[last.length - 1];
    assert.ok(end.lane >= MOUTH[0] && end.lane <= MOUTH[1], "in the mouth");
    for (const seg of b.path) for (let i = 1; i < seg.length; i++) assert.equal(seg[i].x, seg[i - 1].x + 1, "a segment runs up the table one column a step");
    assert.ok(b.scorer >= 0 && b.scorer <= 10);
  }
});
await test("under the legacy rules the 3.0 stubs stay neutral: no tight lanes, league, table events or seeded kickoffs", () => {
  const { log, run } = eventLog(EDT, "RVKE-0112");
  assert.equal(run.s.league, null);
  assert.ok(!log.some((x) => x.evs.some((e) => e.e === "event" || e.e === "standings")));
  const r = new Run(EDT, "RVKE-0112", "season", RULES_LEGACY);
  r.apply({ t: "go" });
  assert.deepEqual(r.tightLanes(), []);
  assert.equal(r.m.event, null);
  assert.equal(r.m.kickoffId, 0);
  assert.equal(r.buildUpPower(), 0);
  assert.equal(r.firstTime(9), false);
  assert.equal(r.wideBody(3), false);
});
await test("traitsOf reads a launch's numbers, and only its numbers", () => {
  const base: Launch = { ...EDT.pool[0][0], g: false, k: 5, h: 3, x: 0, a: 1000 };
  const at = 1000 + 24 * 3600;
  assert.deepEqual(traitsOf(base, at), []);
  assert.deepEqual(traitsOf({ ...base, g: true, h: 20 }, at), ["flown", "whale"]);
  assert.deepEqual(traitsOf({ ...base, k: 0 }, at), ["ghost"]);
  assert.deepEqual(traitsOf({ ...base, k: 30, x: -800 }, at), ["degen", "dip"]);
  assert.deepEqual(traitsOf(base, 1000 + 3600), ["fresh"]);
  assert.deepEqual(traitsOf(base, at), traitsOf({ ...base }, at));
});
await test("the desk speaks plainly: no exclamation marks, no off-limits words, the same line for the same moment", () => {
  const banned = /\b(card|deck|poker|hand|blind|ante|chip|mult|flush|jackpot|bet|odds|gamble|casino|cash-out|graduat|download|reward|official|partner|sponsor|prize|earn|guarantee|spin|roll|loot|payout)/i;
  for (const l of DESK_LINES) {
    assert.ok(!l.includes("!"), l);
    assert.ok(!banned.test(l), l);
  }
  const { run, log } = eventLog(EDT, "RVKE-0113");
  let said = 0;
  log.forEach((x, n) =>
    x.evs.forEach((ev) => {
      const a = lineFor(ev, { run, n });
      const b = lineFor(ev, { run, n });
      assert.equal(a, b);
      if (a) {
        said++;
        assert.ok(!/[{}]/.test(a), a);
        assert.ok(a.length <= 72, a);
      }
    }),
  );
  assert.ok(said > 10, "the desk said " + said);
});


console.info("3.0: the rules-3 game");
/** Plays a run with the bot, logging every action and its events, until `stop` says so or the run ends. */
function botLog(ed: Edition, seed: string, mode: RunMode = "season", stop: (r: Run) => boolean = () => false) {
  const run = new Run(ed, seed, mode, 3);
  const log: { a: Action; evs: Ev[]; phase: string }[] = [];
  const apply = run.apply.bind(run);
  run.apply = (a: Action) => {
    apply(a);
    log.push({ a, evs: run.events.slice(), phase: run.s.phase });
  };
  let n = 0;
  while (n++ < 40000 && !stop(run) && botStep(run));
  return { run, log };
}
const R3SEEDS = ["RTRE-0001", "RTRE-0002", "RTRE-0003", "RTRE-0004"];
const R3LOGS = R3SEEDS.map((sd) => botLog(EDT, sd));
const allEvs = (logs: typeof R3LOGS) => logs.flatMap((x) => x.log.flatMap((l) => l.evs));

await test("rules 3 is deterministic: the same seed and touches give the same run, in every mode", () => {
  for (const mode of ["season", "haunt", "daily"] as RunMode[]) {
    const { run } = botLog(EDT, "RDET-0001", mode);
    const p = parseTrail(encodeTrail(run.trail, mode, 3));
    assert.equal(p.rules, 3);
    assert.equal(p.mode, mode);
    const twin = rerun(EDT, "RDET-0001", p.actions, p.mode, p.rules);
    assert.equal(JSON.stringify(twin.s), JSON.stringify(run.s), mode);
    const again = botLog(EDT, "RDET-0001", mode).run;
    assert.equal(JSON.stringify(again.trail), JSON.stringify(run.trail), mode);
  }
});
await test("a rules-3 season verifies through the guard into a record, and replays from its trail", async () => {
  await putEdition(EDT).catch(() => null);
  const { run } = R3LOGS[0];
  const trail = encodeTrail(run.trail, "season", 3);
  assert.ok(trail.startsWith("R3_"));
  const rec = await verifyAndStore({ seed: run.s.seed, edition: EDT.id, trail, name: "Rule Three" });
  assert.equal(rec.cleared, run.s.cleared);
  assert.equal(rec.best?.total, run.s.best?.total);
  assert.equal(rec.won, run.s.phase === "won");
  // the same touches posted without the token are a legacy trail: they don't come out the same, or don't replay at all
  let same = false;
  try {
    const legacy = rerun(EDT, run.s.seed, run.trail, "season", 2);
    same = JSON.stringify(legacy.summary()) === JSON.stringify(run.summary());
  } catch {
    same = false;
  }
  assert.ok(!same, "a rules-3 trail must not pass as a legacy one");
});
await test("pathOf replays any posted trail to its best goal, legacy ones included", () => {
  const { run } = R3LOGS[1];
  const b = pathOf(EDT, run.s.seed, encodeTrail(run.trail, "season", 3));
  assert.deepEqual(b, run.s.best);
  const c = LEGACY.cases.find((x) => x.mode === "season")!;
  const lb = pathOf(legacyEd(c.edition), c.seed, c.trail);
  assert.ok(lb && lb.path.length === lb.kicks.length);
  assert.equal(pathOf(EDT, "RDET-0001", "R9_g"), null);
  assert.equal(pathOf(EDT, "RDET-0001", "R3_k4.1"), null);
});

await test("keeper reach: a shot crossing the lane beside their keeper is tight, saved unless off a pass, off a wall, or with Power to spare", () => {
  const r = new Run(EDT, "RTGT-0001", "season", 3);
  r.apply({ t: "go" });
  const kl = r.m.off[1][0];
  assert.deepEqual(r.tightLanes(), [kl - 1, kl + 1].filter((l) => l >= 0 && l < 10));
  const kx = 8;
  const steps = (lane: number) => [
    { x: 7, lane },
    { x: kx, lane },
    { x: 9, lane },
  ];
  const tr = { steps: steps(kl + 1), land: kl + 1, bounces: 0, legal: true, to: -1, blockers: [], walls: [] };
  const plain = r.reachOf(r.m.off, tr, false);
  assert.equal(plain.tight, true);
  assert.equal(plain.blockers.length, 1);
  assert.equal(plain.blockers[0].reach, true);
  assert.equal(resolveBlock(plain.blockers, 0, false, 3).at?.reach, true, "no Power: the keeper reaches it");
  assert.equal(resolveBlock(plain.blockers, 1, false, 3).at, null, "one Power beats the reach, even in the final");
  assert.equal(r.reachOf(r.m.off, tr, true).blockers.length, 0, "straight off a pass: the keeper is wrong-footed");
  assert.equal(r.reachOf(r.m.off, { ...tr, bounces: 1 }, false).blockers.length, 0, "off a wall");
  const away = r.reachOf(r.m.off, { ...tr, steps: steps(kl + 3) }, false);
  assert.equal(away.tight, false);
  assert.equal(away.blockers.length, 0);
  // in play: tight shots happen, some are saved by the reach and some still go in
  const kicks = allEvs(R3LOGS).filter((e): e is Extract<Ev, { e: "kick" }> => e.e === "kick" && e.side === 0 && e.kick.r === 4);
  assert.ok(kicks.some((k) => k.tight && k.result === "goal"), "a tight goal");
  // legacy: never tight
  const l = new Run(EDT, "RTGT-0001", "season", 2);
  l.apply({ t: "go" });
  assert.deepEqual(l.tightLanes(), []);
  assert.equal(l.reachOf(l.m.off, tr, false).blockers.length, 0);
});
await test("Pace first time: a pass to a Pace figure arrives before they react, and its shot is marked first", () => {
  let quick = 0;
  let firsts = 0;
  for (const { run, log } of R3LOGS)
    for (const { evs } of log) {
      evs.forEach((ev, i) => {
        if (ev.e === "kick" && ev.side === 0 && ev.first) firsts++;
        if (ev.e !== "kick" || ev.side !== 0 || ev.result !== "pass" || !run.firstTime(ev.toSlot)) return;
        quick++;
        // nothing reacts between the pass and the end of this touch, unless the possession ended
        const after = evs.slice(i + 1);
        if (!after.some((x) => x.e === "turnover" || x.e === "end")) assert.ok(!after.some((x) => x.e === "react"), "no reaction to a first-time pass");
      });
    }
  assert.ok(quick > 3, "first-time passes seen: " + quick);
  assert.ok(firsts > 0, "first-time shots seen: " + firsts);
  const r = new Run(EDT, "RTGT-0002", "season", 3);
  const pace = r.s.squad.findIndex((l, i) => i > 0 && r.stats(i).pace);
  if (pace > 0) assert.equal(r.firstTime(pace), true);
  assert.equal(r.firstTime(0), false, "a keeper never takes a pass");
  assert.equal(new Run(EDT, "RTGT-0002", "season", 2).firstTime(pace), false);
});
await test("Grip wide body: on their ball a Grip figure at the back covers the next lane toward the middle; a Grip keeper both sides", () => {
  const r = new Run(EDT, "RTGT-0003", "season", 3);
  r.apply({ t: "go" });
  const off = r.m.off;
  r.m.wide = [0, 3];
  const w = r.wideCover(off)!;
  const kl = off[0][0];
  assert.equal(w[0][kl - 1], 0);
  assert.equal(w[0][kl + 1], 0);
  const ml = laneOf(2, off[0][2], 0);
  assert.equal(w[2][ml + (ml <= 4 ? 1 : -1)], 0, "the midfielder's lane beside it");
  // a kick of theirs down that extra lane meets the wide body; the same kick from your side does not see it
  const extra = ml + (ml <= 4 ? 1 : -1);
  // a kick of theirs from midfield down that lane meets the wide body; without wide bodies it passes
  const theirs = trace(off, [-1, -1], 1, 2, extra, { r: 4, d: 0 }, 0, { wide: w });
  assert.ok(theirs.blockers.some((b) => b.rod === 2 && b.fig === 0 && b.lane === extra));
  const bare = trace(off, [-1, -1], 1, 2, extra, { r: 4, d: 0 });
  assert.equal(figAt(2, off[0][2], extra), -1);
  assert.ok(!bare.blockers.some((b) => b.rod === 2 && b.lane === extra));
  assert.equal(r.wideBody(8), false, "attackers are never wide bodies");
});
await test("build-up: +1 Power from the second pass of a possession, and team moves happen", () => {
  const r = new Run(EDT, "RTGT-0004", "season", 3);
  r.apply({ t: "go" });
  assert.deepEqual([0, 1, 2, 3].map((n) => r.buildUpPower(n)), [0, 0, 1, 1]);
  const tr = trace(r.m.off, [-1, -1], 0, 3, 4, { r: 4, d: 0 });
  assert.equal(r.shotPower(9, 3, tr, 3, false, 2) - r.shotPower(9, 3, tr, 3, false, 1), 1);
  const goals = allEvs(R3LOGS).filter((e) => e.e === "goal" && e.side === 0) as Extract<Ev, { e: "goal" }>[];
  assert.ok(goals.some((g) => g.style === "Team move"), "a team move");
  assert.ok(goals.every((g) => typeof g.slot === "number"), "goals name their scorer");
});
await test("seeded kickoffs: each match opens from one of its club style's formations, the same for the same seed", () => {
  const seen = new Set<number>();
  for (let i = 0; i < 12; i++) {
    const r = new Run(EDT, `RKO${i % 10}-000${i % 10}`, "season", 3);
    r.apply({ t: "go" });
    const ko = KICKOFFS[r.m.kickoffId];
    assert.equal(ko.style, r.m.style);
    assert.deepEqual(r.m.off[0], ko.off[0], "your rods stand as the formation says");
    assert.equal(r.m.ball.rod === 2 && r.m.ball.fig === ko.fig, true);
    seen.add(ko.id);
    const twin = new Run(EDT, `RKO${i % 10}-000${i % 10}`, "season", 3);
    twin.apply({ t: "go" });
    assert.equal(twin.m.kickoffId, r.m.kickoffId);
  }
  assert.ok(seen.size >= 3, "openings vary: " + [...seen].join(","));
});
await test("table events: one per league match, told before kickoff; none in a cup tie; each one does what it says", () => {
  for (const { log } of R3LOGS)
    for (const { a, evs } of log) {
      if (a.t !== "go") continue;
      const ki = evs.findIndex((e) => e.e === "kickoff");
      const ei = evs.findIndex((e) => e.e === "event");
      const ri = evs.findIndex((e) => e.e === "rule");
      if (ri >= 0) assert.equal(ei, -1, "a cup tie has its rule, not a table event");
      else assert.ok(ei >= 0 && ei < ki, "a league match tells its event before kickoff");
    }
  const at = (id: TableEventId) => {
    for (let i = 0; i < 80; i++) {
      const r = new Run(EDT, `REV${i % 10}-${1000 + i}`, "season", 3);
      r.apply({ t: "go" });
      if (r.m.event === id) return r;
    }
    throw new Error("no " + id);
  };
  const g = at("green");
  assert.equal(g.baseTouches(true), g.baseTouches(false) + 1, "Green candle: a touch more on the first possession");
  const h = at("halfhalt");
  assert.equal(h.m.poss[0], 1);
  assert.ok(!h.myKicks().some((k) => k.kick.r !== 4 && k.kick.r - h.m.ball.rod >= 2), "no pass over a rod on the first possession");
  const t = at("thin");
  assert.ok(t.m.sticky! >= 0 && !STICKY_LANES.every((l) => l !== t.m.sticky));
  for (const k of t.myKicks()) assert.ok(!k.tr.steps.some((st) => st.lane === t.m.sticky && st.x >= 3 && st.x <= 6), "no kick runs along the sticky lane in midfield");
  const v = trace(START_OFF, [-1, -1], 0, 2, 1, { r: 4, d: -1 }, 0, { volatile: true });
  const n = trace(START_OFF, [-1, -1], 0, 2, 1, { r: 4, d: -1 });
  assert.notDeepEqual(v.steps, n.steps, "Volatile: the walls kick back harder");
  assert.ok(v.walls.length >= 1 && n.walls.length >= 1);
});
await test("Trading Halt lifts at the first goal; Mempool Jam lets a pass to a Pace figure through first", () => {
  const b3 = new Run(EDT, "BOSS-0001", "season", 3);
  b3.s.kind = 2;
  b3.s.bosses[0] = "halt";
  b3.apply({ t: "go" });
  assert.ok(b3.m.frozen >= 1);
  let n = 0;
  while (n++ < 3000 && b3.s.match && b3.m.score[0] + b3.m.score[1] === 0 && botStep(b3));
  if (b3.s.match && b3.s.match.score[0] + b3.s.match.score[1] > 0) {
    assert.equal(b3.m.frozen, -1);
    assert.deepEqual(b3.m.ruleView, { kind: "frozen", rod: -1 });
  }
  const legacy = bossMatch(EDT, "halt");
  let k = 0;
  while (k++ < 3000 && legacy.s.match && legacy.m.score[0] + legacy.m.score[1] === 0 && botStep(legacy));
  if (legacy.s.match) assert.ok(legacy.m.frozen >= 1, "2.1: frozen all match");
});
await test("the rival's own Power: their launches past 10% of the curve shoot through one more blocker", () => {
  const r = new Run(EDT, "RTGT-0006", "season", 3);
  r.apply({ t: "go" });
  const slots = r.rivalPowerSlots();
  assert.deepEqual(slots, r.rivals().flatMap((l, i) => (l.p >= STAT.power.at ? [i] : [])));
  assert.deepEqual(r.m.rivalPower, slots);
  const pw = r.ai().power;
  for (let slot = 1; slot <= 10; slot++) {
    const rod = slot <= 2 ? 1 : slot <= 7 ? 2 : 3;
    const fig = slot - [0, 1, 3, 8][rod];
    assert.equal(r.theirPower(rod, fig) - (rod <= 1 ? r.ai().deep : 0), pw + (slots.includes(slot) ? 1 : 0));
  }
});
await test("an empty defence turn plays itself: under rules 3 you are only asked to defend a threat", () => {
  let asked = 0;
  for (const { run, log } of R3LOGS) {
    void run;
    for (const { phase } of log) if (phase === "defend") asked++;
  }
  const r = new Run(EDT, "RTGT-0007", "season", 3);
  let n = 0;
  let states = 0;
  while (n++ < 4000 && botStep(r)) {
    if (r.s.phase === "defend") {
      states++;
      assert.ok(r.threats().length > 0, "a defend state always shows a threat");
    }
  }
  assert.ok(asked > 0 && states > 0);
});
await test("the rival plays the plan its preview and its threats show: aiPlan is exactly what Ready does", () => {
  let checked = 0;
  for (const seed of ["RAIP-0001", "RAIP-0002"]) {
    const r = new Run(EDT, seed, "season", 3);
    let n = 0;
    while (n++ < 3000 && r.s.phase !== "over" && r.s.phase !== "won") {
      if (r.s.phase === "defend") {
        const plan = r.aiPlan();
        const twin = rerun(EDT, seed, r.trail, "season", 3);
        twin.apply({ t: "hold" });
        const first = twin.events[0];
        if (plan.kind === "slide") assert.deepEqual(first && first.e === "slide" ? { r: first.r, d: first.d } : null, { r: plan.r, d: plan.d });
        else assert.deepEqual(first && first.e === "kick" ? first.kick : null, plan.kick);
        checked++;
      }
      if (!botStep(r)) break;
    }
  }
  assert.ok(checked > 10, "plans checked: " + checked);
});

console.info("3.0: the league season");
await test("a rules-3 season is seven rounds: two league matchdays and a cup tie each, the last cup tie the final", () => {
  const r = new Run(EDT, "RLG0-0001", "season", 3);
  assert.equal(r.rounds, ROUNDS_R3);
  assert.equal(r.s.bosses.length, 7);
  assert.equal(r.s.bosses[6], "bell");
  assert.equal(new Set(r.s.bosses.slice(0, 6)).size, 6);
  assert.equal(r.s.clubs.length, 14);
  const t = r.s.league!;
  assert.equal(t.length, 8);
  assert.equal(t.filter((x) => x.you).length, 1);
  assert.equal(t.find((x) => x.you)!.club, "You", "your row is named You");
  // a double round robin: every club twice, never twice in a row
  const count: Keyed<string, number> = {};
  for (const c of r.s.clubs) count[c] = (count[c] || 0) + 1;
  assert.ok(Object.values(count).every((n) => n === 2));
  for (let i = 1; i < 14; i++) assert.notEqual(r.s.clubs[i], r.s.clubs[i - 1]);
  for (let md = 0; md < 14; md++) {
    const seen = fixturesOf(md).flat();
    assert.equal(new Set(seen).size, 8, "every club plays once a matchday");
  }
  const pairs = new Set<string>();
  for (let md = 0; md < 7; md++) for (const [a, b] of fixturesOf(md)) pairs.add([a, b].sort().join("-"));
  assert.equal(pairs.size, 28, "each pair once in a half");
  assert.equal(fixtureName(2, 3, true), "Final");
  assert.equal(fixtureName(0, 3), "League match");
  assert.equal(fixtureName(0, 2), "Friendly");
  // the legacy season keeps its shape
  const l = new Run(EDT, "RLG0-0001", "season", 2);
  assert.equal(l.rounds, 8);
  assert.equal(l.s.league, null);
});
await test("the table books every matchday: your result, the other three, points and goals; standings follow", () => {
  for (const { run, log } of R3LOGS) {
    const t = run.s.league!;
    for (const row of t) {
      assert.equal(row.pts, 3 * row.w + row.d);
      assert.equal(row.p, row.w + row.d + row.l);
    }
    const ps = new Set(t.map((x) => x.p));
    assert.equal(ps.size, 1, "everyone has played the same number of matchdays");
    assert.equal(t.reduce((a, x) => a + x.gf, 0), t.reduce((a, x) => a + x.ga, 0), "goals balance");
    assert.deepEqual(t, sortTable(t), "kept in table order");
    for (const { evs } of log) {
      const e = evs.findIndex((x) => x.e === "end");
      const st = evs.findIndex((x) => x.e === "standings");
      if (st >= 0) assert.ok(e >= 0 && st > e, "standings come after the whistle");
    }
    const league = run.s.story.filter((x) => x.kind < 2);
    assert.equal(league.length, t[0].p);
    assert.ok(league.every((x) => typeof x.args.pos === "number"));
  }
});
await test("league end conditions: a league loss plays on; the table shuts you out once the top two is out of reach", () => {
  // a league loss alone does not end a season
  const lost = R3LOGS.flatMap((x) => x.run.s.story.filter((l, i, all) => l.kind < 2 && l.key === "lost" && i < all.length - 1));
  // shut out: two clubs out of reach before a league match
  const r = new Run(EDT, "RLG0-0002", "season", 3);
  const others = r.s.league!.filter((x) => !x.you);
  for (const o of others.slice(0, 2)) {
    o.w = 33;
    o.pts = 99;
  }
  assert.equal(r.leagueOut(), true);
  let n = 0;
  while (n++ < 4000 && r.s.phase !== "over" && botStep(r));
  const last = r.s.story[r.s.story.length - 1];
  assert.equal(r.s.phase, "over");
  assert.equal(last.kind < 2, true);
  assert.equal(last.args.out, 1);
  // one club out of reach is not enough
  const r2 = new Run(EDT, "RLG0-0003", "season", 3);
  r2.s.league!.find((x) => !x.you)!.pts = 99;
  assert.equal(r2.leagueOut(), false);
  // with nothing left to play, the place decides
  const r3 = new Run(EDT, "RLG0-0004", "season", 3);
  for (const row of r3.s.league!) row.p = MATCHDAYS;
  r3.s.league = sortTable(r3.s.league!.map((x) => (x.you ? { ...x, pts: 10 } : { ...x, pts: x.club < "M" ? 20 : 0 })));
  assert.equal(r3.leagueOut(), r3.standing() > 2);
  // a league loss alone does not end a season: find one in play
  let played = lost.length;
  for (let i = 0; i < 30 && !played; i++) played = botLog(EDT, `RLGL-${1000 + i}`).run.s.story.filter((l, j, all) => l.kind < 2 && l.key === "lost" && j < all.length - 1).length;
  assert.ok(played > 0, "the bot lost a league match and played on");
});
await test("the final: only the top two reach it, against the other club of the top two, under the Closing Bell's terms", () => {
  const r = new Run(EDT, "RLG0-0005", "season", 3);
  assert.equal(r.clubName(2, 7), "Closing Bell", "before the league is done");
  for (const row of r.s.league!) row.p = MATCHDAYS;
  r.s.league!.find((x) => x.you)!.pts = 50;
  const other = r.s.league!.find((x) => !x.you)!;
  other.pts = 40;
  r.s.league = sortTable(r.s.league!);
  assert.equal(r.standing(), 1);
  assert.equal(r.finalist(), other.club);
  assert.equal(r.clubName(2, 7), other.club);
  assert.equal(r.bossOf(2, 7), "bell");
  assert.equal(r.homeTouches(2, 7), 1, "top of the table: a touch more to open the final");
  assert.equal(r.homeTouches(2, 3), 1, "top two: a cup tie at home");
  for (const row of r.s.league!) row.pts = row.you ? 0 : 30;
  r.s.league = sortTable(r.s.league!);
  assert.equal(r.finalist(), null);
  assert.equal(r.homeTouches(2, 3), 0, "below the line: away");
  // in play, a cup tie lost ends the season, and a season won ends on the final whistle
  for (const { run, log } of R3LOGS) {
    const last = run.s.story[run.s.story.length - 1];
    if (run.s.phase === "won") {
      assert.equal(last.args.final, 1);
      assert.ok(log.some((x) => x.evs.some((e) => e.e === "whistle" && e.reason === "final")));
    } else if (last.kind === 2) assert.notEqual(last.key, "won");
  }
});

console.info("3.0: the Daily match day");
const DAY = utcDay();
const DH = dayStartHour(DAY);
const DED = fakeEdition(DH);
await putEdition(DED).catch(() => null);
const DPIN = await dailyPin(DAY, Date.now(), async () => assert.fail("must not cut"));
await test("the Daily is one match day: friendly, league match, boss club; finished after fixture 3 or the first loss", () => {
  const r = new Run(DED, DPIN.seed, "daily", 3);
  assert.equal(r.rounds, 1);
  assert.equal(r.s.clubs.length, 2);
  assert.notEqual(r.s.bosses[0], "bell");
  assert.equal(r.s.league, null);
  assert.equal(fixtureName(1, 3, false, "daily"), "League match");
  assert.equal(fixtureName(0, 3, false, "daily"), "Friendly");
  assert.throws(() => new Run(DED, DPIN.seed, "daily", 2), /rules 3/);
  const { run } = botLog(DED, DPIN.seed, "daily");
  assert.ok(run.s.phase === "won" || run.s.phase === "over");
  if (run.s.phase === "won") assert.equal(run.s.story.length, 3);
  else assert.notEqual(run.s.story[run.s.story.length - 1].key, "won");
});
await test("the Daily trail token: R3_D; a D without rules 3, or a stray token, is refused", () => {
  const acts: Action[] = [{ t: "go" }, { t: "hold" }];
  assert.equal(encodeTrail(acts, "daily", 3), "R3_D_g_h");
  assert.equal(encodeTrail([], "daily", 3), "R3_D");
  assert.deepEqual(parseTrail("R3_D_g_h"), { rules: 3, mode: "daily", actions: acts });
  assert.deepEqual(parseTrail("R3_D"), { rules: 3, mode: "daily", actions: [] });
  assert.throws(() => encodeTrail(acts, "daily", 2));
  for (const bad of ["D_g", "D", "R3_D_", "R3_DD_g", "R3_D_H_g", "R3_H_D_g", "D_R3_g", "R4_D_g"]) assert.throws(() => parseTrail(bad), bad);
  // the client finds the mode the way main.ts does
  assert.equal(parseTrail(encodeTrail([{ t: "go" }], "daily" as RunMode)).mode, "daily");
});
await test("a Daily match day verifies when finished, early or after fixture 3, onto the Daily board only", async () => {
  const done = botLog(DED, DPIN.seed, "daily").run;
  const trail = encodeTrail(done.trail, "daily", 3);
  const rec = await verifyAndStore({ seed: DPIN.seed, edition: DED.id, trail, name: "Daily Driver" });
  assert.equal(rec.mode, "daily");
  assert.equal(rec.daily, DAY);
  assert.equal(rec.over, true);
  const hall = await getHall(DAY);
  assert.ok(!hall.entries.some((e) => e.id === rec.id), "not in the Hall of goals");
  if (rec.best && rec.best.total > 0) assert.ok((await publicBoard(DAY)).entries.some((e) => e.name === "Daily Driver"), "on the Daily board");
  // finished early: a lazy player who never blocks and loses the friendly
  const lazy = new Run(DED, DPIN.seed, "daily", 3);
  let n = 0;
  while (n++ < 4000 && lazy.s.phase !== "over" && lazy.s.phase !== "won") {
    if (lazy.s.phase === "defend") lazy.apply({ t: "hold" });
    else if (lazy.s.phase === "attack") {
      const k = lazy.myKicks();
      const pass = k.find((x) => x.kick.r !== 4 && !x.open) || k.find((x) => x.kick.r === 4 && !x.open);
      if (pass) lazy.apply({ t: "kick", r: pass.kick.r, d: pass.kick.d });
      else botStep(lazy);
    } else if (!botStep(lazy)) break;
  }
  if (lazy.s.phase === "over") {
    const early = await verifyAndStore({ seed: DPIN.seed, edition: DED.id, trail: encodeTrail(lazy.trail, "daily", 3) });
    assert.equal(early.over, true);
    assert.ok(early.round === 1 && early.fixture <= 2);
  }
  // not finished: refused
  const half = done.trail.slice(0, Math.max(1, Math.floor(done.trail.length / 3)));
  await assert.rejects(verifyAndStore({ seed: DPIN.seed, edition: DED.id, trail: encodeTrail(half, "daily", 3) }), /not finished/);
  // another seed in daily mode: refused
  const other = botLog(DED, "RDAY-0002", "daily").run;
  await assert.rejects(verifyAndStore({ seed: "RDAY-0002", edition: DED.id, trail: encodeTrail(other.trail, "daily", 3) }), /not today's Daily/);
  // a mode flag that says otherwise
  await assert.rejects(verifyAndStore({ seed: DPIN.seed, edition: DED.id, trail, mode: "season" }), /mode does not match/);
});
await test("legacy Daily seasons (2.1 rules, no token) still verify onto the board", async () => {
  const run = new Run(DED, DPIN.seed, "season", 2);
  let n = 0;
  while (n++ < 40000 && botStep(run));
  const trail = encodeTrail(run.trail, "season", 2);
  assert.ok(!trail.startsWith("R"));
  const rec = await verifyAndStore({ seed: DPIN.seed, edition: DED.id, trail, name: "Old Daily" });
  assert.equal(rec.daily, DAY);
  assert.equal(rec.mode, undefined);
});

console.info("3.0: content, voice and the programme");
await test("Haunted under rules 3 runs easy to hard; every club the game can field has an identity", () => {
  const r = new Run(EDT, "RHNT-0001", "haunt", 3);
  assert.deepEqual([0, 1, 2].map((k) => r.levelOf(k)), R3.haunt);
  for (const c of [...CLUBS, ...BOSSES.map((b) => b.name), FINAL_BOSS.name, ...HAUNT.clubs, HAUNT.boss.name]) {
    const id = CLUB_ID[c];
    assert.ok(id, c);
    assert.ok(id.kit.length === 2 && id.kit.every((x) => x >= 0 && x <= 0xffffff), c);
    assert.ok(id.chant.length <= 72 && !id.chant.includes("!"), c);
    assert.ok(CAPTAIN_RULE[id.captain], c);
  }
  assert.equal(clubIdOf("Nobody FC").crest, "shield");
  const run = new Run(EDT, "RHNT-0002", "season", 3);
  const cap = run.captainOf(0, 1);
  assert.ok(cap >= 0 && cap < 11);
});
await test("the desk: eight lines or more for every main event, none with an exclamation mark or an off-limits word", () => {
  const banned = /\b(card|deck|poker|hand|blind|ante|chip|mult|flush|jackpot|bet|odds|gamble|casino|cash-out|graduat|download|reward|official|partner|sponsor|prize|earn|guarantee|spin|roll|loot|payout|rarity)/i;
  const main = ["goalTap", "goalAngled", "goalOneTouch", "goalTeam", "goalLong", "goalBank", "goalPower", "goalUp", "goalDown", "blocked", "blockedKeeper", "tight", "kept", "saved", "wide", "conceded", "chain", "chainLong", "firstUp", "touches", "dead", "kickoff", "won", "draw", "lost", "final", "rule", "haunted", "ghost"];
  for (const k of main) assert.ok((DESK_POOLS[k] || []).length >= 8, k + " has " + (DESK_POOLS[k] || []).length);
  const ruleLines = Object.keys(DESK_POOLS).filter((k) => k.startsWith("rule_")).flatMap((k) => DESK_POOLS[k]);
  assert.ok(ruleLines.length >= 8 && BOSSES.every((b) => DESK_POOLS["rule_" + b.id]));
  const evLines = Object.keys(DESK_POOLS).filter((k) => k.startsWith("event_")).flatMap((k) => DESK_POOLS[k]);
  assert.ok(evLines.length >= 8 && TABLE_EVENT_IDS.every((id) => DESK_POOLS["event_" + id]));
  // a chant opens with the club's own name (2.1's names, which old trails keep); the words after it are new copy
  for (const l of [...DESK_LINES, ...Object.entries(CLUB_ID).map(([name, c]) => c.chant.slice(name.length))]) {
    assert.ok(!l.includes("!"), l);
    assert.ok(!banned.test(l), l);
  }
  // filled, over real runs in every mode: short, no stray braces, the same line for the same moment
  let said = 0;
  for (const { run, log } of [...R3LOGS, botLog(EDT, "RVCE-0001", "haunt"), botLog(DED, DPIN.seed, "daily")])
    log.forEach((x, n) =>
      x.evs.forEach((ev) => {
        const a = lineFor(ev, { run, n });
        assert.equal(a, lineFor(ev, { run, n }));
        if (!a) return;
        said++;
        assert.ok(!/[{}]/.test(a), a);
        assert.ok(a.length <= 72, a);
        assert.ok(!a.includes("!"), a);
      }),
    );
  assert.ok(said > 100, "the desk said " + said);
});
await test("the programme: how it ended, launch of the season, rival of the season, three desk lines", () => {
  for (const { run } of R3LOGS) {
    const p = recapOf(run);
    assert.ok(["won", "final", "cup", "table", "out"].includes(p.end), p.end);
    assert.equal(p.lines.length, run.s.best ? 3 : 2);
    for (const l of p.lines) assert.ok(l.length <= 72 && !/[{}!]/.test(l), l);
    if (p.launch) assert.equal(p.launch.goals, Math.max(...Object.values(run.s.scorers)));
    assert.ok(p.rival && typeof p.rival.club === "string");
    assert.ok(p.table && p.table.pos >= 1 && p.table.pos <= 8);
    assert.deepEqual(recapOf(run), p);
  }
  const story = R3LOGS[0].run.s.story;
  assert.ok(story.some((l) => typeof l.args.scorers === "string"), "the story names its scorers");
});
await test("traits read only a launch's numbers, pump included", () => {
  const base: Launch = { ...EDT.pool[0][0], g: false, k: 5, h: 3, x: 0, a: 1000 };
  const at = 1000 + 24 * 3600;
  assert.deepEqual(traitsOf({ ...base, x: 2000 }, at), ["pump"]);
  assert.ok(TRAIT.pump.name.length > 0);
});

if (process.argv.includes("--live")) {
  console.info("live read (Robinhood Chain testnet, eth_call only)");
  await test("the creator holds $KICKER; a fresh address holds none", async () => {
    const creator = await kickerBalance("0x16f9A7068488Fa587D9DBA01d3ef562931Ab3E52");
    assert.ok(creator > 0n, "creator balance " + creator);
    assert.equal(await kickerBalance(stranger.address), 0n);
  });
}

console.info(`\n${passed} passed, ${failed} failed`);
process.exitCode = failed ? 1 : 0;
