"""魔法少女（像素头像 anime-magical 的全身像）：粉色长发、黄星发卡、紫色裙装，手持新月法杖，长发随风。"""
import math

from kit import FH, FW, Canvas, blinking, blob, breath, face, features, line, mirror, pal, phase, poly, rect, shift, star5, sympoly, tail, thick

META = dict(id='anime-magical', avatar='anime-magical', name='魔法少女', group='动漫', face=[14, 1, 20], bg='#fff0b3')

P = pal(
    hair='#ff8ac6', hairL='#a8407a', hairS='#ffc2e0',
    iris='#3b6fe0', irisL='#8fb2ff', lip='#d4507a',
    dress='#7b6cff', dressL='#3c2f9e', dressS='#9d92ff', white='#fdfaff', whiteL='#b3a6d6',
    bow='#ff4f9a', bowL='#a8205c', star='#ffe14d', starL='#c4a020',
    boot='#7b6cff', bootL='#3c2f9e', rod='#fdfaff', spark='#fff6c2',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 长发：身后飘向一侧
    hair = blob(shift(tail([(23, 6), (20, 10), (18.2, 18), (17.4, 28), (17, 38), (17.2, 46), (16.4, 52)], t, 0.3, 1.4, lag=0.45), b), [4.6, 4.6, 4.2, 3.8, 3.4, 2.8, 1.8])
    hair |= mirror(blob(shift(tail([(23, 6), (20, 10), (18.2, 18), (17.4, 28), (17, 38), (17.2, 46), (16.4, 52)], t, 0.3, 1.4, lag=0.45, off=1.2), b), [4.6, 4.6, 4.2, 3.8, 3.4, 2.8, 1.8]))
    c.layer(hair, P['hair'], P['hairL'])
    c.dots({(x, y) for (x, y) in hair if (x + 2, y) in hair and (x - 2, y) in hair and y % 6 == 0 and y > 22}, P['hairS'])
    # 腿 + 长靴
    for x0 in (20, 25):
        c.layer(rect(x0, 58, x0 + 2, 72), P['skin'], P['skinL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 71, x0 + (2 if x0 < 24 else 3), 93), P['boot'], P['bootL'])
        c.dots([(x, 72) for x in range(x0 - 1, x0 + 4)], P['white'])
    # 裙
    skirt = sympoly([(24, 37.5), (19.6, 38), (17.4, 44), (15.4, 51), (14.4, 58)])
    c.layer(skirt, P['dress'], P['dressL'])
    c.layer({(x, y) for (x, y) in skirt if y >= 55}, P['white'], P['whiteL'])
    for x0 in (19, 23, 27):
        c.dots(line(x0, 41, x0 + (-2 if x0 < 24 else 2), 54) & skirt, P['dressS'])
    # 上身 + 水手领 + 蝴蝶结
    c.layer(rect(22, 18, 25, 25), P['skin'], P['skinL'])
    torso = sympoly([(24, 23.6), (21.6, 23.8), (19.6, 24.6), (18.2, 26.4), (18.2, 31), (19, 35.6), (19.6, 38.4)])
    c.layer(torso, P['dress'], P['dressL'])
    collar = poly([(21.6, 23.6), (18.8, 24.6), (17.8, 27.4), (21, 27.6), (23.6, 30)])
    for m in (collar, mirror(collar)):
        c.layer(m, P['white'], P['whiteL'])
    c.dots([(20, 29), (21, 28), (21, 29), (22, 30), (27, 29), (26, 28), (26, 29), (25, 30)], P['bow'])
    c.dots([(23, 30), (24, 30), (23, 31), (24, 31)], P['bowL'])
    c.layer(rect(19, 36, 28, 38), P['bow'], P['bowL'])
    # 手臂：左臂垂下，右臂举杖
    c.layer(thick([(17.6, 26), (16, 33), (15.4, 41), (15.4, 46)], 1.1), P['skin'], P['skinL'])
    c.layer(thick([(30.4, 26), (32.6, 32), (34.4, 37.6)], 1.1), P['skin'], P['skinL'])
    c.layer(rect(14, 44, 16, 47) | rect(33, 36, 35, 39), P['white'], P['whiteL'])
    c.dots(line(35, 41, 36, 18), P['rod'])
    c.dots(line(35, 42, 35, 47), P['starL'])
    # 新月 + 星
    my = 15 + (1 if 4 <= t <= 11 else 0)
    moon = {(x, y) for x in range(30, 43) for y in range(my - 6, my + 7)
            if (x + 0.5 - 36.4) ** 2 + (y + 0.5 - my) ** 2 <= 20 and (x + 0.5 - 38.2) ** 2 + (y + 0.5 - my + 1) ** 2 > 13}
    c.layer(moon, P['star'], P['starL'])
    star5(c, 38, my, P['bow'], P['bowL'])
    a = phase(t)
    sx, sy = round(36 + 7 * math.cos(a)), round(my + 5 * math.sin(a))
    c.dots([(sx, sy), (sx - 1, sy), (sx + 1, sy), (sx, sy - 1), (sx, sy + 1)] if t % 4 < 2 else [(sx, sy)], P['spark'])
    # 头
    face(c, b, P)
    fringe = sympoly(shift([(24, 5.4), (20.6, 6), (18.8, 8.4), (18.4, 12.6), (19.8, 11.6), (20.8, 9.8), (22.4, 11.2), (24, 10.2)], b))
    c.layer(fringe, P['hair'], P['hairL'])
    lock = poly(shift([(20, 8), (18.4, 11), (18, 16), (18.4, 21.6), (19.6, 19), (20, 13)], b))
    for m in (lock, mirror(lock)):
        c.layer(m, P['hair'], P['hairL'])
    star5(c, 29, 7 + b, P['star'], P['starL'])
    c.dots(shift([(21, 7), (22, 6)], b), P['hairS'])
    features(c, b, P, eyes='big', closed=blinking(t))
    return c
