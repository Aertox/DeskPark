"""花仙子（像素头像 xian-fairy 的全身像）：花环、粉裙绿带，花瓣缓缓飘落。"""
from kit import FH, FW, Canvas, back_hair, blinking, breath, face, features, female_robe, flower, front_locks, pal, shift

META = dict(id='xian-fairy', avatar='xian-fairy', name='花仙子', group='修仙', face=[14, 1, 20], bg='#cdeccf')

P = pal(
    hair='#3a2a3c', hairL='#1c1320', sheen='#5e4862',
    robe='#ffd1e3', robeL='#b0708a', robeS='#f2a8c6', skirt='#ffe0ec', inner='#fff6fa', lapel='#f2a8c6',
    hem='#5cbf7a', hemL='#2f7a46', sash='#5cbf7a', sashL='#2f7a46', sashS='#8edb9e',
    cuff='#f2a8c6', cuffL='#b0708a',
    petal='#ff8fb8', petalD='#d0587a', bud='#ffd34d', leaf='#5cbf7a', lip='#d0587a',
)

# 花瓣：起点、速度、横向摆动（每 16 帧落下一段）
PETALS = [(10, 20, 1), (37, 34, -1), (6, 52, 1), (40, 64, -1)]


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    back_hair(c, b, P, to=40, width=0.6)
    female_robe(c, t, P, sleeve='wide', hem_from=88)
    face(c, b, P)
    front_locks(c, b, P, to=33)
    # 花环
    for i, (x, y) in enumerate([(18, 8), (20, 6), (23, 5), (26, 5), (29, 6), (31, 8)]):
        flower(c, x, y + b, P['petal'] if i % 2 == 0 else P['bud'], P['bud'] if i % 2 == 0 else P['petal'], P['petalD'] if i % 2 == 0 else None)
    c.dots(shift([(21, 7), (25, 7), (28, 7)], b), P['leaf'])
    # 飘落的花瓣
    for x0, y0, dx in PETALS:
        y = y0 + t * 2
        x = x0 + dx * ((t // 3) % 2)
        if y < 92:
            c.dots([(x, y), (x + 1, y)], P['petal'])
            c.dots([(x + dx, y + 1)], P['petalD'])
    features(c, b, P, closed=blinking(t))
    return c
