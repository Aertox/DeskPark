"""猫耳娘（像素头像 anime-catgirl 的全身像）：薰衣草色长发、猫耳与尾巴，绿瞳，深色裙装配金铃。"""
from kit import FH, FW, Canvas, back_hair, blinking, blob, breath, face, features, front_locks, line, mirror, pal, poly, rect, shift, sympoly, tail, thick

META = dict(id='anime-catgirl', avatar='anime-catgirl', name='猫耳娘', group='动漫', face=[14, 1, 20], bg='#ffd6e8')

P = pal(
    hair='#8e6cd6', hairL='#4a338a', hairS='#b9a0f0', sheen='#b9a0f0', earIn='#ffb3d1',
    iris='#3fbf7a', irisL='#9ff0c0', lip='#e06a8a',
    dress='#2f2f48', dressL='#12121e', dressS='#44446a', white='#fbf8ff', whiteL='#a8a2c0',
    bell='#ffd34d', bellL='#a88a14', sock='#2f2f48', shoe='#12121e',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 尾巴：从裙后伸出，S 形摇摆
    path = tail([(27, 52), (31, 56), (34.6, 54), (36.4, 48), (36, 42), (37.6, 37)], t, 0.4, 1.8, lag=0.6)
    tl = blob(path, [1.4, 1.6, 1.6, 1.5, 1.4, 1.2])
    c.layer(tl, P['hair'], P['hairL'])
    c.dots({p for p in tl if p[1] <= path[-1][1] + 1 and p in tl} & blob(path[-2:], [0.9, 0.9]), P['hairS'])
    back_hair(c, b, P, to=46, width=1.0)
    # 腿：过膝袜 + 圆头鞋
    for x0 in (20, 25):
        c.layer(rect(x0, 60, x0 + 2, 68), P['skin'], P['skinL'])
        c.layer(rect(x0, 67, x0 + 2, 90), P['sock'], P['dressL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 90, x0 + (2 if x0 < 24 else 3), 93), P['shoe'], P['dressL'])
    # 裙 + 白色围裙
    skirt = sympoly([(24, 38), (19.6, 38.4), (17.6, 45), (16, 53), (15, 61)])
    c.layer(skirt, P['dress'], P['dressL'])
    c.layer({(x, y) for (x, y) in skirt if y >= 59}, P['white'], P['whiteL'])
    apron = sympoly([(24, 39.6), (21, 40), (20.2, 48), (20, 56.4)])
    c.layer(apron, P['white'], P['whiteL'])
    # 上身
    c.layer(rect(22, 18, 25, 25), P['skin'], P['skinL'])
    torso = sympoly([(24, 23.6), (21.6, 23.8), (19.6, 24.6), (18.2, 26.4), (18.2, 31), (19, 35.6), (19.6, 39)])
    c.layer(torso, P['dress'], P['dressL'])
    c.dots(line(21, 23, 26, 23), P['white'])
    c.dots([(23, 24), (24, 24), (23, 25), (24, 25)], P['bell'])
    c.dots([(23, 25)], P['bellL'])
    sl = poly([(17.8, 25.4), (16, 27.6), (15.4, 33), (15.2, 41), (15.6, 46), (18, 46.2), (18.4, 40), (18.6, 32)])
    for m in (sl, mirror(sl)):
        c.layer(m, P['dress'], P['dressL'])
    c.dots({(x, y) for (x, y) in sl | mirror(sl) if y in (44, 45)}, P['white'])
    hand = {(16, 47), (17, 47), (16, 48), (17, 48)}
    c.dots(hand | mirror(hand), P['skin'])
    # 头
    face(c, b, P)
    front_locks(c, b, P, to=30)
    fringe = sympoly(shift([(24, 5.4), (20.6, 6), (18.8, 8.4), (18.6, 12), (20, 11.2), (21, 9.6), (22.6, 11), (24, 10)], b))
    c.layer(fringe, P['hair'], P['hairL'])
    tw = 1 if t in (8, 9) else 0
    for side in (0, 1):
        ear = poly(shift([(17.8, 8.6), (17.2 - (tw if side else 0), 1.8), (22.6, 5.2)], b))
        inner = poly(shift([(18.8, 7), (18.4 - (tw if side else 0), 3.6), (21.2, 5.6)], b))
        if side:
            ear, inner = mirror(ear), mirror(inner)
        c.layer(ear, P['hair'], P['hairL'])
        c.dots(inner, P['earIn'])
    features(c, b, P, eyes='big', closed=blinking(t))
    return c
