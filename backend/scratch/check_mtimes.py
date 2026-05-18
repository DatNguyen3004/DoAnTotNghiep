import os
import datetime

video_path = r"D:\Dataset-video\nuScenes-mini-video\samples\scene-0757\cam_front.mp4"
cache_path = r"d:\NuLabel\backend\static\uploads\video_cache\scene-0757\cam_front\0.jpg"

if os.path.exists(video_path):
    video_mtime = os.path.getmtime(video_path)
    video_dt = datetime.datetime.fromtimestamp(video_mtime)
    print(f"Video Path: {video_path}")
    print(f"Video Size: {os.path.getsize(video_path)} bytes")
    print(f"Video Modified Time: {video_dt} (timestamp: {video_mtime})")
else:
    print(f"Video file NOT found at: {video_path}")

if os.path.exists(cache_path):
    cache_mtime = os.path.getmtime(cache_path)
    cache_dt = datetime.datetime.fromtimestamp(cache_mtime)
    print(f"Cache Path: {cache_path}")
    print(f"Cache Modified Time: {cache_dt} (timestamp: {cache_mtime})")
else:
    print(f"Cache file NOT found at: {cache_path}")
