import { api, setUnauthorizedHandler } from './api.js';
import { h, mount, $, spinner } from './dom.js';
import { showLogin } from './login.js';
import { loadSettings, onChange } from './store.js';
import { toastError } from './toast.js';
import { startReminders } from './reminders.js';
import { openSheet } from './sheet.js';
import { editTask } from './components/task-form.js';
import { importTasks } from './components/import-tasks.js';

const VIEWS = {
  today: () => import('./views/today.js'),
  tasks: () => import('./views/tasks.js'),
  calendar: () => import('./views/calendar.js'),
  timetable: () => import('./views/timetable.js'),
  weather: () => import('./views/weather.js'),
  settings: () => import('./views/settings.js'),
};

const main = $('#main');
let cleanups = [];
let renderId = 0;

async function route() {
  const name = location.hash.match(/^#\/(\w+)/)?.[1];
  const key = Object.hasOwn(VIEWS, name) ? name : 'today';
  const id = ++renderId;
  cleanups.forEach((fn) => fn());
  cleanups = [];
  const controller = new AbortController();
  cleanups.push(() => controller.abort());

  for (const a of document.querySelectorAll('.tabbar a')) {
    if (a.dataset.route === key) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  }
  mount(main, spinner());
  try {
    const view = await VIEWS[key]();
    if (id !== renderId) return;
    $('#title').textContent = view.title;
    document.title = `${view.title} · Daily Hub`;
    await view.render(main, {
      signal: controller.signal,
      cleanup: (fn) => cleanups.push(fn),
      onChange: (fn) => cleanups.push(onChange(fn)),
    });
  } catch (err) {
    if (err.name === 'AbortError' || id !== renderId) return;
    mount(main, h('p', { class: 'empty' }, h('span', { class: 'big' }, '😵'), err.message || '页面加载失败',
      h('div', {}, h('button', { class: 'btn', type: 'button', onclick: route }, '重试'))));
  }
}

function openAddMenu() {
  openSheet('添加', (close) => h('div', { class: 'stack' },
    h('button', { class: 'btn primary block', type: 'button', onclick: () => { close(); importTasks(); } }, '📷 智能识别截图 / 文字'),
    h('button', { class: 'btn block', type: 'button', onclick: () => { close(); editTask(); } }, '✏️ 手动添加备忘')));
}

async function boot() {
  $('#btn-add').addEventListener('click', openAddMenu);
  // A plain #main link would change the hash and the router would bounce to Today.
  $('.skip').addEventListener('click', (e) => {
    e.preventDefault();
    main.focus();
  });
  window.addEventListener('unhandledrejection', (e) => {
    e.preventDefault();
    if (e.reason?.name !== 'AbortError') toastError(e.reason);
  });
  setUnauthorizedHandler(async () => {
    await showLogin();
    await loadSettings();
    route();
  });
  try {
    const session = await api.get('/api/session');
    if (session.authRequired && !session.authenticated) await showLogin();
    await loadSettings();
  } catch (err) {
    mount(main, h('p', { class: 'empty' }, err.message || '无法连接服务器'));
    return;
  }
  startReminders();
  window.addEventListener('hashchange', route);
  route();
}

boot();
