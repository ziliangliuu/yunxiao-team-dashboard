#!/usr/bin/env python3
"""生成「工作统计」扩展图标（青绿柱状图 + 上升趋势箭头）。

纯 Pillow，无外部依赖。每个目标尺寸独立超采样渲染（避免缩小丢细节），
小尺寸自动加粗描边并精简元素，保证 16px 下依然清晰。

用法：python3 tools/generate-icon.py
输出：extension/icons/icon{16,32,48,128}.png + /tmp/icon_verify.png（放大核对）
"""
import os
from PIL import Image, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "extension", "icons")
os.makedirs(OUT, exist_ok=True)

SS = 8  # 超采样倍数
C_TOP = (38, 211, 186)     # 青绿
C_BOT = (14, 120, 150)     # 深青蓝
SIZES = [16, 32, 48, 128]


def lerp(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(len(a)))


def dgradient(size, c1, c2):
    img = Image.new("RGB", (size, size))
    px = img.load()
    m = 2 * (size - 1)
    for y in range(size):
        for x in range(size):
            px[x, y] = lerp(c1, c2, (x + y) / m)
    return img


def rounded_mask(size, radius):
    m = Image.new("L", (size, size), 0)
    ImageDraw.Draw(m).rounded_rectangle([0, 0, size - 1, size - 1], radius=radius, fill=255)
    return m


def render(size):
    """以 size*SS 画布渲染图标，返回缩放回 size 的 RGBA。"""
    S = size * SS
    img = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    bg = dgradient(S, C_TOP, C_BOT)
    img.paste(bg, (0, 0), rounded_mask(S, int(S * 0.235)))
    d = ImageDraw.Draw(img)

    small = size <= 32
    n = 3 if small else 4
    pad = S * (0.22 if small else 0.19)
    base_y = S * 0.80
    gap = S * (0.07 if small else 0.05)
    bw = (S - 2 * pad - (n - 1) * gap) / n
    heights = [0.18, 0.30, 0.42] if small else [0.16, 0.27, 0.40, 0.52]

    centers = []
    for i, h in enumerate(heights):
        x0 = pad + i * (bw + gap)
        top = base_y - S * h
        d.rounded_rectangle([x0, top, x0 + bw, base_y], radius=bw * 0.3,
                            fill=(255, 255, 255, 210))
        centers.append((x0 + bw / 2, top))

    # 上升趋势线：略高于各柱顶
    lift = S * (0.16 if small else 0.18)
    pts = [(cx, cy - lift) for (cx, cy) in centers]
    # 末点再往右上抬一点，形成明确上扬
    pts[-1] = (pts[-1][0] + bw * 0.15, pts[-1][1] - S * 0.06)
    lw = max(int(S * (0.085 if small else 0.05)), 2)
    d.line(pts, fill=(255, 255, 255, 255), width=lw, joint="curve")

    # 箭头头部
    ax, ay = pts[-1]
    s = S * (0.13 if small else 0.10)
    d.polygon([
        (ax + s, ay),
        (ax - s * 0.25, ay - s * 0.55),
        (ax - s * 0.05, ay + s * 0.7),
    ], fill=(255, 255, 255, 255))

    if not small:  # 大尺寸加节点圆点
        for (cx, cy) in pts[:-1]:
            r = S * 0.022
            d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=(255, 255, 255, 255))

    return img.resize((size, size), Image.LANCZOS)


renders = {}
for sz in SIZES:
    im = render(sz)
    im.save(os.path.join(OUT, f"icon{sz}.png"))
    renders[sz] = im
    print("wrote", os.path.join(OUT, f"icon{sz}.png"))

# 放大核对图：每个尺寸放大到 128 显示（最近邻，看真实像素），并排
zoom = 160
sheet = Image.new("RGB", (zoom * len(SIZES) + 20, zoom + 40), (235, 237, 242))
for i, sz in enumerate(SIZES):
    big = renders[sz].resize((zoom, zoom), Image.NEAREST)
    x = i * zoom + 10
    sheet.paste((28, 30, 38), (x + zoom // 2, 20, x + zoom - 4, 20 + zoom))
    sheet.paste(big, (x, 20), big)
sheet.save("/tmp/icon_verify.png")
print("verify ->", "/tmp/icon_verify.png")
