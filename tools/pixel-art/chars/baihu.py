"""白狐 · 修仙：银白长发的狐仙，狐耳偶尔一动，蓬松的大尾巴在身后轻摇。"""
from kit import (
    FH, FW, Canvas, blinking, breath, face, features, line, mirror, poly, rect, shift, sway,
    sympoly, tail, thick,
)

META = dict(id='baihu', name='白狐', group='修仙', face=[14, 1, 20], bg='#e9e4ef')

C = dict(
    hair='#eef0f6', hairL='#8f97b0', hairS='#cfd5e6', sheen='#ffffff',
    ear='#f3b6c3',
    skin='#f9e9e0', skinL='#d9ab9b', skinS='#f0d3c6', blush='#f6c3c3',
    lash='#4a3340', iris='#c0504d', irisL='#f0a06a', liner='#d65a64', brow='#b9a6b3', lip='#cf4f5c',
    robe='#fbfbfd', robeL='#a0a6b8', robeS='#e3e6ef', inner='#ffffff',
    red='#c8414b', redL='#86222c', redS='#e0727a', gold='#d9b66d',
    tail='#f6f7fb', tailL='#9aa1b8', tailS='#dde2ee', tip='#ffffff',
)


def blob(path, radii):
    """沿路径半径渐变的圆刷，用来画蓬松的尾巴。"""
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


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)

    # 尾巴：从腰后绕到右侧向上翘，越往尖端摆动越大
    path = tail([(27, 52), (31, 56), (36, 55), (39.6, 50), (41.6, 43), (42, 35.6), (40.4, 28.6)], t, 0.3, 1.6, lag=0.5)
    radii = [2.6, 4.0, 5.0, 5.4, 5.2, 4.4, 3.0]
    body = blob(path, radii)
    c.layer(body, C['tail'], C['tailL'])
    tipc = blob(path[-2:], radii[-2:])
    c.dots({p for p in tipc if p in body and c.get(*p) != C['tailL'] and p[1] < path[-2][1] - 1}, C['tip'])
    shade = blob(path[1:5], [r * 0.45 for r in radii[1:5]])
    c.dots({(x + 1, y + 1) for (x, y) in shade if (x + 1, y + 1) in body}, C['tailS'])

    # 后发（长及腰）
    c.layer(sympoly(shift([(24, 4.6), (20, 5.4), (17.6, 8), (16.8, 12), (16.6, 20), (16.6, 30), (17, 40), (18.6, 44)], b)), C['hair'], C['hairL'])

    # 裙
    skirt = sympoly([(24, 38.5), (19.6, 39), (18.4, 46), (17.2, 58), (16, 70), (14.8, 82), (13.8, 92.5)])
    c.layer(skirt, C['robe'], C['robeL'])
    c.layer({(x, y) for (x, y) in skirt if y >= 87}, C['red'], C['redL'])
    c.dots({(x, y) for (x, y) in skirt if y == 86}, C['redS'])
    for x0, x1 in ((21, 18), (27, 30)):
        c.dots(line(x0, 50, x1, 85) & skirt, C['robeS'])
    c.dots([(21, 93), (22, 93), (25, 93), (26, 93)], C['redL'])

    # 上身：白衣红衬、红腰封
    c.layer(rect(22, 18, 25, 25), C['skin'], C['skinL'])
    torso = sympoly([(24, 23.2), (21.5, 23.4), (19.2, 24.3), (17.4, 26), (16.9, 29.5), (17.6, 34), (18.6, 39.5)])
    c.layer(torso, C['robe'], C['robeL'])
    c.layer(poly([(21.4, 23.6), (26.6, 23.6), (24, 31)]), C['red'], None)
    for k in range(9):
        x = int(26.8 - k * 0.6)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], C['robeS'])
    c.layer(rect(19, 35, 28, 39) & (torso | skirt), C['red'], C['redL'])
    c.dots([(x, 37) for x in range(20, 28)], C['gold'])
    knot = tail([(24.5, 39.5), (24.2, 43), (23.8, 46.5)], t, 0.3, 0.7, off=0.4)
    c.dots(thick(knot, 0.5), C['gold'])

    # 窄袖，双手拢于身前
    hs = sway(t, 3, 0.5, off=0.6)
    sl = poly([
        (17.8, 25.6), (16, 28), (15, 33), (14.4, 40), (14, 47), (14.2 + hs, 52), (16.6 + hs, 53),
        (19 + hs * 0.5, 51.4), (21, 47), (23, 43.4), (21.4, 41), (19.8, 36), (18.9, 31),
    ])
    c.layer(sl, C['robe'], C['robeL'])
    c.layer(mirror(sl), C['robe'], C['robeL'])
    cuff = {(x, y) for (x, y) in sl | mirror(sl) if y >= 50}
    c.layer(cuff, C['red'], C['redL'])
    c.dots(line(16, 33, 15, 47) & sl, C['robeS'])
    c.dots([(23, 43), (24, 43), (23, 44), (24, 44)], C['skin'])

    # 头
    face(c, b, C)
    lock = poly(shift([
        (23.6, 6.4), (20.6, 7.2), (18.8, 9.6), (18.1, 13.6), (17.9, 18.4), (17.6, 24),
        (17.2, 30), (17.4, 34.6), (18.8, 32.4), (19.3, 27), (19.7, 21), (19.9, 16.4),
        (20.2, 12.4), (21.1, 9.6), (23.1, 8.2),
    ], b))
    c.layer(lock, C['hair'], C['hairL'])
    c.layer(mirror(lock), C['hair'], C['hairL'])
    c.dots(shift([(19, 12), (19, 13), (19, 14), (18, 20), (18, 21), (18, 26)], b), C['hairS'])
    cap = sympoly(shift([(24, 5.2), (21, 5.8), (19.2, 7.4), (18.8, 9), (21, 8.4), (24, 8.2)], b))
    c.layer(cap, C['hair'], C['hairL'])
    c.dots(shift([(22, 6), (23, 6)], b), C['sheen'])

    # 狐耳（第 3~4 帧左耳轻抖）
    twitch = -1 if t in (3, 4) else 0
    ear = poly(shift([(18.2, 10), (16.4 + twitch, 3.4), (17.8 + twitch, 3.2), (23, 6.8)], b))
    inner = poly(shift([(19, 8.2), (17.8 + twitch, 4.8), (21.4, 6.8)], b))
    c.layer(ear, C['hair'], C['hairL'])
    c.dots(inner, C['ear'])
    ear_r = mirror(poly(shift([(18.2, 10), (16.4, 3.4), (17.8, 3.2), (23, 6.8)], b)))
    c.layer(ear_r, C['hair'], C['hairL'])
    c.dots(mirror(poly(shift([(19, 8.2), (17.8, 4.8), (21.4, 6.8)], b))), C['ear'])

    features(c, b, C, eyes='fox', mark=C['red'], closed=blinking(t))
    return c
