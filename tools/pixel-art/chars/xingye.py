"""星野 · 动漫：金色双马尾的魔法少女，手持星星法杖，星光环绕闪烁。"""
import math

from kit import (
    FH, FW, Canvas, blinking, breath, face, features, line, mirror, phase, poly, rect, shift,
    sympoly, tail, thick,
)

META = dict(id='xingye', name='星野', group='动漫', face=[14, 1, 20], bg='#f6e6f0')

C = dict(
    hair='#f6d77a', hairL='#a5832e', hairS='#fff0b8',
    skin='#fae8de', skinL='#d9a998', skinS='#f0d2c4', blush='#f8b9c6',
    lash='#3a2a40', iris='#6a5acd', irisL='#a99bff', brow='#c9a24a', lip='#e8668a',
    star='#ffd34d', starL='#c98f1a',
    dress='#ffb3cf', dressL='#c45a85', dressS='#ff8fb8',
    white='#fffafc', whiteL='#c9a5b8', whiteS='#f2dde8',
    ribbon='#9c7cf0', ribbonL='#5a3fb0',
    boot='#fffafc', bootL='#b58aa3',
    wand='#ffffff', wandL='#c45a85', spark='#fff6c2', spark2='#9ef0ff',
)


def twin(t, off):
    base = [(17.4, 8), (14.2, 12), (12.2, 19), (11.4, 27), (11.8, 35), (12.8, 42), (14.6, 48)]
    return tail(base, t, 0.3, 1.4, lag=0.5, off=off)


def blob(path, radii):
    out = set()
    for i in range(len(path) - 1):
        (x0, y0), (x1, y1) = path[i], path[i + 1]
        for k in range(9):
            u = k / 8
            x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * u
            r = radii[i] + (radii[i + 1] - radii[i]) * u
            out |= {
                (px, py)
                for py in range(int(y - r - 1), int(y + r + 2))
                for px in range(int(x - r - 1), int(x + r + 2))
                if (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= r * r
            }
    return out


def star(c, cx, cy, col, colL):
    c.dots([(cx, cy - 2), (cx - 1, cy - 1), (cx, cy - 1), (cx + 1, cy - 1)], col)
    c.dots([(x, cy) for x in range(cx - 2, cx + 3)], col)
    c.dots([(cx - 1, cy + 1), (cx + 1, cy + 1), (cx - 2, cy + 2), (cx + 2, cy + 2)], colL)
    c.dots([(cx, cy + 1)], col)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    radii = [2.2, 2.8, 3.1, 3.0, 2.7, 2.1, 1.2]

    # 双马尾（左右相位错开）
    left = blob(shift(twin(t, 0.0), b), radii)
    right = mirror(blob(shift(twin(t, 1.6), b), radii))
    for m in (left, right):
        c.layer(m, C['hair'], C['hairL'])
    c.dots({(x, y) for (x, y) in left if (x + 2, y) in left and (x - 1, y) in left and y % 5 == 0}, C['hairS'])
    c.dots({(x, y) for (x, y) in right if (x - 2, y) in right and (x + 1, y) in right and y % 5 == 0}, C['hairS'])

    # 腿 + 长靴
    for x0 in (20, 25):
        c.layer(rect(x0, 56, x0 + 2, 72), C['skin'], C['skinL'])
        boot = rect(x0 - (1 if x0 < 24 else 0), 70, x0 + (2 if x0 < 24 else 3), 93)
        c.layer(boot, C['boot'], C['bootL'])
        c.dots([(x, 71) for x in range(x0 - 1, x0 + 4)], C['dress'])

    # 蓬蓬裙：粉色外层 + 白色荷叶边
    skirt = sympoly([(24, 37.5), (19.6, 38), (17.4, 43), (15, 50), (13.6, 56.6)])
    c.layer(skirt, C['dress'], C['dressL'])
    frill = {(x, y) for (x, y) in skirt if y >= 54}
    c.layer(frill | {(x, 57) for (x, y) in frill if y == 56 and x % 3 != 0}, C['white'], C['whiteL'])
    for x0 in (18, 22, 26, 30):
        c.dots(line(x0 + (1 if x0 < 24 else -1), 40, x0 + (-1 if x0 < 24 else 1), 53) & skirt, C['dressS'])

    # 上身
    c.layer(rect(22, 18, 25, 25), C['skin'], C['skinL'])
    torso = sympoly([(24, 23.6), (21.6, 23.8), (19.6, 24.6), (18.2, 26.4), (18.2, 31), (19, 35.6), (19.6, 38.4)])
    c.layer(torso, C['dress'], C['dressL'])
    c.layer(rect(21, 23, 26, 25) & torso, C['white'], None)
    # 胸前蝴蝶结
    c.dots([(20, 27), (21, 27), (20, 28), (21, 28), (22, 28), (26, 28), (27, 27), (26, 27), (27, 28), (25, 28)], C['ribbon'])
    c.dots([(23, 28), (24, 28), (23, 29), (24, 29)], C['ribbonL'])
    c.dots([(22, 30), (25, 30), (22, 31), (25, 32)], C['ribbon'])

    # 泡泡袖
    for side in (0, 1):
        puff = {(x, y) for y in range(24, 31) for x in range(14, 21) if ((x + 0.5 - 17.2) / 3.2) ** 2 + ((y + 0.5 - 27.2) / 2.8) ** 2 <= 1}
        c.layer(mirror(puff) if side else puff, C['white'], C['whiteL'])
    # 左臂自然下垂
    c.layer(thick([(16, 30), (15.2, 38), (14.8, 46)], 1.1), C['skin'], C['skinL'])
    c.layer(rect(14, 45, 16, 48), C['white'], C['whiteL'])
    # 右臂持杖：前臂抬起
    c.layer(thick([(31.6, 30), (33.6, 37), (36, 41.4)], 1.1), C['skin'], C['skinL'])
    wand = thick([(36.6, 42), (39.4, 25)], 0.6)
    c.dots(wand, C['wand'])
    c.dots(line(37, 40, 38, 36), C['wandL'])
    c.layer(rect(35, 40, 37, 43), C['white'], C['whiteL'])
    sy = 22 + (1 if 4 <= t <= 11 else 0)
    star(c, 39, sy, C['star'], C['starL'])
    # 环绕星光
    for k, col in ((0, C['spark']), (1, C['spark2'])):
        a = phase(t) + k * math.pi
        x, y = round(39 + 6 * math.cos(a)), round(sy + 4 * math.sin(a))
        size = 1 if (t + k * 4) % 8 < 4 else 0
        c.dots([(x, y)], col)
        if size:
            c.dots([(x - 1, y), (x + 1, y), (x, y - 1), (x, y + 1)], col)

    # 头
    face(c, b, C)
    fringe = sympoly(shift([(24, 5.8), (20.6, 6.4), (18.8, 8.6), (18.4, 12.4), (19.8, 11.4), (20.8, 10), (22.4, 11.4), (24, 10.4)], b))
    c.layer(fringe, C['hair'], C['hairL'])
    lock = poly(shift([(20, 8), (18.4, 11), (18.2, 16), (18.8, 20.4), (19.8, 18), (20, 13)], b))
    c.layer(lock, C['hair'], C['hairL'])
    c.layer(mirror(lock), C['hair'], C['hairL'])
    c.dots(shift([(21, 7), (22, 7), (25, 7)], b), C['hairS'])
    # 发夹（星星）
    star(c, 17, 7 + b, C['star'], C['starL'])
    star(c, 30, 7 + b, C['star'], C['starL'])

    features(c, b, C, eyes='big', closed=blinking(t))
    return c
