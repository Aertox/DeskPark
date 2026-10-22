"""白眉老祖（像素头像 xian-elder 的全身像）：光头白眉长须、紫色广袖道袍，拄杖挂葫芦。"""
from kit import FH, FW, Canvas, breath, ellipse, face, features, line, male_robe, mirror, pal, poly, shift, sway, sympoly, tail, thick

META = dict(id='xian-elder', avatar='xian-elder', name='白眉老祖', group='修仙', face=[14, 1, 20], bg='#d9cff0')

P = pal(
    skin='#f1d8c4', skinL='#c89a84', skinS='#e6c2ac',
    white='#f2f1ec', whiteL='#a8a49a', whiteS='#d8d6ce',
    robe='#7b5ea7', robeL='#3e2a5e', robeS='#9a7cc4', trim='#e9d9a8', inner='#f6f2e6', belt='#5e4685',
    pants='#4a3868', pantsL='#2a1e3e', boots='#2b2420', bootsL='#120e0c',
    staff='#7a5a3a', staffL='#3e2c1c', gourd='#e0a040', gourdL='#9a6418', string='#c4505b',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 拐杖与葫芦
    c.layer(thick([(35.4, 17), (34.6, 93)], 1.0), P['staff'], P['staffL'])
    c.layer(ellipse(35.6, 16.4, 2.2, 1.8), P['staff'], P['staffL'])
    sw = round(sway(t, 2, 1.0, off=1.2))
    c.dots(line(36, 18, 37 + sw, 22), P['string'])
    c.layer(ellipse(37.4 + sw, 23.6, 1.6, 1.6) | ellipse(37.4 + sw, 27, 2.4, 2.3), P['gourd'], P['gourdL'])
    c.dots([(37 + sw, 25)], P['string'])
    male_robe(c, t, P, sleeve='wide')
    # 光头
    face(c, b, P)
    c.layer(ellipse(24, 9.6 + b, 4.8, 4.4) - {(x, y) for x in range(48) for y in range(12 + b, 96)}, P['skin'], P['skinL'])
    tuft = poly(shift([(19.6, 9.6), (18.4, 11.4), (18.6, 15.4), (19.8, 14.6), (20.2, 12)], b))
    c.layer(tuft, P['white'], P['whiteL'])
    c.layer(mirror(tuft), P['white'], P['whiteL'])
    c.dots(shift([(22, 7), (23, 6)], b), P['skinS'])
    features(c, b, P, brows='none', eyes='none')
    # 笑眯眯的眼睛 + 垂到脸侧的长白眉（随风轻摆）
    for f in (lambda x: x, lambda x: 47 - x):
        c.dots([(f(20), 14 + b), (f(21), 13 + b), (f(22), 14 + b)], P['lash'])
    bw = sway(t, 2, 0.8, off=0.4)
    brow = thick(shift([(22.4, 11.4), (20.4, 11.2), (18.6, 12.6), (17.6 + bw, 15.6)], b), 0.6)
    c.dots(brow, P['white'])
    c.dots(mirror(thick(shift([(22.4, 11.4), (20.4, 11.2), (18.6, 12.6), (17.6 + sway(t, 2, 0.8, off=1.8), 15.6)], b), 0.6)), P['white'])
    # 长须：末端随风飘
    beard = sympoly(shift([(24, 15.6), (22, 15.8), (20.6, 17), (20.4, 19.6), (21.2, 24), (22.4, 29), (23.4, 33)], b))
    tipx = sway(t, 3, 1.1)
    beard |= thick(shift([(24, 30), (24 + tipx * 0.6, 34), (24 + tipx, 37.5)], b), 1.0)
    c.layer(beard, P['white'], P['whiteL'])
    c.dots(shift(line(22, 20, 23, 30) | line(25, 20, 24, 30), b), P['whiteS'])
    c.dots(shift([(22, 17), (23, 18), (24, 18), (25, 17)], b), P['whiteS'])
    return c
