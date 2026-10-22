"""全身立绘公共部件：画布尺寸、待机动画节奏、统一的头部比例与五官。

所有角色共用 48×96 单帧、16 帧循环（8 fps ≈ 2 秒）：
- 第 5~11 帧头肩下沉 1px（呼吸）
- 第 13 帧眨眼
- 衣带、发梢等用 sway() 做相位递进的摆动
"""
import math

import pix
from pix import Canvas, ellipse, line, mirror, poly, rect, sympoly, thick  # noqa: F401

pix.W, pix.H = 48, 96
FW, FH, N, FPS = 48, 96, 16, 8


def phase(t):
    return 2 * math.pi * t / N


def breath(t):
    return 1 if 5 <= t <= 11 else 0


def blinking(t):
    return t == 13


def sway(t, i, amp, lag=0.55, off=0.0):
    """第 i 个控制点的摆动量：越往末端相位越滞后。"""
    return amp * math.sin(phase(t) - i * lag + off)


def shift(pts, dy=0, dx=0):
    return [(x + dx, y + dy) for x, y in pts]


def fx(x):
    """像素列的左右镜像。"""
    return FW - 1 - x


def both(pts):
    """左侧像素点 + 镜像到右侧。"""
    return list(pts) + [(fx(x), y) for x, y in pts]


def tail(base, t, amp_step=0.35, amp_max=1.6, lag=0.55, off=0.0, axis='x'):
    """一条从根部向末端逐渐加大摆动的折线（飘带、发梢、尾巴）。"""
    out = []
    for i, (x, y) in enumerate(base):
        a = 0 if i == 0 else min(amp_max, amp_step * i)
        d = sway(t, i, a, lag, off)
        out.append((x + d, y) if axis == 'x' else (x, y + d))
    return out


FACE = [(24, 7.6), (21.6, 8.1), (20.1, 10), (19.7, 13), (20.2, 16), (21.4, 17.9), (23, 19.2), (24, 19.5)]


def face_mask(b):
    return sympoly(shift(FACE, b))


def face(c, b, P):
    """瓜子脸底形（五官在头发画完后用 features() 叠加，避免被发丝盖住）。"""
    c.layer(face_mask(b), P['skin'], P['skinL'])


def features(c, b, P, *, brows='willow', eyes='soft', blush=True, mark=None, closed=False):
    """五官。P 需要 lash/iris/irisL/brow/lip，可选 blush、liner。"""
    if brows == 'willow':
        c.dots(both([(20, 11 + b), (21, 11 + b)]), P['brow'])
    elif brows == 'sword':
        c.dots(both([(20, 10 + b), (21, 10 + b), (22, 11 + b)]), P['brow'])
    if eyes != 'none':
        if closed:
            c.dots(both([(20, 14 + b), (21, 14 + b), (22, 14 + b)]), P['lash'])
        else:
            c.dots(both([(20, 13 + b), (21, 13 + b), (22, 13 + b)]), P['lash'])
            c.dots(both([(21, 14 + b)]), P['iris'])
            c.dots(both([(22, 14 + b)]), P['irisL'])
            if eyes == 'fox':
                c.dots(both([(20, 14 + b)]), P['liner'])
            if eyes == 'big':
                c.dots(both([(21, 15 + b)]), P['iris'])
                c.dots(both([(22, 15 + b)]), P['iris'])
    if blush:
        c.dots(both([(20, 16 + b)]), P.get('blush', '#f4c4bf'))
    c.dots([(23, 17 + b), (24, 17 + b)], P['lip'])
    if mark:
        c.dots([(23, 9 + b), (24, 9 + b)], mark)


def strip_frames(frame):
    return [frame(t) for t in range(N)]


# ---------------------------------------------------------------------------
# 身体模板：同一套比例换配色，保证所有角色站在一起时协调
# ---------------------------------------------------------------------------

def blob(path, radii):
    """沿路径半径渐变的圆刷（尾巴、马尾、披风等蓬松形状）。"""
    out = set()
    for i in range(len(path) - 1):
        (x0, y0), (x1, y1) = path[i], path[i + 1]
        for k in range(9):
            u = k / 8
            x, y = x0 + (x1 - x0) * u, y0 + (y1 - y0) * u
            r = radii[i] + (radii[i + 1] - radii[i]) * u
            out |= {
                (px, py)
                for py in range(int(y - r - 1), int(y + r + 2))
                for px in range(int(x - r - 1), int(x + r + 2))
                if (px + 0.5 - x) ** 2 + (py + 0.5 - y) ** 2 <= r * r
            }
    return out


def neck(c, P, top=18, bottom=25):
    c.layer(rect(22, top, 25, bottom), P['skin'], P['skinL'])


def female_robe(c, t, P, *, sleeve='narrow', hem_from=87, knot=True):
    """女子长裙 + 交领 + 腰封 + 拢袖（白狐 / 云裳的身体）。

    P: robe/robeL/robeS、skirt（可选）、hem/hemL、inner、lapel、sash/sashL/sashS、cuff/cuffL、skin…
    """
    skirt = sympoly([(24, 38.5), (19.6, 39), (18.4, 46), (17.2, 58), (16, 70), (14.8, 82), (13.8, 92.5)])
    c.layer(skirt, P.get('skirt', P['robe']), P['robeL'])
    c.layer({(x, y) for (x, y) in skirt if y >= hem_from}, P['hem'], P['hemL'])
    for x0, x1 in ((21, 18), (27, 30)):
        c.dots(line(x0, 50, x1, hem_from - 2) & skirt, P['robeS'])
    c.dots([(21, 93), (22, 93), (25, 93), (26, 93)], P['hemL'])

    neck(c, P)
    torso = sympoly([(24, 23.2), (21.5, 23.4), (19.2, 24.3), (17.4, 26), (16.9, 29.5), (17.6, 34), (18.6, 39.5)])
    c.layer(torso, P['robe'], P['robeL'])
    c.layer(poly([(21.4, 23.6), (26.6, 23.6), (24, 31)]), P['inner'], None)
    for k in range(9):
        x = int(26.8 - k * 0.6)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], P['lapel'])
    for k in range(6):
        x = int(20.8 + k * 0.55)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], P['lapel'])
    c.layer(rect(19, 35, 28, 39) & (torso | skirt), P['sash'], P['sashL'])
    c.dots([(x, 37) for x in range(20, 28)], P['sashS'])
    if knot:
        k = tail([(24.5, 39.5), (24.2, 43), (23.8, 46.5)], t, 0.3, 0.7, off=0.4)
        c.dots(thick(k, 0.5), P['sashS'])

    hs = sway(t, 3, 0.5, off=0.6)
    if sleeve == 'wide':
        sl = poly([
            (17.8, 25.6), (16, 28), (14.9, 33), (14.1, 40), (13.4, 48), (13 + hs, 55),
            (13.8 + hs, 58), (16.2 + hs, 59.2), (18.8 + hs * 0.5, 58.2), (20.8, 54.5),
            (22.2, 48), (23.2, 44.6), (21.6, 42), (19.8, 37), (18.9, 31),
        ])
        cuff_from, hand_y = 56, 44
    else:
        sl = poly([
            (17.8, 25.6), (16, 28), (15, 33), (14.4, 40), (14, 47), (14.2 + hs, 52), (16.6 + hs, 53),
            (19 + hs * 0.5, 51.4), (21, 47), (23, 43.4), (21.4, 41), (19.8, 36), (18.9, 31),
        ])
        cuff_from, hand_y = 50, 43
    c.layer(sl, P['robe'], P['robeL'])
    c.layer(mirror(sl), P['robe'], P['robeL'])
    cuff = {(x, y) for (x, y) in sl | mirror(sl) if y >= cuff_from}
    c.layer(cuff, P['cuff'], P['cuffL'])
    c.dots(line(16, 33, 15, 47) & sl, P['robeS'])
    c.dots(mirror(line(16, 33, 15, 47) & sl), P['robeS'])
    c.dots([(23, hand_y), (24, hand_y), (23, hand_y + 1), (24, hand_y + 1)], P['skin'])
    return dict(torso=torso, skirt=skirt, sleeve=sl)


def male_robe(c, t, P, *, lower='robe', sleeve='narrow'):
    """男子长袍：下摆开衩 + 裤靴 + 腰带 + 垂袖（青锋的身体）。lower='hakama' 时为宽腿袴。"""
    if lower == 'hakama':
        hk = sympoly([(24, 38.5), (19, 39), (17.6, 52), (16.4, 70), (15.6, 91.5)])
        c.layer(hk, P['pants'], P['pantsL'])
        c.dots(line(23, 56, 23, 91) | line(24, 56, 24, 91), P['pantsL'])
        for x0, x1 in ((20, 18), (27, 29)):
            c.dots(line(x0, 42, x1, 90) & hk, P['pantsS'])
        c.dots([(18, 93), (19, 93), (20, 93), (21, 93), (26, 93), (27, 93), (28, 93), (29, 93)], P['boots'])
        c.dots([(19, 92), (20, 92), (27, 92), (28, 92)], P.get('sock', '#f4f1ea'))
    else:
        for x0 in (19, 25):
            c.layer(rect(x0, 82, x0 + 3, 90), P['pants'], P['pantsL'])
            c.layer(rect(x0, 89, x0 + 3, 93) | {(x0 + (-1 if x0 < 24 else 4), 93)}, P['boots'], P['bootsL'])
        lowr = sympoly([(24, 38.5), (18.8, 39), (18, 50), (17.3, 62), (16.8, 74), (16.3, 86.5)])
        c.layer(lowr, P['robe'], P['robeL'])
        c.dots(line(23, 58, 23, 86) & lowr, P['robeL'])
        c.dots(line(20, 46, 18, 84) & lowr, P['robeS'])
        c.dots({(x, y) for (x, y) in lowr if y >= 84}, P['trim'])

    neck(c, P)
    torso = sympoly([(24, 23), (21, 23.2), (18.2, 24.2), (16.2, 26), (15.8, 30), (16.6, 35), (17.8, 39.5)])
    c.layer(torso, P['robe'], P['robeL'])
    c.layer(poly([(21.4, 23.4), (26.6, 23.4), (24, 31)]), P['inner'], None)
    for k in range(9):
        x = int(26.8 - k * 0.6)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], P['trim'])
    for k in range(6):
        x = int(20.8 + k * 0.55)
        c.dots([(x, 23 + k), (x + 1, 23 + k)], P['trim'])
    c.dots(line(18, 28, 18, 36) & torso, P['robeS'])
    c.layer(rect(18, 37, 29, 40) & (torso | sympoly([(24, 36), (18, 36), (18, 41)])), P['belt'], P['robeL'])

    if sleeve == 'wide':
        hs = sway(t, 3, 0.5, off=0.6)
        sl = poly([
            (17, 25.4), (14.6, 28), (13.2, 34), (12.4, 42), (11.8, 50), (11.6 + hs, 56),
            (13 + hs, 58.6), (16.4 + hs, 58.8), (17.4, 52), (17.6, 44), (18, 34),
        ])
        cuff_from, hand = 56, {(13, 59), (14, 59), (15, 59), (14, 60), (15, 60)}
    else:
        sl = poly([(16.8, 25.6), (14.9, 28), (13.9, 34), (13.3, 42), (12.9, 50), (13, 53), (16.8, 53), (17.1, 47), (17.6, 39), (18, 31)])
        cuff_from, hand = 51, {(13, 54), (14, 54), (15, 54), (14, 55), (15, 55)}
    c.layer(sl, P['robe'], P['robeL'])
    c.layer(mirror(sl), P['robe'], P['robeL'])
    cuff = {(x, y) for (x, y) in sl if y >= cuff_from}
    c.dots(cuff | mirror(cuff), P['trim'])
    c.dots(line(15, 31, 14, 49) & sl, P['robeS'])
    c.dots(hand | mirror(hand), P['skin'])
    return dict(torso=torso, sleeve=sl)


def front_locks(c, b, P, to=31, sheen=True):
    """两侧垂到胸前的长发帘。"""
    lock = poly(shift([
        (23.6, 6.4), (20.6, 7.2), (18.8, 9.6), (18.1, 13.6), (17.9, 18.4), (17.6, 23.4),
        (17.3, to - 3), (17.4, to), (18.6, to - 2), (19.2, to - 6), (19.7, 20), (19.9, 16),
        (20.2, 12.4), (21.1, 9.6), (23.1, 8.2),
    ], b))
    c.layer(lock, P['hair'], P['hairL'])
    c.layer(mirror(lock), P['hair'], P['hairL'])
    if sheen:
        c.dots(shift([(19, 12), (19, 13), (19, 14), (18, 20), (18, 21)], b), P['sheen'])


def back_hair(c, b, P, to=28, width=0.0):
    w = width
    c.layer(sympoly(shift([(24, 4.6), (20, 5.4), (17.8 - w * 0.3, 8), (17 - w * 0.6, 12), (16.8 - w, 18), (17 - w, 24), (18 - w, to)], b)), P['hair'], P['hairL'])


# 统一的肤色与五官配色（各角色可覆盖）
SKIN = dict(
    skin='#f8e6db', skinL='#d6a796', skinS='#efd0c2', blush='#f4c4bf',
    lash='#2b2030', iris='#4c3346', irisL='#9a7c92', brow='#6a5660', lip='#d9737c',
)


def pal(**kw):
    """肤色默认值 + 角色自己的配色。"""
    return dict(SKIN, **kw)


def star5(c, cx, cy, col, colL):
    """5×5 小星星。"""
    c.dots([(cx, cy - 2), (cx - 1, cy - 1), (cx, cy - 1), (cx + 1, cy - 1)], col)
    c.dots([(x, cy) for x in range(cx - 2, cx + 3)], col)
    c.dots([(cx - 1, cy + 1), (cx + 1, cy + 1), (cx - 2, cy + 2), (cx + 2, cy + 2)], colL)
    c.dots([(cx, cy + 1)], col)


def flower(c, x, y, petal, center, dark=None):
    c.dots([(x, y - 1), (x - 1, y), (x + 1, y), (x, y + 1)], petal)
    if dark:
        c.dots([(x - 1, y + 1), (x + 1, y - 1)], dark)
    c.dots([(x, y)], center)
