/**
 * Optimal juggling for any siteswap: Jack Kalvan's spatially optimal cascade and fountain, generalised.
 *
 * Source: Jack Kalvan, "Optimal Juggling: The Analysis and Over-analysis of Juggling Patterns" (c) 1996,
 * http://juggling.org/papers/OJ/ , and his program Optimal Juggler 4.0 (1996). The equations marked [OJ] are his,
 * with his symbols; the rest (any siteswap, the closed-form pair check, the placement search, the tubes) is ours,
 * per passing-pattern-parser/docs/optimal-juggling.md. A flat 2-D plane: x across (right +), y up, metres, seconds.
 *
 * Pure: no DOM, no imports, only erasable TypeScript (so a test can run it with plain `node`).
 */

export type Hand = "L" | "R";

export interface Params {
  /** gravity, m/s² (Kalvan's screen: 9.80) */
  g: number;
  /** tau = d + e, the time between one hand's throws, s */
  handPeriod: number;
  /** r = d / tau */
  dwellRatio: number;
  /** the ball itself, m (drawing only) */
  ballDiameter: number;
  /** D in the equations: the ball enlarged by a safety margin, m ("a constant circular error zone around each
   *  ball can be modeled by simply adding a safety factor into the diameter of the balls" [OJ]) */
  errorZone: number;
  /** P for fountain-like patterns (even ball counts), centre to centre of the two hands' arcs, m; Kalvan's one free
   *  placement parameter there (an input on his screen, which shows 0.71 m for six balls). Unset: P as his program
   *  holds it after INIT (the cascade's P, `startArcSpacing`, which his minimum-P clamp also uses); `autoArcSpacing`
   *  finds the smallest spacing that clears instead. */
  arcSpacing?: number;
  /** scale on the hand curve's end velocities: 1 (the default) is Kalvan's cubic exactly; below 1 the hand goes less far
   *  under the line from catch to throw. Set only by the placement search, and only for patterns that are not his
   *  cascade or fountain, when his curve would carry a held ball into a flying one (see `layoutWith`). */
  handTangent?: number;
  /** balls thrown in to land in one hand together are caught one after the other, this long apart, s (see
   *  `CATCH_STAGGER`, the value when unset; 0: they land at the same instant) */
  catchStagger?: number;
}

/** A cubic Hermite curve: the hand's (or any) position a fraction `u` of the way through a time `dt`, from `a` with
 *  velocity `va` to `b` with velocity `vb`. This is Jack Kalvan's hand path (FORTH.md section 4, his DOHAND: x(u) and
 *  y(u) are cubics fixed by position and velocity at both ends, taken from the ball: the catch point with the
 *  arriving ball's velocity, the throw point with the departing ball's). His Z1..Z6 are the coefficients of exactly
 *  this curve for the cascade and the fountain (`kalvanHand` below reproduces them). No free parameter: the scoop
 *  under the chord falls out of the velocities. */
export function hermite(a: Vec, va: Vec, b: Vec, vb: Vec, dt: number, u: number): Vec {
  const h00 = 2 * u ** 3 - 3 * u ** 2 + 1;
  const h10 = u ** 3 - 2 * u ** 2 + u;
  const h01 = -2 * u ** 3 + 3 * u ** 2;
  const h11 = u ** 3 - u ** 2;
  return {
    x: h00 * a.x + h10 * va.x * dt + h01 * b.x + h11 * vb.x * dt,
    y: h00 * a.y + h10 * va.y * dt + h01 * b.y + h11 * vb.y * dt,
  };
}

/** The distance between arcs on Kalvan's six-ball screen (screenshot-2026-10-23.png), a free input in his program
 *  (a chip on the page; not his starting value). */
export const KALVAN_ARC_SPACING = 0.71;

/** P as his program holds it after INIT: INIT never stores P, but MAIN runs CALC after it, and CALC (odd count) runs
 *  CASCADE, which sets P = D sqrt(1 + (4 Vh / (g tau))^2); that value stays when the count is changed to an even one,
 *  and it is also the minimum his arrow buttons allow ("Distance between arcs is at minimum."). */
export function startArcSpacing(p: Params): number {
  const Vh = p.errorZone / p.handPeriod;
  return p.errorZone * Math.sqrt(1 + ((4 * Vh) / (p.g * p.handPeriod)) ** 2);
}

/** Everything Kalvan's program starts with, from the decompiled Forth (archive/optimal-juggler/forth-listing.txt):
 *
 *   INIT:  F# 9.8 'G F!   7 'BINT !   F# 0.66 'DR F!   F# 0.25 'DIA F!   F# 0.1 'ADIA F!   F# 0.4 'T F!
 *          362 0 DL@ D>F F# 60 F/ 'OTIME F!   S1   0 '?TR !   0 '?EZ !   -1 '?CO !
 *   MAIN:  CR SETUP INIT CALC INFO ABT HELP AXES ...   (CALC -> CASCADE sets P; AXES = Rescale)
 *
 *   | his word | value | meaning here                                         |
 *   | G        | 9.8   | gravity, m/s^2                  (g)                  |
 *   | BINT     | 7     | balls: the 7-ball cascade       (START_SITESWAP)     |
 *   | DR       | 0.66  | dwell ratio                     (dwellRatio)         |
 *   | DIA      | 0.25  | error zone diameter, m          (errorZone)          |
 *   | ADIA     | 0.1   | ball diameter, m                (ballDiameter)       |
 *   | T        | 0.4   | hand period, s                  (handPeriod)         |
 *   | S1       | 1     | speed: full (SLOW = 1)          (START_SPEED)        |
 *   | ?TR      | 0     | Show Trace off                  (START_TRACE)        |
 *   | ?EZ      | 0     | Show Error Zones off            (START_ZONES)        |
 *   | ?CO      | -1    | controls shown (Hide Controls off)                   |
 *   | P        | not set by INIT: CASCADE computes it; for even counts `startArcSpacing` (arcSpacing unset) |
 *   | Rescale  | AXES at start: fits the picture; the page always fits its pane |
 *
 * (The values he left in the file's stored state, 5 balls, g 10, r 0.68, D 0.29, tau 0.42, are overwritten by INIT.) */
export const DEFAULT_PARAMS: Params = {
  g: 9.8,
  handPeriod: 0.4,
  dwellRatio: 0.66,
  ballDiameter: 0.1,
  errorZone: 0.25,
};
export const START_SITESWAP = "7";
export const START_SPEED = 1;
export const START_TRACE = false;
export const START_ZONES = false;

export interface PatternThrow {
  /** beat, 0 <= t < period */
  t: number;
  hand: Hand;
  /** beats until this ball is thrown again */
  v: number;
  toHand: Hand;
  /** index in `throws` of the ball's next throw, and how many periods later it is */
  next: number;
  nextShift: number;
  /** index within a multiplex (0 for the first ball) */
  sib: number;
  /** written form, e.g. "5", "4x", "[3" */
  token: string;
}

export interface Pattern {
  text: string;
  sync: boolean;
  /** beats in one full cycle (both hands back where they started) */
  period: number;
  throws: PatternThrow[];
  balls: number;
  /** the throw value when every beat is the same single async throw (a cascade or fountain), else null */
  uniform: number | null;
  /** beats after which the pattern repeats mirrored (odd-period async, or sync with *), else null */
  mirrorPeriod: number | null;
  multiplex: boolean;
}

const other = (h: Hand): Hand => (h === "L" ? "R" : "L");
/** hand side: left at -x, right at +x */
const side = (h: Hand) => (h === "L" ? -1 : 1);

// ---------------------------------------------------------------------------------------------------------------
// Parsing

function valueOf(c: string): number {
  if (c >= "0" && c <= "9") return c.charCodeAt(0) - 48;
  if (c >= "a" && c <= "z") return c.charCodeAt(0) - 87;
  throw new Error(`not a throw: "${c}"`);
}

interface Raw {
  t: number;
  hand: Hand;
  v: number;
  toHand: Hand;
  token: string;
}

/** Resolve each ball's next throw and check the siteswap is jugglable (as many balls land on a hand's beat as it
 *  throws then). */
function assemble(
  text: string,
  sync: boolean,
  period: number,
  raw: Raw[],
  mirrorPeriod: number | null,
): Pattern {
  const throws = raw
    .filter((r) => r.v > 0)
    .sort((a, b) => a.t - b.t || (a.hand === b.hand ? 0 : a.hand === "L" ? -1 : 1))
    .map((r) => ({ ...r, next: -1, nextShift: 0, sib: 0 }));
  if (!throws.length) throw new Error("no throws: nothing to lay out");
  const slot = (t: number, h: Hand) => `${((t % period) + period) % period}|${h}`;
  const out = new Map<string, number[]>();
  throws.forEach((th, i) => {
    const k = slot(th.t, th.hand);
    const l = out.get(k) ?? [];
    th.sib = l.length;
    l.push(i);
    out.set(k, l);
  });
  // Which ball of a multiplex gets which throw. Arrivals at each multiplex are listed first caught first (a held ball
  // was in the hand already; balls thrown in are caught the shortest flight first, see `CATCH_STAGGER`) and its
  // throws farthest first. Pairing the two lists in order is how jugglers usually do it (the first caught is thrown
  // the farthest); of all the pairings we take the one with the most distinct orbits, that one on a tie. The lists do
  // not depend on the beat, so the two halves of a mirror-symmetric pattern always pair, and orbit, alike.
  const held = (th: Raw) => th.v === 2 && th.toHand === th.hand;
  const arrive = new Map<string, number[]>();
  [...throws.keys()]
    .sort((a, b) => +held(throws[b]) - +held(throws[a]) || throws[a].v - throws[b].v || a - b)
    .forEach((i) => {
      const land = throws[i].t + throws[i].v;
      const k = slot(land, throws[i].toHand);
      const l = arrive.get(k) ?? [];
      if (l.length >= (out.get(k)?.length ?? 0))
        throw new Error(
          `not a valid pattern: more balls land on beat ${land % period} (${throws[i].toHand}) than leave it`,
        );
      arrive.set(k, [...l, i]);
    });
  for (const [k, l] of out)
    if ((arrive.get(k)?.length ?? 0) !== l.length) throw new Error("not a valid pattern");
  // one choice (a permutation) per multiplex, shared with its mirror image
  const groups = new Map<string, string[]>();
  for (const [k, l] of out) {
    if (l.length < 2) continue;
    const th = throws[l[0]];
    const id = mirrorPeriod ? `${th.t % mirrorPeriod}|${th.t >= mirrorPeriod ? other(th.hand) : th.hand}` : k;
    groups.set(id, [...(groups.get(id) ?? []), k]);
  }
  const perms = (n: number): number[][] =>
    n <= 1
      ? [[0]]
      : perms(n - 1).flatMap((p) => [...Array(n)].map((_, at) => [...p.slice(0, at), n - 1, ...p.slice(at)]));
  const link = (choice: number[][]) => {
    const next = throws.map(() => -1);
    for (const [k, l] of out) {
      const far = [...l].sort((a, b) => throws[b].v - throws[a].v || a - b);
      const g = [...groups.values()].findIndex((ks) => ks.includes(k));
      arrive.get(k)!.forEach((i, n) => (next[i] = far[g < 0 ? n : choice[g][n]]));
    }
    return next;
  };
  const sizes = [...groups.values()].map((ks) => out.get(ks[0])!.length);
  let choices: number[][][] = [[]];
  for (const n of sizes) choices = choices.flatMap((c) => perms(n).map((p) => [...c, p]));
  // shortcut: past a few hundred pairings (several large multiplexes) only the jugglers' pairing is taken
  if (choices.length > 720) choices = [sizes.map((n) => [...Array(n).keys()])];
  let best = link(choices[0]);
  let most = new Set(orbitIds(throws, best, mirrorPeriod)).size;
  for (const c of choices.slice(1)) {
    const next = link(c);
    const n = new Set(orbitIds(throws, next, mirrorPeriod)).size;
    if (n > most) [best, most] = [next, n];
  }
  throws.forEach((th, i) => {
    th.next = best[i];
    th.nextShift = Math.round((th.t + th.v - throws[best[i]].t) / period);
  });
  const total = throws.reduce((s, th) => s + th.v, 0);
  const balls = total / period;
  if (Math.abs(balls - Math.round(balls)) > 1e-9)
    throw new Error("not a valid pattern: the average is not whole");
  const multiplex = throws.some((th) => th.sib > 0);
  const vs = new Set(throws.map((th) => th.v));
  const everyBeat = throws.length === period;
  const uniform = !sync && !multiplex && vs.size === 1 && everyBeat ? throws[0].v : null;
  return { text, sync, period, throws, balls: Math.round(balls), uniform, mirrorPeriod, multiplex };
}

/** Vanilla async (`531`, `b97531`), multiplex (`[54]24`, `[43]23`) and sync (`(4,2x)*`, `(4,4)`, `(6x,4)*`).
 *  Sync pairs are (left, right). Uppercase letters are read as lowercase. */
export function parseSiteswap(input: string): Pattern {
  const text = input.replace(/\s+/g, "").toLowerCase();
  if (!text) throw new Error("empty siteswap");
  if (text.startsWith("(")) return parseSync(text);
  const beats: { v: number; token: string }[][] = [];
  let i = 0;
  while (i < text.length) {
    const c = text[i];
    if (c === "[") {
      const end = text.indexOf("]", i);
      if (end < 0) throw new Error("unclosed [");
      const inner = text.slice(i + 1, end);
      if (!inner) throw new Error("empty multiplex");
      beats.push([...inner].map((ch) => ({ v: valueOf(ch), token: ch })));
      i = end + 1;
    } else if (c === "x") throw new Error("x belongs to sync siteswaps, like (4,2x)");
    else {
      beats.push([{ v: valueOf(c), token: c }]);
      i++;
    }
  }
  const p = beats.length;
  const period = p % 2 ? 2 * p : p;
  const raw: Raw[] = [];
  for (let b = 0; b < period; b++) {
    const hand: Hand = b % 2 ? "L" : "R";
    for (const { v, token } of beats[b % p])
      raw.push({ t: b, hand, v, toHand: v % 2 ? other(hand) : hand, token });
  }
  return assemble(text, false, period, raw, p % 2 ? p : null);
}

function parseSync(text: string): Pattern {
  let body = text;
  let star = false;
  if (body.endsWith("*")) {
    star = true;
    body = body.slice(0, -1);
  }
  const pairs = [...body.matchAll(/\(([^()]*)\)/g)].map((m) => m[1]);
  if (!pairs.length || pairs.join("").length + 2 * pairs.length !== body.length)
    throw new Error("bad sync siteswap");
  const parseHand = (s: string) => {
    const vals: { v: number; x: boolean; token: string }[] = [];
    const src = s.startsWith("[") && s.endsWith("]") ? s.slice(1, -1) : s;
    for (let i = 0; i < src.length; i++) {
      const v = valueOf(src[i]);
      const x = src[i + 1] === "x";
      if (x) i++;
      if (v % 2) throw new Error(`sync throws are even: ${v}`);
      vals.push({ v, x, token: v.toString(36) + (x ? "x" : "") });
    }
    return vals;
  };
  const rows = pairs.map((p) => {
    const parts = p.split(",");
    if (parts.length !== 2) throw new Error("a sync beat is (left,right)");
    return { L: parseHand(parts[0]), R: parseHand(parts[1]) };
  });
  const all = star ? [...rows, ...rows.map((r) => ({ L: r.R, R: r.L }))] : rows;
  const period = 2 * all.length;
  const raw: Raw[] = [];
  all.forEach((r, k) => {
    for (const hand of ["L", "R"] as Hand[])
      for (const { v, x, token } of r[hand])
        raw.push({ t: 2 * k, hand, v, toHand: x ? other(hand) : hand, token });
  });
  return assemble(text, true, period, raw, star ? rows.length * 2 : null);
}

/** The orbit of each throw (by index in `throws`): throws share an orbit when one ball makes them all in turn. The
 *  two halves of a mirror-symmetric pattern are one orbit, as on the siteswap itself (531: the 5 and the 1 share
 *  one, the 3 has its own). */
export function orbits(pat: Pattern): number[] {
  return orbitIds(
    pat.throws,
    pat.throws.map((th) => th.next),
    pat.mirrorPeriod,
  );
}

function orbitIds(throws: Raw[], next: number[], mp: number | null): number[] {
  // a throw and its mirror image (half a cycle later, from the other hand) get the same key
  const key = (i: number) => {
    const th = throws[i];
    return mp ? `${th.t % mp}|${th.t >= mp ? other(th.hand) : th.hand}|${th.v}` : `${i}`;
  };
  const ids = new Map<string, number>();
  const out = throws.map(() => -1);
  throws.forEach((_, i) => {
    if (out[i] >= 0) return;
    const cycle: number[] = [];
    for (let j = i; !cycle.includes(j); j = next[j]) cycle.push(j);
    const k = cycle.map(key).sort().join(" ");
    if (!ids.has(k)) ids.set(k, ids.size);
    for (const j of cycle) out[j] = ids.get(k)!;
  });
  return out;
}

// ---------------------------------------------------------------------------------------------------------------
// Kalvan's equations for the cascade and the fountain

export interface Kalvan {
  /** "cascade" (b odd: the balls cross) or "fountain" (b even: each hand its own arc) */
  shape: "cascade" | "fountain";
  balls: number;
  /** omega = f / tau, balls in flight per arc */
  omega: number;
  /** f, s */
  flightTime: number;
  /** d = r tau, s */
  dwellTime: number;
  /** F, m */
  flightDistance: number;
  /** H above the throw point, m */
  throwHeight: number;
  /** Vh, Vv at the throw, m/s */
  vh: number;
  vv: number;
  throwVelocity: number;
  /** degrees from vertical, + toward the thrower's own side (outward), as his screen */
  throwAngle: number;
  /** E, m, and theta, degrees up from horizontal (catch above throw) */
  handMove: number;
  handAngle: number;
  /** P, m */
  arcSpacing: number;
  /** the hand's throw point (inner) and catch point (outer) from the centre, and the catch height above the throw */
  xi: number;
  xo: number;
  dy: number;
}

/** Kalvan's optimal cascade (b odd) or fountain (b even) for b balls in two hands. */
export function kalvan(balls: number, p: Params, arcSpacing?: number): Kalvan {
  const { g, handPeriod: tau, dwellRatio: r, errorZone: D } = p;
  // [OJ] Shannon recast: b/h = omega + r, so omega = b/h - r and f = tau omega
  const omega = balls / 2 - r;
  const f = tau * omega;
  const d = r * tau;
  // [OJ] optimal arc equations: neighbours on one arc just graze, F = omega D and Vh = D / tau
  const F = omega * D;
  const Vh = D / tau;
  if (balls % 2) {
    // [OJ] cascade arc spacing P/D = sqrt((4 Vh / (g tau))^2 + 1) = sqrt((4 D / (g tau^2))^2 + 1)
    const P = D * Math.sqrt(((4 * D) / (g * tau * tau)) ** 2 + 1);
    // [OJ] optimal dwell: tan(theta) = 2 Vh^2 / (g F), E = P cos(theta)
    const theta = Math.atan((2 * Vh * Vh) / (g * F));
    const E = P * Math.cos(theta);
    const Eh = E * Math.cos(theta);
    const dy = E * Math.sin(theta);
    // the ball is thrown from the inner point, dy below the outer catch point, and lands F across:
    // xi + xo = F, xo - xi = Eh. Vv from y(f) = dy: Vv = dy / f + g f / 2 (level throws: [OJ] Vv = g f / 2).
    const xi = (F - Eh) / 2;
    const xo = (F + Eh) / 2;
    // [OJ program, FORTH.md section 3] H = ((P sin^2(theta) + F)^2 / 4) / F / tan(theta), VV = sqrt(2 g H). The ball
    // lands E sin(theta) above its launch (y(f) = (VV - g f / 2) f = YCATCH), which is the same as the line above
    // (Vv = dy / f + g f / 2); the test checks the two agree.
    const sn = Math.sin(theta);
    const H = (P * sn * sn + F) ** 2 / 4 / F / Math.tan(theta);
    const Vv = Math.sqrt(2 * g * H);
    return {
      shape: "cascade",
      balls,
      omega,
      flightTime: f,
      dwellTime: d,
      flightDistance: F,
      throwHeight: H,
      vh: Vh,
      vv: Vv,
      throwVelocity: Math.hypot(Vh, Vv),
      throwAngle: -(Math.atan2(Vh, Vv) * 180) / Math.PI,
      handMove: E,
      handAngle: (theta * 180) / Math.PI,
      arcSpacing: P,
      xi,
      xo,
      dy,
    };
  }
  // [OJ] fountain: E = F = omega D, level throw and catch, so [OJ] Vv = g f / 2 and H = g f^2 / 8
  // (the paper prints "H = g (f^2) / 2 = g [(tau omega)^2] / 8": the /2 is a typo, since f = sqrt(8 H / g))
  const P = arcSpacing ?? startArcSpacing(p);
  const Vv = (g * f) / 2;
  return {
    shape: "fountain",
    balls,
    omega,
    flightTime: f,
    dwellTime: d,
    flightDistance: F,
    throwHeight: (g * f * f) / 8,
    vh: Vh,
    vv: Vv,
    throwVelocity: Math.hypot(Vh, Vv),
    throwAngle: (Math.atan2(Vh, Vv) * 180) / Math.PI,
    handMove: F,
    handAngle: 0,
    arcSpacing: P,
    xi: P / 2 - F / 2,
    xo: P / 2 + F / 2,
    dy: 0,
  };
}

/** Kalvan's stored quantities for one pattern, as his CASCADE / FOUNTAIN / DOHAND compute them (FORTH.md sections 3
 *  and 4, checked against archive/optimal-juggler/tools/oj_hand.py): the throw and catch points of the ARC = +1 hand,
 *  the throw height and velocity, and the coefficients of his hand cubics
 *  x(u) = ((Z1 u + Z2) u + Z5) u + Z6,  y(u) = ((Z3 u + Z4) u + (VV - g f)) u + YCATCH,  u = time since the catch.
 *  `arcSpacing` is the fountain's P (his input). For the cross-check; the page draws the same curve through `hermite`. */
export function kalvanHand(balls: number, p: Params, arcSpacing = KALVAN_ARC_SPACING) {
  const { g, handPeriod: tau, dwellRatio: r, errorZone: D } = p;
  const omega = balls / 2 - r;
  const d = r * tau;
  const f = omega * tau;
  const F = omega * D;
  let VH = F / f;
  let TANO = 0;
  let P = arcSpacing;
  let E = F;
  let VV = (g / 2) * f;
  let H = (VV * f) / 4;
  let XTHROW = (P - E) / 2;
  let XCATCH = XTHROW + F;
  let YCATCH = 0;
  let Z1: number, Z2: number, Z3: number, Z4: number, Z5: number, Z6: number;
  if (balls % 2) {
    VH = -VH;
    TANO = -VH / (g / 2) / f;
    const PD = Math.sqrt((2 * TANO * omega) ** 2 + 1);
    P = PD * D;
    E = P * Math.cos(Math.atan(TANO));
    const sn = Math.sin(Math.atan(TANO));
    H = (P * sn * sn + F) ** 2 / 4 / F / TANO;
    VV = Math.sqrt(2 * g * H);
    XTHROW = (F - (E * E) / P) / 2;
    XCATCH = XTHROW - F;
    YCATCH = E * sn;
    Z2 = (((XTHROW + XCATCH) * 3) / d + VH) / d;
    Z1 = (VH - Z2 * d) / 1.5 / d ** 2;
    Z5 = -VH;
    Z6 = -XCATCH;
  } else {
    Z2 = ((3 * (XTHROW - XCATCH)) / d - 3 * VH) / d;
    Z1 = ((-2 / 3) * Z2) / d;
    Z5 = VH;
    Z6 = XCATCH;
  }
  Z4 = ((-3 * YCATCH) / d - (3 * VV - 2 * g * f)) / d;
  Z3 = (g * f - 2 * Z4 * d) / d ** 2 / 3;
  const handAtU = (u: number): Vec => ({
    x: ((Z1 * u + Z2) * u + Z5) * u + Z6,
    y: ((Z3 * u + Z4) * u + (VV - g * f)) * u + YCATCH,
  });
  return {
    E,
    TANO,
    P,
    H,
    VV,
    VH,
    XTHROW,
    XCATCH,
    YCATCH,
    Z1,
    Z2,
    Z3,
    Z4,
    Z5,
    Z6,
    dwell: d,
    flight: f,
    handAtU,
  };
}

/** The smallest fountain arc spacing (to the cm) at which no two balls, in flight or in the hands, come closer than
 *  the error zone. Not the default (that is `startArcSpacing`): offered as "the smallest spacing that clears". */
export function autoArcSpacing(balls: number, p: Params): number {
  const pat = parseSiteswap(balls.toString(36));
  for (let P = Math.ceil(p.errorZone * 100) / 100; P < 5; P = Math.round(P * 100 + 1) / 100) {
    const lay = layoutWith(pat, { ...p, arcSpacing: P }, false);
    if (lay.collisions.length === 0) return P;
  }
  return 5;
}

// ---------------------------------------------------------------------------------------------------------------
// The layout

export interface Vec {
  x: number;
  y: number;
}

export interface LThrow {
  i: number;
  /** e.g. "5R0": value, hand, beat (multiplex balls a, b, ...) */
  label: string;
  hand: Hand;
  toHand: Hand;
  v: number;
  /** regular: placed by the search; short: a zip or hurried throw with a fixed short flight; hold: no flight */
  kind: "throw" | "short" | "hold";
  /** launch time, s (0 <= t < period) */
  t: number;
  beat: number;
  launch: Vec;
  land: Vec;
  flight: number;
  /** above the launch point, m */
  height: number;
  vx: number;
  vy: number;
  velocity: number;
  /** degrees from vertical, + outward (toward the thrower's side) */
  angle: number;
  /** the dwell before this ball's next throw, s */
  dwellAfter: number;
  next: number;
  /** when the ball is thrown again (absolute, may be past the period) */
  nextT: number;
}

export interface HandPoint {
  t: number;
  kind: "catch" | "throw";
  p: Vec;
  /** the ball's velocity there (incoming at a catch, outgoing at a throw) */
  v: Vec;
  throwIndex: number;
}

export interface Segment {
  from: Vec;
  to: Vec;
  t0: number;
  t1: number;
}

export interface LHand {
  hand: Hand;
  /** one period of waypoints, sorted by time */
  points: HandPoint[];
  /** catch -> throw (with a ball) and throw -> catch (empty) */
  dwells: Segment[];
  returns: Segment[];
}

export interface Approach {
  i: number;
  j: number;
  pair: string;
  /** the separation this pair must keep: the error zone, or the ball diameter for balls leaving or landing together */
  need: number;
  /** involves a ball held in a hand (the dwell path), not two flights */
  inHand: boolean;
  /** seconds, folded into the period */
  t: number;
  dist: number;
  a: Vec;
  b: Vec;
}

export interface Readout {
  shape: "cascade" | "fountain" | "general";
  balls: number;
  flightDistance: number;
  ballsPerArc: number;
  throwHeight: number;
  flightTime: number;
  dwellTime: number;
  handMove: number;
  handAngle: number;
  throwVelocity: number;
  throwAngle: number;
  arcSpacing: number;
  /** "distance between arcs" is an input (fountain-like patterns) rather than derived */
  arcSpacingAdjustable: boolean;
}

export interface Layout {
  pattern: Pattern;
  params: Params;
  /** s per beat (tau / 2) */
  beat: number;
  /** s per full cycle */
  period: number;
  throws: LThrow[];
  hands: Record<Hand, LHand>;
  kalvan: Kalvan;
  readout: Readout;
  /** every pair's closest approach over one period: flight with flight (closed form) and anything involving a ball
   *  in a hand (sampled along the dwell path) */
  approaches: Approach[];
  minSeparation: number;
  /** pairs closer than they must be (`need`) */
  collisions: Approach[];
  messages: string[];
  /** not problems: how the layout departs from Kalvan's own curve, if it had to */
  notes: string[];
  /** the placement search ran (non-uniform patterns) */
  searched: boolean;
  /** how this option scores (see `searchLayouts`) */
  option: OptionInfo;
}

export interface OptionInfo {
  /** the starts whose search ended at this layout ("Kalvan" for his own patterns) */
  starts: string[];
  /** travel + the small terms below (no clearance term: every option clears, or it is the one best try) */
  cost: number;
  /** hand travel over one period, m: each catch point to that hand's next throw point, the chord (`handTravel`) */
  travel: number;
  /** distinct catch points plus distinct throw points, both hands (Kalvan's cascade: 4) */
  points: number;
  /** left/right difference of mirror-image kinds, m (0 in mirror-symmetric patterns) */
  asym: number;
  /** highest point of any flight above the throw level, m */
  maxHeight: number;
}

/** tolerance on the error zone, m (Kalvan's optimum grazes exactly) */
export const TOL = 1e-4;
/** time between the catches of balls thrown in to land in one hand together, s. Ours, found by trying: from 0.08 s the
 *  first ball is in the hand before the next comes within the error zone ([45] has no clear layout below it). */
export const CATCH_STAGGER = 0.08;
/** shortest flight treated as a real throw, s; below it (zips, 2x, hurried throws) a fixed short flight */
const F_MIN = 0.1;
/** nearest a hand's throw or catch point comes to the middle in searched layouts, m */
const HAND_GAP = 0.06;

/** sampling step of the in-hand check while searching, and for the layouts kept (`handApproaches`), s */
const SEARCH_DT = 0.004;
const FINE_DT = 0.002;
/** the cost's weights (see `rank` in `searchLayouts`): per metre of shortfall from the error zone, per distinct catch
 *  or throw point, per metre of left/right asymmetry; and per class thrown against Kalvan's orientation, first while
 *  only the normal way is tried, then when the reverse is allowed where it pays */
const W_VIOL = 1e4;
const W_POINTS = 0.05;
const W_ASYM = 0.5;
const REVERSE_HARD = 1e5;
const REVERSE_SOFT = 50;
/** two layouts are one option when every launch and landing point is within this, m */
const DEDUPE = 0.01;
/** options kept */
const MAX_OPTIONS = 4;

export interface SearchOpts {
  /** the layout shown before (the chosen option): a start for the search, so a chosen option can be followed while
   *  the settings change */
  hint?: Layout | null;
  /** false: stop at the first start that clears (one option; for the feasibility searches) */
  collect?: boolean;
  /** true: when no single path per kind of throw clears, let a kind become two alternating throws, then one per
   *  throw. Off by default: a juggler throws the same 4 the same way every time, so the closest single-path layout is
   *  shown instead, with how close it comes. */
  split?: boolean;
}

/** The default layout: for Kalvan's cascades and fountains his own, otherwise the lowest-cost clear one. */
export function optimalLayout(pattern: Pattern | string, params: Params = DEFAULT_PARAMS): Layout {
  return optimalLayouts(pattern, params)[0];
}

/** Every option the search found (at most MAX_OPTIONS, the lowest cost first; one for Kalvan's own patterns, which
 *  bypass the search, and one when nothing clears). */
export function optimalLayouts(
  pattern: Pattern | string,
  params: Params = DEFAULT_PARAMS,
  opts: SearchOpts = {},
): Layout[] {
  const pat = typeof pattern === "string" ? parseSiteswap(pattern) : pattern;
  return searchLayouts(pat, params, true, opts);
}

interface Var {
  a: number;
  c: number;
}

function layoutWith(pat: Pattern, params: Params, search: boolean): Layout {
  return searchLayouts(pat, params, search, { collect: false })[0];
}

function searchLayouts(pat: Pattern, params: Params, search: boolean, opts: SearchOpts): Layout[] {
  const { g, handPeriod: tau, dwellRatio: r, errorZone: D } = params;
  const beat = tau / 2;
  const T = pat.period * beat;
  const d0 = r * tau;
  const fountainLike = pat.balls % 2 === 0;
  const K = kalvan(pat.balls, params, fountainLike ? params.arcSpacing : undefined);
  // flights: f = v beat - d, where d = r tau is the next throw's dwell (Shannon: f + d = v beat); too short a flight
  // (zips, 2x) is fixed at F_MIN-ish and the catching hand's dwell shortens instead
  const kinds: LThrow["kind"][] = [];
  const flights: number[] = [];
  const dwells: number[] = [];
  pat.throws.forEach((th) => {
    const span = th.v * beat;
    if (th.v === 2 && th.toHand === th.hand) {
      kinds.push("hold");
      flights.push(Math.max(0, span - d0));
      dwells.push(Math.min(d0, span));
    } else if (span - d0 < F_MIN) {
      kinds.push("short");
      const f = Math.min(F_MIN, span / 2);
      flights.push(f);
      dwells.push(span - f);
    } else {
      kinds.push("throw");
      flights.push(span - d0);
      dwells.push(d0);
    }
  });
  // Balls thrown in to land in one hand together (for its next multiplex) are caught one after the other, as a juggler
  // does it: the shortest flight first, a little early and lower still, the longest last, a little late and higher,
  // the dwells taking up the difference. (Ours: on the siteswap they land on one beat. The other order, the longest
  // first, brings their heights together and clears less.)
  const stagger = Math.max(0, Math.min(params.catchStagger ?? CATCH_STAGGER, d0 / 2));
  const landing = new Map<number, number[]>();
  pat.throws.forEach((th, i) => {
    if (kinds[i] !== "throw") return;
    const k = th.next - pat.throws[th.next].sib;
    landing.set(k, [...(landing.get(k) ?? []), i]);
  });
  const straight = (i: number) => +(pat.throws[i].toHand === pat.throws[i].hand);
  for (const l of landing.values()) {
    l.sort((a, b) => pat.throws[a].v - pat.throws[b].v || straight(a) - straight(b) || b - a);
    l.forEach((i, n) => {
      const off = (n - (l.length - 1) / 2) * stagger;
      flights[i] += off;
      dwells[i] -= off;
    });
  }
  // Placement variables: one launch/landing offset per KIND of throw (throwing hand, value, destination hand, x or not),
  // shared by every occurrence in the period; in a mirror-symmetric pattern a kind and its mirror
  // image share one too (the offsets are measured from each hand's own side). A kind splits only when no shared offset
  // clears: level 1 into two alternating sub-kinds by position in the period, level 2 into one path per throw.
  const mp = pat.mirrorPeriod;
  const info = pat.throws.map((th, i) => {
    if (kinds[i] !== "throw") return null;
    const cross = th.toHand !== th.hand;
    const x = /x/.test(th.token);
    // in a mirror-symmetric pattern a kind and its mirror image (the other hand) are one kind
    const h = mp ? "*" : th.hand;
    // (a 4 thrown in a multiplex and a 4 thrown alone are one kind, as a juggler throws them: the same 4)
    const kind = `${h}|${th.v}|${cross ? "x" : "s"}|${x ? "x" : ""}`;
    const pos = mp ? th.t % mp : th.t;
    return { kind, pos, own: mp ? `${pos}|${th.sib}|${h}` : `${i}`, h, v: th.v, cross, x, sib: th.sib };
  });
  const kindNames = [...new Set(info.flatMap((q) => (q ? [q.kind] : [])))];
  /** the classes at the given split levels (kind -> 0 | 1 | 2) */
  const classesFor = (levels: Map<string, number>) => {
    const rank = new Map<string, Map<number, number>>();
    for (const k of kindNames) {
      const ps = [...new Set(info.flatMap((q) => (q && q.kind === k ? [q.pos] : [])))].sort((x, y) => x - y);
      rank.set(k, new Map(ps.map((p2, n) => [p2, n])));
    }
    const classOf: number[] = [];
    const key = new Map<string, number>();
    info.forEach((q) => {
      if (!q) return classOf.push(-1);
      const lv = levels.get(q.kind) ?? 0;
      const id =
        lv === 0
          ? q.kind
          : lv === 1
            ? `${q.kind}#${rank.get(q.kind)!.get(q.pos)! % 2}`
            : `${q.kind}@${q.own}`;
      if (!key.has(id)) key.set(id, key.size);
      classOf.push(key.get(id)!);
    });
    return { classOf, n: key.size };
  };
  // outside Kalvan's own cascade and fountain the hands keep apart: throw and catch points at least HAND_GAP from
  // the middle (his 3-ball cascade has the throw points crossing by 4 cm at the defaults; kept there, as his)
  if (!pat.uniform) K.xi = Math.max(K.xi, HAND_GAP);
  /** a start like Kalvan's: thrown from the inner point, landing one flight distance F = f D / tau away */
  const startVars = (classOf: number[], n: number, dc = 0, da = 0): Var[] => {
    const vs: Var[] = [...Array(n)].map(() => ({ a: K.xi, c: K.xo }));
    pat.throws.forEach((th, i) => {
      const c = classOf[i];
      if (c < 0) return;
      const F = (flights[i] * D) / tau;
      const cross = th.toHand !== th.hand;
      const a = da ? Math.max(HAND_GAP, K.xi + da) : K.xi;
      // the catch is outside the throw point (Kalvan's orientation), whatever the offsets
      vs[c] = { a, c: Math.max(a + 0.03, HAND_GAP, (cross ? F - K.xi : K.xi + F) + th.sib * D * 0.6 + dc) };
    });
    return vs;
  };
  // Balls that share a hand at one instant share its point: thrown together (a multiplex) they leave from the first
  // ball's launch point, and caught together (for the next multiplex) they land on the first one's landing point.
  // Two balls that leave together AND land together (the 3s of [33]) share both points too, one flying a little higher
  // (the catch stagger); with no stagger they keep their own landing points, or they would be one path.
  const launchLead = pat.throws.map((th, i) => i - th.sib);
  const slotOf = (i: number) => pat.throws[i].next - pat.throws[pat.throws[i].next].sib;
  // (whose point they share must not depend on the beat or the hand, or a mirror-symmetric pattern gets a lopsided
  // layout: the longest flight's, and of two equal ones the straight throw's)
  const landLead = pat.throws.map((th, i) => {
    let lead = i;
    pat.throws.forEach((o, j) => {
      if (kinds[j] !== "throw" || slotOf(j) !== slotOf(i)) return;
      if (launchLead[j] === launchLead[i] && !stagger) return;
      const l = pat.throws[lead];
      if (o.v > l.v || (o.v === l.v && o.toHand === o.hand && l.toHand !== l.hand)) lead = j;
    });
    return kinds[i] === "throw" ? lead : i;
  });
  // A kind keeps one launch point wherever it is thrown, alone or in a multiplex, so the kinds a multiplex joins
  // share theirs (the 3s of [43]23 all leave from where the 4 does). `launchOf` gives, per throw, the throw whose
  // class holds that shared point; splitting a kind (below) is what sets its launches apart again.
  const launchCache = new Map<number[], number[]>();
  const launchOf = (classOf: number[]) => {
    let src = launchCache.get(classOf);
    if (src) return src;
    const up = classOf.map((_, i) => i);
    const find = (c: number): number => (up[c] === c ? c : (up[c] = find(up[c])));
    launchLead.forEach((j, i) => {
      if (kinds[i] === "throw" && kinds[j] === "throw") up[find(classOf[i])] = find(classOf[j]);
    });
    src = launchLead.map((j, i) =>
      kinds[i] === "throw" && kinds[j] === "throw" ? classOf.indexOf(find(classOf[i])) : j,
    );
    launchCache.set(classOf, src);
    return src;
  };
  const build = (classOf: number[], vs: Var[], dt = SEARCH_DT) =>
    place(
      pat,
      params,
      K,
      kinds,
      flights,
      dwells,
      classOf,
      vs,
      { launch: launchOf(classOf), land: landLead },
      beat,
      dt,
    );
  const viol = (l: Placed) => {
    let v = 0;
    // linear in the shortfall (with a hair of margin), so a near-miss is never traded for less hand travel
    for (const ap of l.approaches) if (ap.dist < ap.need + 2 * TOL) v += ap.need + 2 * TOL - ap.dist;
    return v;
  };
  const unclear = (l: Placed) => l.approaches.some((a) => a.dist < a.need - TOL);
  // Kalvan's orientation: every throw (crossing or straight) leaves from the inside point and lands on the outside
  // one (his cascade: XTHROW inside, XCATCH = XTHROW - F outside; his fountain: the throw point inside of the catch
  // point). A class thrown the other way (launch farther out than the catch: a reverse cascade) costs `reverseCost`:
  // REVERSE_HARD at first, so it is used only when the normal way cannot clear (see below).
  let reverseCost = REVERSE_HARD;
  const reversed = (vs: Var[], classOf: number[]) => {
    const out = new Set<number>();
    classOf.forEach((c, i) => {
      if (c < 0) return;
      const j = launchOf(classOf)[i];
      const a = kinds[j] === "throw" ? vs[classOf[j]].a : K.xi;
      if (a >= vs[classOf[landLead[i]]].c - 1e-6) out.add(c);
    });
    return out;
  };
  // The cost (ours). Kalvan's "optimal" is the same error margin everywhere ("a chain is only as strong as its weakest
  // link" [OJ]), so clearance (every pair at least the error zone apart over flight and dwell) is the constraint, held
  // by W_VIOL; among layouts that keep it the cost orders them:
  //   travel: the hand travel over one period, each catch point to that hand's next throw point, the chord (the line
  //     his readout measures: "hand move: distance = E", FORTH.md section 4, which is this chord for his cascade);
  //   W_POINTS x the distinct catch and throw points (both hands): a juggler keeps a home catch point and a home throw
  //     point per hand, and his cascade has exactly those two per hand, E apart;
  //   W_ASYM x the left/right difference of mirror-image kinds where the pattern is not mirror symmetric (in a mirror
  //     symmetric one the shared kinds make it zero). The throw heights cannot differ between layouts: launch and
  //     landing heights are fixed (0 and Kalvan's dy), so a flight's height is set by its time alone, and the
  //     symmetry that is left to choose is in the points.
  const rank = (l: Placed, vs: Var[], classOf: number[]) =>
    l.travel + W_POINTS * l.points + W_ASYM * l.asym + reverseCost * reversed(vs, classOf).size;
  const cost = (l: Placed, vs: Var[], classOf: number[]) => W_VIOL * viol(l) + rank(l, vs, classOf);
  /** coordinate descent on the shared offsets, from one start */
  const descend = (classOf: number[], start: Var[], steps = [D / 4, D / 8, D / 16], dt = SEARCH_DT) => {
    const vs = start.map((v) => ({ ...v }));
    let cur = build(classOf, vs, dt);
    let best = cost(cur, vs, classOf);
    for (const step of steps) {
      for (let sweep = 0; sweep < 10; sweep++) {
        let moved = false;
        for (let k = 0; k < vs.length; k++)
          for (const key of ["a", "c"] as const) {
            // (a launch point another class holds, see `launchOf`: nothing to move)
            if (key === "a" && !launchOf(classOf).some((j) => kinds[j] === "throw" && classOf[j] === k))
              continue;
            let bestVal = vs[k][key];
            const cands = [-3, -2, -1, 1, 2, 3].map((m) => bestVal + m * step);
            // matching moves: this point exactly onto another kind's point, or onto the fixed points of holds and
            // short throws, so a hand can come down to one home catch point and one home throw point
            for (let j = 0; j < vs.length; j++) if (j !== k) cands.push(vs[j][key]);
            cands.push(key === "a" ? K.xi : K.xo);
            const old = vs[k][key];
            for (const val of cands) {
              if (val < HAND_GAP || val > (key === "a" ? 0.6 : 0.9) || Math.abs(val - old) < 1e-9) continue;
              vs[k][key] = val;
              const l = build(classOf, vs, dt);
              const c = cost(l, vs, classOf);
              vs[k][key] = old;
              if (c < best - 1e-9) {
                best = c;
                bestVal = val;
                cur = l;
                moved = true;
              }
            }
            vs[k][key] = bestVal;
          }
        if (!moved) break;
      }
    }
    return { vs, cur, best };
  };
  /** the previous best layout (the page passes the chosen option) as a start, if it is of this pattern */
  const hintVars = (classOf: number[], n: number): Var[] | null => {
    const h = opts.hint;
    if (!h || h.pattern.text !== pat.text || h.throws.length !== pat.throws.length) return null;
    const sum = [...Array(n)].map(() => ({ a: 0, c: 0, k: 0 }));
    h.throws.forEach((t, i) => {
      const c = classOf[i];
      if (c < 0 || t.kind !== "throw") return;
      sum[c].a += Math.abs(t.launch.x);
      sum[c].c += Math.abs(t.land.x);
      sum[c].k++;
    });
    if (sum.some((s) => !s.k)) return null;
    return sum.map((s) => ({ a: s.a / s.k, c: s.c / s.k }));
  };
  /** structurally different starts: the search ends in a different clear layout from each, and those are the options */
  const starts = (classOf: number[], n: number): [string, Var[]][] => {
    const kal = startVars(classOf, n);
    const out: [string, Var[]][] = [["Kalvan's spacing", kal]];
    const hv = hintVars(classOf, n);
    if (hv) out.push(["previous", hv]);
    out.push(["narrow", startVars(classOf, n, -0.1, 0)]);
    out.push(["wide", startVars(classOf, n, 0.2, 0.08)]);
    // each kind thrown from where Kalvan's start catches it and caught where it throws: against the orientation, so it
    // has to come back across (to a different side of the search) unless the reverse orientation is allowed
    out.push([
      "swapped",
      kal.map((v) => ({ a: Math.min(0.6, Math.max(HAND_GAP, v.c)), c: Math.max(HAND_GAP, v.a) })),
    ]);
    // straight throws in columns: caught a hair outside the point they leave
    const straight = new Set<number>();
    pat.throws.forEach((th, i) => {
      if (classOf[i] >= 0 && th.toHand === th.hand) straight.add(classOf[i]);
    });
    if (straight.size)
      out.push(["columns", kal.map((v, c) => (straight.has(c) ? { a: v.a, c: v.a + 0.03 } : { ...v }))]);
    // the earlier fall-backs, for patterns where all of the above fail
    for (const [nm, dc, da] of [
      ["wider catches", 0.3, 0.04],
      ["narrow, low throws", -0.05, -0.03],
      ["outer catches", 0.1, 0],
      ["outer throws", 0.05, 0.1],
    ] as const)
      out.push([nm, startVars(classOf, n, dc, da)]);
    return out;
  };
  interface Run {
    name: string;
    vs: Var[];
    lay: Placed;
    best: number;
  }
  const runCache = new Map<string, Run>();
  /** the search at given split levels, from every start (`all`), or until one clears (the ladder only asks that) */
  const solve = (levels: Map<string, number>, all: boolean) => {
    const { classOf, n } = classesFor(levels);
    const lk =
      [...levels]
        .map(([k, v]) => `${k}=${v}`)
        .sort()
        .join(",") +
      "|" +
      reverseCost;
    const runs: Run[] = [];
    for (const [name, vs] of starts(classOf, n)) {
      const key = lk + "|" + name;
      let run = runCache.get(key);
      if (!run) {
        const d = descend(classOf, vs);
        run = { name, vs: d.vs, lay: d.cur, best: d.best };
        runCache.set(key, run);
      }
      runs.push(run);
      if (!all && viol(run.lay) === 0) break;
    }
    const win = runs.reduce((x, y) => (y.best < x.best ? y : x));
    return { classOf, n, vs: win.vs, lay: win.lay, best: win.best, runs };
  };
  let levels = new Map<string, number>();
  let splitMsgs: string[] = [];
  const first0 = classesFor(levels);
  let finals: { name: string; starts: string[]; vs: Var[]; classOf: number[]; lay: Placed }[] = [];
  let searched = false;
  if (search && !pat.uniform && first0.n) {
    searched = true;
    const kindOfThrow = (i: number) => info[i]?.kind;
    let sol = solve(levels, false);
    // first the normal orientation only; if even splitting the kinds into several paths does not clear, again with the
    // reverse orientation allowed where it pays
    for (const rc of [REVERSE_HARD, REVERSE_SOFT]) {
      reverseCost = rc;
      levels = new Map();
      splitMsgs = [];
      sol = solve(levels, false);
      while (opts.split && unclear(sol.lay)) {
        // kinds in the clashing pairs that can still split
        const bad = new Set<string>();
        for (const ap of sol.lay.approaches)
          if (ap.dist < ap.need - TOL)
            for (const i of [ap.i, ap.j]) {
              const k = kindOfThrow(i);
              if (k !== undefined) bad.add(k);
            }
        let pick: { k: string; lv: number; sol: typeof sol } | null = null;
        for (const k of bad) {
          const lv = levels.get(k) ?? 0;
          if (lv >= 2) continue;
          // the next level that actually adds a path for this kind
          const here = classesFor(levels).n;
          let nl = lv + 1;
          if (classesFor(new Map(levels).set(k, nl)).n === here) nl = 2;
          const trial = new Map(levels).set(k, nl);
          if (nl <= lv || classesFor(trial).n === here) continue;
          const s2 = solve(trial, false);
          if (!pick || s2.best < pick.sol.best) pick = { k, lv: nl, sol: s2 };
        }
        if (!pick) break;
        const lvNew = pick.lv;
        levels.set(pick.k, lvNew);
        sol = pick.sol;
        const [h, v, cr] = pick.k.split("|");
        const word = `${cr === "x" ? "crossing " : ""}${v}s from ${h === "*" ? "either hand (mirror images)" : h === "L" ? "the left" : "the right"}`;
        splitMsgs.push(
          `No single path for the ${word} works; ` +
            (lvNew === 1 ? "they are two throws, alternating." : "every one is its own throw."),
        );
      }
      if (!unclear(sol.lay)) break;
    }
    // The options: at the split levels and orientation the ladder settled on, the search from every start; every end
    // that clears (checked again at the fine sampling, and polished there if it slipped), duplicates (every point
    // within 1 cm) merged, ranked by the cost.
    const fin = opts.collect === false ? sol : solve(levels, true);
    const cands: { name: string; vs: Var[]; lay: Placed; rank: number }[] = [];
    for (const run of opts.collect === false
      ? [{ name: "best", vs: sol.vs, lay: sol.lay, best: sol.best }]
      : fin.runs) {
      if (reverseCost === REVERSE_HARD && reversed(run.vs, fin.classOf).size) continue;
      let vs = run.vs;
      let l = build(fin.classOf, vs, FINE_DT);
      if (unclear(l) && !unclear(run.lay)) {
        const d = descend(fin.classOf, vs, [D / 32, D / 64], FINE_DT);
        vs = d.vs;
        l = d.cur;
      }
      if (unclear(l)) continue;
      cands.push({ name: run.name, vs, lay: l, rank: rank(l, vs, fin.classOf) });
    }
    cands.sort((x, y) => x.rank - y.rank);
    const near = (p: Placed, q: Placed) =>
      p.throws.every((t, i) =>
        (["launch", "land"] as const).every((k) => dist(t[k], q.throws[i][k]) < DEDUPE),
      );
    for (const c of cands) {
      const dup = finals.find((f) => near(f.lay, c.lay));
      if (dup) dup.starts.push(c.name);
      else finals.push({ name: c.name, starts: [c.name], vs: c.vs, classOf: fin.classOf, lay: c.lay });
    }
    finals = finals.slice(0, MAX_OPTIONS);
    // nothing clears: the closest try, worked over once more in finer steps (a near miss often clears there), with
    // its collisions said if it still does not
    if (!finals.length) {
      const d = descend(sol.classOf, sol.vs, [D / 32, D / 64], FINE_DT);
      finals = [{ name: "best try", starts: ["best try"], vs: d.vs, classOf: sol.classOf, lay: d.cur }];
    }
  } else {
    const vs = startVars(first0.classOf, first0.n);
    finals = [
      {
        name: "Kalvan",
        starts: ["Kalvan"],
        vs,
        classOf: first0.classOf,
        lay: build(first0.classOf, vs, FINE_DT),
      },
    ];
  }
  const finish = (f: (typeof finals)[number]): Layout => {
    const lay = f.lay;
    const orientMsgs: string[] = [];
    if (searched && reverseCost < REVERSE_HARD) {
      const rev = reversed(f.vs, f.classOf);
      const names = new Set<string>();
      info.forEach((q, i) => {
        if (q && rev.has(f.classOf[i])) names.add(`${q.v}${q.cross ? "x" : ""}`);
      });
      for (const nm of names)
        orientMsgs.push(`the ${nm}'s are thrown reverse-cascade style: the normal way does not clear.`);
    }
    // the closest approach is the true minimum over flight and dwell (the ball-diameter checks of balls leaving
    // together are their own entries and do not count here)
    const zoneAps = lay.approaches.filter((a) => !a.pair.endsWith("at the hand"));
    const minSeparation = zoneAps.length ? Math.min(...zoneAps.map((a) => a.dist)) : Infinity;
    const collisions = lay.approaches.filter((a) => a.dist < a.need - TOL).sort((a, b) => a.dist - b.dist);
    const first = lay.throws.find((t) => t.kind === "throw");
    const readout: Readout =
      pat.uniform && first
        ? {
            shape: K.shape,
            balls: pat.balls,
            flightDistance: Math.abs(first.land.x - first.launch.x),
            ballsPerArc: first.flight / tau,
            throwHeight: first.height,
            flightTime: first.flight,
            dwellTime: first.dwellAfter,
            handMove: K.handMove,
            handAngle: K.handAngle,
            throwVelocity: first.velocity,
            throwAngle: first.angle,
            arcSpacing: K.arcSpacing,
            arcSpacingAdjustable: K.shape === "fountain",
          }
        : {
            shape: "general",
            balls: pat.balls,
            flightDistance: K.flightDistance,
            ballsPerArc: K.omega,
            throwHeight: K.throwHeight,
            flightTime: K.flightTime,
            dwellTime: K.dwellTime,
            handMove: K.handMove,
            handAngle: K.handAngle,
            throwVelocity: K.throwVelocity,
            throwAngle: K.throwAngle,
            arcSpacing: K.arcSpacing,
            arcSpacingAdjustable: fountainLike,
          };
    const messages: string[] = [...splitMsgs, ...orientMsgs];
    if (pat.uniform && K.omega <= 0) messages.push("Impossible: the dwell ratio leaves no flight time.");
    if (collisions.length) {
      const c = collisions[0];
      messages.push(
        `${searched ? "No clear layout found; in the closest one" : "Impossible at this dwell and hand period:"} ${c.pair} come within ${(c.dist * 100).toFixed(1)} cm ` +
          `(${c.need === D ? "error zone" : "ball diameter"} ${(c.need * 100).toFixed(0)} cm)` +
          (collisions.length > 1
            ? `, and ${collisions.length - 1} more pair${collisions.length > 2 ? "s" : ""}.`
            : "."),
      );
    }
    const maxHeight = Math.max(
      0,
      ...lay.throws.filter((t) => t.kind !== "hold").map((t) => t.launch.y + t.height),
    );
    return {
      pattern: pat,
      params,
      beat,
      period: T,
      throws: lay.throws,
      hands: lay.hands,
      kalvan: K,
      readout,
      approaches: lay.approaches,
      minSeparation,
      collisions,
      messages,
      notes: [],
      searched,
      option: {
        starts: f.starts,
        cost: rank(lay, f.vs, f.classOf),
        travel: lay.travel,
        points: lay.points,
        asym: lay.asym,
        maxHeight,
      },
    };
  };
  const out = finals.map(finish);
  // Kalvan's own curve is fixed by the ball velocities. For other siteswaps (531: a 3 flies low across the middle over
  // a held 5) the placement search may find no way to keep a flying ball clear of a held one; the only freedom left is
  // how far under the hand goes, so deepen the curve (scale its end velocities) in steps until it clears.
  if (search && !pat.uniform && out[0].collisions.length && (params.handTangent ?? 1) === 1)
    for (const k of [1.25, 1.5, 2, 2.5, 3]) {
      const alt = searchLayouts(pat, { ...params, handTangent: k }, true, opts);
      if (alt[0].collisions.length === 0) {
        for (const a of alt)
          a.notes.unshift(
            `Kalvan's hand curve (fixed by the ball velocities) cannot keep a held ball clear of a flying one here; the hand dips ${k}× as steeply into the catch and out of the throw.`,
          );
        return alt;
      }
    }
  return out;
}

/** for each throw, the throw whose launch point / landing point it shares (itself when it has its own) */
interface Lead {
  launch: number[];
  land: number[];
}

interface Placed {
  throws: LThrow[];
  hands: Record<Hand, LHand>;
  approaches: Approach[];
  travel: number;
  points: number;
  asym: number;
}

/** Hand travel over one period: for each hand, each catch point to that hand's next throw point, the straight chord
 *  (what Kalvan's readout measures as the hand move, "distance = E", FORTH.md section 4: for his cascade the line from
 *  catch to throw, length E at angle theta; for his fountain E = F). The return of the empty hand is not counted. */
export function handTravel(hands: Record<Hand, LHand>): number {
  let s = 0;
  for (const h of [hands.L, hands.R]) {
    const pts = h.points;
    pts.forEach((p, k) => {
      if (p.kind !== "catch") return;
      for (let m = 1; m <= pts.length; m++) {
        const q = pts[(k + m) % pts.length];
        if (q.kind === "throw") {
          s += dist(p.p, q.p);
          break;
        }
      }
    });
  }
  return s;
}

/** Distinct catch points plus distinct throw points over both hands (points within DEDUPE are one). */
export function handPoints(hands: Record<Hand, LHand>): number {
  let n = 0;
  for (const h of [hands.L, hands.R])
    for (const kind of ["catch", "throw"] as const) {
      const seen: Vec[] = [];
      for (const p of h.points)
        if (p.kind === kind && !seen.some((q) => dist(p.p, q) < DEDUPE)) seen.push(p.p);
      n += seen.length;
    }
  return n;
}

/** Left/right asymmetry: for every kind of regular throw (value, crossing, x) thrown by both hands,
 *  the difference of the two hands' mean |launch x| and mean |landing x|. Zero in mirror-symmetric patterns, whose
 *  mirror-image kinds share one path. */
function asymmetry(pat: Pattern, throws: LThrow[]): number {
  if (pat.mirrorPeriod) return 0;
  const acc = new Map<string, Record<Hand, { a: number; c: number; k: number }>>();
  throws.forEach((t, i) => {
    if (t.kind !== "throw") return;
    const th = pat.throws[i];
    const key = `${th.v}|${th.toHand !== th.hand}|${/x/.test(th.token)}`;
    const e = acc.get(key) ?? { L: { a: 0, c: 0, k: 0 }, R: { a: 0, c: 0, k: 0 } };
    e[t.hand].a += Math.abs(t.launch.x);
    e[t.hand].c += Math.abs(t.land.x);
    e[t.hand].k++;
    acc.set(key, e);
  });
  let s = 0;
  for (const { L, R } of acc.values())
    if (L.k && R.k) s += Math.abs(L.a / L.k - R.a / R.k) + Math.abs(L.c / L.k - R.c / R.k);
  return s;
}

function place(
  pat: Pattern,
  params: Params,
  K: Kalvan,
  kinds: LThrow["kind"][],
  flights: number[],
  dwells: number[],
  classOf: number[],
  vars: Var[],
  lead: Lead,
  beat: number,
  dt = FINE_DT,
): Placed {
  const { g } = params;
  const throws: LThrow[] = pat.throws.map((th, i) => {
    const kind = kinds[i];
    const f = flights[i];
    const sh = side(th.hand);
    const sc = side(th.toHand);
    let launch: Vec;
    let land: Vec;
    if (kind === "throw") {
      const j = lead.launch[i];
      launch = { x: sh * (kinds[j] === "throw" ? vars[classOf[j]].a : K.xi), y: 0 };
      land = { x: sc * vars[classOf[lead.land[i]]].c, y: K.dy };
    } else if (kind === "hold") {
      launch = { x: sh * K.xi, y: 0 };
      land = { x: sh * K.xo, y: K.dy };
    } else {
      launch = { x: sh * K.xi, y: 0 };
      land = { x: sc * K.xi, y: 0 };
    }
    // the parabola through both points in time f: Vh = dx / f, Vv = (dy + g f^2 / 2) / f
    const vx = f > 0 ? (land.x - launch.x) / f : 0;
    const vy = f > 0 ? (land.y - launch.y + (g * f * f) / 2) / f : 0;
    const height = kind === "hold" ? 0 : vy > 0 ? (vy * vy) / (2 * g) : 0;
    const tok = th.token.replace("[", "");
    const label = `${tok}${th.hand}${th.t}${pat.multiplex ? "abcdefgh"[th.sib] : ""}`;
    return {
      i,
      label,
      hand: th.hand,
      toHand: th.toHand,
      v: th.v,
      kind,
      t: th.t * beat,
      beat: th.t,
      launch,
      land,
      flight: f,
      height,
      vx,
      vy,
      velocity: Math.hypot(vx, vy),
      angle: (Math.atan2(sh * vx, vy) * 180) / Math.PI,
      dwellAfter: dwells[i],
      next: th.next,
      nextT: (th.t + th.v) * beat,
    };
  });
  const T = pat.period * beat;
  const hands = { L: handOf("L", throws, g, T), R: handOf("R", throws, g, T) };
  // Kalvan's own 3-ball cascade puts the two hands' throw points across the middle (xi < 0 at the defaults), so his
  // optimum cannot keep the error zone between balls in the hands; there only the ball diameter is required.
  const handNeed = pat.uniform && K.shape === "cascade" && K.xi < 0 ? params.ballDiameter : params.errorZone;
  const lay = { period: T, throws, hands, params };
  const aps = [
    ...approaches(throws, T, params),
    ...handApproaches(lay, pat.multiplex || kinds.includes("hold"), handNeed, dt),
  ];
  return {
    throws,
    hands,
    approaches: aps,
    travel: handTravel(hands),
    points: handPoints(hands),
    asym: asymmetry(pat, throws),
  };
}

const dist = (a: Vec, b: Vec) => Math.hypot(a.x - b.x, a.y - b.y);

function handOf(hand: Hand, throws: LThrow[], g: number, T: number): LHand {
  const pts: HandPoint[] = [];
  for (const th of throws) {
    // a held 2 is neither thrown nor caught: the hand keeps the ball on its way to the next real catch or throw
    if (th.kind === "hold") continue;
    if (th.hand === hand)
      pts.push({ t: th.t, kind: "throw", p: th.launch, v: { x: th.vx, y: th.vy }, throwIndex: th.i });
    if (th.toHand === hand)
      pts.push({
        t: (th.t + th.flight) % T,
        kind: "catch",
        p: th.land,
        v: { x: th.vx, y: th.vy - g * th.flight },
        throwIndex: th.i,
      });
  }
  pts.sort((a, b) => a.t - b.t || (a.kind === "catch" ? -1 : 1));
  const dw: Segment[] = [];
  const ret: Segment[] = [];
  pts.forEach((p, k) => {
    const q = pts[(k + 1) % pts.length];
    const t1 = q.t + (k + 1 === pts.length ? T : 0);
    const seg = { from: p.p, to: q.p, t0: p.t, t1 };
    if (p.kind === "catch") dw.push(seg);
    else ret.push(seg);
  });
  return { hand, points: pts, dwells: dw, returns: ret };
}

/** One ball in flight: position at absolute time s. */
function flightAt(th: LThrow, s: number, g: number): Vec {
  const u = s - th.t;
  return { x: th.launch.x + th.vx * u, y: th.launch.y + th.vy * u - (g * u * u) / 2 };
}

/** Closest approach of every pair of balls in flight over one period. With equal g the parabola terms cancel in the
 *  difference of two balls, so their separation vector is linear in time (Kalvan's "lower ball's frame": each sees
 *  the other move in a straight line) and the minimum over the overlap of the two flights is the closest approach
 *  of a segment to the origin, in closed form. Later periods are tiled (flights spill past the period). Holds
 *  are not flights (zips and hurried throws, short flights, are, though not against each other): every ball held in a hand is checked by `handApproaches`. Two balls
 *  leaving or arriving together (a multiplex) cannot be apart at the hand itself: they are checked against the
 *  error zone over the middle 60 % of the flight and against the ball diameter where that window starts and ends. */
function approaches(throws: LThrow[], T: number, p: Params): Approach[] {
  // Multiplex balls leaving or landing together: touching at the hand is allowed (only the ball diameter must be
  // kept once they have parted, at the edge of the 20 % window), the error zone applies in the middle 60 %.
  const fl = throws.filter((t) => t.kind !== "hold");
  const out: Approach[] = [];
  for (let x = 0; x < fl.length; x++)
    for (let y = x; y < fl.length; y++) {
      const A = fl[x];
      const B = fl[y];
      // short throws have fixed points at one height, outside the search: not checked against each other
      if (A.kind === "short" && B.kind === "short") continue;
      let best: Approach | null = null;
      let edge: Approach | null = null;
      const nLo = Math.floor((A.t - (B.t + B.flight)) / T) - 1;
      const nHi = Math.ceil((A.t + A.flight - B.t) / T) + 1;
      for (let n = nLo; n <= nHi; n++) {
        if (x === y && n <= 0) continue;
        const bt = B.t + n * T;
        let lo = Math.max(A.t, bt);
        let hi = Math.min(A.t + A.flight, bt + B.flight);
        const Bs = { ...B, t: bt };
        const edgeAt: number[] = [];
        if (Math.abs(A.t - bt) < 1e-9 && A.hand === B.hand) {
          lo += 0.2 * Math.min(A.flight, B.flight);
          edgeAt.push(lo);
        }
        if (Math.abs(A.t + A.flight - bt - B.flight) < 1e-9 && A.toHand === B.toHand) {
          hi -= 0.2 * Math.min(A.flight, B.flight);
          edgeAt.push(hi);
        }
        for (const s of edgeAt) {
          const a = flightAt(A, s, p.g);
          const b = flightAt(Bs, s, p.g);
          const d = Math.hypot(a.x - b.x, a.y - b.y);
          if (!edge || d < edge.dist)
            edge = {
              i: A.i,
              j: B.i,
              pair: `${A.label}–${B.label} at the hand`,
              need: p.ballDiameter,
              inHand: false,
              t: ((s % T) + T) % T,
              dist: d,
              a,
              b,
            };
        }
        if (hi <= lo) continue;
        const a0 = flightAt(A, lo, p.g);
        const b0 = flightAt(Bs, lo, p.g);
        const a1 = flightAt(A, hi, p.g);
        const b1 = flightAt(Bs, hi, p.g);
        const r0 = { x: a0.x - b0.x, y: a0.y - b0.y };
        const w = { x: a1.x - b1.x - r0.x, y: a1.y - b1.y - r0.y };
        const ww = w.x * w.x + w.y * w.y;
        const u = ww > 0 ? Math.min(1, Math.max(0, -(r0.x * w.x + r0.y * w.y) / ww)) : 0;
        const s = lo + u * (hi - lo);
        const d = Math.hypot(r0.x + u * w.x, r0.y + u * w.y);
        if (!best || d < best.dist)
          best = {
            i: A.i,
            j: B.i,
            pair: `${A.label}–${B.label}${x === y ? "′" : ""}`,
            need: p.errorZone,
            inHand: false,
            t: ((s % T) + T) % T,
            dist: d,
            a: flightAt(A, s, p.g),
            b: flightAt(Bs, s, p.g),
          };
      }
      if (best) out.push(best);
      if (edge) out.push(edge);
    }
  return out;
}

/** The closest approach of every pair with a ball in a hand, over one period, sampled every 2 ms (4 ms while searching, every kept layout checked again at 2 ms; the relative
 *  motion is a parabola against the hand's straight dwell path, so no closed form is needed; 2 ms at the largest
 *  relative speeds is under 0.2 mm). A ball is in its catching hand from the catch to its next throw, at the hand's
 *  position, which follows Kalvan's cubic Hermite curve from the catch point to the throw point (`hermite`). This
 *  covers a ball arriving at a hand while another leaves it: they are the hand move E apart (E = F in the fountain).
 *  Balls held in the same hand are exempt in multiplex and hold patterns, where the hand holds them together, and so
 *  are a flying ball within the first / last 20 % of its flight against a ball held in the hand it leaves / lands
 *  in (matching the flight pairs above). Elsewhere every pair counts, held together or not. */
function handApproaches(lay: BallLayout, together: boolean, need: number, dt = FINE_DT): Approach[] {
  const T = lay.period;
  const best = new Map<string, Approach>();
  for (let s = 0; s < T; s += dt) {
    const bs = ballsAt(lay, s);
    for (let x = 0; x < bs.length; x++)
      for (let y = x + 1; y < bs.length; y++) {
        const A = bs[x];
        const B = bs[y];
        if (A.flying && B.flying) continue;
        if (together) {
          if (A.hand && A.hand === B.hand) continue;
          const near = (F: (typeof bs)[number], H: (typeof bs)[number]) =>
            F.flying &&
            H.hand &&
            ((lay.throws[F.i].hand === H.hand && s - F.t0 < 0.2 * lay.throws[F.i].flight) ||
              (lay.throws[F.i].toHand === H.hand &&
                F.t0 + lay.throws[F.i].flight - s < 0.2 * lay.throws[F.i].flight));
          if (near(A, B) || near(B, A)) continue;
        }
        const d = Math.hypot(A.p.x - B.p.x, A.p.y - B.p.y);
        const [i, j] = A.i <= B.i ? [A.i, B.i] : [B.i, A.i];
        const key = `${i}|${j}`;
        const cur = best.get(key);
        if (!cur || d < cur.dist)
          best.set(key, {
            i,
            j,
            pair: `${lay.throws[i].label}–${lay.throws[j].label}${i === j ? "′" : ""} in the hand`,
            need,
            inHand: true,
            t: s,
            dist: d,
            a: A.i === i ? A.p : B.p,
            b: A.i === i ? B.p : A.p,
          });
      }
  }
  return [...best.values()];
}

// ---------------------------------------------------------------------------------------------------------------
// Animation helpers

/** soft cap on a tangent's length, so hand curves stay within reach (passist's DwellCurve idea) */
function damp(v: Vec, dt: number, cap: number): Vec {
  const m = Math.hypot(v.x, v.y) * dt * 0.3;
  if (m === 0) return { x: 0, y: 0 };
  const k = (cap * Math.tanh(m / cap)) / m;
  return { x: v.x * dt * 0.3 * k, y: v.y * dt * 0.3 * k };
}

/** The hand at time s. Carrying a ball (from a catch to the next waypoint, the throw) it follows Kalvan's cubic Hermite
 *  curve from the catch point with the arriving ball's velocity to the throw point with the departing ball's
 *  (FORTH.md section 4, DOHAND). Empty (throw -> catch) his program draws nothing; we use the same construction
 *  backwards in time (throw velocity to the next arrival velocity), damped so it stays within reach. */
export function handAt(lay: BallLayout, hand: Hand, s: number): Vec {
  const pts = lay.hands[hand].points;
  if (!pts.length) return { x: side(hand) * 0.2, y: 0 };
  const T = lay.period;
  const t = ((s % T) + T) % T;
  let k = pts.findIndex((p) => p.t > t) - 1;
  if (k < 0) k = pts.length - 1;
  const a = pts[k];
  const b = pts[(k + 1) % pts.length];
  let t0 = a.t;
  let t1 = b.t;
  let tt = t;
  if (t1 <= t0) t1 += T;
  if (tt < t0) tt += T;
  const dt = t1 - t0;
  if (dt <= 1e-9) return a.p;
  const u = (tt - t0) / dt;
  // carrying a ball: Kalvan's cubic from the catch point and arrival velocity to the throw point and throw velocity
  if (a.kind === "catch") {
    // shortcut: a ball kept longer than the dwell (through a held 2) would swing the cubic far under the hand, so its
    // end velocities are scaled to dip as a normal dwell does; they no longer match the ball's. Upgrade: a rest phase.
    const d0 = lay.params.dwellRatio * lay.params.handPeriod;
    const k = (lay.params.handTangent ?? 1) * Math.min(1, d0 / dt);
    // with a ball already in it the hand waits at the next catch point: it does not run down ahead of the arriving ball
    const kb = b.kind === "catch" ? 0 : k;
    return hermite(a.p, { x: a.v.x * k, y: a.v.y * k }, b.p, { x: b.v.x * kb, y: b.v.y * kb }, dt, u);
  }
  return hermite(a.p, damp(a.v, dt, 0.12), b.p, damp(b.v, dt, 0.12), 1, u);
}

/** what ballsAt and handAt need of a layout (also what `place` has before the Layout is assembled) */
export type BallLayout = Pick<Layout, "period" | "throws" | "hands" | "params">;

/** a ball as drawn: its position, which throw it belongs to, in flight or held (and by which hand), and when this
 *  stretch began (the throw's absolute time) */
export interface DrawnBall {
  p: Vec;
  i: number;
  flying: boolean;
  hand: Hand | null;
  t0: number;
}

/** Every ball at time s: each throw's ball from its launch until its next throw, in flight then in the catching
 *  hand (a hold stays in the hand throughout). */
export function ballsAt(lay: BallLayout, s: number): DrawnBall[] {
  const T = lay.period;
  const out: DrawnBall[] = [];
  for (const th of lay.throws) {
    const life = th.nextT - th.t;
    // every earlier period's ball that is still alive (a 9 lives 4.5 periods of the cascade)
    for (let m = Math.floor((s - th.t) / T); ; m--) {
      const u = s - (th.t + m * T);
      if (u >= life) break;
      if (u < 0) continue;
      const t0 = th.t + m * T;
      if (th.kind === "hold")
        out.push({ p: handAt(lay, th.hand, s), i: th.i, flying: false, hand: th.hand, t0 });
      else if (u < th.flight)
        out.push({ p: flightAt({ ...th, t: t0 }, s, lay.params.g), i: th.i, flying: true, hand: null, t0 });
      else out.push({ p: handAt(lay, th.toHand, s), i: th.i, flying: false, hand: th.toHand, t0 });
    }
  }
  return out;
}

/** The arc of a flight as points (for the traces). */
export function arcPoints(lay: Layout, th: LThrow, n = 40): Vec[] {
  return [...Array(n + 1)].map((_, k) => flightAt(th, th.t + (th.flight * k) / n, lay.params.g));
}

export interface TubePoint extends Vec {
  /** the nearest other ball (space-time: at the same instant; space-only: anywhere on another arc), m */
  near: number;
}

/** Section 3b's tubes: every flight sampled, each point with the closest approach of any other ball. */
export function tubes(lay: Layout, mode: "spacetime" | "space", n = 48): { th: LThrow; pts: TubePoint[] }[] {
  const g = lay.params.g;
  const T = lay.period;
  const fl = lay.throws.filter((t) => t.kind === "throw");
  const arcs = fl.map((th) => arcPoints(lay, th, n));
  return fl.map((th, x) => ({
    th,
    pts: arcs[x].map((p, k) => {
      let near = Infinity;
      if (mode === "space") {
        fl.forEach((_, y) => {
          if (y === x) return;
          for (const q of arcs[y]) near = Math.min(near, dist(p, q));
        });
      } else {
        const s = th.t + (th.flight * k) / n;
        for (const o of fl) {
          for (let m = Math.floor((s - o.t) / T) + 1; ; m--) {
            const ot = o.t + m * T;
            if (s > ot + o.flight) break;
            if (s < ot || (o.i === th.i && m === 0)) continue;
            near = Math.min(near, dist(p, flightAt({ ...o, t: ot }, s, g)));
          }
        }
      }
      return { ...p, near };
    }),
  }));
}

/** Search for the nearest hand period, dwell ratio and error zone at which nothing collides (on demand: each step
 *  reruns the placement). */
export function nearestFeasible(
  pat: Pattern,
  p: Params,
): { handPeriod?: number; dwellRatio?: number; errorZone?: number; arcSpacing?: number } {
  const ok = (q: Params) => {
    const l = layoutWith(pat, q, true);
    return l.collisions.length === 0 && l.kalvan.omega > 0;
  };
  const out: { handPeriod?: number; dwellRatio?: number; errorZone?: number; arcSpacing?: number } = {};
  const lay = layoutWith(pat, p, true);
  if (lay.collisions.length) out.errorZone = Math.floor(lay.minSeparation * 100) / 100;
  for (let k = 1; k <= 40 && out.handPeriod === undefined; k++)
    for (const sgn of [1, -1]) {
      const tau = Math.round((p.handPeriod + sgn * k * 0.01) * 100) / 100;
      if (tau < 0.2 || tau > 1.2) continue;
      if (ok({ ...p, handPeriod: tau })) {
        out.handPeriod = tau;
        break;
      }
    }
  for (let k = 1; k <= 40 && out.dwellRatio === undefined; k++)
    for (const sgn of [-1, 1]) {
      const r = Math.round((p.dwellRatio + sgn * k * 0.02) * 100) / 100;
      if (r < 0.05 || r > 0.99) continue;
      if (ok({ ...p, dwellRatio: r })) {
        out.dwellRatio = r;
        break;
      }
    }
  if (pat.balls % 2 === 0)
    for (let P = Math.round((p.arcSpacing ?? 0.5) * 100) / 100; P <= 3; P = Math.round(P * 100 + 1) / 100)
      if (ok({ ...p, arcSpacing: P })) {
        out.arcSpacing = P;
        break;
      }
  return out;
}
