import { state, taskId } from './state.js';
import { CLASSES, CLASS_MAP, CAMERAS, CAM_LABELS } from './constants.js';
import { submitEvaluationStatus } from './api.js';
import { showToast } from '../Evaluation.js';

export function selectEvalStatus(status) {
    state.selectedEvalStatusValue = status;
    const btnApprove = document.getElementById('btnEvalApprove');
    const btnReject = document.getElementById('btnEvalReject');

    if (!btnApprove || !btnReject) return;

    if (status === 'approved') {
        btnApprove.style.background = '#ECFDF5';
        btnApprove.style.color = '#059669';
        btnApprove.style.borderColor = '#10B981';

        btnReject.style.background = '#fff';
        btnReject.style.color = '#64748B';
        btnReject.style.borderColor = '#CBD5E1';
    } else {
        btnReject.style.background = '#FEF2F2';
        btnReject.style.color = '#DC2626';
        btnReject.style.borderColor = '#EF4444';

        btnApprove.style.background = '#fff';
        btnApprove.style.color = '#64748B';
        btnApprove.style.borderColor = '#CBD5E1';
    }
}

export async function submitEvaluation() {
    if (!state.selectedEvalStatusValue) {
        showToast('Vui lòng chọn trạng thái đánh giá (Đạt yêu cầu hoặc Chưa đạt yêu cầu).', 'error');
        return;
    }
    const feedbackEl = document.getElementById('evalFeedback');
    const feedback = feedbackEl ? feedbackEl.value.trim() : '';
    const btn = document.getElementById('btnSubmitEval');
    if (!btn) return;
    
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Đang gửi...`;

    try {
        await submitEvaluationStatus(taskId, state.selectedEvalStatusValue, feedback);
        showToast('Đã gửi đánh giá chất lượng thành công!', 'success');
        setTimeout(() => {
            window.location.reload();
        }, 1200);
    } catch (e) {
        console.error(e);
        showToast(e.message || 'Lỗi gửi đánh giá', 'error');
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-paper-plane"></i> Gửi đánh giá`;
    }
}

export function showEvaluationStats() {
    const modal = document.getElementById('modalEvaluationStats');
    const container = document.getElementById('statsModalBody');
    if (!modal || !container || !state.evaluationData) return;

    // 1. Math calculation
    let totalAi = 0;
    let totalUser = 0;
    let totalMatched = 0;
    let totalMissing = 0;
    let totalExtra = 0;
    let totalIoU = 0;
    let matchedIoUCount = 0;
    let aiCorrectCount = 0;

    const classStats = {};
    CLASSES.forEach(c => {
        classStats[c.id] = { matched: 0, missing: 0, extra: 0, sumIoU: 0 };
    });

    const cameraStats = {};
    const confusionMap = {};

    function calculateIoU(boxA, boxB) {
        const ax1 = boxA.bbox_x, ay1 = boxA.bbox_y;
        const ax2 = boxA.bbox_x + boxA.bbox_w, ay2 = boxA.bbox_y + boxA.bbox_h;
        const bx1 = boxB.bbox_x, by1 = boxB.bbox_y;
        const bx2 = boxB.bbox_x + boxB.bbox_w, by2 = boxB.bbox_y + boxB.bbox_h;

        const ix1 = Math.max(ax1, bx1);
        const iy1 = Math.max(ay1, by1);
        const ix2 = Math.min(ax2, bx2);
        const iy2 = Math.min(ay2, by2);

        if (ix2 <= ix1 || iy2 <= iy1) return 0;
        const inter = (ix2 - ix1) * (iy2 - iy1);
        const union = (boxA.bbox_w * boxA.bbox_h) + (boxB.bbox_w * boxB.bbox_h) - inter;
        return union > 0 ? (inter / union) : 0;
    }

    state.evaluationData.frames.forEach(frame => {
        let totalUserBoxesOnFrame = 0;
        let totalAiBoxesOnFrame = 0;
        frame.cameras.forEach(camKey => {
            const comp = frame.comparison[camKey];
            if (comp) {
                if (comp.user_boxes) totalUserBoxesOnFrame += comp.user_boxes.length;
                if (comp.ai_boxes) totalAiBoxesOnFrame += comp.ai_boxes.length;
            }
        });

        frame.cameras.forEach(camKey => {
            if (!cameraStats[camKey]) {
                cameraStats[camKey] = { totalSimilarity: 0, count: 0, totalUser: 0, matched: 0, missing: 0, extra: 0 };
            }

            const comp = frame.comparison[camKey];
            if (!comp) return;

            if (typeof comp.similarity === 'number') {
                const simVal = comp.similarity;
                cameraStats[camKey].totalSimilarity += simVal;
                cameraStats[camKey].count++;
            }

            let matchedCount = 0;
            let missingCount = comp.missing ? comp.missing.length : 0;
            let extraCount = comp.extra ? comp.extra.length : 0;
            if (comp.matched) {
                comp.matched.forEach(m => {
                    if (m.iou >= 0.85) {
                        matchedCount++;
                    } else {
                        missingCount++;
                        extraCount++;
                    }
                });
            }
            const aiCount = comp.ai_boxes ? comp.ai_boxes.length : 0;
            const userCount = comp.user_boxes ? comp.user_boxes.length : 0;

            totalAi += aiCount;
            totalUser += userCount;
            totalMatched += matchedCount;
            totalMissing += missingCount;
            totalExtra += extraCount;

            aiCorrectCount += matchedCount;

            cameraStats[camKey].totalUser += userCount;
            cameraStats[camKey].matched += matchedCount;
            cameraStats[camKey].missing += missingCount;
            cameraStats[camKey].extra += extraCount;

            if (comp.matched) {
                comp.matched.forEach(m => {
                    const cat = m.user_box.category;
                    if (classStats[cat]) {
                        if (m.iou >= 0.85) {
                            classStats[cat].matched++;
                            classStats[cat].sumIoU += m.iou;
                            totalIoU += m.iou;
                            matchedIoUCount++;
                        } else {
                            classStats[cat].missing++;
                            classStats[cat].extra++;
                        }
                    }
                });
            }

            if (comp.missing) {
                comp.missing.forEach(box => {
                    const cat = box.category;
                    if (classStats[cat]) {
                        classStats[cat].missing++;
                    }
                });
            }

            if (comp.extra) {
                comp.extra.forEach(box => {
                    const cat = box.category;
                    if (classStats[cat]) {
                        classStats[cat].extra++;
                    }
                });
            }

            if (comp.missing && comp.extra) {
                comp.missing.forEach(aiBox => {
                    comp.extra.forEach(userBox => {
                        const iouVal = calculateIoU(aiBox, userBox);
                        if (iouVal > 0.3) {
                            const key = `${aiBox.category}::${userBox.category}`;
                            confusionMap[key] = (confusionMap[key] || 0) + 1;
                        }
                    });
                });
            }
        });
    });

    // Quality values
    let totalFrameSimSum = 0;
    state.evaluationData.frames.forEach(frame => {
        let frameSim = 0;
        let totalUserAnnotations = 0;
        let totalAIAnnotations = 0;
        CAMERAS.forEach(camKey => {
            const comp = frame.comparison[camKey];
            if (comp) {
                if (typeof comp.similarity === 'number') {
                    frameSim += comp.similarity;
                }
                if (comp.user_boxes) totalUserAnnotations += comp.user_boxes.length;
                if (comp.ai_boxes) totalAIAnnotations += comp.ai_boxes.length;
            }
        });
        let avgFrameSim = frameSim / 6;
        if (totalUserAnnotations === 0 && totalAIAnnotations > 0) {
            avgFrameSim = 0;
        }
        totalFrameSimSum += avgFrameSim;
    });
    const overallSimilarity = state.evaluationData.frames.length > 0 ? Math.round(totalFrameSimSum / state.evaluationData.frames.length) : 0;

    const frameReliabilities = [];
    state.evaluationData.frames.forEach(frame => {
        let frameFirstCount = 0;
        let frameAiCount = 0;
        let frameFinalCount = 0;
        let frameMatchedCount = 0;

        CAMERAS.forEach(camKey => {
            const comp = frame.comparison[camKey];
            if (comp) {
                const aiCount = comp.ai_boxes ? comp.ai_boxes.length : 0;
                const userCount = comp.user_boxes ? comp.user_boxes.length : 0;

                frameAiCount += aiCount;
                frameFinalCount += userCount;

                if (comp.first_submission && comp.first_submission.has_snapshot) {
                    const firstMatchedList = comp.first_submission.matched ? comp.first_submission.matched : [];
                    const firstExtraList = comp.first_submission.extra ? comp.first_submission.extra : [];

                    frameFirstCount += (firstMatchedList.length + firstExtraList.length);
                    const matchedOverThreshold = firstMatchedList.filter(m => m.iou >= 0.85).length;
                    frameMatchedCount += matchedOverThreshold;
                } else {
                    frameFirstCount += userCount;
                    frameMatchedCount += userCount;
                }
            }
        });

        let frameRel = 100;
        if (frameFirstCount === 0) {
            if (frameAiCount === 0) {
                frameRel = 100;
            } else {
                frameRel = 0;
            }
        } else {
            if (frameFinalCount === 0) {
                frameRel = 0;
            } else {
                frameRel = Math.min(Math.round((frameMatchedCount / frameFinalCount) * 100), 100);
            }
        }
        frameReliabilities.push(frameRel);
    });

    const userPrecision = frameReliabilities.length > 0 ? Math.round(frameReliabilities.reduce((a, b) => a + b, 0) / frameReliabilities.length) : 100;
    const aiPrecision = totalAi > 0 ? Math.min(Math.round((aiCorrectCount / totalAi) * 100), 100) : 100;
    const averageIoUVal = matchedIoUCount > 0 ? Math.round((totalIoU / matchedIoUCount) * 100) : 0;

    const timeSpentSec = state.evaluationData.time_spent || 0;
    const timeSpentMin = (timeSpentSec / 60).toFixed(1);

    // Helper for rendering rings
    function makeProgressRing(percent, size, strokeWidth, strokeColor, trailColor, textColor) {
        const radius = (size - strokeWidth) / 2;
        const circumference = 2 * Math.PI * radius;
        const offset = circumference - (percent / 100) * circumference;
        return `
            <svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}" style="transform: rotate(-90deg);">
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent" stroke="${trailColor}" stroke-width="${strokeWidth}" />
                <circle cx="${size / 2}" cy="${size / 2}" r="${radius}" fill="transparent" stroke="${strokeColor}" stroke-width="${strokeWidth}"
                        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" stroke-linecap="round" />
            </svg>
            <div style="position:absolute;display:flex;flex-direction:column;align-items:center;justify-content:center;">
                <span style="font-size:18px;font-weight:800;color:${textColor};font-family:Inter,sans-serif;">${percent}%</span>
            </div>
        `;
    }

    function getMetricColor(percent) {
        if (percent >= 85) {
            return { color: '#10B981', trail: '#D1FAE5' };
        } else if (percent >= 70) {
            return { color: '#3B82F6', trail: '#DBEAFE' };
        } else if (percent >= 50) {
            return { color: '#F59E0B', trail: '#FEF3C7' };
        } else {
            return { color: '#EF4444', trail: '#FEE2E2' };
        }
    }

    const simColors = getMetricColor(overallSimilarity);
    const userColors = getMetricColor(userPrecision);
    const aiColors = getMetricColor(aiPrecision);

    // Determine overall feedback text
    let ratingText = 'Độ lệch lớn';
    let ratingColor = '#EF4444';
    let ratingBg = '#FEF2F2';
    if (overallSimilarity >= 85) {
        ratingText = 'Xuất sắc';
        ratingColor = '#10B981';
        ratingBg = '#ECFDF5';
    } else if (overallSimilarity >= 70) {
        ratingText = 'Đạt yêu cầu';
        ratingColor = '#3B82F6';
        ratingBg = '#EFF6FF';
    } else if (overallSimilarity >= 50) {
        ratingText = 'Cần kiểm tra';
        ratingColor = '#F59E0B';
        ratingBg = '#FFFBEB';
    }

    // Suggestions logic
    const isTimeTooShort = (timeSpentSec > 0 && timeSpentSec < 120);
    const isSimilarityTooHigh = (overallSimilarity >= 99);

    let suggestionBg = '#F0FDF4';
    let suggestionBorder = '#BBF7D0';
    let suggestionIconBg = '#DCFCE7';
    let suggestionIconColor = '#16A34A';
    let suggestionIcon = 'fa-solid fa-circle-check';
    let suggestionTitleColor = '#166534';
    let suggestionTextColor = '#14532D';
    let suggestionText = 'Hiện không phát hiện có gì bất thường.';

    if (isTimeTooShort && isSimilarityTooHigh) {
        suggestionBg = '#FEF2F2';
        suggestionBorder = '#FCA5A5';
        suggestionIconBg = '#FEE2E2';
        suggestionIconColor = '#EF4444';
        suggestionIcon = 'fa-solid fa-triangle-exclamation';
        suggestionTitleColor = '#991B1B';
        suggestionTextColor = '#7F1D1D';
        suggestionText = `<b>Nghi ngờ gian lận:</b> Người dùng gán nhãn cực nhanh (${timeSpentMin} phút) và kết quả trùng khớp với AI tuyệt đối (${overallSimilarity}%). Rất có thể người này chỉ chạy AI rồi nộp bài luôn.`;
    } else if (isTimeTooShort) {
        suggestionBg = '#FFFBEB';
        suggestionBorder = '#FDE68A';
        suggestionIconBg = '#FEF3C7';
        suggestionIconColor = '#D97706';
        suggestionIcon = 'fa-solid fa-triangle-exclamation';
        suggestionTitleColor = '#92400E';
        suggestionTextColor = '#78350F';
        suggestionText = `<b>Thời gian quá ngắn:</b> Người gán nhãn hoàn thành nhiệm vụ chỉ trong ${timeSpentMin} phút. Vui lòng kiểm tra kỹ xem họ có làm ẩu hoặc bỏ sót nhãn không.`;
    } else if (isSimilarityTooHigh) {
        suggestionBg = '#FFFBEB';
        suggestionBorder = '#FDE68A';
        suggestionIconBg = '#FEF3C7';
        suggestionIconColor = '#D97706';
        suggestionIcon = 'fa-solid fa-triangle-exclamation';
        suggestionTitleColor = '#92400E';
        suggestionTextColor = '#78350F';
        suggestionText = `<b>Độ trùng khớp cực cao:</b> Kết quả trùng khớp gần như hoàn toàn với AI (${overallSimilarity}%). Cần rà soát xem người dùng có thực sự kiểm tra và sửa đổi các nhãn lỗi từ AI hay không.`;
    }

    // Camera stats list
    const cameraRows = Object.keys(cameraStats).map(camKey => {
        const c = cameraStats[camKey];
        const avg = c.count > 0 ? Math.round(c.totalSimilarity / c.count) : 0;
        let camColor = '#10B981';
        if (avg < 50) camColor = '#EF4444';
        else if (avg < 75) camColor = '#F59E0B';
        return {
            name: CAM_LABELS[camKey] || camKey,
            avg: avg,
            color: camColor,
            user: c.totalUser,
            matched: c.matched,
            missing: c.missing,
            extra: c.extra
        };
    }).sort((a, b) => b.avg - a.avg);

    // Confusion list
    const confusionList = Object.keys(confusionMap).map(key => {
        const [aiCat, userCat] = key.split('::');
        const count = confusionMap[key];
        const aiCls = CLASS_MAP[aiCat] || { name: aiCat };
        const userCls = CLASS_MAP[userCat] || { name: userCat };
        return {
            ai: aiCls.name,
            user: userCls.name,
            count: count
        };
    }).sort((a, b) => b.count - a.count);

    // Render HTML content
    container.innerHTML = `
        <!-- Overview Cards -->
        <div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(220px,1fr));gap:16px;margin-bottom:24px;">
            <div class="stats-card">
                <div style="width:48px;height:48px;border-radius:10px;background:#EEF2FF;color:#4F46E5;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                    <i class="fa-solid fa-robot"></i>
                </div>
                <div>
                    <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;">Tổng nhãn <b style="color:black">AI</b></div>
                    <div style="font-size:22px;font-weight:800;color:#0F172A;margin-top:2px;">${totalAi}</div>
                </div>
            </div>
            
            <div class="stats-card">
                <div style="width:48px;height:48px;border-radius:10px;background:#EFF6FF;color:#2563EB;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                    <i class="fa-solid fa-user"></i>
                </div>
                <div>
                    <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;">Tổng nhãn Người dùng</div>
                    <div style="font-size:22px;font-weight:800;color:#0F172A;margin-top:2px;">${totalUser}</div>
                </div>
            </div>

            <div class="stats-card">
                <div style="width:48px;height:48px;border-radius:10px;background:#ECFDF5;color:#10B981;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                    <i class="fa-solid fa-circle-check"></i>
                </div>
                <div>
                    <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;">Tổng nhãn trùng khớp</div>
                    <div style="font-size:22px;font-weight:800;color:#10B981;margin-top:2px;">${totalMatched}</div>
                </div>
            </div>

            <div class="stats-card">
                <div style="width:48px;height:48px;border-radius:10px;background:#FFF7ED;color:#EA580C;display:flex;align-items:center;justify-content:center;font-size:20px;flex-shrink:0;">
                    <i class="fa-regular fa-clock"></i>
                </div>
                <div>
                    <div style="font-size:11px;color:#64748B;font-weight:600;text-transform:uppercase;">Thời gian gán nhãn</div>
                    <div style="font-size:22px;font-weight:800;color:#EA580C;margin-top:2px;">${timeSpentMin} phút</div>
                </div>
            </div>

        </div>

        <!-- Charts and Main Metrics Row -->
        <div style="display:grid;grid-template-columns: 1.1fr 0.9fr;gap:24px;margin-bottom:24px;align-items:stretch;">
            <!-- Left Chart Column (Rings) -->
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;display:flex;flex-direction:column;">
                <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:20px;display:flex;align-items:center;">
                    <span>Chỉ số Đánh giá Chất lượng</span>
                    <span style="margin-left:auto;font-size:11px;padding:2px 10px;border-radius:12px;background:${ratingBg};color:${ratingColor};font-weight:800;text-transform:uppercase;letter-spacing:0.5px;">${ratingText}</span>
                </div>
                
                <div style="display:flex;justify-content:space-around;align-items:center;flex:1;padding:10px 0;">
                    <div style="display:flex;flex-direction:column;align-items:center;position:relative;width:90px;height:90px;justify-content:center;">
                        <div class="stats-circle-container">
                            ${makeProgressRing(overallSimilarity, 88, 7, simColors.color, simColors.trail, simColors.color)}
                        </div>
                        <span style="font-size:12px;font-weight:700;color:#334155;margin-top:8px;white-space:nowrap;">Độ tương đồng</span>
                    </div>

                    <div style="display:flex;flex-direction:column;align-items:center;position:relative;width:90px;height:90px;justify-content:center;">
                        <div class="stats-circle-container">
                            ${makeProgressRing(userPrecision, 88, 7, userColors.color, userColors.trail, userColors.color)}
                        </div>
                        <span style="font-size:12px;font-weight:700;color:#334155;margin-top:8px;white-space:nowrap;">Độ tin cậy Người dùng</span>
                    </div>

                    <div style="display:flex;flex-direction:column;align-items:center;position:relative;width:90px;height:90px;justify-content:center;">
                        <div class="stats-circle-container">
                            ${makeProgressRing(aiPrecision, 88, 7, aiColors.color, aiColors.trail, aiColors.color)}
                        </div>
                        <span style="font-size:12px;font-weight:700;color:#334155;margin-top:8px;white-space:nowrap;">Độ tin cậy AI</span>
                    </div>
                </div>

                <!-- Hệ thống gợi ý -->
                <div style="margin-top:20px;padding:12px 16px;border-radius:10px;background:${suggestionBg};border:1px solid ${suggestionBorder};display:flex;align-items:start;gap:12px;">
                    <div style="width:32px;height:32px;border-radius:50%;background:${suggestionIconBg};color:${suggestionIconColor};display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;">
                        <i class="${suggestionIcon}"></i>
                    </div>
                    <div style="flex:1;">
                        <div style="font-size:12px;font-weight:800;color:${suggestionTitleColor};text-transform:uppercase;letter-spacing:0.5px;">Hệ thống gợi ý</div>
                        <div style="font-size:12px;color:${suggestionTextColor};margin-top:4px;line-height:1.5;">${suggestionText}</div>
                    </div>
                </div>

            </div>

            <!-- Right Column (Camera Performance Breakdown) -->
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;display:flex;flex-direction:column;">
                <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:16px;">Hiệu năng theo Góc Camera</div>
                <div style="flex:1;overflow-y:auto;max-height:220px;padding-right:4px;">
                    <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
                        <thead>
                            <tr style="border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:700;">
                                <th style="padding:6px 0;">Camera</th>
                                <th style="padding:6px 0;text-align:center;">Độ khớp</th>
                                <th style="padding:6px 0;text-align:center;">Nhãn trùng</th>
                                <th style="padding:6px 0;text-align:center;">Nhãn dư</th>
                                <th style="padding:6px 0;text-align:center;">Nhãn thiếu</th>
                            </tr>
                        </thead>
                        <tbody>
                            ${cameraRows.map(row => `
                                <tr style="border-bottom:1px solid #F1F5F9;color:#334155;">
                                    <td style="padding:8px 0;font-weight:700;color:#0F172A;">${row.name}</td>
                                    <td style="padding:8px 0;text-align:center;font-weight:700;color:${row.color}">${row.avg}%</td>
                                    <td style="padding:8px 0;text-align:center;color:#10B981;">${row.matched}</td>
                                    <td style="padding:8px 0;text-align:center;color:#EF4444;">${row.extra}</td>
                                    <td style="padding:8px 0;text-align:center;color:#F59E0B;">${row.missing}</td>
                                </tr>
                            `).join('')}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>

        <!-- Class Performance & Confusion Matrix Rows -->
        <div style="display:grid;grid-template-columns:1.2fr 0.8fr;gap:24px;">
            <!-- Left: Class statistics -->
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;">
                <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:16px;">Chi tiết hiệu năng theo Lớp đối tượng</div>
                <table style="width:100%;border-collapse:collapse;font-size:12px;text-align:left;">
                    <thead>
                        <tr style="border-bottom:1px solid #E2E8F0;color:#64748B;font-weight:700;">
                            <th style="padding:6px 0;">Lớp đối tượng</th>
                            <th style="padding:6px 0;text-align:center;">Trùng khớp</th>
                            <th style="padding:6px 0;text-align:center;">Dư thừa</th>
                            <th style="padding:6px 0;text-align:center;">Thiếu sót</th>
                            <th style="padding:6px 0;text-align:center;">Độ khớp</th>
                            <th style="padding:6px 0;text-align:center;">Độ chính xác</th>
                        </tr>
                    </thead>
                    <tbody>
                        ${CLASSES.map(cls => {
                            const stat = classStats[cls.id] || { matched: 0, missing: 0, extra: 0, sumIoU: 0 };
                            const total = stat.matched + stat.missing + stat.extra;
                            const accuracy = total > 0 ? Math.round((stat.matched / total) * 100) : 100;
                            const avgIoU = stat.matched > 0 ? Math.round((stat.sumIoU / stat.matched) * 100) : 0;
                            return `
                                <tr style="border-bottom:1px solid #F1F5F9;color:#334155;">
                                    <td style="padding:10px 0;font-weight:600;display:flex;align-items:center;gap:8px;">
                                        <div style="width:24px;height:24px;border-radius:6px;background:${cls.color}15;color:${cls.color};display:flex;align-items:center;justify-content:center;">
                                            <i class="fa-solid ${cls.icon}" style="font-size:11px;"></i>
                                        </div>
                                        <span>${cls.name}</span>
                                    </td>
                                    <td style="padding:10px 0;text-align:center;color:#10B981;font-weight:600;">${stat.matched}</td>
                                    <td style="padding:10px 0;text-align:center;color:#EF4444;">${stat.extra}</td>
                                    <td style="padding:10px 0;text-align:center;color:#F59E0B;">${stat.missing}</td>
                                    <td style="padding:10px 0;text-align:center;color:#64748B;">${avgIoU}%</td>
                                    <td style="padding:10px 0;text-align:center;font-weight:700;color:${accuracy >= 85 ? '#10B981' : (accuracy >= 60 ? '#3B82F6' : '#EF4444')}">${accuracy}%</td>
                                </tr>
                            `;
                        }).join('')}
                    </tbody>
                </table>
            </div>

            <!-- Right: Confused Labels list -->
            <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;display:flex;flex-direction:column;">
                <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:12px;">Phân tích Nhầm lẫn Nhãn</div>
                <p style="font-size:11px;color:#64748B;line-height:1.4;margin:0 0 16px 0;">Đối tượng vẽ trùng vị trí nhưng gán nhầm loại nhãn (IoU > 30%):</p>
                <div style="flex:1;overflow-y:auto;max-height:220px;padding-right:4px;">
                    ${confusionList.length === 0 ? `
                        <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;color:#94A3B8;padding:24px 0;">
                            <i class="fa-solid fa-circle-check" style="font-size:24px;color:#10B981;margin-bottom:8px;"></i>
                            <span style="font-size:12px;font-weight:500;">Không phát hiện lỗi nhầm lẫn nhãn nào!</span>
                        </div>
                    ` : `
                        <div style="display:flex;flex-direction:column;gap:8px;">
                            ${confusionList.map(item => `
                                <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 12px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:11px;color:#78350F;">
                                    <div style="display:flex;align-items:center;gap:6px;font-weight:600;">
                                        <span style="color:#B45309;">AI: ${item.ai}</span>
                                        <i class="fa-solid fa-arrow-right" style="color:#D97706;font-size:9px;"></i>
                                        <span style="color:#1E3A8A;background:#DBEAFE;padding:2px 6px;border-radius:4px;">Người: ${item.user}</span>
                                    </div>
                                    <div style="font-weight:800;background:#F59E0B;color:#fff;border-radius:12px;padding:1px 8px;">
                                        ${item.count} lần
                                    </div>
                                </div>
                            `).join('')}
                        </div>
                    `}
                </div>
            </div>
        </div>

        <!-- Đánh giá Section -->
        <div style="background:#fff;border:1px solid #E2E8F0;border-radius:14px;padding:24px;margin-top:24px;box-shadow: 0 4px 20px rgba(0,0,0,0.02);text-align:left;">
            <div style="font-size:14px;font-weight:800;color:#0F172A;margin-bottom:16px;display:flex;align-items:center;gap:8px;">
                <div style="width:28px;height:28px;border-radius:8px;background:#EDE9FE;color:#7C3AED;display:flex;align-items:center;justify-content:center;">
                    <i class="fa-solid fa-stamp" style="font-size:14px;"></i>
                </div>
                <span>Đánh giá chất lượng nhiệm vụ</span>
            </div>
            
            ${(state.evaluationData.status === 'approved' || state.evaluationData.status === 'rejected') ? `
                <div style="display:flex;flex-direction:column;gap:16px;">
                    <div style="display:flex;align-items:center;gap:12px;">
                        <span style="font-size:13px;font-weight:600;color:#475569;">Kết quả đánh giá:</span>
                        ${state.evaluationData.status === 'approved' ? `
                            <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:#ECFDF5;color:#059669;border-radius:20px;font-size:13px;font-weight:700;border:1px solid #A7F3D0;">
                                <i class="fa-solid fa-circle-check"></i> Đạt yêu cầu
                            </span>
                        ` : `
                            <span style="display:inline-flex;align-items:center;gap:6px;padding:6px 16px;background:#FEF2F2;color:#DC2626;border-radius:20px;font-size:13px;font-weight:700;border:1px solid #FCA5A5;">
                                <i class="fa-solid fa-circle-xmark"></i> Chưa đạt yêu cầu
                            </span>
                        `}
                    </div>
                    <div>
                        <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:6px;">Nội dung gửi tới người gán nhãn:</div>
                        <div style="padding:12px 16px;background:#F8FAFC;border:1px solid #E2E8F0;border-radius:10px;font-size:13px;color:#334155;white-space:pre-wrap;min-height:60px;">${state.evaluationData.feedback || 'Không có nội dung gửi thêm.'}</div>
                    </div>
                </div>
            ` : `
                <div style="display:flex;flex-direction:column;gap:16px;">
                    <div style="display:flex;align-items:center;gap:12px;flex-wrap:wrap;">
                        <span style="font-size:13px;font-weight:600;color:#475569;">Chọn kết quả:</span>
                        <button id="btnEvalReject" onclick="selectEvalStatus('rejected')" style="height:38px;padding:0 20px;background:#fff;color:#64748B;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s;">
                            <i class="fa-solid fa-circle-xmark"></i> Chưa đạt yêu cầu
                        </button>
                        <button id="btnEvalApprove" onclick="selectEvalStatus('approved')" style="height:38px;padding:0 20px;background:#fff;color:#64748B;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s;">
                            <i class="fa-solid fa-circle-check"></i> Đạt yêu cầu
                        </button>
                    </div>
                    <div>
                        <div style="font-size:13px;font-weight:600;color:#475569;margin-bottom:8px;">Nội dung gửi tới người gán nhãn:</div>
                        <textarea id="evalFeedback" placeholder="Nhập nội dung góp ý, nhận xét cho người gán nhãn..." style="width:100%;min-height:80px;padding:12px 16px;border:1px solid #CBD5E1;border-radius:10px;font-size:13px;font-family:inherit;outline:none;resize:vertical;transition:border-color 0.2s;" onfocus="this.style.borderColor='#7C3AED'" onblur="this.style.borderColor='#CBD5E1'"></textarea>
                    </div>
                    <div style="display:flex;justify-content:flex-end;">
                        <button id="btnSubmitEval" onclick="submitEvaluation()" style="height:40px;padding:0 24px;background:#7C3AED;color:#fff;border:none;border-radius:10px;font-size:13px;font-weight:700;cursor:pointer;display:flex;align-items:center;gap:8px;transition:all 0.2s;" onmouseover="this.style.background='#6D28D9'" onmouseout="this.style.background='#7C3AED'">
                            <i class="fa-solid fa-paper-plane"></i> Gửi đánh giá
                        </button>
                    </div>
                </div>
            `}
        </div>
    `;

    // Display modal
    modal.style.display = 'flex';
}
