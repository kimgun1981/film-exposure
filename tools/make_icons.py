# 앱 아이콘(조리개 모양) 생성. 실행: python3 tools/make_icons.py
import math
from pathlib import Path
from PIL import Image, ImageDraw

BG = (14, 14, 15)
AMBER = (245, 179, 1)
OUT = Path(__file__).resolve().parent.parent / "icons"


def draw_icon(size, ring_ratio):
    s = size * 4  # 크게 그린 뒤 줄여서 테두리를 매끄럽게
    img = Image.new("RGB", (s, s), BG)
    d = ImageDraw.Draw(img)
    c = s / 2
    R = s * ring_ratio
    r = R * 0.38
    d.ellipse([c - R, c - R, c + R, c + R], fill=AMBER)

    verts = []
    for i in range(6):
        a = math.radians(-90 + 60 * i)
        verts.append((r * math.cos(a), r * math.sin(a)))
    d.polygon([(c + x, c + y) for x, y in verts], fill=BG)

    # 조리개 날 경계선: 육각형 변을 원 끝까지 늘린다
    w = max(2, int(s * 0.018))
    for i in range(6):
        x1, y1 = verts[i]
        x2, y2 = verts[(i + 1) % 6]
        dx, dy = x2 - x1, y2 - y1
        n = math.hypot(dx, dy)
        dx, dy = dx / n, dy / n
        b = x2 * dx + y2 * dy
        t = -b + math.sqrt(b * b - (x2 * x2 + y2 * y2 - R * R))
        d.line([(c + x2, c + y2), (c + x2 + dx * t, c + y2 + dy * t)], fill=BG, width=w)
    return img.resize((size, size), Image.LANCZOS)


OUT.mkdir(exist_ok=True)
draw_icon(180, 0.36).save(OUT / "icon-180.png")
draw_icon(192, 0.36).save(OUT / "icon-192.png")
draw_icon(512, 0.36).save(OUT / "icon-512.png")
draw_icon(512, 0.30).save(OUT / "icon-maskable-512.png")  # 안드로이드가 둥글게 잘라도 남도록 작게
print("아이콘 생성 완료:", sorted(p.name for p in OUT.glob("*.png")))
