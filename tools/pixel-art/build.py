"""生成全部虚拟角色：精灵图 + manifest.json，可选预览图。

用法（在仓库根目录）：
    python3 tools/pixel-art/build.py              # 生成精灵图与 manifest
    python3 tools/pixel-art/build.py --preview    # 另外输出预览图到当前目录
    python3 tools/pixel-art/build.py --only xiaoying --preview
"""
import importlib
import json
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
sys.path.insert(0, str(HERE))

from kit import FH, FPS, FW, N  # noqa: E402
from pix import Canvas, hexc, strip  # noqa: E402

# 选择面板中的顺序
ORDER = ['yunshang', 'qingfeng', 'suqin', 'baihu', 'nihong', 'lingshi', 'xiaoying', 'xingye']

ROOT = HERE.parents[1]
OUT = ROOT / 'apps/web/public/characters'
FELT = '#2a5446'


def load(name):
    return importlib.import_module(f'chars.{name}')


def sheet(frames_by_char, path, scale, pick):
    """预览：每个角色取指定帧横向排开。"""
    gap = 4
    cols = [frames[pick] for frames in frames_by_char]
    big = Canvas(len(cols) * (FW + gap) - gap, FH)
    for i, c in enumerate(cols):
        for y in range(FH):
            for x in range(FW):
                big.px[y][i * (FW + gap) + x] = c.px[y][x]
    big.png(path, scale, FELT)


def main(argv):
    only = argv[argv.index('--only') + 1].split(',') if '--only' in argv else ORDER
    entries, rendered = [], []
    for name in ORDER:
        if not (HERE / 'chars' / f'{name}.py').exists():
            print('· 跳过（尚未绘制）', name)
            continue
        mod = load(name)
        meta = mod.META
        if name in only:
            frames = [mod.frame(t) for t in range(N)]
            strip(frames, str(OUT / f'{meta["id"]}.png'))
            rendered.append((name, frames))
            print('✓', meta['id'], meta['name'])
        entries.append({
            'id': meta['id'],
            'name': meta['name'],
            'group': meta['group'],
            'file': f'{meta["id"]}.png',
            'frame': [FW, FH],
            'frames': N,
            'fps': meta.get('fps', FPS),
            'face': meta['face'],
            'bg': meta['bg'],
        })
    text = json.dumps({'version': 2, 'characters': entries}, ensure_ascii=False, indent=2)
    # 数字数组写成一行，与 Prettier 的格式一致
    text = re.sub(
        r'\[\s*(\d+(?:\s*,\s*\d+)*)\s*\]',
        lambda m: '[' + ', '.join(re.split(r'\s*,\s*', m.group(1))) + ']',
        text,
    )
    (OUT / 'manifest.json').write_text(text + '\n', encoding='utf-8')
    if '--preview' in argv and rendered:
        frames = [f for _, f in rendered]
        sheet(frames, 'preview-f0.png', 5, 0)
        for name, f in rendered:
            strip(f[::2], f'preview-{name}.png', 5, FELT, gap=2)
        print('预览已输出到当前目录')


if __name__ == '__main__':
    hexc  # 保持导入（供角色脚本复用）
    main(sys.argv[1:])
