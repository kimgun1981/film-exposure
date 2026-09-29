// 노출 계산에 쓰는 기준 값 목록 (조리개·셔터·ISO·ND·장면·필름).
// 모든 값은 "스톱" 단위로 저장한다. 1스톱 = 빛의 양 2배.
//   조리개 Av = 2·log2(f값)   f/1 = 0, f/1.4 = 1, f/2 = 2 ...
//   셔터   Tv = log2(1/초)    1초 = 0, 1/2 = 1, 1/1000 ≈ 10 ...
//   ISO    = log2(ISO/100)    ISO 100 = 0, ISO 400 = 2 ...
//   ND     = 줄어드는 스톱 수  ND8 = 3 ...

// ── 조리개 ─────────────────────────────────────────────
const AP_THIRD = [
  '1', '1.1', '1.2', '1.4', '1.6', '1.8', '2', '2.2', '2.5', '2.8', '3.2', '3.5',
  '4', '4.5', '5', '5.6', '6.3', '7.1', '8', '9', '10', '11', '13', '14',
  '16', '18', '20', '22', '25', '29', '32', '36', '40', '45', '51', '57', '64',
];
const AP_HALF = [
  '1', '1.2', '1.4', '1.7', '2', '2.4', '2.8', '3.3', '4', '4.8', '5.6', '6.7',
  '8', '9.5', '11', '13', '16', '19', '22', '27', '32', '38', '45', '54', '64',
];

export const APERTURE_SCALES = {
  full: AP_THIRD.filter((_, i) => i % 3 === 0).map((n, i) => ({ value: i, label: `f/${n}` })),
  half: AP_HALF.map((n, i) => ({ value: i / 2, label: `f/${n}` })),
  third: AP_THIRD.map((n, i) => ({ value: i / 3, label: `f/${n}` })),
};

// ── 셔터 (빠른 것 → 느린 것) ─────────────────────────────
// 1/8000초(Tv 13)부터 30초(Tv −5)까지 1/3스톱 간격
const SH_THIRD = [
  '1/8000', '1/6400', '1/5000', '1/4000', '1/3200', '1/2500', '1/2000', '1/1600', '1/1250',
  '1/1000', '1/800', '1/640', '1/500', '1/400', '1/320', '1/250', '1/200', '1/160',
  '1/125', '1/100', '1/80', '1/60', '1/50', '1/40', '1/30', '1/25', '1/20',
  '1/15', '1/13', '1/10', '1/8', '1/6', '1/5', '1/4', '0.3초', '0.4초',
  '1/2', '0.6초', '0.8초', '1초', '1.3초', '1.6초', '2초', '2.5초', '3.2초',
  '4초', '5초', '6초', '8초', '10초', '13초', '15초', '20초', '25초', '30초',
];
const SH_TOP = 13; // 1/8000초의 Tv

// 30초보다 긴 시간은 B(벌브)로 촬영
const SH_BULB = [
  { value: -6, label: '1분' },
  { value: -7, label: '2분' },
  { value: -8, label: '4분' },
  { value: -9, label: '8분' },
  { value: -10, label: '15분' },
  { value: -11, label: '30분' },
  { value: -12, label: '1시간' },
];

const shutterThird = SH_THIRD.map((label, i) => ({ value: SH_TOP - i / 3, label }));

export const SHUTTER_SCALES = {
  full: [...shutterThird.filter((_, i) => i % 3 === 0), ...SH_BULB],
  third: [...shutterThird, ...SH_BULB],
};

// ── ISO (1/3스톱 간격, 6 ~ 6400) ─────────────────────────
const ISO_LABELS = [
  '6', '8', '10', '12', '16', '20', '25', '32', '40', '50', '64', '80',
  '100', '125', '160', '200', '250', '320', '400', '500', '640', '800', '1000', '1250',
  '1600', '2000', '2500', '3200', '4000', '5000', '6400',
];
export const ISO_LIST = ISO_LABELS.map((label, i) => ({ value: (i - 12) / 3, label }));

// ── ND 필터 (0 ~ 20스톱) ─────────────────────────────────
const ND_NAMES = [
  '', '2', '4', '8', '16', '32', '64', '128', '256', '500', '1000',
  '2000', '4000', '8000', '16000', '32000', '64000', '128000', '256000', '500000', '1000000',
];
export const ND_LIST = ND_NAMES.map((name, n) => ({
  value: n,
  label: n === 0 ? '없음' : `ND${name} (${(0.3 * n).toFixed(1)}) · ${n}스톱`,
  short: n === 0 ? '없음' : `ND${name} · ${n}스톱`, // 좁은 칸에 보일 이름
}));

// ── EV (장면 밝기, −8 ~ 20, 1/3스톱 간격) ────────────────
export const EV_LIST = [];
for (let k = -24; k <= 60; k++) EV_LIST.push({ value: k / 3 });

// ── 장면별 밝기 (ISO 100 기준 EV, 대략값) ─────────────────
// 범위가 있는 장면은 어두운 쪽 값을 기본으로 둔다(네거티브 필름은 약간 밝게 찍는 편이 안전).
export const SCENES = [
  {
    group: '낮 야외',
    items: [
      { id: 'snow', label: '눈밭·모래사장 (맑음)', ev: 16 },
      { id: 'sunny', label: '맑음 · 그림자 선명', ev: 15 },
      { id: 'hazy', label: '옅은 구름 · 그림자 흐릿', ev: 14 },
      { id: 'cloudy', label: '흐림 · 그림자 없음', ev: 13 },
      { id: 'overcast', label: '잔뜩 흐림', ev: 12 },
      { id: 'shade', label: '맑은 날 그늘', ev: 12 },
    ],
  },
  {
    group: '해질녘',
    items: [
      { id: 'before-sunset', label: '해 지기 직전 (12~14)', ev: 13 },
      { id: 'sunset', label: '해 질 때', ev: 12 },
      { id: 'after-sunset', label: '해 진 직후 (9~11)', ev: 10 },
    ],
  },
  {
    group: '밤 · 야외 조명',
    items: [
      { id: 'neon', label: '네온사인·밝은 간판 (9~10)', ev: 9 },
      { id: 'bright-street', label: '밝은 번화가', ev: 8 },
      { id: 'night-street', label: '야간 거리·쇼윈도 (7~8)', ev: 7 },
      { id: 'amusement', label: '놀이공원 야경', ev: 7 },
      { id: 'traffic', label: '밤 차량 불빛', ev: 5 },
      { id: 'floodlit', label: '조명 비춘 건물·분수 (3~5)', ev: 4 },
      { id: 'distant-lights', label: '멀리 보이는 도시 불빛', ev: 2 },
    ],
  },
  {
    group: '실내',
    items: [
      { id: 'stage', label: '공연장·실내 경기장 (8~9)', ev: 8 },
      { id: 'office', label: '사무실·교실 (7~8)', ev: 7 },
      { id: 'home', label: '가정집 실내 (5~7)', ev: 6 },
    ],
  },
  {
    group: '달',
    items: [
      { id: 'moon', label: '보름달 (달 자체)', ev: 15 },
      { id: 'moonlit', label: '보름달빛 풍경 (−3~−2)', ev: -3 },
    ],
  },
  {
    group: '직접 입력',
    items: [{ id: 'custom', label: '노출계 값(EV) 직접 입력', ev: null }],
  },
];

// ── 필름과 장노출(상반칙불궤) 보정 자료 ─────────────────────
// power : 일포드 공식  보정시간 = 측정시간^p  (1초 초과부터)
// table : 코닥 공식 표 [측정시간, 보정시간] (로그 눈금으로 사이값 계산)
// step  : 후지필름 공식  from초까지 보정 없음, 그 뒤 stops만큼 추가
// nodata: 1초까지는 보정 불필요, 그보다 긴 노출은 앱에 자료 없음
const ilford = (p) => ({ type: 'power', p, source: `일포드 공식 계수 ${p}` });
const kodakColor = { type: 'nodata', source: '1초까지는 보정 불필요 (코닥 안내)' };

export const FILMS = [
  {
    group: '보정 없음',
    items: [{ id: 'none', label: '선택 안 함', iso: null, recip: { type: 'none' } }],
  },
  {
    group: '일포드 · 흑백',
    items: [
      { id: 'panf50', label: 'Ilford Pan F Plus 50', iso: 50, recip: ilford(1.33) },
      { id: 'fp4', label: 'Ilford FP4 Plus 125', iso: 125, recip: ilford(1.26) },
      { id: 'hp5', label: 'Ilford HP5 Plus 400', iso: 400, recip: ilford(1.31) },
      { id: 'delta100', label: 'Ilford Delta 100', iso: 100, recip: ilford(1.26) },
      { id: 'delta400', label: 'Ilford Delta 400', iso: 400, recip: ilford(1.41) },
      { id: 'delta3200', label: 'Ilford Delta 3200', iso: 3200, recip: ilford(1.33) },
      { id: 'xp2', label: 'Ilford XP2 Super 400', iso: 400, recip: ilford(1.31) },
      { id: 'sfx', label: 'Ilford SFX 200', iso: 200, recip: ilford(1.43) },
      { id: 'ortho', label: 'Ilford Ortho Plus 80', iso: 80, recip: ilford(1.25) },
      { id: 'kentmere100', label: 'Kentmere Pan 100', iso: 100, recip: ilford(1.26) },
      { id: 'kentmere400', label: 'Kentmere Pan 400', iso: 400, recip: ilford(1.3) },
    ],
  },
  {
    group: '코닥 · 흑백',
    items: [
      {
        id: 'trix', label: 'Kodak Tri-X 400', iso: 400,
        recip: { type: 'table', points: [[0.1, 0.1], [1, 2], [10, 50], [100, 1200]], source: '코닥 공식 표' },
      },
      {
        id: 'tmax100', label: 'Kodak T-MAX 100', iso: 100,
        recip: { type: 'table', points: [[0.1, 0.1], [1, 1.26], [10, 15], [100, 200]], source: '코닥 공식 표' },
      },
      {
        id: 'tmax400', label: 'Kodak T-MAX 400', iso: 400,
        recip: { type: 'table', points: [[1, 1], [10, 12.6], [100, 300]], source: '코닥 공식 표' },
      },
    ],
  },
  {
    group: '후지필름 · 흑백',
    items: [
      {
        id: 'acros2', label: 'Fujifilm Acros 100 II', iso: 100,
        recip: { type: 'step', from: 120, stops: 0.5, max: 1000, source: '후지필름 공식 자료 (120초까지 보정 없음)' },
      },
    ],
  },
  {
    group: '코닥 · 컬러 네거티브',
    items: [
      { id: 'portra160', label: 'Kodak Portra 160', iso: 160, recip: kodakColor },
      { id: 'portra400', label: 'Kodak Portra 400', iso: 400, recip: kodakColor },
      { id: 'portra800', label: 'Kodak Portra 800', iso: 800, recip: kodakColor },
      { id: 'ektar100', label: 'Kodak Ektar 100', iso: 100, recip: kodakColor },
      { id: 'gold200', label: 'Kodak Gold 200', iso: 200, recip: kodakColor },
      { id: 'ultramax400', label: 'Kodak Ultramax 400', iso: 400, recip: kodakColor },
      { id: 'colorplus200', label: 'Kodak ColorPlus 200', iso: 200, recip: kodakColor },
    ],
  },
  {
    group: '기타',
    items: [
      {
        id: 'generic', label: '기타 필름 · 일반 보정 (근사)', iso: null,
        recip: { type: 'power', p: 1.31, approx: true, source: '일반 근사 계수 1.31' },
      },
    ],
  },
];

export const findScene = (id) =>
  SCENES.flatMap((g) => g.items).find((s) => s.id === id) || SCENES[0].items[1];

export const findFilm = (id) =>
  FILMS.flatMap((g) => g.items).find((f) => f.id === id) || FILMS[0].items[0];
