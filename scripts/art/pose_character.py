# Pose and bake any Rocketbox avatar into a static glb (crew and cast).
# Usage: bpyenv/bin/python -I scripts/art/pose_character.py -- <avatar>.fbx <texdir> <out.glb> <pose> <name>
#   --glasses adds procedural tortoiseshell glasses fitted to the eyes (node "<name>-glasses").
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


def build_glasses(le, re):
    """Tortoiseshell reading glasses fitted to the posed eye bones (--glasses).

    Built in a head-local frame: x toward the left eye, y up, z forward (out of the face),
    then rotated with the head bone so they follow the head tilt.
    """
    import bmesh
    from math import cos, sin, pi
    hb = arm.pose.bones['Bip01 Head']
    delta = (M @ hb.matrix) @ (M @ hb.bone.matrix_local).inverted()
    rq = delta.to_quaternion()
    fwd = rq @ Vector((0, -1, 0))  # Rocketbox avatars face -Y in Blender
    up = rq @ Vector((0, 0, 1))
    lat = (le - re).normalized()
    up = (up - lat * up.dot(lat)).normalized()
    fwd = up.cross(lat) if up.cross(lat).dot(fwd) > 0 else lat.cross(up)
    ipd = (le - re).length
    origin = (le + re) / 2 + fwd * float(os.environ.get('GL_FWD', 0.03)) + up * 0.001

    def to_world(p):
        return origin + lat * p.x + up * p.y + fwd * p.z

    bm = bmesh.new()

    def tube(pts, r, closed, sides=6):
        rings = []
        n = len(pts)
        for i, p in enumerate(pts):
            a = pts[(i - 1) % n] if (closed or i > 0) else p
            b = pts[(i + 1) % n] if (closed or i < n - 1) else p
            t = (b - a).normalized()
            ref = Vector((0, 0, 1)) if abs(t.z) < 0.9 else Vector((0, 1, 0))
            nrm = t.cross(ref).normalized()
            bin_ = t.cross(nrm).normalized()
            rings.append([bm.verts.new(to_world(p + (nrm * cos(2 * pi * k / sides) + bin_ * sin(2 * pi * k / sides)) * r))
                          for k in range(sides)])
        for i in range(n if closed else n - 1):
            r0, r1 = rings[i], rings[(i + 1) % n]
            for k in range(sides):
                bm.faces.new((r0[k], r0[(k + 1) % sides], r1[(k + 1) % sides], r1[k]))
        if not closed:
            bm.faces.new(rings[0][::-1])
            bm.faces.new(rings[-1])

    w, h, cr = 0.047, 0.033, 0.013  # lens width, height, corner radius (soft rectangles)
    rim = 0.0022

    def lens(cx):
        pts = []
        for (sx, sy, a0) in ((1, 1, 0), (-1, 1, 90), (-1, -1, 180), (1, -1, 270)):
            ccx, ccy = cx + sx * (w / 2 - cr), sy * (h / 2 - cr)
            for k in range(5):
                a = radians(a0 + 90 * k / 4)
                # A slight wrap: outer edges sit a few mm further back than the nose side.
                x = ccx + cos(a) * cr
                pts.append(Vector((x, ccy + sin(a) * cr, -0.006 * (abs(x) - ipd / 2 + w / 2) / w)))
        return pts

    half = max(ipd / 2, 0.031)
    for s in (1, -1):
        tube(lens(s * half), rim, True)
        # Temple arm: from the outer top corner of the rim back over the ear.
        x0 = s * (half + w / 2)
        tw = float(os.environ.get('GL_TEMPLE', 0.079))
        tube([Vector((x0, h / 2 - 0.008, -0.005)), Vector((s * (tw - 0.002), h / 2 - 0.009, -0.03)),
              Vector((s * tw, h / 2 - 0.012, -0.075)), Vector((s * (tw - 0.004), h / 2 - 0.03, -0.098))], 0.0018, False, 5)
    # Bridge over the nose.
    tube([Vector((-half + w / 2, 0.006, 0.0005)), Vector((0, 0.011, 0.003)), Vector((half - w / 2, 0.006, 0.0005))],
         0.0022, False, 5)
    me = bpy.data.meshes.new(f'{name}-glasses')
    bm.to_mesh(me)
    bm.free()
    me.shade_smooth() if hasattr(me, 'shade_smooth') else None
    obj = bpy.data.objects.new(f'{name}-glasses', me)
    bpy.context.scene.collection.objects.link(obj)
    mat = bpy.data.materials.new(f'{name}-glasses')
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes['Principled BSDF']
    bsdf.inputs['Base Color'].default_value = (0.03, 0.014, 0.006, 1)  # dark tortoiseshell brown
    bsdf.inputs['Roughness'].default_value = 0.3
    me.materials.append(mat)
    return obj


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
glasses = None
if '--glasses' in args:
    glasses = build_glasses(le, re)
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
    if o is not body and o is not glasses:
        bpy.data.objects.remove(o, do_unlink=True)
root = bpy.data.objects.new(name, None)
bpy.context.scene.collection.objects.link(root)
body.matrix_world = Matrix.Translation(shift) @ body.matrix_world
body.parent = root
if glasses:
    glasses.matrix_world = Matrix.Translation(shift) @ glasses.matrix_world
    glasses.parent = root
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
for o in (root, body, anchor) + ((glasses,) if glasses else ()):
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=True,
                          export_image_format='AUTO', export_animations=False, export_skins=False, export_morph=False)
print('ANCHOR wrote', out, os.path.getsize(out))
