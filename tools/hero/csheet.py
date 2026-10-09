"""Contact sheet of a built clip (no horse): python3 csheet.py clips.pkl ClipName out.png frames(comma) [views]"""
import sys, pickle, numpy as np
sys.path.insert(0, '/home/claude/tools')
from PIL import Image, ImageDraw
import video3 as V
from sheet import vcolors
CAM = {'front': ((0.3, -4.2, 1.35), (0, -0.27, 1.0), 30), 'side': ((4.2, -0.6, 1.35), (0, -0.27, 1.0), 30), 'q': ((2.8, -3.2, 1.6), (0, -0.27, 1.0), 30),
       'back': ((-0.6, 3.6, 1.6), (0, -0.27, 1.0), 30), 'cu': ((1.4, -1.9, 1.45), (0.0, -0.3, 1.15), 28)}
def render(clip, frames, out, views=('front', 'side'), W=300, H=380):
    V.CL = {'c': clip}; FS = V.FXSkin(); bc, sc = vcolors(); ims = []
    for i in frames:
        layers, glows, portal = FS.frame('c', i)
        layers = [(layers[0][0], layers[0][1], bc)] + ([(layers[1][0], layers[1][1], sc)] if len(layers) > 1 else [])
        row = [V.draw(FS, layers, glows, portal, *CAM[v], W=W, H=H) for v in views]
        im = Image.fromarray((np.concatenate(row, 1) * 255).astype(np.uint8)); ImageDraw.Draw(im).text((6, 6), str(i), fill=(20, 20, 20)); ims.append(im)
    cols = max(1, min(len(ims), 1800 // ims[0].size[0])); rows = (len(ims) + cols - 1) // cols
    w, h = ims[0].size; M = Image.new('RGB', (w * cols, h * rows), 'white')
    for k, im in enumerate(ims): M.paste(im, ((k % cols) * w, (k // cols) * h))
    M.save(out); return out
if __name__ == '__main__':
    D = pickle.load(open(sys.argv[1], 'rb')); clip = D['clips'][sys.argv[2]]
    fr = [int(x) for x in sys.argv[4].split(',')]; views = sys.argv[5].split(',') if len(sys.argv) > 5 else ('front', 'side')
    print(render(clip, fr, sys.argv[3], views))
