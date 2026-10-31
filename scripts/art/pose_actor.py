import bpy, sys, os
from math import radians
from mathutils import Matrix, Vector
args = sys.argv[sys.argv.index('--')+1:]
fbx, texdir, out = args[0], args[1], args[2]
bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=fbx, use_anim=False)
arm = next(o for o in bpy.data.objects if o.type == 'ARMATURE')
mesh_obj = next(o for o in bpy.data.objects if o.type == 'MESH')
M = arm.matrix_world
Minv = M.inverted()
X, Y, Z = Vector((1,0,0)), Vector((0,1,0)), Vector((0,0,1))

def rot(name, axis, deg):
    pb = arm.pose.bones['Bip01 ' + name]
    head_world = M @ pb.head
    R = Matrix.Translation(head_world) @ Matrix.Rotation(radians(deg), 4, axis) @ Matrix.Translation(-head_world)
    pb.matrix = Minv @ R @ M @ pb.matrix
    bpy.context.view_layer.update()

# Seated on a tall director's chair, relaxed, facing the camera (-Y in Blender).
rot('Spine1', X, 4)
rot('Head', X, 5)
for side, sgn in (('L', 1), ('R', -1)):
    rot(f'{side} Thigh', X, -82)
    rot(f'{side} Thigh', Z, sgn * 8)      # knees slightly apart
    rot(f'{side} Calf', X, 78)
    rot(f'{side} Foot', X, 6)
    rot(f'{side} UpperArm', Y, sgn * 50)  # arms down from the A-pose
    rot(f'{side} UpperArm', X, 4)
    rot(f'{side} Forearm', X, -56)        # forearms forward, hands resting on the thighs
    rot(f'{side} Forearm', Y, sgn * 22)
    fa = (M @ arm.pose.bones[f'Bip01 {side} Hand'].head) - (M @ arm.pose.bones[f'Bip01 {side} Forearm'].head)
    rot(f'{side} Hand', fa.normalized(), sgn * 70)  # palms down
    rot(f'{side} Hand', X, 20)
    for f in ('1','2','3','4'):
        for seg in ('', '1'):
            rot(f'{side} Finger{f}{seg}', X, -18)

# Bake the pose into a plain mesh.
deps = bpy.context.evaluated_depsgraph_get()
baked = bpy.data.meshes.new_from_object(mesh_obj.evaluated_get(deps), preserve_all_data_layers=True, depsgraph=deps)
actor = bpy.data.objects.new('actor-mesh', baked)
actor.matrix_world = mesh_obj.matrix_world.copy()
bpy.context.scene.collection.objects.link(actor)

# Head anchor: between the ears at eye height.
le = M @ arm.pose.bones['Bip01 LEye'].head
re = M @ arm.pose.bones['Bip01 REye'].head
hd = M @ arm.pose.bones['Bip01 Head'].head
eye_c = (le + re) / 2
head_anchor = Vector((0, eye_c.y + 0.07, eye_c.z))
pelvis = M @ arm.pose.bones['Bip01 Pelvis'].head
lfoot = M @ arm.pose.bones['Bip01 L Foot'].head
ltoe = M @ arm.pose.bones['Bip01 L Toe0'].head
lknee = M @ arm.pose.bones['Bip01 L Calf'].head
lhand = M @ arm.pose.bones['Bip01 L Hand'].head
print('ANCHOR head', tuple(round(v,3) for v in head_anchor))
print('ANCHOR pelvis', tuple(round(v,3) for v in pelvis), 'knee', tuple(round(v,3) for v in lknee), 'foot', tuple(round(v,3) for v in lfoot), 'toe', tuple(round(v,3) for v in ltoe), 'hand', tuple(round(v,3) for v in lhand))

# Remove the rig, keep only the baked mesh under a root whose origin is on the
# floor under the head anchor; the head anchor is a named empty.
for o in list(bpy.data.objects):
    if o not in (actor,):
        bpy.data.objects.remove(o, do_unlink=True)
root = bpy.data.objects.new('actor', None)
bpy.context.scene.collection.objects.link(root)
HEAD_REAL = 1.47
shift = Vector((-head_anchor.x, -head_anchor.y, HEAD_REAL - head_anchor.z))
print('ANCHOR seat_top_real', round(pelvis.z - 0.09 + shift.z, 3), 'feet_bottom_real', round(min((mesh_obj.matrix_world @ v.co).z for v in mesh_obj.data.vertices) + shift.z, 3) if False else None)
actor.matrix_world = Matrix.Translation(shift) @ actor.matrix_world
actor.parent = root
anchor = bpy.data.objects.new('subject-head', None)
anchor.empty_display_size = 0.05
anchor.location = head_anchor + shift
anchor.parent = root
bpy.context.scene.collection.objects.link(anchor)
# Lowest point of the mesh (feet) and seat reference.
zs = [ (actor.matrix_world @ v.co).z for v in baked.vertices ]
print('ANCHOR mesh_min_z', round(min(zs),3), 'max_z', round(max(zs),3), 'pelvis_z', round(pelvis.z + shift.z, 3), 'knee_z', round(lknee.z+shift.z,3), 'knee_y', round(lknee.y+shift.y,3), 'toe_y', round(ltoe.y+shift.y,3), 'hand_z', round(lhand.z+shift.z,3))

# Materials: PBR from the converted textures.
def img(name, colorspace):
    im = bpy.data.images.load(os.path.join(texdir, name))
    im.colorspace_settings.name = colorspace
    return im
def make_mat(name, color, normal, mr, alpha=False):
    mat = bpy.data.materials.new(name)
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
    else:
        bsdf.inputs['Roughness'].default_value = 0.7
    bsdf.inputs['Specular IOR Level'].default_value = 0.4
    return mat
mats = {
  'm002_body': make_mat('actor-body', 'body_color.png', 'body_normal.png', 'body_mr.png'),
  'm002_head': make_mat('actor-head', 'head_color.png', 'head_normal.png', 'head_mr.png'),
  'm002_opacity': make_mat('actor-hair', 'hair_color.png', None, None, alpha=True),
}
for slot in actor.material_slots:
    slot.material = mats[slot.material.name.split('.')[0]]
baked.calc_loop_triangles()
print('ANCHOR tris', len(baked.loop_triangles))
bpy.ops.object.select_all(action='DESELECT')
for o in (root, actor, anchor):
    o.select_set(True)
bpy.ops.export_scene.gltf(filepath=out, export_format='GLB', use_selection=True, export_yup=True, export_apply=True, export_image_format='AUTO', export_animations=False, export_skins=False, export_morph=False)
print('ANCHOR wrote', out, os.path.getsize(out))
