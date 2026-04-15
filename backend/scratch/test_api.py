"""Quick test for datasets API endpoints."""
from urllib.request import urlopen, Request
import json

BASE = "http://localhost:8000/api"

# Login
login_data = json.dumps({"username": "admin", "password": "admin123"}).encode()
req = Request(f"{BASE}/auth/login", data=login_data, headers={"Content-Type": "application/json"})
token = json.loads(urlopen(req).read())["access_token"]
print("[OK] Login")

# GET /api/projects/1/scenes
req2 = Request(f"{BASE}/projects/1/scenes", headers={"Authorization": f"Bearer {token}"})
scenes = json.loads(urlopen(req2).read())
print(f"[OK] Scenes in project 1: {len(scenes)}")
scene = scenes[0]
print(f"     First: {scene['scene_token']} ({scene['frame_count']} frames)")

# GET /api/scenes/{id}/frames
req3 = Request(f"{BASE}/scenes/{scene['id']}/frames", headers={"Authorization": f"Bearer {token}"})
frames = json.loads(urlopen(req3).read())
print(f"[OK] Frames in scene {scene['id']}: {len(frames)}")
frame = frames[0]
cam = frame["cam_front"]
print(f"     Frame 0: id={frame['id']}, cam_front={cam[:60] if cam else 'None'}...")

# GET /api/frames/{id}/metadata
req4 = Request(f"{BASE}/frames/{frame['id']}/metadata", headers={"Authorization": f"Bearer {token}"})
meta = json.loads(urlopen(req4).read())
print(f"[OK] Metadata cameras: {list(meta['cameras'].keys())}")

# GET /api/frames/{id}/image/CAM_FRONT
req5 = Request(f"{BASE}/frames/{frame['id']}/image/CAM_FRONT", headers={"Authorization": f"Bearer {token}"})
resp5 = urlopen(req5)
img_bytes = resp5.read()
print(f"[OK] Image: status={resp5.status}, type={resp5.headers['Content-Type']}, size={len(img_bytes)} bytes")

print("\n=== ALL TESTS PASSED ===")
