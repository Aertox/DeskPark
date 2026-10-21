"""素琴 · 修仙：粉衣琴师，侧髻簪梅花，怀抱古琴，偶有音符飘起。"""
from kit import (
    FH, FW, Canvas, blinking, breath, ellipse, face, features, line, mirror, poly, rect, shift,
    sway, sympoly, tail, thick,
)

META = dict(id='suqin', name='素琴', group='修仙', face=[14, 1, 20], bg='#f1e1e4')

C = dict(
    hair='#2a2433', hairL='#16121c', sheen='#4b4462',
    skin='#f8e6db', skinL='#d6a796', skinS='#efd0c2', blush='#f3bcbc',
    lash='#2b2030', iris='#4c3346', irisL='#9a7c92', brow='#6a5660', lip='#d46a78',
    robe='#f6e9ea', robeL='#a98a90', robeS='#ead3d6', inner='#fffafa',
    skirt='#efd5da', skirtS='#e2bcc4',
    trim='#b9606f', trimL='#7d3a47', trimS='#d88b98',
    flower='#f29bb0', flowerL='#c25d77', flowerC='#ffd37a', pearl='#fbf5ea',
    wood='#5b3a2c', woodL='#2f1d16', woodT='#7a5240', string='#e8dcc4', hui='#e4c57a',
    note='#c25d77',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)

    # 后发
    c.layer(sympoly(shift([(24, 4.6), (20, 5.4), (17.8, 8), (17, 12), (16.8, 18), (17, 24), (18, 28)], b)), C['hair'], C['hairL'])

    # 裙
    skirt = sympoly([(24, 38.5), (19.4, 39), (18.2, 46), (17, 58), (15.8, 70), (14.6, 82), (13.6, 92.5)])
    c.layer(skirt, C['skirt'], C['robeL'])
    c.layer({(x, y) for (x, y) in skirt if y >= 89}, C['trim'], C['trimL'])
    for x0, x1 in ((21, 18), (27, 30)):
        c.dots(line(x0, 52, x1, 88) & skirt, C['skirtS'])
    c.dots([(21, 93), (22, 93), (25, 93), (26, 93)], C['trimL'])

    # 上身
    c.layer(rect(22, 18, 25, 25), C['skin'], C['skinL'])
    torso = sympoly([(24, 23.2), (21.5, 23.4), (19.2, 24.3), (17.4, 26), (16.9, 29.5), (17.6, 34), (18.6, 39.5)])
    c.layer(torso, C['robe'], C['robeL'])
    c.layer(poly([(21.6, 23.6), (26.4, 23.6), (24, 30)]), C['inner'], None)
    for k in range(9):
        x = int(26.6 - k * 0.55)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], C['trim'])
    for k in range(6):
        x = int(21 + k * 0.5)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], C['trim'])
    c.layer(rect(19, 36, 28, 39) & (torso | skirt), C['trim'], C['trimL'])
    c.dots([(x, 37) for x in range(20, 28)], C['trimS'])

    # 上臂：袖子斜向身前，托住古琴
    arm = poly([(17.6, 25.6), (15.6, 28), (14.4, 33), (13.8, 39), (14.4, 43.6), (17, 45), (19.6, 44.4), (20.4, 41.6), (19.2, 37), (18.6, 31)])
    c.layer(arm, C['robe'], C['robeL'])
    c.layer(mirror(arm), C['robe'], C['robeL'])
    c.dots(line(16, 31, 15, 40) & arm, C['robeS'])

    # 古琴
    qin = poly([(6, 45), (8, 43.4), (40, 43.4), (42.6, 45), (42, 48.6), (7, 48.6)])
    c.layer(qin, C['wood'], C['woodL'])
    c.dots([(x, 44) for x in range(8, 41)], C['woodT'])
    for y in (45, 46, 47):
        c.dots([(x, y) for x in range(9, 40) if (x + y) % 2 == 0 or y == 46], C['string'])
    c.dots([(x, 44) for x in range(12, 38, 4)], C['hui'])
    c.layer(thick(tail([(7, 48), (6.4, 51), (6, 54), (6.2, 57)], t, 0.4, 1.2, off=0.8), 0.6), C['trimL'], None)
    c.dots([(6, 49), (7, 49)], C['hui'])

    # 抚琴的手 + 垂下的袖口
    for hx in (16, 30):
        c.dots([(hx, 43), (hx + 1, 43), (hx, 44), (hx + 1, 44)], C['skin'])
        c.dots([(hx, 44)], C['skinS'])
    hs = sway(t, 3, 0.6, off=0.5)
    drape = poly([(14.2, 44), (13.2, 49), (13.4 + hs, 55), (16.4 + hs, 56.2), (18.6, 52), (19.6, 46.6), (17, 45.6)])
    c.layer(drape, C['robe'], C['robeL'])
    c.layer(mirror(drape), C['robe'], C['robeL'])
    cuff = {(x, y) for (x, y) in drape | mirror(drape) if y >= 53}
    c.layer(cuff, C['trim'], C['trimL'])

    # 头
    face(c, b, C)
    lock = poly(shift([
        (23.6, 6.4), (20.6, 7.2), (18.8, 9.6), (18.1, 13.6), (17.9, 18.4), (17.6, 23.4),
        (17.4, 28), (17.6, 31), (18.7, 29.4), (19.3, 25), (19.7, 20), (19.9, 16),
        (20.2, 12.4), (21.1, 9.6), (23.1, 8.2),
    ], b))
    c.layer(lock, C['hair'], C['hairL'])
    c.layer(mirror(lock), C['hair'], C['hairL'])
    c.dots(shift([(19, 12), (19, 13), (19, 14), (18, 20), (18, 21)], b), C['sheen'])
    c.dots(shift([(21, 7), (22, 6)], b), C['sheen'])

    # 侧髻 + 梅花 + 垂珠
    c.layer(ellipse(19.4, 5.4 + b, 3.4, 2.8), C['hair'], C['hairL'])
    c.dots(shift([(18, 4), (19, 3)], b), C['sheen'])
    c.layer(ellipse(24.5, 4.6 + b, 4.4, 2.2), C['hair'], C['hairL'])
    for fx0, fy0 in ((28, 5), (31, 8)):
        pet = [(fx0, fy0 - 1), (fx0 - 1, fy0), (fx0 + 1, fy0), (fx0, fy0 + 1)]
        c.dots(shift(pet, b), C['flower'])
        c.dots(shift([(fx0 - 1, fy0 + 1), (fx0 + 1, fy0 - 1)], b), C['flowerL'])
        c.dots(shift([(fx0, fy0)], b), C['flowerC'])
    sw = round(sway(t, 2, 0.8, off=1.6))
    c.dots(shift([(16, 7), (16, 8), (16 + (sw > 0), 9), (16 + sw, 10)], b), C['hui'])
    c.dots(shift([(16 + sw, 11)], b), C['pearl'])

    # 音符：偶尔从琴上飘起
    if 2 <= t <= 9:
        k = t - 2
        x, y = 39 + (k // 2) % 2, 41 - k * 2
        c.dots([(x, y), (x + 1, y), (x + 1, y - 1), (x + 1, y - 2), (x + 1, y - 3), (x + 2, y - 3)], C['note'])

    features(c, b, C, closed=blinking(t))
    return c
