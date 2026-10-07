// A simple greedy player. Used for balance sims, QA and the in-game "hint" button.
import type { Run } from "./engine.js";
import { MAX_INSIDERS, MAX_MOVES } from "./content.js";

function combos(ids: number[], k: number): number[][] {
  const out: number[][] = [];
  const rec = (start: number, acc: number[]) => {
    if (acc.length === k) {
      out.push(acc.slice());
      return;
    }
    for (let i = start; i < ids.length; i++) {
      acc.push(ids[i]);
      rec(i + 1, acc);
      acc.pop();
    }
  };
  rec(0, []);
  return out;
}

/** Best playable selection in hand by immediate score. */
export function bestPlay(run: Run): { ids: number[]; total: number } {
  const s = run.s;
  const min = run.minPlay();
  let best = { ids: [] as number[], total: -1 };
  for (let k = Math.max(1, min); k <= Math.min(5, s.hand.length); k++) {
    for (const c of combos(s.hand, k)) {
      const sc = run.score(c, s.handsPlayedRound === 0, s.hands === 1);
      if (sc.total > best.total || (sc.total === best.total && c.length < best.ids.length)) best = { ids: c, total: sc.total };
    }
  }
  return best;
}

/** One step of the greedy bot. Returns false when the run is over. */
export function botStep(run: Run): boolean {
  const s = run.s;
  switch (s.phase) {
    case "blind":
      run.apply({ t: "go" });
      return true;
    case "round": {
      const best = bestPlay(run);
      const need = s.target - s.score;
      if (best.total * s.hands < need && s.discards > 0 && s.draw.length > 0) {
        const keep = new Set(run.evaluate(best.ids).scoring);
        const toss = s.hand
          .filter((i) => !keep.has(i))
          .sort((a, b) => run.card(a).rank - run.card(b).rank)
          .slice(0, 5);
        if (toss.length) {
          run.apply({ t: "disc", c: toss });
          return true;
        }
      }
      run.apply({ t: "play", c: best.ids });
      return true;
    }
    case "cashout":
      run.apply({ t: "cash" });
      return true;
    case "shop": {
      const seq = s.offers
        .map((o, i) => ({ o, i }))
        .filter(({ o }) => !o.sold && o.cost <= s.money)
        .filter(({ o }) => (o.kind === "insider" ? s.insiders.length < MAX_INSIDERS : o.kind === "move" ? s.moves.length < MAX_MOVES && o.id === "treasury" : true))
        .sort((a, b) => (a.o.kind === "insider" ? 0 : 1) - (b.o.kind === "insider" ? 0 : 1) || b.o.cost - a.o.cost);
      if (seq.length) {
        run.apply({ t: "buy", i: seq[0].i });
        return true;
      }
      const tIdx = s.moves.indexOf("treasury");
      if (tIdx >= 0) {
        run.apply({ t: "use", i: tIdx, c: [] });
        return true;
      }
      run.apply({ t: "next" });
      return true;
    }
    default:
      return false;
  }
}
