"""霓虹 · 赛博朋克：粉色短发、发光护目镜，长款机车夹克镶霓虹边，双手插兜。"""
from kit import (
    FH, FW, Canvas, breath, face, features, line, mirror, poly, rect, shift, sway, sympoly,
)

META = dict(id='nihong', name='霓虹', group='赛博朋克', face=[14, 1, 20], bg='#2b2540')

C = dict(
    hair='#ff5fa2', hairL='#9e2a63', hairS='#ff9cc6', streak='#5ff4ff',
    skin='#f8e3da', skinL='#d4a094', skinS='#eccabd',
    lash='#2b2030', iris='#4c3346', irisL='#9a7c92', brow='#9e2a63', lip='#e2577f',
    visor='#38e8ff', visorL='#0f6f88', visorG='#e6feff',
    jacket='#24203a', jacketL='#0c0a14', jacketS='#363055',
    neon='#ff3d8b', neonD='#8a2350', cyan='#38e8ff', cyanD='#16798c',
    top='#e9ecf5', topL='#8a90a8', topS='#cfd4e4',
    legs='#2a2842', legsL='#0e0d18', legsS='#3c3960',
    boot='#e9ecf5', bootL='#6b7090', bootS='#c3c8db',
)


def frame(t):
    b = breath(t)
    dim = t == 9  # 霓虹灯偶尔闪一下
    neon = C['neonD'] if dim else C['neon']
    cyan = C['cyanD'] if dim else C['cyan']
    c = Canvas(FW, FH)

    # 腿与厚底靴
    leg = poly([(19.6, 38), (23.7, 38), (23.5, 60), (23, 83), (20, 83), (19.4, 60)])
    c.layer(leg, C['legs'], C['legsL'])
    c.layer(mirror(leg), C['legs'], C['legsL'])
    c.dots(line(20, 42, 20, 80) | line(27, 42, 27, 80), C['legsS'])
    boot = rect(18, 81, 23, 92) | rect(17, 89, 23, 92)
    c.layer(boot, C['boot'], C['bootL'])
    c.layer(mirror(boot), C['boot'], C['bootL'])
    c.dots([(x, 93) for x in range(17, 24)] + [(x, 93) for x in range(24, 31)], cyan)
    c.dots([(x, 84) for x in range(19, 23)] + [(x, 84) for x in range(25, 29)], C['bootS'])

    # 内搭短上衣 + 发光腰带
    c.layer(rect(22, 18, 25, 25), C['skin'], C['skinL'])
    top = sympoly([(24, 23.6), (21.6, 23.8), (19.4, 24.6), (18, 26.4), (17.8, 31), (18.6, 36), (19.2, 39.2)])
    c.layer(top, C['top'], C['topL'])
    c.dots(line(22, 27, 22, 36) & top, C['topS'])
    c.layer(rect(19, 37, 28, 39), C['jacketL'], None)
    c.dots([(23, 38), (24, 38)], cyan)

    # 长夹克（敞开，长到大腿），下摆轻摆
    hem = round(sway(t, 4, 0.7))
    panel = poly([
        (18, 24.6), (16, 26.6), (15.4, 32), (15.8, 40), (16.2, 50), (16 + hem * 0.5, 61),
        (21.6 + hem, 61), (21.6, 50), (21.2, 38), (20.6, 30), (21.6, 26), (22.6, 24.2),
    ])
    c.layer(panel, C['jacket'], C['jacketL'])
    c.layer(mirror(panel), C['jacket'], C['jacketL'])
    edge = {(x, y) for (x, y) in panel if 27 <= y <= 60 and (x + 1, y) not in panel}
    c.dots(edge | mirror(edge), neon)
    c.dots({(x, y) for (x, y) in panel | mirror(panel) if y == 60}, neon)
    c.dots(line(17, 30, 17, 56) & panel, C['jacketS'])
    # 大翻领
    collar = poly([(22.8, 23.6), (19, 24), (16.4, 26), (17.6, 28.6), (20.2, 27.2), (21.8, 29)])
    c.layer(collar, C['jacketS'], C['jacketL'])
    c.layer(mirror(collar), C['jacketS'], C['jacketL'])

    # 袖子：手插在口袋里
    sl = poly([(17.4, 25.4), (15.2, 27.6), (14.2, 33), (13.6, 41), (13.6, 48.6), (17, 49), (17.4, 42), (17.8, 34)])
    c.layer(sl, C['jacket'], C['jacketL'])
    c.layer(mirror(sl), C['jacket'], C['jacketL'])
    c.dots({(x, y) for (x, y) in sl | mirror(sl) if y in (47, 48)}, cyan)
    c.dots(line(14, 50, 18, 50) | line(29, 50, 33, 50), C['jacketL'])
    c.dots(line(15, 32, 14, 45) & sl, C['jacketS'])

    # 头：波波短发
    tip = round(sway(t, 2, 0.8))
    bob = sympoly(shift([(24, 4.8), (20, 5.6), (17.6, 8.4), (16.8, 12.5), (16.8, 17), (17.2, 20.6), (19.6, 21.2), (20.8, 19)], b))
    c.layer(bob, C['hair'], C['hairL'])
    face(c, b, C)
    side = poly(shift([(20.4, 7.6), (18.4, 10), (17.8, 14), (17.6, 18), (18 + tip * 0.6, 21.6), (19.8, 21), (20, 16), (20.2, 11)], b))
    c.layer(side, C['hair'], C['hairL'])
    c.layer(mirror(side), C['hair'], C['hairL'])
    c.dots(shift(line(18, 11, 18, 19), b), C['streak'])
    bang = poly(shift([(29, 6.6), (23, 6.4), (19.6, 8.2), (18.6, 11.8), (20.6, 11), (22.4, 10.2), (24.6, 11), (26.8, 10.4), (29.2, 12.2)], b))
    c.layer(bang, C['hair'], C['hairL'])
    c.dots(shift([(21, 7), (22, 7), (23, 7), (20, 8)], b), C['hairS'])

    # 发光护目镜：扫描线左右来回
    visor = rect(19, 12 + b, 28, 14 + b)
    c.layer(visor, C['visor'], C['visorL'])
    c.dots([(18, 13 + b), (29, 13 + b)], C['jacketL'])
    sx = 20 + (t if t < 8 else 15 - t)
    c.dots([(sx, 13 + b), (sx, 12 + b)], C['visorG'])
    # 耳钉
    c.dots([(17, 16 + b)], neon)

    features(c, b, C, brows='none', eyes='none')
    return c
