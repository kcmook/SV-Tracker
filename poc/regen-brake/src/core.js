/* 회생 제동 협조 제어 PoC — 모델 평가기 · 최적화기 · 1 ms 시뮬레이터
 * 브라우저(window.RB)와 Node(module.exports) 양쪽에서 동작한다.
 * 차량 상수는 100 Hz 실측 시계열에서 추정 (build/prepare.py 주석 및 README 참고).
 */
(function (root) {
  'use strict';

  // ------------------------------------------------------------ 대리모델 (2차 Ridge)
  function makeModel(M) {
    const F = M.feats.length;
    const pairs = [];
    for (let i = 0; i < F; i++) for (let j = i + 1; j < F; j++) pairs.push([i, j]);
    const keys = Object.keys(M.models);
    const W = keys.map(k => Float64Array.from(M.models[k].w));
    const B = keys.map(k => M.models[k].b);
    const z = new Float64Array(F);

    function predictRaw(x) {           // x: FEATS 순서 원값 → 변환공간 예측 {jerk:log, err:log, rec, comfort}
      for (let i = 0; i < F; i++) z[i] = (x[i] - M.mu[i]) / M.sd[i];
      const out = {};
      for (let t = 0; t < keys.length; t++) {
        const w = W[t];
        let s = B[t], p = 0;
        for (let i = 0; i < F; i++) s += w[i] * z[i] + w[F + i] * z[i] * z[i];
        p = 2 * F;
        for (let q = 0; q < pairs.length; q++) s += w[p + q] * z[pairs[q][0]] * z[pairs[q][1]];
        out[keys[t]] = s;
      }
      return out;
    }
    function toOut(r) {
      return { jerk: Math.exp(r.jerk), err: Math.exp(r.err), rec: r.rec, comfort: r.comfort };
    }
    function predict(x) { return toOut(predictRaw(x)); }
    function cost(r, w) {
      const m = M.models;
      return w.jerk * r.jerk / m.jerk.sd + w.err * r.err / m.err.sd
        - w.rec * r.rec / m.rec.sd - w.comfort * r.comfort / m.comfort.sd;
    }
    // prepare.py optimize() 와 동일한 규칙의 격자 탐색
    function optimize(cond, ref, opts) {
      opts = opts || {};
      const w = opts.weights || M.weights;
      const cap = opts.lowmuCap != null ? opts.lowmuCap : M.lowmu_cap;
      const tol = opts.errTol != null ? opts.errTol : M.err_tol;
      const muIdx = M.feats.indexOf('mu_estimate');
      const x = cond.slice();
      x[0] = ref[0]; x[1] = ref[1]; x[2] = ref[2]; x[3] = ref[3];
      const r0 = predictRaw(x), J0 = cost(r0, w);
      const g = M.grid, gs = g.regen_share_max, gb = g.blend_out_speed_kmh, gl = g.hyd_lead_ms, gr = g.regen_rate_limit_nps;
      let best = null, bestJ = Infinity, bestR = null, n = 0;
      const lowmu = cond[muIdx] < 0.4;
      for (const a of gs) {
        if (lowmu && a > cap + 1e-9) continue;
        for (const b of gb) for (const c of gl) for (const d of gr) {
          x[0] = a; x[1] = b; x[2] = c; x[3] = d; n++;
          const r = predictRaw(x);
          if (r.err > r0.err + Math.log(tol)) continue;
          const J = cost(r, w);
          if (J < bestJ) { bestJ = J; best = [a, b, c, d]; bestR = r; }
        }
      }
      if (!best || bestJ >= J0) return { params: ref.slice(), ai: toOut(r0), base: toOut(r0), J: J0, J0, n, kept: true };
      return { params: best, ai: toOut(bestR), base: toOut(r0), J: bestJ, J0, n, kept: false };
    }
    return { predictRaw, predict, optimize, cost, keys };
  }

  // ------------------------------------------------------------ 1 ms 협조 제어 시뮬레이터
  const VEH = {
    KT: 26.83,          // N per N·m  (회생 토크 → 노면 제동력, 실측 회귀)
    KH: 82.69,          // N per bar  (유압 → 제동력, 실측 회귀)
    TMAX: 280,          // N·m  모터 회생 토크 한계
    PMAX: 150e3,        // W    회생 전력 한계
    RW: 0.0367,         // m/s per rad/s (휠속/모터각속도)
    V_END: 2.9,         // km/h 회생 완전 종료 속도
    HYD_DEAD: 0.030,    // s    유압 무효시간
    HYD_TAU: 0.070,     // s    유압 1차 지연
    MOT_TAU: 0.010,     // s    모터 토크 응답
    ACC_TAU: 0.012,     // s    가속도 센서 필터
    CRR: 0.009, CDA: 0.70, RHO: 1.2, G: 9.81, ETA: 0.90,
  };

  function clamp(v, a, b) { return v < a ? a : v > b ? b : v; }

  /**
   * opts: { v0 (km/h), target (m/s²), apply (s), mass, mu, soc, grade (%), modulation (0/1),
   *         params: [share, blendOut km/h, lead ms, rate N/s], demand?: {dt, a:[]} (실측 요구감속 재생),
   *         dt (기본 0.001), outDt (기본 0.01), tMax }
   */
  function simulate(o) {
    const V = VEH, dt = o.dt || 0.001, outEvery = Math.round((o.outDt || 0.01) / dt);
    const m = o.mass, g = V.G, mu = o.mu, grade = (o.grade || 0) / 100;
    const [share, blendOut, leadMs, rate] = o.params;
    const lead = leadMs / 1000;
    const socDer = o.soc > 90 ? Math.max(0.05, 1 - (o.soc - 90) / 8) : 1;   // 고 SOC 충전 제한
    const gripR = 0.58 * m * g * mu * 0.85;           // 회생 축(전륜) 접지 한계
    const gripT = m * g * mu * 0.95;                  // 전체 접지 한계 (ABS 개입)
    const hydDelayN = Math.round(V.HYD_DEAD / dt);
    const hydBuf = new Float64Array(hydDelayN + 1);
    let hb = 0;

    let v = o.v0 / 3.6, t = 0, x = 0;
    let Fr = 0, FrCmd = 0, Fh = 0, aF = 0, aPrev = 0, jF = 0;
    let Ereg = 0, Efric = 0, absOn = 0, stopT = null;
    let errSq = 0, errN = 0, jBlend = 0, jPeak = 0, jStop = 0;
    const out = { t: [], v: [], aDem: [], a: [], j: [], Fr: [], Fh: [], blend: [], abs: [] };
    const tMax = o.tMax || 25;
    const demand = o.demand;
    let modPhase = 0;

    function aDemand(t, vk) {
      if (demand) {
        const k = t / demand.dt, i = Math.floor(k);
        if (i >= demand.a.length - 1) return demand.a[demand.a.length - 1] || 0;
        return demand.a[i] + (demand.a[i + 1] - demand.a[i]) * (k - i);
      }
      const T = Math.max(0.05, o.apply);
      let a = t < T ? o.target * 0.5 * (1 - Math.cos(Math.PI * t / T)) : o.target;
      if (o.modulation && t > T) a *= 1 + 0.12 * Math.sin(2 * Math.PI * 0.9 * (t - T) + modPhase);
      if (vk < 6) a *= 0.55 + 0.45 * vk / 6;          // 정차 직전 운전자 완화
      return a;
    }
    function regenAvail(vk) {
      if (vk <= V.V_END) return 0;
      const s = vk >= blendOut ? 1 : (vk - V.V_END) / Math.max(0.5, blendOut - V.V_END);
      const w = (vk / 3.6) / V.RW;
      const T = Math.min(V.TMAX * socDer, V.PMAX / Math.max(w, 1));
      return Math.min(T * V.KT, gripR) * s;
    }

    let step = 0;
    while (t < tMax) {
      const vk = v * 3.6;
      const moving = v > 0.01;
      const aD = moving ? aDemand(t, vk) : 0;
      const Fres = moving ? V.CRR * m * g + 0.5 * V.RHO * V.CDA * v * v : 0;
      const Fgrade = m * g * grade;
      const Fdem = Math.max(0, m * aD - Fres - Fgrade);

      // (1) 회생 우선 배분: 요구 × share 상한, 가용 회생 한계, 변화율 제한
      const target = Math.min(share * m * aD, Fdem, regenAvail(vk));
      const dmax = rate * dt;
      FrCmd += clamp(target - FrCmd, -dmax, dmax);
      Fr += (FrCmd - Fr) * (dt / (V.MOT_TAU + dt));

      // (2) 유압 보완: lead 만큼 앞선 속도에서의 회생 계획을 예측해 미리 채움
      const vFut = Math.max(0, vk - aD * lead * 3.6);
      const planFut = Math.min(share * m * aD, Fdem, regenAvail(vFut));
      const FrRef = Math.min(FrCmd, planFut);
      const FhCmd = Math.max(0, Fdem - FrRef);
      hydBuf[hb] = FhCmd; hb = (hb + 1) % hydBuf.length;
      const FhDelayed = hydBuf[hb];
      Fh += (FhDelayed - Fh) * (dt / (V.HYD_TAU + dt));

      // (3) 접지 한계 → ABS
      let Fb = Fr + Fh, absNow = 0;
      if (Fb > gripT && moving) { absNow = 1; absOn = 1; Fb = gripT * (0.86 + 0.1 * Math.sin(2 * Math.PI * 7 * t)); }

      const a = moving ? (Fb + Fres + Fgrade) / m : 0;
      const vNew = Math.max(0, v - a * dt);
      if (moving) {
        Ereg += Math.min(Fr, Fb) * v * dt * V.ETA;
        Efric += Math.max(0, Fb - Fr) * v * dt;
        x += v * dt;
      }
      if (v > 0.01 && vNew <= 0.01 && stopT == null) stopT = t;
      v = vNew;

      aF += (a - aF) * (dt / (V.ACC_TAU + dt));
      const j = (aF - aPrev) / dt; aPrev = aF;
      jF += (j - jF) * (dt / (0.008 + dt));
      const inBlend = moving && aD > 0.3 && vk < blendOut + 0.5 && vk > V.V_END - 0.5 && Fr > 50;
      if (moving && t > 0.02) {
        if (inBlend) jBlend = Math.max(jBlend, Math.abs(jF));
        jPeak = Math.max(jPeak, Math.abs(jF));
        if (vk > 1) { errSq += (aF - (aD > 0 ? Math.max(aD, (Fres + Fgrade) / m) : 0)) ** 2; errN++; }
      }
      if (!moving && stopT != null && t - stopT < 0.4) jStop = Math.max(jStop, Math.abs(jF));

      if (step % outEvery === 0) {
        out.t.push(+t.toFixed(3)); out.v.push(vk); out.aDem.push(aD); out.a.push(aF); out.j.push(jF);
        out.Fr.push(Fr); out.Fh.push(Fh); out.blend.push(inBlend ? 1 : 0); out.abs.push(absNow);
      }
      step++; t += dt;
      if (stopT != null && t - stopT > 0.6) break;
    }
    const Ek = 0.5 * m * (o.v0 / 3.6) ** 2;
    out.metrics = {
      jerkBlend: jBlend, jerkPeak: Math.max(jPeak, jStop), jerkStop: jStop,
      errRms: Math.sqrt(errSq / Math.max(1, errN)),
      eRegWh: Ereg / 3600, eFricWh: Efric / 3600, recovery: Ereg / Ek,
      stopTime: stopT, stopDist: x, abs: absOn, steps: step,
    };
    return out;
  }

  const api = { makeModel, simulate, VEH };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RB = api;
})(typeof window !== 'undefined' ? window : globalThis);
