import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import {
  arcPoints,
  ballsAt,
  autoArcSpacing,
  KALVAN_ARC_SPACING,
  START_SITESWAP,
  START_SPEED,
  START_TRACE,
  START_ZONES,
  DEFAULT_PARAMS,
  handAt,
  nearestFeasible,
  optimalLayouts,
  parseSiteswap,
  tubes,
  type Layout,
  type Params,
  type Pattern,
} from "./model";
import "./optimal.css";

const EXAMPLES = ["3", "5", "6", "7", "531", "441", "55500", "b97531", "(4,2x)*", "(6x,4)*", "[54]24"];
// the speed slider runs on a log scale from 1/128 to full, as his Speed menu did (full, 1/2, 1/4 ... 1/128)
const SPEED_MIN_LOG = -7;
const speedLabel = (v: number) => {
  const k = Math.log2(v);
  if (Math.abs(k - Math.round(k)) < 1e-6) return k === 0 ? "full" : `1/${2 ** -Math.round(k)}`;
  return `${v.toFixed(v < 0.1 ? 3 : 2)}×`;
};

const pathOf = (ss: string) => "/" + encodeURI(ss);

/** Jack Kalvan's Optimal Juggler, for any siteswap: his inputs and readout, the pattern animated in a flat front
 *  view, and our tubes view of how close the balls come (docs/optimal-juggling.md in passing-pattern-parser, steps a and b). */
export default function Optimal() {
  const { ss } = useParams();
  const text = ss ?? START_SITESWAP;
  const nav = useNavigate();
  const [draft, setDraft] = useState(text);
  useEffect(() => setDraft(text), [text]);
  const [params, setParams] = useState<Params>(DEFAULT_PARAMS);
  const [view, setView] = useState<"anim" | "tubes">("anim");
  const [tubeMode, setTubeMode] = useState<"spacetime" | "space">("spacetime");
  const [trace, setTrace] = useState(START_TRACE);
  const [zones, setZones] = useState(START_ZONES);
  const [speed, setSpeed] = useState(START_SPEED);
  const [paused, setPaused] = useState(false);
  const clock = useRef(0);
  const [sel, setSel] = useState<number | null>(null);
  const [openSettings] = useState(() => typeof window === "undefined" || window.innerWidth >= 900);
  const parsed = useMemo((): { pat?: Pattern; err?: string } => {
    try {
      return { pat: parseSiteswap(text) };
    } catch (e) {
      return { err: (e as Error).message };
    }
  }, [text]);
  // Several clear layouts (options A, B, ...: lowest cost first; Kalvan's own patterns have one). The one the reader
  // picks is followed while the settings move: it is passed back to the search as a start ("previous"), and the option
  // that search ends in stays selected; if it no longer clears, A is shown and the messages say so.
  const [picked, setPicked] = useState<Layout | null>(null);
  // the letter it had when it was chosen (the options are re-ranked as the settings move)
  const [pickedAs, setPickedAs] = useState(0);
  const pickedRef = useRef<Layout | null>(null);
  useEffect(() => {
    pickedRef.current = picked;
  }, [picked]);
  // (the search can take most of a second for long patterns: the sliders move first, the drawing follows)
  const dparams = useDeferredValue(params);
  const options = useMemo(
    () => (parsed.pat ? optimalLayouts(parsed.pat, dparams, { hint: pickedRef.current }) : null),
    [parsed, dparams],
  );
  if (picked && picked.pattern.text !== parsed.pat?.text) setPicked(null);
  let choice = 0;
  let lost = false;
  const letter = (k: number) => "ABCDEFGH"[k];
  if (options && picked && picked.pattern.text === parsed.pat?.text) {
    const k = options.includes(picked)
      ? options.indexOf(picked)
      : options.findIndex((o) => o.option.starts.includes("previous"));
    if (k >= 0) {
      choice = k;
      if (options[k] !== picked) setPicked(options[k]);
    } else lost = true;
  }
  const fresh = options ? options[choice] : null;
  const moved = !!picked && !lost && choice !== pickedAs;
  // (a siteswap that does not parse keeps the last drawing on the page, so the layout stays put while the error shows)
  const [kept, setKept] = useState<Layout | null>(null);
  if (fresh && fresh !== kept) setKept(fresh);
  const lay = fresh ?? kept;
  const [feasible, setFeasible] = useState<{ key: string; v: ReturnType<typeof nearestFeasible> } | null>(
    null,
  );
  const fkey = text + JSON.stringify(params);
  const set = (k: keyof Params) => (v: number) => setParams((p) => ({ ...p, [k]: v }));
  const go = (s: string) => nav(pathOf(s));
  const r = lay?.readout;
  const period = lay?.period ?? 0;
  useEffect(() => {
    // space plays / pauses, left and right nudge the time by a frame (not while typing or on a control that uses the key)
    if (!period) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const el = e.target as HTMLElement | null;
      const tag = el?.tagName ?? "";
      const scrub = el?.classList?.contains("oj-scrub");
      if (e.key === " " || e.code === "Space") {
        if (!scrub && ["INPUT", "SELECT", "TEXTAREA", "BUTTON", "A", "SUMMARY"].includes(tag)) return;
        e.preventDefault();
        setPaused((p) => !p);
      } else if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
        if (!scrub && ["INPUT", "SELECT", "TEXTAREA"].includes(tag)) return;
        e.preventDefault();
        setPaused(true);
        setSel(null);
        const d = (e.key === "ArrowRight" ? 1 : -1) / 60;
        clock.current = (((clock.current + d) % period) + period) % period;
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [period]);
  const uniform = parsed.pat?.uniform ?? null;

  return (
    <section className="oj">
      <h1>Optimal juggling</h1>
      <p className="muted oj-intro">
        Jack Kalvan's spatially optimal patterns: every ball keeps the same margin (the error zone) from every
        other, with the least height and hand movement. His cascade and fountain, and any other siteswap laid
        out by a search on the same terms.
      </p>
      <form
        className="bar"
        onSubmit={(e) => {
          e.preventDefault();
          go(draft.trim() || START_SITESWAP);
        }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder="siteswap: 5, 531, (4,2x)*, [54]24"
          aria-label="siteswap"
          spellCheck={false}
          autoCapitalize="off"
        />
        <button className="btn primary" type="submit">
          Show
        </button>
      </form>
      <div className="oj-examples">
        {EXAMPLES.map((e) => (
          <Link key={e} to={pathOf(e)} className={"chip" + (e === text ? " on" : "")}>
            {e}
          </Link>
        ))}
      </div>
      <p className="error oj-err" role="status">
        {parsed.err ?? ""}
      </p>
      {lay && r && (
        <div className="oj-grid">
          <div className="oj-stagecol">
            <div className="card oj-card">
              <div className="oj-tools">
                <div className="seg">
                  <button className={view === "anim" ? "on" : ""} onClick={() => setView("anim")}>
                    Animation
                  </button>
                  <button className={view === "tubes" ? "on" : ""} onClick={() => setView("tubes")}>
                    Tubes
                  </button>
                </div>
                <div className={"seg" + (view === "tubes" ? "" : " off")}>
                  <button
                    className={tubeMode === "spacetime" ? "on" : ""}
                    disabled={view !== "tubes"}
                    onClick={() => setTubeMode("spacetime")}
                    title="coloured by the nearest ball at the same instant"
                  >
                    space-time
                  </button>
                  <button
                    className={tubeMode === "space" ? "on" : ""}
                    disabled={view !== "tubes"}
                    onClick={() => setTubeMode("space")}
                    title="coloured by the nearest other arc, at any time"
                  >
                    space only
                  </button>
                </div>
                <label className="oj-check">
                  <input type="checkbox" checked={trace} onChange={(e) => setTrace(e.target.checked)} /> Show
                  trace
                </label>
                <label className="oj-check">
                  <input type="checkbox" checked={zones} onChange={(e) => setZones(e.target.checked)} /> Show
                  error zones
                </label>
              </div>
              <div className="oj-options" role="radiogroup" aria-label="layouts">
                {(fresh && options ? options : []).map((o, k) => (
                  <button
                    key={k}
                    type="button"
                    role="radio"
                    aria-checked={k === choice}
                    className={"chip oj-option" + (k === choice ? " on" : "")}
                    title={
                      `closest approach ${(o.minSeparation * 100).toFixed(1)} cm, hand travel ${o.option.travel.toFixed(2)} m per period ` +
                      `(catch to next throw), ${o.option.points} catch and throw points, highest ${o.option.maxHeight.toFixed(2)} m` +
                      (o.searched
                        ? `; found from: ${o.option.starts.join(", ")}`
                        : "; Kalvan's own, no search")
                    }
                    onClick={() => {
                      setPicked(k === 0 ? null : o);
                      setPickedAs(k);
                    }}
                  >
                    <span className="oj-option-name">
                      {o.searched ? `Layout ${letter(k)}` : "Kalvan's own"}
                    </span>
                    <span className="oj-option-nums">
                      {Number.isFinite(o.minSeparation) ? (o.minSeparation * 100).toFixed(1) : "—"} cm ·{" "}
                      {o.option.travel.toFixed(2)} m · {o.option.maxHeight.toFixed(2)} m
                    </span>
                  </button>
                ))}
                <span className="oj-option-key muted">closest · hand travel · height</span>
              </div>
              <Stage
                lay={lay}
                view={view}
                tubeMode={tubeMode}
                trace={trace}
                zones={zones}
                speed={paused ? 0 : speed}
                rate={speed}
                setRate={setSpeed}
                paused={paused}
                clock={clock}
                setPaused={setPaused}
                sel={sel}
                setSel={setSel}
              />
              <div className="oj-legend">
                <span className="oj-sw" style={{ background: nearColour(0.9) }} /> inside the error zone
                <span className="oj-sw" style={{ background: nearColour(1.1) }} /> grazing
                <span className="oj-sw" style={{ background: nearColour(2) }} /> clear (2× the zone or more)
                <span className="muted oj-legend-note">
                  {view === "anim"
                    ? "error zones: nearest ball at this instant"
                    : tubeMode === "spacetime"
                      ? "tubes: nearest ball at the same instant; ′ = the same throw, a period later"
                      : "tubes: nearest other arc, any time; ′ = the same throw, a period later"}
                </span>
              </div>
            </div>
          </div>
          <div className="oj-side">
            <details className="card oj-settings" open={openSettings}>
              <summary>
                <h2>Settings</h2>
                <span className="muted">
                  dwell {params.dwellRatio.toFixed(2)} · hand {params.handPeriod.toFixed(2)} s · zone{" "}
                  {(params.errorZone * 100).toFixed(0)} cm
                </span>
              </summary>
              <Ctl
                label="gravity"
                unit="m/s²"
                value={params.g}
                min={1}
                max={25}
                step={0.1}
                dp={2}
                on={set("g")}
              />
              <div className="oj-row">
                <span className="oj-lab">
                  balls = <b>{lay.pattern.balls}</b>
                </span>
                {uniform ? (
                  <span className="oj-pm">
                    <button
                      className="btn"
                      disabled={uniform <= 1}
                      onClick={() => go((uniform - 1).toString(36))}
                    >
                      −
                    </button>
                    <button
                      className="btn"
                      disabled={uniform >= 35}
                      onClick={() => go((uniform + 1).toString(36))}
                    >
                      +
                    </button>
                  </span>
                ) : (
                  <span className="muted oj-note">from the siteswap</span>
                )}
              </div>
              <Ctl
                label="dwell ratio"
                value={params.dwellRatio}
                min={0.05}
                max={0.99}
                step={0.01}
                dp={2}
                on={set("dwellRatio")}
              />
              <Ctl
                label="hand period"
                unit="s"
                value={params.handPeriod}
                min={0.2}
                max={1.2}
                step={0.01}
                dp={2}
                on={set("handPeriod")}
              />
              <Ctl
                label="ball diameter"
                unit="cm"
                scale={100}
                value={params.ballDiameter}
                min={0.02}
                max={0.3}
                step={0.01}
                dp={0}
                on={(v) => setParams((p) => ({ ...p, ballDiameter: v, errorZone: Math.max(p.errorZone, v) }))}
              />
              <Ctl
                label="error zone diameter"
                unit="cm"
                scale={100}
                value={params.errorZone}
                min={Math.max(0.05, params.ballDiameter)}
                max={0.6}
                step={0.01}
                dp={0}
                on={set("errorZone")}
              />
              {r.arcSpacingAdjustable ? (
                <Ctl
                  label="distance between arcs"
                  unit="m"
                  value={params.arcSpacing ?? r.arcSpacing}
                  min={0}
                  max={2}
                  step={0.01}
                  dp={2}
                  on={set("arcSpacing")}
                  extra={
                    <>
                      <button
                        className="chip"
                        title="the distance on Kalvan's six-ball screen"
                        onClick={() => setParams((p) => ({ ...p, arcSpacing: undefined }))}
                      >
                        {KALVAN_ARC_SPACING} m
                      </button>
                      <button
                        className="chip"
                        title="the smallest spacing at which no two balls, in the air or in the hands, come closer than the error zone"
                        onClick={() =>
                          setParams((p) => ({ ...p, arcSpacing: autoArcSpacing(lay.pattern.balls, p) }))
                        }
                      >
                        smallest that clears
                      </button>
                    </>
                  }
                />
              ) : (
                <div className="oj-row oj-arcrow">
                  <span className="oj-lab">
                    distance between arcs = <b>{r.arcSpacing.toFixed(2)}</b> m
                  </span>
                </div>
              )}
              <button
                className="chip"
                title="What his program starts with (INIT): 7 balls, g 9.8, dwell ratio 0.66, hand period 0.40 s, ball 10 cm, error zone 25 cm, full speed, trace and error zones off; the fountain spacing is his cascade's P"
                onClick={() => {
                  setParams(DEFAULT_PARAMS);
                  setTrace(START_TRACE);
                  setZones(START_ZONES);
                  setSpeed(START_SPEED);
                  if (text !== START_SITESWAP) go(START_SITESWAP);
                }}
              >
                Kalvan's defaults
              </button>
            </details>
            <div className="card oj-read">
              <h2>Readout</h2>
              <p className="muted oj-readsub">
                {r.shape === "general" ? `as his ${lay.pattern.balls}-ball ${lay.kalvan.shape}` : ""}
              </p>
              <dl>
                <Out k="flight distance" v={r.flightDistance} u="m" />
                <Out k="balls in flight per arc" v={r.ballsPerArc} />
                <Out k="throw height" v={r.throwHeight} u="m" />
                <Out k="flight time" v={r.flightTime} u="s" />
                <Out k="dwell time" v={r.dwellTime} u="s" />
                <Out k="hand move: distance" v={r.handMove} u="m" />
                <Out k="angle" v={r.handAngle} u="°" sub />
                <Out k="throw: velocity" v={r.throwVelocity} u="m/s" />
                <Out k="angle" v={r.throwAngle} u="°" sub />
                <Out k="hand travel per period" v={lay.option.travel} u="m" />
                <Out k="catch and throw points" v={lay.option.points} dp={0} />
              </dl>
              <p className="oj-min">
                closest approach{" "}
                <b>
                  {Number.isFinite(lay.minSeparation) ? (lay.minSeparation * 100).toFixed(1) + " cm" : "—"}
                </b>
                {lay.approaches.length > 0 && (
                  <span className="muted">
                    {" "}
                    ({[...lay.approaches].sort((a, b) => a.dist - b.dist)[0].pair})
                  </span>
                )}
              </p>
              <h3>messages</h3>
              <div className={"oj-msg" + (lay.collisions.length ? " bad" : "")}>
                {lost && <p>The layout you chose no longer clears at these settings; showing A.</p>}
                {moved && (
                  <p>
                    The layout you chose ({letter(pickedAs)}) is {letter(choice)} at these settings
                    {choice === 0 ? " (the search from it ends at the lowest cost)" : " (re-ranked)"}.
                  </p>
                )}
                {lay.messages.length
                  ? lay.messages.map((m) => <p key={m}>{m}</p>)
                  : !lost && !moved && <p className="muted">none</p>}
                {lay.notes.map((m) => (
                  <p key={m} className="muted">
                    {m}
                  </p>
                ))}
                {lay.collisions.length > 0 &&
                  (feasible?.key === fkey ? (
                    <p>
                      Nearest feasible:{" "}
                      {[
                        feasible.v.handPeriod !== undefined &&
                          `hand period ${feasible.v.handPeriod.toFixed(2)} s`,
                        feasible.v.dwellRatio !== undefined &&
                          `dwell ratio ${feasible.v.dwellRatio.toFixed(2)}`,
                        feasible.v.arcSpacing !== undefined &&
                          `distance between arcs ${feasible.v.arcSpacing.toFixed(2)} m`,
                        feasible.v.errorZone !== undefined &&
                          `error zone ${(feasible.v.errorZone * 100).toFixed(0)} cm`,
                      ]
                        .filter(Boolean)
                        .join(", or ") || "none found nearby"}
                      .
                    </p>
                  ) : (
                    <button
                      className="chip"
                      onClick={() => setFeasible({ key: fkey, v: nearestFeasible(lay.pattern, params) })}
                    >
                      find the nearest feasible values
                    </button>
                  ))}
              </div>
            </div>
          </div>
          {r.shape === "general" && <ThrowTable lay={lay} />}
        </div>
      )}
      <div className="card oj-credit">
        <h2>After Jack Kalvan</h2>
        <p>
          The equations and the idea are Jack Kalvan's: "Optimal Juggling: The Analysis and Over-analysis of
          Juggling Patterns" (1996),{" "}
          <a href="http://juggling.org/papers/OJ/" target="_blank" rel="noopener">
            juggling.org/papers/OJ ↗
          </a>
          , and his program Optimal Juggler 4.0 (1996, for the Mac), whose controls, readout, Show Trace and
          Show Error Zones this page follows. For the cascade and the fountain the numbers are his, and so is
          the hand's path: a cubic curve from the catch point, leaving with the ball's arriving velocity, to
          the throw point, with the throw velocity (read from his program). The rest is ours: other siteswaps
          placed by a search that keeps every pair of balls in flight at least the error zone apart, the
          closest approaches worked out exactly (with the same gravity two balls see each other move in a
          straight line), and the tubes.
        </p>
        <p className="muted">
          A flat front view: x across, height up, no depth. Zips, 2x and other throws too short for the dwell
          get a fixed short flight and are left out of the search and the check, as are balls held in a hand.
          Passing patterns come next.
        </p>
      </div>
    </section>
  );
}

function Ctl({
  label,
  unit,
  value,
  min,
  max,
  step,
  dp,
  scale = 1,
  on,
  extra,
}: {
  label: string;
  unit?: string;
  value: number;
  min: number;
  max: number;
  step: number;
  dp: number;
  scale?: number;
  on: (v: number) => void;
  extra?: React.ReactNode;
}) {
  const clamp = (v: number) => Math.min(max, Math.max(min, Math.round(v / step) * step));
  return (
    <div className="oj-row oj-ctl">
      <span className="oj-lab">
        {label} = <b>{(value * scale).toFixed(dp)}</b> {unit}
        {extra ? <> {extra}</> : null}
      </span>
      <span className="oj-pm">
        <button className="btn" aria-label={`${label} down`} onClick={() => on(clamp(value - step))}>
          −
        </button>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          aria-label={label}
          onChange={(e) => on(clamp(+e.target.value))}
        />
        <button className="btn" aria-label={`${label} up`} onClick={() => on(clamp(value + step))}>
          +
        </button>
      </span>
    </div>
  );
}

function Out({ k, v, u, sub, dp = 2 }: { k: string; v: number; u?: string; sub?: boolean; dp?: number }) {
  return (
    <div className={"oj-out" + (sub ? " sub" : "")}>
      <dt>{k}</dt>
      <dd>
        {Number.isFinite(v) ? v.toFixed(dp) : "—"} {u}
      </dd>
    </div>
  );
}

function ThrowTable({ lay }: { lay: Layout }) {
  return (
    <div className="card oj-throws">
      <h2>Throws</h2>
      <div className="oj-tablewrap">
        <table>
          <thead>
            <tr>
              <th>throw</th>
              <th>flight s</th>
              <th>height m</th>
              <th>from x m</th>
              <th>to x m</th>
              <th>velocity m/s</th>
              <th>angle °</th>
            </tr>
          </thead>
          <tbody>
            {lay.throws.map((t) => (
              <tr key={t.i}>
                <td>
                  {t.label}
                  {t.kind !== "throw" && (
                    <span className="muted"> ({t.kind === "hold" ? "held" : "short"})</span>
                  )}
                </td>
                <td>{t.flight.toFixed(2)}</td>
                <td>{t.kind === "hold" ? "—" : t.height.toFixed(2)}</td>
                <td>{t.launch.x.toFixed(2)}</td>
                <td>{t.land.x.toFixed(2)}</td>
                <td>{t.kind === "hold" ? "—" : t.velocity.toFixed(2)}</td>
                <td>{t.kind === "hold" ? "—" : t.angle.toFixed(1)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="cap">
        Labels: value, hand, beat. x from the middle, right positive; angles from vertical, positive outward.
      </p>
    </div>
  );
}

/** cool = clear, warm = inside the error zone: by the nearest distance as a multiple of the zone */
function nearColour(ratio: number, alpha = 1) {
  const a = alpha < 1 ? ` / ${alpha}` : "";
  if (ratio < 1) return `hsl(4 78% 52%${a})`;
  const u = Math.min(1, (ratio - 1) / 1);
  return `hsl(${38 + u * 172} ${85 - u * 20}% ${52 - u * 4}%${a})`;
}

/** The drawing: static layers (traces, tubes, marks) from React; balls, zones and hands moved by requestAnimationFrame
 *  through refs, as Player does, so nothing re-renders per frame. */
function Stage({
  lay,
  view,
  tubeMode,
  trace,
  zones,
  speed,
  rate,
  setRate,
  paused,
  clock,
  setPaused,
  sel,
  setSel,
}: {
  lay: Layout;
  view: "anim" | "tubes";
  tubeMode: "spacetime" | "space";
  trace: boolean;
  zones: boolean;
  speed: number;
  rate: number;
  setRate: (v: number) => void;
  paused: boolean;
  clock: React.MutableRefObject<number>;
  setPaused: (p: boolean) => void;
  sel: number | null;
  setSel: (k: number | null) => void;
}) {
  const ballRefs = useRef<(SVGCircleElement | null)[]>([]);
  const zoneRefs = useRef<(SVGCircleElement | null)[]>([]);
  const handRefs = useRef<(SVGRectElement | null)[]>([]);
  const rangeRef = useRef<HTMLInputElement | null>(null);
  const timeRef = useRef<HTMLSpanElement | null>(null);
  const zonesRef = useRef(zones);
  const hlRef = useRef<{ i: number; j: number } | null>(null);
  const speedRef = useRef(speed);
  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);
  useEffect(() => {
    zonesRef.current = zones;
  }, [zones]);
  const D = lay.params.errorZone;
  const br = lay.params.ballDiameter / 2;
  const hs = 0.07;
  const box = useMemo(() => {
    let x0 = Infinity;
    let x1 = -Infinity;
    let y1 = 0;
    for (const t of lay.throws) {
      for (const p of [t.launch, t.land]) {
        x0 = Math.min(x0, p.x);
        x1 = Math.max(x1, p.x);
      }
      y1 = Math.max(y1, t.launch.y + t.height);
    }
    const pad = D / 2 + 0.06;
    const w = Math.max(x1 - x0 + 2 * pad, 0.9);
    const cx = (x0 + x1) / 2;
    const top = y1 + pad;
    // the hands dip under the throw point (Kalvan's curve): keep the lowest point of either hand in view
    let low = 0;
    for (let k = 0; k < 120; k++)
      for (const h of ["L", "R"] as const) low = Math.min(low, handAt(lay, h, (k / 120) * lay.period).y);
    const bottom = Math.min(-(br + hs + 0.08), low - (br + hs + 0.08));
    const h = Math.max(top - bottom, w * 0.6);
    return { x: cx - w / 2, y: -(bottom + h), w, h };
  }, [lay, D, br]);
  const arcs = useMemo(
    () =>
      lay.throws
        .filter((t) => t.kind !== "hold" && t.flight > 0)
        .map((t) => ({
          t,
          d:
            "M" +
            arcPoints(lay, t)
              .map((p) => `${p.x.toFixed(4)},${(-p.y).toFixed(4)}`)
              .join("L"),
        })),
    [lay],
  );
  const tubeData = useMemo(() => (view === "tubes" ? tubes(lay, tubeMode) : []), [lay, view, tubeMode]);
  const marks = useMemo(() => {
    if (!lay.approaches.length) return [];
    const sorted = [...lay.approaches].sort((a, b) => a.dist - b.dist);
    const lim = Math.max(lay.minSeparation + 0.002, D - 1e-4);
    return sorted.filter((a, k) => k === 0 || a.dist <= lim).slice(0, 5);
  }, [lay, D]);
  const cur = sel !== null && sel < marks.length ? marks[sel] : null;
  useEffect(() => {
    hlRef.current = cur ? { i: cur.i, j: cur.j } : null;
  }, [cur]);
  useEffect(() => setSel(null), [lay, setSel]);
  const pick = (k: number) => {
    if (!marks.length) return;
    const m = marks[(k + marks.length) % marks.length];
    setSel(marks.indexOf(m));
    setPaused(true);
    clock.current = m.t;
  };
  const step = (d: number) => pick(sel === null ? (d > 0 ? 0 : -1) : sel + d);
  const beat = lay.period / lay.pattern.period;
  const n = lay.pattern.balls;
  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = Math.min(0.1, (now - last) / 1000);
      last = now;
      const T = lay.period;
      clock.current = (((clock.current + dt * speedRef.current) % T) + T) % T;
      const s = clock.current;
      if (rangeRef.current) rangeRef.current.value = String(s);
      if (timeRef.current) timeRef.current.textContent = `${s.toFixed(2)} s · beat ${(s / beat).toFixed(2)}`;
      const hl = hlRef.current;
      const bs = ballsAt(lay, s);
      // (each ball's error zone takes the tubes' colour: by how close the nearest other ball is at this instant)
      const near = bs.map((b, k) => {
        let d = Infinity;
        bs.forEach((o, j) => {
          if (j !== k) d = Math.min(d, Math.hypot(o.p.x - b.p.x, o.p.y - b.p.y));
        });
        return d;
      });
      bs.forEach((b, k) => {
        const c = ballRefs.current[k];
        const z = zoneRefs.current[k];
        const on = !!hl && (b.i === hl.i || b.i === hl.j);
        c?.classList.toggle("hl", on);
        if (z) {
          z.style.display = zonesRef.current || on ? "" : "none";
          z.style.fill = nearColour(near[k] / D, 0.35);
        }
        z?.classList.toggle("hl", on);
        const x = b.p.x.toFixed(4);
        const y = (-b.p.y).toFixed(4);
        if (c) {
          c.setAttribute("cx", x);
          c.setAttribute("cy", y);
        }
        if (z) {
          z.setAttribute("cx", x);
          z.setAttribute("cy", y);
        }
      });
      (["L", "R"] as const).forEach((h, k) => {
        const p = handAt(lay, h, s);
        const r = handRefs.current[k];
        if (r) {
          r.setAttribute("x", (p.x - hs / 2).toFixed(4));
          r.setAttribute("y", (-(p.y - br - 0.005)).toFixed(4));
        }
      });
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [lay, br, clock, beat, D]);
  const fs = Math.max(0.028, box.w / 32);
  return (
    <div className="oj-stage">
      <svg
        viewBox={`${box.x} ${box.y} ${box.w} ${box.h}`}
        role="img"
        aria-label={`${lay.pattern.text} in a front view`}
        onClick={() => setSel(null)}
      >
        <line
          className="oj-floor"
          x1={box.x}
          x2={box.x + box.w}
          y1={box.y + box.h - 0.02}
          y2={box.y + box.h - 0.02}
        />
        {view === "tubes" &&
          tubeData.map(({ th, pts }) => (
            <g key={th.i} className="oj-tube" opacity={0.42}>
              {pts.slice(1).map((p, k) => (
                <line
                  key={k}
                  x1={pts[k].x}
                  y1={-pts[k].y}
                  x2={p.x}
                  y2={-p.y}
                  stroke={nearColour(Math.min(pts[k].near, p.near) / D)}
                  strokeWidth={D}
                  strokeLinecap="round"
                />
              ))}
            </g>
          ))}
        {(trace || view === "tubes") &&
          arcs.map(({ t, d }) => (
            <path key={t.i} d={d} className={"oj-trace" + (view === "tubes" ? " thin" : "")} />
          ))}
        {view === "tubes" &&
          marks.map((m, k) => {
            const mx = (m.a.x + m.b.x) / 2;
            const my = -(m.a.y + m.b.y) / 2;
            return (
              <g
                key={k}
                className={"oj-mark" + (m.dist < D - 1e-4 ? " bad" : "") + (k === sel ? " cur" : "")}
                onClick={(e) => {
                  e.stopPropagation(); // (a click on the drawing's background clears the selection)
                  pick(k);
                }}
              >
                <line className="hit" x1={m.a.x} y1={-m.a.y} x2={m.b.x} y2={-m.b.y} />
                <line x1={m.a.x} y1={-m.a.y} x2={m.b.x} y2={-m.b.y} />
                <circle cx={m.a.x} cy={-m.a.y} r={fs / 5} />
                <circle cx={m.b.x} cy={-m.b.y} r={fs / 5} />
                <text x={mx + fs * 0.3} y={my - fs * 0.3} fontSize={fs}>
                  {k + 1}
                </text>
              </g>
            );
          })}
        {[...Array(n)].map((_, k) => (
          <circle
            key={"z" + k}
            ref={(el) => {
              zoneRefs.current[k] = el;
            }}
            className="oj-zone"
            r={D / 2}
            cx={-9}
            cy={-9}
            style={{ display: zones ? "" : "none" }}
          />
        ))}
        {[...Array(n)].map((_, k) => (
          <circle
            key={"b" + k}
            ref={(el) => {
              ballRefs.current[k] = el;
            }}
            className={"oj-ball" + (view === "tubes" ? " faint" : "")}
            r={br}
            cx={-9}
            cy={-9}
          />
        ))}
        {[0, 1].map((k) => (
          <rect
            key={"h" + k}
            ref={(el) => {
              handRefs.current[k] = el;
            }}
            className="oj-hand"
            width={hs}
            height={hs}
            x={-9}
            y={-9}
          />
        ))}
      </svg>
      <div className="oj-transport">
        <button
          className="btn oj-play"
          onClick={() => setPaused(!paused)}
          aria-label={paused ? "play" : "pause"}
        >
          {paused ? "▶" : "❚❚"}
        </button>
        <input
          ref={rangeRef}
          className="oj-scrub"
          type="range"
          min={0}
          max={lay.period}
          step="any"
          defaultValue={clock.current}
          aria-label="time within one period"
          onInput={(e) => {
            setPaused(true);
            setSel(null);
            clock.current = +(e.target as HTMLInputElement).value;
          }}
        />
        <span ref={timeRef} className="oj-time muted" aria-live="off" />
        <span className="oj-speed">
          <input
            type="range"
            min={SPEED_MIN_LOG}
            max={0}
            step={0.25}
            value={Math.log2(rate)}
            onChange={(e) => setRate(2 ** +e.target.value)}
            aria-label="speed"
            title={`speed ${speedLabel(rate)}`}
          />
          <span className="oj-speed-label">{speedLabel(rate)}</span>
        </span>
      </div>
      <div className="oj-apphead">
        <span className="oj-cap muted">closest approaches: click one to pause there</span>
        <span className="oj-pm">
          <button
            className="btn"
            disabled={!marks.length}
            onClick={() => step(-1)}
            aria-label="previous approach"
          >
            ◂ approach
          </button>
          <button className="btn" disabled={!marks.length} onClick={() => step(1)} aria-label="next approach">
            approach ▸
          </button>
        </span>
      </div>
      <ol className="oj-marks">
        {marks.map((m, k) => (
          <li key={k} className={(m.dist < D - 1e-4 ? "bad" : "") + (k === sel ? " cur" : "")}>
            <button type="button" onClick={() => pick(k)} aria-current={k === sel}>
              {k + 1}: balls {m.pair}, <b>{(m.dist * 100).toFixed(1)} cm</b> at {m.t.toFixed(2)} s
            </button>
          </li>
        ))}
      </ol>
    </div>
  );
}
