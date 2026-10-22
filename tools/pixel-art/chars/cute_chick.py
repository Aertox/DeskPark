"""小鸡叽叽（像素头像 cute-chick 的全身像）：圆滚滚的小黄鸡，时不时扑扇小翅膀、蹦一下。"""
from kit import FH, FW, Canvas, blinking, ellipse, mirror, pal, poly, rect

META = dict(id='cute-chick', avatar='cute-chick', name='小鸡叽叽', group='卡通', face=[12, 54, 24], bg='#bfe0ff')

P = pal(yellow='#ffd84a', yellowL='#8a6410', yellowS='#f0b51f', yellowH='#fff0a0', beak='#ff8f3c', beakL='#b8561c', eye='#4a3410', pink='#ffa3a3')


def frame(t):
    c = Canvas(FW, FH)
    hop = 2 if t in (6, 7) else (1 if t in (5, 8) else 0)
    cy = 76 - hop
    # 小脚
    for x0 in (20, 26):
        c.dots([(x0, 91), (x0 + 1, 91), (x0, 92), (x0 - 1, 93), (x0, 93), (x0 + 1, 93), (x0 + 2, 93)], P['beak'])
    # 身体
    body = ellipse(24, cy, 12, 13.4)
    c.layer(body, P['yellow'], P['yellowL'])
    c.dots({(x, y) for (x, y) in body if x >= 31 and y > cy - 4} - {(x, y) for (x, y) in body if x >= 35}, P['yellowS'])
    c.dots([(18, cy - 9), (19, cy - 10), (20, cy - 10)], P['yellowH'])
    # 头顶呆毛
    c.layer(poly([(23, cy - 12.6), (23.4, cy - 17), (25.6, cy - 15), (25, cy - 12.6)]), P['yellow'], P['yellowL'])
    # 翅膀：扑扇
    flap = -3 if t in (10, 11, 12) else 0
    wing = poly([(12.6, cy + 1), (9.4, cy + 4 + flap), (10, cy + 8 + flap), (13.4, cy + 7)])
    c.layer(wing, P['yellowS'], P['yellowL'])
    c.layer(mirror(wing), P['yellowS'], P['yellowL'])
    # 脸
    for ex in (19, 28):
        if blinking(t):
            c.dots([(ex, cy - 3), (ex + 1, cy - 3)], P['eye'])
        else:
            c.dots([(ex, cy - 4), (ex + 1, cy - 4), (ex, cy - 3), (ex + 1, cy - 3)], P['eye'])
            c.dots([(ex, cy - 4)], '#ffffff')
    c.layer(poly([(21.6, cy - 1), (26.4, cy - 1), (24, cy + 2.4)]), P['beak'], P['beakL'])
    c.dots([(16, cy), (17, cy), (31, cy), (32, cy)], P['pink'])
    return c
