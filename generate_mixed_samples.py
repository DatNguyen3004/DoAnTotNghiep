import os
import json
import shutil
import cv2
from pathlib import Path

def generate_mixed_samples():
    print("=== NULABEL MIXED DATASET GENERATOR ===")
    
    # 1. Paths
    nuscenes_root = Path(r"D:\Dataset\v1.0-mini")
    nuscenes_meta = nuscenes_root / "v1.0-mini"
    
    output_root = Path(r"D:\Dataset")
    output_3cam_video = output_root / "Samples_3Cam_Video"
    output_4cam_images = output_root / "Samples_4Cam_Images"
    
    # Check if source dataset exists
    if not nuscenes_root.exists() or not nuscenes_meta.exists():
        print(f"Error: Could not find nuScenes dataset at {nuscenes_root}")
        print("Please check the path.")
        return

    print("Reading nuScenes metadata...")
    try:
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
        cam_map[tok][channel] = sd["filename"]

    # Select the first scene
    first_scene_token = list(scenes.keys())[0]
    scene_info = scenes[first_scene_token]
    print(f"\nUsing Scene: {scene_info.get('name', 'scene-0061')} - {scene_info.get('description', '')}")

    # Get samples for this scene
    scene_samples = [s for s in samples.values() if s["scene_token"] == first_scene_token]
    scene_samples.sort(key=lambda x: x["timestamp"])
    
    # We will extract 30 synchronized frames for videos and 15 frames for static images
    num_frames_video = min(30, len(scene_samples))
    num_frames_images = min(15, len(scene_samples))
    
    # Define camera channels
    cams_3 = ["CAM_FRONT", "CAM_FRONT_LEFT", "CAM_FRONT_RIGHT"]
    cams_4 = ["CAM_FRONT", "CAM_FRONT_LEFT", "CAM_FRONT_RIGHT", "CAM_BACK"]

    # Create directories
    os.makedirs(output_3cam_video, exist_ok=True)
    for cam in cams_4:
        os.makedirs(output_4cam_images / cam.lower(), exist_ok=True)

    # ─────────────────────────────────────────────────────────
    # GENERATE 4-CAMERA STATIC IMAGE DATASET
    # ─────────────────────────────────────────────────────────
    print(f"\nGenerating 4-Camera Static Image Dataset (15 frames) to: {output_4cam_images}")
    target_samples_images = scene_samples[:num_frames_images]
    for idx, sample in enumerate(target_samples_images):
        cams_available = cam_map.get(sample["token"], {})
        filename_seq = f"{idx:03d}.jpg"
        for cam in cams_4:
            if cam in cams_available:
                src_path = nuscenes_root / cams_available[cam]
                dst_path = output_4cam_images / cam.lower() / filename_seq
                if src_path.exists():
                    shutil.copy2(src_path, dst_path)
    print("Done generating 4-Camera images!")

    # ─────────────────────────────────────────────────────────
    # GENERATE 3-CAMERA VIDEO DATASET (MP4 FILES)
    # ─────────────────────────────────────────────────────────
    print(f"\nGenerating 3-Camera Video Dataset ({num_frames_video} frames) to: {output_3cam_video}")
    target_samples_video = scene_samples[:num_frames_video]
    
    for cam in cams_3:
        video_filename = output_3cam_video / f"{cam.lower()}.mp4"
        print(f"-> Creating video for {cam}: {video_filename.name}...")
        
        # Collect all image paths for this camera
        cam_images = []
        for sample in target_samples_video:
            cams_available = cam_map.get(sample["token"], {})
            if cam in cams_available:
                img_path = nuscenes_root / cams_available[cam]
                if img_path.exists():
                    cam_images.append(img_path)
        
        if not cam_images:
            print(f"Warning: No images found for camera {cam}")
            continue
            
        # Read the first image to get dimensions
        first_img = cv2.imread(str(cam_images[0]))
        if first_img is None:
            print(f"Error: Could not read image {cam_images[0]}")
            continue
        h, w, c = first_img.shape
        
        # Initialize VideoWriter (2 frames per second to match nuScenes capture rate)
        fourcc = cv2.VideoWriter_fourcc(*'mp4v')
        out = cv2.VideoWriter(str(video_filename), fourcc, 2, (w, h))
        
        # Write frames to video
        for img_path in cam_images:
            frame = cv2.imread(str(img_path))
            if frame is not None:
                out.write(frame)
        out.release()
        
    print("\n=== GENERATION COMPLETED SUCCESSFULLY ===")
    print(f"1. 3-Camera VIDEO Dataset: {output_3cam_video.absolute()}")
    print("   Files to upload:")
    for cam in cams_3:
        print(f"   - {cam.lower()}.mp4")
        
    print(f"\n2. 4-Camera IMAGE Dataset: {output_4cam_images.absolute()}")
    print("   Directories to upload:")
    for cam in cams_4:
        print(f"   - {output_4cam_images / cam.lower()}")

if __name__ == "__main__":
    generate_mixed_samples()
