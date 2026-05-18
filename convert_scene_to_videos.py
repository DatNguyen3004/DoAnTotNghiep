import os
import json
import cv2
from pathlib import Path

def convert_all_scenes_to_videos():
    print("=== NULABEL FULL NUSCENES-MINI TO VIDEO DATASET CONVERTER ===")
    
    # 1. Paths
    nuscenes_root = Path(r"D:\Dataset\v1.0-mini")
    nuscenes_meta = nuscenes_root / "v1.0-mini"
    
    # New independent folder for the video version of the dataset
    output_root = Path(r"D:\Dataset\nuScenes-mini-video")
    
    # Check if source dataset exists
    if not nuscenes_root.exists() or not nuscenes_meta.exists():
        print(f"Error: Could not find original nuScenes dataset at {nuscenes_root}")
        print("Please check the path.")
        return

    print("Reading nuScenes metadata...")
    try:
        with open(nuscenes_meta / "scene.json", "r", encoding="utf-8") as f:
            scenes = json.load(f)
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

    # Target cameras (All 6 cameras of nuScenes)
    cameras = [
        "CAM_FRONT", 
        "CAM_FRONT_LEFT", 
        "CAM_FRONT_RIGHT", 
        "CAM_BACK", 
        "CAM_BACK_LEFT", 
        "CAM_BACK_RIGHT"
    ]

    print(f"\nCreating standalone video dataset at: {output_root.absolute()}")
    os.makedirs(output_root, exist_ok=True)

    # Loop through all 10 scenes
    total_scenes = len(scenes)
    for idx, sc in enumerate(scenes):
        scene_token = sc["token"]
        scene_name = sc["name"]
        scene_desc = sc.get("description", "")
        print(f"\n[{idx+1}/{total_scenes}] Processing {scene_name} - {scene_desc}...")

        # Create scene-specific output directory
        scene_output_dir = output_root / scene_name
        os.makedirs(scene_output_dir, exist_ok=True)

        # Filter and sort samples belonging to this scene
        scene_samples = [s for s in samples.values() if s["scene_token"] == scene_token]
        scene_samples.sort(key=lambda x: x["timestamp"])

        for cam in cameras:
            video_filename = scene_output_dir / f"{cam.lower()}.mp4"
            
            # Collect image paths for this camera
            cam_images = []
            for sample in scene_samples:
                cams_available = cam_map.get(sample["token"], {})
                if cam in cams_available:
                    img_path = nuscenes_root / cams_available[cam]
                    if img_path.exists():
                        cam_images.append(img_path)
                        
            if not cam_images:
                print(f"  Warning: No images found for {cam}")
                continue
                
            # Read first image to get dimensions
            first_img = cv2.imread(str(cam_images[0]))
            if first_img is None:
                print(f"  Error: Could not read image {cam_images[0]}")
                continue
            h, w, c = first_img.shape
            
            # Initialize VideoWriter (2 Hz frame rate to match nuScenes)
            fourcc = cv2.VideoWriter_fourcc(*'mp4v')
            out = cv2.VideoWriter(str(video_filename), fourcc, 2, (w, h))
            
            for img_path in cam_images:
                frame = cv2.imread(str(img_path))
                if frame is not None:
                    out.write(frame)
            out.release()
            
        print(f"  Saved 6 videos inside: {scene_output_dir.name}/")

    print("\n========================================================")
    print("=== DATASET CLONING & VIDEO CONVERSION COMPLETED ===")
    print(f"Location of new video-based dataset:")
    print(f"📁 {output_root.absolute()}")
    print("\nEach folder inside contains exactly 6 synchronized camera videos:")
    for sc in scenes[:3]:
        print(f"- {sc['name']}/")
        print("  - cam_front.mp4, cam_front_left.mp4, cam_front_right.mp4...")
    print("... and 7 other scenes.")
    print("========================================================")

if __name__ == "__main__":
    convert_all_scenes_to_videos()
