// 배포 전 점검: 버전 번호와 오프라인 저장 목록. 실행: npm test
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';

const root = new URL('../', import.meta.url);
const read = (file) => readFileSync(new URL(file, root), 'utf8');
const versionOf = (text) => text.match(/^const VERSION = '([^']+)';/m)?.[1];

test('app.js와 sw.js의 버전이 같음', () => {
  const app = versionOf(read('app.js'));
  const sw = versionOf(read('sw.js'));
  assert.ok(app, 'app.js에 VERSION이 없음');
  assert.equal(app, sw, 'npm run bump -- x.y.z 로 함께 올리세요');
});

test('앱 파일이 모두 오프라인 저장 목록(sw.js ASSETS)에 있음', () => {
  const sw = read('sw.js');
  const appFiles = readdirSync(root)
    .filter((f) => /\.(js|css|html|json)$/.test(f))
    .filter((f) => !['sw.js', 'package.json', 'package-lock.json'].includes(f));
  const icons = readdirSync(new URL('icons/', root))
    .filter((f) => f.endsWith('.png'))
    .map((f) => `icons/${f}`);
  for (const file of [...appFiles, ...icons]) {
    assert.ok(sw.includes(`'./${file}'`), `${file}가 sw.js ASSETS에 없음 — 오프라인에서 동작하지 않습니다`);
  }
});
