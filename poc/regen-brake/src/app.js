/* 회생 제동 협조 제어 PoC — 화면 렌더링 (Chart.js 4) */
(function () {
  'use strict';
  const M = JSON.parse(document.getElementById('model-data').textContent);
  const TS = JSON.parse(document.getElementById('ts-data').textContent);
  const SV = JSON.parse(document.getElementById('simvalid-data').textContent);
  const RB = window.RB;
  const model = RB.makeModel(M);
  const SC = M.ts_meta.cols;
  const TABS = ['overview', 'data', 'series', 'model', 'simulator', 'validation'];
  const DTYPES = ['smooth', 'normal', 'aggressive', 'modulating'];
  const ROADS = ['dry', 'wet', 'low'];
  const MK = ['jerk', 'err', 'rec', 'comfort'];
  const LOWER_BETTER = { jerk: true, err: true, rec: false, comfort: false };

  // ------------------------------------------------------------ 상태 · i18n
  const store = {
    get(k) { try { return window.localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { window.localStorage.setItem(k, v); } catch (e) { /* 저장 불가 환경 */ } },
  };
  const state = {
    lang: store.get('rb-lang') === 'en' ? 'en' : 'ko',
    tab: 'overview', moTarget: 'jerk', seEvent: null, rendered: {},
  };
  function t(key, vars) {
    let s = (I18N[state.lang] && I18N[state.lang][key]);
    if (s == null) s = I18N.ko[key] != null ? I18N.ko[key] : key;
    if (vars) s = s.replace(/\{(\w+)\}/g, (m, k) => (vars[k] != null ? vars[k] : m));
    return s;
  }
  const locale = () => (state.lang === 'ko' ? 'ko-KR' : 'en-US');
  function fmt(v, d = 2) {
    if (v == null || Number.isNaN(v)) return '–';
    return Number(v).toLocaleString(locale(), { minimumFractionDigits: d, maximumFractionDigits: d });
  }
  function pct(v, d = 1) { return (v > 0 ? '+' : v < 0 ? '−' : '') + fmt(Math.abs(v), d) + '%'; }
  const $ = id => document.getElementById(id);
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  function css(name) { return getComputedStyle(document.documentElement).getPropertyValue(name).trim(); }
  const mean = a => a.reduce((s, v) => s + v, 0) / Math.max(1, a.length);
  function improve(k, base, ai) {   // 개선 방향 기준 % (양수 = 좋아짐)
    const d = (ai - base) / Math.abs(base) * 100;
    return LOWER_BETTER[k] ? -d : d;
  }
  function deltaCell(k, base, ai) {
    const g = improve(k, base, ai);
    const raw = (ai - base) / Math.abs(base) * 100;
    const cls = Math.abs(g) < 0.5 ? '' : g > 0 ? 'delta-good' : 'delta-bad';
    return `<td class="n ${cls}">${pct(raw)}</td>`;
  }

  // ------------------------------------------------------------ 차트 공통
  const charts = {};
  function chart(id, cfg) {
    if (charts[id]) charts[id].destroy();
    const el = $(id);
    if (!el || typeof Chart === 'undefined') return null;
    charts[id] = new Chart(el, cfg);
    return charts[id];
  }
  function C() {
    return { ink: css('--ink'), muted: css('--muted'), line: css('--line'), regen: css('--regen'), regenSoft: css('--regen-soft'),
             hyd: css('--hyd'), hydSoft: css('--hyd-soft'), ai: css('--ai'), ref: css('--ref'), good: css('--good'), bad: css('--bad'),
             warn: css('--warn'), surface: css('--surface') };
  }
  function setChartDefaults() {
    if (typeof Chart === 'undefined') return;
    const c = C();
    Chart.defaults.font.family = css('--font') || 'sans-serif';
    Chart.defaults.font.size = 12;
    Chart.defaults.color = c.muted;
    Chart.defaults.borderColor = c.line;
    Chart.defaults.maintainAspectRatio = false;
    Chart.defaults.animation = false;
    Chart.defaults.plugins.legend.labels.boxWidth = 12;
    Chart.defaults.plugins.legend.labels.boxHeight = 12;
    Chart.defaults.plugins.tooltip.backgroundColor = c.ink;
    Chart.defaults.plugins.tooltip.titleColor = c.surface;
    Chart.defaults.plugins.tooltip.bodyColor = c.surface;
    Chart.defaults.elements.point.radius = 0;
    Chart.defaults.elements.line.borderWidth = 1.8;
  }
  // 블렌딩 구간 음영 플러그인
  const bandsPlugin = {
    id: 'bands',
    beforeDatasetsDraw(ch, args, opts) {
      if (!opts || !opts.items || !opts.items.length) return;
      const { ctx, chartArea: a, scales: { x } } = ch;
      ctx.save();
      for (const b of opts.items) {
        const x0 = Math.max(a.left, x.getPixelForValue(b[0])), x1 = Math.min(a.right, x.getPixelForValue(b[1]));
        if (x1 <= x0) continue;
        ctx.fillStyle = opts.color;
        ctx.fillRect(x0, a.top, x1 - x0, a.bottom - a.top);
        if (opts.label) {
          ctx.fillStyle = opts.labelColor; ctx.font = '11px ' + (css('--font') || 'sans-serif');
          ctx.fillText(opts.label, x0 + 4, a.top + 12);
        }
      }
      ctx.restore();
    },
  };
  if (typeof Chart !== 'undefined') Chart.register(bandsPlugin);
  const xy = (xs, ys) => xs.map((x, i) => ({ x, y: ys[i] }));
  function linAxis(title, extra) { return Object.assign({ type: 'linear', title: { display: !!title, text: title }, grid: { color: C().line } }, extra || {}); }

  // ------------------------------------------------------------ 정적 문구
  function staticVars() {
    return {
      'ov.eyebrow': { n: fmt(M.summary.n_events, 0) },
      'ov.kpinote': { n: fmt(M.eval.length, 0) },
      'se.linked': { n: M.ts_meta.overlap },
      'va.lead': { n: fmt(M.eval.length, 0), best: M.best_fixed },
    };
  }
  function applyStatic() {
    document.documentElement.lang = state.lang;
    const vars = staticVars();
    document.querySelectorAll('[data-i18n]').forEach(el => { el.textContent = t(el.dataset.i18n, vars[el.dataset.i18n]); });
    document.querySelectorAll('.lang button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.lang === state.lang)));
  }

  // ------------------------------------------------------------ 1. 개요
  function evalMeans() {
    const b = MK.map((_, i) => mean(M.eval.map(r => r.base[i])));
    const a = MK.map((_, i) => mean(M.eval.map(r => r.ai[i])));
    return { b, a };
  }
  function renderOverview() {
    const { b, a } = evalMeans();
    const units = { jerk: ' m/s³', err: ' m/s²', rec: '', comfort: '' };
    const dig = { jerk: 2, err: 3, rec: 3, comfort: 2 };
    $('ov-kpis').innerHTML = MK.map((k, i) => {
      const raw = (a[i] - b[i]) / Math.abs(b[i]) * 100;
      const good = improve(k, b[i], a[i]) > 0;
      return `<div class="kpi"><span class="kpi-l">${esc(t('ov.kpi.' + k))}</span>
        <span class="kpi-v ${good ? 'good' : 'bad'}">${pct(raw)}</span>
        <span class="kpi-s">${fmt(b[i], dig[k])} → ${fmt(a[i], dig[k])}${units[k]}</span></div>`;
    }).join('');
    $('ov-flow').innerHTML = [1, 2, 3, 4, 5].map(i =>
      `<li><span class="st">STEP ${i}</span><b>${esc(t('ov.flow.' + i))}</b><span>${esc(t('ov.flow.' + i + 's'))}</span></li>`).join('');
    $('ov-goals').innerHTML = [1, 2, 3, 4, 5].map(i => `<li>${esc(t('ov.goal.' + i))}</li>`).join('');
    const unit = { regen_share_max: '', blend_out_speed_kmh: ' km/h', hyd_lead_ms: ' ms', regen_rate_limit_nps: ' N/s' };
    $('ov-params').innerHTML = `<thead><tr><th>${t('ov.p.col.name')}</th><th>${t('ov.p.col.desc')}</th><th class="n">${t('ov.p.col.range')}</th><th>${t('ov.p.col.eff')}</th></tr></thead><tbody>` +
      M.params.map(p => {
        const g = M.grid[p];
        return `<tr><td><b>${esc(t('p.' + p))}</b><br><code class="muted">${p}</code></td><td>${esc(t('pd.' + p))}</td>
          <td class="n">${fmt(g[0], p === 'regen_share_max' ? 2 : 0)} – ${fmt(g[g.length - 1], p === 'regen_share_max' ? 2 : 0)}${unit[p]}</td><td>${esc(t('pe.' + p))}</td></tr>`;
      }).join('') + '</tbody>';
  }

  // ------------------------------------------------------------ 2. 데이터
  function renderData() {
    const s = M.summary, c = C();
    const sets = [
      ['brake_events_lite.csv', s.n_events, 40, t('da.f.events', { a: fmt(s.n_train, 0), b: fmt(s.n_test, 0), c: fmt(s.n_doe, 0) })],
      ['brake_timeseries_100hz_lite.csv', s.n_ts_rows, 18, t('da.f.ts', { n: s.n_ts_events, k: M.ts_meta.overlap })],
      ['calibrations_lite.csv', s.n_cal, 5, t('da.f.cal')],
      ['drivers_lite.csv', s.n_drivers, 3, t('da.f.drv')],
      ['vehicles_lite.csv', s.n_vehicles, 4, t('da.f.veh')],
    ];
    $('da-sets').innerHTML = `<thead><tr><th>${t('da.col.file')}</th><th class="n">${t('da.col.rows')}</th><th class="n">${t('da.col.cols')}</th><th>${t('da.col.desc')}</th></tr></thead><tbody>` +
      sets.map(r => `<tr><td><code>${r[0]}</code></td><td class="n">${fmt(r[1], 0)}</td><td class="n">${r[2]}</td><td>${esc(r[3])}</td></tr>`).join('') + '</tbody>';
    const miss = [
      ['mu_estimate', s.missing.mu_estimate, t('da.m.mu')],
      ['pad_temp_c', s.missing.pad_temp_c, t('da.m.pad')],
      ['t_battery_c', s.missing.t_battery_c, t('da.m.bat')],
      ['stop_time_s', s.missing.stop_time_s, t('da.m.stop')],
      ['comfort_score', s.missing.comfort_score, t('da.m.comfort', { n: fmt(s.n_comfort, 0) })],
      ['recovery_ratio', s.rec_over1, t('da.m.rec', { n: s.rec_over1 })],
    ];
    $('da-miss').innerHTML = `<thead><tr><th>${t('da.m.col')}</th><th class="n">${t('da.m.n')}</th><th>${t('da.m.how')}</th></tr></thead><tbody>` +
      miss.map(r => `<tr><td><code>${r[0]}</code></td><td class="n">${fmt(r[1], 0)}</td><td>${esc(r[2])}</td></tr>`).join('') + '</tbody>';

    const rs = M.eda.road;
    chart('ch-road', {
      type: 'bar',
      data: {
        labels: rs.map(r => `${t('r.' + r.road)} (${fmt(r.n, 0)})`),
        datasets: [
          { label: t('da.road.jerk'), data: rs.map(r => r.jerk[2]), backgroundColor: c.regen, yAxisID: 'y' },
          { label: t('da.road.abs'), data: rs.map(r => r.abs_rate * 100), backgroundColor: c.hyd, yAxisID: 'y1' },
        ],
      },
      options: { scales: { y: { beginAtZero: true, title: { display: true, text: 'm/s³' } },
        y1: { position: 'right', beginAtZero: true, grid: { drawOnChartArea: false }, title: { display: true, text: '%' } } } },
    });

    const cr = M.eda.corr;
    const noise = new Set(M.noise);
    const cell = v => {
      const a = Math.min(1, Math.abs(v));
      const col = v >= 0 ? 'var(--hyd)' : 'var(--regen)';
      const fg = a > 0.45 ? 'color:#fff;' : '';
      return `<td style="background:color-mix(in srgb, ${col} ${Math.round(a * 85)}%, transparent);${fg}">${fmt(v, 2)}</td>`;
    };
    $('da-corr').innerHTML = `<thead><tr><th></th>${cr.cols.map(k => `<th class="c">${esc(t('o.' + k))}</th>`).join('')}</tr></thead><tbody>` +
      cr.rows.map((r, i) => `<tr class="${noise.has(r) ? 'noise' : ''}"><th>${esc(t('f.' + r))}${M.params.includes(r) ? ' <span class="tag ai">P</span>' : ''}</th>${cr.v[i].map(v => v == null ? '<td>–</td>' : cell(v)).join('')}</tr>`).join('') + '</tbody>';

    const hj = M.eda.hist.jerk_blend_peak_mps3;
    chart('ch-hist-jerk', {
      type: 'bar',
      data: { labels: hj.counts.map((_, i) => i === hj.counts.length - 1 ? `≥${hj.edges[i]}` : fmt(hj.edges[i], 1)),
              datasets: [{ label: t('da.count'), data: hj.counts, backgroundColor: c.ai, barPercentage: 1, categoryPercentage: 0.95 }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: t('da.hist.x') }, grid: { display: false } }, y: { title: { display: true, text: t('da.count') } } } },
    });
    const hc = M.eda.hist.comfort_score;
    chart('ch-hist-comfort', {
      type: 'bar',
      data: { labels: hc.counts.map((_, i) => String(i + 1)),
              datasets: [{ label: t('da.count'), data: hc.counts, backgroundColor: hc.counts.map((_, i) => i < 4 ? c.hyd : i < 7 ? c.ref : c.regen) }] },
      options: { plugins: { legend: { display: false } }, scales: { x: { title: { display: true, text: t('da.histc.x') }, grid: { display: false } }, y: { title: { display: true, text: t('da.count') } } } },
    });
  }

  // ------------------------------------------------------------ 3. 시계열
  function seOptions() {
    const only = $('se-linked').checked;
    const list = TS.filter(e => !only || e.ev);
    const sel = $('se-event');
    if (state.seEvent == null || !list.some(e => e.id === state.seEvent)) {
      const first = list.find(e => e.ev) || list[0];
      state.seEvent = first.id;
    }
    sel.innerHTML = list.map(e => `<option value="${e.id}" ${e.id === state.seEvent ? 'selected' : ''}>${esc(t('se.opt', { id: e.id, v: fmt(e.v0, 1), d: fmt(e.dmax, 2) }))}${e.ev ? ' · ' + e.ev.cal : ''}</option>`).join('');
  }
  function decode(e, col) { return e[col].map(v => v / SC[col]); }
  function renderSeries() {
    seOptions();
    const e = TS.find(x => x.id === state.seEvent), c = C();
    const tt = e.speed_kmh.map((_, i) => +(i * e.dt).toFixed(2));
    const sp = decode(e, 'speed_kmh'), pedal = decode(e, 'brake_pedal_pct');
    const dem = decode(e, 'decel_demand_mps2'), meas = decode(e, 'decel_meas_mps2'), jerk = decode(e, 'jerk_mps3');
    const fr = e.regen_torque_act_nm.map(v => v * RB.VEH.KT / 1000), fh = decode(e, 'hyd_pressure_act_bar').map(v => Math.max(0, v) * RB.VEH.KH / 1000);
    let sim = null, rmse = null;
    if (e.ev && $('se-sim').checked) {
      sim = RB.simulate({ v0: sp[0], mass: e.ev.mass, mu: e.ev.mu, soc: e.ev.soc, grade: e.ev.grade, params: e.ev.p,
                          demand: { dt: e.dt, a: dem }, outDt: e.dt, tMax: e.n * e.dt });
      let se = 0, n = 0;
      for (let i = 0; i < Math.min(sim.a.length, meas.length); i++) if (sp[i] >= 1) { se += (sim.a[i] - meas[i]) ** 2; n++; }
      rmse = Math.sqrt(se / Math.max(1, n));
    }
    const facts = [
      [t('se.f.v0'), fmt(e.v0, 1) + ' km/h'], [t('se.f.dmax'), fmt(e.dmax, 2) + ' m/s²'], [t('se.f.jmax'), fmt(e.jmax, 1) + ' m/s³'],
      [t('se.f.blend'), e.blend ? `${fmt(e.blend[0], 2)}–${fmt(e.blend[1], 2)} s` : t('se.none')],
      [t('se.f.abs'), e.abs ? t('se.yes') : t('se.no')],
    ];
    if (e.ev) {
      facts.push([t('se.f.cal'), e.ev.cal + ' · ' + t('r.' + e.ev.road)]);
      facts.push([t('se.f.params'), `${fmt(e.ev.p[0], 2)} / ${fmt(e.ev.p[1], 1)} / ${fmt(e.ev.p[2], 0)} / ${fmt(e.ev.p[3] / 1000, 1)}k`]);
      if (rmse != null) facts.push([t('se.f.rmse'), fmt(rmse, 3) + ' m/s²']);
    }
    $('se-facts').innerHTML = facts.map(f => `<div class="fact"><span>${esc(f[0])}</span><b>${esc(f[1])}</b></div>`).join('') +
      (e.ev ? '' : `<div class="fact"><span>${esc(t('se.nolink'))}</span></div>`);
    const bands = { items: e.blend ? [e.blend] : [], color: c.regenSoft, label: t('s.blend'), labelColor: c.regen };
    const xAxis = linAxis(t('ax.t'), { min: 0, max: tt[tt.length - 1] });
    chart('ch-se-speed', {
      type: 'line',
      data: { datasets: [
        { label: t('s.speed'), data: xy(tt, sp), borderColor: c.ink, yAxisID: 'y' },
        { label: t('s.pedal'), data: xy(tt, pedal), borderColor: c.ai, borderDash: [4, 3], yAxisID: 'y1' },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { bands },
        scales: { x: xAxis, y: { title: { display: true, text: t('ax.speed') }, beginAtZero: true },
          y1: { position: 'right', min: 0, max: 100, grid: { drawOnChartArea: false }, title: { display: true, text: t('ax.pedal') } } } },
    });
    const ds = [
      { label: t('s.dem'), data: xy(tt, dem), borderColor: c.ref, borderDash: [5, 4], yAxisID: 'y' },
      { label: t('s.meas'), data: xy(tt, meas), borderColor: c.ink, yAxisID: 'y' },
      { label: t('s.jerk'), data: xy(tt, jerk), borderColor: c.hyd, borderWidth: 1.1, yAxisID: 'y1' },
    ];
    const simEnd = sim && sim.metrics.stopTime != null ? sim.metrics.stopTime : Infinity;
    const cut = (xs, ys) => xy(xs, ys).filter(p => p.x <= simEnd);
    if (sim) ds.splice(2, 0, { label: t('s.sim'), data: cut(sim.t, sim.a), borderColor: c.ai, yAxisID: 'y' });
    chart('ch-se-decel', {
      type: 'line', data: { datasets: ds },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { bands },
        scales: { x: xAxis, y: { title: { display: true, text: t('ax.decel') } },
          y1: { position: 'right', grid: { drawOnChartArea: false }, title: { display: true, text: t('ax.jerk') } } } },
    });
    const fds = [
      { label: t('s.regen'), data: xy(tt, fr), borderColor: c.regen, backgroundColor: c.regenSoft, fill: 'origin', stack: 'f' },
      { label: t('s.hyd'), data: xy(tt, fh), borderColor: c.hyd, backgroundColor: c.hydSoft, fill: '-1', stack: 'f' },
    ];
    if (sim) fds.push({ label: t('s.simregen'), data: cut(sim.t, sim.Fr.map(v => v / 1000)), borderColor: c.ai, borderDash: [4, 3], fill: false, stack: 's' });
    chart('ch-se-force', {
      type: 'line', data: { datasets: fds },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { bands },
        scales: { x: xAxis, y: { stacked: true, beginAtZero: true, title: { display: true, text: t('ax.force') } } } },
    });
  }

  // ------------------------------------------------------------ 4. 모델
  function renderModel() {
    const c = C();
    $('mo-perf').innerHTML = `<thead><tr><th>${t('mo.c.target')}</th><th>${t('mo.c.tf')}</th><th class="n">${t('mo.c.lam')}</th><th class="n">${t('mo.c.r2tr')}</th><th class="n">${t('mo.c.r2')}</th><th class="n">${t('mo.c.mae')}</th><th class="n">${t('mo.c.n')}</th></tr></thead><tbody>` +
      MK.map(k => { const m = M.models[k];
        return `<tr><td><b>${esc(t('t.' + k))}</b><br><code class="muted">${m.col}</code></td><td>${t('tf.' + m.tf)}</td><td class="n">${m.lam}</td><td class="n">${fmt(m.r2_train, 3)}</td><td class="n"><b>${fmt(m.r2_test, 3)}</b></td><td class="n">${fmt(m.mae_test, 3)} ${t('u.' + k)}</td><td class="n">${fmt(m.n_train, 0)} / ${fmt(m.n_test, 0)}</td></tr>`;
      }).join('') + '</tbody>';
    $('mo-target').innerHTML = MK.map(k => `<button type="button" data-k="${k}" aria-pressed="${k === state.moTarget}">${esc(t('t.' + k))}</button>`).join('');
    const k = state.moTarget;
    const pts = M.scatter[k];
    const lo = Math.min(...pts.map(p => Math.min(p[0], p[1]))), hi = Math.max(...pts.map(p => Math.max(p[0], p[1])));
    const logAx = M.models[k].tf === 'log';
    chart('ch-mo-scatter', {
      type: 'scatter',
      data: { datasets: [
        { label: t('mo.sc.ideal'), type: 'line', data: [{ x: lo, y: lo }, { x: hi, y: hi }], borderColor: c.ref, borderDash: [5, 4], borderWidth: 1.2 },
        { label: `${t('t.' + k)} · R² ${fmt(M.models[k].r2_test, 3)}`, data: pts.map(p => ({ x: p[0], y: p[1] })), backgroundColor: c.ai + '99', pointRadius: 2.6 },
      ] },
      options: { scales: { x: { type: logAx ? 'logarithmic' : 'linear', title: { display: true, text: `${t('mo.sc.x')} (${t('u.' + k) || '–'})` } },
                           y: { type: logAx ? 'logarithmic' : 'linear', title: { display: true, text: `${t('mo.sc.y')} (${t('u.' + k) || '–'})` } } } },
    });
    const imp = Object.entries(M.importance[k]).sort((a, b) => b[1] - a[1]).slice(0, 12);
    chart('ch-mo-imp', {
      type: 'bar',
      data: { labels: imp.map(e => t('f.' + e[0])), datasets: [{ label: t('mo.imp.x'), data: imp.map(e => e[1]), backgroundColor: imp.map(e => M.params.includes(e[0]) ? c.ai : c.ref) }] },
      options: { indexAxis: 'y', plugins: { legend: { display: false } }, scales: { x: { beginAtZero: true, title: { display: true, text: t('mo.imp.x') } }, y: { grid: { display: false } } } },
    });
    $('mo-pd').innerHTML = M.params.map(p => `<div><h4>${esc(t('p.' + p))}</h4><div class="chart pd"><canvas id="ch-pd-${p}"></canvas></div></div>`).join('');
    const unit = { regen_share_max: '', blend_out_speed_kmh: 'km/h', hyd_lead_ms: 'ms', regen_rate_limit_nps: 'kN/s' };
    for (const p of M.params) {
      const d = M.pd[p];
      const xs = p === 'regen_rate_limit_nps' ? d.x.map(v => v / 1000) : d.x;
      chart('ch-pd-' + p, {
        type: 'line', data: { datasets: [{ label: t('t.' + k), data: xy(xs, d[k]), borderColor: c.ai, backgroundColor: c.ai + '22', fill: 'start', borderWidth: 2 }] },
        options: { plugins: { legend: { display: false } }, scales: { x: linAxis(unit[p], { ticks: { maxTicksLimit: 5 } }), y: { ticks: { maxTicksLimit: 5 } } } },
      });
    }
    const colors = { smooth: c.regen, normal: c.ref, aggressive: c.hyd, modulating: c.ai };
    chart('ch-mo-drivers', {
      type: 'scatter',
      data: { datasets: DTYPES.map(dt => ({
        label: t('d.' + dt),
        data: M.drivers.profiles.filter(p => p.drv_type === dt).map(p => ({ x: p.apply_s, y: p.decel, r: 4 + p.modul * 14, id: p.driver_id })),
        backgroundColor: colors[dt] + 'bb', borderColor: colors[dt], pointRadius: ctx => (ctx.raw ? ctx.raw.r : 4),
      })) },
      options: { plugins: { tooltip: { callbacks: { label: ctx => `${ctx.raw.id}: ${fmt(ctx.raw.x, 2)} s, ${fmt(ctx.raw.y, 2)} m/s²` } } },
        scales: { x: { title: { display: true, text: t('mo.dr.x') } }, y: { title: { display: true, text: t('mo.dr.y') } } } },
    });
    const dd = M.drivers.defaults;
    const modRate = dt => mean(M.drivers.profiles.filter(p => p.drv_type === dt).map(p => p.modul));
    $('mo-dtypes').innerHTML = `<thead><tr><th>${t('mo.dt.c.type')}</th><th class="n">${t('mo.dt.c.drv')}</th><th class="n">${t('mo.dt.c.ev')}</th><th class="n">${t('mo.dt.c.apply')}</th><th class="n">${t('mo.dt.c.dec')}</th><th class="n">${t('mo.dt.c.mod')}</th></tr></thead><tbody>` +
      DTYPES.map(dt => `<tr><td><span class="tag" style="color:${colors[dt]};border-color:${colors[dt]}">${esc(t('d.' + dt))}</span></td><td class="n">${dd[dt].n_drivers}</td><td class="n">${fmt(dd[dt].n_events, 0)}</td><td class="n">${fmt(dd[dt].pedal_apply_time_s, 2)} s</td><td class="n">${fmt(dd[dt].decel_target_mps2, 2)}</td><td class="n">${fmt(modRate(dt) * 100, 0)}%</td></tr>`).join('') + '</tbody>';
  }

  // ------------------------------------------------------------ 5. 시뮬레이터
  const SI_DEFAULT = { driver: 'normal', road: 'dry', v0: 60, soc: 66, mass: 2240, grade: 0, wj: 0.4, we: 0.25, wr: 0.15, wc: 0.2 };
  function siFill() {
    const dsel = $('si-driver'), rsel = $('si-road'), csel = $('si-ref');
    const dv = dsel.value || SI_DEFAULT.driver, rv = rsel.value || SI_DEFAULT.road, cv = csel.value || M.best_fixed;
    dsel.innerHTML = DTYPES.map(d => `<option value="${d}" ${d === dv ? 'selected' : ''}>${esc(t('d.' + d))}</option>`).join('');
    rsel.innerHTML = ROADS.map(r => `<option value="${r}" ${r === rv ? 'selected' : ''}>${esc(t('r.' + r))} · μ ${fmt(M.road_presets[r].mu_estimate, 2)}</option>`).join('');
    csel.innerHTML = M.calibrations.map(cl => `<option value="${cl.calibration_id}" ${cl.calibration_id === cv ? 'selected' : ''}>${cl.calibration_id === M.best_fixed ? esc(t('si.refbest', { id: cl.calibration_id })) : cl.calibration_id} · ${fmt(cl.share_max, 2)} / ${fmt(cl.blend_out_kmh, 1)} / ${cl.lead_ms} / ${fmt(cl.regen_rate / 1000, 1)}k</option>`).join('');
  }
  function siApplyDriver() {
    const d = M.drivers.defaults[$('si-driver').value];
    $('si-apply').value = d.pedal_apply_time_s; $('si-target').value = d.decel_target_mps2; $('si-mod').checked = !!d.pedal_modulation_flag;
  }
  function siReset() {
    $('si-driver').value = SI_DEFAULT.driver; $('si-road').value = SI_DEFAULT.road; $('si-ref').value = M.best_fixed;
    for (const k of ['v0', 'soc', 'mass', 'grade', 'wj', 'we', 'wr', 'wc']) $('si-' + k).value = SI_DEFAULT[k];
    siApplyDriver();
  }
  function siOutputs() {
    const v = id => +$('si-' + id).value;
    $('o-v0').textContent = fmt(v('v0'), 0) + ' km/h'; $('o-target').textContent = fmt(v('target'), 2) + ' m/s²';
    $('o-apply').textContent = fmt(v('apply'), 2) + ' s'; $('o-soc').textContent = fmt(v('soc'), 0) + '%';
    $('o-mass').textContent = fmt(v('mass'), 0) + ' kg'; $('o-grade').textContent = fmt(v('grade'), 1) + '%';
    for (const k of ['wj', 'we', 'wr', 'wc']) $('o-' + k).textContent = fmt(v(k), 2);
  }
  function renderSim() {
    siOutputs();
    const c = C(), v = id => +$('si-' + id).value;
    const road = $('si-road').value, rp = M.road_presets[road];
    const cal = M.calibrations.find(x => x.calibration_id === $('si-ref').value);
    const ref = [cal.share_max, cal.blend_out_kmh, cal.lead_ms, cal.regen_rate];
    const med = f => M.cond_ranges[f].med;
    const condMap = {
      initial_speed_kmh: v('v0'), decel_target_mps2: v('target'), pedal_apply_time_s: v('apply'), pedal_modulation_flag: $('si-mod').checked ? 1 : 0,
      emergency_flag: 0, mass_est_kg: v('mass'), road_grade_pct: v('grade'), soc_pct: v('soc'), t_battery_c: rp.t_battery_c, t_ambient_c: rp.t_ambient_c,
      rain_sensor: rp.rain_sensor, pad_temp_c: rp.pad_temp_c, mu_estimate: rp.mu_estimate, pad_wear_pct: med('pad_wear_pct'),
      brake_fluid_age_months: med('brake_fluid_age_months'), years_driving: med('years_driving'),
    };
    const cond = M.feats.map((f, i) => (i < 4 ? ref[i] : condMap[f]));
    let w = { jerk: v('wj'), err: v('we'), rec: v('wr'), comfort: v('wc') };
    if (w.jerk + w.err + w.rec + w.comfort === 0) w = M.weights;
    const t0 = performance.now();
    const opt = model.optimize(cond, ref, { weights: w });
    const t1 = performance.now();
    const base = { v0: v('v0'), target: v('target'), apply: v('apply'), mass: v('mass'), mu: rp.mu_estimate, soc: v('soc'), grade: v('grade'), modulation: $('si-mod').checked ? 1 : 0 };
    const sr = RB.simulate(Object.assign({ params: ref }, base));
    const sa = RB.simulate(Object.assign({ params: opt.params }, base));
    const t2 = performance.now();
    let status = t('si.status', { n: fmt(opt.n, 0), ms: fmt(t1 - t0, 0), steps: fmt(sa.metrics.steps, 0), ms2: fmt(t2 - t1, 0) });
    if (rp.mu_estimate < 0.4) status += ' · ' + t('si.lowmu', { cap: fmt(M.lowmu_cap, 2) });
    if (opt.kept) status += ' · ' + t('si.kept');
    $('si-status').textContent = status;

    const pf = [[2, ''], [1, ' km/h'], [0, ' ms'], [0, ' N/s']];
    $('si-params').innerHTML = `<thead><tr><th>${t('si.p.col.p')}</th><th class="n">${t('si.p.col.ref')}</th><th class="n">${t('si.p.col.ai')}</th><th class="n">${t('si.p.col.d')}</th></tr></thead><tbody>` +
      M.params.map((p, i) => { const d = opt.params[i] - ref[i];
        return `<tr><td>${esc(t('p.' + p))}</td><td class="n">${fmt(ref[i], pf[i][0])}${pf[i][1]}</td><td class="n"><b style="color:var(--ai)">${fmt(opt.params[i], pf[i][0])}${pf[i][1]}</b></td><td class="n">${d === 0 ? '–' : (d > 0 ? '+' : '−') + fmt(Math.abs(d), pf[i][0])}</td></tr>`;
      }).join('') + '</tbody>';
    const rows = [
      ['si.m.jerk', 'model', 'jerk', opt.base.jerk, opt.ai.jerk, 2, ' m/s³'],
      ['si.m.err', 'model', 'err', opt.base.err, opt.ai.err, 3, ' m/s²'],
      ['si.m.rec', 'model', 'rec', opt.base.rec, opt.ai.rec, 3, ''],
      ['si.m.comfort', 'model', 'comfort', opt.base.comfort, opt.ai.comfort, 2, ''],
      ['si.m.jerk', 'sim', 'jerk', sr.metrics.jerkBlend, sa.metrics.jerkBlend, 2, ' m/s³'],
      ['si.m.err', 'sim', 'err', sr.metrics.errRms, sa.metrics.errRms, 3, ' m/s²'],
      ['si.m.rec', 'sim', 'rec', sr.metrics.recovery, sa.metrics.recovery, 3, ''],
      ['si.m.wh', 'sim', 'rec', sr.metrics.eRegWh, sa.metrics.eRegWh, 1, ' Wh'],
      ['si.m.dist', 'sim', null, sr.metrics.stopDist, sa.metrics.stopDist, 1, ' m'],
    ];
    $('si-results').innerHTML = `<thead><tr><th>${t('si.r.col.m')}</th><th>${t('si.r.col.src')}</th><th class="n">${t('si.r.col.ref')}</th><th class="n">${t('si.r.col.ai')}</th><th class="n">${t('si.r.col.d')}</th></tr></thead><tbody>` +
      rows.map(r => `<tr><td>${esc(t(r[0]))}</td><td><span class="tag ${r[1] === 'model' ? 'ai' : ''}">${esc(t('si.src.' + r[1]))}</span></td><td class="n">${fmt(r[3], r[5])}${r[6]}</td><td class="n"><b>${fmt(r[4], r[5])}${r[6]}</b></td>` +
        (r[2] ? deltaCell(r[2], r[3], r[4]) : `<td class="n">${pct((r[4] - r[3]) / r[3] * 100)}</td>`) + '</tr>').join('') + '</tbody>';

    const tEnd = Math.max(sr.t[sr.t.length - 1], sa.t[sa.t.length - 1]);
    const xAxis = linAxis(t('ax.t'), { min: 0, max: tEnd });
    const blendSpan = s => { const i0 = s.blend.indexOf(1), i1 = s.blend.lastIndexOf(1); return i0 >= 0 ? [[s.t[i0], s.t[i1]]] : []; };
    const bands = { items: blendSpan(sa), color: c.regenSoft, label: t('s.blend'), labelColor: c.regen };
    chart('ch-si-decel', {
      type: 'line',
      data: { datasets: [
        { label: t('s.dem'), data: xy(sa.t, sa.aDem), borderColor: c.ref, borderDash: [5, 4], borderWidth: 1.4 },
        { label: t('s.ref'), data: xy(sr.t, sr.a), borderColor: c.hyd },
        { label: t('s.ai'), data: xy(sa.t, sa.a), borderColor: c.ai, borderWidth: 2.2 },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { bands }, scales: { x: xAxis, y: { title: { display: true, text: t('ax.decel') } } } },
    });
    const jPart = s => s.j.filter((_, i) => s.metrics.stopTime == null || s.t[i] < s.metrics.stopTime - 0.05).map(Math.abs);
    const jLim = Math.ceil(Math.max(4, ...jPart(sr), ...jPart(sa)) * 1.2);
    chart('ch-si-jerk', {
      type: 'line',
      data: { datasets: [
        { label: t('s.ref'), data: xy(sr.t, sr.j), borderColor: c.hyd, borderWidth: 1.4 },
        { label: t('s.ai'), data: xy(sa.t, sa.j), borderColor: c.ai, borderWidth: 1.8 },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { bands }, scales: { x: xAxis, y: { min: -jLim, max: jLim, title: { display: true, text: t('ax.jerk') } } } },
    });
    chart('ch-si-force', {
      type: 'line',
      data: { datasets: [
        { label: t('s.regen'), data: xy(sa.t, sa.Fr.map(x => x / 1000)), borderColor: c.regen, backgroundColor: c.regenSoft, fill: 'origin', stack: 'ai' },
        { label: t('s.hyd'), data: xy(sa.t, sa.Fh.map(x => x / 1000)), borderColor: c.hyd, backgroundColor: c.hydSoft, fill: '-1', stack: 'ai' },
        { label: t('s.refregen'), data: xy(sr.t, sr.Fr.map(x => x / 1000)), borderColor: c.regen, borderDash: [4, 3], borderWidth: 1.2, fill: false, stack: 'r1' },
        { label: t('s.refhyd'), data: xy(sr.t, sr.Fh.map(x => x / 1000)), borderColor: c.hyd, borderDash: [4, 3], borderWidth: 1.2, fill: false, stack: 'r2' },
      ] },
      options: { interaction: { mode: 'index', intersect: false }, plugins: { bands }, scales: { x: xAxis, y: { stacked: true, beginAtZero: true, title: { display: true, text: t('ax.force') } } } },
    });
  }
  let siTimer = null;
  function siSchedule() { siOutputs(); clearTimeout(siTimer); siTimer = setTimeout(renderSim, 90); }

  // ------------------------------------------------------------ 6. 검증
  function renderValidation() {
    const c = C(), { b, a } = evalMeans();
    const bf = M.cal_cost[M.best_fixed];
    const bfv = [bf.jerk, bf.err, bf.rec, bf.comfort];
    const labels = MK.map(k => t('t.' + k));
    chart('ch-va-cmp', {
      type: 'bar',
      data: { labels, datasets: [
        { label: `${t('va.s.best')} (${M.best_fixed})`, data: MK.map((k, i) => (bfv[i] - b[i]) / Math.abs(b[i]) * 100), backgroundColor: c.ref },
        { label: t('va.s.ai'), data: MK.map((k, i) => (a[i] - b[i]) / Math.abs(b[i]) * 100), backgroundColor: c.ai },
      ] },
      options: { plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${pct(ctx.raw)}` } } },
        scales: { y: { title: { display: true, text: t('va.cmp.y') } }, x: { grid: { display: false } } } },
    });
    $('va-cmp-note').textContent = t('va.cmp.note');
    const mcol = { jerk: c.ai, err: c.warn, rec: c.regen, comfort: c.hyd };
    chart('ch-va-road', {
      type: 'bar',
      data: { labels: ROADS.map(r => t('r.' + r)), datasets: MK.map((k, i) => ({
        label: t('t.' + k), backgroundColor: mcol[k],
        data: ROADS.map(r => { const rr = M.eval.filter(e => e.road === r); const bb = mean(rr.map(e => e.base[i])), aa = mean(rr.map(e => e.ai[i])); return (aa - bb) / Math.abs(bb) * 100; }),
      })) },
      options: { plugins: { tooltip: { callbacks: { label: ctx => `${ctx.dataset.label}: ${pct(ctx.raw)}` } } },
        scales: { y: { title: { display: true, text: t('va.road.y') } }, x: { grid: { display: false } } } },
    });
    const extra = M.eval.map(e => (e.ai[2] - e.base[2]) * e.ke_wh);
    const per = mean(extra);
    $('va-energy').innerHTML = [
      [t('va.e.per'), (per >= 0 ? '+' : '−') + fmt(Math.abs(per), 2) + ' Wh', ''],
      [t('va.e.k'), (per >= 0 ? '+' : '−') + fmt(Math.abs(per), 2) + ' kWh', ''],
      [t('va.e.km'), (per >= 0 ? '+' : '−') + fmt(Math.abs(per) * 1000 / 160, 1) + ' km', ''],
      [t('va.e.share'), fmt(b[2], 3) + ' → ' + fmt(a[2], 3), ''],
    ].map(k => `<div class="kpi"><span class="kpi-l">${esc(k[0])}</span><span class="kpi-v ${per >= 0 ? 'good' : 'bad'}" style="font-size:1.3rem">${esc(k[1])}</span></div>`).join('');

    $('va-map').innerHTML = `<thead><tr><th></th>${ROADS.map(r => `<th>${esc(t('r.' + r))}</th>`).join('')}</tr></thead><tbody>` +
      DTYPES.map(dt => `<tr><th>${esc(t('d.' + dt))}</th>${ROADS.map(r => {
        const m = M.cmap.find(x => x.dtype === dt && x.road === r);
        if (!m) return '<td>–</td>';
        const dj = (m.ai[0] - m.base[0]) / m.base[0] * 100;
        return `<td><div class="cell"><b>${fmt(m.p[0], 2)} / ${fmt(m.p[1], 0)} / ${fmt(m.p[2], 0)} / ${fmt(m.p[3] / 1000, 0)}</b>
          <span class="${dj < -0.5 ? 'delta-good' : dj > 0.5 ? 'delta-bad' : ''}">${t('va.map.jerk')} ${pct(dj)}</span><span class="muted">${esc(t('va.map.n', { n: fmt(m.n, 0) }))}</span></div></td>`;
      }).join('')}</tr>`).join('') + '</tbody>';

    const cals = M.calibrations.map(x => x.calibration_id);
    $('va-cal').innerHTML = `<thead><tr><th>${t('va.c.cal')}</th><th class="n">${t('va.c.n')}</th>${MK.map(k => `<th class="n">${esc(t('t.' + k))}</th><th class="n">Δ</th>`).join('')}</tr></thead><tbody>` +
      cals.map(cl => { const rr = M.eval.filter(e => e.cal === cl); if (!rr.length) return '';
        return `<tr><td><code>${cl}</code>${cl === M.best_fixed ? ' <span class="tag">best</span>' : ''}</td><td class="n">${rr.length}</td>` +
          MK.map((k, i) => { const bb = mean(rr.map(e => e.base[i])), aa = mean(rr.map(e => e.ai[i])); const d = k === 'err' || k === 'rec' ? 3 : 2;
            return `<td class="n">${fmt(bb, d)} → ${fmt(aa, d)}</td>${deltaCell(k, bb, aa)}`; }).join('') + '</tr>';
      }).join('') + '</tbody>';

    $('va-sim-p').textContent = t('va.sim.p', { n: SV.events.length, r: fmt(SV.rmse_mean, 3) });
    $('va-sim').innerHTML = `<thead><tr><th>${t('va.s.id')}</th><th class="n">${t('va.s.rmse')}</th><th class="n">${t('va.s.jm')}</th><th class="n">${t('va.s.js')}</th><th class="n">${t('va.s.rm')}</th><th class="n">${t('va.s.rs')}</th></tr></thead><tbody>` +
      SV.events.map(r => `<tr><td>#${r.id}</td><td class="n">${fmt(r.rmse, 3)}</td><td class="n">${fmt(r.jerk_blend_meas, 2)}</td><td class="n">${fmt(r.jerk_blend_sim, 2)}</td><td class="n">${fmt(r.rec_meas, 3)}</td><td class="n">${fmt(r.rec_sim, 3)}</td></tr>`).join('') + '</tbody>';
    $('va-lim').innerHTML = [1, 2, 3, 4, 5].map(i => `<li>${esc(t('va.lim.' + i))}</li>`).join('');
    $('va-next').innerHTML = [1, 2, 3, 4, 5].map(i => `<li>${esc(t('va.next.' + i))}</li>`).join('');
  }

  // ------------------------------------------------------------ 라우팅 · 이벤트
  const RENDER = { overview: renderOverview, data: renderData, series: renderSeries, model: renderModel, simulator: () => { siFill(); renderSim(); }, validation: renderValidation };
  function show(tab) {
    if (!TABS.includes(tab)) tab = 'overview';
    state.tab = tab;
    TABS.forEach(x => { $('view-' + x).hidden = x !== tab; });
    document.querySelectorAll('#tabs a').forEach(a => { if (a.dataset.tab === tab) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (!state.rendered[tab]) { RENDER[tab](); state.rendered[tab] = true; }
  }
  function rerenderAll() {
    setChartDefaults();
    applyStatic();
    state.rendered = {};
    show(state.tab);
  }
  function route() { show((location.hash || '#overview').slice(1)); }

  document.querySelectorAll('.lang button').forEach(btn => btn.addEventListener('click', () => {
    state.lang = btn.dataset.lang; store.set('rb-lang', state.lang); rerenderAll();
  }));
  window.addEventListener('hashchange', route);
  $('mo-target').addEventListener('click', e => { const b = e.target.closest('button'); if (!b) return; state.moTarget = b.dataset.k; renderModel(); });
  $('se-event').addEventListener('change', e => { state.seEvent = +e.target.value; renderSeries(); });
  $('se-linked').addEventListener('change', renderSeries);
  $('se-sim').addEventListener('change', renderSeries);
  $('si-form').addEventListener('input', e => { if (e.target.id === 'si-driver') siApplyDriver(); siSchedule(); });
  $('si-form').addEventListener('change', e => { if (e.target.id === 'si-driver') siApplyDriver(); siSchedule(); });
  $('si-form').addEventListener('submit', e => e.preventDefault());
  $('si-reset').addEventListener('click', () => { siReset(); siSchedule(); });
  const mq = window.matchMedia('(prefers-color-scheme: dark)');
  if (mq.addEventListener) mq.addEventListener('change', rerenderAll);
  new MutationObserver(rerenderAll).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

  // 초기화
  siFill(); siReset();
  setChartDefaults();
  applyStatic();
  route();
  window.__RB_READY__ = true;
})();
