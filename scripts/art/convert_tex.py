# Rocketbox TGA -> PNG set expected by pose script: body/head color, normal, mr (roughness in G), hair RGBA.
import sys, os, glob
from PIL import Image, ImageOps
src, out, size = sys.argv[1], sys.argv[2], int(sys.argv[3])
os.makedirs(out, exist_ok=True)
def find(part):
    c = [f for f in glob.glob(os.path.join(src, '*.tga')) if f'_{part}' in os.path.basename(f)]
    return c[0] if c else None
for region in ('body', 'head'):
    for kind in ('color', 'normal'):
        im = Image.open(find(f'{region}_{kind}')).convert('RGB').resize((size, size), Image.LANCZOS)
        im.save(os.path.join(out, f'{region}_{kind}.png'))
    spec = Image.open(find(f'{region}_specular')).convert('L').resize((size, size), Image.LANCZOS)
    rough = spec.point(lambda v: int(255 * (0.95 - 0.55 * v / 255)))
    black = Image.new('L', (size, size), 0)
    Image.merge('RGB', (black, rough, black)).save(os.path.join(out, f'{region}_mr.png'))
op = find('opacity_color')
if op:
    Image.open(op).convert('RGBA').resize((size, size), Image.LANCZOS).save(os.path.join(out, 'hair_color.png'))
print('ok', out, sorted(os.listdir(out)))
