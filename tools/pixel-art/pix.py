"""极简像素画工具：形状蒙版 + 分层描边 + PNG 输出（无第三方依赖）。"""
import struct
import zlib

W = H = 64


def hexc(s):
    s = s.lstrip('#')
    return (int(s[0:2], 16), int(s[2:4], 16), int(s[4:6], 16), 255)


class Canvas:
    def __init__(self, w=W, h=H):
        self.w, self.h = w, h
        self.px = [[None] * w for _ in range(h)]

    def set(self, x, y, c):
        if 0 <= x < self.w and 0 <= y < self.h:
            self.px[y][x] = hexc(c) if isinstance(c, str) else c

    def get(self, x, y):
        if 0 <= x < self.w and 0 <= y < self.h:
            return self.px[y][x]
        return None

    def layer(self, mask, fill, line=None, open_bottom=True, only=None):
        """填充蒙版；边缘像素（四邻有不在蒙版内的）用 line 色。only 限制只画在已有像素上。"""
        for (x, y) in mask:
            if only is not None and (x, y) not in only:
                continue
            c = fill
            if line:
                for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    n = (x + dx, y + dy)
                    if n not in mask:
                        if open_bottom and n[1] >= self.h:
                            continue
                        c = line
                        break
            self.set(x, y, c)

    def dots(self, pts, c):
        for x, y in pts:
            self.set(x, y, c)

    def png(self, path, scale=1, bg=None):
        w, h = self.w * scale, self.h * scale
        raw = bytearray()
        bgc = hexc(bg) if bg else (0, 0, 0, 0)
        for y in range(h):
            raw.append(0)
            row = self.px[y // scale]
            for x in range(w):
                p = row[x // scale] or bgc
                raw += bytes(p)

        def chunk(t, d):
            c = struct.pack('>I', len(d)) + t + d
            return c + struct.pack('>I', zlib.crc32(t + d) & 0xFFFFFFFF)

        data = b'\x89PNG\r\n\x1a\n'
        data += chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        data += chunk(b'IDAT', zlib.compress(bytes(raw), 9))
        data += chunk(b'IEND', b'')
        open(path, 'wb').write(data)


def ellipse(cx, cy, rx, ry):
    out = set()
    for y in range(H):
        for x in range(W):
            if ((x + 0.5 - cx) / rx) ** 2 + ((y + 0.5 - cy) / ry) ** 2 <= 1:
                out.add((x, y))
    return out


def poly(pts):
    """多边形（像素中心采样）。"""
    out = set()
    n = len(pts)
    for y in range(H):
        py = y + 0.5
        xs = []
        for i in range(n):
            x1, y1 = pts[i]
            x2, y2 = pts[(i + 1) % n]
            if (y1 <= py < y2) or (y2 <= py < y1):
                xs.append(x1 + (py - y1) * (x2 - x1) / (y2 - y1))
        xs.sort()
        for i in range(0, len(xs) - 1, 2):
            for x in range(W):
                if xs[i] <= x + 0.5 < xs[i + 1]:
                    out.add((x, y))
    return out


def rect(x0, y0, x1, y1):
    return {(x, y) for x in range(x0, x1 + 1) for y in range(y0, y1 + 1)}


def mirror(mask):
    return {(W - 1 - x, y) for x, y in mask}


def sym(mask):
    return mask | mirror(mask)


def mx(pts):
    """镜像点列（左侧→右侧）。"""
    return [(W - x, y) for x, y in pts]


def line(x0, y0, x1, y1):
    pts = set()
    dx, dy = abs(x1 - x0), -abs(y1 - y0)
    sx, sy = (1 if x0 < x1 else -1), (1 if y0 < y1 else -1)
    err = dx + dy
    while True:
        pts.add((x0, y0))
        if x0 == x1 and y0 == y1:
            return pts
        e2 = 2 * err
        if e2 >= dy:
            err += dy
            x0 += sx
        if e2 <= dx:
            err += dx
            y0 += sy


def sympoly(left):
    """左半边轮廓（从上到下，x<=32）→ 左右对称多边形。"""
    return poly(list(left) + [(W - x, y) for x, y in reversed(left)])


def thick(points, r=1.0):
    """沿折线采样，半径 r 的圆刷。points 为浮点坐标。"""
    out = set()
    for i in range(len(points) - 1):
        (x0, y0), (x1, y1) = points[i], points[i + 1]
        n = max(1, int(max(abs(x1 - x0), abs(y1 - y0)) * 3))
        for k in range(n + 1):
            x = x0 + (x1 - x0) * k / n
            y = y0 + (y1 - y0) * k / n
            for yy in range(int(y - r - 1), int(y + r + 2)):
                for xx in range(int(x - r - 1), int(x + r + 2)):
                    if (xx + 0.5 - x) ** 2 + (yy + 0.5 - y) ** 2 <= r * r:
                        out.add((xx, yy))
    return out


def strip(canvases, path, scale=1, bg=None, gap=0):
    """多帧横向拼接为一张精灵图。"""
    fw, fh = canvases[0].w, canvases[0].h
    big = Canvas(len(canvases) * (fw + gap) - gap, fh)
    for i, c in enumerate(canvases):
        for y in range(fh):
            for x in range(fw):
                big.px[y][i * (fw + gap) + x] = c.px[y][x]
    big.png(path, scale, bg)
    return big
