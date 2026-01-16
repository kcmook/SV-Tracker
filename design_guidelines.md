# Design Guidelines: 다나와 급상승 모델 레이더

## Design Approach

**Selected Approach:** Design System - Material Design  
**Justification:** Information-dense analytics dashboard requiring clarity, data hierarchy, and efficient scanning of metrics.

**Key Principles:**
- Data clarity over decoration
- Scannable metric presentation
- Responsive grid for model cards
- Clear visual hierarchy for numerical data

---

## Typography

**Primary Font:** Inter (Google Fonts)
- Headers (H1): 32px, Bold - Page title "급상승 모델 레이더"
- Headers (H2): 24px, Semibold - Section headers
- Model Names: 18px, Semibold
- Metrics (numbers): 20px, Bold - Sales figures, changes
- Labels: 14px, Medium - Metric labels
- Body/Secondary: 14px, Regular - Supporting text

**Korean Font:** Noto Sans KR (fallback for Korean text)

---

## Layout System

**Spacing Units:** Tailwind units of 2, 4, 6, 8, 12, 16
- Card padding: p-6
- Section spacing: py-12, py-16
- Gap between cards: gap-6
- Container max-width: max-w-7xl

**Grid Structure:**
- Desktop (lg): 3 columns for model cards
- Tablet (md): 2 columns
- Mobile: 1 column

---

## Component Library

### 1. Header Section
- Logo/Title on left
- Month selector dropdown (center-right)
- Domestic/Import toggle switch (right)
- Sticky on scroll

### 2. Filters Panel
- Horizontal layout on desktop, stacked on mobile
- Slider: Minimum sales threshold (300-5000+ range)
- Checkbox: "신규 진입 모델 제외"
- Real-time filter count indicator

### 3. Model Cards (Primary Component)
**Card Structure:**
- Elevated card with subtle shadow (shadow-md)
- Rank badge (top-left corner, circular)
- Model name (prominent)
- Sales figure with unit label
- Change indicators grid (2 columns):
  - Month-over-month: "+XXX대" with percentage
  - Rank change: "↑X 순위" 
- "다나와 원문 보기" button (outlined, bottom)

**Visual Indicators:**
- Green upward arrows/text for positive changes
- Numeric changes in tabular mono font for alignment
- Clear spacing between metric groups

### 4. Empty States
- "해당 기간의 데이터가 없습니다" message
- Illustration or icon placeholder
- Suggestion text for adjusting filters

### 5. Loading States
- Skeleton cards matching final card layout
- Pulsing animation on data-heavy sections

---

## Icons
**Library:** Heroicons (via CDN)
- Trend up/down arrows
- Filter icon
- External link (for Danawa button)
- Calendar (month selector)

---

## Images
**No hero images required** - This is a data-first dashboard. Focus entirely on information architecture.

**Optional:** Small Danawa logo in header for brand recognition (linked to source)

---

## Animations
**Minimal animations only:**
- Card hover: subtle lift (translateY -2px)
- Number changes: brief highlight fade when data updates
- Loading skeletons: gentle pulse

**NO complex scroll animations or transitions** - maintain performance for data scanning.