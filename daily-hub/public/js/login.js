import { h } from './dom.js';
import { api } from './api.js';

let pending = null;

// While the login screen is up, the app behind it must not be reachable by Tab or a screen reader.
const setBackgroundInert = (value) => document.querySelectorAll('.topbar, main, .tabbar').forEach((el) => { el.inert = value; });

/** Shows the login screen once (repeat calls share it) and resolves after a successful login. */
export function showLogin() {
  pending ??= new Promise((resolve) => {
    setBackgroundInert(true);
    const input = h('input', {
      id: 'code', type: 'password', required: true, autocomplete: 'current-password',
      autocapitalize: 'characters', placeholder: '登录口令',
    });
    const error = h('p', { class: 'error', role: 'alert' });
    const submit = h('button', { class: 'btn primary', type: 'submit' }, '进入');
    const overlay = h('div', { class: 'login-overlay' },
      h('form', {
        class: 'login-card card stack',
        onsubmit: async (e) => {
          e.preventDefault();
          error.textContent = '';
          submit.disabled = true;
          try {
            await api.post('/api/login', { code: input.value });
            setBackgroundInert(false);
            overlay.remove();
            pending = null;
            resolve();
          } catch (err) {
            error.textContent = err.message;
            input.select();
          } finally {
            submit.disabled = false;
          }
        },
      },
      h('h2', { text: 'Daily Hub' }),
      h('p', { class: 'muted small' }, '输入登录口令。口令在电脑启动窗口里显示，也保存在项目的 .env 文件（ACCESS_CODE）。'),
      h('label', { for: 'code', class: 'sr-only' }, '登录口令'),
      input, error, submit));
    document.body.append(overlay);
    input.focus();
  });
  return pending;
}
