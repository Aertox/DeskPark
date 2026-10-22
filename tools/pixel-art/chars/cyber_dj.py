"""电音少女（像素头像 cyber-dj 的全身像）：粉蓝双色发、黄色耳机，短夹克 + 百褶裙，随节拍轻点头，身旁跳动的均衡器。"""
from kit import FH, FW, Canvas, back_hair, blinking, breath, face, features, line, mirror, pal, poly, rect, shift, sympoly

META = dict(id='cyber-dj', avatar='cyber-dj', name='电音少女', group='赛博朋克', face=[14, 1, 20], bg='#cbbcff')

P = pal(
    hair='#ff6ec7', hairL='#9a2c70', hair2='#3ee6ff', hair2L='#167f92', sheen='#ffb0e0',
    phone='#33334d', phoneL='#151522', cup='#ffe14d', cupL='#a88a14',
    jacket='#24243d', jacketL='#0e0e1a', jacketS='#36365a', cyan='#3ee6ff',
    top='#f2eefc', topL='#8f8aa8', skirt='#ff6ec7', skirtL='#9a2c70', skirtS='#ff9ad8',
    sock='#24243d', boot='#f2eefc', bootL='#8f8aa8', lip='#e8568f',
)

BARS = [3, 5, 2, 6, 4, 3, 5, 2, 4, 6, 3, 5, 2, 4, 6, 3]


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 双色发：左粉右蓝（身后长到肩下）
    for side in (0, 1):
        hb = sympoly(shift([(24, 4.6), (20, 5.4), (17.6, 8), (16.8, 12), (16.6, 20), (16.8, 27), (18, 31)], b))
        half = {(x, y) for (x, y) in hb if (x >= 24) == bool(side)}
        c.layer(half, P['hair2'] if side else P['hair'], P['hair2L'] if side else P['hairL'])
    # 腿：长袜 + 厚底靴
    for x0 in (20, 25):
        c.layer(rect(x0, 60, x0 + 2, 70), P['skin'], P['skinL'])
        c.layer(rect(x0, 69, x0 + 2, 86), P['sock'], P['jacketL'])
        c.layer(rect(x0 - (1 if x0 < 24 else 0), 85, x0 + (2 if x0 < 24 else 3), 93), P['boot'], P['bootL'])
    c.dots([(x, 93) for x in range(19, 29) if x not in (23, 24)], P['cyan'])
    # 百褶裙
    skirt = sympoly([(24, 41), (19.4, 41.4), (17.6, 48), (16.4, 54), (15.8, 60.4)])
    c.layer(skirt, P['skirt'], P['skirtL'])
    for x0 in range(18, 31, 3):
        c.dots(line(x0 if x0 < 24 else x0 - 1, 43, x0 - (1 if x0 < 24 else -1), 59) & skirt, P['skirtS'])
    # 上身
    c.layer(rect(22, 18, 25, 25), P['skin'], P['skinL'])
    top = sympoly([(24, 23.6), (21.6, 23.8), (19.4, 24.6), (18, 26.4), (17.8, 31), (18.6, 37), (19.2, 41.4)])
    c.layer(top, P['top'], P['topL'])
    jacket = poly([(18.4, 24.4), (16.4, 26.4), (15.8, 31), (16.4, 35.6), (20.6, 35.6), (21, 30), (22.4, 24.2)])
    for m in (jacket, mirror(jacket)):
        c.layer(m, P['jacket'], P['jacketL'])
    c.dots({(x, y) for (x, y) in jacket | mirror(jacket) if y == 35}, P['cyan'])
    c.dots(line(19, 24, 21, 24) | line(26, 24, 28, 24), P['cyan'])
    sl = poly([(17.4, 25.4), (15.4, 27.6), (14.6, 33), (14.4, 41), (14.8, 47), (17.4, 47.2), (17.6, 41), (18, 33)])
    for m in (sl, mirror(sl)):
        c.layer(m, P['jacket'], P['jacketL'])
    c.dots({(x, y) for (x, y) in sl | mirror(sl) if y in (45, 46)}, P['cyan'])
    hand = {(15, 48), (16, 48), (16, 49), (15, 49)}
    c.dots(hand | mirror(hand), P['skin'])
    # 均衡器：随节拍跳动
    for i in range(4):
        h = BARS[(t + i * 5) % 16]
        x = 36 + i * 2
        c.dots([(x, 46 - k) for k in range(h)], P['cyan'] if i % 2 else P['hair'])
    # 头
    face(c, b, P)
    for side in (0, 1):
        lock = poly(shift([(23.6, 6.4), (20.6, 7.2), (18.8, 9.6), (18.1, 13.6), (17.9, 18.4), (18, 22), (19.4, 21), (19.7, 17), (20.2, 12.4), (21.1, 9.6), (23.1, 8.2)], b))
        fringe = sympoly(shift([(24, 5.8), (21, 6.4), (19.4, 8.4), (19, 11.4), (20.6, 10.8), (22, 9.6), (23.2, 10.8), (24, 10)], b))
        part = {(x, y) for (x, y) in fringe if (x >= 24) == bool(side)}
        if side:
            lock = mirror(lock)
        col, colL = (P['hair2'], P['hair2L']) if side else (P['hair'], P['hairL'])
        c.layer(lock, col, colL)
        c.layer(part, col, colL)
    # 耳机：头带 + 两侧耳罩，耳罩灯随节拍闪
    c.dots(shift(line(18, 7, 21, 4) | line(21, 4, 26, 4) | line(26, 4, 29, 7), b), P['phone'])
    for x0 in (15, 30):
        c.layer(rect(x0, 10 + b, x0 + 2, 15 + b), P['cup'], P['cupL'])
        c.dots([(x0 + 1, 12 + b)], P['cyan'] if t % 4 < 2 else P['cupL'])
    features(c, b, P, eyes='big', closed=blinking(t))
    return c
