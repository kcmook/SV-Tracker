# 인수인계서 — 회생 제동(Regenerative Braking) 협조 제어 이질감 개선 PoC

| 항목 | 내용 |
|---|---|
| 문서 목적 | 다른 생성형 AI 또는 담당자가 이전 대화 없이 이 문서와 첨부 파일만으로 작업을 이어받기 위함 |
| 작성일 | 2026-11-16 |
| 현재 상태 | **1차 구현 완료.** 단일 HTML PoC(한국어/English)가 동작하고 검증까지 마쳤습니다. 다음 작업은 사용자 지시를 기다리는 중입니다. |
| 과제 담당(PoC 문서 작성자) | 최희선 |
| 패키지 구성 | `HANDOVER.md`(이 문서), `index.html`(결과물), `regen-brake-handover.zip`(소스, 데이터, 빌드 스크립트 포함 전체) |

---

## 0. 이어받는 AI에게 — 시작 프롬프트

아래 블록을 새 대화의 첫 메시지로 붙여 넣고, `HANDOVER.md`와 `index.html`(가능하면 zip)을 함께 첨부하십시오.

```text
너는 전기차 회생 제동 협조 제어 PoC를 이어받는 개발자 겸 데이터 분석가야.
첨부한 HANDOVER.md가 지금까지의 모든 맥락이고, index.html이 현재 결과물이야.
(zip이 있으면 그 안에 소스 src/, 빌드 스크립트 build/, 샘플 데이터 data/가 있어.)

규칙:
1. 먼저 HANDOVER.md 전체를 읽고, 이해한 내용을 5줄 이내로 요약한 뒤 내 지시를 기다려.
2. 작업은 "계획 제시 → 내 승인 → 구현" 순서로 해. 내가 "기억하고 대기"라고 하면 요약만 하고 멈춰.
3. 답변과 화면 문구는 한국어 기본이고, HTML은 한국어/English 전환을 유지해 (i18n 키 ko/en 동일).
4. 수치를 바꾸면 HANDOVER.md 5장 수치와 6장 데이터 스키마를 함께 갱신해.
5. 개선율은 대리모델 "예측값"이라는 점을 화면과 보고에서 숨기지 마.
```

먼저 읽을 장은 1장(과제), 2장(이력), 5장(방법·수치), 6장(HTML 내부 구조), 9장(다음 작업)입니다.

---

## 1. 과제 개요 (원본: PoC 기획 문서 「실전 AI 활용법」)

**과제명:** 회생 제동(Regenerative Braking) 협조 제어 이질감 개선

| 구분 | 내용 |
|---|---|
| 1. 배경 | 전기차는 제동할 때 모터 회생 제동과 유압 브레이크가 함께 작동합니다. 두 제동력이 매끄럽게 섞이지 않으면 차가 '울컥'거리고 승객이 멀미를 합니다. 변수가 많아서 엔지니어가 수작업으로 튜닝하기 어렵습니다. |
| 2. 목표 | AI가 운전자의 브레이크 습관과 노면 마찰력을 학습합니다. 이를 바탕으로 모터·유압 제동 비율을 **0.001초(1 ms) 단위**로 조절하는 협조 제어 로직을 만듭니다. 지향점은 "내가 전기차를 탔는지 모를 정도"의 제동감입니다. |
| 3. 해결방안 | 차속, 페달 입력, 휠 속도, 감속도, SOC 데이터를 통합해 분석합니다. 운전자의 제동 요구와 실제 감속을 비교하고, 주행 상황·노면별 배분 조건을 도출합니다. 회생 제동을 먼저 쓰고 부족분은 유압으로 보완합니다. 두 제동이 전환될 때 제동력이 급하게 변하지 않도록 최소화합니다. |
| 4. 프로세스 | 현황 분석·평가 기준 설정 → 데이터 수집 → 전처리·분석(운전자별 특성) → 배분 로직 개발·제어기 연동 → 시뮬레이션·HIL 검증 → 실차 시험(건조·젖은·저마찰 노면) → 기존 방식과 비교 평가, 반복 개선 |
| 5. 기대효과 | 승차감 향상, 에너지 회수율·전비·주행거리 개선, 제동 안정성, 수작업 튜닝 감소, 검증 효율 향상 |
| 6. 필요 지원 | CAN·센서 실차 데이터, PC·GPU 서버, Python·MATLAB/Simulink, ECU, SIL/HIL 장비, 시험차, 전문가 협업 체계(제동, 제어·임베디드, 데이터), 시험 시설, 일정·예산 |

---

## 2. 진행 이력 (질의응답 요약)

| 순서 | 사용자 요청 | 수행 내용 |
|---|---|---|
| 1 | PoC 문서(docx)를 공유하며 "구현할 거야. 기억하고 대기" | 문서 6개 항목을 요약하고 대기했습니다. |
| 2 | 샘플 데이터 5종(CSV)을 공유하며 "이걸로 진행. 기억하고 대기" | 데이터 구조와 특이사항을 파악했습니다(3장 참고). |
| 3 | "HTML 형태로 구현하려고 해. 작업계획서 작성해줘" | 계획서를 작성했습니다(독립 폴더, Python 전처리·학습, 단일 HTML, 6개 탭). |
| 4 | 계획 검토 의견: **"한국어와 영어를 선택해서 볼 수 있도록"** | 상단 KO/EN 토글을 넣고 모든 문구를 사전 키로 관리하도록 계획에 반영했습니다. |
| 5 | 계획 승인 | 구현, 검증, 커밋, 비공개 Artifact 게시까지 마쳤습니다. |
| 6 | "다른 생성형 AI가 이어받을 수 있게 인수인계서 작성" | 이 문서와 패키지를 작성했습니다. |

**사용자 작업 방식(선호):**
- 자료를 단계별로 주며 "기억하고 대기"를 요청합니다.
- 큰 작업은 계획서를 먼저 받고 승인 후에 진행합니다.
- 의사소통은 한국어로 합니다.

---

## 3. 데이터 사전 (`data/` 폴더, 모두 UTF-8 BOM)

| 파일 | 규모 | 내용 |
|---|---|---|
| `brake_events_lite.csv` | 6,000행 × 40열 | 제동 이벤트 요약. `split` train 5,041 / test 959 |
| `brake_timeseries_100hz_lite.csv` | 85,584행 × 18열 | 100 Hz 시계열, 이벤트 120개(이벤트당 1.5~15 s) |
| `calibrations_lite.csv` | 12행 | CAL00~CAL11: `share_max, blend_out_kmh, lead_ms, regen_rate` |
| `drivers_lite.csv` | 48행 | `driver_id, age_group, years_driving` |
| `vehicles_lite.csv` | 10행 | `vehicle_id, curb_mass_kg, pad_wear_pct, brake_fluid_age_months` |

**events 주요 컬럼**

- **제어 파라미터(최적화 대상)**
  - `regen_share_max`: 회생 비율 상한
  - `blend_out_speed_kmh`: 블렌드아웃 시작 속도
  - `hyd_lead_ms`: 유압 선행 시간
  - `regen_rate_limit_nps`: 회생 변화율 제한, N/s
- **조건**: `initial_speed_kmh, decel_target_mps2, pedal_apply_time_s, pedal_modulation_flag, emergency_flag, passengers, mass_est_kg, road_grade_pct, soc_pct, t_battery_c, t_ambient_c, rain_sensor, wiper_on, pad_temp_c, mu_estimate, hour_of_day, radio_volume`
- **결과**: `jerk_peak/rms/blend_peak/stop_peak_mps3, decel_error_rms_mps2, energy_regen_wh, energy_friction_wh, recovery_ratio, stop_distance_m, stop_time_s, abs_active, regen_force_peak_n, hyd_pressure_peak_bar, comfort_score(1~10)`

**timeseries 컬럼:** `event_id, time_s, speed_kmh, brake_pedal_pct, decel_demand_mps2, decel_meas_mps2, jerk_mps3, regen_torque_cmd/act/limit_nm, hyd_pressure_cmd/act_bar, motor_rpm, abs_flag, wheel_speed_fl/fr/rl/rr_kmh`

**확인된 특이사항**
- `calibration_id = "DOE"` 2,400건은 4개 파라미터가 연속값(실험계획)입니다. 학습의 핵심 소스입니다.
  - CAL 이벤트의 파라미터 값은 calibrations 테이블과 정확히 일치합니다.
- `comfort_score`는 2,172건에만 있습니다(train 1,837 / test 335).
- 결측: `mu_estimate` 102, `pad_temp_c` 104, `t_battery_c` 79, `stop_time_s` 6건
- `recovery_ratio` = 회생 에너지 Wh ÷ 초기 운동에너지(½mv²)입니다(상관 0.996으로 확인). 13건은 1을 넘는데, 센서 이상으로 봅니다.
- 시계열 이벤트 120개 중 **15개만** events와 ID가 겹칩니다(18, 204, 302, 362, 420, 561, 583, 681, 706, 728, 733, 829, 858, 985, 1090).
- `rain_sensor`와 `wiper_on`은 거의 중복입니다. `radio_volume`, `hour_of_day`, `passengers`는 결과와 상관이 없습니다(교란 변수).
- 시계열에서 추정한 물리 관계
  - 노면 제동력 ≈ 26.8 × 회생토크(N·m) + 82.7 × 유압(bar)
  - 회생 실제값/요구값 비율은 `regen_share_max`와 같습니다.
  - 회생 한계는 `blend_out_speed`부터 약 2.9 km/h까지 선형으로 0이 됩니다.
  - 유압 지연은 약 100 ms입니다.

---

## 4. 구현 결과물 구조

### 4.1 화면 (index.html, 6개 탭, 해시 라우팅)

| 탭 (`#hash`) | 내용 |
|---|---|
| 개요 `#overview` | 배경과 목표, KPI 4개(AI vs 기존 CAL), 구현 흐름 5단계, 파라미터 4종 설명 |
| 데이터 탐색 `#data` | 데이터셋 요약, 결측 처리표, 노면별 저크·ABS 차트, 상관 히트맵(교란 변수 취소선), 분포 히스토그램 |
| 실측 시계열 `#series` | 이벤트 120개 선택 뷰어. 속도·페달, 요구·실측 감속·저크, 회생·유압 제동력. 블렌딩 구간을 음영으로 표시하고, 연결 이벤트는 1 ms 시뮬레이션을 겹쳐 보며 RMSE를 표시합니다. |
| AI 모델 `#model` | 모델 성능표, 실제 vs 예측 산점도, 순열 중요도, 파라미터 부분의존 곡선 4개, 운전자 군집 산점도와 유형표 |
| 협조 제어 시뮬레이터 `#simulator` | 입력: 운전자 유형, 노면, 속도, 목표감속, 페달시간, SOC, 질량, 경사, 변조, 기준 CAL, 가중치 4개 → AI 최적화 → 파라미터와 결과 비교표 → 감속, 저크, 제동력 분담 차트 |
| 검증·기대효과 `#validation` | 기존, 최적 고정 CAL, AI 비교 차트. 노면별 개선율, 에너지 효과, AI 캘리브레이션 맵(4유형 × 3노면), CAL별 결과표, 시뮬레이터 타당성표, 한계와 다음 단계 |

공통 기능
- 상단 한국어/English 토글: 선택은 localStorage `rb-lang`에 저장되며, 기본은 한국어입니다.
- 라이트/다크 자동 대응, 모바일 폭(390px) 대응

### 4.2 파일 트리 (저장소 `poc/regen-brake/`, zip에도 동일 구조)

```
poc/regen-brake/
├─ index.html              ← 최종 결과물 (자급형 단일 파일, 약 1.6 MB)
├─ README.md
├─ package.json            ← {"type":"commonjs"} (상위 저장소가 ESM이라 필요)
├─ data/                   ← 샘플 CSV 5종
├─ src/
│  ├─ template.html        ← 마크업 + 치환 자리표시자 (/*__CSS__*/ 등)
│  ├─ style.css            ← 디자인 토큰, 레이아웃
│  ├─ core.js              ← 대리모델 평가기 · 최적화기 · 1 ms 시뮬레이터 (브라우저/Node 공용)
│  ├─ i18n.js              ← window.I18N = {ko:{...}, en:{...}}
│  └─ app.js               ← 화면 렌더링 (Chart.js), 라우팅, 이벤트
├─ build/
│  ├─ prepare.py           ← 전처리 · 군집 · Ridge 학습 · 최적화 · JSON 내보내기
│  ├─ check.js             ← JS↔Python 일치 검사, 시뮬레이터 실측 검증 → sim_valid.json
│  ├─ build_html.py        ← src + JSON → index.html, build/artifact.html
│  ├─ verify.cjs           ← Playwright 브라우저 검증 (탭 6 × 언어 2, 콘솔 에러, 키 누락, 모바일)
│  ├─ model.json           ← 모델·평가 결과 (약 170 KB)
│  ├─ ts.json              ← 시계열 50 Hz 정수 인코딩 (약 1.3 MB)
│  └─ sim_valid.json
└─ handover/               ← 이 인수인계 패키지
```

### 4.3 빌드 파이프라인

```
data/*.csv ──prepare.py──▶ build/model.json, ts.json
                 └─check.js──▶ build/sim_valid.json (+ parity 검사)
src/* + build/*.json ──build_html.py──▶ index.html (+ build/artifact.html: doctype 없는 게시용)
index.html ──verify.cjs──▶ 스크린샷, 오류 검사
```

---

## 5. 방법과 핵심 수치

### 5.1 전처리
- events에 drivers와 vehicles를 조인합니다.
- 결측 `mu_estimate`, `pad_temp_c`, `t_battery_c`는 **강우 여부별 train 중앙값**으로 채우고 `_missing` 플래그를 남깁니다.
- `recovery_ratio`는 1.2로 클리핑해 `recovery_ratio_c`로 씁니다.
- **노면 분류**: `mu < 0.4` → `low`, `rain_sensor == 1` → `wet`, 나머지 → `dry`. 건수는 dry 4,282, wet 1,170, low 548입니다.
  - 저마찰 노면의 ABS 개입률은 약 50%로, 건조 노면 약 2.5%보다 훨씬 높습니다.
- 모델에서 제외한 변수: `radio_volume, hour_of_day, wiper_on, passengers`

### 5.2 운전자 습관 군집
- 운전자별 평균 페달 밟는 시간, 평균 목표 감속, 변조 비율을 표준화한 뒤 k-means(k=4)로 묶습니다. 초기화는 결정적입니다.

| 유형 | 운전자 | 이벤트 | 페달 시간 중앙값 | 목표 감속 중앙값 | 변조 |
|---|---|---|---|---|---|
| smooth 부드러운형 | 12 | 1,454 | 0.90 s | 1.84 | 0 |
| normal 보통형 | 22 | 2,789 | 0.58 s | 2.28 | 0 |
| aggressive 급제동형 | 10 | 1,225 | 0.27 s | 3.77 | 0 |
| modulating 페달 변조형 | 4 | 532 | 0.58 s | 2.21 | 1 |

### 5.3 대리모델 (2차 Ridge)
- **입력 20개**
  - 파라미터 4개: `regen_share_max, blend_out_speed_kmh, hyd_lead_ms, regen_rate_limit_nps`
  - 조건 16개: `initial_speed_kmh, decel_target_mps2, pedal_apply_time_s, pedal_modulation_flag, emergency_flag, mass_est_kg, road_grade_pct, soc_pct, t_battery_c, t_ambient_c, rain_sensor, pad_temp_c, mu_estimate, pad_wear_pct, brake_fluid_age_months, years_driving`
- **입력 순서는 고정입니다.** `feats = params + conds`
- **특성 230개**: 표준화한 z 20개, z² 20개, 교호항 z_i·z_j(i<j) 190개. 이 순서는 JS와 같아야 합니다.
- λ는 [0.3, 1, 3, 10, 30, 100, 300, 1000] 중에서 train 5-fold 교차검증(시드 42)으로 고릅니다.

| 대상 | 컬럼 | 변환 | λ | train R² | **test R²** | test MAE |
|---|---|---|---|---|---|---|
| jerk | `jerk_blend_peak_mps3` | log | 30 | 0.711 | **0.696** | 1.52 m/s³ |
| err | `decel_error_rms_mps2` | log | 10 | 0.890 | **0.895** | 0.104 m/s² |
| rec | `recovery_ratio_c` | 없음 | 100 | 0.863 | **0.844** | 0.048 |
| comfort | `comfort_score` | 없음 | 30 | 0.743 | **0.699** | 1.23점 (학습 1,837 / test 335) |

- JS 구현(`core.js` `makeModel`)은 Python과 최대 오차 4.9e-10으로 일치합니다.

### 5.4 최적화 (배분 파라미터 추천)
- **격자 탐색 공간**: 15 × 9 × 9 × 8 = 9,720개 조합
  - share 0.30~1.00(0.05 간격)
  - blend-out {6, 8, 10, 12, 14, 16, 18, 21, 25} km/h
  - lead {0, 20, 40, 60, 80, 100, 130, 160, 200} ms
  - rate {5k, 8k, 12k, 17k, 24k, 33k, 45k, 60k} N/s
- **비용함수**: `J = 0.40·ŷjerk/σjerk + 0.25·ŷerr/σerr − 0.15·ŷrec/σrec − 0.20·ŷcomfort/σcomfort`
  - jerk와 err는 log 공간 예측값입니다.
  - σ는 각 타깃의 train 표준편차입니다.
- **제약 조건**
  1. 예측 감속 오차가 기준 CAL 예측값보다 나쁘면 안 됩니다(`err_tol = 1.0`).
  2. μ < 0.4이면 `regen_share_max ≤ 0.60`입니다(저마찰 안전 규칙).
  3. 기준 CAL보다 J가 낮은 조합이 없으면 기준 CAL을 유지합니다.

### 5.5 결과 (test 중 고정 CAL 주행 574건: 건조 425, 젖은 104, 저마찰 45 / 대리모델 예측)

| 지표 | 기존 CAL 평균 | AI 추천 평균 | 변화 |
|---|---|---|---|
| 블렌딩 저크 (m/s³) | 3.017 | 1.814 | **−39.9%** |
| 감속 오차 RMS (m/s²) | 0.303 | 0.247 | **−18.7%** |
| 에너지 회수율 | 0.492 | 0.644 | **+30.9%** |
| 승차감 점수 | 5.40 | 5.95 | **+10.2%** |

- **최적 고정 CAL은 CAL08**입니다(모든 상황에 하나만 쓸 때 J 최소). 결과는 저크 2.21, 오차 0.280, 회수율 0.579, 승차감 5.66입니다.
  - 즉 AI 적응형이 최적 고정 CAL보다도 낫습니다.
- **에너지**: 제동 1회당 +11.9 Wh, 1,000회당 +11.9 kWh입니다. 전비 160 Wh/km를 가정하면 약 +74.5 km에 해당합니다.
- **AI 추천 경향**
  - 회생 비율은 대부분 1.0입니다(저마찰 노면은 0.6).
  - 블렌드아웃은 16~18 km/h, 유압 선행은 60~100 ms가 대부분입니다.
  - 변화율은 5k와 60k로 양극화됩니다(9장 참고).
- 저마찰 노면은 안전 규칙 때문에 회수율이 약 −2%입니다. 대신 저크와 오차는 개선됩니다.

### 5.6 1 ms 협조 제어 시뮬레이터 (`core.js` `simulate`)
- 매 1 ms마다 아래 순서로 계산합니다.
  1. 요구 감속 프로파일을 만듭니다. 페달 시간 동안 코사인 램프로 올리고, 변조형이면 ±12% 0.9 Hz를 더하고, 6 km/h 미만에서는 운전자가 감속을 완화합니다.
  2. 회생 목표 = min(share × m × a, 요구 제동력, 가용 회생력)
     - 가용 회생력 = 토크 한계 280 N·m × SOC 감쇄(90% 초과 시) × 블렌드아웃 선형 감소, 그리고 전력 150 kW와 전륜 접지 한계를 넘지 않음
  3. 변화율 제한(rate × dt)과 모터 지연(10 ms)을 적용합니다.
  4. 유압 지령 = 요구 − min(현재 회생 지령, **lead 시간 뒤 예상 회생**). 무효시간 30 ms와 1차 지연 70 ms를 거칩니다.
  5. μ·m·g를 넘으면 ABS로 판정하고 7 Hz 진동을 넣습니다.
  6. 가속도 필터(12 ms) 뒤 저크를 계산합니다.
- **차량 상수(실측 회귀)**: KT = 26.83 N/(N·m), KH = 82.69 N/bar, 휠속/모터각속도 = 0.0367 m/s per rad/s, 회생 종료 2.9 km/h
- **출력 지표**: `jerkBlend, jerkPeak, jerkStop, errRms, eRegWh, eFricWh, recovery, stopTime, stopDist, abs, steps`
- **검증**: 연결 이벤트 15개에 실측 요구감속을 재생했을 때 실측 감속과의 **평균 RMSE는 0.185 m/s²**입니다.
- **유압 선행 시간 민감도**: 블렌딩 저크가 U자형입니다(시뮬레이터 기준 40~60 ms 부근에서 최소).

---

## 6. HTML 내부 구조 (저장소 없이 index.html만으로 수정하는 법)

index.html은 아래 순서의 블록으로 이루어진 **자급형 파일**입니다.

1. `<title>Regen Blend Lab</title>`, Google Fonts(IBM Plex Sans KR / IBM Plex Mono), `<style>`(= `src/style.css`)
2. 마크업: `header.topbar`(브랜드, 언어 토글 `#lang-ko/#lang-en`, 탭 `nav#tabs`), `main` 안의 `section.view#view-{overview|data|series|model|simulator|validation}`
   - 문구 요소는 `data-i18n="키"`를 갖습니다.
3. `<script src="https://cdnjs.cloudflare.com/ajax/libs/Chart.js/4.4.1/chart.umd.min.js">`
4. `<script type="application/json" id="model-data">`: `build/model.json`
5. `<script type="application/json" id="ts-data">`: `build/ts.json`
6. `<script type="application/json" id="simvalid-data">`: `build/sim_valid.json`
7. `<script>` core: `window.RB = { makeModel, simulate, VEH }`
8. `<script>` i18n: `window.I18N = { ko: {...}, en: {...} }`
9. `<script>` app: IIFE. 로드가 끝나면 `window.__RB_READY__ = true`

**model.json 주요 키**

| 키 | 내용 |
|---|---|
| `feats`, `params`, `conds`, `noise` | 특성 이름 (순서 중요) |
| `mu`, `sd` | 표준화 평균과 표준편차 (feats 순서) |
| `models.{jerk,err,rec,comfort}` | `col, tf(log/id), lam, w[230], b, sd, r2_test, r2_train, mae_test, n_train, n_test, cv_r2` |
| `importance` | 타깃별 {특성: test R² 감소} |
| `grid`, `weights`, `lowmu_cap`, `err_tol` | 최적화 설정 |
| `calibrations`, `cal_cost`, `best_fixed` | CAL 표, CAL별 평균 예측, 최적 고정 CAL |
| `eval[]` | test CAL 이벤트별 `{id, cal, road, dtype, base[4], ai[4], act[4], p[4], ke_wh}`. 지표 순서는 jerk, err, rec, comfort |
| `cmap[]` | 캘리브레이션 맵 `{dtype, road, n, p[4], base[4], ai[4]}` |
| `pd` | 파라미터별 부분의존 `{x[15], jerk[], err[], rec[], comfort[]}` |
| `eda` | `corr{rows, cols, v}`, `road[]`, `hist{}` |
| `scatter` | 타깃별 test [실제, 예측] 최대 400점 |
| `cond_ranges`, `road_presets`, `drivers{profiles, defaults}` | 시뮬레이터 입력 기본값 |
| `parity` | JS 일치 검사용 샘플 20건 |
| `summary`, `ts_meta` | 데이터 요약, 시계열 인코딩 정보 |

**ts.json:** 배열 120개. 각 원소는 `{id, n, dt:0.02, v0, dmax, jmax, blend:[t0,t1]|null, abs, <컬럼>:[정수...], ev?:{cal, p[4], mass, mu, soc, grade, apply, target, jerk_blend, rec, road}}`입니다.
- 정수 배열은 `ts_meta.cols`의 배율로 나누면 원래 값이 됩니다(예: speed ÷10, decel ÷100).

**app.js 구조**
- 함수: `renderOverview / renderData / renderSeries / renderModel / renderSim / renderValidation`
- 탭 전환: `show(tab)`. 처음 볼 때만 렌더링합니다(`state.rendered`).
- 언어나 테마가 바뀌면 `rerenderAll()`로 모든 문구와 차트를 다시 그립니다.
- 공통 유틸: `t(key, vars)`(i18n), `fmt`/`pct`(로케일 숫자), `chart(id, cfg)`(기존 차트 destroy 후 생성), `bandsPlugin`(블렌딩 음영)
- 시뮬레이터: `renderSim()`이 다음을 순서대로 수행합니다.
  1. 조건 벡터 구성
  2. `model.optimize(cond, ref, {weights})`
  3. `RB.simulate()` 두 번(기존 CAL, AI 추천)
  4. 표와 차트 갱신

**규칙**
- **i18n**: 새 문구는 반드시 `I18N.ko`와 `I18N.en`에 같은 키로 추가합니다. `verify.cjs`가 키 집합 일치를 검사합니다.
- **CSS**: 색은 `:root` 토큰만 씁니다. 다크모드는 `prefers-color-scheme`와 `[data-theme]` 블록으로 처리합니다.
  - `--regen`(청록)은 회생, `--hyd`(주황)는 유압, `--ai`(남색)는 AI 추천, `--ref`(회색)는 기존을 뜻합니다.
- `[hidden] { display:none !important }`가 있어야 탭이 숨겨집니다(실제로 버그가 났던 부분).

**index.html만 받은 경우 수정 방법**
- 작은 문구 수정은 HTML 안의 `window.I18N` 블록을 직접 편집합니다.
- 모델이나 데이터를 바꾸려면 JSON 블록을 교체합니다.
- 구조를 크게 바꾸려면 zip의 `src/`를 수정한 뒤 `build_html.py`로 다시 생성하는 것이 안전합니다.

---

## 7. 설계 결정과 이유

| 결정 | 이유 |
|---|---|
| 기존 저장소 앱(다나와 대시보드, React/Vite)과 분리한 독립 폴더 | 과제와 무관한 앱이라 영향을 주지 않으려고 |
| 단일 HTML + JSON 인라인 | 파일 하나로 공유와 열람이 가능하고, 서버가 필요 없습니다. |
| 2차·교호항 Ridge 대리모델 | 해석 가능하고 계수가 230개뿐이라 JS로 옮기기 쉽습니다. Python과 완전히 일치합니다. 선형 모델 대비 test R²도 개선됐습니다(jerk 0.60→0.70, rec 0.71→0.84). |
| 격자 탐색 (경사법 대신) | 결정적이라 재현이 쉽고, 데이터(DOE) 범위 밖으로 외삽하지 않습니다. 브라우저에서도 약 20 ms면 끝납니다. |
| 감속 오차 비악화 제약 | 승차감을 위해 제동 성능(요구 추종)을 희생하지 않으려고 |
| 저마찰 노면 회생 비율 상한 0.6 | 회생은 한 축(구동축)에만 걸려 저마찰에서 바퀴가 잠길 위험이 있어서 둔 공학적 안전 규칙입니다. 데이터에서 직접 도출한 값은 아닙니다. |
| 비교 기준: 실제 CAL, 최적 고정 CAL, AI | "고정값 하나로도 되지 않느냐"는 반론에 답하려고 |
| 시뮬레이터 회생 목표 = min(share·m·a, 요구, 가용) | 실측 시계열에서 회생/요구 비율이 share와 같았고, share가 1.0일 때 과제동이 생기는 것을 막으려고 |
| 시계열 50 Hz 정수 인코딩 | 파일 크기를 7.7 MB에서 1.3 MB로 줄이려고 |
| 시뮬레이터 저크 차트 축에서 정차 스파이크를 자름 | 정차 순간 스파이크(−45 m/s³)가 블렌딩 구간 비교를 가려서. 화면에 이 사실을 명시했습니다. |
| 한국어/English 토글 | 사용자 요청 |

---

## 8. 알려진 한계와 주의사항

1. **개선율은 대리모델 예측값입니다.** 실측으로 확인한 값이 아닙니다(보고할 때 반드시 명시).
2. 시뮬레이터는 물리 근사 모델이고, 검증 표본은 15건입니다.
   - #302, #362, #561은 감속 RMSE가 0.3~0.56 m/s²로 큽니다.
   - #681(SOC 96%)은 실측 회수율 0.06인데 시뮬레이터는 0.20으로, 고 SOC 감쇄 모델이 단순합니다.
3. 시뮬레이터의 `jerkBlend` 정의(블렌드아웃 속도 이하에서 회생이 남아 있는 구간의 |저크| 최대값)는 데이터의 `jerk_blend_peak_mps3` 산출 방식과 같다고 보장할 수 없습니다.
4. AI가 추천한 `regen_rate_limit_nps`는 5k와 60k로 양극화됩니다. 2차 모델의 경계 효과일 가능성이 있습니다.
5. 대리모델과 시뮬레이터의 최적점이 다릅니다. 유압 선행 시간이 모델 기준 약 80 ms, 시뮬레이터 기준 40~60 ms로, 두 모델이 독립적입니다.
6. `comfort_score` 라벨은 일부(2,172건)에만 있습니다.
7. modulating 유형은 운전자가 4명뿐입니다.
8. 1 ms는 시뮬레이션 상의 제어 주기입니다. ECU 연산 시간과 CAN 지연은 반영하지 않았습니다.
9. Chart.js와 폰트는 CDN에서 불러옵니다. **오프라인에서는 차트가 나오지 않습니다**(9장 E 참고).
10. Artifact로 게시한 페이지는 **비공개**입니다. 다른 사람이 보려면 소유자가 Share 메뉴에서 공유해야 합니다.

---

## 9. 다음 작업 후보 (권장 우선순위)

| 우선 | 작업 | 수정 위치와 방법 |
|---|---|---|
| A | **발표용 요약 자료**(PoC 문서 목차 1~6에 맞춘 슬라이드 또는 보고서) | 5장 수치와 index.html 화면을 캡처해 사용 |
| B | **실측 근거 보강**: AI 추천과 비슷한 파라미터로 실제 주행한 근접 이벤트(DOE 포함)의 실측 결과를 기존 CAL과 비교 | `prepare.py`에서 조건·파라미터 kNN 매칭 → `model.json`에 `evidence` 추가 → `app.js` 검증 탭에 표 추가 |
| C | 대리모델 고도화(GBM, MLP 등) 및 불확실성(부트스트랩 구간) 표시 | `prepare.py`의 `expand/ridge`를 교체. JS 평가가 가능하도록 트리 JSON과 평가기를 `core.js`에 추가하고, `parity` 검사를 유지 |
| D | 시뮬레이터 보정(고 SOC 감쇄, 유압 지연, 블렌딩 저크 정의를 데이터에 맞춤) | `core.js` `VEH`, `simulate`. `node build/check.js`로 RMSE와 표를 확인 |
| E | 오프라인 버전(Chart.js 인라인) | `build_html.py`에서 CDN `<script src>`를 로컬 chart.umd.js 내용으로 치환하는 옵션 추가 |
| F | 최적화 2단계(격자 → 국소 미세 탐색), 변화율 양극화 완화 | `prepare.py` `optimize`와 `core.js` `optimize`를 같은 규칙으로 함께 수정 |
| G | PoC 문서 6장 "필요 지원"을 화면에 구체화(데이터, 장비, 인력, 일정 표) | `i18n.js`에 키 추가, `template.html` 검증 탭 |

---

## 10. 재생성과 검증

필요 환경: Python 3.10 이상(pandas, numpy), Node 18 이상. 선택 사항으로 Playwright와 Chromium.

```bash
cd poc/regen-brake            # zip을 풀었다면 그 폴더
python3 build/prepare.py      # 약 15초
node build/check.js
python3 build/build_html.py
```

**기대 출력**
- `prepare.py`
  - `[model] jerk λ=30 testR²=0.696`, `err λ=10 0.895`, `rec λ=100 0.844`, `comfort λ=30 0.699`
  - `[opt] best single fixed CAL = CAL08`
  - `[eval] ... jerk -39.9 err -18.7 rec +30.9 comfort +10.2`
- `check.js`
  - `[parity] JS vs Python max |diff| ≈ 5e-10` (1e-6을 넘으면 실패 처리)
  - `[sim] decel RMSE mean = 0.185`
- `build_html.py`
  - `[build] index.html 1.60 MB`

**브라우저 검증 (선택)**

CDN이 막힌 환경이면 `npm i chart.js@4.4.1`로 받은 파일 경로를 `CHART_JS`로 넘깁니다.

```bash
CHART_JS=node_modules/chart.js/dist/chart.umd.js node build/verify.cjs ./shots
```
- 기대 결과: `[i18n] {"onlyKo":[],"onlyEn":[],"missingUsed":[]}`, `[console] 0 errors`, `[overflow]` 출력 없음
- 결정성: 시드가 고정되어 있어 재실행해도 같은 JSON과 HTML이 나옵니다.

---

## 11. 참고 위치

- GitHub 저장소 `kcmook/sv-tracker`, 브랜치 `claude/festive-feynman-p4rqul`, 경로 `poc/regen-brake/`
- 게시 페이지(비공개 Artifact): https://claude.ai/artifact/9zGZGuh1LnmRLF2EqCZiMV
- 원본 PoC 문서(docx)와 원본 CSV는 사용자가 업로드한 파일입니다. CSV는 `data/`에 원본 그대로 복사되어 있습니다. docx 내용은 1장에 전부 요약했습니다.
