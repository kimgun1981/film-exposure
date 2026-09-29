// 화면 동작: 값을 바꾸면 계산(exposure.js)을 다시 돌려 결과를 표시한다.
import {
  APERTURE_SCALES, SHUTTER_SCALES, ISO_LIST, ND_LIST, EV_LIST,
  SCENES, FILMS, findScene, findFilm,
} from './data.js';
import { solve, nearest, formatThirds, formatTime, formatF, tvToSec } from './exposure.js';
import { setupTimer } from './timer.js';

const VERSION = '1.0.0'; // sw.js의 VERSION과 같이 올린다
const STORE_KEY = 'film-exposure:v1';
const DEFAULTS = {
  mode: 'shutter',
  scene: 'sunny',
  ev: 15,
  film: 'none',
  iso: 0, // ISO 100
  nd: 0,
  av: 8, // f/16
  tv: 7, // 1/125
  apScale: 'third',
  shScale: 'full',
  theme: 'dark',
};
const THEMES = {
  dark: { name: '기본', color: '#0e0e0f', scheme: 'dark' },
  sun: { name: '햇빛', color: '#ffffff', scheme: 'light' },
  red: { name: '야간', color: '#000000', scheme: 'dark' },
};

const $ = (id) => document.getElementById(id);

// ── 저장 (앱을 다시 열어도 마지막 설정 유지) ──────────────
function load() {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem(STORE_KEY) || '{}') };
  } catch {
    return { ...DEFAULTS };
  }
}
function save() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(state)); } catch { /* 사생활 보호 모드 등 */ }
}
let state = load();

const apertures = () => APERTURE_SCALES[state.apScale] || APERTURE_SCALES.third;
const shutters = () => SHUTTER_SCALES[state.shScale] || SHUTTER_SCALES.full;
const evList = EV_LIST.map((e) => ({ value: e.value, label: formatThirds(e.value, false) }));

// ── 조절 줄: ‹ 값 › (값 글자를 누르면 선택창) ─────────────
function makeStepper(rowId, key, getList) {
  const row = $(rowId);
  const select = row.querySelector('select');
  const label = row.querySelector('.pick-label');
  const prev = row.querySelector('.prev');
  const next = row.querySelector('.next');
  let filledWith = null;

  const indexOf = (value) => getList().indexOf(nearest(getList(), value));

  function fill() {
    const list = getList();
    if (filledWith === list) return;
    select.innerHTML = '';
    list.forEach((item, i) => select.add(new Option(item.label, String(i))));
    filledWith = list;
  }
  function step(d) {
    const list = getList();
    const i = indexOf(state[key]) + d;
    if (i < 0 || i >= list.length) return;
    state[key] = list[i].value;
    onInput(key);
  }
  prev.addEventListener('click', () => step(-1));
  next.addEventListener('click', () => step(1));
  select.addEventListener('change', () => {
    state[key] = getList()[Number(select.value)].value;
    onInput(key);
  });

  return {
    show(value, auto = false, text = null) {
      fill();
      const list = getList();
      const i = indexOf(value);
      select.value = String(i);
      label.textContent = text || list[i].short || list[i].label;
      row.classList.toggle('auto', auto);
      select.disabled = auto;
      prev.disabled = auto || i <= 0;
      next.disabled = auto || i >= list.length - 1;
    },
  };
}

const rows = {
  ev: makeStepper('row-ev', 'ev', () => evList),
  iso: makeStepper('row-iso', 'iso', () => ISO_LIST),
  nd: makeStepper('row-nd', 'nd', () => ND_LIST),
  av: makeStepper('row-aperture', 'av', apertures),
  tv: makeStepper('row-shutter', 'tv', shutters),
};

// ── 장면·필름 선택창 채우기 ──────────────────────────────
function fillGrouped(select, groups) {
  for (const g of groups) {
    const og = document.createElement('optgroup');
    og.label = g.group;
    for (const item of g.items) {
      const label = item.ev == null ? item.label : `${item.label} · EV ${formatThirds(item.ev, false)}`;
      og.appendChild(new Option(label, item.id));
    }
    select.appendChild(og);
  }
}
const sceneSel = $('sceneSel');
const filmSel = $('filmSel');
fillGrouped(sceneSel, SCENES);
fillGrouped(filmSel, FILMS);

sceneSel.addEventListener('change', () => {
  state.scene = sceneSel.value;
  const s = findScene(state.scene);
  if (s.ev != null) state.ev = s.ev;
  onInput('scene');
});
filmSel.addEventListener('change', () => {
  state.film = filmSel.value;
  const f = findFilm(state.film);
  if (f.iso) state.iso = nearest(ISO_LIST, Math.log2(f.iso / 100)).value;
  onInput('film');
});

document.querySelectorAll('#modeSeg button').forEach((b) =>
  b.addEventListener('click', () => {
    state.mode = b.dataset.mode;
    onInput('mode');
  }),
);

function onInput() {
  render();
  save();
}

// ── 결과 그리기 ─────────────────────────────────────────
const timer = setupTimer();
let timerSeconds = 0;
$('timerBtn').addEventListener('click', () => timer.open(timerSeconds));

function meterText(d) {
  if (Math.abs(d) < 1 / 6) return '적정 노출';
  if (Math.abs(d) <= 0.5) return `거의 적정 (${formatThirds(d)}스톱)`;
  return d > 0
    ? `${formatThirds(d)}스톱 과다 · 밝게 찍힘`
    : `${formatThirds(d)}스톱 부족 · 어둡게 찍힘`;
}

function reciprocityNotes(r, film, notes) {
  const rc = r.rc;
  if (!rc) return;
  const source = film.recip.source ? ` (${film.recip.source})` : '';
  if (rc.applied) {
    if (r.mode === 'shutter') {
      notes.push(['info', `장노출 보정(상반칙불궤): 계산 ${formatTime(r.metered)} → 실제 ${formatTime(r.time)}, ${formatThirds(rc.stops)}스톱 더 노출${source}`]);
    } else {
      notes.push(['info', `장노출 보정(상반칙불궤): 셔터 ${formatTime(r.exposureTime)}는 이 필름에 약 ${formatTime(r.effectiveTime)} 효과라 ${formatThirds(rc.stops)}스톱 손실을 반영했습니다${source}`]);
    }
    if (rc.outOfRange) notes.push(['warn', '제조사 자료 범위를 넘어 추정한 값입니다. 여유 있게 노출하세요.']);
    if (film.recip.approx) notes.push(['warn', '일반 근사값입니다. 필름 제조사 자료가 있으면 그 값을 우선하세요.']);
  } else if (rc.noData) {
    notes.push(['warn', '이 필름은 1초보다 긴 노출의 보정 자료가 앱에 없습니다. 중요한 촬영이면 테스트하거나, 필름에서 "기타 필름 · 일반 보정"을 골라 참고하세요.']);
  }
}

function render() {
  const film = findFilm(state.film);
  const scene = findScene(state.scene);
  // 눈금 단위를 바꿨을 수 있으므로 현재 눈금의 가장 가까운 값으로 맞춘다
  state.av = nearest(apertures(), state.av).value;
  state.tv = nearest(shutters(), state.tv).value;
  const r = solve({
    mode: state.mode,
    ev: state.ev,
    iso: state.iso,
    nd: state.nd,
    av: state.av,
    tv: state.tv,
    recip: film.recip,
    apertures: apertures(),
    shutters: shutters(),
  });
  // 자동으로 계산된 값은 저장해 둔다 → 모드를 바꿔도 그 값에서 이어진다
  state.av = r.av;
  state.tv = r.tv;

  // 모드 버튼
  document.querySelectorAll('#modeSeg button').forEach((b) =>
    b.classList.toggle('on', b.dataset.mode === state.mode),
  );

  // 입력 줄
  sceneSel.value = scene.id;
  filmSel.value = film.id;
  rows.ev.show(state.ev);
  rows.iso.show(state.iso);
  rows.nd.show(state.nd);
  rows.av.show(r.av, state.mode === 'aperture');
  rows.tv.show(r.tv, state.mode === 'shutter', state.mode === 'shutter' && r.bulb ? 'B (벌브)' : null);

  const sceneHint = $('sceneHint');
  const evDiff = scene.ev == null ? 0 : state.ev - scene.ev;
  sceneHint.hidden = Math.abs(evDiff) < 1e-6;
  sceneHint.textContent = `장면 기준 EV ${formatThirds(scene.ev ?? 0, false)}에서 ${formatThirds(evDiff)} 조정됨`;

  const filmHint = $('filmHint');
  filmHint.hidden = film.id === 'none';
  if (film.recip.type !== 'none') {
    const boxIso = film.iso ? `박스 감도 ISO ${film.iso}` : '감도는 직접 맞추세요';
    filmHint.textContent = `${boxIso} · 장노출 보정: ${film.recip.source}`;
  }

  // 결과
  const main = $('resultMain');
  const sub = $('resultSub');
  const notes = [];
  let label;
  let mainText;
  let subText = '';

  if (state.mode === 'shutter') {
    label = '셔터속도';
    const pick = nearest(shutters(), r.tv);
    if (r.bulb) {
      mainText = formatTime(r.time);
      const d = r.pickDeviation;
      subText = Math.abs(d) < 1 / 6
        ? `카메라 눈금 ${pick.label}과 같음`
        : `가까운 눈금 ${pick.label} (${formatThirds(d)}스톱)`;
      notes.push(['info', '1초보다 길면 셔터를 B(벌브)에 놓고 아래 타이머로 시간을 재세요. 카메라에 같은 눈금이 있으면 그대로 써도 됩니다.']);
    } else {
      mainText = pick.label;
      subText = `계산값 ${formatTime(r.time)}`;
      if (Math.abs(r.deviation) >= 1 / 6) subText += ` · 눈금 차이 ${formatThirds(r.deviation)}스톱`;
    }
    if (r.range === 'bright') {
      notes.push(['bad', `너무 밝습니다. ${shutters()[0].label}보다 빠른 셔터가 필요해요. 조리개를 조이거나, ND 필터를 추가하거나, 감도가 낮은 필름을 쓰세요.`]);
    } else if (r.range === 'long') {
      notes.push(['warn', '1시간이 넘는 아주 긴 노출입니다. 조리개를 열거나 감도를 높이는 것도 고려하세요.']);
    }
    if (!r.bulb && r.tv > 10 + 1e-6 && !r.range) {
      notes.push(['warn', '옛 기계식 카메라는 최고 셔터속도가 1/500~1/1000인 경우가 많습니다. 카메라 눈금을 확인하세요.']);
    }
  } else if (state.mode === 'aperture') {
    label = '조리개';
    mainText = nearest(apertures(), r.av).label;
    subText = `계산값 ${formatF(r.exactAv)}`;
    if (Math.abs(r.deviation) >= 1 / 6) subText += ` · 눈금 차이 ${formatThirds(r.deviation)}스톱`;
    if (r.range === 'dark') {
      notes.push(['bad', `너무 어둡습니다. ${apertures()[0].label}보다 더 열어야 해요. 셔터를 느리게 하거나 감도를 높이거나 ND를 빼세요.`]);
    } else if (r.range === 'bright') {
      notes.push(['bad', `너무 밝습니다. ${apertures().at(-1).label}보다 더 조여야 해요. 셔터를 빠르게 하거나 ND 필터를 추가하세요.`]);
    }
  } else {
    label = '노출 판정';
    const d = r.deviation;
    mainText = Math.abs(d) < 1 / 6 ? '적정' : `${formatThirds(d)}스톱`;
    subText = `적정값 참고: 셔터 ${r.suggestShutter.label} 또는 조리개 ${r.suggestAperture.label}`;
    if (d >= 1 / 6 && d < 2.5) notes.push(['info', '네거티브 필름은 1~2스톱 과다까지는 대체로 괜찮습니다. 슬라이드 필름은 맞추는 것이 좋습니다.']);
  }

  reciprocityNotes(r, film, notes);

  const timeForTimer = state.mode === 'shutter' ? r.time : tvToSec(state.tv);
  if (timeForTimer > 1 + 1e-9) {
    if (film.recip.type === 'none') notes.push(['info', '필름을 고르면 장노출 보정(상반칙불궤)도 함께 계산합니다.']);
    if (state.mode !== 'shutter') notes.push(['info', '1초보다 길면 셔터를 B(벌브)에 놓고 아래 타이머로 시간을 재세요.']);
  }

  $('resultLabel').textContent = label;
  main.textContent = mainText;
  main.classList.toggle('long', mainText.length > 6);
  sub.textContent = subText;

  const d = Math.max(-3, Math.min(3, r.deviation));
  $('meterNeedle').style.left = `${50 + (d / 3) * 50}%`;
  $('meterText').textContent = meterText(r.deviation);

  // 참고 사항 + 타이머
  const list = $('notes');
  list.innerHTML = '';
  for (const [kind, text] of notes) {
    const li = document.createElement('li');
    li.className = kind;
    li.textContent = text;
    list.appendChild(li);
  }
  const timerBtn = $('timerBtn');
  timerSeconds = timeForTimer;
  timerBtn.hidden = timeForTimer <= 1 + 1e-9;
  timerBtn.textContent = `장노출 타이머 열기 · ${formatTime(timeForTimer)}`;
  $('notesCard').hidden = notes.length === 0 && timerBtn.hidden;

  applyTheme();
}

// ── 화면 모드 ───────────────────────────────────────────
function applyTheme() {
  const t = THEMES[state.theme] || THEMES.dark;
  document.body.dataset.theme = state.theme;
  document.querySelector('meta[name="theme-color"]').content = t.color;
  document.querySelector('meta[name="color-scheme"]').content = t.scheme;
  $('themeBtn').textContent = `화면: ${t.name}`;
  markSeg('themeSeg', state.theme);
}
$('themeBtn').addEventListener('click', () => {
  const keys = Object.keys(THEMES);
  state.theme = keys[(keys.indexOf(state.theme) + 1) % keys.length];
  onInput('theme');
});

// ── 설정 창 ─────────────────────────────────────────────
function markSeg(id, value) {
  document.querySelectorAll(`#${id} button`).forEach((b) => b.classList.toggle('on', b.dataset.value === value));
}
function bindSeg(id, key) {
  document.querySelectorAll(`#${id} button`).forEach((b) =>
    b.addEventListener('click', () => {
      state[key] = b.dataset.value;
      markSeg(id, state[key]);
      onInput(key);
    }),
  );
  markSeg(id, state[key]);
}
bindSeg('apScaleSeg', 'apScale');
bindSeg('shScaleSeg', 'shScale');
bindSeg('themeSeg', 'theme');

const settings = $('settings');
$('settingsBtn').addEventListener('click', () => settings.showModal());
$('settingsClose').addEventListener('click', () => settings.close());
settings.addEventListener('click', (e) => { if (e.target === settings) settings.close(); });
$('resetBtn').addEventListener('click', () => {
  if (!confirm('모든 설정을 처음 상태로 되돌릴까요?')) return;
  state = { ...DEFAULTS };
  ['apScaleSeg', 'shScaleSeg', 'themeSeg'].forEach((id, i) => markSeg(id, [state.apScale, state.shScale, state.theme][i]));
  onInput('reset');
  settings.close();
});
$('versionText').textContent = `버전 ${VERSION}`;

render();

// ── 오프라인 설치 (서비스 워커) ──────────────────────────
if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  navigator.serviceWorker.register('./sw.js').catch(() => {});
}
