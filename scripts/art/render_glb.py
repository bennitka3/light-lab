import bpy, sys, os
from math import radians
from mathutils import Vector
args = sys.argv[sys.argv.index('--')+1:]
glb, outprefix = args[0], args[1]
engine = args[2] if len(args) > 2 else 'CYCLES'
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=glb)
scene = bpy.context.scene
scene.render.engine = engine
if engine == 'CYCLES':
    scene.cycles.samples = 24
    scene.cycles.use_denoising = False
    scene.cycles.device = 'CPU'
scene.render.resolution_x, scene.render.resolution_y = 480, 640
scene.render.film_transparent = False
world = bpy.data.worlds.new('w'); scene.world = world; world.use_nodes = True
world.node_tree.nodes['Background'].inputs['Color'].default_value = (0.2,0.2,0.22,1)
world.node_tree.nodes['Background'].inputs['Strength'].default_value = 0.6
# key light from camera-left, a bit of rim
key = bpy.data.objects.new('key', bpy.data.lights.new('key','AREA')); key.data.energy = 400; key.data.size = 1.2
key.location = (-1.6, -1.6, 2.4); key.rotation_euler = (radians(55), 0, radians(-45))
scene.collection.objects.link(key)
rim = bpy.data.objects.new('rim', bpy.data.lights.new('rim','SPOT')); rim.data.energy = 300
rim.location = (1.2, 1.5, 2.3); rim.rotation_euler = (radians(50), 0, radians(145))
scene.collection.objects.link(rim)
cam = bpy.data.objects.new('cam', bpy.data.cameras.new('cam')); scene.collection.objects.link(cam); scene.camera = cam
cam.data.lens = 50
center = Vector((0, 0, 1.1))
views = {'front': (0, -4.2, 1.2), 'side': (4.2, 0, 1.2), 'quarter': (-3.0, -3.0, 1.4)}
if len(args) > 3:
    views = {'face': (-0.9, -1.9, 1.5)}
    center = Vector((0, 0, 1.47)); cam.data.lens = 85
for name, pos in views.items():
    cam.location = pos
    d = center - cam.location
    cam.rotation_euler = d.to_track_quat('-Z', 'Y').to_euler()
    scene.render.filepath = f'{outprefix}_{name}.png'
    bpy.ops.render.render(write_still=True)
    print('RENDERED', scene.render.filepath)
