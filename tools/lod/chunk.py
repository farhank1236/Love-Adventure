"""Split a GLB into base64 JS chunks: window.AethelosModelParts.<name>.push("...")  ->  assets/models/<name>-NN.js
Usage: python3 chunk.py in.glb name parts"""
import sys, base64, os, glob
src, name, parts = sys.argv[1], sys.argv[2], int(sys.argv[3])
b64 = base64.b64encode(open(src, 'rb').read()).decode()
for old in glob.glob(f'assets/models/{name}-[0-9][0-9].js'): os.remove(old)
step = (len(b64) + parts - 1) // parts
for i in range(parts):
    with open(f'assets/models/{name}-{i + 1:02d}.js', 'w') as f:
        f.write(f'window.AethelosModelParts.{name}.push("{b64[i * step:(i + 1) * step]}");\n')
print(name, parts, 'chunks', round(len(b64) / 1048576, 1), 'MB base64')
