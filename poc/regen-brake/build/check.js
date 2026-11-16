// JS 평가기 ↔ Python 예측 일치 검증 + 1 ms 시뮬레이터 실측 대비 검증
// Usage: node build/check.js   (poc/regen-brake 에서 실행)  → build/sim_valid.json 생성
const fs = require('fs');
const path = require('path');
const RB = require('../src/core.js');
const M = JSON.parse(fs.readFileSync(path.join(__dirname, 'model.json'), 'utf8'));
const TS = JSON.parse(fs.readFileSync(path.join(__dirname, 'ts.json'), 'utf8'));

// 1) parity
const mdl = RB.makeModel(M);
let maxDiff = 0;
for (const s of M.parity) {
  const r = mdl.predictRaw(s.x);
  for (const k of Object.keys(s.y)) maxDiff = Math.max(maxDiff, Math.abs(r[k] - s.y[k]));
}
console.log(`[parity] JS vs Python max |diff| = ${maxDiff.toExponential(2)} over ${M.parity.length} samples`);
if (maxDiff > 1e-6) { console.error('PARITY FAIL'); process.exit(1); }

// 2) 최적화 결과가 격자 위에 있는지
const grid = Object.values(M.grid);
const onGrid = M.cmap.filter(c => c.p.every((v, i) => grid[i].includes(v))).length;
console.log(`[opt] cmap params on grid: ${onGrid}/${M.cmap.length}`);

// 3) simulator vs measured (overlap events, measured demand replay)
const sc = M.ts_meta.cols;
const res = [];
for (const e of TS.filter(t => t.ev)) {
  const dem = e.decel_demand_mps2.map(v => v / sc.decel_demand_mps2);
  const meas = e.decel_meas_mps2.map(v => v / sc.decel_meas_mps2);
  const sim = RB.simulate({
    v0: e.speed_kmh[0] / sc.speed_kmh, mass: e.ev.mass, mu: e.ev.mu, soc: e.ev.soc, grade: e.ev.grade,
    params: e.ev.p, demand: { dt: e.dt, a: dem }, outDt: e.dt, tMax: e.n * e.dt,
  });
  const n = Math.min(sim.a.length, meas.length);
  let se = 0, cnt = 0;
  for (let i = 0; i < n; i++) {
    if (e.speed_kmh[i] / sc.speed_kmh < 1) continue;
    se += (sim.a[i] - meas[i]) ** 2; cnt++;
  }
  const rmse = Math.sqrt(se / Math.max(1, cnt));
  const regM = e.regen_torque_act_nm.map(v => v * RB.VEH.KT);
  let seR = 0;
  for (let i = 0; i < n; i++) seR += (sim.Fr[i] - regM[i]) ** 2;
  res.push({ id: e.id, rmse: +rmse.toFixed(4), regen_rmse_n: Math.round(Math.sqrt(seR / n)),
             jerk_blend_meas: e.ev.jerk_blend, jerk_blend_sim: +sim.metrics.jerkBlend.toFixed(3),
             rec_meas: e.ev.rec, rec_sim: +sim.metrics.recovery.toFixed(3) });
}
const mean = a => a.reduce((s, v) => s + v, 0) / a.length;
console.table(res);
console.log(`[sim] decel RMSE mean = ${mean(res.map(r => r.rmse)).toFixed(3)} m/s²`);

// 4) lead 감도 (U자 확인)
const base = { v0: 60, target: 2.5, apply: 0.6, mass: 2250, mu: 0.9, soc: 60, grade: 0 };
const sweep = [0, 20, 40, 60, 80, 100, 130, 160, 200].map(L => {
  const s = RB.simulate({ ...base, params: [0.9, 14, L, 30000] });
  return { lead: L, jerkBlend: +s.metrics.jerkBlend.toFixed(3), err: +s.metrics.errRms.toFixed(4), rec: +s.metrics.recovery.toFixed(3) };
});
console.table(sweep);
const t0 = Date.now();
RB.simulate({ ...base, params: [0.9, 14, 80, 30000] });
console.log(`[perf] one 1 ms simulation: ${Date.now() - t0} ms`);
fs.writeFileSync(path.join(__dirname, 'sim_valid.json'), JSON.stringify({ events: res, rmse_mean: mean(res.map(r => r.rmse)) }));
