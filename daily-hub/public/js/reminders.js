// In-page reminders. They fire while the app is open (any browser); for alerts when it is closed,
// subscribe to the calendar feed in Settings. System notifications need HTTPS or localhost.
import { api } from './api.js';
import { h } from './dom.js';
import { localYmd, addDays } from '/shared/dates.js';
import { onChange } from './store.js';

const FIRED_KEY = 'dh:reminders-fired';
const GRACE_MS = 60 * 60 * 1000;
let fired = new Set(JSON.parse(localStorage.getItem(FIRED_KEY) ?? '[]'));
let box;

export function notificationState() {
  return typeof Notification === 'undefined' ? 'unsupported' : Notification.permission;
}

export async function enableNotifications() {
  if (notificationState() === 'unsupported') return 'unsupported';
  return Notification.requestPermission();
}

function remember(key) {
  fired.add(key);
  fired = new Set([...fired].slice(-300));
  localStorage.setItem(FIRED_KEY, JSON.stringify([...fired]));
}

function banner(task, eventAt) {
  const minutes = Math.round((eventAt - Date.now()) / 60000);
  const when = minutes > 0 ? `${minutes} 分钟后` : minutes === 0 ? '现在' : `${-minutes} 分钟前`;
  const el = h('div', { class: 'reminder' },
    h('div', { class: 'grow' },
      h('strong', {}, `⏰ ${when}：${task.title}`),
      task.location && h('div', { class: 'small' }, `📍 ${task.location}`)),
    h('button', { class: 'btn small', type: 'button', onclick: () => el.remove() }, '知道了'),
    h('button', {
      class: 'btn small primary', type: 'button',
      onclick: async () => { await api.patch(`/api/tasks/${task.id}`, { done: true }).catch(() => {}); el.remove(); },
    }, '已完成'));
  box.append(el);
  navigator.vibrate?.([200, 100, 200]);
  if (notificationState() === 'granted') {
    new Notification(`${when}：${task.title}`, { body: task.location || task.details || '', tag: `task-${task.id}` });
  }
}

async function check() {
  const today = localYmd();
  let tasks;
  try {
    tasks = await api.get(`/api/tasks?from=${addDays(today, -1)}&to=${addDays(today, 8)}&done=false`);
  } catch { return; }
  const now = Date.now();
  for (const t of tasks) {
    if (t.remind_min == null || !t.time) continue;
    const eventAt = new Date(`${t.date}T${t.time}:00`).getTime();
    const key = `${t.id}|${t.date}|${t.time}|${t.remind_min}`;
    if (now >= eventAt - t.remind_min * 60000 && now < eventAt + GRACE_MS && !fired.has(key)) {
      remember(key);
      banner(t, eventAt);
    }
  }
}

export function startReminders() {
  box = h('div', { class: 'reminders', role: 'region', 'aria-live': 'assertive', 'aria-label': '提醒' });
  document.body.append(box);
  check();
  setInterval(check, 30000);
  onChange(check);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
}
