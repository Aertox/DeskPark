"""零式 · 赛博朋克：银发、红色义眼的长风衣男子，衣上电路纹路有光流过。"""
from kit import (
    FH, FW, Canvas, blinking, breath, face, features, line, mirror, poly, rect, shift, sway,
    sympoly,
)

META = dict(id='lingshi', name='零式', group='赛博朋克', face=[14, 1, 20], bg='#22283a')

C = dict(
    hair='#e6e9f2', hairL='#7c8299', hairS='#bfc5d6',
    skin='#f1e0d6', skinL='#c99a8c', skinS='#e4c6b8',
    lash='#1c1820', iris='#3a3446', irisL='#7b7590', brow='#8a90a6', lip='#c48a84',
    coat='#1c1f2b', coatL='#090a10', coatS='#2e3242', inner='#3a3f52',
    cyan='#38e8ff', cyanD='#155e70', eye='#ff3b4e', eyeG='#ff9aa4',
    boots='#111218', bootsL='#000000',
)


def circuit_pts():
    """衣服上的电路走线（按光流方向排序）。"""
    pts = []
    for p in [line(15, 30, 15, 46), line(27, 46, 29, 52), line(29, 53, 29, 66), line(30, 67, 31, 76)]:
        pts += sorted(p, key=lambda q: (q[1], q[0]))
    return pts


CIRCUIT = circuit_pts()
NODES = [(15, 46), (29, 66), (31, 76)]


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)

    # 靴
    for x0 in (19, 25):
        c.layer(rect(x0, 84, x0 + 3, 93) | {(x0 + (-1 if x0 < 24 else 4), 93)}, C['boots'], C['bootsL'])

    # 长风衣，下摆分开、随步伐轻摆
    hem = sway(t, 4, 0.8)
    coat_l = poly([
        (24, 22), (20.5, 22.4), (17.6, 23.8), (15.8, 26), (15.4, 31), (16, 40), (16.4, 52),
        (15.6, 64), (14.6 + hem * 0.4, 76), (13.8 + hem, 88), (23.6 + hem * 0.5, 88), (23.8, 60), (24, 44),
    ])
    c.layer(coat_l, C['coat'], C['coatL'])
    c.layer(mirror(coat_l), C['coat'], C['coatL'])
    c.layer(poly([(22, 44), (26, 44), (24.8, 86), (23.2, 86)]), C['inner'], C['coatL'])
    c.dots(line(18, 30, 17, 86) & coat_l, C['coatS'])
    c.dots([(x, 40) for x in range(18, 30)], C['coatL'])
    c.dots([(23, 40), (24, 40)], C['hairS'])

    # 袖子插兜
    sl = poly([(17, 24.6), (14.8, 27), (13.8, 33), (13.4, 41), (13.4, 49), (17, 49.4), (17.4, 42), (17.6, 33)])
    c.layer(sl, C['coat'], C['coatL'])
    c.layer(mirror(sl), C['coat'], C['coatL'])
    c.dots(line(14, 50, 18, 50) | line(29, 50, 33, 50), C['coatL'])

    # 电路光流
    for i, p in enumerate(CIRCUIT):
        c.dots([p], C['cyan'] if (i - t * 3) % 24 < 4 else C['cyanD'])
    c.dots(NODES, C['cyan'])

    # 高立领
    c.layer(rect(22, 17, 25, 22), C['skin'], C['skinL'])
    collar = sympoly(shift([(24, 18.6), (21.8, 18.4), (19.6, 18.8), (18.8, 22), (19.4, 25.6), (24, 26.4)], 0))
    c.layer(collar, C['coat'], C['coatL'])
    c.dots([(x, 25) for x in range(21, 27)], C['cyanD'])
    c.layer(poly([(21.6, 19), (26.4, 19), (24, 24)]), C['inner'], None)

    # 头
    cap = sympoly(shift([(24, 4.2), (20, 5), (17.6, 7.8), (17, 11.6), (17.4, 15.4), (18.6, 17), (20, 17)], b))
    c.layer(cap, C['hair'], C['hairL'])
    face(c, b, C)
    side = poly(shift([(20.6, 7.4), (18.6, 9.6), (18, 13), (18.4, 16.6), (19.8, 15), (20.2, 11)], b))
    c.layer(side, C['hair'], C['hairL'])
    c.layer(mirror(side), C['hair'], C['hairL'])
    for sp in ([(19, 6.4), (16.6, 3.4), (21.6, 5)], [(23, 5), (22.8, 1.4), (26, 4.6)], [(27, 5), (30.6, 2.6), (29.6, 7)], [(30, 8), (32.4, 10), (29.8, 12)]):
        c.layer(poly(shift(sp, b)), C['hair'], C['hairL'])
    bang = poly(shift([(30.4, 7), (25, 7.4), (21, 8.4), (19.4, 11), (22, 10), (24.6, 10.6), (27.6, 12.2), (29.4, 15.6), (30.2, 12)], b))
    c.layer(bang, C['hair'], C['hairL'])
    c.dots(shift([(21, 6), (22, 6), (24, 5), (25, 5)], b), C['hairS'])

    features(c, b, C, brows='sword', blush=False, closed=blinking(t))
    # 右眼义眼：常亮红光，周期性增强；眼下一道接口纹
    if not blinking(t):
        c.dots([(26, 14 + b)], C['eye'])
        c.dots([(25, 14 + b)], C['eyeG'] if t < 4 else C['eye'])
    c.dots([(27, 15 + b), (27, 16 + b)], C['cyanD'])
    return c
