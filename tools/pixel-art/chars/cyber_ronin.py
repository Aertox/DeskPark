"""义体浪人（像素头像 cyber-ronin 的全身像）：粉色莫西干、红色义眼眼罩，金边无袖夹克，机械左臂，腰挎武士刀。"""
from kit import FH, FW, Canvas, blinking, breath, face, features, line, mirror, pal, poly, rect, shift, sympoly, tail, thick

META = dict(id='cyber-ronin', avatar='cyber-ronin', name='义体浪人', group='赛博朋克', face=[14, 1, 20], bg='#8fd8ff')

P = pal(
    skin='#ecc7a6', skinL='#b98a6a', skinS='#dcb08c', lip='#b86a62',
    hair='#ff3d8e', hairL='#8e1a4c', hairS='#ff86b8', side='#3a2a30',
    metal='#a7b0c2', metalL='#5b6476', metalS='#d6dbe6', eye='#ff2b2b', eyeG='#ffb0b0',
    jacket='#262c3a', jacketL='#0e1118', jacketS='#3a4256', gold='#ffd23f', goldL='#a8841c',
    pants='#3a3a44', pantsL='#18181e', pantsS='#4c4c58', boots='#141820',
    saya='#2a1a1e', tsuka='#ffd23f', tassel='#ff3d8e',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    # 刀：左腰后斜挂
    c.layer(thick([(14, 40), (35, 54)], 1.0), P['saya'], P['jacketL'])
    c.layer(thick([(11, 38), (14.4, 40.4)], 1.0), P['tsuka'], P['goldL'])
    c.dots(thick(tail([(11, 38), (10, 41), (9.6, 44.6)], t, 0.45, 1.0), 0.5), P['tassel'])
    # 腿：工装裤 + 靴
    leg = poly([(19.2, 46), (23.7, 46), (23.6, 70), (23.2, 86), (19.4, 86), (19, 70)])
    for m in (leg, mirror(leg)):
        c.layer(m, P['pants'], P['pantsL'])
    c.layer(rect(18, 58, 20, 64), P['pantsS'], P['pantsL'])
    c.layer(mirror(rect(18, 58, 20, 64)), P['pantsS'], P['pantsL'])
    boot = rect(18, 84, 23, 93)
    for m in (boot, mirror(boot)):
        c.layer(m, P['boots'], P['jacketL'])
    # 上身：黑色内衬 + 无袖夹克
    c.layer(rect(22, 18, 25, 25), P['skin'], P['skinL'])
    torso = sympoly([(24, 23), (21, 23.2), (18.2, 24.2), (16.4, 26), (16.2, 31), (17, 38), (17.8, 47)])
    c.layer(torso, P['jacket'], P['jacketL'])
    c.dots(line(22, 25, 21, 46) | line(25, 25, 26, 46), P['gold'])
    c.dots(line(23, 27, 23, 45) | line(24, 27, 24, 45), P['jacketS'])
    c.layer(rect(18, 44, 29, 46), P['jacketL'], None)
    c.dots([(23, 45), (24, 45)], P['gold'])
    # 右臂（画面右侧）：肌肤；左臂：机械义肢，关节灯闪烁
    arm = thick([(30.6, 26), (32.2, 34), (32.4, 42), (31.8, 49)], 1.8)
    c.layer(arm, P['skin'], P['skinL'])
    marm = thick([(17.4, 26), (15.8, 34), (15.6, 42), (16.2, 49)], 1.9)
    c.layer(marm, P['metal'], P['metalL'])
    for y in (33, 41):
        c.dots([(14, y), (15, y), (16, y), (17, y)], P['metalL'])
    c.dots(line(15, 27, 14, 32), P['metalS'])
    c.dots([(15, 37)], P['eye'] if t % 4 < 2 else P['metalL'])
    c.dots([(15, 50), (16, 50), (15, 51)], P['metalL'])
    c.dots([(32, 50), (31, 50), (32, 51)], P['skin'])
    # 头：两侧剃短，中间粉色莫西干
    face(c, b, P)
    c.layer(sympoly(shift([(24, 6), (20.6, 6.6), (19.2, 8.4), (19, 11), (20, 9.6), (24, 9.2)], b)), P['side'], P['jacketL'])
    mohawk = poly(shift([(22.4, 9), (22, 4), (23, 0.6), (25, 0.4), (26.4, 3), (26, 9)], b))
    c.layer(mohawk, P['hair'], P['hairL'])
    c.dots(shift([(23, 2), (23, 3), (23, 4)], b), P['hairS'])
    features(c, b, P, brows='sword', blush=False, closed=blinking(t))
    # 右眼义体眼罩
    plate = rect(24, 12 + b, 28, 15 + b)
    c.layer(plate, P['metal'], P['metalL'])
    c.dots([(25, 13 + b), (26, 13 + b), (25, 14 + b), (26, 14 + b)], P['eye'])
    if t < 4:
        c.dots([(25, 13 + b)], P['eyeG'])
    return c
