"""회생 제동 협조 제어 PoC — 전처리 · 대리모델 학습 · 최적화 · JSON 내보내기.

Usage:  python3 build/prepare.py        (poc/regen-brake 에서 실행)
의존성: pandas, numpy 만 사용 (시드 고정, 재실행 시 동일 결과)
출력:   build/model.json, build/ts.json
"""
from __future__ import annotations

import json
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[1]
DATA = ROOT / "data"
OUT = ROOT / "build"
RNG = np.random.default_rng(42)

# ---------------------------------------------------------------- 1. 로드·조인
ev = pd.read_csv(DATA / "brake_events_lite.csv", encoding="utf-8-sig")
drv = pd.read_csv(DATA / "drivers_lite.csv", encoding="utf-8-sig")
veh = pd.read_csv(DATA / "vehicles_lite.csv", encoding="utf-8-sig")
cal = pd.read_csv(DATA / "calibrations_lite.csv", encoding="utf-8-sig")
ts = pd.read_csv(DATA / "brake_timeseries_100hz_lite.csv", encoding="utf-8-sig")

raw_missing = {c: int(v) for c, v in ev.isna().sum().items() if v > 0}
ev = ev.merge(drv, on="driver_id", how="left").merge(veh, on="vehicle_id", how="left")
train = ev["split"].eq("train")

# ---------------------------------------------------------------- 2. 정제
for col in ["mu_estimate", "pad_temp_c", "t_battery_c"]:
    ev[f"{col}_missing"] = ev[col].isna().astype(int)
    med = ev.loc[train].groupby("rain_sensor")[col].median()
    ev[col] = ev[col].fillna(ev["rain_sensor"].map(med))
ev["recovery_ratio_c"] = ev["recovery_ratio"].clip(0, 1.2)  # 13건 >1 (센서 이상) 클리핑
ev["road"] = np.where(ev.mu_estimate < 0.4, "low", np.where(ev.rain_sensor == 1, "wet", "dry"))

P = ["regen_share_max", "blend_out_speed_kmh", "hyd_lead_ms", "regen_rate_limit_nps"]
C = ["initial_speed_kmh", "decel_target_mps2", "pedal_apply_time_s", "pedal_modulation_flag",
     "emergency_flag", "mass_est_kg", "road_grade_pct", "soc_pct", "t_battery_c", "t_ambient_c",
     "rain_sensor", "pad_temp_c", "mu_estimate", "pad_wear_pct", "brake_fluid_age_months",
     "years_driving"]
FEATS = P + C
NOISE = ["radio_volume", "hour_of_day", "wiper_on", "passengers"]

# ---------------------------------------------------------------- 3. 운전자 습관 군집
prof = ev.groupby("driver_id").agg(
    apply_s=("pedal_apply_time_s", "mean"), decel=("decel_target_mps2", "mean"),
    modul=("pedal_modulation_flag", "mean"), emerg=("emergency_flag", "mean"),
    n=("event_id", "size")).reset_index().merge(drv, on="driver_id")
H = ["apply_s", "decel", "modul"]
Hz = ((prof[H] - prof[H].mean()) / prof[H].std()).values


def kmeans(X, k, iters=100):
    # 결정적 초기화: apply_s 분위 + modulation 최대
    order = np.argsort(X[:, 0])
    cent = [X[order[int(q * (len(X) - 1))]] for q in np.linspace(0.1, 0.9, k - 1)]
    cent.append(X[np.argmax(X[:, 2])])
    cent = np.array(cent)
    for _ in range(iters):
        lab = np.argmin(((X[:, None, :] - cent[None]) ** 2).sum(-1), 1)
        new = np.array([X[lab == j].mean(0) if (lab == j).any() else cent[j] for j in range(k)])
        if np.allclose(new, cent):
            break
        cent = new
    return lab, cent


lab, cent = kmeans(Hz, 4)
prof["cluster"] = lab
cs = prof.groupby("cluster")[H].mean()
# 이름 붙이기: modulation 최대 → modulating, 나머지 apply_s 순 → aggressive < normal < smooth
names = {}
mod_c = cs["modul"].idxmax()
names[mod_c] = "modulating"
rest = cs.drop(mod_c).sort_values("apply_s").index.tolist()
for c_, nm in zip(rest, ["aggressive", "normal", "smooth"]):
    names[c_] = nm
prof["drv_type"] = prof["cluster"].map(names)
ev = ev.merge(prof[["driver_id", "drv_type"]], on="driver_id")

# ---------------------------------------------------------------- 4. 대리모델 (2차 Ridge)
X0 = ev[FEATS].astype(float).values
mu, sd = X0[train].mean(0), X0[train].std(0)
NF = len(FEATS)
PAIRS = [(i, j) for i in range(NF) for j in range(i + 1, NF)]


def expand(Z):
    return np.hstack([Z, Z ** 2, np.stack([Z[:, i] * Z[:, j] for i, j in PAIRS], 1)])


def ridge(X, y, lam):
    xm, ym = X.mean(0), y.mean()
    Xc = X - xm
    w = np.linalg.solve(Xc.T @ Xc + lam * np.eye(X.shape[1]), Xc.T @ (y - ym))
    return w, ym - xm @ w


def r2(y, p):
    return float(1 - ((y - p) ** 2).sum() / ((y - y.mean()) ** 2).sum())


Zall = (X0 - mu) / sd
Xall = expand(Zall)
TARGETS = {
    "jerk": ("jerk_blend_peak_mps3", "log"),
    "err": ("decel_error_rms_mps2", "log"),
    "rec": ("recovery_ratio_c", "id"),
    "comfort": ("comfort_score", "id"),
}
LAMS = [0.3, 1, 3, 10, 30, 100, 300, 1000]
models, preds = {}, {}
fold = RNG.integers(0, 5, len(ev))
for key, (col, tf) in TARGETS.items():
    y = ev[col].values.astype(float)
    y = np.log(y) if tf == "log" else y
    ok = ~np.isnan(y)
    trm = train.values & ok
    cv = []
    for lam in LAMS:
        s = []
        for f in range(5):
            a, b = trm & (fold != f), trm & (fold == f)
            w, b0 = ridge(Xall[a], y[a], lam)
            s.append(r2(y[b], Xall[b] @ w + b0))
        cv.append(np.mean(s))
    lam = LAMS[int(np.argmax(cv))]
    w, b0 = ridge(Xall[trm], y[trm], lam)
    p = Xall @ w + b0
    te = (~train.values) & ok
    yt, pt = y[te], p[te]
    back = np.exp if tf == "log" else (lambda v: v)
    models[key] = dict(col=col, tf=tf, lam=lam, cv_r2=round(float(max(cv)), 4),
                       w=[round(float(v), 7) for v in w], b=round(float(b0), 7),
                       sd=float(y[trm].std()),
                       r2_test=round(r2(yt, pt), 4), r2_train=round(r2(y[trm], p[trm]), 4),
                       mae_test=round(float(np.abs(back(yt) - back(pt)).mean()), 4),
                       n_train=int(trm.sum()), n_test=int(te.sum()))
    preds[key] = p
    print(f"[model] {key:8s} λ={lam:<5} cvR²={max(cv):.3f} testR²={models[key]['r2_test']:.3f} "
          f"MAE={models[key]['mae_test']}")


def predict_all(Z):
    X = expand(Z)
    return {k: X @ np.array(m["w"]) + m["b"] for k, m in models.items()}


# 순열 중요도 (test, 원변수 단위, 평균 R² 하락)
imp = {k: {} for k in models}
te_idx = np.where(~train.values)[0]
for k, m in models.items():
    col, tf = m["col"], m["tf"]
    y = ev[col].values.astype(float)
    y = np.log(y) if tf == "log" else y
    ok = te_idx[~np.isnan(y[te_idx])]
    base = r2(y[ok], preds[k][ok])
    for j, f in enumerate(FEATS):
        Z = Zall[ok].copy()
        Z[:, j] = Z[RNG.permutation(len(ok)), j]
        p = expand(Z) @ np.array(m["w"]) + m["b"]
        imp[k][f] = round(max(0.0, base - r2(y[ok], p)), 4)

# ---------------------------------------------------------------- 5. 최적화 (격자 탐색)
GRID = dict(
    regen_share_max=[round(v, 2) for v in np.arange(0.30, 1.0001, 0.05)],
    blend_out_speed_kmh=[6, 8, 10, 12, 14, 16, 18, 21, 25],
    hyd_lead_ms=[0, 20, 40, 60, 80, 100, 130, 160, 200],
    regen_rate_limit_nps=[5000, 8000, 12000, 17000, 24000, 33000, 45000, 60000],
)
G = np.array(np.meshgrid(*GRID.values(), indexing="ij")).reshape(4, -1).T  # (9720, 4)
WEIGHTS = dict(jerk=0.40, err=0.25, rec=0.15, comfort=0.20)
LOWMU_SHARE_CAP = 0.60
ERR_TOL = 1.00  # AI 추천 감속오차 ≤ 기준 CAL 예측값 × ERR_TOL


def cost(pr, wts=WEIGHTS):
    return (wts["jerk"] * pr["jerk"] / models["jerk"]["sd"] + wts["err"] * pr["err"] / models["err"]["sd"]
            - wts["rec"] * pr["rec"] / models["rec"]["sd"] - wts["comfort"] * pr["comfort"] / models["comfort"]["sd"])


def optimize(cond_row, ref_params):
    """cond_row: FEATS 순서 원값 벡터(파라미터 자리는 무시). 반환: best params, preds(best), preds(ref)."""
    Xr = np.tile(cond_row, (len(G) + 1, 1)).astype(float)
    Xr[:-1, :4] = G
    Xr[-1, :4] = ref_params
    pr = predict_all((Xr - mu) / sd)
    J = cost(pr)
    ref_err = pr["err"][-1]
    bad = pr["err"][:-1] > ref_err + np.log(ERR_TOL)
    if cond_row[FEATS.index("mu_estimate")] < 0.4:
        bad |= G[:, 0] > LOWMU_SHARE_CAP
    Jg = np.where(bad, np.inf, J[:-1])
    i = int(np.argmin(Jg))
    if not np.isfinite(Jg[i]) or Jg[i] >= J[-1]:  # 개선 불가 → 기준 유지
        return ref_params, {k: float(v[-1]) for k, v in pr.items()}, {k: float(v[-1]) for k, v in pr.items()}
    return G[i], {k: float(v[i]) for k, v in pr.items()}, {k: float(v[-1]) for k, v in pr.items()}


def to_out(pr):
    return dict(jerk=float(np.exp(pr["jerk"])), err=float(np.exp(pr["err"])), rec=pr["rec"], comfort=pr["comfort"])


# test 중 고정 캘리브레이션(CAL) 이벤트: 기존 vs AI
tst = ev[(~train) & (ev.calibration_id != "DOE")].copy()
rows = []
for _, r in tst.iterrows():
    cond = r[FEATS].astype(float).values
    ref = r[P].astype(float).values
    best, pb, p0 = optimize(cond, ref)
    a, b = to_out(p0), to_out(pb)
    rows.append(dict(id=int(r.event_id), cal=r.calibration_id, road=r.road, dtype=r["drv_type"],
                     base=[round(a[k], 4) for k in ("jerk", "err", "rec", "comfort")],
                     ai=[round(b[k], 4) for k in ("jerk", "err", "rec", "comfort")],
                     act=[round(float(r.jerk_blend_peak_mps3), 4), round(float(r.decel_error_rms_mps2), 4),
                          round(float(r.recovery_ratio_c), 4),
                          None if pd.isna(r.comfort_score) else int(r.comfort_score)],
                     p=[float(v) for v in best],
                     ke_wh=round(float(0.5 * r.mass_est_kg * (r.initial_speed_kmh / 3.6) ** 2 / 3600), 2)))
print(f"[opt] test CAL events optimized: {len(rows)}")

# 최적 고정 CAL (test CAL 이벤트 전체에 하나의 CAL 적용 시 평균 비용 최소)
cal_cost = {}
Xc = tst[FEATS].astype(float).values
for _, c in cal.iterrows():
    Xx = Xc.copy()
    Xx[:, :4] = [c.share_max, c.blend_out_kmh, c.lead_ms, c.regen_rate]
    pr = predict_all((Xx - mu) / sd)
    cal_cost[c.calibration_id] = dict(
        cost=round(float(cost(pr).mean()), 4),
        jerk=round(float(np.exp(pr["jerk"]).mean()), 4), err=round(float(np.exp(pr["err"]).mean()), 4),
        rec=round(float(pr["rec"].mean()), 4), comfort=round(float(pr["comfort"].mean()), 4))
best_fixed = min(cal_cost, key=lambda k: cal_cost[k]["cost"])
print(f"[opt] best single fixed CAL = {best_fixed}")

# AI 캘리브레이션 맵: 운전자 유형 × 노면 (각 셀 중앙 조건, 기준 = 최적 고정 CAL)
bf = cal.set_index("calibration_id").loc[best_fixed]
bf_params = np.array([bf.share_max, bf.blend_out_kmh, bf.lead_ms, bf.regen_rate], float)
cmap = []
for dt in ["smooth", "normal", "aggressive", "modulating"]:
    for rd in ["dry", "wet", "low"]:
        sub = ev[(ev.drv_type == dt) & (ev.road == rd)]
        if len(sub) < 10:
            continue
        cond = sub[FEATS].median().values.astype(float)
        cond[FEATS.index("pedal_modulation_flag")] = round(sub.pedal_modulation_flag.mean())
        cond[FEATS.index("emergency_flag")] = 0
        cond[FEATS.index("rain_sensor")] = 1.0 if rd == "wet" else round(sub.rain_sensor.mean())
        best, pb, p0 = optimize(cond, bf_params)
        a, b = to_out(p0), to_out(pb)
        cmap.append(dict(dtype=dt, road=rd, n=int(len(sub)), p=[float(v) for v in best],
                         base=[round(a[k], 4) for k in ("jerk", "err", "rec", "comfort")],
                         ai=[round(b[k], 4) for k in ("jerk", "err", "rec", "comfort")]))

# 부분의존(PD): 파라미터별 곡선 (나머지 = train 실제 조건, 평균)
pd_curves = {}
sample = ev[train].sample(600, random_state=1)
Xs = sample[FEATS].astype(float).values
for j, pname in enumerate(P):
    xs = np.linspace(min(GRID[pname]), max(GRID[pname]), 15)
    out = {k: [] for k in models}
    for v in xs:
        Xx = Xs.copy()
        Xx[:, j] = v
        pr = predict_all((Xx - mu) / sd)
        for k in models:
            val = np.exp(pr[k]) if models[k]["tf"] == "log" else pr[k]
            out[k].append(round(float(val.mean()), 4))
    pd_curves[pname] = dict(x=[round(float(v), 3) for v in xs], **out)

# ---------------------------------------------------------------- 6. EDA 요약
corr_vars = P + ["decel_target_mps2", "pedal_apply_time_s", "pedal_modulation_flag", "emergency_flag",
                 "mu_estimate", "soc_pct", "t_ambient_c", "road_grade_pct"] + NOISE
corr_out = ["jerk_blend_peak_mps3", "decel_error_rms_mps2", "recovery_ratio_c", "comfort_score"]
cm = ev[corr_vars + corr_out].corr().loc[corr_vars, corr_out].round(3)
road_stats = []
for rd in ["dry", "wet", "low"]:
    s = ev[ev.road == rd]
    road_stats.append(dict(road=rd, n=int(len(s)),
                           jerk=s.jerk_blend_peak_mps3.quantile([.1, .25, .5, .75, .9]).round(3).tolist(),
                           err=s.decel_error_rms_mps2.quantile([.1, .25, .5, .75, .9]).round(4).tolist(),
                           rec=s.recovery_ratio_c.quantile([.1, .25, .5, .75, .9]).round(3).tolist(),
                           abs_rate=round(float(s.abs_active.mean()), 4),
                           mu=round(float(s.mu_estimate.median()), 3)))
hist = {}
for col, bins in [("jerk_blend_peak_mps3", np.r_[np.arange(0, 15.5, 0.5), 80]),
                  ("comfort_score", np.arange(0.5, 11, 1)),
                  ("recovery_ratio_c", np.arange(0, 1.25, 0.05))]:
    h, b = np.histogram(ev[col].dropna(), bins=bins)
    hist[col] = dict(edges=[round(float(v), 3) for v in b], counts=h.tolist())

# 실제 vs 예측 산점도 (test, 최대 400점)
scatter = {}
for k, m in models.items():
    y = ev[m["col"]].values.astype(float)
    ok = te_idx[~np.isnan(y[te_idx])]
    pick = RNG.choice(ok, min(400, len(ok)), replace=False)
    pv = np.exp(preds[k][pick]) if m["tf"] == "log" else preds[k][pick]
    scatter[k] = [[round(float(y[i]), 3), round(float(v), 3)] for i, v in zip(pick, pv)]

# 조건 입력 기본값/범위 (시뮬레이터 UI)
cond_ranges = {f: dict(min=round(float(ev[f].quantile(0.01)), 3), max=round(float(ev[f].quantile(0.99)), 3),
                       med=round(float(ev[f].median()), 3)) for f in C}
dtype_defaults = {}
for dt in ["smooth", "normal", "aggressive", "modulating"]:
    s = ev[ev.drv_type == dt]
    dtype_defaults[dt] = dict(pedal_apply_time_s=round(float(s.pedal_apply_time_s.median()), 3),
                              decel_target_mps2=round(float(s.decel_target_mps2.median()), 3),
                              pedal_modulation_flag=int(round(s.pedal_modulation_flag.mean())),
                              n_drivers=int((prof.drv_type == dt).sum()), n_events=int(len(s)))

road_presets = {rd: {f: round(float(ev.loc[ev.road == rd, f].median()), 3)
                     for f in ["mu_estimate", "t_ambient_c", "t_battery_c", "pad_temp_c", "rain_sensor"]}
                for rd in ["dry", "wet", "low"]}

# JS 일치 검증용 샘플 20건
chk_idx = RNG.choice(len(ev), 20, replace=False)
pp = predict_all(Zall[chk_idx])  # JSON 에 내보낸(반올림된) 계수로 계산
parity = [dict(x=[float(v) for v in X0[i]], y={k: round(float(pp[k][n]), 9) for k in models})
          for n, i in enumerate(chk_idx)]

# ---------------------------------------------------------------- 7. 시계열 (50 Hz, 정수 인코딩)
TS_COLS = dict(speed_kmh=10, brake_pedal_pct=10, decel_demand_mps2=100, decel_meas_mps2=100,
               jerk_mps3=10, regen_torque_act_nm=1, regen_torque_limit_nm=1, hyd_pressure_act_bar=10,
               abs_flag=1)
ts_out = []
evi = ev.set_index("event_id")
for eid, g in ts.groupby("event_id", sort=True):
    g = g.sort_values("time_s")
    # 블렌딩 구간: 회생 토크가 피크 대비 감소하며 유압이 증가하는 구간
    rt = g.regen_torque_act_nm.values
    pk = rt.max()
    blend = np.where((rt < 0.9 * pk) & (np.arange(len(rt)) > np.argmax(rt)) & (rt > 0.02 * pk + 1))[0]
    sub = g.iloc[::2]
    item = dict(id=int(eid), n=len(sub), dt=0.02,
                v0=round(float(g.speed_kmh.iloc[0]), 1),
                dmax=round(float(g.decel_demand_mps2.max()), 2),
                jmax=round(float(g.jerk_mps3.abs().max()), 2),
                blend=[round(float(g.time_s.iloc[blend[0]]), 2), round(float(g.time_s.iloc[blend[-1]]), 2)]
                if len(blend) else None,
                abs=int(g.abs_flag.max()))
    for c_, s_ in TS_COLS.items():
        item[c_] = np.round(sub[c_].values * s_).astype(int).tolist()
    if eid in evi.index:
        r = evi.loc[eid]
        item["ev"] = dict(cal=r.calibration_id, p=[float(r[p]) for p in P],
                          mass=float(r.mass_est_kg), mu=float(r.mu_estimate), soc=float(r.soc_pct),
                          grade=float(r.road_grade_pct), apply=float(r.pedal_apply_time_s),
                          target=float(r.decel_target_mps2), jerk_blend=float(r.jerk_blend_peak_mps3),
                          rec=float(r.recovery_ratio_c), road=r.road)
    ts_out.append(item)
ts_meta = dict(cols=TS_COLS, n_events=len(ts_out), n_rows=int(len(ts)), hz_src=100, hz_out=50,
               overlap=int(sum("ev" in t for t in ts_out)))

# ---------------------------------------------------------------- 8. 내보내기
summary = dict(
    n_events=int(len(ev)), n_train=int(train.sum()), n_test=int((~train).sum()),
    n_doe=int((ev.calibration_id == "DOE").sum()), n_drivers=int(len(drv)), n_vehicles=int(len(veh)),
    n_cal=int(len(cal)), n_comfort=int(ev.comfort_score.notna().sum()), missing=raw_missing,
    road_counts=ev.road.value_counts().to_dict(), n_ts_rows=int(len(ts)), n_ts_events=len(ts_out),
    rec_over1=int((ev.recovery_ratio > 1).sum()))
model = dict(
    summary=summary, feats=FEATS, params=P, conds=C, noise=NOISE,
    mu=[float(v) for v in mu], sd=[float(v) for v in sd], models=models, importance=imp,
    grid=GRID, weights=WEIGHTS, lowmu_cap=LOWMU_SHARE_CAP, err_tol=ERR_TOL,
    calibrations=cal.to_dict("records"), cal_cost=cal_cost, best_fixed=best_fixed,
    eval=rows, cmap=cmap, pd=pd_curves,
    eda=dict(corr=dict(rows=corr_vars, cols=corr_out, v=cm.values.tolist()), road=road_stats, hist=hist),
    scatter=scatter, cond_ranges=cond_ranges, road_presets=road_presets,
    drivers=dict(profiles=prof[["driver_id", "age_group", "years_driving", "apply_s", "decel", "modul",
                                "emerg", "n", "drv_type"]].round(4).to_dict("records"),
                 defaults=dtype_defaults),
    parity=parity, ts_meta=ts_meta)

OUT.mkdir(exist_ok=True)
(OUT / "model.json").write_text(json.dumps(model, ensure_ascii=False, separators=(",", ":")))
(OUT / "ts.json").write_text(json.dumps(ts_out, separators=(",", ":")))

# 콘솔 요약
E = np.array([r["base"] for r in rows]), np.array([r["ai"] for r in rows])
d = (E[1].mean(0) - E[0].mean(0)) / np.abs(E[0].mean(0)) * 100
print("[eval] mean change AI vs current CAL (%): jerk {:+.1f} err {:+.1f} rec {:+.1f} comfort {:+.1f}".format(*d))
print(f"[out] model.json {(OUT / 'model.json').stat().st_size / 1e3:.0f} KB, "
      f"ts.json {(OUT / 'ts.json').stat().st_size / 1e3:.0f} KB")
print("[drivers]", prof.groupby("drv_type")[H].mean().round(3).to_dict("index"))
