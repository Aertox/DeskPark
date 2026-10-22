"""小宇航员（像素头像 cute-astronaut 的全身像）：穿白色宇航服的小孩，玻璃头盔反光，背包指示灯闪烁。"""
from kit import FH, FW, Canvas, blinking, breath, ellipse, face, features, line, mirror, pal, rect, sympoly, thick

META = dict(id='cute-astronaut', avatar='cute-astronaut', name='小宇航员', group='卡通', face=[12, 22, 24], bg='#2a3160')

OY = 26

P = pal(
    suit='#eef1f6', suitL='#6e7890', suitS='#b8c2d2', glass='#23305a', glassL='#0e1430', glassH='#7f95d8',
    orange='#ff6b4a', orangeL='#a83a22', light='#3ee6ff', lightD='#1a6e80', hair='#5a3a2e', hairL='#2e1d17',
)


def frame(t):
    b = breath(t)
    hb = b + OY
    c = Canvas(FW, FH)
    # 背包
    c.layer(rect(15, 50, 32, 66), P['suitS'], P['suitL'])
    c.dots([(16, 51), (31, 51)], P['light'] if t % 4 < 2 else P['lightD'])
    # 腿 + 靴
    for x0 in (19, 25):
        c.layer(rect(x0, 74, x0 + 3, 87), P['suit'], P['suitL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 86, x0 + (3 if x0 < 24 else 4), 93), P['suitS'], P['suitL'])
        c.dots([(x, 87) for x in range(x0 - (1 if x0 < 24 else 0), x0 + (4 if x0 < 24 else 5))], P['orange'])
    # 身体
    body = sympoly([(24, 47), (20.6, 47.4), (18, 49.4), (17, 55), (17, 64), (17.6, 72), (18.6, 76)])
    c.layer(body, P['suit'], P['suitL'])
    c.layer(rect(20, 54, 27, 60), P['suitS'], P['suitL'])
    c.dots([(21, 56), (22, 56)], P['orange'])
    c.dots([(25, 56), (26, 56)], P['light'] if (t // 2) % 2 else P['lightD'])
    c.dots([(21, 58), (22, 58), (23, 58), (24, 58), (25, 58), (26, 58)], P['suitL'])
    c.layer(rect(17, 68, 30, 70), P['orange'], P['orangeL'])
    # 手臂（右手挥一挥）
    wave = 1 if 4 <= t <= 11 else 0
    c.layer(thick([(17.6, 50), (15, 56), (14.6, 63)], 1.7), P['suit'], P['suitL'])
    c.layer(ellipse(14.6, 65, 2, 1.8), P['orange'], P['orangeL'])
    c.layer(thick([(30.4, 50), (33, 54 - wave * 2), (34, 59 - wave * 5)], 1.7), P['suit'], P['suitL'])
    c.layer(ellipse(34, 60.6 - wave * 5, 2, 1.8), P['orange'], P['orangeL'])
    # 头盔 + 透过面罩看到的小脸
    helm = ellipse(24, 13 + hb, 10.4, 10.6)
    c.layer(helm, P['suit'], P['suitL'])
    c.layer(ellipse(24, 14 + hb, 7.6, 7.8), P['glass'], P['glassL'])
    face(c, hb + 1, P)
    c.layer(sympoly([(24, 6.6 + hb + 1), (21, 7 + hb + 1), (19.6, 9 + hb + 1), (19.4, 11.6 + hb + 1), (21, 10.4 + hb + 1), (24, 10 + hb + 1)]), P['hair'], P['hairL'])
    features(c, hb + 1, P, eyes='big', closed=blinking(t))
    # 面罩反光：斜向一道高光移动
    gx = 17 + (t % 16) // 2
    for k in range(3):
        if (gx + k, 8 + hb + k) in ellipse(24, 14 + hb, 7.6, 7.8):
            c.dots([(gx + k, 8 + hb + k)], P['glassH'])
    c.dots(line(18, 7 + hb, 21, 5 + hb), P['glassH'])
    c.dots([(24, 1 + hb), (24, 2 + hb)], P['orange'])
    return c
