"""小幽灵（像素头像 cute-ghost 的全身像）：飘在半空、上下浮动的小幽灵，下摆波浪轻轻翻动。"""
import math

from kit import FH, FW, Canvas, blinking, ellipse, mirror, pal, phase, rect, thick

META = dict(id='cute-ghost', avatar='cute-ghost', name='小幽灵', group='卡通', face=[12, 40, 24], bg='#2f3561')

P = pal(ghost='#f5f7ff', ghostL='#7a80a8', ghostS='#d9def5', eye='#3b3f63', blue='#9fb4ff', pink='#ff7a9c')


def frame(t):
    c = Canvas(FW, FH)
    fy = round(3 * math.sin(phase(t)))  # 上下漂浮
    top = 52 + fy
    body = ellipse(24, top + 10, 11, 10.6) | rect(13, top + 10, 34, top + 26)
    # 波浪下摆
    wave = t // 2 % 2
    for i, x0 in enumerate(range(13, 35, 4)):
        if (i + wave) % 2 == 0:
            body -= {(x, top + 26) for x in range(x0, x0 + 2)}
            body -= {(x, top + 25) for x in range(x0, x0 + 1)}
        else:
            body |= {(x, top + 27) for x in range(x0 + 1, x0 + 3)}
    c.layer(body, P['ghost'], P['ghostL'])
    c.dots({(x, y) for (x, y) in body if x >= 30 and top + 6 < y < top + 24}, P['ghostS'])
    # 小手
    for side in (0, 1):
        hand = thick([(13, top + 15), (10.6, top + 17 + (1 if t % 8 < 4 else 0))], 1.2)
        c.layer(mirror(hand) if side else hand, P['ghost'], P['ghostL'])
    # 脸
    for ex in (19, 28):
        if blinking(t):
            c.dots([(ex, top + 10), (ex + 1, top + 10)], P['eye'])
        else:
            c.dots([(ex, top + 8), (ex + 1, top + 8), (ex, top + 9), (ex + 1, top + 9), (ex, top + 10), (ex + 1, top + 10)], P['eye'])
            c.dots([(ex, top + 8)], P['ghost'])
    c.dots([(17, top + 12), (18, top + 12), (29, top + 12), (30, top + 12)], P['blue'])
    c.dots([(23, top + 13), (24, top + 13), (23, top + 14), (24, top + 14)], P['pink'])
    return c
