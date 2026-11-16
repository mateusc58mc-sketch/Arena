import bpy, os
from math import sin, pi
from mathutils import Matrix, Quaternion, Euler

# ============================================================
# Humano masculino — pipeline 7 (nov 2026) — CANÔNICO:
#   modelo JÁ RIGADO no Mixamo (Standing 2H Magic Attack (1).fbx,
#   BaseMesh_Man_Simple skinned, esqueleto mixamorig 65 bones cm).
#   Objeto: rot X≈90° mantida + scale 0.01 => humano ~1.79m, pés no chão.
#
#   Clipes (TODOS na convenção cm nativa — o pack antigo (49 bones, m,
#   legs 3x mais largas) NÃO serve):
#     HUMANO_IDLE   — procedural (sway leve no rig; 90f @30 = 3,0s)
#     HUMANO_ATTACK — Stable Sword Inward Slash.fbx (transfer por basis;
#                     rest compensado) 67f = 2,23s
#     HUMANO_HIT    — procedural recoil 16f = 0,53s
#     HUMANO_DEATH  — Standing Death Left 01.fbx 69f = 2,30s
# ============================================================

RIGGED_FBX = r"C:\Users\Dell\Downloads\novo modelo humano\Standing 2H Magic Attack 01 (1).fbx"
NEW_PACK = r"C:\Users\Dell\Downloads\novo modelo humano"
OUT_GLB = r"C:\dev\aetheria-idle\public\racas\human\human_male_rigged.glb"

ATTACK_SRC = os.path.join(NEW_PACK, "Stable Sword Inward Slash.fbx")
DEATH_SRC = os.path.join(NEW_PACK, "Standing Death Left 01.fbx")
FPS = 30

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.fbx(filepath=RIGGED_FBX)

arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
meshes = [o for o in bpy.data.objects if o.type == "MESH"]
print("rigged bodies:", [(o.name, len(o.data.vertices)) for o in meshes])

if arm.animation_data:
    arm.animation_data_clear()
for a in list(bpy.data.actions):
    bpy.data.actions.remove(a)

print("armature:", arm.name, "bones:", len(arm.data.bones))

REST_T = {b.name: b.matrix_local for b in arm.data.bones}


def fresh_action(name):
    act = bpy.data.actions.new(name)
    act.use_fake_user = True
    arm.animation_data_create()
    arm.animation_data.action = act
    slot = act.slots.new(id_type="OBJECT", name=name)
    arm.animation_data.action_slot = slot
    return act


def clear_pose():
    bpy.context.view_layer.objects.active = arm
    if bpy.context.object.mode != "OBJECT":
        bpy.ops.object.mode_set(mode="OBJECT")
    bpy.ops.object.mode_set(mode="POSE")
    for pb in arm.pose.bones:
        pb.matrix_basis = Matrix.Identity(4)
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()


# ------------------------------------------------------------
# Transfer por basis com compensação de rest (para clipes nativos cm)
# ------------------------------------------------------------
def transfer_clip(name, path):
    before = set(o.name for o in bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=path)
    src = next(o for o in bpy.data.objects if o.name not in before and o.type == "ARMATURE")
    src_action = src.animation_data.action
    f0, f1 = (int(v) for v in src_action.frame_range)
    print(f"=== {name} (transfer): frames {f0}..{f1} ===")

    clear_pose()
    fresh_action(name)

    pb_map = {}
    for b in src.data.bones:
        pb = arm.pose.bones.get(b.name)
        if pb is not None:
            pb_map[b.name] = (pb, b.matrix_local.to_quaternion(), REST_T[b.name].to_quaternion())
    print(f"   bones mapeados: {len(pb_map)}/{len(src.data.bones)}")

    for f in range(f0, f1 + 1):
        bpy.context.scene.frame_set(f)
        bpy.context.view_layer.update()
        for n, (pb, restSq, restTq) in pb_map.items():
            sb = src.pose.bones[n]
            basisS = sb.matrix_basis
            use_loc = (n == "mixamorig:Hips")
            loc = basisS.to_translation() if use_loc else None
            quat = restTq @ (restSq @ basisS.to_quaternion())
            mat = quat.to_matrix().to_4x4()
            if loc is not None:
                mat.translation = loc
                pb.location = loc
                pb.keyframe_insert("location", frame=f)
            pb.matrix_basis = mat
            pb.keyframe_insert("rotation_quaternion", frame=f)

    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.data.objects.remove(src, do_unlink=True)
    ncur = count_curves()
    print(f"   transfer {name}: bones={len(pb_map)} curves={ncur}")
    if ncur <= 0:
        raise RuntimeError(f"{name}: sem curvas")
    arm.animation_data_clear()


def count_curves():
    n = 0
    act = arm.animation_data.action
    for layer in act.layers:
        for strip in layer.strips:
            for cb in strip.channelbags:
                n += len(cb.fcurves)
    return n


# ------------------------------------------------------------
# Clipes procedurais (idle/hit) — deltas-LOCAIS sobre a rest,
# expressos por euler pequeno em cada bone (canais por keyframe).
# ------------------------------------------------------------
def bake_procedural(name, frames, eval_pose):
    """eval_pose(f) -> {bone_name: (quat, loc)} deltas locais."""
    clear_pose()
    fresh_action(name)
    for f in range(1, frames + 1):
        t = (f - 1) / FPS
        pose = eval_pose(t, frames)
        for n, (quat, loc) in pose.items():
            pb = arm.pose.bones.get(n)
            if pb is None:
                continue
            mat = quat.to_matrix().to_4x4()
            if loc is not None:
                mat.translation = loc
            pb.matrix_basis = mat
            pb.rotation_mode = "QUATERNION"
            pb.keyframe_insert("rotation_quaternion", frame=f)
            if loc is not None:
                pb.location = loc
                pb.keyframe_insert("location", frame=f)
    bpy.ops.object.mode_set(mode="OBJECT")
    ncur = count_curves()
    print(f"   procedural {name}: frames 1..{frames} curves={ncur}")
    if ncur <= 0:
        raise RuntimeError(f"{name}: sem curvas")
    arm.animation_data_clear()


IDLE_BONES_SWAY = {
    "mixamorig:Spine1": 0.028,
    "mixamorig:Spine2": 0.022,
    "mixamorig:Neck": 0.012,
}
IDLE_ARMS_SWAY = {
    "mixamorig:LeftArm": 0.05,
    "mixamorig:RightArm": 0.05,
}


def idle_pose(t, frames):
    phase = 2 * pi * t / (frames / FPS)
    pose = {}
    # torso: leve sway lateral + respiração (recuo X mínimo)
    pose["mixamorig:Hips"] = (
        Euler((0.012 * sin(phase), 0.0, 0.02 * sin(phase * 0.5)), "XYZ").to_quaternion(),
        None,
    )
    for n, amp in IDLE_BONES_SWAY.items():
        pose[n] = (Euler((0.0, 0.0, amp * sin(phase)), "XYZ").to_quaternion(), None)
    for n, amp in IDLE_ARMS_SWAY.items():
        pose[n] = (Euler((amp * 0.5 * sin(phase * 0.5 + 1.2), 0.0, amp * sin(phase)), "XYZ").to_quaternion(), None)
    return pose


HIT_RECOIL = {
    "mixamorig:Hips": -0.10,
    "mixamorig:Spine": -0.12,
    "mixamorig:Spine1": -0.16,
    "mixamorig:Spine2": -0.13,
    "mixamorig:Neck": -0.08,
    "mixamorig:Head": -0.10,
}
HIT_LEGS = {
    "mixamorig:LeftUpLeg": 0.16,
    "mixamorig:RightUpLeg": 0.16,
    "mixamorig:LeftLeg": 0.30,
    "mixamorig:RightLeg": 0.30,
}


def hit_pose(t, frames):
    dur = frames / FPS
    bump = sin(pi * min(1.0, t / dur))
    pose = {}
    for n, amp in HIT_RECOIL.items():
        pose[n] = (Euler((amp * bump, 0.0, 0.0), "XYZ").to_quaternion(), None)
    for n, amp in HIT_LEGS.items():
        pose[n] = (Euler((amp * bump, 0.0, 0.0), "XYZ").to_quaternion(), None)
    # quadris desce levemente enquanto os joelhos dobram (mm->cm: −8cm)
    pose["mixamorig:Hips"] = (
        Euler((-0.10 * bump, 0.0, 0.0), "XYZ").to_quaternion(),
        (0.0, -8.0 * bump, 0.0),
    )
    return pose


# (não transferimos mais nada do pack antigo)
transfer_clip("HUMANO_ATTACK", ATTACK_SRC)
transfer_clip("HUMANO_DEATH", DEATH_SRC)
bake_procedural("HUMANO_IDLE", int(FPS * 3.0), idle_pose)
bake_procedural("HUMANO_HIT", int(FPS * 0.53), hit_pose)

for a in list(bpy.data.actions):
    if not a.name.startswith("HUMANO_"):
        bpy.data.actions.remove(a)
print("actions:", [(a.name, tuple(a.frame_range)) for a in bpy.data.actions])

# ------------------------------------------------------------
# Objeto final + export
# ------------------------------------------------------------
bpy.context.view_layer.objects.active = arm
if bpy.context.object.mode != "OBJECT":
    bpy.ops.object.mode_set(mode="OBJECT")
clear_pose()  # rest neutra para o bind
arm.location = (0.0, 0.0, 0.0)
arm.scale = (0.01, 0.01, 0.01)
bpy.context.scene.frame_set(1)

if arm.animation_data is None:
    arm.animation_data_create()
arm.animation_data.action = None
if arm.animation_data.nla_tracks:
    arm.animation_data.nla_tracks.clear()
for a in sorted(bpy.data.actions, key=lambda x: x.name):
    if not a.name.startswith("HUMANO_"):
        continue
    track = arm.animation_data.nla_tracks.new()
    track.name = f"NLA_{a.name}"
    f0, f1 = a.frame_range
    strip = track.strips.new(a.name, int(f0), a)
    track.mute = False
    print(f"   NLA strip: {strip.name} frames {f0:.0f}..{f1:.0f}")

bpy.ops.object.select_all(action="DESELECT")
arm.select_set(True)
for o in meshes:
    o.select_set(True)
bpy.ops.export_scene.gltf(
    filepath=OUT_GLB,
    export_format="GLB",
    export_yup=True,
    export_animation_mode="ACTIONS",
    export_animations=True,
    export_skins=True,
    export_morph=False,
    export_rest_position_armature=True,
)
print("EXPORTED:", OUT_GLB, os.path.getsize(OUT_GLB) // 1024, "KB")
