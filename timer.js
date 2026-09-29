// 장노출(벌브) 타이머
// - 남은 시간을 크게 표시, 끝나기 3초 전부터 알림음, 끝나면 긴 알림음 + 화면 깜빡임
// - 도는 동안 화면이 꺼지지 않게 요청 (지원하는 기기만)
// - 시간은 시작 시각 기준으로 계산하므로, 잠시 다른 앱을 봐도 오차가 쌓이지 않는다
import { formatTime } from './exposure.js';

const $ = (id) => document.getElementById(id);

let audio = null;
function initAudio() {
  // 아이폰 무음 스위치가 켜져 있어도 소리가 나도록 (사파리 16.4 이상)
  try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch { /* 미지원 */ }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  if (!audio) audio = new AC();
  if (audio.state === 'suspended') audio.resume();
}

function beep(freq, dur, delay = 0) {
  if (!audio) return;
  const t0 = audio.currentTime + delay;
  const osc = audio.createOscillator();
  const gain = audio.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(0.4, t0 + 0.01);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(gain).connect(audio.destination);
  osc.start(t0);
  osc.stop(t0 + dur + 0.05);
}

// 1:05, 0:20 처럼 표시
function clock(sec) {
  const s = Math.max(0, Math.ceil(sec - 1e-9));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const r = String(s % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${r}` : `${m}:${r}`;
}

export function setupTimer() {
  const view = $('timerView');
  const display = $('tDisplay');
  const bar = $('tBar');
  const status = $('tStatus');
  const startBtn = $('tStart');
  const targetText = $('tTarget');
  const minus = $('tMinus');
  const plus = $('tPlus');

  let target = 10;
  let startAt = 0;
  let running = false;
  let finished = false;
  let loop = null;
  let beeped = new Set();
  let wakeLock = null;

  async function keepScreenOn() {
    try { wakeLock = await navigator.wakeLock?.request('screen'); } catch { wakeLock = null; }
  }
  function releaseScreen() {
    wakeLock?.release().catch(() => {});
    wakeLock = null;
  }

  const stepFor = (t) => (t < 60 ? 1 : t < 600 ? 10 : 60);

  function draw() {
    targetText.textContent = formatTime(target);
    minus.disabled = plus.disabled = running;
    if (!running) {
      display.textContent = clock(target);
      bar.style.width = '0%';
      view.classList.remove('over');
      return;
    }
    const elapsed = (Date.now() - startAt) / 1000;
    const remain = target - elapsed;
    bar.style.width = `${Math.min(100, (elapsed / target) * 100)}%`;
    if (remain > 0) {
      display.textContent = clock(remain);
    } else {
      display.textContent = `+${clock(-remain)}`;
      view.classList.add('over');
    }
  }

  function tick() {
    const remain = target - (Date.now() - startAt) / 1000;
    if (target >= 5) {
      for (const mark of [3, 2, 1]) {
        if (remain <= mark && !beeped.has(mark)) {
          beeped.add(mark);
          if (remain > mark - 0.5) beep(880, 0.12);
        }
      }
    }
    if (remain <= 0 && !finished) {
      finished = true;
      beep(1320, 0.5);
      beep(1320, 0.5, 0.6);
      navigator.vibrate?.([300, 150, 300]);
      view.classList.remove('flash');
      void view.offsetWidth; // 애니메이션 다시 시작
      view.classList.add('flash');
      status.textContent = '시간 완료 — 셔터를 닫으세요';
      startBtn.textContent = '다시 설정';
    }
    draw();
  }

  function start() {
    initAudio();
    startAt = Date.now();
    running = true;
    finished = false;
    beeped = new Set();
    status.textContent = '노출 중… 화면을 켠 채로 두세요';
    startBtn.textContent = '정지';
    keepScreenOn();
    loop = setInterval(tick, 100);
    tick();
  }

  function stop(message = '셔터를 여는 순간 시작을 누르세요') {
    clearInterval(loop);
    loop = null;
    running = false;
    finished = false;
    view.classList.remove('flash', 'over');
    status.textContent = message;
    startBtn.textContent = '시작';
    releaseScreen();
    draw();
  }

  startBtn.addEventListener('click', () => (running ? stop() : start()));
  minus.addEventListener('click', () => {
    target = Math.max(1, target - stepFor(target - 1));
    draw();
  });
  plus.addEventListener('click', () => {
    target += stepFor(target);
    draw();
  });
  $('timerClose').addEventListener('click', () => {
    if (running && !finished && !confirm('타이머를 멈추고 닫을까요?')) return;
    stop();
    view.hidden = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible' && running) {
      keepScreenOn();
      tick();
    }
  });

  return {
    open(seconds) {
      target = Math.max(1, Math.round(seconds));
      stop();
      view.hidden = false;
    },
  };
}
