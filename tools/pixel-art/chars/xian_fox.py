"""狐仙（像素头像 xian-fox 的全身像）：白发橙耳、金瞳红纹，红衣白领，橙色狐尾。"""
from kit import FH, FW, Canvas, back_hair, blinking, blob, breath, face, features, female_robe, front_locks, mirror, pal, poly, shift, sympoly, tail

META = dict(id='xian-fox', avatar='xian-fox', name='狐仙', group='修仙', face=[14, 1, 20], bg='#ffd9b8')

P = pal(
    hair='#f6f2ea', hairL='#c4b8a6', sheen='#ffffff', ear='#ff9b42', earL='#b8621c', earIn='#ffc9c9',
    iris='#d08a1c', irisL='#f2b43a', liner='#e0335f', lip='#e0335f',
    robe='#c63a2e', robeL='#6e1e18', robeS='#de5a4c', inner='#fff4ea', lapel='#fff4ea',
    hem='#972c22', hemL='#5a140f', sash='#f2b43a', sashL='#9a6c14', sashS='#ffd77a',
    cuff='#fff4ea', cuffL='#c9b8a4',
    tail='#ff9b42', tailL='#a65516', tailS='#e07a26', tip='#fff4ea',
)


def frame(t):
    b = breath(t)
    c = Canvas(FW, FH)
    path = tail([(26, 52), (30.6, 56), (35.6, 55), (39.2, 50), (41.2, 43), (41.6, 35.6), (40, 28.6)], t, 0.3, 1.6, lag=0.5)
    radii = [2.4, 3.8, 4.8, 5.2, 5, 4.2, 3]
    body = blob(path, radii)
    c.layer(body, P['tail'], P['tailL'])
    tip = blob(path[-2:], radii[-2:])
    edge = {q for q in body if any((q[0] + dx, q[1] + dy) not in body for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)))}
    c.dots({p for p in tip & body if p[1] < path[-2][1] - 1} - edge, P['tip'])
    c.dots({(x + 1, y + 1) for (x, y) in blob(path[1:5], [r * 0.4 for r in radii[1:5]]) if (x + 1, y + 1) in body}, P['tailS'])
    back_hair(c, b, P, to=40, width=0.4)
    female_robe(c, t, P)
    face(c, b, P)
    front_locks(c, b, P, to=33, sheen=False)
    cap = sympoly(shift([(24, 5.2), (21, 5.8), (19.2, 7.4), (18.8, 9), (21, 8.4), (24, 8.2)], b))
    c.layer(cap, P['hair'], P['hairL'])
    tw = -1 if t in (3, 4) else 0
    for side in (0, 1):
        ear = poly(shift([(18.2, 10), (16.4 + (tw if not side else 0), 3.4), (17.8 + (tw if not side else 0), 3.2), (23, 6.8)], b))
        inner = poly(shift([(19, 8.2), (17.8 + (tw if not side else 0), 4.8), (21.4, 6.8)], b))
        if side:
            ear, inner = mirror(ear), mirror(inner)
        c.layer(ear, P['ear'], P['earL'])
        c.dots(inner, P['earIn'])
    features(c, b, P, eyes='fox', mark=P['liner'], closed=blinking(t))
    return c
