import os
import json
import shutil
from pathlib import Path

def generate_samples():
    print("=== NULABEL DATASET GENERATOR ===")
    
    # 1. Paths
    nuscenes_root = Path(r"D:\Dataset\v1.0-mini")
    nuscenes_meta = nuscenes_root / "v1.0-mini"
    
    output_root = Path(r"D:\Dataset")
    output_3cam = output_root / "Samples_3Cam"
    output_4cam = output_root / "Samples_4Cam"
    
    # Check if source dataset exists
    if not nuscenes_root.exists() or not nuscenes_meta.exists():
        print(f"Error: Could not find nuScenes dataset at {nuscenes_root}")
        print("Please check the path.")
        return

    print("Reading nuScenes metadata...")
    try:
        # Load JSON files
        with open(nuscenes_meta / "scene.json", "r", encoding="utf-8") as f:
            scenes = {item["token"]: item for item in json.load(f)}
        with open(nuscenes_meta / "sample.json", "r", encoding="utf-8") as f:
            samples = {item["token"]: item for item in json.load(f)}
        with open(nuscenes_meta / "sample_data.json", "r", encoding="utf-8") as f:
            sample_data_list = {item["token"]: item for item in json.load(f)}
        with open(nuscenes_meta / "calibrated_sensor.json", "r", encoding="utf-8") as f:
            cal_sensors = {item["token"]: item for item in json.load(f)}
        with open(nuscenes_meta / "sensor.json", "r", encoding="utf-8") as f:
            sensors = {item["token"]: item for item in json.load(f)}
    except Exception as e:
        print(f"Error reading JSON files: {e}")
        return

    # Build channel lookup for calibrated sensors
    channel_lookup = {}
    for cs_token, cs in cal_sensors.items():
        sensor = sensors.get(cs["sensor_token"], {})
        channel_lookup[cs_token] = sensor.get("channel", "")

    # Group sample_data by sample_token and camera channel
    print("Mapping camera streams...")
    cam_map = {}
    for sd in sample_data_list.values():
        channel = channel_lookup.get(sd["calibrated_sensor_token"], "")
        if not channel.startswith("CAM_"):
            continue
        tok = sd["sample_token"]
        if tok not in cam_map:
            cam_map[tok] = {}
        # Store relative source file paths
        cam_map[tok][channel] = sd["filename"]

    # Select the first scene
    first_scene_token = list(scenes.keys())[0]
    scene_info = scenes[first_scene_token]
    print(f"\nSelected sample Scene: {scene_info.get('name', 'scene-0061')} - {scene_info.get('description', '')}")

    # Get samples for this scene
    scene_samples = [s for s in samples.values() if s["scene_token"] == first_scene_token]
    scene_samples.sort(key=lambda x: x["timestamp"])
    
    # We will extract 15 synchronized frames
    num_frames = min(15, len(scene_samples))
    target_samples = scene_samples[:num_frames]
    print(f"Extracting {num_frames} synchronized frames...")

    # Define camera sets
    cameras_3 = ["CAM_FRONT", "CAM_FRONT_LEFT", "CAM_FRONT_RIGHT"]
    cameras_4 = ["CAM_FRONT", "CAM_FRONT_LEFT", "CAM_FRONT_RIGHT", "CAM_BACK"]

    # Create directories
    for cam in cameras_3:
        os.makedirs(output_3cam / cam.lower(), exist_ok=True)
    for cam in cameras_4:
        os.makedirs(output_4cam / cam.lower(), exist_ok=True)

    # Copy files
    print("\nCopying and synchronizing images...")
    
    for idx, sample in enumerate(target_samples):
        cams_available = cam_map.get(sample["token"], {})
        filename_seq = f"{idx:03d}.jpg" # Names like 000.jpg, 001.jpg
        
        # Copy 3-Camera Dataset
        for cam in cameras_3:
            if cam in cams_available:
                src_path = nuscenes_root / cams_available[cam]
                dst_path = output_3cam / cam.lower() / filename_seq
                if src_path.exists():
                    shutil.copy2(src_path, dst_path)
                    
        # Copy 4-Camera Dataset
        for cam in cameras_4:
            if cam in cams_available:
                src_path = nuscenes_root / cams_available[cam]
                dst_path = output_4cam / cam.lower() / filename_seq
                if src_path.exists():
                    shutil.copy2(src_path, dst_path)

    print("\n=== SAMPLE DATASET CREATION COMPLETED ===")
    print(f"1. 3-Camera Sample stored at: {output_3cam.absolute()}")
    print("   Subdirectories:")
    for cam in cameras_3:
        print(f"   - {output_3cam / cam.lower()}")
        
    print(f"\n2. 4-Camera Sample stored at: {output_4cam.absolute()}")
    print("   Subdirectories:")
    for cam in cameras_4:
        print(f"   - {output_4cam / cam.lower()}")

    print("\nHow to use in NuLabel Admin Web:")
    print("1. Go to NuLabel Admin -> Projects -> Select a project -> Click 'Import Multi-Camera Images'.")
    print("2. For each camera input, click to upload and select the corresponding folder above.")
    print("   - For 3-Camera setup: upload 'cam_front', 'cam_front_left', 'cam_front_right' and leave the rest empty.")
    print("   - For 4-Camera setup: upload 'cam_front', 'cam_front_left', 'cam_front_right', 'cam_back' and leave the rest empty.")
    print("3. Click 'Import' and enjoy the dynamic adaptive layout!")

if __name__ == "__main__":
    generate_samples()
