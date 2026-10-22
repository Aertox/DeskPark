"""青蛙呱呱（像素头像 cute-frog 的全身像）：圆眼青蛙撑着一片荷叶伞，鼓鼓的腮帮一起一伏。"""
from kit import FH, FW, Canvas, blinking, breath, ellipse, line, mirror, pal, rect, thick

META = dict(id='cute-frog', avatar='cute-frog', name='青蛙呱呱', group='卡通', face=[12, 42, 24], bg='#bfe9ff')

P = pal(
    frog='#7ed957', frogL='#1f3a1a', frogS='#5ab33d', belly='#d8f5b0', white='#ffffff', pupil='#1f3a1a',
    pink='#ff9fb0', mouth='#e2556a', leaf='#4caf50', leafL='#1f5a22', leafS='#7ed36e', stem='#3a7a30',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 荷叶伞
    c.layer(thick([(33, 72), (33, 40)], 0.7), P['stem'], P['leafL'])
    ly = 38 + (1 if 4 <= t <= 11 else 0)
    leaf = ellipse(33, ly, 11, 4.4) - {(x, y) for x in range(48) for y in range(ly + 1, 96)}
    c.layer(leaf, P['leaf'], P['leafL'])
    for k in (-6, -2, 2, 6):
        c.dots(line(33, ly - 1, 33 + k, ly - 3) & leaf, P['leafS'])
    c.dots([(x, ly + 1) for x in range(22, 45, 3)], P['leafL'])
    # 腿：蹲坐，大脚掌
    for side in (0, 1):
        leg = ellipse(17.6, 84, 4.6, 5.4)
        foot = ellipse(15.6, 91.4, 4.4, 1.8)
        c.layer(mirror(leg) if side else leg, P['frog'], P['frogL'])
        c.layer(mirror(foot) if side else foot, P['frogS'], P['frogL'])
    # 身体
    body = ellipse(24, 78, 9.4, 11)
    c.layer(body, P['frog'], P['frogL'])
    c.layer(ellipse(24, 81, 5.6, 7.6) & body, P['belly'], P['frogS'])
    c.layer(thick([(17, 73), (15.6, 79), (17.4, 82)], 1.4), P['frog'], P['frogL'])
    c.layer(thick([(31, 72), (32.6, 72), (33, 70)], 1.4), P['frog'], P['frogL'])
    # 头：两只大眼睛顶在头上
    hy = 62 + b
    head = ellipse(24, hy, 11, 7.4)
    c.layer(head, P['frog'], P['frogL'])
    for ex in (17.4, 30.6):
        c.layer(ellipse(ex, hy - 6, 3.6, 3.4), P['frog'], P['frogL'])
        if blinking(t):
            c.dots([(round(ex) - 1, hy - 6), (round(ex), hy - 6)], P['pupil'])
        else:
            c.layer(ellipse(ex, hy - 6, 2.4, 2.2), P['white'], None)
            c.dots([(round(ex), hy - 6), (round(ex), hy - 5)], P['pupil'])
    puff = 1 if t % 8 < 3 else 0
    c.dots([(x, hy + 3) for x in range(18, 30)], P['mouth'])
    c.dots([(x, hy + 4) for x in range(20, 28)] if puff else [(x, hy + 4) for x in range(21, 27)], P['pink'] if puff else P['frogS'])
    c.dots([(15, hy + 1), (16, hy + 1), (31, hy + 1), (32, hy + 1)], P['pink'])
    return c
