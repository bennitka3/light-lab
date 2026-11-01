# Turn Female_Adult_11's brown knit dress into a deep red evening dress (skin untouched).
import sys
import numpy as np
from PIL import Image
src, out = sys.argv[1], sys.argv[2]
a = np.asarray(Image.open(src).convert('RGB')).astype(np.float32) / 255
v = a.max(axis=2)
s = (v - a.min(axis=2)) / np.maximum(v, 1e-4)
lum = a @ np.array([0.299, 0.587, 0.114], np.float32)
# Dress pixels: dark and only mildly saturated. Skin is brighter.
m = np.clip((0.5 - v) / 0.1, 0, 1)
crimson = np.array([0.62, 0.035, 0.07], np.float32)
red = np.clip(np.minimum(lum / 0.22, 1.15)[..., None] ** 1.1 * crimson, 0, 1)
o = a * (1 - m[..., None]) + red * m[..., None]
Image.fromarray((o * 255 + 0.5).astype(np.uint8)).save(out)
