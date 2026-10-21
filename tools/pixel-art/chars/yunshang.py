"""云裳 · 修仙：白衣女仙，双手拢袖于身前，披帛随风轻摆。"""
import math

from kit import FH, FW, Canvas, blinking, breath, ellipse, face, features, line, mirror, phase, poly, rect, shift, sympoly, thick

META = dict(id='yunshang', name='云裳', group='修仙', face=[14, 1, 20], bg='#dfe8e4')

C = dict(
    hair='#2c2838', hairL='#18151f', sheen='#4a4563', sheen2='#5d5878',
    skin='#f8e6db', skinL='#d6a796', skinE='#c58f7f', skinS='#efd0c2', blush='#f4c4bf',
    lash='#2b2030', iris='#4c3346', irisL='#9a7c92', white='#fdf8f4', brow='#6a5660',
    lip='#c8505c', lip2='#d9737c',
    robe='#f3f5f2', robeL='#8f9f9b', robeS='#dfe6e3', inner='#fcfcf9',
    trim='#79a79f', trimL='#4f7a73', trimS='#a5c7c0',
    shawl='#ddd6ea', shawlL='#a49bbd',
    gold='#d9b66d', goldD='#a9843f', jade='#6fb59a', bead='#c44a55',
)
P = dict(C, lip=C['lip2'])


def frame(t):
    ph = phase(t)
    b = breath(t)
    blink = blinking(t)
    c = Canvas(FW, FH)

    def sway(i, amp, lag=0.55, off=0.0):
        return amp * math.sin(ph - i * lag + off)

    # ---- 披帛（身后部分）：从肩后绕出，沿两侧飘落 ----
    def ribbon(off):
        base = [(17.5, 31), (14.6, 36), (11.8, 44), (10, 54), (9.4, 64), (9.8, 73), (10.8, 81), (10.2, 88)]
        pts = []
        for i, (x, y) in enumerate(base):
            amp = 0 if i == 0 else min(1.6, 0.35 * i)
            pts.append((x + sway(i, amp, off=off), y))
        return pts

    rl = thick(ribbon(0.0), 1.2)
    rr = mirror(thick(ribbon(1.9), 1.2))
    c.layer(rl, C['shawl'], C['shawlL'])
    c.layer(rr, C['shawl'], C['shawlL'])

    # ---- 后发 ----
    back = sympoly(shift([(24, 4.5), (20, 5.4), (17.8, 8), (17, 12), (16.9, 18), (17.3, 24), (18.5, 28)], b))
    c.layer(back, C['hair'], C['hairL'])

    # ---- 裙摆 ----
    skirt = sympoly([(24, 38.5), (19.6, 39), (18.4, 46), (17.2, 58), (16, 70), (14.8, 82), (13.8, 92.5)])
    c.layer(skirt, C['robe'], C['robeL'])
    hem = {(x, y) for (x, y) in skirt if y >= 89}
    c.layer(hem, C['trim'], C['trimL'])
    for x0, x1 in ((20, 17), (28, 31)):
        c.dots(line(x0, 48, x1, 88) & skirt, C['robeS'])
    c.dots(line(24, 52, 24, 88) & skirt, C['robeS'])
    # 鞋尖
    c.dots([(21, 93), (22, 93), (25, 93), (26, 93)], C['trimL'])

    # ---- 上身 ----
    neck = rect(22, 18, 25, 25)
    c.layer(neck, C['skin'], C['skinL'])
    torso = sympoly([(24, 23.2), (21.5, 23.4), (19.2, 24.3), (17.4, 26), (16.9, 29.5), (17.6, 34), (18.6, 39.5)])
    c.layer(torso, C['robe'], C['robeL'])
    v = poly([(21.6, 23.6), (26.4, 23.6), (24, 30)])
    c.layer(v, C['inner'], None)
    over = set()
    for k in range(0, 9):
        x = 26.6 - k * 0.55
        over |= {(int(x), 23 + k), (int(x) + 1, 23 + k)}
    under = set()
    for k in range(0, 6):
        x = 21 + k * 0.5
        under |= {(int(x), 23 + k), (int(x) + 1, 23 + k)}
    c.dots(under & torso, C['trim'])
    c.dots(over & torso, C['trim'])

    # 腰带 + 垂带
    sash = rect(19, 36, 28, 39) & (torso | skirt)
    c.layer(sash, C['trim'], C['trimL'])
    c.dots([(x, 37) for x in range(20, 28)], C['trimS'])
    for i, (x0, off) in enumerate(((23, 0.0), (25, 1.2))):
        pts = [(x0 + 0.5 + (0.3 if i else -0.3) * k + sway(k, 0.25 * k, off=off), 40 + k * 3) for k in range(0, 5)]
        c.dots(thick(pts, 0.5), C['trimL'])

    # ---- 广袖（双手拢在身前） ----
    def sleeve():
        hs = sway(3, 0.6, off=0.6)
        return poly([
            (17.8, 25.6), (16, 28), (14.9, 33), (14.1, 40), (13.4, 48), (13 + hs, 55),
            (13.8 + hs, 58), (16.2 + hs, 59.2), (18.8 + hs * 0.5, 58.2), (20.8, 54.5),
            (22.2, 48), (23.2, 44.6), (21.6, 42), (19.8, 37), (18.9, 31),
        ])

    sl = sleeve()
    c.layer(sl, C['robe'], C['robeL'])
    c.layer(mirror(sl), C['robe'], C['robeL'])
    c.dots(line(16, 34, 15, 52) & sl, C['robeS'])
    c.dots(mirror(line(16, 34, 15, 52) & sl), C['robeS'])
    # 袖口青边 + 拢着的手
    cuff = {(x, y) for (x, y) in (sl | mirror(sl)) if y >= 56}
    c.layer(cuff, C['trim'], C['trimL'])
    c.dots([(23, 44), (24, 44), (23, 45), (24, 45)], C['skin'])
    c.dots([(23, 46), (24, 46)], C['skinS'])

    # ---- 披帛（搭在臂弯的前段） ----
    front_rib = thick([(17.2, 31.5), (16, 35), (14.8, 38.5)], 1.1)
    c.layer(front_rib, C['shawl'], C['shawlL'])
    c.layer(mirror(front_rib), C['shawl'], C['shawlL'])

    # ---- 头部（随呼吸下沉） ----
    face(c, b, P)

    lock = poly(shift([
        (23.6, 6.4), (20.6, 7.2), (18.8, 9.6), (18.1, 13.6), (17.9, 18.4), (17.6, 23.4),
        (17.2, 28.4), (16.9, 32.6), (18.3, 31), (19.1, 26.4), (19.6, 21.2), (19.9, 16.4),
        (20.2, 12.4), (21.1, 9.6), (23.1, 8.2),
    ], b))
    c.layer(lock, C['hair'], C['hairL'])
    c.layer(mirror(lock), C['hair'], C['hairL'])
    c.dots(shift([(19, 12), (19, 13), (19, 14), (18, 19), (18, 20)], b), C['sheen'])
    c.dots(shift([(20, 7), (21, 6), (22, 6)], b), C['sheen'])

    bun = ellipse(24, 3.4 + b, 3.7, 2.7)
    c.layer(bun, C['hair'], C['hairL'])
    c.dots(shift([(22, 2), (23, 1)], b), C['sheen2'])
    c.dots(line(17, 5 + b, 30, 1 + b), C['gold'])
    c.dots([(30, 1 + b), (31, 1 + b), (31, b)], C['jade'])
    tip = round(sway(2, 0.9, off=2.4))
    c.dots([(31, 2 + b), (31, 3 + b), (31, 4 + b), (31 + (tip > 0), 5 + b), (31 + tip, 6 + b)], C['goldD'])
    c.dots([(31 + tip, 7 + b)], C['bead'])

    features(c, b, P, mark=C['lip'], closed=blink)
    return c
