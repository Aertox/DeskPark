"""机器人铁蛋（像素头像 cute-robot 的全身像）：方头方脑的小机器人，天线红灯闪烁，眼睛扫描。"""
from kit import FH, FW, Canvas, blinking, breath, ellipse, line, mirror, pal, rect, thick

META = dict(id='cute-robot', avatar='cute-robot', name='机器人铁蛋', group='卡通', face=[12, 30, 24], bg='#ffd9a6')

P = pal(
    metal='#c9d0dc', metalL='#4a5266', metalS='#9aa3b5', metalH='#e6eaf0', dark='#22283a',
    eye='#3ee6ff', eyeD='#1a6e80', red='#ff5f5f', redD='#8a2a2a', yellow='#ffd34d', joint='#7d879c',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 腿与脚
    for x0 in (19, 25):
        c.layer(rect(x0, 76, x0 + 3, 88), P['joint'], P['metalL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 87, x0 + (3 if x0 < 24 else 4), 93), P['metal'], P['metalL'])
    # 身体
    body = rect(16, 54, 31, 77)
    c.layer(body, P['metal'], P['metalL'])
    c.layer(rect(19, 58, 28, 66), P['dark'], P['metalL'])
    for i, x in enumerate((20, 23, 26)):
        on = (t // 2 + i) % 3 == 0
        c.dots([(x, 61), (x + 1, 61), (x, 62), (x + 1, 62)], P['eye'] if on else P['eyeD'])
    c.dots([(20, 70), (21, 70), (26, 70), (27, 70)], P['yellow'])
    c.dots(line(17, 55, 17, 75), P['metalH'])
    # 手臂：钳子手，右臂挥动
    wave = 1 if 4 <= t <= 11 else 0
    c.layer(thick([(15, 57), (12.6, 63), (12.6, 69)], 1.3), P['joint'], P['metalL'])
    c.layer(ellipse(12.6, 71, 2, 1.8), P['metal'], P['metalL'])
    c.layer(thick([(32, 57), (35, 61 - wave * 2), (36, 66 - wave * 5)], 1.3), P['joint'], P['metalL'])
    c.layer(ellipse(36, 67.6 - wave * 5, 2, 1.8), P['metal'], P['metalL'])
    # 头
    hy = 36 + b
    c.layer(rect(21, hy + 14, 26, hy + 18), P['joint'], P['metalL'])
    head = rect(14, hy, 33, hy + 15)
    c.layer(head, P['metal'], P['metalL'])
    c.dots(line(15, hy + 1, 32, hy + 1), P['metalH'])
    c.layer(rect(16, hy + 4, 31, hy + 10), P['dark'], P['metalL'])
    scan = t % 8
    for ex in (18, 26):
        if blinking(t):
            c.dots([(ex, hy + 7), (ex + 1, hy + 7), (ex + 2, hy + 7)], P['eye'])
        else:
            c.layer(rect(ex, hy + 5, ex + 2, hy + 8), P['eye'], P['eyeD'])
            c.dots([(ex + scan % 3, hy + 6)], '#ffffff')
    c.dots([(x, hy + 12) for x in range(20, 28)], P['metalS'])
    c.dots([(13, hy + 6), (13, hy + 7), (13, hy + 8), (34, hy + 6), (34, hy + 7), (34, hy + 8)], P['joint'])
    # 天线
    c.dots(line(24, hy - 1, 24, hy - 5), P['metalL'])
    c.layer(ellipse(24.5, hy - 6.4, 1.6, 1.6), P['red'] if t % 4 < 2 else P['redD'], P['metalL'])
    return c
