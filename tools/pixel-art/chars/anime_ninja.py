"""影忍（像素头像 anime-ninja 的全身像）：深蓝忍装、面罩，红色头带与长围巾随风飘动，手握苦无。"""
from kit import FH, FW, Canvas, blinking, breath, face, features, line, mirror, pal, poly, rect, shift, sympoly, tail, thick

META = dict(id='anime-ninja', avatar='anime-ninja', name='影忍', group='动漫', face=[14, 1, 20], bg='#ffcf8a')

P = pal(
    hair='#121320', hairL='#05060c', sheen='#2e3150',
    suit='#2b2d42', suitL='#0e0f18', suitS='#3d4060', dark='#1d1e2e',
    red='#d64545', redL='#7e1e1e', redS='#f07070', mask='#1d1e2e', metal='#c2c9d6', metalL='#6d7586',
    wrap='#c2c9d6', brow='#121320',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 长围巾：从颈后向左飘
    scarf = thick(tail([(21, 23), (16, 24), (11.6, 27), (8.6, 32), (7, 38), (6.6, 44)], t, 0.4, 1.8, lag=0.5), 1.3)
    c.layer(scarf, P['red'], P['redL'])
    # 腿：绑腿 + 分趾鞋
    leg = poly([(19.4, 44), (23.6, 44), (23.4, 68), (23, 90), (19.6, 90), (19.2, 68)])
    for m in (leg, mirror(leg)):
        c.layer(m, P['suit'], P['suitL'])
    for y in range(74, 89, 3):
        c.dots([(x, y) for x in range(20, 23)] + [(x, y) for x in range(25, 28)], P['wrap'])
    for x0 in (19, 25):
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 90, x0 + (3 if x0 < 24 else 4), 93), P['dark'], P['suitL'])
    # 上身
    torso = sympoly([(24, 21), (21, 21.4), (18.4, 22.6), (16.8, 25), (16.4, 30), (17.4, 38), (18.6, 45)])
    c.layer(torso, P['suit'], P['suitL'])
    c.dots(line(26, 22, 20, 36), P['dark'])
    c.layer(rect(18, 40, 29, 42), P['red'], P['redL'])
    c.dots(line(19, 26, 19, 38), P['suitS'])
    sl = poly([(17.6, 23.6), (15.4, 26), (14.4, 32), (14, 40), (14.2, 47), (17, 47.2), (17.4, 40), (17.8, 31)])
    for m in (sl, mirror(sl)):
        c.layer(m, P['suit'], P['suitL'])
    c.dots({(x, y) for (x, y) in sl | mirror(sl) if y in (43, 44, 45)}, P['wrap'])
    c.dots([(15, 48), (16, 48), (15, 49), (16, 49)], P['dark'])
    c.dots([(31, 48), (32, 48), (31, 49), (32, 49)], P['dark'])
    # 苦无（右手反握）
    c.dots(line(32, 50, 33, 56), P['metal'])
    c.dots([(33, 57), (32, 57), (34, 57)], P['metalL'])
    c.dots([(31, 50), (32, 51)], P['red'])
    # 头：黑发 + 面罩 + 头带
    c.layer(sympoly(shift([(24, 4.4), (20, 5.2), (17.6, 8), (17, 12), (17.4, 16), (19, 18)], b)), P['hair'], P['hairL'])
    face(c, b, P)
    for sp in ([(19.6, 6.4), (17, 3.6), (22.4, 5)], [(23.4, 5), (24, 1.6), (26.4, 5)], [(27, 5.6), (30.4, 3.6), (29.4, 8)]):
        c.layer(poly(shift(sp, b)), P['hair'], P['hairL'])
    fringe = sympoly(shift([(24, 6), (21, 6.4), (19.6, 8.4), (19.4, 10), (24, 9.4)], b))
    c.layer(fringe, P['hair'], P['hairL'])
    c.layer(rect(18, 8 + b, 29, 10 + b), P['red'], P['redL'])
    c.dots([(23 + i, 9 + b) for i in range(2)], P['metal'])
    knot = thick(shift(tail([(29.4, 9), (32.4, 9.6), (35.4, 11), (38, 12.6)], t, 0.5, 1.4, off=1.2), b), 0.7)
    c.dots(knot, P['red'])
    features(c, b, P, brows='sword', blush=False, closed=blinking(t))
    mask = sympoly(shift([(24, 15), (21, 15), (19.8, 15.6), (20.2, 17), (21.4, 18.6), (23, 20), (24, 20.4)], b))
    c.layer(mask, P['mask'], P['suitL'])
    return c
