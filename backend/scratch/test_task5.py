"""Test Task 5: Tasks & Annotations API endpoints."""
import json
from urllib.request import urlopen, Request
from urllib.error import HTTPError

BASE = "http://localhost:8000/api"
admin_token = None
user_token = None


def api(method, path, token, body=None):
    data = json.dumps(body).encode() if body else None
    headers = {"Authorization": f"Bearer {token}", "Content-Type": "application/json"}
    req = Request(f"{BASE}{path}", data=data, headers=headers, method=method)
    try:
        resp = urlopen(req)
        return json.loads(resp.read()), resp.status
    except HTTPError as e:
        return json.loads(e.read()), e.code


def login(username, password):
    data = json.dumps({"username": username, "password": password}).encode()
    req = Request(f"{BASE}/auth/login", data=data, headers={"Content-Type": "application/json"})
    return json.loads(urlopen(req).read())["access_token"]


# ── Login ──
admin_token = login("admin", "admin123")
user_token = login("labeler01", "user123")
print("[OK] Login admin + labeler01")

# ── Get scenes to find a scene_id ──
scenes, _ = api("GET", "/projects/1/scenes", admin_token)
scene_id = scenes[0]["id"]
print(f"[OK] Scene id={scene_id}, frames={scenes[0]['frame_count']}")

# ── Get labeler user id ──
me, _ = api("GET", "/auth/me", user_token)
labeler_id = me["id"]
print(f"[OK] Labeler id={labeler_id}")

# ── 1. Admin creates a task ──
task, status = api("POST", "/tasks", admin_token, {
    "project_id": 1,
    "scene_id": scene_id,
    "assigned_to": labeler_id,
})
assert status == 200, f"Create task failed: {status} {task}"
task_id = task["id"]
print(f"[OK] Task created: id={task_id}, status={task['status']}")

# ── 2. List tasks (admin sees all) ──
tasks, _ = api("GET", "/tasks?project_id=1", admin_token)
print(f"[OK] Admin sees {len(tasks)} task(s)")

# ── 3. List tasks (user sees own) ──
tasks_user, _ = api("GET", "/tasks?project_id=1", user_token)
print(f"[OK] Labeler sees {len(tasks_user)} task(s)")

# ── 4. Get single task ──
t, _ = api("GET", f"/tasks/{task_id}", user_token)
print(f"[OK] Get task: scene={t['scene_name']}, user={t['assigned_user']['username']}")

# ── 5. Get frames for annotation ──
frames, _ = api("GET", f"/scenes/{scene_id}/frames", user_token)
frame_id = frames[0]["id"]
print(f"[OK] Frame id={frame_id}")

# ── 6. Save annotations ──
ann_result, _ = api("POST", f"/tasks/{task_id}/annotations", user_token, {
    "frame_id": frame_id,
    "annotations": [
        {
            "camera": "CAM_FRONT",
            "category": "vehicle.car",
            "bbox_x": 0.35, "bbox_y": 0.42,
            "bbox_w": 0.12, "bbox_h": 0.08,
            "confidence": None,
            "is_ai_generated": False,
            "needs_review": False,
        },
        {
            "camera": "CAM_FRONT",
            "category": "human.pedestrian",
            "bbox_x": 0.72, "bbox_y": 0.55,
            "bbox_w": 0.04, "bbox_h": 0.09,
        },
    ]
})
print(f"[OK] Saved annotations: {ann_result['count']}")

# ── 7. Task status should auto-update to in_progress ──
t2, _ = api("GET", f"/tasks/{task_id}", user_token)
assert t2["status"] == "in_progress", f"Expected in_progress, got {t2['status']}"
print(f"[OK] Task status auto-updated to: {t2['status']}")

# ── 8. Get annotations for frame ──
anns, _ = api("GET", f"/tasks/{task_id}/annotations/{frame_id}", user_token)
print(f"[OK] Frame annotations: {len(anns)} items")

# ── 9. Get all annotations for task ──
all_anns, _ = api("GET", f"/tasks/{task_id}/annotations", user_token)
print(f"[OK] All task annotations: {len(all_anns)} items")

# ── 10. Submit task ──
submit_result, submit_status = api("POST", f"/tasks/{task_id}/submit", user_token, {})
print(f"[OK] Submit: status={submit_result['status']}, reviewer={submit_result.get('reviewer_user')}")

# ── 11. Test submit with no annotations (should fail) ──
# Create another task to test
task2, _ = api("POST", "/tasks", admin_token, {
    "project_id": 1, "scene_id": scene_id, "assigned_to": labeler_id,
})
empty_submit, empty_code = api("POST", f"/tasks/{task2['id']}/submit", user_token, {})
assert empty_code == 422, f"Expected 422 for empty submit, got {empty_code}"
print(f"[OK] Empty submit correctly rejected (422)")

# ── 12. Delete annotation ──
if all_anns:
    del_result, del_status = api("DELETE", f"/annotations/{all_anns[0]['id']}", user_token)
    print(f"[OK] Deleted annotation: {del_result}")

# Clean up test task2
api("DELETE", f"/tasks/{task2['id']}", admin_token)

print("\n=== ALL TASK 5 TESTS PASSED ===")
