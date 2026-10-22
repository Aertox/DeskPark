"""小道童（像素头像 xian-taoist 的全身像）：双髻蓝袍黄边的小道士，手持拂尘。个子矮一截。"""
from kit import FH, FW, Canvas, blinking, breath, ellipse, face, features, line, mirror, pal, poly, rect, shift, sympoly, tail, thick

META = dict(id='xian-taoist', avatar='xian-taoist', name='小道童', group='修仙', face=[14, 23, 20], bg='#ffe7a8')

OY = 22  # 孩子：头部整体下移

P = pal(
    hair='#2b2737', hairL='#15121c', sheen='#4a4560',
    robe='#3d6fb5', robeL='#1f3a66', robeS='#5a8cd0', trim='#f2c94c', trimL='#a0801c', inner='#ffffff',
    sock='#ffffff', shoe='#22202c', handle='#8a5a34', whisk='#f6f4ee', whiskL='#b9b4a8',
)


def frame(t):
    b = breath(t)
    hb = b + OY
    c = Canvas(FW, FH)
    # 腿脚
    for x0 in (20, 25):
        c.layer(rect(x0, 86, x0 + 2, 90), P['sock'], P['whiskL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 90, x0 + (2 if x0 < 24 else 3), 93), P['shoe'], P['hairL'])
    lower = sympoly([(24, 56.5), (19.4, 57), (18.6, 64), (17.8, 74), (17.2, 87)])
    c.layer(lower, P['robe'], P['robeL'])
    c.layer({(x, y) for (x, y) in lower if y >= 84}, P['trim'], P['trimL'])
    c.dots(line(23, 66, 23, 83) & lower, P['robeL'])
    # 上身
    c.layer(rect(22, 40, 25, 46), P['skin'], P['skinL'])
    torso = sympoly([(24, 44.5), (21.6, 44.7), (19.6, 45.6), (18.2, 47.4), (17.8, 51), (18.4, 55), (19, 58)])
    c.layer(torso, P['robe'], P['robeL'])
    c.layer(poly([(21.6, 45), (26.4, 45), (24, 50.4)]), P['inner'], None)
    for k in range(6):
        x = int(26.4 - k * 0.6)
        c.dots([(x, 45 + k), (x + 1, 45 + k)], P['trim'])
    c.layer(rect(18, 55, 29, 57), P['trim'], P['trimL'])
    # 袖子
    sl = poly([(18.8, 46), (17, 48.4), (16, 53), (15.4, 60), (15.6, 64), (18.8, 64.4), (19.2, 58), (19.6, 51)])
    c.layer(sl, P['robe'], P['robeL'])
    c.layer(mirror(sl), P['robe'], P['robeL'])
    c.dots({(x, y) for (x, y) in sl | mirror(sl) if y >= 63}, P['trim'])
    hand = {(16, 65), (17, 65), (17, 66), (16, 66)}
    c.dots(hand | mirror(hand), P['skin'])
    # 拂尘：右手握柄，白色马尾随风摆
    c.layer(thick([(30.5, 60), (31.5, 68)], 0.7), P['handle'], P['hairL'])
    c.layer(thick(tail([(31.6, 68), (32.6, 72), (33.2, 76), (33.4, 80)], t, 0.45, 1.4), 1.2), P['whisk'], P['whiskL'])
    # 头
    face(c, hb, P)
    cap = sympoly(shift([(24, 5), (20.6, 5.6), (18.6, 7.6), (18, 11), (18.4, 14.6), (19.6, 12), (20.6, 10.2), (22.4, 11), (24, 10.4)], hb))
    c.layer(cap, P['hair'], P['hairL'])
    for side in (0, 1):
        bun = ellipse(19.4, 3.6 + hb, 2.8, 2.4)
        c.layer(mirror(bun) if side else bun, P['hair'], P['hairL'])
    c.dots(both_x([(19, 6 + hb), (20, 6 + hb)]), P['trim'])
    c.dots(shift([(21, 6), (22, 6)], hb), P['sheen'])
    features(c, hb, P, eyes='big', closed=blinking(t))
    return c


def both_x(pts):
    return list(pts) + [(FW - 1 - x, y) for x, y in pts]
