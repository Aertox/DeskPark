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
