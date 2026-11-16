// index.html 브라우저 검증: 6개 탭 × 2개 언어 순회, 콘솔 에러, 번역 키 일치, 모바일 폭 가로 스크롤
// Usage: CHART_JS=/path/to/chart.umd.js node build/verify.cjs [screenshot_dir]
// (컨테이너에서 CDN 이 막혀 있으면 CHART_JS 로 로컬 Chart.js 4.4.1 을 대신 제공)
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');

const ROOT = path.resolve(__dirname, '..');
const OUT = process.argv[2] || path.join(ROOT, 'build', 'shots');
fs.mkdirSync(OUT, { recursive: true });
const TABS = ['overview', 'data', 'series', 'model', 'simulator', 'validation'];

(async () => {
  const browser = await chromium.launch();
  const errors = [];
  async function page(viewport) {
    const ctx = await browser.newContext({ viewport, deviceScaleFactor: 1 });
    const p = await ctx.newPage();
    p.on('console', m => { if (m.type() === 'error') errors.push(m.text()); });
    p.on('pageerror', e => errors.push(String(e)));
    if (process.env.CHART_JS) {
      await p.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/Chart\.js/, r => r.fulfill({ contentType: 'application/javascript', body: fs.readFileSync(process.env.CHART_JS) }));
    }
    await p.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await p.goto('file://' + path.join(ROOT, 'index.html'));
    await p.waitForFunction(() => window.__RB_READY__ === true);
    return p;
  }

  const p = await page({ width: 1280, height: 900 });
  // 번역 키 집합 비교
  const parity = await p.evaluate(() => {
    const ko = Object.keys(I18N.ko), en = Object.keys(I18N.en);
    const used = [...document.querySelectorAll('[data-i18n]')].map(e => e.dataset.i18n);
    return { onlyKo: ko.filter(k => !(k in I18N.en)), onlyEn: en.filter(k => !(k in I18N.ko)), missingUsed: used.filter(k => !(k in I18N.ko)) };
  });
  console.log('[i18n]', JSON.stringify(parity));
  for (const lang of ['ko', 'en']) {
    await p.click(`#lang-${lang}`);
    for (const tab of TABS) {
      await p.evaluate(t => { location.hash = t; }, tab);
      await p.waitForTimeout(tab === 'simulator' ? 400 : 150);
      // 화면에 키 문자열이 그대로 남아 있는지 (번역 누락)
      const leaked = await p.evaluate(() => [...document.querySelectorAll('.view:not([hidden]) *')]
        .filter(e => e.children.length === 0 && /^[a-z]{1,3}\.[a-z0-9.]+$/i.test(e.textContent.trim()) && !/^\d/.test(e.textContent.trim()))
        .map(e => e.textContent.trim()).slice(0, 5));
      if (leaked.length) console.log(`[leak] ${lang}/${tab}:`, leaked);
      await p.screenshot({ path: path.join(OUT, `${lang}-${tab}.png`), fullPage: true });
    }
  }
  // 시뮬레이터 상호작용: 저마찰 + 급제동형
  await p.evaluate(() => { location.hash = 'simulator'; });
  await p.selectOption('#si-road', 'low');
  await p.selectOption('#si-driver', 'aggressive');
  await p.waitForTimeout(400);
  console.log('[sim] status:', await p.textContent('#si-status'));

  // 다크 모드 + 모바일 폭
  const m = await page({ width: 390, height: 844 });
  await m.emulateMedia({ colorScheme: 'dark' });
  for (const tab of TABS) {
    await m.evaluate(t => { location.hash = t; }, tab);
    await m.waitForTimeout(250);
    const over = await m.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
    if (over > 0) console.log(`[overflow] mobile ${tab}: +${over}px`);
    await m.screenshot({ path: path.join(OUT, `m-dark-${tab}.png`), fullPage: false });
  }
  console.log(`[console] ${errors.length} errors`);
  errors.slice(0, 10).forEach(e => console.log('  ', e));
  await browser.close();
  process.exit(errors.length || parity.onlyKo.length || parity.onlyEn.length || parity.missingUsed.length ? 1 : 0);
})();
