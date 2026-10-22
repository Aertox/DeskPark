"""赛博猫（像素头像 cyber-cat 的全身像）：直立的灰猫，粉色护目镜、深色夹克青色领口，尾巴带发光环。"""
from kit import FH, FW, Canvas, blob, breath, ellipse, line, mirror, pal, poly, rect, sympoly, tail

META = dict(id='cyber-cat', avatar='cyber-cat', name='赛博猫', group='赛博朋克', face=[12, 30, 24], bg='#ffd36e')

P = pal(
    fur='#9aa0b5', furL='#4a4f63', furS='#727892', furH='#c4c9d8', nose='#ffb3c7',
    visor='#ff4fd8', visorL='#8e1f7a', visorG='#ffe6fa',
    jacket='#22263a', jacketL='#0c0e18', jacketS='#353b58', cyan='#3ee6ff',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 尾巴：带一圈发光环，向右上翘起摆动
    path = tail([(27, 76), (32, 78), (36, 74), (38, 67), (37.6, 60), (35.6, 55)], t, 0.35, 1.6, lag=0.5)
    tl = blob(path, [1.6, 1.8, 1.8, 1.7, 1.6, 1.3])
    c.layer(tl, P['fur'], P['furL'])
    ring = blob(path[3:5], [1.8, 1.7])
    c.dots({p for p in ring & tl if abs(p[1] - round((path[3][1] + path[4][1]) / 2)) <= 0}, P['cyan'] if t % 8 < 6 else P['furS'])
    # 腿与爪
    for x0 in (19, 25):
        c.layer(rect(x0, 72, x0 + 3, 90), P['fur'], P['furL'])
        c.layer(ellipse(x0 + 1.6 + (-0.6 if x0 < 24 else 0.6), 91.6, 2.6, 1.8), P['furH'], P['furL'])
    # 脖子
    c.layer(rect(20, 47, 27, 53), P['fur'], P['furL'])
    # 夹克
    body = sympoly([(24, 51.4), (20.4, 51.8), (18, 53.6), (17.2, 58), (17.4, 66), (18.2, 73.4)])
    c.layer(body, P['jacket'], P['jacketL'])
    c.dots(line(24, 55, 24, 72), P['jacketL'])
    c.dots(line(20, 55, 19, 70), P['jacketS'])
    c.dots([(x, 52) for x in range(20, 28)] + [(x, 53) for x in range(21, 27)], P['cyan'])
    # 手臂（毛茸茸的爪子从袖口露出）
    sl = poly([(18.4, 53.4), (16, 55.6), (15, 60), (14.8, 66), (17.8, 66.4), (18.2, 60)])
    for m in (sl, mirror(sl)):
        c.layer(m, P['jacket'], P['jacketL'])
    paw = ellipse(16.4, 67.6, 1.8, 1.6)
    for m in (paw, mirror(paw)):
        c.layer(m, P['furH'], P['furL'])
    # 头：圆脸 + 尖耳
    hy = 42 + b
    ear = poly([(16.4, hy - 2), (17, hy - 10.6), (22, hy - 6)])
    for m in (ear, mirror(ear)):
        c.layer(m, P['fur'], P['furL'])
    c.dots(poly([(17.6, hy - 4), (18, hy - 8.4), (20.6, hy - 6)]) | mirror(poly([(17.6, hy - 4), (18, hy - 8.4), (20.6, hy - 6)])), P['nose'])
    head = ellipse(24, hy, 8.6, 7.4)
    c.layer(head, P['fur'], P['furL'])
    c.dots({(x, y) for (x, y) in head if y >= hy + 3 and 19 <= x <= 28} - {(x, y) for (x, y) in head if y >= hy + 6}, P['furH'])
    c.dots([(x, hy - 6) for x in (22, 23, 24, 25)] + [(23, hy - 7), (24, hy - 7)], P['furS'])
    # 护目镜（扫描光点）
    c.layer(rect(17, hy - 2, 30, hy + 1), P['visor'], P['visorL'])
    gx = 18 + (t % 12)
    c.dots([(gx, hy - 1), (gx, hy)], P['visorG'])
    # 鼻子、嘴、胡须
    c.dots([(23, hy + 3), (24, hy + 3)], P['nose'])
    c.dots([(22, hy + 5), (23, hy + 4), (24, hy + 4), (25, hy + 5)], P['furL'])
    c.dots(line(13, hy + 3, 18, hy + 4) | line(29, hy + 4, 34, hy + 3), P['furH'])
    return c
