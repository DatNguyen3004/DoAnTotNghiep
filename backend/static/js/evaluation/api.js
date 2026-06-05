import { BASE_URL } from './constants.js';
import { getToken } from './state.js';

export async function fetchEvaluationDetails(taskId) {
    const res = await fetch(`${BASE_URL}/tasks/${taskId}/evaluation-details`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) {
        if (res.status === 403) {
            throw new Error('403');
        }
        throw new Error('Không thể tải thông tin đối chiếu');
    }
    return res.json();
}

export async function fetchFrameImageBlob(frameId, camera) {
    const res = await fetch(`${BASE_URL}/frames/${frameId}/image/${camera}`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error('Không tải được ảnh');
    return res.blob();
}

export async function fetchPeerChats(taskId) {
    const res = await fetch(`${BASE_URL}/tasks/${taskId}/peer-chats`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error('Không thể tải cuộc trò chuyện');
    return res.json();
}

export async function deletePeerChats(taskId) {
    const res = await fetch(`${BASE_URL}/tasks/${taskId}/peer-chats`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error('Không thể xóa cuộc trò chuyện');
    return res;
}

export async function fetchTaskHistory(taskId) {
    const res = await fetch(`${BASE_URL}/tasks/${taskId}/history`, {
        headers: { Authorization: `Bearer ${getToken()}` }
    });
    if (!res.ok) throw new Error('Không thể tải lịch sử nộp bài');
    return res.json();
}

export async function submitEvaluationStatus(taskId, status, feedback) {
    const res = await fetch(`${BASE_URL}/tasks/${taskId}/admin/override`, {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${getToken()}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ status, feedback })
    });
    if (!res.ok) {
        const err = await res.json();
        throw new Error(err.detail || 'Lỗi gửi đánh giá');
    }
    return res.json();
}
