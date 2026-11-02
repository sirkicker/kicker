// Unit tests: the match engine (determinism, the rules, the rival, every boss club), the replay guard (forged,
// reordered and replayed trails), the Daily Match seed and pin, the Daily board, team kits and sign-in, names and
// Your table, and the live figures. Runs on the in-memory store, no network: `npm test`.
// Add `--live` to also read $KICKER balances on Robinhood Chain testnet, `--anvil` to check a real ERC-1271 account on a local anvil.
import assert from "node:assert/strict";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import { STAT, buildSquad, type Edition, type Launch, type Pair } from "../shared/data.js";
import { figureFacts, roomHint, squadFacts } from "../shared/insight.js";
import { Run, rerun, encodeTrail, decodeTrail, reflect, resolveBlock, trace, laneOf, slotOf, type Action } from "../shared/engine.js";
import { botStep, playSeason } from "../shared/bot.js";
import { COACHES, MOUTH, RODS, START_FANS, WIN_FANS, drillCost } from "../shared/content.js";
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
  const run = new Run(ed, seed);
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
  return { trail: encodeTrail(run.trail), best: run.s.best?.total || 0, run };
}

/** A fresh match against a given boss club (the boss is set by hand; the seed decides the rest). */
function bossMatch(ed: Edition, id: string, round = 1) {
  const r = new Run(ed, "BOSS-0001");
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
  const a = new Run(EDT, "SAME-0001");
  const b = new Run(EDT, "SAME-0001");
  assert.deepEqual(a.s.squad.map((l) => l.t), b.s.squad.map((l) => l.t));
  assert.deepEqual(a.s.bosses, b.s.bosses);
  assert.deepEqual(a.s.clubs, b.s.clubs);
  const c = new Run(EDT, "SAME-0002");
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
  const a = playSeason(new Run(EDT, "TWIN-0001"));
  const b = playSeason(new Run(EDT, "TWIN-0001"));
  assert.equal(encodeTrail(a.trail), encodeTrail(b.trail));
  assert.deepEqual(a.s, b.s);
  const c = rerun(EDT, "TWIN-0001", decodeTrail(encodeTrail(a.trail)));
  assert.deepEqual(c.s, a.s);
  assert.ok(a.s.phase === "over" || a.s.phase === "won");
});
await test("the rival reacts the same way to the same position", () => {
  const r = new Run(EDT, "REAC-0001");
  r.apply({ t: "go" });
  const one = r.reactTo(r.m.off.map((o) => o.slice()));
  const two = r.reactTo(r.m.off.map((o) => o.slice()));
  assert.deepEqual(one, two);
});
await test("a trail decodes to what it encodes, and junk does not decode", () => {
  const acts: Action[] = [{ t: "go" }, { t: "slide", r: 3, d: -1 }, { t: "kick", r: 4, d: 1 }, { t: "hold" }, { t: "use", i: 0 }, { t: "swap", a: 8, b: 3 }, { t: "sell", i: 1 }, { t: "collect" }, { t: "buy", i: 2 }, { t: "next" }];
  assert.deepEqual(decodeTrail(encodeTrail(acts)), acts);
  for (const junk of ["q", "s1.1", "s1", "k1.5", "g1", "w8", "b", "h2", "s-1.0"]) assert.throws(() => decodeTrail(junk), junk);
});

console.info("the rules");
await test("touches: a slide or a kick costs one; out of touches, their keeper restarts", () => {
  const r = new Run(EDT, "RULE-0001");
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
  const r = new Run(EDT, "RULE-0002");
  r.s.squad[0] = { ...r.s.squad[0], k: STAT.pace.at + 5 };
  r.apply({ t: "go" });
  assert.equal(r.m.free[0], 1);
  const t = r.m.touches;
  r.apply({ t: "slide", r: 0, d: 1 });
  if (r.s.phase === "attack") assert.equal(r.m.touches, t);
});
await test("passes only go forward, to a figure of yours; illegal kicks are refused", () => {
  const r = new Run(EDT, "RULE-0003");
  r.apply({ t: "go" });
  assert.throws(() => r.apply({ t: "kick", r: 1, d: 0 }), /forward/);
  for (const k of r.myKicks()) assert.ok(k.kick.r > r.m.ball.rod);
});
await test("a blocked pass goes to the blocker; Grip keeps the ball once a possession", () => {
  let found = false;
  for (let i = 0; i < 60 && !found; i++) {
    const r = new Run(EDT, "GRIP-" + String(i).padStart(4, "0"));
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
    const r = new Run(EDT, "GOAL-" + String(i).padStart(4, "0"));
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
  const r = new Run(EDT, "FANS-0001");
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
  const r = new Run(EDT, "SWAP-0001");
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
    const r = new Run(EDT, "COVR-" + String(i).padStart(4, "0"));
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
  const early = new Run(EDT, "READ-0001");
  assert.equal(early.ai().read, false);
  early.s.round = 5;
  early.s.kind = 1;
  assert.equal(early.ai().read, true);
});
await test("their touches run out: your keeper restarts", () => {
  const r = new Run(EDT, "AITO-0001");
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
  const plain = new Run(BED, "BOSS-0001");
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
  const r = new Run(BED, "BOSS-0001");
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
    const r = new Run(BED, "DRAW-0001");
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
    const own = rerun(GED, "GARD-0002", decodeTrail(honest.trail));
    assert.equal(rec.best?.total || 0, own.s.best?.total || 0);
  } catch (e) {
    assert.ok(e instanceof Error);
  }
});

console.info("the figures are live");
await test("a stat comes from its number, at the printed threshold", () => {
  const r = new Run(EDT, "LIVE-0001");
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
    const r = new Run(fakeEdition(496900 + e), "LITE-000" + e);
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
  const r = new Run(EDT, "LIVE-0002");
  const l: Launch = { ...EDT.pool[0][0], p: 500, k: 5, h: 3 };
  assert.deepEqual(r.stats(0) && [r.statSources(l).power.length, r.statSources(l).pace.length, r.statSources(l).grip.length].map((n) => n > 0), [false, false, false]);
  r.s.coaches = ["moonboy", "volume", "whale"].map((id) => ({ id, v: 0, paid: 0 }));
  const src = r.statSources(l);
  assert.deepEqual([src.power, src.pace, src.grip], [["moonboy"], ["volume"], ["whale"]]);
});
await test("the data tag reads the same numbers the match uses", () => {
  const r = new Run(EDT, "LIVE-0003");
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
    const r = new Run(fakeEdition(496800 + e), "ROOM-000" + e);
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
