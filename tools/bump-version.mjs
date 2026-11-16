// 버전 올리기: npm run bump -- 1.0.5
// app.js와 sw.js의 VERSION을 함께 바꾼다 (둘이 다르면 휴대폰에 새 버전이 제대로 적용되지 않는다).
import { readFileSync, writeFileSync } from 'node:fs';

const version = process.argv[2];
if (!/^\d+\.\d+\.\d+$/.test(version ?? '')) {
  console.error('사용법: npm run bump -- 1.0.5');
  process.exit(1);
}

for (const file of ['app.js', 'sw.js']) {
  const path = new URL(`../${file}`, import.meta.url);
  const text = readFileSync(path, 'utf8');
  if (!/^const VERSION = '[^']*';/m.test(text)) {
    console.error(`${file}: VERSION 줄을 찾지 못했습니다`);
    process.exit(1);
  }
  writeFileSync(path, text.replace(/^const VERSION = '[^']*';/m, `const VERSION = '${version}';`));
}
console.log(`버전 ${version}로 변경: app.js, sw.js`);
