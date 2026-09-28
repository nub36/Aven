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
  /* Деньги, время и «сейчас» берутся из общего слоя действий: валюта и часовой пояс
     задаются в профиле и должны применяться одинаково во всех разделах (MVP_SCOPE §5.2). */
  const Core = () => window.AvenActions;
  api.money = function (n) {
    if (Core() && Core().format && Core().format.money) return Core().format.money(n);
    return new Intl.NumberFormat('ru-RU').format(Math.round(n)) + ' ₽';
  };
  api.time = function (hhmm) {
    if (Core() && Core().format && Core().format.time) return Core().format.time(hhmm);
    return String(hhmm == null ? '' : hhmm);
  };
  api.nowDate = function () {
    if (Core() && Core().dates && Core().dates.nowDate) return Core().dates.nowDate();
    return new Date();
  };
  api.greeting = function () {
    const h = api.nowDate().getHours();
    if (h < 6) return 'Доброй ночи';
    if (h < 12) return 'Доброе утро';
    if (h < 18) return 'Добрый день';
    return 'Добрый вечер';
  };
  api.todayFull = function () {
    const iso = window.AvenDemo && window.AvenDemo.todayISO ? window.AvenDemo.todayISO() : null;
    const d = iso ? new Date(iso + 'T12:00:00') : new Date();
    return new Intl.DateTimeFormat('ru-RU', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }).format(d);
  };
  /* Состояние гарантии считает общий слой действий (раздел «Покупки»): один порог,
     одна дата «сегодня», один текст — и на карточках, и в уведомлениях. */
  api.warrantyStatus = function (until) {
    const C = Core();
    if (C && C.shopping && C.shopping.warrantyState) return C.shopping.warrantyState(until);
    return { kind: 'none', cls: '', label: '—', days: null };
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
  api.closeModal = function (opts) {
    opts = opts || {};
    const root = document.getElementById('modal-root');
    const hadModal = !!(root && root.firstChild);
    if (root) root.innerHTML = '';
    document.body.classList.remove('modal-open');
    const app = document.querySelector('.app');
    if (app && !document.body.classList.contains('nav-open')) {
      app.removeAttribute('inert');
      app.removeAttribute('aria-hidden');
    }
    document.removeEventListener('keydown', api._escHandler);
    const prev = api._modalPreviousFocus;
    api._modalPreviousFocus = null;
    if (hadModal && opts.restoreFocus !== false) {
      try { if (prev && document.contains(prev)) prev.focus(); } catch (e) { /* noop */ }
    }
  };
  api._escHandler = function (e) { if (e.key === 'Escape') api.closeModal(); };

  /**
   * openModal({title, body, wide, submitText, cancelText, onSubmit(formValues, formEl)})
   * Значения формы собираются по атрибутам name полей внутри .modal-body.
   */
  api.openModal = function (opts) {
    const root = document.getElementById('modal-root');
    if (root.firstChild) api.closeModal({ restoreFocus: false });
    api._modalPreviousFocus = document.activeElement;
    document.body.classList.add('modal-open');
    const app = document.querySelector('.app');
    if (app) { app.setAttribute('inert', ''); app.setAttribute('aria-hidden', 'true'); }
    const ov = document.createElement('div');
    ov.className = 'modal-overlay';
    ov.innerHTML =
      '<div class="modal ' + (opts.wide ? 'wide' : '') + '" role="dialog" aria-modal="true">' +
        '<div class="modal-head"><h3>' + api.esc(opts.title || '') + '</h3>' +
        '<button class="icon-btn" data-x title="Закрыть" aria-label="Закрыть модальное окно">✕</button></div>' +
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
    const first = ov.querySelector('input, select, textarea, [data-submit], [data-x]');
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
