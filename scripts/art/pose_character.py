# Pose and bake any Rocketbox avatar into a static glb (crew and cast).
# Usage: bpyenv/bin/python -I scripts/art/pose_character.py -- <avatar>.fbx <texdir> <out.glb> <pose> <name>
#   pose: seated (same pose and seat height as actor-seated.glb), dinner (seated,
#         forearms on a dining table), standing, standing-hip (weight on one leg, hand on hip),
#         standing-cup (holding a cup at chest height).
# Root origin is on the floor. Seated poses put the seat (pelvis - 9 cm) at SEAT_REAL,
# so they fit the same chairs as the actor. Nodes: "<name>-mesh" and "<name>-head"
# (between the ears at eye height); with --subject-head the head node is named
# "subject-head" instead, like actor-seated.glb.
import bpy, sys, os
from math import radians
from mathutils import Matrix, Vector
args = sys.argv[sys.argv.index('--') + 1:]
fbx, texdir, out, pose, name = args[:5]
subject_head = '--subject-head' in args
SEAT_REAL = 0.606  # matches actor-seated.glb (its head lands at 1.47 m)
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx, use_anim=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh_obj = next(o for o in bpy.data.objects if o.type == 'MESH')
M = arm.matrix_world
Minv = M.inverted()
X, Y, Z = Vector((1, 0, 0)), Vector((0, 1, 0)), Vector((0, 0, 1))


def bone_pos(n):
    return M @ arm.pose.bones['Bip01 ' + n].head


def rot(n, axis, deg):
    pb = arm.pose.bones['Bip01 ' + n]
    head_world = M @ pb.head
    R = Matrix.Translation(head_world) @ Matrix.Rotation(radians(deg), 4, axis) @ Matrix.Translation(-head_world)
    pb.matrix = Minv @ R @ M @ pb.matrix
    bpy.context.view_layer.update()


def hand_twist(side, sgn, deg):
    fa = bone_pos(f'{side} Hand') - bone_pos(f'{side} Forearm')
    rot(f'{side} Hand', fa.normalized(), sgn * deg)


def curl_fingers(side, deg):
    for f in ('1', '2', '3', '4'):
        for seg in ('', '1'):
            try:
                rot(f'{side} Finger{f}{seg}', X, -deg)
            except KeyError:
                pass


seated = pose in ('seated', 'dinner')
if seated:
    rot('Spine1', X, 4 if pose == 'seated' else 10)
    rot('Head', X, 5)
    for side, sgn in (('L', 1), ('R', -1)):
        rot(f'{side} Thigh', X, -82)
        rot(f'{side} Thigh', Z, sgn * (8 if pose == 'seated' else 2))
        rot(f'{side} Calf', X, 78)
        rot(f'{side} Foot', X, 6)
        rot(f'{side} UpperArm', Y, sgn * 50)
        if pose == 'seated':
            rot(f'{side} UpperArm', X, 4)
            rot(f'{side} Forearm', X, -56)
            rot(f'{side} Forearm', Y, sgn * 22)
            hand_twist(side, sgn, 70)
            rot(f'{side} Hand', X, 20)
            curl_fingers(side, 18)
        else:
            # Elbows a little forward and out, forearms level across the tabletop, hands meeting.
            rot(f'{side} UpperArm', X, float(os.environ.get('UA', -5)))
            rot(f'{side} UpperArm', Z, -sgn * 6)
            rot(f'{side} Forearm', X, float(os.environ.get('FA', -45)))
            rot(f'{side} Forearm', Z, -sgn * float(os.environ.get('FZ', 30)))
            hand_twist(side, sgn, 80)
            curl_fingers(side, 25)
    if pose == 'dinner':
        rot('Head', Z, 4)
        rot('Head', Y, -6)  # a slight, attentive head tilt
else:
    for side, sgn in (('L', 1), ('R', -1)):
        rot(f'{side} UpperArm', Y, sgn * 62)
        rot(f'{side} Forearm', X, -12)
        hand_twist(side, sgn, 60)
        curl_fingers(side, 22)
    if pose == 'standing-hip':
        # Weight on the left leg, right hand on the hip.
        rot('Pelvis', Y, 3)
        rot('R Thigh', Z, -4)
        rot('R Calf', X, 8)
        rot('R UpperArm', Y, 30)
        rot('R UpperArm', Z, 25)
        rot('R Forearm', Z, 70)
        rot('Head', Y, -4)
    elif pose == 'standing-cup':
        # Right forearm up, holding a cup in front of the chest.
        rot('R UpperArm', X, -18)
        rot('R Forearm', X, -95)
        rot('R Forearm', Z, 25)
        rot('Head', X, 6)
    else:
        rot('L Thigh', Z, 3)
        rot('Head', Z, -6)

deps = bpy.context.evaluated_depsgraph_get()
baked = bpy.data.meshes.new_from_object(mesh_obj.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
body = bpy.data.objects.new(f'{name}-mesh', baked)
body.matrix_world = mesh_obj.matrix_world.copy()
bpy.context.scene.collection.objects.link(body)

le, re = bone_pos('LEye'), bone_pos('REye')
eye_c = (le + re) / 2
head_anchor = Vector((eye_c.x, eye_c.y + 0.07, eye_c.z))
pelvis = bone_pos('Pelvis')
zs = [(body.matrix_world @ v.co).z for v in baked.vertices]
if seated:
    # Same seat as the actor; horizontally center the root under the pelvis/head line.
    shift = Vector((-head_anchor.x, -head_anchor.y, SEAT_REAL - (pelvis.z - 0.09)))
else:
    pel = pelvis
    shift = Vector((-pel.x, -pel.y, -min(zs)))
print('ANCHOR head', tuple(round(v, 3) for v in head_anchor + shift), 'pelvis', tuple(round(v, 3) for v in pelvis + shift),
      'min_z', round(min(zs) + shift.z, 3), 'max_z', round(max(zs) + shift.z, 3))
if pose == 'dinner':
    print('ANCHOR elbows', tuple(round(v, 3) for v in bone_pos('L Forearm') + shift), 'hands', tuple(round(v, 3) for v in bone_pos('L Hand') + shift), tuple(round(v, 3) for v in bone_pos('R Hand') + shift))

for o in list(bpy.data.objects):
    if o is not body:
        bpy.data.objects.remove(o, do_unlink=True)
root = bpy.data.objects.new(name, None)
bpy.context.scene.collection.objects.link(root)
body.matrix_world = Matrix.Translation(shift) @ body.matrix_world
body.parent = root
anchor = bpy.data.objects.new('subject-head' if subject_head else f'{name}-head', None)
anchor.location = head_anchor + shift
anchor.parent = root
bpy.context.scene.collection.objects.link(anchor)


def img(fn, colorspace):
    im = bpy.data.images.load(os.path.join(texdir, fn))
    im.colorspace_settings.name = colorspace
    return im


def make_mat(mname, color, normal, mr, alpha=False):
    mat = bpy.data.materials.new(mname)
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes['Principled BSDF']
    c = nt.nodes.new('ShaderNodeTexImage'); c.image = img(color, 'sRGB')
    nt.links.new(c.outputs['Color'], bsdf.inputs['Base Color'])
    if alpha:
        nt.links.new(c.outputs['Alpha'], bsdf.inputs['Alpha'])
        mat.surface_render_method = 'DITHERED'
    if normal:
        n = nt.nodes.new('ShaderNodeTexImage'); n.image = img(normal, 'Non-Color')
        nm = nt.nodes.new('ShaderNodeNormalMap')
        nt.links.new(n.outputs['Color'], nm.inputs['Color'])
        nt.links.new(nm.outputs['Normal'], bsdf.inputs['Normal'])
    if mr:
        r = nt.nodes.new('ShaderNodeTexImage'); r.image = img(mr, 'Non-Color')
        sep = nt.nodes.new('ShaderNodeSeparateColor')
        nt.links.new(r.outputs['Color'], sep.inputs['Color'])
        nt.links.new(sep.outputs['Green'], bsdf.inputs['Roughness'])
        nt.links.new(sep.outputs['Blue'], bsdf.inputs['Metallic'])
    bsdf.inputs['Specular IOR Level'].default_value = 0.4
    return mat


mats = {
    'body': make_mat(f'{name}-body', 'body_color.png', 'body_normal.png', 'body_mr.png'),
    'head': make_mat(f'{name}-head', 'head_color.png', 'head_normal.png', 'head_mr.png'),
}
if os.path.exists(os.path.join(texdir, 'hair_color.png')):
    mats['opacity'] = make_mat(f'{name}-hair', 'hair_color.png', None, None, alpha=True)
for slot in body.material_slots:
    slot_name = slot.material.name.split('.')[0].lower()
    key = next((k for k in ('head', 'opacity', 'body') if k in slot_name), 'body')
    slot.material = mats[key]
baked.calc_loop_triangles()
print('ANCHOR tris', len(baked.loop_triangles), 'slots', [s.material.name for s in body.material_slots])
bpy.ops.object.select_all(action='DESELECT')
for o in (root, body, anchor):
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_image_format='AUTO', export_animations=False, export_skins=False, export_morph=False)
print('ANCHOR wrote', out, os.path.getsize(out))
