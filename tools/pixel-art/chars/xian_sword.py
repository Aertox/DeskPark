"""剑仙（像素头像 xian-sword 的全身像）：白衣蓝边、长发披肩、玉簪，金柄长剑负于背后。"""
from kit import FH, FW, Canvas, back_hair, blinking, breath, ellipse, face, features, front_locks, line, male_robe, pal, rect, shift, tail, thick

META = dict(id='xian-sword', avatar='xian-sword', name='剑仙', group='修仙', face=[14, 1, 20], bg='#bfe3d6')

P = pal(
    hair='#1f1d2b', hairL='#100e17', sheen='#45425f',
    robe='#f6f4ee', robeL='#8e97a6', robeS='#dfe3ea', inner='#ffffff', trim='#5b8fb9', trimL='#36607f',
    belt='#5b8fb9', pants='#cdd8e6', pantsL='#7d8a9c', boots='#3a3f4c', bootsL='#1c1f27',
    jade='#4fd1a5', jadeL='#2a8c6c', gold='#d4a74a', goldL='#8f6a22', blade='#e8eef5', tassel='#5b8fb9',
    brow='#2e2830', lip='#d08a84',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 剑：金色剑柄从右肩后探出
    c.layer(thick([(29.5, 27), (34.6, 15.4)], 1.1), P['gold'], P['goldL'])
    c.dots(line(29, 21, 35, 24), P['gold'])
    c.dots([(35, 14), (34, 14), (35, 13)], P['goldL'])
    c.dots(thick(tail([(35, 14.5), (36.4, 17.5), (37, 21), (36.8, 24.5)], t, 0.4, 1.2), 0.6), P['tassel'])
    c.layer(thick([(18, 42), (14, 53)], 1.0), P['goldL'], P['hairL'])
    # 长发披肩（身后到腰）
    back_hair(c, b, P, to=44, width=1.2)
    male_robe(c, t, P)
    face(c, b, P)
    front_locks(c, b, P, to=33)
    c.layer(ellipse(24, 4 + b, 3.2, 2.4), P['hair'], P['hairL'])
    c.dots(line(18, 5 + b, 30, 2 + b), P['jade'])
    c.dots([(30, 1 + b), (31, 1 + b), (31, 2 + b)], P['jadeL'])
    # 发带随风
    c.dots(thick(shift(tail([(27, 4), (30, 6), (32, 9), (33, 13)], t, 0.4, 1.2, off=1.0), b), 0.5), P['trim'])
    features(c, b, P, brows='sword', blush=False, closed=blinking(t))
    return c
