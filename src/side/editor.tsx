// "Field a kicker": pick a viber of the set (or have one drawn), pick his kit (today's home or away, your own two
// colours and a pattern, or the colours of a vibe/vibe launch), give him a name and a line, and put him on today's rod.
import { render } from "preact";
import "./editor.css";
import { useEffect, useMemo, useRef, useState } from "preact/hooks";
import { CAP_MAX, NAME_MAX, PALETTE, SET_SIZE, KIT_PATTERNS, dayLong, dayTeams, familyOf, manNo, setNo, type Badge, type Kit, type KitPattern, type PublicMan } from "../../shared/side.js";
import { api, portraitUrl, type LaunchLook } from "./api.js";
import { paintKicker } from "./sprites.js";
import { jersey } from "./jersey.js";
import { PARA, onAddr, remembered, signIn, signOut } from "./signin.js";

const reduced = () => matchMedia("(prefers-reduced-motion: reduce)").matches;
const rnd = (n: number) => Math.floor(Math.random() * n);

function Stage(props: { v: number; kit: Kit; name: string; cap: string; kick: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [up, setUp] = useState(false);
  const [slide, setSlide] = useState(0);
  const scale = typeof window !== "undefined" && window.innerWidth < 760 ? 2 : 3;
  useEffect(() => {
    if (ref.current) void paintKicker(ref.current, props.v, props.kit, scale, up ? 1 : 0);
  }, [props.v, props.kit, up, scale]);
  // a new viber slides in along the rod, the only way anyone arrives here
  useEffect(() => {
    if (reduced()) return;
    setSlide(1);
    const t = setTimeout(() => setSlide(0), 30);
    return () => clearTimeout(t);
  }, [props.v]);
  return (
    <div class="ed-stage">
      <p class="ed-kick">{props.kick}</p>
      <div class="pv" onPointerEnter={() => setUp(true)} onPointerLeave={() => setUp(false)} style={{ "--sc": scale }}>
        <div class="pv-rod" />
        <canvas ref={ref} class={"pv-man" + (slide ? " in" : "")} role="img" aria-label={`${setNo(props.v)}, your kicker, as he will stand on the rod`} />
      </div>
      <div class="ed-label" aria-hidden="true">
        <p class="n">{props.name.trim() || "nameless"}</p>
        <p class="q">{props.cap.trim() ? `“${props.cap.trim()}”` : " "}</p>
      </div>
    </div>
  );
}

/** One viber of the set as a thumbnail, cut from the atlas by CSS (no canvas per button). */
function Thumb(props: { v: number; on: boolean; onPick: () => void }) {
  const i = props.v - 1;
  return (
    <button
      type="button"
      class={"vb" + (props.on ? " on" : "")}
      aria-pressed={props.on}
      aria-label={setNo(props.v)}
      title={setNo(props.v)}
      onClick={props.onPick}
      style={{ "--x": i % 16, "--y": Math.floor(i / 16) }}
    />
  );
}

function Jersey(props: { kit: Kit; css?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    if (ref.current) jersey(ref.current, props.kit, props.css || 1.5);
  }, [props.kit.a, props.kit.b, props.kit.p, props.css]);
  return <canvas ref={ref} class="jer" aria-hidden="true" />;
}

interface Props {
  today: string;
  v?: number;
  onClose(): void;
  onPlaced(m: PublicMan): void;
  onSee(m: PublicMan): void;
}

type KitMode = "home" | "away" | "own";

function Editor(p: Props) {
  const teams = dayTeams(p.today);
  const [v, setV] = useState(p.v || 1 + rnd(SET_SIZE));
  const [mode, setMode] = useState<KitMode>(Math.random() < 0.5 ? "home" : "away");
  const [own, setOwn] = useState<Kit>({ a: "#cf5b3e", b: "#221419", p: "plain" });
  const [slot, setSlot] = useState<"a" | "b">("a");
  const [name, setName] = useState("");
  const [cap, setCap] = useState("");
  const [link, setLink] = useState("");
  const [launch, setLaunch] = useState<LaunchLook | null>(null);
  const [useBadge, setUseBadge] = useState(true);
  const [lbusy, setLbusy] = useState(false);
  const [lerr, setLerr] = useState("");
  const [addr, setAddr] = useState<string | null>(remembered());
  const [holder, setHolder] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [done, setDone] = useState<PublicMan | null>(null);
  const [saving, setSaving] = useState(false);
  const pal = launch ? launch.pal : PALETTE;
  const kit: Kit = mode === "home" ? teams[0] : mode === "away" ? teams[1] : own;
  const badge: Badge | undefined = launch && useBadge && launch.badge.px ? launch.badge : undefined;
  const fam = familyOf(v);
  const grid = useRef<HTMLDivElement>(null);

  useEffect(() => onAddr((a) => setAddr(a)), []);
  useEffect(() => {
    setHolder(null);
    if (!addr) return;
    let live = true;
    api
      .holder(addr)
      .then((r) => live && setHolder(r.holder))
      .catch(() => live && setHolder(null));
    return () => {
      live = false;
    };
  }, [addr]);
  // keep the picked viber in view in the grid
  useEffect(() => {
    const b = grid.current?.querySelector<HTMLElement>(".vb.on");
    b?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [v]);

  const step = (d: number) => setV(((v - 1 + d + SET_SIZE) % SET_SIZE) + 1);
  const draw = () => {
    setV(1 + rnd(SET_SIZE));
    const m: KitMode = (["home", "away", "own"] as const)[rnd(3)];
    setMode(m);
    if (m === "own") {
      const a = rnd(pal.length);
      let b = rnd(pal.length);
      if (b === a) b = (a + 7) % pal.length;
      setOwn({ a: pal[a], b: pal[b], p: KIT_PATTERNS[rnd(KIT_PATTERNS.length)] });
    }
  };
  const pickColour = (c: string) => setOwn({ ...own, [slot]: c });
  const loadLaunch = async () => {
    setLerr("");
    if (!link.trim()) return;
    setLbusy(true);
    try {
      const l = await api.token(link);
      setLaunch(l);
      setUseBadge(true);
      // his kit in the launch's colours: the two that stand furthest apart in light
      const ps = l.pal.slice(2, 14);
      setOwn({ a: ps[Math.floor(ps.length * 0.7)] || l.pal[10], b: ps[1] || l.pal[2], p: own.p });
      setMode("own");
    } catch (e) {
      setLerr((e as Error).message);
    } finally {
      setLbusy(false);
    }
  };
  const put = async (e: Event) => {
    e.preventDefault();
    setErr("");
    if (!name.trim()) {
      setErr("he needs a name");
      (document.getElementById("ed-name") as HTMLInputElement | null)?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await api.put({ v, kit, name, cap, token: launch?.token, badge: !!badge, addr: addr || undefined });
      setDone(r.man);
      p.onPlaced(r.man);
    } catch (e2) {
      setErr((e2 as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const save = async () => {
    if (!done) return;
    setSaving(true);
    try {
      const r = await fetch(portraitUrl(done.id));
      if (!r.ok) throw new Error();
      const url = URL.createObjectURL(await r.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = `kicker-${String(done.n).padStart(4, "0")}.png`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 4000);
    } catch {
      window.open(portraitUrl(done.id), "_blank", "noopener");
    } finally {
      setSaving(false);
    }
  };
  const thumbs = useMemo(() => Array.from({ length: SET_SIZE }, (_, i) => i + 1), []);

  return (
    <div class="ed-in">
      <Stage v={v} kit={kit} name={name} cap={cap} kick={done ? `${manNo(done.n)} · ${dayLong(done.day)}` : `${setNo(v)} · ${fam.name} · today's rod`} />

      {done ? (
        <div class="ed-tools ed-done">
          <header class="ed-head">
            <h2 id="ed-title">he is on the rod.</h2>
            <button type="button" class="x" onClick={p.onClose} aria-label="Close">
              close
            </button>
          </header>
          <p class="lede">
            {done.name} stands on today's rod. {setNo(v)} is in the album now, if nobody beat you to him. tomorrow he is part of the table, and he stays there. he will only ever move sideways.
          </p>
          <figure class="ed-portrait">
            <img src={portraitUrl(done.id)} width={1080} height={1350} alt={`${done.name}, ${setNo(v)}, on the brass rod: his plate`} />
          </figure>
          <div class="ed-acts">
            <button type="button" class="b1" onClick={save} disabled={saving}>
              {saving ? "saving…" : "Save image"}
            </button>
            <button type="button" class="b2" onClick={() => p.onSee(done)}>
              see him on the table
            </button>
            <a class="b3" href={`/m/${done.id}`}>
              his page
            </a>
          </div>
        </div>
      ) : (
        <form class="ed-tools" onSubmit={put} noValidate>
          <header class="ed-head">
            <h2 id="ed-title">field a kicker</h2>
            <button type="button" class="x" onClick={p.onClose} aria-label="Close">
              close
            </button>
          </header>

          <fieldset class="sec">
            <legend>
              <span class="st">1</span> the viber
            </legend>
            <div class="vrow">
              <button type="button" class="b3 arrow" onClick={() => step(-1)} aria-label="the one before">
                ←
              </button>
              <p class="vno">
                <b>{setNo(v)}</b> <span class="dim">of {SET_SIZE}</span>
              </p>
              <button type="button" class="b3 arrow" onClick={() => step(1)} aria-label="the one after">
                →
              </button>
              <button type="button" class="b2 draw" onClick={draw}>
                draw me one
              </button>
            </div>
            <div class="vgrid" ref={grid} role="group" aria-label="the set">
              {thumbs.map((n) => (
                <Thumb v={n} on={n === v} onPick={() => setV(n)} />
              ))}
            </div>
          </fieldset>

          <fieldset class="sec">
            <legend>
              <span class="st">2</span> the kit
            </legend>
            <div class="kits" role="radiogroup" aria-label="kit">
              {(
                [
                  ["home", teams[0], "today's home"],
                  ["away", teams[1], "today's away"],
                  ["own", own, launch ? `$${launch.symbol || launch.name}` : "your own"],
                ] as [KitMode, Kit, string][]
              ).map(([m, k, label]) => (
                <button type="button" role="radio" aria-checked={mode === m} class={"kit" + (mode === m ? " on" : "")} onClick={() => setMode(m)}>
                  <Jersey kit={k} css={1.75} />
                  <span>{label}</span>
                </button>
              ))}
            </div>
            {mode === "own" && (
              <div class="own">
                <div class="slots2" role="radiogroup" aria-label="paint which">
                  {(["a", "b"] as const).map((k) => (
                    <button type="button" role="radio" aria-checked={slot === k} class={"slot2" + (slot === k ? " on" : "")} onClick={() => setSlot(k)}>
                      <i style={{ background: own[k] }} />
                      {k === "a" ? "shirt" : "trim"}
                    </button>
                  ))}
                </div>
                <div class="pal" role="group" aria-label="colours">
                  {pal.map((c, i) => (
                    <button type="button" class={"sw" + (own[slot] === c ? " on" : "")} style={{ background: c }} aria-label={`colour ${i + 1}`} aria-pressed={own[slot] === c} onClick={() => pickColour(c)} />
                  ))}
                </div>
                <div class="pats" role="radiogroup" aria-label="pattern">
                  {KIT_PATTERNS.map((pt: KitPattern) => (
                    <button type="button" role="radio" aria-checked={own.p === pt} class={"pt" + (own.p === pt ? " on" : "")} title={pt} aria-label={pt} onClick={() => setOwn({ ...own, p: pt })}>
                      <Jersey kit={{ ...own, p: pt }} css={1} />
                    </button>
                  ))}
                </div>
              </div>
            )}
            <details class="launch" open={!!launch}>
              <summary>the colours of a vibe/vibe launch</summary>
              {launch ? (
                <div class="lrow">
                  <p>
                    in the colours of <b>${launch.symbol || launch.name}</b>
                  </p>
                  <label class="chk">
                    <input type="checkbox" checked={useBadge} onChange={(e) => setUseBadge((e.target as HTMLInputElement).checked)} disabled={!launch.badge.px} />
                    <span>keep its picture with him</span>
                  </label>
                  <button type="button" class="b3" onClick={() => setLaunch(null)}>
                    back to the house colours
                  </button>
                </div>
              ) : (
                <div class="lrow">
                  <label class="fld grow">
                    <span>token link</span>
                    <input value={link} placeholder="testnet.vibevibe.fun/token/0x…" autoComplete="off" spellcheck={false} onInput={(e) => setLink((e.target as HTMLInputElement).value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), void loadLaunch())} />
                  </label>
                  <button type="button" class="b2" onClick={loadLaunch} disabled={lbusy || !link.trim()}>
                    {lbusy ? "looking…" : "use its colours"}
                  </button>
                </div>
              )}
              {lerr && <p class="err">{lerr}</p>}
            </details>
          </fieldset>

          <fieldset class="sec">
            <legend>
              <span class="st">3</span> who he is
            </legend>
            <label class="fld">
              <span>name</span>
              <input id="ed-name" value={name} maxLength={NAME_MAX} autoComplete="off" spellcheck={false} placeholder="ferro" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
              <small>{NAME_MAX - name.length}</small>
            </label>
            <label class="fld">
              <span>his line</span>
              <input id="ed-cap" value={cap} maxLength={CAP_MAX} autoComplete="off" placeholder="sideways is still a direction" onInput={(e) => setCap((e.target as HTMLInputElement).value)} />
              <small>{CAP_MAX - cap.length}</small>
            </label>
          </fieldset>

          <fieldset class="sec opt">
            <legend>
              the gold <em>optional</em>
            </legend>
            {addr ? (
              <p class="gold">
                {holder === true
                  ? "this address holds $KICKER. he stands on the gold part of the rod."
                  : holder === false
                    ? "no $KICKER at this address. he stands on the brass, like most of us."
                    : "checking $KICKER at this address…"}{" "}
                <button type="button" class="b3" onClick={() => void signOut()}>
                  sign out
                </button>
              </p>
            ) : (
              <p class="gold">
                holders of $KICKER stand on a gold stretch of the rod. it is only paint.{" "}
                {PARA.available ? (
                  <button type="button" class="b3" onClick={() => signIn().catch((e) => setErr((e as Error).message))}>
                    sign in
                  </button>
                ) : (
                  <span class="dim">sign-in is resting today.</span>
                )}
              </p>
            )}
          </fieldset>

          <div class="ed-foot">
            {err && (
              <p class="err" role="alert">
                {err}
              </p>
            )}
            <button type="submit" class="b1" disabled={busy}>
              {busy ? "bolting him on…" : "put him on the rod"}
            </button>
            <p class="dim">three a day from one place. he stays on the table.</p>
          </div>
        </form>
      )}
    </div>
  );
}

let dlg: HTMLDialogElement | null = null;
export function openEditor(p: Omit<Props, "onClose">) {
  if (!dlg) {
    dlg = document.createElement("dialog");
    dlg.className = "ed";
    dlg.setAttribute("aria-labelledby", "ed-title");
    document.body.appendChild(dlg);
    dlg.addEventListener("close", () => {
      render(null, dlg!);
      document.documentElement.classList.remove("ed-open");
      if (location.hash === "#make") history.replaceState(null, "", location.pathname + location.search);
    });
    dlg.addEventListener("click", (e) => {
      if (e.target === dlg) dlg!.close();
    });
  }
  const d = dlg;
  render(<Editor {...p} onClose={() => d.close()} />, d);
  document.documentElement.classList.add("ed-open");
  d.showModal();
}
export const closeEditor = () => dlg?.open && dlg.close();
