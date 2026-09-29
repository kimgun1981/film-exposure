// 계산 공식 검증. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  solve, nearest, reciprocityCorrect, reciprocityEffective,
  formatThirds, formatTime, formatF,
} from '../exposure.js';
import { APERTURE_SCALES, SHUTTER_SCALES, ISO_LIST, ND_LIST, FILMS, findFilm } from '../data.js';

const close = (a, b, tol = 0.01) => assert.ok(Math.abs(a - b) <= tol, `${a} ≠ ${b}`);
const label = (list, v) => nearest(list, v).label;
const base = {
  mode: 'shutter', ev: 15, iso: 0, nd: 0, av: 8, tv: 7,
  recip: { type: 'none' },
  apertures: APERTURE_SCALES.third,
  shutters: SHUTTER_SCALES.full,
};
const iso = (n) => Math.round(Math.log2(n / 100) * 3) / 3;

test('기준값 목록 개수', () => {
  assert.equal(APERTURE_SCALES.full.length, 13);
  assert.equal(APERTURE_SCALES.half.length, 25);
  assert.equal(APERTURE_SCALES.third.length, 37);
  assert.equal(SHUTTER_SCALES.third.length, 55 + 7);
  assert.equal(SHUTTER_SCALES.full.length, 19 + 7);
  assert.equal(ISO_LIST.length, 31);
  assert.equal(ND_LIST.length, 21);
  assert.equal(label(ISO_LIST, iso(400)), '400');
  assert.equal(label(ISO_LIST, iso(125)), '125');
  assert.equal(label(ND_LIST, 10), 'ND1000 (3.0) · 10스톱');
});

test('눈금 이름이 스톱 값과 맞는지', () => {
  assert.equal(label(APERTURE_SCALES.third, 8), 'f/16');
  assert.equal(label(APERTURE_SCALES.half, 5), 'f/5.6');
  assert.equal(label(APERTURE_SCALES.full, 7), 'f/11');
  assert.equal(label(SHUTTER_SCALES.full, 7), '1/125');
  assert.equal(label(SHUTTER_SCALES.full, 0), '1초');
  assert.equal(label(SHUTTER_SCALES.third, 10), '1/1000');
  assert.equal(label(SHUTTER_SCALES.third, -5), '30초');
});

test('써니16: 맑음 EV15, ISO100, f/16 → 1/125', () => {
  const r = solve(base);
  close(r.time, 1 / 128, 1e-6);
  assert.equal(label(SHUTTER_SCALES.full, r.tv), '1/125');
  assert.equal(r.bulb, false);
});

test('ISO 400이면 1/500', () => {
  const r = solve({ ...base, iso: iso(400) });
  close(r.time, 1 / 512, 1e-6);
  assert.equal(label(SHUTTER_SCALES.full, r.tv), '1/500');
});

test('ND8이면 1/15', () => {
  const r = solve({ ...base, nd: 3 });
  close(r.time, 1 / 16, 1e-6);
  assert.equal(label(SHUTTER_SCALES.full, r.tv), '1/15');
});

test('흐림 EV13, ISO400, f/8, ND1000 → 2초 (벌브)', () => {
  const r = solve({ ...base, ev: 13, iso: iso(400), nd: 10, av: 6 });
  close(r.time, 2, 1e-6);
  assert.equal(r.bulb, true);
  assert.equal(r.deviation, 0);
});

test('조리개 자동: EV15, ISO100, 1/125 → f/16', () => {
  const r = solve({ ...base, mode: 'aperture', tv: 7 });
  close(r.exactAv, 8, 1e-9);
  assert.equal(label(APERTURE_SCALES.third, r.av), 'f/16');
});

test('직접 확인: f/16에 1/60이면 1스톱 과다, 1/250이면 1스톱 부족', () => {
  close(solve({ ...base, mode: 'manual', tv: 6 }).deviation, 1, 1e-9);
  close(solve({ ...base, mode: 'manual', tv: 8 }).deviation, -1, 1e-9);
  const r = solve({ ...base, mode: 'manual', tv: 6 });
  assert.equal(r.suggestShutter.label, '1/125');
  assert.equal(label(APERTURE_SCALES.third, r.suggestAperture.value), 'f/22');
});

test('범위 밖 경고', () => {
  // 눈밭 EV16 + ISO3200 + f/1.4 → 1/8000보다 빨라야 함
  assert.equal(solve({ ...base, ev: 16, iso: 5, av: 1 }).range, 'bright');
  // 보름달빛 EV−3 + ISO100 + 1/1000 → f/1보다 더 열어야 함
  assert.equal(solve({ ...base, mode: 'aperture', ev: -3, tv: 10 }).range, 'dark');
});

test('일포드 HP5: 측정 10초 → 20.4초 (공식 예시)', () => {
  const hp5 = findFilm('hp5').recip;
  close(reciprocityCorrect(hp5, 10).time, 20.4, 0.05);
  close(reciprocityCorrect(hp5, 4).time, 6.15, 0.01);
  assert.equal(reciprocityCorrect(hp5, 1).applied, false);
  assert.equal(reciprocityCorrect(hp5, 0.5).applied, false);
  close(reciprocityEffective(hp5, 20.4), 10, 0.02);
});

test('코닥 Tri-X 표: 1→2초, 10→50초, 100→1200초', () => {
  const trix = findFilm('trix').recip;
  close(reciprocityCorrect(trix, 1).time, 2, 1e-6);
  close(reciprocityCorrect(trix, 10).time, 50, 1e-6);
  close(reciprocityCorrect(trix, 100).time, 1200, 1e-6);
  assert.equal(reciprocityCorrect(trix, 0.05).applied, false);
  assert.equal(reciprocityCorrect(trix, 200).outOfRange, true);
  close(reciprocityEffective(trix, 50), 10, 0.01);
});

test('코닥 T-MAX 400: 1초 보정 없음, 100→300초', () => {
  const tmax = findFilm('tmax400').recip;
  assert.equal(reciprocityCorrect(tmax, 1).applied, false);
  close(reciprocityCorrect(tmax, 100).time, 300, 1e-6);
});

test('후지 Acros II: 120초까지 보정 없음, 그 뒤 +½스톱', () => {
  const acros = findFilm('acros2').recip;
  assert.equal(reciprocityCorrect(acros, 120).applied, false);
  close(reciprocityCorrect(acros, 200).time, 200 * Math.SQRT2, 1e-6);
  assert.equal(reciprocityCorrect(acros, 2000).outOfRange, true);
});

test('컬러 네거티브: 1초 넘으면 "자료 없음" 표시만', () => {
  const portra = findFilm('portra400').recip;
  const r = reciprocityCorrect(portra, 10);
  assert.equal(r.time, 10);
  assert.equal(r.noData, true);
  assert.equal(reciprocityCorrect(portra, 1).noData, false);
});

test('셔터 자동 + 상반칙불궤: HP5, 측정 8초 → 약 15.2초 (8^1.31)', () => {
  // EV7 + ISO400(+2) − ND8(3) = 6, f/22(Av 9) → 측정 8초
  const r = solve({ ...base, ev: 7, iso: iso(400), nd: 3, av: 9, recip: findFilm('hp5').recip });
  close(r.metered, 8, 1e-6);
  close(r.time, 8 ** 1.31, 1e-6);
  assert.equal(r.rc.applied, true);
});

test('조리개 자동 + 상반칙불궤: 실제 20.4초 노출은 HP5에 10초 효과', () => {
  const r = solve({ ...base, mode: 'aperture', ev: 4, iso: 0, tv: -Math.log2(20.4), recip: findFilm('hp5').recip });
  close(r.effectiveTime, 10, 0.02);
  // EV4 → Av + Tv(10초 = −3.32) = 4 → Av ≈ 7.32 (f/12.7)
  close(r.exactAv, 4 + Math.log2(10), 0.01);
});

test('필름 목록: id 중복 없음, 박스 감도는 ISO 목록에 있음', () => {
  const all = FILMS.flatMap((g) => g.items);
  assert.equal(new Set(all.map((f) => f.id)).size, all.length);
  for (const f of all) {
    if (f.iso) assert.equal(label(ISO_LIST, iso(f.iso)), String(f.iso), f.label);
  }
});

test('표시 글자', () => {
  assert.equal(formatThirds(0.02), '0');
  assert.equal(formatThirds(1.34), '+1⅓');
  assert.equal(formatThirds(-0.66), '−⅔');
  assert.equal(formatThirds(15, false), '15');
  assert.equal(formatThirds(-2.67, false), '−2⅔');
  assert.equal(formatTime(1 / 256), '1/256초');
  assert.equal(formatTime(0.6), '0.6초');
  assert.equal(formatTime(3.2), '3.2초');
  assert.equal(formatTime(20.4), '20초');
  assert.equal(formatTime(59.7), '1분');
  assert.equal(formatTime(95), '1분 35초');
  assert.equal(formatTime(3700), '1시간 2분');
  assert.equal(formatF(8), 'f/16');
  assert.equal(formatF(6), 'f/8');
  assert.equal(formatF(5.9), 'f/7.7');
});
