/* Aven — Visual Prototype. История действий и Undo — сквозной слой среза Stage 1.0.
   Спецификация: docs/MVP_SCOPE.md §5.9; принципы: ADR-005 (подтверждение/Undo), ADR-010 (честные статусы).
   Не production: данные демо, изменения локальные. */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const s = () => S.s();

  /* ================= сквозные хелперы (доступны другим страницам) ================= */

  A.nowLabel = function () {
    const d = new Date(), p = (n) => String(n).padStart(2, '0');
    return 'сегодня, ' + p(d.getHours()) + ':' + p(d.getMinutes());
  };

  /** Запись действия в историю. Вызывается из любого места прототипа.
   *  e: {action, title, object, objectType, source, undoable, danger, sensitive, changes:[{field,from,to}]} */
  A.logAction = function (e) {
    const st = s();
    if (!Array.isArray(st.history)) st.history = [];
    const entry = {
      id: S.id('h'),
      when: A.nowLabel(),
      actor: (st.auth && st.auth.name) || 'вы',
      action: e.action || 'other',
      title: e.title || 'Действие',
      object: e.object || '',
      objectType: e.objectType || 'other',
      source: e.source || 'ui',
      undoable: !!e.undoable,
      danger: !!e.danger,
      sensitive: !!e.sensitive,
      changes: e.changes || []
    };
    st.history.unshift(entry);
    S.save();
    return entry;
  };

  const TYPE_ICO = {
    task: '✅', expense: '💰', income: '💰', note: '📝', event: '📅', settings: '⚙️',
    session: '🔐', auth: '🔐', system: '🛠️', car: '🚗', purchase: '🛍️', other: '•'
  };

  const KIND_LABEL = {
    create: 'создание', update: 'изменение', delete: 'удаление', login: 'вход',
    logout: 'выход', set: 'настройка', undo: 'отмена', other: 'действие'
  };

  function kindOf(action) {
    const parts = String(action || '').split('.');
    const verb = (parts[parts.length - 1] || '').toLowerCase();
    if (/^(create|add)$/.test(verb)) return 'create';
    if (/^(update|set|change)$/.test(verb)) return 'update';
    if (/^(delete|remove)$/.test(verb)) return 'delete';
    if (verb === 'login') return 'login';
    if (verb === 'logout') return 'logout';
    if (verb === 'undo') return 'undo';
    return 'other';
  }

  /* ================= Undo ================= */

  A.undoAction = function (id) {
    const st = s();
    const list = st.history || [];
    const item = list.filter((x) => x.id === id)[0];
    if (!item) { A.toast('Запись не найдена (демо)'); return; }
    if (!item.undoable) { A.toast('Это действие необратимо — отмена не поддерживается'); return; }
    if (item.undone) { A.toast('Действие уже отменено'); return; }
    item.undone = true;
    item.undoneAt = A.nowLabel();
    // Undo сам пишется в историю (MVP_SCOPE §5.9, критерий приёмки 2)
    A.logAction({
      action: 'history.undo', title: 'Отменено действие', object: item.title + (item.object ? ': ' + item.object : ''),
      objectType: item.objectType, undoable: false, changes: (item.changes || []).map((c) => ({
        field: c.field, from: c.to, to: c.from
      }))
    });
    A.toast('Отменено: ' + item.title + ' (демо)');
    A.render();
  };

  A.register({ 'hist-undo': (el) => A.undoAction(el.dataset.id) });

  /* ================= Фильтры ================= */

  let f = { kind: 'all', q: '', undone: 'show' };

  function filtered() {
    const st = s();
    const q = f.q.trim().toLowerCase();
    return (st.history || []).filter((h) => {
      if (f.kind !== 'all' && kindOf(h.action) !== f.kind) return false;
      if (f.undone === 'hide' && h.undone) return false;
      if (f.undone === 'only' && !h.undone) return false;
      if (!q) return true;
      return [h.title, h.object, h.action, h.actor].join(' ').toLowerCase().indexOf(q) >= 0;
    });
  }

  /* ================= Страница ================= */

  A.pages.history = function () {
    const st = s();
    const all = st.history || [];
    const list = filtered();
    const dangerous = all.filter((h) => h.danger).length;
    const undoable = all.filter((h) => h.undoable && !h.undone).length;

    const html = `
    <div class="page-head">
      <div>
        <h1>История действий</h1>
        <div class="sub">Сквозной слой среза Stage 1.0 · каждое изменение данных оставляет запись · ADR-005, ADR-010 · демо-данные</div>
      </div>
      <div class="btn-row">
        <button class="btn" data-action="hist-export" title="Выгрузить историю в JSON">Экспорт JSON</button>
      </div>
    </div>

    <div class="grid cols-3">
      <div class="card stat"><div class="num">${all.length}</div><div class="t">записей всего</div></div>
      <div class="card stat"><div class="num">${undoable}</div><div class="t">можно отменить (Undo)</div></div>
      <div class="card stat"><div class="num">${dangerous}</div><div class="t">разрушающих действий</div></div>
    </div>

    <div class="card hist-filters">
      <div class="field-row">
        <label class="field"><span>Тип действия</span>
          <select data-action="hist-filter-kind">
            <option value="all" ${f.kind === 'all' ? 'selected' : ''}>Все</option>
            <option value="create" ${f.kind === 'create' ? 'selected' : ''}>Создание</option>
            <option value="update" ${f.kind === 'update' ? 'selected' : ''}>Изменение</option>
            <option value="delete" ${f.kind === 'delete' ? 'selected' : ''}>Удаление</option>
            <option value="login" ${f.kind === 'login' ? 'selected' : ''}>Вход и безопасность</option>
            <option value="set" ${f.kind === 'set' ? 'selected' : ''}>Настройки</option>
            <option value="undo" ${f.kind === 'undo' ? 'selected' : ''}>Отмены</option>
          </select>
        </label>
        <label class="field"><span>Отменённые</span>
          <select data-action="hist-filter-undone">
            <option value="show" ${f.undone === 'show' ? 'selected' : ''}>Показывать</option>
            <option value="hide" ${f.undone === 'hide' ? 'selected' : ''}>Скрывать</option>
            <option value="only" ${f.undone === 'only' ? 'selected' : ''}>Только отменённые</option>
          </select>
        </label>
        <label class="field grow"><span>Поиск</span>
          <input type="search" id="hist-q" value="${A.esc(f.q)}" placeholder="Название, объект, действие">
        </label>
      </div>
    </div>

    ${list.length === 0 ? `
      <div class="card"><div class="empty">
        ${all.length === 0
          ? 'Записей пока нет. История заполняется с первого изменения данных — это сквозной слой, а не отдельная функция.'
          : 'Ничего не найдено по текущим фильтрам. Измените тип действия или очистите поиск.'}
      </div></div>` : `
      <div class="hist-list">
        ${list.map((h) => {
          const kind = kindOf(h.action);
          const ico = TYPE_ICO[h.objectType] || TYPE_ICO.other;
          return `
          <div class="card hist-item ${h.undone ? 'undone' : ''}" data-id="${A.esc(h.id)}">
            <div class="hist-ico" aria-hidden="true">${ico}</div>
            <div class="grow">
              <div class="hist-top">
                <b>${A.esc(h.title)}</b>
                ${h.danger ? '<span class="pill danger">разрушающее</span>' : ''}
                ${h.sensitive ? '<span class="pill warn">чувствительная настройка</span>' : ''}
                ${h.undone ? '<span class="pill">отменено</span>' : ''}
                <span class="pill ${kind === 'delete' ? 'warn' : ''}">${A.esc(KIND_LABEL[kind] || kind)}</span>
              </div>
              <div class="hist-object">${A.esc(h.object || '—')}</div>
              <div class="hist-meta">
                <span class="time">${A.esc(h.when)}</span> · ${A.esc(h.actor)} · источник: ${A.esc(h.source)} ·
                <code>${A.esc(h.action)}</code>
                ${(h.changes && h.changes.length) ? ' · изменений: ' + h.changes.length : ''}
              </div>
            </div>
            <div class="hist-actions">
              <button class="btn small" data-action="hist-detail" data-id="${A.esc(h.id)}">Подробно</button>
              ${h.undoable && !h.undone
                ? `<button class="btn small" data-action="hist-undo" data-id="${A.esc(h.id)}" title="Вернуть прежнее состояние">Отменить</button>`
                : (h.undone
                  ? '<span class="pill">Undo выполнен</span>'
                  : '<span class="pill" title="Необратимое действие — см. MVP_SCOPE §5.9">без Undo</span>')}
            </div>
          </div>`;
        }).join('')}
      </div>`}

    <div class="card hist-note">
      <div class="set-h">Как это устроено в срезе 1.0</div>
      <ul class="set-sub" style="margin:0 0 0 18px">
        <li>Запись содержит: кто, когда, тип действия, объект, старое и новое значение, источник, результат.</li>
        <li>Undo поддерживается для создания/изменения/удаления пользовательских данных; необратимые операции
            (удаление аккаунта, восстановление из бэкапа) требуют подтверждения и не отменяются.</li>
        <li>Отмена сама пишется в историю — цепочка действий не теряет звеньев.</li>
        <li>Пользовательская история и административный аудит разделены (ADR-012): аудит — в
            <a href="#/admin">Админке → Аудит</a>.</li>
        <li>Механизм защиты критического audit trail — открытый вопрос №14, в прототипе не реализован.</li>
      </ul>
    </div>`;

    return {
      html,
      mount(main) {
        const q = main.querySelector('#hist-q');
        if (q) q.addEventListener('input', () => { f.q = q.value; rerenderList(main); });
      }
    };
  };

  /* перерисовка без потери фокуса в поиске — обновляем только список */
  function rerenderList(main) {
    const out = A.pages.history();
    const box = document.createElement('div');
    box.innerHTML = out.html;
    const list = box.querySelector('.hist-list') || box.querySelector('.empty');
    const target = main.querySelector('.hist-list') || main.querySelector('.card .empty');
    if (list && target && target.parentNode) {
      if (target.classList.contains('empty')) target.parentNode.parentNode.replaceChild(list, target.parentNode);
      else target.replaceWith(list);
    } else { A.render(); }
  }

  A.register({
    'hist-filter-kind': (el) => { f.kind = el.value; A.render(); },
    'hist-filter-undone': (el) => { f.undone = el.value; A.render(); },
    'hist-detail': (el) => {
      const h = (s().history || []).filter((x) => x.id === el.dataset.id)[0];
      if (!h) return;
      const rows = (h.changes || []).length
        ? `<table class="tbl"><thead><tr><th>Поле</th><th>Было</th><th>Стало</th></tr></thead><tbody>
             ${h.changes.map((c) => `<tr><td>${A.esc(c.field)}</td><td class="diff-del">${A.esc(c.from)}</td><td class="diff-add">${A.esc(c.to)}</td></tr>`).join('')}
           </tbody></table>`
        : '<div class="empty">Изменений значений нет (например, вход в аккаунт или системная операция).</div>';
      A.openModal({
        title: h.title, wide: true, submitText: null, cancelText: 'Закрыть',
        body: `
          <div class="set-row"><div class="grow"><div class="t">Объект</div><div class="s">${A.esc(h.object || '—')}</div></div></div>
          <div class="set-row"><div class="grow"><div class="t">Кто и когда</div><div class="s">${A.esc(h.actor)} · ${A.esc(h.when)} · источник: ${A.esc(h.source)}</div></div></div>
          <div class="set-row"><div class="grow"><div class="t">Действие</div><div class="s"><code>${A.esc(h.action)}</code> · объект типа «${A.esc(h.objectType)}»</div></div>
            ${h.danger ? '<span class="pill danger">разрушающее, требовало подтверждения</span>' : ''}
            ${h.sensitive ? '<span class="pill warn">чувствительная настройка</span>' : ''}
            ${h.undone ? '<span class="pill">отменено ' + A.esc(h.undoneAt || '') + '</span>' : ''}</div>
          ${rows}
          ${h.undoable && !h.undone ? `<div class="btn-row" style="margin-top:10px">
              <button class="btn" data-action="hist-undo" data-id="${A.esc(h.id)}">Отменить действие</button></div>` : ''}`
      });
    },
    'hist-export': () => {
      const st = s();
      const data = JSON.stringify({ exportedAt: new Date().toISOString(), demo: true, history: st.history || [] }, null, 2);
      try {
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url; a.download = 'aven-history-demo.json';
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        A.toast('История выгружена в JSON (демо)');
        A.logAction({ action: 'data.export', title: 'Экспорт данных', object: 'История действий · JSON', objectType: 'system', undoable: false, sensitive: true });
      } catch (e) {
        A.toast('Экспорт недоступен в этом окружении: ' + e.message);
      }
    }
  });
})();
