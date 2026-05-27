import os
import cv2
import numpy as np
from typing import List, Dict, Optional

# Map COCO class_id → nuScenes category
COCO_TO_NUSCENES = {
    2:  "vehicle.car",
    7:  "vehicle.truck",
    5:  "vehicle.bus",
    3:  "vehicle.motorcycle",
    0:  "human.pedestrian",
    1:  "vehicle.bicycle",
}

# Model singleton
_model = None
_model_loaded = False
_model_error = None


def get_model():
    global _model, _model_loaded, _model_error
    if _model_loaded and _model is not None:
        return _model
    # Nếu chưa load hoặc load thất bại → thử lại
    try:
        import torch

        # PyTorch 2.6+ đổi default weights_only=True, gây lỗi với ultralytics.
        # Patch torch.load để force weights_only=False khi load YOLO weights.
        _original_torch_load = torch.load
        def _patched_torch_load(f, *args, **kwargs):
            kwargs.setdefault('weights_only', False)
            return _original_torch_load(f, *args, **kwargs)
        torch.load = _patched_torch_load

        from ultralytics import YOLO
        weights_path = os.path.join(os.path.dirname(__file__), "..", "weights", "yolov8m.pt")
        weights_path = os.path.abspath(weights_path)
        if not os.path.isfile(weights_path):
            _model_error = f"Không tìm thấy file weights: {weights_path}"
            _model_loaded = True
            torch.load = _original_torch_load
            return None

        _model = YOLO(weights_path)
        _model_loaded = True
        torch.load = _original_torch_load  # restore sau khi load xong

        # Warm-up trên GPU nếu có
        _model.to('cuda' if torch.cuda.is_available() else 'cpu')
        _model_error = None
        return _model
    except Exception as e:
        _model_error = str(e)
        _model_loaded = True
        return None


def reload_model():
    """Reset cache và load lại model — dùng khi server đang chạy mà model bị lỗi."""
    global _model, _model_loaded, _model_error
    _model = None
    _model_loaded = False
    _model_error = None
    return get_model()


def get_model_error() -> Optional[str]:
    return _model_error


def _iou(a: Dict, b: Dict) -> float:
    """Tính IoU giữa 2 bbox (normalized)."""
    ax2 = a['bbox_x'] + a['bbox_w']
    ay2 = a['bbox_y'] + a['bbox_h']
    bx2 = b['bbox_x'] + b['bbox_w']
    by2 = b['bbox_y'] + b['bbox_h']

    ix1 = max(a['bbox_x'], b['bbox_x'])
    iy1 = max(a['bbox_y'], b['bbox_y'])
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter = (ix2 - ix1) * (iy2 - iy1)
    union = a['bbox_w'] * a['bbox_h'] + b['bbox_w'] * b['bbox_h'] - inter
    return inter / union if union > 0 else 0.0


def _overlap_ratio(small: Dict, large: Dict) -> float:
    """Tính tỷ lệ diện tích small bị large che phủ."""
    ax2 = small['bbox_x'] + small['bbox_w']
    ay2 = small['bbox_y'] + small['bbox_h']
    bx2 = large['bbox_x'] + large['bbox_w']
    by2 = large['bbox_y'] + large['bbox_h']

    ix1 = max(small['bbox_x'], large['bbox_x'])
    iy1 = max(small['bbox_y'], large['bbox_y'])
    ix2 = min(ax2, bx2)
    iy2 = min(ay2, by2)

    if ix2 <= ix1 or iy2 <= iy1:
        return 0.0

    inter = (ix2 - ix1) * (iy2 - iy1)
    small_area = small['bbox_w'] * small['bbox_h']
    return inter / small_area if small_area > 0 else 0.0


def _remove_rider_pedestrian(predictions: List[Dict], overlap_threshold: float = 0.4) -> List[Dict]:
    """
    Khi 'human.pedestrian' và 'vehicle.motorcycle'/'vehicle.bicycle' chồng lấp:
    - Mở rộng bbox xe thành union(xe, người) để bao gồm cả người lái
    - Bỏ nhãn pedestrian riêng lẻ
    """
    vehicle_cats = {"vehicle.motorcycle", "vehicle.bicycle"}
    result = []
    used_ped_ids = set()

    vehicles = [p for p in predictions if p['category'] in vehicle_cats]
    pedestrians = [p for p in predictions if p['category'] == 'human.pedestrian']
    others = [p for p in predictions if p['category'] not in vehicle_cats and p['category'] != 'human.pedestrian']

    for veh in vehicles:
        merged = dict(veh)  # copy
        for ped in pedestrians:
            if id(ped) in used_ped_ids:
                continue
            veh_inside_ped = _overlap_ratio(veh, ped)
            ped_inside_veh = _overlap_ratio(ped, veh)
            if veh_inside_ped >= overlap_threshold or ped_inside_veh >= overlap_threshold:
                # Mở rộng bbox thành union của xe + người
                x1 = min(merged['bbox_x'], ped['bbox_x'])
                y1 = min(merged['bbox_y'], ped['bbox_y'])
                x2 = max(merged['bbox_x'] + merged['bbox_w'], ped['bbox_x'] + ped['bbox_w'])
                y2 = max(merged['bbox_y'] + merged['bbox_h'], ped['bbox_y'] + ped['bbox_h'])
                merged['bbox_x'] = round(x1, 6)
                merged['bbox_y'] = round(y1, 6)
                merged['bbox_w'] = round(x2 - x1, 6)
                merged['bbox_h'] = round(y2 - y1, 6)
                used_ped_ids.add(id(ped))
        result.append(merged)

    # Giữ lại pedestrian không liên quan đến xe
    for ped in pedestrians:
        if id(ped) not in used_ped_ids:
            result.append(ped)

    result.extend(others)
    return result


def _filter_overlapping(predictions: List[Dict], iou_threshold: float = 0.5) -> List[Dict]:
    """
    Loại bỏ bbox chồng lấp (IoU > threshold).
    Giữ bbox có confidence cao hơn.
    Xử lý trường hợp người đi xe đạp (pedestrian + bicycle chồng nhau).
    """
    if not predictions:
        return predictions

    sorted_preds = sorted(predictions, key=lambda x: x['confidence'], reverse=True)
    kept = []

    for pred in sorted_preds:
        overlap = any(_iou(pred, k) > iou_threshold for k in kept)
        if not overlap:
            kept.append(pred)

    return kept


def run_inference(
    image_path: str,
    conf_threshold: float = 0.25,
    ai_review_threshold: float = 0.85,
) -> List[Dict]:
    """
    Chạy YOLOv8 inference trên ảnh, trả về list predictions.
    """
    model = get_model()
    if model is None:
        raise RuntimeError(_model_error or "Model chưa được load")

    if not os.path.isfile(image_path):
        raise FileNotFoundError(f"Không tìm thấy ảnh: {image_path}")

    image = cv2.imread(image_path)
    if image is None:
        raise ValueError(f"Không đọc được ảnh: {image_path}")

    h, w = image.shape[:2]
    results = model.predict(image, conf=conf_threshold, verbose=False)[0]

    predictions = []
    for box in results.boxes:
        class_id = int(box.cls[0])
        category = COCO_TO_NUSCENES.get(class_id)
        if category is None:
            continue

        x1, y1, x2, y2 = box.xyxy[0].tolist()
        confidence = float(box.conf[0])

        predictions.append({
            "category":        category,
            "bbox_x":          round(x1 / w, 6),
            "bbox_y":          round(y1 / h, 6),
            "bbox_w":          round((x2 - x1) / w, 6),
            "bbox_h":          round((y2 - y1) / h, 6),
            "confidence":      round(confidence, 4),
            "is_ai_generated": True,
            "needs_review":    confidence < ai_review_threshold,
        })

    # Bỏ pedestrian đang ngồi trên xe máy/xe đạp
    predictions = _remove_rider_pedestrian(predictions, overlap_threshold=0.4)

    # Lọc bbox chồng lấp (giải quyết vấn đề 1 & 4)
    predictions = _filter_overlapping(predictions, iou_threshold=0.5)

    return predictions
