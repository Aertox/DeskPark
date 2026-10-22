"""熊猫团团（像素头像 cute-panda 的全身像）：圆滚滚的熊猫抱着一根竹子，竹叶轻摇。"""
from kit import FH, FW, Canvas, blinking, breath, ellipse, line, mirror, pal, rect, tail, thick

META = dict(id='cute-panda', avatar='cute-panda', name='熊猫团团', group='卡通', face=[12, 38, 24], bg='#c8f0c0')

P = pal(
    white='#fbfbf6', whiteL='#8a8a86', whiteS='#e2e2da', black='#2e2e36', blackL='#141418',
    pink='#ffb3c1', bamboo='#7cc96a', bambooL='#3a7a30', bambooS='#a6e090', leaf='#5cb84a',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 竹子（在身后，斜靠肩上）
    c.layer(thick([(30, 92), (34, 44)], 1.2), P['bamboo'], P['bambooL'])
    for y in (54, 64, 74, 84):
        x = round(30 + (92 - y) / 48 * 4)
        c.dots([(x - 1, y), (x, y), (x + 1, y)], P['bambooL'])
    lf = thick(tail([(34, 45), (37, 42), (40, 41), (42.6, 42)], t, 0.5, 1.2), 0.7)
    lf2 = thick(tail([(34, 47), (36.6, 49), (39, 51.6)], t, 0.5, 1.0, off=1.4), 0.7)
    c.dots(lf | lf2, P['leaf'])
    # 腿
    for x0 in (17, 26):
        c.layer(ellipse(x0 + 2.4, 88.6, 3.6, 4.2), P['black'], P['blackL'])
    # 身体
    body = ellipse(24, 76, 9.6, 11)
    c.layer(body, P['white'], P['whiteL'])
    c.dots({(x, y) for (x, y) in body if y > 80 and abs(x - 23.5) < 5} - {(x, y) for (x, y) in body if y > 85}, P['whiteS'])
    # 手臂：左臂抱竹，右臂垂下
    c.layer(thick([(17, 70), (15.4, 76), (17.6, 80)], 2.0), P['black'], P['blackL'])
    c.layer(thick([(31, 70), (32.8, 72), (31.4, 74.6)], 2.0), P['black'], P['blackL'])
    # 头
    hy = 56 + b
    for ex in (16.6, 31.4):
        c.layer(ellipse(ex, hy - 7, 3, 3), P['black'], P['blackL'])
    head = ellipse(24, hy, 10, 8.6)
    c.layer(head, P['white'], P['whiteL'])
    for side in (0, 1):
        patch = ellipse(19.6, hy - 0.4, 2.6, 2.2)
        c.layer(mirror(patch) if side else patch, P['black'], P['blackL'])
    for ex in (19, 28):
        if blinking(t):
            c.dots([(ex, hy), (ex + 1, hy)], P['white'])
        else:
            c.dots([(ex + (1 if ex < 24 else 0), hy - 1), (ex, hy)], P['white'])
    c.dots([(23, hy + 3), (24, hy + 3)], P['black'])
    c.dots([(22, hy + 5), (23, hy + 4), (24, hy + 4), (25, hy + 5)], P['blackL'])
    c.dots([(16, hy + 3), (17, hy + 3), (30, hy + 3), (31, hy + 3)], P['pink'])
    return c
