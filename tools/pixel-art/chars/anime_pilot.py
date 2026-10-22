"""机甲驾驶员（像素头像 anime-pilot 的全身像）：白色驾驶服配橙色与深蓝装甲片，头盔护目镜反光，胸口指示灯闪烁。"""
from kit import FH, FW, Canvas, breath, ellipse, line, mirror, pal, poly, rect, shift, sympoly

META = dict(id='anime-pilot', avatar='anime-pilot', name='机甲驾驶员', group='动漫', face=[14, 1, 20], bg='#bde0fe')

P = pal(
    suit='#eef1f6', suitL='#7d8698', suitS='#bcc5d3', navy='#3d5a80', navyL='#1d2c42',
    orange='#ff9a3c', orangeL='#c65d16', red='#ff6b4a', visor='#ff9a3c', visorL='#8a3c0e', visorG='#fff3e0',
    light='#3ee6ff', lightD='#1a6e80',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 背包推进器
    c.layer(rect(16, 26, 31, 38), P['navy'], P['navyL'])
    c.dots([(16, 39), (17, 40), (30, 39), (31, 40)], P['orange'] if t % 4 < 2 else P['red'])
    # 腿
    leg = poly([(19.2, 44), (23.7, 44), (23.6, 66), (23.2, 86), (19.4, 86), (19, 66)])
    for m in (leg, mirror(leg)):
        c.layer(m, P['suit'], P['suitL'])
    knee = rect(19, 62, 23, 66)
    for m in (knee, mirror(knee)):
        c.layer(m, P['navy'], P['navyL'])
    boot = rect(18, 84, 23, 93)
    for m in (boot, mirror(boot)):
        c.layer(m, P['navy'], P['navyL'])
    c.dots([(x, 86) for x in list(range(19, 23)) + list(range(25, 29))], P['orange'])
    # 躯干
    c.layer(rect(22, 18, 25, 25), P['suit'], P['suitL'])
    torso = sympoly([(24, 22.6), (21, 23), (18.4, 24), (16.8, 26), (16.6, 31), (17.6, 38), (18.6, 45)])
    c.layer(torso, P['suit'], P['suitL'])
    chest = sympoly([(24, 25), (21, 25.2), (19, 26.4), (19.2, 31), (21.4, 33), (24, 33.4)])
    c.layer(chest, P['navy'], P['navyL'])
    c.dots([(23, 29), (24, 29)], P['light'] if t % 8 < 5 else P['lightD'])
    c.layer(rect(19, 39, 28, 41), P['orange'], P['orangeL'])
    c.dots(line(20, 34, 19, 38) | line(27, 34, 28, 38), P['suitS'])
    # 手臂
    sl = poly([(17.4, 24.6), (15.2, 26.6), (14.2, 32), (14, 40), (14.4, 47), (17.4, 47.2), (17.6, 40), (17.8, 31)])
    for m in (sl, mirror(sl)):
        c.layer(m, P['suit'], P['suitL'])
    pad = ellipse(16.2, 26.6, 2.6, 2.2)
    for m in (pad, mirror(pad)):
        c.layer(m, P['orange'], P['orangeL'])
    glove = rect(14, 46, 17, 49)
    for m in (glove, mirror(glove)):
        c.layer(m, P['navy'], P['navyL'])
    # 头盔
    helm = ellipse(24, 12 + b, 8, 8.6)
    c.layer(helm, P['suit'], P['suitL'])
    c.dots(shift([(x, 4) for x in range(22, 26)] + [(23, 3), (24, 3)], b), P['red'])
    c.layer(rect(18, 10 + b, 29, 16 + b), P['visor'], P['visorL'])
    c.dots(shift(line(19, 10, 28, 10), b), P['orangeL'])
    gx = 19 + (t // 2) % 9
    c.dots([(gx, 12 + b), (gx + 1, 11 + b), (gx, 13 + b)], P['visorG'])
    c.dots(shift([(16, 12), (16, 13), (31, 12), (31, 13)], b), P['navy'])
    c.layer(rect(20, 18 + b, 27, 20 + b), P['suitS'], P['suitL'])
    return c
