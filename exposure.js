// 노출 계산 공식 모음. 화면(app.js)과 분리해 두어 따로 검증할 수 있다.
//
// 기본 관계 (모두 스톱 단위):
//   조리개(Av) + 셔터(Tv) = 장면 밝기(EV) + 감도(ISO) − ND
// 이 등식이 맞으면 "적정 노출", 왼쪽이 작으면 빛이 많이 들어가 "과다".

export const tvToSec = (tv) => 2 ** -tv;
export const secToTv = (t) => -Math.log2(t);
export const avToF = (av) => 2 ** (av / 2);

// 목록에서 가장 가까운 값. 똑같이 가까우면 빛이 더 들어가는 쪽(값이 작은 쪽)을 고른다.
export function nearest(list, value) {
  let best = list[0];
  for (const item of list) {
    const d = Math.abs(item.value - value);
    const bd = Math.abs(best.value - value);
    if (d < bd - 1e-9 || (Math.abs(d - bd) <= 1e-9 && item.value < best.value)) best = item;
  }
  return best;
}

// ── 장노출 보정 (상반칙불궤) ─────────────────────────────
// 필름은 노출이 길어지면 계산보다 덜 찍히므로 시간을 늘려야 한다.

// 후지 방식: 실제 노출시간 t에서 조리개를 몇 스톱 더 열어야 하는지 (표 사이값은 로그 눈금으로)
function lossAt(points, t) {
  if (t <= points[0][0]) return 0;
  let i = points.findIndex(([x]) => x >= t) - 1;
  if (i < 0) i = points.length - 2; // 표보다 길면 마지막 구간을 늘려서 추정
  const [x1, s1] = points[i];
  const [x2, s2] = points[i + 1];
  return s1 + ((s2 - s1) * Math.log(t / x1)) / Math.log(x2 / x1);
}

// 측정시간 tm → 실제로 열어 둘 시간
export function reciprocityCorrect(recip, tm) {
  const none = { time: tm, stops: 0, applied: false, outOfRange: false, noData: false };
  if (!recip) return none;

  let time = tm;
  let outOfRange = false;

  if (recip.type === 'power') {
    if (tm > 1) time = tm ** recip.p;
  } else if (recip.type === 'table') {
    const pts = recip.points;
    if (tm > pts[0][0]) {
      let i = pts.findIndex(([x]) => x >= tm) - 1;
      if (i < 0) {
        i = pts.length - 2; // 표의 마지막 값보다 길면 마지막 구간을 늘려서 추정
        outOfRange = true;
      }
      const [x1, y1] = pts[i];
      const [x2, y2] = pts[i + 1];
      const f = Math.log(tm / x1) / Math.log(x2 / x1);
      time = Math.exp(Math.log(y1) + f * Math.log(y2 / y1));
    }
  } else if (recip.type === 'step') {
    if (tm > recip.from) time = tm * 2 ** recip.stops;
    outOfRange = tm > recip.max;
  } else if (recip.type === 'loss') {
    // 실제로 t초 열면 필름에는 t ÷ 2^손실 만큼 효과. 그 효과가 측정시간과 같아지는 t를 찾는다
    let lo = Math.log(tm);
    let hi = Math.log(tm) + 15;
    for (let i = 0; i < 80; i++) {
      const mid = (lo + hi) / 2;
      const t = Math.exp(mid);
      if (t / 2 ** lossAt(recip.points, t) < tm) lo = mid;
      else hi = mid;
    }
    time = Math.exp(hi);
    outOfRange = time > recip.limit * 1.001;
  } else if (recip.type === 'nodata') {
    return { ...none, noData: tm > 1 };
  }

  time = Math.max(time, tm);
  const stops = Math.log2(time / tm);
  return { time, stops, applied: stops > 0.01, outOfRange, noData: false };
}

// 실제로 열어 둔 시간 t 동안 필름이 받아들인 "효과상의 시간" (보정의 역계산)
export function reciprocityEffective(recip, t) {
  if (!recip || recip.type === 'none' || recip.type === 'nodata') return t;
  if (recip.type === 'loss') return t / 2 ** lossAt(recip.points, t);
  let lo = Math.log(1e-6);
  let hi = Math.log(t);
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (reciprocityCorrect(recip, Math.exp(mid)).time <= t) lo = mid;
    else hi = mid;
  }
  return Math.exp(lo);
}

// 설정값(av, tv)이 적정 노출에서 몇 스톱 벗어났는지. + 는 과다(밝게), − 는 부족(어둡게)
function deviation(target, av, tv, recip) {
  const tvEff = secToTv(reciprocityEffective(recip, tvToSec(tv)));
  return target - av - tvEff;
}

// ── 메인 계산 ───────────────────────────────────────────
// mode: 'shutter'(셔터 자동) | 'aperture'(조리개 자동) | 'manual'(직접 확인)
export function solve({ mode, ev, iso, nd, av, tv, recip, apertures, shutters }) {
  const target = ev + iso - nd;
  const r = { mode, target, av, tv, range: null };

  const tvMax = Math.max(...shutters.map((s) => s.value));
  const tvMin = Math.min(...shutters.map((s) => s.value));
  const avMin = Math.min(...apertures.map((a) => a.value));
  const avMax = Math.max(...apertures.map((a) => a.value));

  if (mode === 'shutter') {
    const metered = 2 ** (av - target);
    const rc = reciprocityCorrect(recip, metered);
    const tvExact = secToTv(rc.time);
    const pick = nearest(shutters, tvExact);

    r.tv = pick.value;
    r.metered = metered;
    r.time = rc.time;
    r.rc = rc;
    r.bulb = rc.time > 1 + 1e-9; // 1초보다 길면 B(벌브) + 타이머로 정확히 잰다
    r.pickDeviation = deviation(target, av, pick.value, recip);
    r.deviation = r.bulb ? 0 : r.pickDeviation;
    r.exposureTime = r.bulb ? rc.time : tvToSec(pick.value);

    if (tvExact > tvMax + 1 / 6) r.range = 'bright';
    else if (tvExact < tvMin - 1 / 6) r.range = 'long';
    return r;
  }

  const t = tvToSec(tv);
  const te = reciprocityEffective(recip, t);
  const tvEff = secToTv(te);
  r.effectiveTime = te;
  r.rc = reciprocityCorrect(recip, te);
  r.exposureTime = t;

  if (mode === 'aperture') {
    const avExact = target - tvEff;
    const pick = nearest(apertures, avExact);
    r.av = pick.value;
    r.exactAv = avExact;
    r.deviation = target - pick.value - tvEff;
    if (avExact < avMin - 1 / 6) r.range = 'dark';
    else if (avExact > avMax + 1 / 6) r.range = 'bright';
    return r;
  }

  // 직접 확인: 현재 조합의 과다/부족 + 참고용 적정값
  r.deviation = target - av - tvEff;
  const metered = 2 ** (av - target);
  const rc = reciprocityCorrect(recip, metered);
  r.suggestTime = rc.time;
  r.suggestShutter = nearest(shutters, secToTv(rc.time));
  r.suggestAperture = nearest(apertures, target - tvEff);
  return r;
}

// ── 표시용 글자 만들기 ───────────────────────────────────
// 1/3 단위로 반올림해서 "+1⅓", "−⅔", "0" 처럼 표시
export function formatThirds(x, signed = true) {
  const n = Math.round(x * 3);
  if (n === 0) return '0';
  const a = Math.abs(n);
  const whole = Math.floor(a / 3);
  const frac = ['', '⅓', '⅔'][a % 3];
  const sign = n < 0 ? '−' : signed ? '+' : '';
  return sign + (whole ? String(whole) : '') + frac;
}

export function formatTime(t) {
  if (t < 0.5) return `1/${Math.round(1 / t)}초`;
  if (t < 10) return `${Math.round(t * 10) / 10}초`;
  const s = Math.round(t);
  if (s < 60) return `${s}초`;
  if (s < 3600) {
    const m = Math.floor(s / 60);
    const r = s % 60;
    return r ? `${m}분 ${r}초` : `${m}분`;
  }
  const totalMin = Math.round(s / 60);
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return m ? `${h}시간 ${m}분` : `${h}시간`;
}

export function formatF(av) {
  const n = avToF(av);
  return n < 10 ? `f/${Math.round(n * 10) / 10}` : `f/${Math.round(n)}`;
}
