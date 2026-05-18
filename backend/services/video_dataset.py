import os
import cv2

def get_video_frame_path(nuscenes_root: str, scene_name: str, camera_channel: str, frame_index: int) -> str:
    """
    Kiểm tra xem có file video cho scene và camera channel tương ứng không.
    Nếu có, cắt khung hình tại frame_index, lưu vào bộ nhớ cache tĩnh và trả về đường dẫn tệp ảnh đã cache.
    Ngược lại, trả về None.
    """
    camera_lower = camera_channel.lower()
    video_path = os.path.join(nuscenes_root, "samples", scene_name, f"{camera_lower}.mp4")
    
    if not os.path.isfile(video_path):
        return None
        
    # Tạo thư mục cache tĩnh
    cache_dir = os.path.join("static", "uploads", "video_cache", scene_name, camera_lower)
    os.makedirs(cache_dir, exist_ok=True)
    cache_path = os.path.join(cache_dir, f"{frame_index}.jpg")
    
    # Kiểm tra tính hợp lệ của cache đối chiếu với thời gian sửa đổi (mtime) của video
    video_mtime = 0.0
    if os.path.isfile(video_path):
        try:
            video_mtime = os.path.getmtime(video_path)
        except Exception:
            pass

    if os.path.isfile(cache_path):
        try:
            cache_mtime = os.path.getmtime(cache_path)
            # Nếu thời gian sửa đổi của video khác với cache -> Xóa cache cũ để nạp lại
            if abs(video_mtime - cache_mtime) > 0.01:
                os.remove(cache_path)
        except Exception:
            pass
            
    # Cắt khung hình nếu chưa được cache hoặc cache đã bị xóa
    if not os.path.isfile(cache_path):
        cap = cv2.VideoCapture(video_path)
        if cap.isOpened():
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_index)
            ret, frame = cap.read()
            if ret:
                cv2.imwrite(cache_path, frame, [cv2.IMWRITE_JPEG_QUALITY, 90])
                # Đặt mtime của cache bằng đúng mtime của video để đồng bộ tuyệt đối
                try:
                    os.utime(cache_path, (video_mtime, video_mtime))
                except Exception:
                    pass
            cap.release()
            
    if os.path.isfile(cache_path):
        return cache_path
        
    return None
