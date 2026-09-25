/* Aven — Visual Prototype. UI-хелперы: модальные окна, тосты, форматирование. Не production. */
window.Aven = (function () {
  const S = window.AvenState;

  const api = {
    actions: {},
    register(map) { Object.assign(api.actions, map); },
    act(name, el, ev) {
      const f = api.actions[name];
      if (f) { ev && ev.stopPropagation && ev.stopPropagation(); f(el, ev); }
    }
  };

  /* ---------- форматирование ---------- */
  api.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  api.money = function (n) {
    return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
  };
  api.greeting = function () {
    const h = new Date().getHours();
    if (h < 6) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  };
  api.todayFull = function () {
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(new Date());
  };
  api.warrantyStatus = function (untilStr) {
    const m = /(\d{2})\.(\d{2})\.(\d{4})/.exec(untilStr || '');
    if (!m) return { cls: '', label: untilStr || '—' };
    const until = new Date(+m[3], +m[2] - 1, +m[1]);
    const now = new Date();
    const days = Math.ceil((until - now) / 86400000);
    if (days < 0) return { cls: 'danger', label: 'Гарантия истекла', until: untilStr };
    if (days < 90) return { cls: 'warn', label: 'Гарантия до ' + untilStr, until: untilStr };
    return { cls: 'ok', label: 'Гарантия до ' + untilStr, until: untilStr };
  };

  /* ---------- тосты ---------- */
  api.toast = function (msg) {
    const box = document.getElementById('toasts');
    const t = document.createElement('div');
    t.className = 'toast';
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .3s'; }, 2600);
    setTimeout(() => t.remove(), 3000);
  };
  api.demoToast = function (what) { api.toast(what || 'Действие сохранено локально (демо)'); };
  api.micToast = function () { api.toast('Голосовой ввод — прототип'); };
  api.ttsToast = function () { api.toast('Озвучивание ответа — прототип'); };

  /* ---------- модальные окна ---------- */
  api.closeModal = function () {
    const ov = document.getElementById('modal-root');
    ov.innerHTML = '';
    document.removeEventListener('keydown', api._escHandler);
  };
  api._escHandler = function (e) { if (e.key === 'Escape') api.closeModal(); };

  /**
   * openModal({title, body, wide, submitText, cancelText, onSubmit(formValues, formEl)})
   * Значения формы собираются по атрибутам name полей внутри .modal-body.
   */
  api.openModal = function (opts) {
    const root = document.getElementById('modal-root');
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML =
      '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h3>' + api.esc(opts.title || '') + '</h3>' +
        '<button class="icon-btn" data-x title="Закрыть">✕</button></div>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        '<div class="modal-foot">' +
          '<button class="btn" data-x>' + api.esc(opts.cancelText || 'Отмена') + '</button>' +
          (opts.submitText === null ? '' : '<button class="btn primary" data-submit>' + api.esc(opts.submitText || 'Сохранить') + '</button>') +
        '</div>' +
      '</div>';
    root.innerHTML = '';
    root.appendChild(ov);
    ov.addEventListener('click', (e) => {
      if (e.target === ov || e.target.hasAttribute('data-x')) api.closeModal();
    });
    const submitBtn = ov.querySelector('[data-submit]');
    if (submitBtn) submitBtn.addEventListener('click', () => {
      const formEl = ov.querySelector('.modal-body');
      const values = {};
      formEl.querySelectorAll('[name]').forEach((inp) => {
        values[inp.name] = inp.type === 'checkbox' ? inp.checked : inp.value;
      });
      if (opts.onSubmit) opts.onSubmit(values, formEl);
      else { api.demoToast(); api.closeModal(); }
    });
    document.addEventListener('keydown', api._escHandler);
    const first = ov.querySelector('input, select, textarea');
    if (first) setTimeout(() => first.focus(), 30);
  };

  api.confirmModal = function (text, onYes) {
    api.openModal({
      title: 'Подтверждение',
      body: '<p style="margin:0 0 6px">' + api.esc(text) + '</p>',
      submitText: 'Подтвердить',
      onSubmit: () => { api.closeModal(); onYes && onYes(); }
    });
  };

  /* ---------- переключение вкладок ---------- */
  api.bindTabs = function (container, onChange) {
    container.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => {
        container.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
        tab.classList.add('active');
        onChange && onChange(tab.dataset.tab);
      });
    });
  };

  return api;
})();
