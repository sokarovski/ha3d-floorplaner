# Homeplan photorealistic render: run by the Blender/Cycles adapter (server/render/blenderAdapter.ts) as
#   blender -b --factory-startup -noaudio --python-exit-code 1 --python render_scene.py -- <job.json>
# The job file holds {"scene": <glb path>, "output": <png path>, "snapshot": RenderSnapshot,
# "samples": int, "device": "CPU"|"GPU"}. Axes: the snapshot uses Three.js world meters (y up); the
# glTF importer converts y-up to Blender's z-up as (x, y, z) -> (x, -z, y), and the camera and sun here
# use the same conversion. Progress lines start with "HOMEPLAN " so the adapter can parse them.
import json
import math
import sys

import bpy
from mathutils import Matrix, Vector


def log(message):
    print("HOMEPLAN " + message, flush=True)


def to_blender(v):
    return Vector((v[0], -v[2], v[1]))


def vec(obj):
    return (obj["x"], obj["y"], obj["z"])


def setup_device(scene, device):
    scene.cycles.device = "CPU"
    if device != "GPU":
        return
    prefs = bpy.context.preferences.addons["cycles"].preferences
    for backend in ("METAL", "OPTIX", "CUDA", "HIP", "ONEAPI"):
        try:
            prefs.compute_device_type = backend
        except TypeError:
            continue
        prefs.get_devices()
        devices = [d for d in prefs.devices if d.type == backend]
        if devices:
            for d in devices:
                d.use = True
            scene.cycles.device = "GPU"
            log("device GPU " + backend)
            return
    log("device GPU unavailable, using CPU")


def add_camera(scene, camera, width, height):
    data = bpy.data.cameras.new("HomeplanCamera")
    obj = bpy.data.objects.new("HomeplanCamera", data)
    scene.collection.objects.link(obj)
    scene.camera = obj
    position = to_blender(vec(camera["position"]))
    target = to_blender(vec(camera["target"]))
    up = to_blender(vec(camera["up"]))
    forward = (target - position).normalized()
    right = forward.cross(up)
    if right.length < 1e-9:
        right = forward.cross(Vector((0, 1, 0))) if abs(forward.z) > 0.9 else forward.cross(Vector((0, 0, 1)))
    right.normalize()
    true_up = right.cross(forward).normalized()
    basis = Matrix((right, true_up, -forward)).transposed()
    obj.matrix_world = Matrix.Translation(position) @ basis.to_4x4()
    data.sensor_fit = "VERTICAL"
    data.clip_start = 0.01
    data.clip_end = 10000.0
    if camera["mode"] == "top" or camera.get("fovDeg") is None:
        data.type = "ORTHO"
        # With a vertical sensor fit, ortho_scale is the visible height, matching Three's orthoHeightM.
        data.ortho_scale = camera.get("orthoHeightM") or 10.0
    else:
        data.type = "PERSP"
        data.angle_y = math.radians(camera["fovDeg"])


def add_sun_and_world(scene, environment):
    direction = to_blender(environment["sunDirectionWorld"])
    if direction.length < 1e-9:
        direction = Vector((0, 0, 1))
    direction.normalize()
    # Calibration: the preview sun (about 2.4) is doubled and the Nishita sky dimmed so Cycles shows clear sun
    # shadows with exposure similar to the browser preview (tuned on the reference setup).
    strength = float(environment["sunIntensity"]) * 2.0 if direction.z > 0 else 0.0
    if strength > 0:
        light = bpy.data.lights.new("HomeplanSun", "SUN")
        light.energy = strength
        light.angle = math.radians(0.53)
        obj = bpy.data.objects.new("HomeplanSun", light)
        scene.collection.objects.link(obj)
        # A sun light shines along its local -Z, so its +Z points toward the sun.
        obj.rotation_euler = direction.to_track_quat("Z", "Y").to_euler()
    world = bpy.data.worlds.new("HomeplanWorld")
    scene.world = world
    world.use_nodes = True
    nodes = world.node_tree.nodes
    background = nodes["Background"]
    if direction.z > 0:
        sky = nodes.new("ShaderNodeTexSky")
        sky.sky_type = "NISHITA"
        sky.sun_disc = False
        sky.sun_elevation = math.asin(max(-1.0, min(1.0, direction.z)))
        # Nishita's rotation is measured from +Y toward -X (counterclockwise seen from above).
        sky.sun_rotation = math.atan2(-direction.x, direction.y)
        world.node_tree.links.new(sky.outputs["Color"], background.inputs["Color"])
        background.inputs["Strength"].default_value = 0.15
    else:
        background.inputs["Color"].default_value = (0.01, 0.012, 0.02, 1.0)
        background.inputs["Strength"].default_value = 1.0


def add_ground(scene):
    # A large neutral ground just below the finished floor so the house does not float over the
    # below-horizon sky (open-top model: no ceilings are added, only this ground plane).
    bpy.ops.mesh.primitive_plane_add(size=400.0, location=(0.0, 0.0, -0.002))
    ground = bpy.context.active_object
    ground.name = "HomeplanGround"
    material = bpy.data.materials.new("HomeplanGroundMaterial")
    material.use_nodes = True
    principled = material.node_tree.nodes.get("Principled BSDF")
    if principled is not None:
        principled.inputs["Base Color"].default_value = (0.55, 0.56, 0.55, 1.0)
        principled.inputs["Roughness"].default_value = 0.95
    ground.data.materials.append(material)
    log("ground added")


def main():
    config_path = sys.argv[sys.argv.index("--") + 1]
    with open(config_path, "r", encoding="utf-8") as handle:
        config = json.load(handle)
    snapshot = config["snapshot"]
    width = int(snapshot["widthPx"])
    height = int(snapshot["heightPx"])

    log("stage import")
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=config["scene"])
    scene = bpy.context.scene

    log("stage setup")
    scene.render.engine = "CYCLES"
    setup_device(scene, config.get("device", "CPU"))
    scene.cycles.samples = int(config["samples"])
    scene.cycles.use_denoising = True
    scene.cycles.use_adaptive_sampling = True
    scene.render.resolution_x = width
    scene.render.resolution_y = height
    scene.render.resolution_percentage = 100
    scene.render.film_transparent = False
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"
    scene.render.filepath = config["output"]
    scene.view_settings.view_transform = "AgX"

    add_camera(scene, snapshot["camera"], width, height)
    add_sun_and_world(scene, snapshot["environment"])
    add_ground(scene)

    log("stage render")
    bpy.ops.render.render(write_still=True)
    log("stage done")


main()
