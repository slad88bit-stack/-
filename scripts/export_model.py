"""Export Baby Noob character rig, meshes, animations, and textures from baby_noob_animated.blend."""
import os
import bpy


def linear_to_srgb_byte(c: float) -> int:
    c = max(0.0, min(1.0, c))
    if c <= 0.0031308:
        s = 12.92 * c
    else:
        s = 1.055 * (c ** (1.0 / 2.4)) - 0.055
    return max(0, min(255, int(round(s * 255.0))))


def main():
    repo_root = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
    blend_path = os.path.join(repo_root, "baby_noob_animated.blend")
    models_dir = os.path.join(repo_root, "public", "models")
    textures_dir = os.path.join(repo_root, "public", "textures")
    os.makedirs(models_dir, exist_ok=True)
    os.makedirs(textures_dir, exist_ok=True)

    bpy.ops.wm.open_mainfile(filepath=blend_path)

    # 1. Extract packed textures to public/textures
    for img in bpy.data.images:
        if img.packed_file:
            out_path = os.path.join(textures_dir, img.name)
            with open(out_path, "wb") as f:
                f.write(img.packed_file.data)
            print(f"Extracted texture: {out_path}")

    # 2. Clean up materials for glTF export so base colors & roughness export faithfully
    # (Dynamic face texture and clipped badge decal are applied cleanly in Three.js using the preserved UVs.)
    material_colors = {
        "Mat_BabyNoob_Head": ((0.8468732, 0.5332764, 0.0069954, 1.0), 0.30),
        "Mat_BabyNoob_Limbs": ((0.8468732, 0.5332764, 0.0069954, 1.0), 0.30),
        "Mat_BabyNoob_Torso": ((0.0018212, 0.0648033, 0.3813260, 1.0), 0.32),
        "Mat_BabyNoob_Legs": ((0.3185468, 0.4452012, 0.0368894, 1.0), 0.34),
    }

    for mat_name, (rgba, roughness) in material_colors.items():
        mat = bpy.data.materials.get(mat_name)
        if not mat or not mat.use_nodes:
            continue
        nt = mat.node_tree
        bsdf = next((n for n in nt.nodes if n.type == "BSDF_PRINCIPLED"), None)
        if not bsdf:
            continue
        # Unlink procedural Mix nodes on Base Color so glTF exports clean PBR BaseColor
        bc_input = bsdf.inputs["Base Color"]
        for link in list(bc_input.links):
            nt.links.remove(link)
        bc_input.default_value = rgba
        bsdf.inputs["Roughness"].default_value = roughness
        bsdf.inputs["Metallic"].default_value = 0.0
        srgb_hex = "#{:02x}{:02x}{:02x}".format(
            linear_to_srgb_byte(rgba[0]),
            linear_to_srgb_byte(rgba[1]),
            linear_to_srgb_byte(rgba[2]),
        )
        print(f"Prepared {mat_name}: linear={rgba[:3]} sRGB={srgb_hex} roughness={roughness}")

    # 3. Reset rig to rest pose before export and select ONLY BabyNoob_Rig + character meshes
    rig = bpy.data.objects["BabyNoob_Rig"]
    character_objects = [rig] + [obj for obj in bpy.data.objects if obj.parent == rig]
    print("Exporting objects:", [o.name for o in character_objects])

    # Clear active action so rest pose is default, while keeping all 5 actions in bpy.data.actions
    if rig.animation_data:
        rig.animation_data.action = None
    for pb in rig.pose.bones:
        pb.location = (0.0, 0.0, 0.0)
        pb.rotation_euler = (0.0, 0.0, 0.0)
        pb.rotation_quaternion = (1.0, 0.0, 0.0, 0.0)
        pb.scale = (1.0, 1.0, 1.0)
    bpy.context.view_layer.update()

    # Select only character objects
    bpy.ops.object.select_all(action="DESELECT")
    for obj in character_objects:
        obj.select_set(True)
    bpy.context.view_layer.objects.active = rig

    glb_path = os.path.join(models_dir, "baby_noob.glb")
    bpy.ops.export_scene.gltf(
        filepath=glb_path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_texcoords=True,
        export_normals=True,
        export_materials="EXPORT",
        export_skins=True,
        export_animations=True,
        export_animation_mode="ACTIONS",
        export_nla_strips=False,
        export_frame_range=False,
        export_force_sampling=True,
        export_bake_animation=False,
        export_def_bones=False,
        export_optimize_animation_size=True,
    )
    size_kb = os.path.getsize(glb_path) / 1024.0
    print(f"Successfully exported {glb_path} ({size_kb:.1f} KB)")


if __name__ == "__main__":
    main()
