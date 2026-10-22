"""浪客剑士（像素头像 anime-samurai 的全身像）：黑发束髻、颊上十字疤，蓝色和服配宽袴，腰间佩刀。"""
from kit import FH, FW, Canvas, blinking, breath, ellipse, face, features, line, male_robe, pal, poly, shift, sympoly, tail, thick

META = dict(id='anime-samurai', avatar='anime-samurai', name='浪客剑士', group='动漫', face=[14, 1, 20], bg='#f3d2a2')

P = pal(
    skin='#f1d4b8', skinL='#c49a7e', skinS='#e4bea2', lip='#c08078',
    hair='#2a2430', hairL='#120e16', sheen='#4a4256',
    robe='#2c3e66', robeL='#121c34', robeS='#3f5588', inner='#f2f0e8', trim='#f2f0e8', trimL='#a8a498',
    belt='#c0504a', pants='#4a4552', pantsL='#211e26', pantsS='#5e5868', boots='#2a2430', sock='#f2f0e8',
    saya='#1c1820', tsuka='#f2f0e8', tsukaL='#8a8478', guard='#c9a44a', scar='#c0504a', brow='#2a2430',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    male_robe(c, t, P, lower='hakama')
    # 佩刀：插在左腰带上，刀柄朝前
    c.layer(thick([(30, 40), (40, 47)], 0.9), P['saya'], P['hairL'])
    c.layer(thick([(14, 35), (19, 39)], 0.9), P['tsuka'], P['tsukaL'])
    c.dots([(19, 38), (19, 39), (20, 39)], P['guard'])
    # 头：后束发髻 + 散乱刘海
    c.layer(sympoly(shift([(24, 4.6), (20, 5.4), (17.8, 8), (17.2, 12), (17.6, 16.6), (19, 19)], b)), P['hair'], P['hairL'])
    face(c, b, P)
    for sp in ([(20.6, 6), (18, 10.4), (19.6, 12.6), (21, 9.6)], [(23, 6), (21.4, 11), (23.6, 9)], [(26, 6), (27.4, 11.6), (28.4, 8)], [(27.6, 6.4), (30.4, 12), (30, 8)]):
        c.layer(poly(shift(sp, b)), P['hair'], P['hairL'])
    c.layer(ellipse(24, 3.4 + b, 2.4, 2.2), P['hair'], P['hairL'])
    pony = thick(shift(tail([(25.6, 3.4), (28, 2.6), (30.4, 3.6), (32, 6)], t, 0.4, 1.0), b), 0.8)
    c.layer(pony, P['hair'], P['hairL'])
    c.dots(shift([(24, 5)], b), P['belt'])
    features(c, b, P, brows='sword', blush=False, closed=blinking(t))
    # 左颊十字疤
    c.dots(shift([(20, 15), (21, 16), (22, 17), (22, 15), (20, 17)], b), P['scar'])
    return c
