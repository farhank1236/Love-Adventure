"""Re-encode a GLB's PNG textures (no alpha) as high-quality JPEG at the same resolution.
Usage: python3 jpeg_textures.py in.glb out.glb [quality]"""
import sys, io
sys.path.insert(0, __import__('os').path.dirname(__file__))
from simplify_glb import load, save, compact, Builder
from PIL import Image
src, dst = sys.argv[1], sys.argv[2]; q = int(sys.argv[3]) if len(sys.argv) > 3 else 92
g, bin_ = load(src); B = Builder(g, bin_)
for im in g.get('images', []):
    v = g['bufferViews'][im['bufferView']]; o = v.get('byteOffset', 0); data = bytes(B.bin[o:o + v['byteLength']])
    img = Image.open(io.BytesIO(data))
    if im.get('mimeType') != 'image/png' or img.mode in ('RGBA', 'LA', 'P'): continue
    out = io.BytesIO(); img.convert('RGB').save(out, 'JPEG', quality=q, subsampling=0, optimize=True)
    im['bufferView'] = B.add_view(out.getvalue()); im['mimeType'] = 'image/jpeg'
    print('texture', img.size, round(len(data) / 1e6, 1), '->', round(out.tell() / 1e6, 1), 'MB')
save(dst, g, compact(g, B.bin))
