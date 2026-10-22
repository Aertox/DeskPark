"""猪小侠（像素头像 hero-pig 的全身像）：粉色小猪戴蓝色眼罩，红色战衣黄腰带，披风猎猎飘动。"""
from kit import FH, FW, Canvas, blinking, breath, ellipse, line, mirror, pal, poly, rect, sympoly, tail, thick

META = dict(id='hero-pig', avatar='hero-pig', name='猪小侠', group='卡通', face=[12, 34, 24], bg='#bfe0ff')

P = pal(
    pig='#ffb3c6', pigL='#a8445f', pigS='#f08aa6', snout='#ff8fb0', nostril='#a8445f',
    mask='#2f6fd6', maskL='#173a7a', white='#ffffff', pupil='#3a1f2b',
    suit='#e0453a', suitL='#7e1e18', suitS='#f26a5e', belt='#ffd34d', beltL='#a8841c',
    cape='#a8262a', capeL='#4e0e12', capeS='#c8403e',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 披风：从肩后垂下，下摆向右飘
    left = tail([(18, 56), (15.4, 64), (13.6, 72), (12.6, 80), (12.4, 87)], t, 0.4, 1.8, lag=0.5)
    right = tail([(30, 56), (33, 64), (35.4, 71), (37.6, 78), (39.6, 84)], t, 0.4, 2.2, lag=0.5, off=0.8)
    cape = poly(left + right[::-1])
    c.layer(cape, P['cape'], P['capeL'])
    c.dots(line(24, 60, 26, 86) & cape, P['capeS'])
    # 腿 + 红靴
    for x0 in (19, 25):
        c.layer(rect(x0, 74, x0 + 3, 86), P['pig'], P['pigL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 85, x0 + (3 if x0 < 24 else 4), 92), P['suit'], P['suitL'])
    # 身体战衣
    body = sympoly([(24, 54), (20.6, 54.4), (18.4, 56.4), (17.6, 61), (17.8, 68), (18.6, 75)])
    c.layer(body, P['suit'], P['suitL'])
    c.layer(rect(18, 68, 29, 70), P['belt'], P['beltL'])
    c.dots([(23, 61), (24, 61), (22, 62), (25, 62), (23, 63), (24, 63)], P['belt'])
    # 手臂：握拳叉腰
    arm = thick([(18.4, 57), (15.6, 61), (16.6, 66)], 1.4)
    c.layer(arm, P['suit'], P['suitL'])
    c.layer(mirror(arm), P['suit'], P['suitL'])
    fist = ellipse(17.6, 67, 1.6, 1.6)
    c.layer(fist | mirror(fist), P['pig'], P['pigL'])
    # 头
    hy = 45 + b
    for side in (0, 1):
        ear = poly([(16.4, hy - 4), (15.6, hy - 10), (21, hy - 7)])
        c.layer(mirror(ear) if side else ear, P['pig'], P['pigL'])
    head = ellipse(24, hy, 9.4, 8.4)
    c.layer(head, P['pig'], P['pigL'])
    c.layer(rect(15, hy - 3, 32, hy), P['mask'], P['maskL'])
    for ex in (19, 27):
        if blinking(t):
            c.dots([(ex, hy - 1), (ex + 1, hy - 1)], P['pupil'])
        else:
            c.dots([(ex, hy - 2), (ex + 1, hy - 2), (ex, hy - 1)], P['white'])
            c.dots([(ex + 1, hy - 1)], P['pupil'])
    # 眼罩飘带
    c.dots(thick(tail([(32, hy - 2), (35, hy - 1), (38, hy + 1), (40, hy + 3)], t, 0.5, 1.4), 0.6), P['mask'])
    c.layer(ellipse(24, hy + 3.6, 3.6, 2.4), P['snout'], P['pigL'])
    c.dots([(22, hy + 3), (25, hy + 3)], P['nostril'])
    c.dots([(17, hy + 3), (31, hy + 3)], P['pigS'])
    return c
