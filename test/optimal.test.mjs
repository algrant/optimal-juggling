// Tests for src/model.ts against Jack Kalvan's Optimal Juggler 4.0 (the two screenshots in
// juggling/archive/optimal-juggler/, 2026-10-23) and the equations of his paper "Optimal Juggling" (1996).
// Run: npm test (plain node: Node >= 22.18 strips the types).
import assert from "node:assert/strict";
import {
  optimalLayout,
  optimalLayouts,
  handTravel,
  handPoints,
  parseSiteswap,
  orbits,
  kalvan,
  ballsAt,
  tubes,
  nearestFeasible,
  autoArcSpacing,
  hermite,
  kalvanHand,
  handAt,
  KALVAN_ARC_SPACING,
  startArcSpacing,
  START_SITESWAP,
  START_SPEED,
  START_TRACE,
  START_ZONES,
  DEFAULT_PARAMS as P,
} from "../src/model.ts";

// the two screenshots were taken at the user's session value, dwell ratio 0.92 (his program starts at 0.66)
const S92 = { ...P, dwellRatio: 0.92 };

let fails = 0;
const test = (name, fn) => {
  try {
    fn();
    console.log("ok  ", name);
  } catch (e) {
    fails++;
    console.log("FAIL", name, "\n     ", e.message);
  }
};
/** shown to `dp` decimals as on his screen */
const shown = (ours, his, dp, what) =>
  assert.equal(ours.toFixed(dp), his.toFixed(dp), `${what}: his ${his.toFixed(dp)}, ours ${ours.toFixed(6)}`);

test("six balls (screenshot-2026-10-23.png): dwell 0.92, tau 0.40 s, D 25 cm, arcs 0.71 m", () => {
  const r = optimalLayout("6", { ...S92, arcSpacing: 0.71 }).readout;
  shown(r.arcSpacing, 0.71, 2, "distance between arcs");
  shown(r.flightDistance, 0.52, 2, "flight distance");
  shown(r.ballsPerArc, 2.08, 2, "balls in flight per arc");
  shown(r.throwHeight, 0.85, 2, "throw height");
  shown(r.flightTime, 0.83, 2, "flight time");
  shown(r.dwellTime, 0.37, 2, "dwell time");
  shown(r.handMove, 0.52, 2, "hand move distance");
  shown(r.handAngle, 0.0, 2, "hand move angle");
  shown(r.throwVelocity, 4.12, 2, "throw velocity");
  shown(r.throwAngle, 8.72, 2, "throw angle");
});

test("five balls (screenshot-2026-10-23-traces.png)", () => {
  const r = optimalLayout("5", S92).readout;
  shown(r.arcSpacing, 0.3, 2, "distance between arcs");
  shown(r.flightDistance, 0.39, 2, "flight distance");
  shown(r.ballsPerArc, 1.58, 2, "balls in flight per arc");
  shown(r.throwHeight, 0.52, 2, "throw height");
  shown(r.flightTime, 0.63, 2, "flight time");
  shown(r.dwellTime, 0.37, 2, "dwell time");
  shown(r.handMove, 0.29, 2, "hand move distance");
  shown(r.handAngle, 11.41, 2, "hand move angle");
  shown(r.throwVelocity, 3.25, 2, "throw velocity");
  shown(r.throwAngle, -11.09, 2, "throw angle");
});

test("the paper's equations: omega = b/h - r, f = tau omega, F = omega D, Vh = D/tau, P/D, tan theta, E", () => {
  for (const b of [3, 4, 5, 6, 7, 8, 9]) {
    const k = kalvan(b, P, b % 2 ? undefined : 0.8);
    const { handPeriod: tau, dwellRatio: r, errorZone: D, g } = P;
    const om = b / 2 - r;
    assert.ok(Math.abs(k.omega - om) < 1e-12);
    assert.ok(Math.abs(k.flightTime - tau * om) < 1e-12);
    assert.ok(Math.abs(k.flightDistance - om * D) < 1e-12);
    assert.ok(Math.abs(k.vh - D / tau) < 1e-12);
    if (b % 2) {
      assert.ok(Math.abs(k.arcSpacing / D - Math.sqrt(((4 * D) / (g * tau * tau)) ** 2 + 1)) < 1e-12);
      const th = Math.atan((2 * k.vh ** 2) / (g * k.flightDistance));
      assert.ok(Math.abs(k.handAngle - (th * 180) / Math.PI) < 1e-9);
      assert.ok(Math.abs(k.handMove - k.arcSpacing * Math.cos(th)) < 1e-12);
    } else {
      assert.ok(Math.abs(k.throwHeight - (g * k.flightTime ** 2) / 8) < 1e-12, "H = g f^2 / 8");
      assert.ok(Math.abs(k.handMove - k.flightDistance) < 1e-12, "E = F");
    }
  }
});

test("Kalvan's optimum grazes: cascades 5-9 and fountains (clearing spacing) have minimum separation = the error zone, in the air and in the hands", () => {
  for (const ss of ["5", "7", "9", "4", "6", "8"]) {
    for (const q of [P, { ...P, handPeriod: 0.55, dwellRatio: 0.7, errorZone: 0.15 }]) {
      const even = ss % 2 === 0;
      const qq = even ? { ...q, arcSpacing: autoArcSpacing(+ss, q) } : q;
      const l = optimalLayout(ss, qq);
      assert.ok(
        Math.abs(l.minSeparation - q.errorZone) < 2e-3,
        `${ss}: min ${l.minSeparation} vs ${q.errorZone}`,
      );
      assert.equal(l.collisions.length, 0, ss);
    }
  }
});

test("three balls: Kalvan's hand points cross the middle, so in the hands only the ball diameter is kept", () => {
  const l = optimalLayout("3", P);
  assert.ok(l.kalvan.xi < 0);
  assert.ok(l.minSeparation >= P.ballDiameter && l.minSeparation < P.errorZone, `${l.minSeparation}`);
  assert.equal(l.collisions.length, 0);
});

test("six balls at Kalvan's 0.71 m: closest approach over flight AND dwell >= error zone; catch and throw points F apart", () => {
  const l = optimalLayout("6", { ...P, arcSpacing: KALVAN_ARC_SPACING });
  assert.equal(l.readout.arcSpacing, KALVAN_ARC_SPACING);
  assert.equal(l.collisions.length, 0);
  assert.ok(l.minSeparation >= P.errorZone - 1e-4, `${l.minSeparation}`);
  assert.ok(
    l.approaches.some((a) => a.inHand),
    "balls in the hands were checked",
  );
  const F = l.kalvan.flightDistance;
  for (const h of ["L", "R"]) {
    const pts = l.hands[h].points;
    const c = pts.find((p) => p.kind === "catch");
    const t = pts.find((p) => p.kind === "throw");
    assert.ok(Math.abs(Math.hypot(c.p.x - t.p.x, c.p.y - t.p.y) - F) < 1e-9, `${h}: catch-throw ${F}`);
  }
});

test("five balls: catch and throw points on the slanted hand move (E), closest approach over flight and dwell >= error zone", () => {
  const l = optimalLayout("5", P);
  assert.ok(l.minSeparation >= P.errorZone - 1e-4, `${l.minSeparation}`);
  assert.equal(l.collisions.length, 0);
  for (const h of ["L", "R"]) {
    const pts = l.hands[h].points;
    const c = pts.find((p) => p.kind === "catch");
    const t = pts.find((p) => p.kind === "throw");
    assert.ok(Math.abs(Math.hypot(c.p.x - t.p.x, c.p.y - t.p.y) - l.kalvan.handMove) < 1e-9, `${h}: E`);
  }
});

test("the old bug: six balls 0.25 m apart put the hands' balls on top of each other; flagged now, and the search clears it", () => {
  const l = optimalLayout("6", { ...P, arcSpacing: 0.25 });
  assert.ok(
    l.collisions.some((c) => c.inHand),
    "a ball in the hand collides",
  );
  assert.ok(l.minSeparation < P.errorZone);
  const a = autoArcSpacing(6, P);
  assert.ok(a > 0.25 && a < KALVAN_ARC_SPACING, `smallest clearing ${a}`);
  assert.equal(optimalLayout("6", { ...P, arcSpacing: a }).collisions.length, 0);
});

// Kalvan's stored quantities, re-evaluated by archive/optimal-juggler/tools/oj_hand.py (which reproduces the constants
// inside his program's image; FORTH.md). hand = DOHAND's (x, y) at a quarter, half and three quarters of the dwell.
const OJ = [
  {
    b: 5,
    g: 10,
    r: 0.68,
    D: 0.29,
    T: 0.42,
    H: 0.761060662,
    VV: 3.901437329,
    E: 0.341555452,
    XTHROW: 0.095842734,
    XCATCH: -0.431957266,
    YCATCH: 0.060721895,
    Z1: 28.856434946,
    Z2: -14.779730451,
    Z3: 7.160928227,
    Z4: 10.314611289,
    Z5: 0.69047619,
    Z6: 0.431957266,
    hand: [
      [0.41641437, -0.151307067],
      [0.3132, -0.242529853],
      [0.18533563, -0.197307238],
    ],
  },
  {
    b: 7,
    g: 9.8,
    r: 0.66,
    D: 0.25,
    T: 0.4,
    H: 1.597339524,
    VV: 5.595342229,
    E: 0.294662702,
    XTHROW: 0.208588661,
    XCATCH: -0.501411339,
    YCATCH: 0.032878373,
    Z1: 31.828994725,
    Z2: -14.971706153,
    Z3: 4.40431358,
    Z4: 19.340740307,
    Z5: 0.625,
    Z6: 0.501411339,
    hand: [
      [0.486595295, -0.247079353],
      [0.39625, -0.350943214],
      [0.285279705, -0.271115874],
    ],
  },
  {
    b: 6,
    g: 9.8,
    r: 0.92,
    D: 0.25,
    T: 0.4,
    P: 0.71,
    H: 0.8479744,
    VV: 4.0768,
    E: 0.52,
    XTHROW: 0.095,
    XCATCH: 0.615,
    YCATCH: 0.0,
    Z1: 30.098704488,
    Z2: -16.614484877,
    Z3: 0.0,
    Z4: 11.07826087,
    Z5: 0.625,
    Z6: 0.615,
    hand: [
      [0.5553125, -0.2812992],
      [0.355, -0.3750656],
      [0.1546875, -0.2812992],
    ],
  },
  {
    b: 3,
    g: 9.8,
    r: 0.92,
    D: 0.25,
    T: 0.4,
    H: 0.143379554,
    VV: 1.676376823,
    E: 0.259833697,
    XTHROW: -0.041345357,
    XCATCH: -0.186345357,
    YCATCH: 0.125181823,
    Z1: 9.137594018,
    Z2: -6.742321463,
    Z3: 12.992450666,
    Z4: -4.082702333,
    Z5: 0.625,
    Z6: 0.186345357,
    hand: [
      [0.193893683, 0.045798363],
      [0.13, -0.041994689],
      [0.037356317, -0.077494941],
    ],
  },
];

test("Kalvan's constants (FORTH.md / oj_hand.py): H, VV, E, XTHROW, XCATCH, YCATCH, Z1..Z6 from the same inputs, 5, 7, 6 and 3 balls", () => {
  for (const c of OJ) {
    const q = { ...P, g: c.g, dwellRatio: c.r, errorZone: c.D, handPeriod: c.T };
    const k = kalvanHand(c.b, q, c.P);
    for (const key of ["H", "VV", "E", "XTHROW", "XCATCH", "YCATCH", "Z1", "Z2", "Z3", "Z4", "Z5", "Z6"])
      assert.ok(Math.abs(k[key] - c[key]) < 1e-6, `${c.b} balls ${key}: oj ${c[key]}, ours ${k[key]}`);
    [0.25, 0.5, 0.75].forEach((f, i) => {
      const h = k.handAtU(f * k.dwell);
      assert.ok(
        Math.abs(h.x - c.hand[i][0]) < 1e-6 && Math.abs(h.y - c.hand[i][1]) < 1e-6,
        `${c.b} balls hand at ${f}`,
      );
    });
  }
});

test("the layout's numbers are Kalvan's: throw height and velocity from his H (VV = sqrt(2 g H)); the ball lands E sin(theta) above its launch", () => {
  for (const c of OJ.filter((c) => c.b % 2)) {
    const q = { ...P, g: c.g, dwellRatio: c.r, errorZone: c.D, handPeriod: c.T };
    const k = kalvan(c.b, q);
    assert.ok(Math.abs(k.throwHeight - c.H) < 1e-9, `${c.b}: H ${k.throwHeight} vs ${c.H}`);
    assert.ok(Math.abs(k.vv - c.VV) < 1e-9);
    assert.ok(Math.abs(k.handMove - c.E) < 1e-9);
    assert.ok(Math.abs(k.dy - c.YCATCH) < 1e-9);
    assert.ok(Math.abs(k.xi - c.XTHROW) < 1e-9 && Math.abs(k.xo + c.XCATCH) < 1e-9);
    // the ball path y = (VV - g/2 t) t at t = f is YCATCH (FORTH.md section 3), and the layout throws exactly that
    const f = k.flightTime;
    assert.ok(Math.abs((k.vv - (q.g / 2) * f) * f - c.YCATCH) < 1e-9);
    const l = optimalLayout(String(c.b), q);
    const th = l.throws.find((t) => t.kind === "throw");
    assert.ok(Math.abs(th.vy - c.VV) < 1e-9 && Math.abs(th.land.y - c.YCATCH) < 1e-9);
  }
});

test("the hand on the page follows Kalvan's DOHAND cubic: the layout's handAt equals his Z1..Z6 curve over the whole dwell (5, 6, 7 balls)", () => {
  for (const c of OJ.filter((c) => c.b > 3)) {
    const q = { ...P, g: c.g, dwellRatio: c.r, errorZone: c.D, handPeriod: c.T, arcSpacing: c.P };
    const l = optimalLayout(String(c.b), q);
    const k = kalvanHand(c.b, q, c.P);
    const pts = l.hands.R.points;
    const i = pts.findIndex((p) => p.kind === "catch");
    const t0 = pts[i].t;
    let worst = 0;
    for (let n = 0; n <= 40; n++) {
      const u = (k.dwell * n) / 40;
      const a = handAt(l, "R", t0 + u + (n === 0 ? 1e-9 : 0));
      const b = k.handAtU(u);
      worst = Math.max(worst, Math.hypot(a.x - b.x, a.y - b.y));
    }
    assert.ok(worst < 1e-5, `${c.b} balls: worst ${worst}`);
    // starts at the catch point, ends at the throw point; the left hand is the mirror image
    const e = handAt(l, "R", t0 + k.dwell - 1e-9);
    assert.ok(Math.hypot(e.x - k.XTHROW, e.y) < 1e-5);
    const L = handAt(l, "L", t0 + k.dwell / 2 + l.beat);
    const R = handAt(l, "R", t0 + k.dwell / 2);
    if (c.b % 2) assert.ok(Math.abs(L.x + R.x) < 1e-6 && Math.abs(L.y - R.y) < 1e-6, "mirror, T/2 apart");
  }
});

test("hermite: meets position and velocity at both ends", () => {
  const a = { x: 0.5, y: 0.05 };
  const b = { x: 0.1, y: 0 };
  const va = { x: 0.7, y: -3 };
  const vb = { x: -0.7, y: 4 };
  const dt = 0.3;
  const e = 1e-6;
  const p0 = hermite(a, va, b, vb, dt, 0);
  const p1 = hermite(a, va, b, vb, dt, 1);
  assert.ok(Math.hypot(p0.x - a.x, p0.y - a.y) < 1e-12 && Math.hypot(p1.x - b.x, p1.y - b.y) < 1e-12);
  const q0 = hermite(a, va, b, vb, dt, e);
  const q1 = hermite(a, va, b, vb, dt, 1 - e);
  assert.ok(
    Math.abs((q0.y - p0.y) / (e * dt) - va.y) < 1e-3 && Math.abs((p1.y - q1.y) / (e * dt) - vb.y) < 1e-3,
  );
  assert.ok(
    Math.abs((q0.x - p0.x) / (e * dt) - va.x) < 1e-3 && Math.abs((p1.x - q1.x) / (e * dt) - vb.x) < 1e-3,
  );
});

test("sampling: stepping the animation every 10 ms, no two drawn balls come closer than the error zone", () => {
  for (const ss of ["3", "4", "5", "6", "7", "8", "9", "531", "441", "b97531", "(4,2x)*", "(6x,4)*"]) {
    const q = ss === "4" || ss === "6" || ss === "8" ? { ...P, arcSpacing: autoArcSpacing(+ss, P) } : P;
    const l = optimalLayout(ss, q);
    if (l.collisions.length) continue;
    const need = ss === "3" ? q.ballDiameter : q.errorZone;
    let worst = Infinity;
    for (let s = 0; s < 2 * l.period; s += 0.01) {
      const bs = ballsAt(l, s);
      for (let a = 0; a < bs.length; a++)
        for (let b = a + 1; b < bs.length; b++)
          worst = Math.min(worst, Math.hypot(bs[a].p.x - bs[b].p.x, bs[a].p.y - bs[b].p.y));
    }
    assert.ok(worst >= need - 2e-3, `${ss}: closest drawn pair ${worst}`);
  }
  // the default six-ball page in particular
  const l = optimalLayout("6", P);
  let worst = Infinity;
  for (let s = 0; s < 3 * l.period; s += 0.01) {
    const bs = ballsAt(l, s);
    for (let a = 0; a < bs.length; a++)
      for (let b = a + 1; b < bs.length; b++)
        worst = Math.min(worst, Math.hypot(bs[a].p.x - bs[b].p.x, bs[a].p.y - bs[b].p.y));
  }
  assert.ok(worst >= P.errorZone - 1e-3, `six balls: ${worst}`);
});

test("closed-form closest approach agrees with brute-force sampling (1 ms)", () => {
  for (const ss of ["5", "531", "(4,2x)*", "b97531", "[54]24", "6"]) {
    const l = optimalLayout(ss, P);
    const T = l.period;
    let brute = Infinity;
    for (let s = 3 * T; s < 4 * T; s += 0.001) {
      const fl = ballsAt(l, s).filter((b) => b.flying && l.throws[b.i].kind !== "hold");
      for (let a = 0; a < fl.length; a++)
        for (let b = a + 1; b < fl.length; b++) {
          // (multiplex pairs leaving together are checked away from the hand: skip same-launch pairs here)
          if (l.pattern.multiplex) continue;
          brute = Math.min(brute, Math.hypot(fl[a].p.x - fl[b].p.x, fl[a].p.y - fl[b].p.y));
        }
    }
    if (!l.pattern.multiplex) {
      const fo = Math.min(...l.approaches.filter((x) => !x.inHand).map((x) => x.dist));
      assert.ok(Math.abs(brute - fo) < 2e-3, `${ss}: brute ${brute}, closed (flights) ${fo}`);
    }
  }
});

test("ball count is conserved by the animation (5, 531, (4,2x)*, [54]24, 55500)", () => {
  for (const ss of ["5", "531", "(4,2x)*", "[54]24", "55500", "6", "441"]) {
    const l = optimalLayout(ss, P);
    for (let s = 0; s < 3 * l.period; s += 0.013)
      assert.equal(ballsAt(l, s).length, l.pattern.balls, `${ss} at ${s}`);
  }
});

test("every ball is drawn, however long it flies (9, b and z live more than 4 periods)", () => {
  for (const ss of ["8", "9", "b", "z"]) {
    const l = optimalLayout(ss, P);
    for (let s = 0.001; s < 2 * l.period; s += 0.013)
      assert.equal(ballsAt(l, s).length, l.pattern.balls, `${ss} at ${s}`);
  }
  // and the tubes see a long flight's neighbours: the 9-ball cascade grazes, so the nearest is the error zone
  const near = Math.min(
    ...tubes(optimalLayout("9", P), "spacetime").flatMap((t) => t.pts.map((p) => p.near)),
  );
  assert.ok(Math.abs(near - P.errorZone) < 2e-3, `${near}`);
});

test("multiplex: balls thrown together leave from one point, balls caught together land on one point", () => {
  for (const ss of ["[54]24", "[43]23", "[45]", "[33]"]) {
    for (const l of optimalLayouts(ss, P)) {
      for (const a of l.throws)
        for (const b of l.throws) {
          if (a.i >= b.i || a.kind !== "throw" || b.kind !== "throw") continue;
          if (a.hand === b.hand && a.beat === b.beat)
            assert.equal(a.launch.x, b.launch.x, `${ss}: ${a.label} and ${b.label} leave together`);
          const together = a.toHand === b.toHand && Math.abs(a.nextT - b.nextT) % l.period < 1e-9;
          if (together && !(a.hand === b.hand && a.beat === b.beat))
            assert.equal(a.land.x, b.land.x, `${ss}: ${a.label} and ${b.label} land together`);
        }
    }
  }
});

test("short throws are not checked against each other ((2x,2x) once the dwell makes its 2x short); 0 and 20 are handled", () => {
  const l = optimalLayout("(2x,2x)", { ...P, dwellRatio: 0.9 });
  assert.ok(l.throws.every((t) => t.kind === "short"));
  assert.equal(l.collisions.length, 0);
  // at the default dwell its 2x are real throws, mirror images through the middle at one instant: they do meet
  assert.ok(optimalLayout("(2x,2x)", P).collisions.length > 0);
  assert.throws(() => parseSiteswap("0"));
  assert.equal(optimalLayout("20", P).messages.length, 0);
});

test("orbits: as on the siteswap, the mirror halves together (531: {5,1} and {3})", () => {
  const count = (ss) => new Set(orbits(parseSiteswap(ss))).size;
  const p = parseSiteswap("531");
  const o = orbits(p);
  const of = (v) => new Set(p.throws.flatMap((t, i) => (t.v === v ? [o[i]] : [])));
  assert.equal(count("531"), 2);
  assert.deepEqual(of(5), of(1));
  assert.notDeepEqual(of(5), of(3));
  assert.equal(count("7"), 1);
  assert.equal(count("441"), 1);
  assert.equal(count("55500"), 3);
  assert.equal(count("b97531"), 3);
  assert.equal(count("(4,4)"), 2);
});

test("parsing: async, multiplex, sync, star; invalid ones rejected", () => {
  assert.equal(parseSiteswap("531").balls, 3);
  assert.equal(parseSiteswap("531").period, 6);
  assert.equal(parseSiteswap("b97531").balls, 6);
  assert.equal(parseSiteswap("[54]24").balls, 5);
  assert.equal(parseSiteswap("(4,2x)*").balls, 3);
  assert.equal(parseSiteswap("(6x,4)*").balls, 5);
  assert.equal(parseSiteswap("(4,4)").balls, 4);
  assert.equal(parseSiteswap("5").uniform, 5);
  assert.equal(parseSiteswap("531").uniform, null);
  for (const bad of ["532", "(4,2x)", "(3,3)", "[33]1", "54", "", "5x"])
    assert.throws(() => parseSiteswap(bad), bad);
});

test("collisions and messages: a tight fountain collides, nearest feasible spacing found", () => {
  const l = optimalLayout("6", { ...P, arcSpacing: 0.2 });
  assert.ok(l.collisions.length > 0);
  assert.ok(l.messages.some((m) => m.startsWith("Impossible")));
  const nf = nearestFeasible(l.pattern, { ...P, arcSpacing: 0.2 });
  assert.ok(nf.arcSpacing !== undefined && nf.arcSpacing <= 0.4, JSON.stringify(nf));
});

test("tubes: space-time near distances never below the minimum separation; space-only over-reports somewhere", () => {
  const l = optimalLayout("5", P);
  const st = tubes(l, "spacetime");
  const so = tubes(l, "space");
  const minSt = Math.min(...st.flatMap((t) => t.pts.map((p) => p.near)));
  assert.ok(minSt >= l.minSeparation - 1e-3, `${minSt}`);
  // space-only compares with the other arcs anywhere, so where the arcs cross it reports danger the balls miss
  assert.ok(st.some((t, x) => t.pts.some((p, k) => so[x].pts[k].near < p.near - 0.05)));
  assert.equal(optimalLayout("6", P).readout.arcSpacing, startArcSpacing(P), "his P after INIT for six");
});

test("general patterns: the placement search clears 531, 441, 55500, b97531, (4,2x)*, (6x,4)* at the defaults", () => {
  for (const ss of ["531", "441", "55500", "b97531", "(4,2x)*", "(6x,4)*", "[54]24"]) {
    const l = optimalLayout(ss, P);
    console.log(
      `      ${ss.padEnd(8)} min separation ${(l.minSeparation * 100).toFixed(1)} cm, collisions ${l.collisions.length}`,
    );
    assert.equal(l.collisions.length, 0, ss);
  }
});

/** the throws of one hand with value v */
const fives = (l, hand, v = 5) => l.throws.filter((t) => t.hand === hand && t.v === v && t.kind === "throw");
const same = (a, b) =>
  ["launch", "land"].every((k) => Math.abs(a[k].x - b[k].x) < 1e-12 && Math.abs(a[k].y - b[k].y) < 1e-12);

test("one path per kind: 55500's three 5s from each hand are identical, and the layout is mirror-symmetric", () => {
  const l = optimalLayout("55500", P);
  assert.equal(l.collisions.length, 0);
  assert.equal(l.messages.length, 0, "no split needed");
  for (const h of ["L", "R"]) {
    const f = fives(l, h);
    assert.equal(f.length, 3);
    assert.ok(same(f[0], f[1]) && same(f[0], f[2]), `${h} 5s identical`);
  }
  const mp = l.pattern.mirrorPeriod;
  for (const a of l.throws) {
    const b = l.throws.find((t) => t.beat === (a.beat + mp) % l.pattern.period && t.hand !== a.hand);
    assert.ok(b, "mirror partner");
    assert.ok(
      Math.abs(a.launch.x + b.launch.x) < 1e-12 &&
        Math.abs(a.land.x + b.land.x) < 1e-12 &&
        a.land.y === b.land.y,
    );
  }
  // 441: all the 4s from one hand share a path too
  const m = optimalLayout("441", P);
  const fours = fives(m, "R", 4);
  assert.ok(fours.length >= 2 && fours.every((t) => same(t, fours[0])));
});

test("Kalvan's cascades and fountains are unchanged by the kinds: one kind per hand, no split messages, same readouts", () => {
  for (const [s, n] of [
    ["3", 2],
    ["5", 2],
    ["7", 2],
    ["6", 2],
    ["9", 2],
  ]) {
    const l = optimalLayout(s, P);
    assert.equal(l.messages.length, 0, s);
    assert.equal(l.throws.length, n);
    assert.ok(Math.abs(l.throws[0].launch.x + l.throws[1].launch.x) < 1e-12, s);
  }
  shown(optimalLayout("5", S92).readout.throwHeight, 0.52, 2, "5 height");
  shown(optimalLayout("3", S92).minSeparation, 0.1029, 4, "3 min separation, as before");
});

test("a kind splits only when no single path clears: 414 with a 45 cm error zone needs two 4s (at the 0.66 default the split begins at 45 cm; 44 cm still has one path), said in the messages", () => {
  const l = optimalLayout("414", { ...P, errorZone: 0.45 });
  assert.equal(l.collisions.length, 0);
  assert.ok(
    l.messages.some((m) => /No single path for the 4s from/.test(m) && /two throws/.test(m)),
    l.messages.join(),
  );
  const f = fives(l, "R", 4);
  assert.ok(f.length >= 2 && !f.every((t) => same(t, f[0])), "the 4s differ");
  // and at the default zone the same pattern needs no split
  assert.equal(optimalLayout("414", P).messages.length, 0);
});

// INIT in the decompiled Forth (archive/optimal-juggler/forth-listing.txt):
//   F# 9.8 'G F!  7 'BINT !  F# 0.66 'DR F!  F# 0.25 'DIA F!  F# 0.1 'ADIA F!  F# 0.4 'T F!  ... S1  0 '?TR !  0 '?EZ !  -1 '?CO !
test("DEFAULT_PARAMS and the page's start are INIT's values (9.8, 7 balls, 0.66, 0.25, 0.1, 0.4, S1, trace off, zones off)", () => {
  assert.deepEqual(P, { g: 9.8, handPeriod: 0.4, dwellRatio: 0.66, ballDiameter: 0.1, errorZone: 0.25 });
  assert.equal(START_SITESWAP, "7");
  assert.equal(START_SPEED, 1);
  assert.equal(START_TRACE, false);
  assert.equal(START_ZONES, false);
  const r = optimalLayout(START_SITESWAP, P);
  assert.equal(r.pattern.balls, 7);
  // oj_hand.py's evaluation of INIT's state: 7 balls, H 1.5973, throw at 0.2086, catch at -0.5014
  assert.ok(Math.abs(r.kalvan.throwHeight - 1.597339524) < 1e-9);
  // even counts start at his cascade P (CASCADE ran in CALC after INIT)
  assert.ok(Math.abs(startArcSpacing(P) - r.kalvan.arcSpacing) < 1e-12);
});

test("Kalvan's orientation: throws leave from the inside and land outside, crossing or straight", () => {
  const inside = (text, v, cross) => {
    const l = optimalLayout(text);
    const ts = l.throws.filter((t) => t.kind === "throw" && t.v === v && (t.hand !== t.toHand) === cross);
    assert.ok(ts.length, `${text}: no ${v}${cross ? "x" : ""}`);
    for (const t of ts)
      assert.ok(
        Math.abs(t.launch.x) < Math.abs(t.land.x),
        `${text} ${t.label}: launch ${t.launch.x}, land ${t.land.x}`,
      );
    assert.ok(!l.messages.some((m) => /reverse-cascade/.test(m)), l.messages.join(" "));
    assert.ok(l.collisions.length === 0);
  };
  inside("(6x,4)*", 6, true);
  inside("(6x,4)*", 4, false);
  inside("(4,2x)*", 2, true);
  inside("(4,2x)*", 4, false);
  inside("55500", 5, true);
});

// ----- the options (several clear layouts, ranked by hand travel and the small terms) -----

test("hand travel is the chord sum: each catch point to that hand's next throw point; Kalvan's 5 and 6 give 2E per period", () => {
  for (const ss of ["531", "[54]24", "(6x,4)*"]) {
    const l = optimalLayout(ss, P);
    let s = 0;
    for (const h of ["L", "R"]) {
      const pts = l.hands[h].points;
      pts.forEach((p, k) => {
        if (p.kind !== "catch") return;
        const q = [...pts.slice(k + 1), ...pts.slice(0, k + 1)].find((x) => x.kind === "throw");
        s += Math.hypot(p.p.x - q.p.x, p.p.y - q.p.y);
      });
    }
    assert.ok(Math.abs(s - handTravel(l.hands)) < 1e-12 && Math.abs(s - l.option.travel) < 1e-12, ss);
  }
  // period of 5 and 6: two beats, one catch and one throw per hand, each the hand move E (= F in the fountain)
  for (const b of ["5", "6", "7"]) {
    const l = optimalLayout(b, S92);
    assert.ok(
      Math.abs(l.option.travel - 2 * l.kalvan.handMove) < 1e-9,
      `${b}: ${l.option.travel} vs 2E ${2 * l.kalvan.handMove}`,
    );
    assert.equal(l.option.points, 4, "two points per hand");
  }
});

const samePoints = (a, b) =>
  a.throws.every((t, i) =>
    ["launch", "land"].every((k) => Math.hypot(t[k].x - b.throws[i][k].x, t[k].y - b.throws[i][k].y) < 0.01),
  );

test("the default is the lowest-cost clear layout; every option clears, options are distinct (1 cm), at most 4", () => {
  for (const ss of ["531", "441", "55500", "b97531", "(4,2x)*", "(6x,4)*", "[54]24"]) {
    const os = optimalLayouts(ss, P);
    assert.ok(os.length >= 1 && os.length <= 4, ss);
    os.forEach((o, k) => {
      assert.equal(o.collisions.length, 0, `${ss} option ${k}`);
      if (k) assert.ok(os[k - 1].option.cost <= o.option.cost + 1e-12, `${ss}: ranked by cost`);
      for (let j = 0; j < k; j++) assert.ok(!samePoints(os[j], o), `${ss}: options ${j} and ${k} differ`);
    });
    assert.ok(samePoints(optimalLayout(ss, P), os[0]), `${ss}: optimalLayout is option A`);
    const t = os.map((o) => `${(o.minSeparation * 100).toFixed(1)}/${o.option.travel.toFixed(2)}`).join("  ");
    console.log(`      ${ss.padEnd(8)} ${os.length} options (cm / m travel): ${t}`);
  }
});

test("531 and 55500 have at least two distinct options at the defaults", () => {
  for (const ss of ["531", "55500"]) assert.ok(optimalLayouts(ss, P).length >= 2, ss);
});

test("Kalvan's cascades and fountains bypass the search: one option, his readouts", () => {
  for (const b of ["3", "5", "6", "7", "9"]) {
    const os = optimalLayouts(b, P);
    assert.equal(os.length, 1, b);
    assert.deepEqual(os[0].option.starts, ["Kalvan"]);
    assert.equal(os[0].searched, false);
  }
  shown(optimalLayouts("5", S92)[0].readout.handMove, 0.29, 2, "5 hand move");
  shown(optimalLayouts("6", { ...S92, arcSpacing: 0.71 })[0].readout.throwVelocity, 4.12, 2, "6 velocity");
});

test("a chosen option is followed: passed back as the hint, the search ends on it again ('previous')", () => {
  const os = optimalLayouts("55500", P);
  const b = os[1];
  const again = optimalLayouts("55500", P, { hint: b });
  const k = again.findIndex((o) => o.option.starts.includes("previous"));
  assert.ok(k >= 0, "the hint's search clears");
  assert.ok(samePoints(again[k], b), "and ends where it started");
});

console.log(fails ? `${fails} failed` : "all passed");
process.exit(fails ? 1 : 0);
