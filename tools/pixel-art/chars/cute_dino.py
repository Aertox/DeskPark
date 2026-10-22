"""恐龙崽（像素头像 cute-dino 的全身像）：穿绿色恐龙连体服的小孩，背上黄色棘刺，小尾巴左右摇。"""
from kit import FH, FW, Canvas, blinking, blob, breath, ellipse, face, features, line, mirror, pal, poly, rect, sympoly, tail, thick

META = dict(id='cute-dino', avatar='cute-dino', name='恐龙崽', group='卡通', face=[14, 23, 20], bg='#ffe0b3')

OY = 24

P = pal(
    dino='#6fcf6a', dinoL='#1d3320', dinoS='#3f9a46', belly='#ffd84a', bellyL='#b8941c',
    spike='#ffd84a', spikeL='#b8941c', white='#ffffff', lip='#e06a6a',
)


def frame(t):
    b = breath(t)
    hb = b + OY
    c = Canvas(FW, FH)
    # 尾巴
    path = tail([(28, 78), (33, 82), (37, 85), (40.6, 86)], t, 0.6, 1.8, lag=0.5)
    tl = blob(path, [3.2, 2.6, 1.9, 1.0])
    c.layer(tl, P['dino'], P['dinoL'])
    # 腿 + 小爪
    for x0 in (19, 25):
        c.layer(rect(x0, 80, x0 + 3, 90), P['dino'], P['dinoL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 89, x0 + (3 if x0 < 24 else 4), 93), P['dinoS'], P['dinoL'])
        c.dots([(x0, 93), (x0 + 2, 93)] if x0 < 24 else [(x0 + 1, 93), (x0 + 3, 93)], P['white'])
    # 身体
    body = sympoly([(24, 47), (20.6, 47.4), (18.4, 49.6), (17.4, 56), (17.2, 66), (17.8, 76), (19, 82)])
    c.layer(body, P['dino'], P['dinoL'])
    belly = ellipse(24, 66, 4.6, 10)
    c.layer(belly & body, P['belly'], P['bellyL'])
    for y in (60, 64, 68, 72):
        c.dots([(22, y), (23, y), (24, y), (25, y)], P['bellyL'])
    arm = thick([(18.6, 52), (16, 58), (15.6, 64)], 1.5)
    c.layer(arm | mirror(arm), P['dino'], P['dinoL'])
    c.dots([(15, 66), (16, 66), (31, 66), (32, 66)], P['white'])
    # 头套：恐龙帽，露出小脸
    hood = ellipse(24, 14 + hb, 10, 10.4)
    c.layer(hood, P['dino'], P['dinoL'])
    for i, (x, y) in enumerate([(24, 3), (20, 4.4), (28, 4.4), (17, 7.4), (31, 7.4)]):
        sp = poly([(x - 1.6, y + hb + 2), (x, y + hb - 1.6), (x + 1.6, y + hb + 2)])
        c.layer(sp, P['spike'], P['spikeL'])
    c.layer(hood, P['dino'], P['dinoL'])
    # 帽檐上的眼睛和牙齿
    for ex in (19, 28):
        c.dots([(ex, 6 + hb), (ex + 1, 6 + hb)], P['white'])
        c.dots([(ex + (1 if ex < 24 else 0), 7 + hb)], P['dinoL'])
    c.dots([(x, 10 + hb) for x in (19, 21, 26, 28)], P['white'])
    face(c, hb + 1, P)
    c.layer(sympoly([(24, 7.6 + hb + 1), (21, 8 + hb + 1), (19.4, 10.4 + hb + 1), (20, 10.8 + hb + 1), (24, 10.4 + hb + 1)]), P['dino'], P['dinoL'])
    features(c, hb + 1, P, eyes='big', closed=blinking(t))
    return c
