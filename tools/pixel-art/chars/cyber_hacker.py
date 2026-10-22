"""霓虹黑客（像素头像 cyber-hacker 的全身像）：紫色连帽衫、绿色护目镜，身旁浮着一块滚动代码的全息屏。"""
from kit import FH, FW, Canvas, breath, face, features, line, mirror, pal, poly, rect, shift, sympoly

META = dict(id='cyber-hacker', avatar='cyber-hacker', name='霓虹黑客', group='赛博朋克', face=[14, 1, 20], bg='#9ef0d0')

P = pal(
    skin='#f2d2b8', skinL='#c9977e', skinS='#e6bea4',
    hood='#3d2b6e', hoodL='#16131f', hoodS='#55419a', hoodD='#291c4f',
    visor='#3dffa8', visorL='#178a5c', visorG='#eafff5', pink='#ff4fc3',
    jeans='#2a3350', jeansL='#121624', jeansS='#3b4770', shoe='#eafff5', shoeL='#7a8a92',
    holo='#3dffa8', holoD='#1d6e50', holoBg='#123a30',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 裤子与球鞋
    leg = poly([(19.4, 50), (23.7, 50), (23.4, 70), (23, 88), (19.8, 88), (19.4, 70)])
    for m in (leg, mirror(leg)):
        c.layer(m, P['jeans'], P['jeansL'])
    c.dots(line(20, 54, 20, 86) | line(27, 54, 27, 86), P['jeansS'])
    shoe = rect(18, 88, 23, 92)
    for m in (shoe, mirror(shoe)):
        c.layer(m, P['shoe'], P['shoeL'])
    c.dots([(x, 93) for x in list(range(18, 24)) + list(range(24, 30))], P['visor'])
    # 连帽衫
    neck_top = 18
    c.layer(rect(22, neck_top, 25, 25), P['skin'], P['skinL'])
    body = sympoly([(24, 22.6), (21, 23), (18.4, 24), (16.6, 26), (16, 31), (16.4, 40), (16.6, 50), (17, 53.4)])
    c.layer(body, P['hood'], P['hoodL'])
    c.layer(rect(19, 43, 28, 49), P['hoodD'], P['hoodL'])
    c.dots(line(17, 51, 30, 51), P['hoodD'])
    c.dots(line(22, 24, 22, 32) | line(25, 24, 25, 31), P['pink'])
    c.dots([(22, 33), (25, 32)], P['visorG'])
    sl = poly([(17, 25), (15, 28), (14.2, 34), (14.4, 42), (16.8, 47), (19.8, 47.4), (19.8, 44), (18, 40), (17.6, 33)])
    for m in (sl, mirror(sl)):
        c.layer(m, P['hood'], P['hoodL'])
    c.dots(line(15, 31, 15, 41) | line(32, 31, 32, 41), P['hoodS'])
    # 全息屏：浮在身侧，代码逐行滚动
    fy = 36 + (1 if 4 <= t <= 11 else 0)
    c.layer(rect(34, fy, 41, fy + 7), P['holoBg'], P['holoD'])
    for k in range(3):
        y = fy + 2 + k * 2
        w = (t + k * 3) % 5 + 1
        c.dots([(35 + i, y) for i in range(w)], P['holo'])
    c.dots([(37, fy + 8), (38, fy + 9)], P['holoD'])
    # 兜帽
    hood = sympoly(shift([(24, 3.4), (20, 4), (17.2, 6.6), (16, 11.4), (16, 17), (17, 21.6), (19.4, 24), (21.4, 22.6)], b))
    c.layer(hood, P['hood'], P['hoodL'])
    face(c, b, P)
    brim = sympoly(shift([(24, 5.6), (21, 6), (19, 7.6), (18.4, 10.6), (19.4, 13), (20, 10.4), (21.6, 9), (24, 8.6)], b))
    c.layer(brim, P['hoodD'], P['hoodL'])
    c.dots(shift([(20, 6), (21, 5), (22, 5)], b), P['hoodS'])
    features(c, b, P, brows='none', eyes='none', blush=False)
    # 护目镜（反光点左右移动）
    c.layer(rect(19, 12 + b, 28, 14 + b), P['visor'], P['visorL'])
    gx = 20 + (t // 2) % 8
    c.dots([(gx, 12 + b), (gx + 1, 13 + b)], P['visorG'])
    return c
