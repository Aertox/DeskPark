"""小樱 · 动漫：栗色长发系红色蝴蝶结的水手服少女，双手提书包。"""
from kit import (
    FH, FW, Canvas, blinking, breath, ellipse, face, features, line, mirror, poly, rect, shift,
    sway, sympoly, tail, thick,
)

META = dict(id='xiaoying', name='小樱', group='动漫', face=[14, 1, 20], bg='#f3e3dc')

C = dict(
    hair='#8a5a44', hairL='#4a2c22', hairS='#b07a5e',
    skin='#fae8de', skinL='#d9a998', skinS='#f0d2c4', blush='#f6bdb8',
    lash='#3a2420', iris='#7a4a34', irisL='#c08a5e', brow='#7a5040', lip='#df6f78',
    ribbon='#d9434f', ribbonL='#8f1f2b', ribbonS='#f07a84',
    white='#f7f8fb', whiteL='#8e95a8', whiteS='#e1e5ee',
    navy='#2f3e66', navyL='#18203a', navyS='#475a8c',
    sock='#f7f8fb', shoe='#5a3a2e', shoeL='#2e1d17',
    bag='#7a4f36', bagL='#3f281b', bagS='#9a6a4a', metal='#d9b66d',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)

    # 长发（垂到腰后，露在双臂外侧），发梢轻摆
    ends = tail([(15, 30), (14.6, 38), (15.2, 45), (16.4, 49)], t, 0.3, 0.9)
    back = sympoly(shift([(24, 4.6), (20, 5.4), (17.4, 8), (16.4, 12), (15.8, 20)], b) + ends + [(20, 47)])
    c.layer(back, C['hair'], C['hairL'])
    c.dots(line(16, 22, 16, 40), C['hairS'])

    # 腿、袜、鞋
    for x0 in (20, 25):
        c.layer(rect(x0, 60, x0 + 2, 79), C['skin'], C['skinL'])
        c.layer(rect(x0, 78, x0 + 2, 90), C['sock'], C['whiteL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 90, x0 + (2 if x0 < 24 else 3), 93), C['shoe'], C['shoeL'])

    # 百褶裙
    skirt = sympoly([(24, 38.5), (19.4, 39), (18, 46), (16.6, 54), (15.4, 62.5)])
    c.layer(skirt, C['navy'], C['navyL'])
    shift_p = 1 if t >= 8 else 0
    for x0 in range(17, 31, 3):
        c.dots(line(x0 + 2 if x0 < 24 else x0, 41, x0 + shift_p, 61) & skirt, C['navyS'])

    # 水手服上衣
    c.layer(rect(22, 18, 25, 25), C['skin'], C['skinL'])
    torso = sympoly([(24, 23.2), (21.5, 23.4), (19.2, 24.3), (17.6, 26), (17.2, 30), (17.8, 35), (18.6, 40)])
    c.layer(torso, C['white'], C['whiteL'])
    c.dots(line(19, 36, 28, 36) & torso, C['whiteS'])
    sailor = poly([(21.2, 23.6), (18.4, 24.4), (17, 26.6), (17.6, 28.6), (20.6, 28.4), (23.6, 31)])
    c.layer(sailor, C['navy'], C['navyL'])
    c.layer(mirror(sailor), C['navy'], C['navyL'])
    c.dots(line(18, 27, 21, 27) | line(26, 27, 29, 27), C['white'])
    # 红领巾结
    c.dots([(23, 30), (24, 30), (22, 31), (25, 31)], C['ribbon'])
    scarf = tail([(23.5, 31), (23, 33.5), (22.6, 36)], t, 0.3, 0.6, off=0.7)
    c.dots(thick(scarf, 0.5), C['ribbon'])
    c.dots(thick([(24.5, 31), (25, 33.5), (25.4 + scarf[-1][0] - 22.6, 36)], 0.5), C['ribbonL'])

    # 手臂提书包
    sl = poly([(17.8, 25.6), (16, 28), (15.4, 34), (15.6, 42), (16.8, 49), (19, 51.2), (20.2, 49.4), (19.2, 42), (19, 34), (19.2, 28)])
    c.layer(sl, C['white'], C['whiteL'])
    c.layer(mirror(sl), C['white'], C['whiteL'])
    cuff = {(x, y) for (x, y) in sl | mirror(sl) if y >= 48}
    c.dots(cuff, C['navy'])
    swing = 1 if 6 <= t <= 12 else 0
    bag = rect(16, 53 + swing, 31, 64 + swing)
    c.layer(bag, C['bag'], C['bagL'])
    c.layer(rect(16, 53 + swing, 31, 57 + swing), C['bagS'], C['bagL'])
    c.dots([(23, 57 + swing), (24, 57 + swing), (23, 58 + swing), (24, 58 + swing)], C['metal'])
    c.dots(line(19, 52, 19, 53 + swing) | line(28, 52, 28, 53 + swing), C['bagL'])
    c.dots([(18, 51), (19, 51), (19, 52), (28, 51), (29, 51), (28, 52)], C['skin'])

    # 头
    face(c, b, C)
    lock = poly(shift([(23.4, 6.6), (20.4, 7.4), (18.8, 9.8), (18.2, 14), (18, 19), (18.4, 24), (19.6, 22.6), (19.8, 17), (20.2, 12.6), (21.2, 9.8)], b))
    c.layer(lock, C['hair'], C['hairL'])
    c.layer(mirror(lock), C['hair'], C['hairL'])
    fringe = sympoly(shift([(24, 6.2), (21, 6.6), (19.4, 8.4), (19, 11.6), (20.6, 11.2), (21.6, 10.2), (22.8, 11.2), (24, 10.6)], b))
    c.layer(fringe, C['hair'], C['hairL'])
    c.dots(shift([(20, 8), (21, 7), (22, 7), (26, 7)], b), C['hairS'])

    # 头后的红色大蝴蝶结
    bw = round(sway(t, 1, 0.6, off=2.0))
    for side in (0, 1):
        loop = ellipse(19.6, 4.4 + b, 3, 2.2)
        knot_tail = thick([(21.4, 6 + b), (19.6 + bw, 9.6 + b)], 0.6)
        if side:
            loop, knot_tail = mirror(loop), mirror(knot_tail)
        c.layer(loop, C['ribbon'], C['ribbonL'])
        c.dots(knot_tail, C['ribbonL'])
    c.dots(shift([(23, 4), (24, 4), (23, 5), (24, 5)], b), C['ribbonL'])
    c.dots(shift([(18, 3), (29, 3)], b), C['ribbonS'])

    features(c, b, C, eyes='big', closed=blinking(t))
    return c
