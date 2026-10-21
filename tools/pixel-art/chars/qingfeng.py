"""青锋 · 修仙：墨蓝长袍的剑客，高马尾、银发冠，长剑负于背后。"""
from kit import (
    FH, FW, Canvas, blinking, both, breath, ellipse, face, features, line, mirror, poly, rect,
    shift, sympoly, tail, thick,
)

META = dict(id='qingfeng', name='青锋', group='修仙', face=[14, 1, 20], bg='#d7dfea')

C = dict(
    hair='#24212b', hairL='#121017', sheen='#45415a',
    skin='#f6e2d6', skinL='#d2a08f', skinS='#ebc8b8',
    lash='#1c1820', iris='#3a2f3a', irisL='#7b6a78', brow='#2e2830', lip='#c98a80',
    robe='#3b4a63', robeL='#1f2838', robeS='#506383',
    inner='#eef1f4', innerL='#9aa6b5', trim='#c9d3df', trimL='#8e9aab',
    belt='#232a38', jade='#6fb59a', jadeL='#3f8069',
    pants='#2a3040', pantsL='#151a24', boots='#17191f',
    hilt='#5b4a3c', hiltL='#2e2620', guard='#d9b66d', tassel='#c44a55', tasselL='#86222c', sheath='#3a2a22',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)

    # 剑：剑柄从左肩后探出，剑鞘末端露在右胯后
    c.layer(thick([(17.5, 26), (12.6, 15.6)], 1.1), C['hilt'], C['hiltL'])
    c.dots(line(13, 24, 19, 21), C['guard'])
    c.dots([(12, 15), (13, 15), (12, 14)], C['guard'])
    c.layer(thick(tail([(12, 15.5), (10.8, 18), (10.2, 21), (10.4, 24)], t, 0.4, 1.2), 0.6), C['tassel'], None)
    c.layer(thick([(30, 42), (34, 52)], 1.0), C['sheath'], C['hilt'])
    c.dots([(33, 51), (34, 52), (33, 52)], C['trim'])

    # 高马尾：从发髻向右后方垂下，末端摆动
    pony = thick(shift(tail([(25.5, 4), (29.5, 5.5), (32.6, 9.5), (34, 15), (34.4, 21), (33.8, 27), (34.6, 33)], t, 0.3, 1.5), b), 1.5)
    c.layer(pony, C['hair'], C['hairL'])
    c.dots(shift([(31, 7), (33, 11), (34, 16)], b), C['sheen'])

    # 后发（到后颈）
    c.layer(sympoly(shift([(24, 4.6), (20, 5.6), (17.9, 8.2), (17.2, 12), (17.3, 17), (18.4, 21.5), (20, 23)], b)), C['hair'], C['hairL'])

    # 裤腿与靴子
    for x0 in (19, 25):
        c.layer(rect(x0, 82, x0 + 3, 90), C['pants'], C['pantsL'])
        c.layer(rect(x0, 89, x0 + 3, 93) | {(x0 + (-1 if x0 < 24 else 4), 93)}, C['boots'], C['hairL'])

    # 长袍下摆
    lower = sympoly([(24, 38.5), (18.8, 39), (18, 50), (17.3, 62), (16.8, 74), (16.3, 86.5)])
    c.layer(lower, C['robe'], C['robeL'])
    c.dots(line(23, 58, 23, 86) & lower, C['robeL'])
    c.dots(line(20, 46, 18, 84) & lower, C['robeS'])
    c.dots({(x, y) for (x, y) in lower if y >= 84}, C['trim'])

    # 上身
    c.layer(rect(22, 18, 25, 25), C['skin'], C['skinL'])
    torso = sympoly([(24, 23), (21, 23.2), (18.2, 24.2), (16.2, 26), (15.8, 30), (16.6, 35), (17.8, 39.5)])
    c.layer(torso, C['robe'], C['robeL'])
    c.layer(poly([(21.4, 23.4), (26.6, 23.4), (24, 31)]), C['inner'], None)
    for k in range(9):
        x = int(26.8 - k * 0.6)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], C['trim'])
    for k in range(6):
        x = int(20.8 + k * 0.55)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], C['trim'])
    c.dots(line(18, 28, 18, 36) & torso, C['robeS'])

    # 腰带 + 玉佩
    c.layer(rect(18, 37, 29, 40) & (torso | lower), C['belt'], C['robeL'])
    c.dots([(23, 38), (24, 38), (23, 39), (24, 39)], C['trim'])
    pend = tail([(20.5, 41), (20.5, 44), (20.5, 47)], t, 0.3, 0.8, off=1.0)
    c.dots(thick(pend[:2], 0.4), C['trimL'])
    jx, jy = round(pend[-1][0] - 0.5), 47
    c.dots([(jx, jy), (jx + 1, jy), (jx, jy + 1), (jx + 1, jy + 1)], C['jade'])
    c.dots([(jx + 1, jy + 1)], C['jadeL'])
    c.dots(thick([(jx + 0.5, jy + 2), (jx + 0.5 + pend[-1][0] - 20.5, jy + 5)], 0.4), C['tassel'])

    # 窄袖垂在身侧
    sl = poly([(16.8, 25.6), (14.9, 28), (13.9, 34), (13.3, 42), (12.9, 50), (13, 53), (16.8, 53), (17.1, 47), (17.6, 39), (18, 31)])
    c.layer(sl, C['robe'], C['robeL'])
    c.layer(mirror(sl), C['robe'], C['robeL'])
    cuff = {(x, y) for (x, y) in sl if y >= 51}
    c.dots(cuff | mirror(cuff), C['trim'])
    c.dots(line(15, 31, 14, 49) & sl, C['robeS'])
    hand = {(13, 54), (14, 54), (15, 54), (14, 55), (15, 55)}
    c.dots(hand | mirror(hand), C['skin'])
    c.dots({(13, 54), (14, 55)} | mirror({(13, 54), (14, 55)}), C['skinS'])

    # 头
    face(c, b, C)
    lock = poly(shift([(22.5, 7), (19.6, 8.6), (18.4, 12), (18.2, 17), (18.6, 22.6), (19.6, 21), (19.8, 16), (20.2, 12), (21.6, 9.4)], b))
    c.layer(lock, C['hair'], C['hairL'])
    c.layer(mirror(lock), C['hair'], C['hairL'])
    fringe = poly(shift([(29, 6.5), (23, 6.8), (20, 8.6), (19.4, 11.4), (21.6, 10), (24.4, 9.4), (27.2, 10), (28.8, 11.6), (29.4, 9)], b))
    c.layer(fringe, C['hair'], C['hairL'])
    c.dots(shift([(21, 8), (22, 7), (23, 7)], b), C['sheen'])

    # 发髻 + 银冠 + 簪
    c.layer(ellipse(24, 4 + b, 3.2, 2.4), C['hair'], C['hairL'])
    c.layer(rect(22, 1 + b, 25, 3 + b), C['trim'], C['trimL'])
    c.dots(line(19, 3 + b, 29, 2 + b), C['trimL'])

    features(c, b, C, brows='sword', blush=False, closed=blinking(t))
    return c
