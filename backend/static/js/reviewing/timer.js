import { state, taskId } from './state.js';

export function startTimer() {
    const saved = parseInt(localStorage.getItem(`review_timer_${taskId}`) || '0');
    state.timerSeconds = saved;
    updateTimerDisplay();
    state.timerInterval = setInterval(() => {
        state.timerSeconds++;
        localStorage.setItem(`review_timer_${taskId}`, state.timerSeconds);
        updateTimerDisplay();
    }, 1000);
}

export function updateTimerDisplay() {
    const h = String(Math.floor(state.timerSeconds / 3600)).padStart(2, '0');
    const m = String(Math.floor((state.timerSeconds % 3600) / 60)).padStart(2, '0');
    const s = String(state.timerSeconds % 60).padStart(2, '0');
    const el = document.querySelector('.timer-pill');
    if (el) el.innerHTML = `<i class="fa-regular fa-clock"></i> ${h}:${m}:${s}`;
}

export function stopTimer() {
    clearInterval(state.timerInterval);
    localStorage.setItem(`review_timer_${taskId}`, state.timerSeconds);
}
