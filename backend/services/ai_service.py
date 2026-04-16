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
    if _model_loaded:
        return _model
    try:
        from ultralytics import YOLO
        weights_path = os.path.join(os.path.dirname(__file__), "..", "weights", "yolov8m.pt")
        weights_path = os.path.abspath(weights_path)
        if not os.path.isfile(weights_path):
            _model_error = f"Không tìm thấy file weights: {weights_path}"
            _model_loaded = True
            return None
        _model = YOLO(weights_path)
        _model_loaded = True
        _model_error = None
        return _model
    except Exception as e:
        _model_error = str(e)
        _model_loaded = True
        return None


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

    # Lọc bbox chồng lấp (giải quyết vấn đề 1 & 4)
    predictions = _filter_overlapping(predictions, iou_threshold=0.5)

    return predictions
