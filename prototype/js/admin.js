/* Aven — Visual Prototype. Административная область /admin (система, а не пользователь).
   Состав минимума Stage 1.0: docs/MVP_SCOPE.md §4.1 п.11; спецификация: docs/ADMIN.md.
   Разделение /settings и /admin — ADR-012: администратор НЕ действует от имени пользователя.
   Не production: данные демо, действия локальные. */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const s = () => S.s();

  let tab = 'users';

  const TABS = [
    ['users', 'Пользователи', '👥'], ['roles', 'Роли (RBAC)', '🎭'], ['audit', 'Аудит', '🧾'],
    ['migrations', 'Миграции', '🧬'], ['health', 'Health', '💚'], ['backup', 'Бэкап', '🗄️'],
    ['flags', 'Флаги функций', '🚩'], ['emergency', 'Аварийные', '🚨']
  ];

  const adm = () => s().admin;

  function audit(action, object, result) {
    const st = s();
    st.admin.audit.unshift({
      id: S.id('a'), when: A.nowLabel(), actor: (st.auth && st.auth.email) || 'admin@demo.aven',
      action: action, object: object, result: result || 'ok'
    });
    S.save();
  }

  /* опасное действие: подтверждение обязательно (ADR-005), статус честный (ADR-010) */
  function dangerous(text, onYes, action, object) {
    A.openModal({
      title: 'Опасное действие',
      body: `<p style="margin:0 0 8px">${A.esc(text)}</p>
             <div class="tts-priv warn">Действие записывается в аудит и не отменяется через Undo.
             В реальной системе оно требует прав администратора и, для части операций, повторной аутентификации.</div>`,
      submitText: 'Да, выполнить',
      onSubmit: () => {
        A.closeModal();
        onYes();
        if (action) audit(action, object || '');
        A.toast('Выполнено (демо) · запись в аудите');
        A.render();
      }
    });
  }

  /* ================= Страница ================= */

  A.pages.admin = function () {
    const st = s();
    const nav = TABS.map(([id, label, ico]) =>
      `<button class="nav-item ${tab === id ? 'active' : ''}" data-action="adm-tab" data-id="${id}">
         <span class="ico">${ico}</span>${label}</button>`).join('');
    const em = st.admin.emergency || {};
    const html = `
    <div class="page-head">
      <div>
        <h1>Админка</h1>
        <div class="sub">/admin — системная область: пользователи, роли, аудит, миграции, health, бэкап, флаги, аварийные переключатели</div>
      </div>
      <span class="pill accent">демо</span>
    </div>

    <div class="card adm-principle">
      <div class="set-row">
        <div class="grow">
          <div class="t">Принцип разделения (ADR-012)</div>
          <div class="s">/admin управляет системой, /settings — данными конкретного пользователя.
            Администратор не действует от имени пользователя автоматически: доступ к чужим данным возможен
            только через явные, записанные в аудит процедуры. Эмуляция пользователя в прототипе не реализована.</div>
        </div>
        ${(em.readonly || em.maintenance) ? '<span class="pill warn">включён ограниченный режим</span>' : '<span class="pill ok">обычный режим</span>'}
      </div>
    </div>

    <div class="set-layout">
      <div class="set-nav">${nav}</div>
      <div>${renderTab()}</div>
    </div>`;
    return { html };
  };

  function renderTab() {
    const st = s(), a = adm();
    if (tab === 'users') return `
      <h2 class="set-h">Пользователи</h2>
      <p class="set-sub">${a.users.length} записей · блокировка, роль, 2FA, завершение сессий — опасные действия требуют подтверждения</p>
      <div class="card">
        <table class="tbl">
          <thead><tr><th>Пользователь</th><th>Роль</th><th>Статус</th><th>2FA</th><th>Последний вход</th><th></th></tr></thead>
          <tbody>
            ${a.users.map((u) => `
            <tr data-id="${A.esc(u.id)}">
              <td><div class="t">${A.esc(u.name)}</div><div class="s">${A.esc(u.email)}</div></td>
              <td><select data-action="adm-user-role" data-id="${A.esc(u.id)}" ${u.id === 'u1' ? 'disabled title="Роль владельца не меняется в демо"' : ''}>
                    ${a.roles.map((r) => `<option value="${r.id}" ${r.id === u.role ? 'selected' : ''}>${A.esc(r.name)}</option>`).join('')}
                  </select></td>
              <td>${u.status === 'активен' ? '<span class="pill ok">активен</span>' : '<span class="pill danger">заблокирован</span>'}</td>
              <td>${u.twoFactor ? '<span class="pill ok">включена</span>' : '<span class="pill warn">не включена</span>'}</td>
              <td class="s">${A.esc(u.last)}</td>
              <td><div class="btn-row">
                ${u.id === 'u1' ? '<span class="pill">это вы</span>' : `
                  <button class="btn small" data-action="adm-user-block" data-id="${A.esc(u.id)}">${u.status === 'активен' ? 'Заблокировать' : 'Разблокировать'}</button>
                  <button class="btn small" data-action="adm-user-sessions" data-id="${A.esc(u.id)}">Завершить сессии</button>
                  ${u.twoFactor ? '' : '<button class="btn small" data-action="adm-user-2fa" data-id="' + A.esc(u.id) + '">Требовать 2FA</button>'}`}
              </div></td>
            </tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card"><div class="set-sub">Политика обязательности 2FA по ролям — открытый вопрос (SECURITY §11).
        В прототипе требование включается вручную для конкретного пользователя.</div></div>`;

    if (tab === 'roles') return `
      <h2 class="set-h">Роли и права (RBAC)</h2>
      <p class="set-sub">Минимум Stage 1.0 · права проверяются на каждом объекте (SECURITY §1), а не только на уровне раздела</p>
      <div class="card">
        ${a.roles.map((r) => `
        <div class="set-row">
          <div class="grow"><div class="t">${A.esc(r.name)} <span class="pill">${r.users} пользователь(ей)</span></div>
            <div class="s">${A.esc(r.perms)}</div></div>
          <code>${A.esc(r.id)}</code>
        </div>`).join('')}
      </div>
      <div class="card"><div class="set-sub">Изменение роли — опасное действие: пишется в аудит и требует подтверждения.
        Тонкая настройка прав (матрица «роль × действие») в минимум 1.0 не входит.</div></div>`;

    if (tab === 'audit') return `
      <h2 class="set-h">Аудит административных действий</h2>
      <p class="set-sub">${a.audit.length} записей · отделён от пользовательской истории (ADR-012)</p>
      <div class="card">
        <table class="tbl">
          <thead><tr><th>Когда</th><th>Кто</th><th>Действие</th><th>Объект</th><th>Результат</th></tr></thead>
          <tbody>
            ${a.audit.map((x) => `
            <tr><td class="time">${A.esc(x.when)}</td><td class="s">${A.esc(x.actor)}</td>
                <td><code>${A.esc(x.action)}</code></td><td>${A.esc(x.object)}</td>
                <td>${x.result === 'ok' ? '<span class="pill ok">ok</span>' : '<span class="pill danger">' + A.esc(x.result) + '</span>'}</td></tr>`).join('')}
          </tbody>
        </table>
      </div>
      <div class="card"><div class="tts-priv warn">Механизм защиты критического audit trail от незаметного удаления
        (append-only / WORM / мультиподпись) не выбран — открытый вопрос №14 (SECURITY §11).
        В прототипе аудит доступен для чтения и пополнения, защита не реализована.</div></div>`;

    if (tab === 'migrations') return `
      <h2 class="set-h">Миграции</h2>
      <p class="set-sub">Миграции — код в репозитории, применяются в деплое с rollback-планом (ADMIN §18, ADR-113)</p>
      <div class="card">
        ${a.migrations.map((m) => `
        <div class="set-row">
          <div class="grow"><div class="t">${A.esc(m.name)}</div><div class="s"><code>${A.esc(m.id)}</code>${m.at !== '—' ? ' · применена ' + A.esc(m.at) : ''}</div></div>
          ${m.status === 'применена'
            ? '<span class="pill ok">применена</span>'
            : `<button class="btn small primary" data-action="adm-migrate" data-id="${A.esc(m.id)}">Применить</button>`}
        </div>`).join('')}
      </div>
      <div class="card"><div class="set-sub">Применение миграции — опасное действие: подтверждение, запись в аудит,
        откат отдельной операцией. В прототипе схема не меняется.</div></div>`;

    if (tab === 'health') {
      const h = a.health;
      return `
      <h2 class="set-h">Health</h2>
      <p class="set-sub">ADMIN §16 · минимум наблюдаемости на Stage 1: health endpoint, структурные логи, uptime</p>
      <div class="grid cols-3">
        <div class="card stat"><div class="num">${A.esc(h.uptime)}</div><div class="t">аптайм</div></div>
        <div class="card stat"><div class="num">${h.errors24h}</div><div class="t">ошибок за 24 ч</div></div>
        <div class="card stat"><div class="num">${A.esc(h.dbSize)}</div><div class="t">размер БД</div></div>
      </div>
      <div class="card">
        ${[['Версия', h.version], ['База данных', h.db], ['Очередь задач', h.queue], ['Последний бэкап', h.lastBackup], ['Хранилище файлов', h.storage]].map(
          ([k, v]) => `<div class="set-row"><div class="grow"><div class="t">${A.esc(k)}</div></div><div class="s">${A.esc(v)}</div></div>`).join('')}
        <div class="btn-row"><button class="btn" data-action="adm-health">Обновить показатели</button></div>
      </div>
      <div class="card"><div class="set-sub">Состав наблюдаемости (метрики/ошибки/Sentry) — открытый вопрос №37;
        в прототипе показан минимум.</div></div>`;
    }

    if (tab === 'backup') return `
      <h2 class="set-h">Бэкап и восстановление</h2>
      <p class="set-sub">ADMIN §17, SECURITY §8 · бэкап и проверенное восстановление — часть деплоя, а не дополнение</p>
      <div class="card">
        ${a.backups.map((b) => `
        <div class="set-row">
          <div class="grow"><div class="t">${A.esc(b.id)}</div>
            <div class="s">${A.esc(b.at)} · ${A.esc(b.size)} · ${A.esc(b.kind)} ·
              восстановление ${b.verified ? '<span class="pill ok">проверено</span>' : '<span class="pill warn">не проверено</span>'}</div></div>
          <div class="btn-row">
            ${b.verified ? '' : `<button class="btn small" data-action="adm-backup-verify" data-id="${A.esc(b.id)}">Проверить восстановление</button>`}
            <button class="btn small danger" data-action="adm-backup-restore" data-id="${A.esc(b.id)}">Восстановить</button>
          </div>
        </div>`).join('')}
        <div class="btn-row"><button class="btn primary" data-action="adm-backup-create">Создать бэкап сейчас</button></div>
      </div>
      <div class="card"><div class="tts-priv warn">Восстановление из бэкапа необратимо для текущих данных и
        **не** отменяется через Undo — только явное подтверждение (MVP_SCOPE §5.9).</div></div>`;

    if (tab === 'flags') return `
      <h2 class="set-h">Флаги функций</h2>
      <p class="set-sub">ADMIN §5 · всё, чего нет в срезе 1.0, выключено и не показывается пользователю (ADR-010)</p>
      <div class="card">
        ${a.flags.map((fl) => `
        <div class="set-row">
          <div class="grow"><div class="t">${A.esc(fl.name)}</div>
            <div class="s"><code>${A.esc(fl.id)}</code> · этап: ${A.esc(fl.stage)}</div></div>
          <label class="switch"><input type="checkbox" ${fl.on ? 'checked' : ''} data-action="adm-flag" data-id="${A.esc(fl.id)}"><span class="slider"></span></label>
        </div>`).join('')}
      </div>
      <div class="card"><div class="set-sub">Включение флага пишется в аудит. Экспериментальные функции пользователя —
        в <a href="#/settings">Настройки → Экспериментальные</a>; это разные уровни: системный и пользовательский.</div></div>`;

    if (tab === 'emergency') {
      const em = a.emergency;
      return `
      <h2 class="set-h">Аварийные переключатели</h2>
      <p class="set-sub">ADMIN §21 · каждое переключение — опасное действие с подтверждением и записью в аудит</p>
      <div class="card">
        <div class="set-row"><div class="grow"><div class="t">Режим «только чтение»</div>
          <div class="s">Данные видны, изменения запрещены всем пользователям</div></div>
          <label class="switch"><input type="checkbox" ${em.readonly ? 'checked' : ''} data-action="adm-emergency" data-id="readonly"><span class="slider"></span></label></div>
        <div class="set-row"><div class="grow"><div class="t">Закрыть регистрацию</div>
          <div class="s">Новые аккаунты не создаются; существующие работают</div></div>
          <label class="switch"><input type="checkbox" ${em.registrationsClosed ? 'checked' : ''} data-action="adm-emergency" data-id="registrationsClosed"><span class="slider"></span></label></div>
        <div class="set-row"><div class="grow"><div class="t">Режим обслуживания</div>
          <div class="s">Сайт отдаёт страницу обслуживания; админка доступна</div></div>
          <label class="switch"><input type="checkbox" ${em.maintenance ? 'checked' : ''} data-action="adm-emergency" data-id="maintenance"><span class="slider"></span></label></div>
        <div class="btn-row">
          <button class="btn danger" data-action="adm-kill-sessions">Завершить все сессии, кроме текущей</button>
        </div>
      </div>
      <div class="card"><div class="set-sub">Состояние переключателей в прототипе реально влияет на демо-поведение:
        «Закрыть регистрацию» отключает создание аккаунта на экране регистрации.</div></div>`;
    }
    return '<div class="card"><div class="empty">Раздел не найден.</div></div>';
  }

  function userById(id) { return adm().users.filter((u) => u.id === id)[0]; }

  /* ================= Действия ================= */

  A.register({
    'adm-tab': (el) => { tab = el.dataset.id; A.render(); },

    'adm-user-role': (el) => {
      const u = userById(el.dataset.id); if (!u) return;
      const next = el.value;
      if (next === u.role) return;
      const prev = u.role;
      dangerous(`Изменить роль пользователя «${u.name}» с «${prev}» на «${next}»?`, () => {
        u.role = next; S.save();
        A.logAction({ action: 'admin.user.role.set', title: 'Изменена роль пользователя', object: u.name,
          objectType: 'other', undoable: false, danger: true, changes: [{ field: 'Роль', from: prev, to: next }] });
      }, 'user.role.set', u.name + ' = ' + next);
      A.render(); // select возвращается к сохранённому значению, пока ждём подтверждения
    },

    'adm-user-block': (el) => {
      const u = userById(el.dataset.id); if (!u) return;
      const blocking = u.status === 'активен';
      dangerous(`${blocking ? 'Заблокировать' : 'Разблокировать'} пользователя «${u.name}»?`, () => {
        u.status = blocking ? 'заблокирован' : 'активен'; S.save();
        A.logAction({ action: 'admin.user.status', title: blocking ? 'Пользователь заблокирован' : 'Пользователь разблокирован',
          object: u.name, objectType: 'other', undoable: false, danger: true,
          changes: [{ field: 'Статус', from: blocking ? 'активен' : 'заблокирован', to: blocking ? 'заблокирован' : 'активен' }] });
      }, 'user.block', u.name);
    },

    'adm-user-sessions': (el) => {
      const u = userById(el.dataset.id); if (!u) return;
      dangerous(`Завершить все сессии пользователя «${u.name}»? Потребуется повторный вход.`, () => {
        A.logAction({ action: 'admin.session.kill', title: 'Завершены сессии пользователя', object: u.name,
          objectType: 'session', undoable: false, danger: true, changes: [] });
      }, 'session.kill', u.name);
    },

    'adm-user-2fa': (el) => {
      const u = userById(el.dataset.id); if (!u) return;
      dangerous(`Требовать двухфакторную аутентификацию от «${u.name}» при следующем входе?`, () => {
        u.twoFactor = true; S.save();
        A.logAction({ action: 'admin.user.2fa.require', title: 'Потребована 2FA', object: u.name,
          objectType: 'other', undoable: true, danger: false, changes: [{ field: '2FA', from: 'не включена', to: 'обязательна' }] });
      }, 'user.2fa.require', u.name);
    },

    'adm-migrate': (el) => {
      const m = a_migrations(el.dataset.id); if (!m) return;
      dangerous(`Применить миграцию «${m.name}» (${m.id})? Операция затрагивает схему данных.`, () => {
        m.status = 'применена'; m.at = 'только что (демо)'; S.save();
        A.logAction({ action: 'admin.migration.apply', title: 'Применена миграция', object: m.name,
          objectType: 'system', undoable: false, danger: true, changes: [{ field: 'Статус', from: 'ожидает', to: 'применена' }] });
      }, 'migration.apply', m.id);
    },

    'adm-health': () => { A.toast('Показатели обновлены (демо)'); A.render(); },

    'adm-backup-create': () => {
      const st = s();
      const id = 'b-manual-' + (st.admin.backups.length + 1);
      st.admin.backups.unshift({ id: id, at: A.nowLabel(), size: st.admin.health.dbSize, kind: 'ручной', verified: false });
      S.save(); audit('backup.create', id);
      A.logAction({ action: 'backup.create', title: 'Создан бэкап', object: id, objectType: 'system', undoable: false });
      A.toast('Бэкап создан (демо)'); A.render();
    },

    'adm-backup-verify': (el) => {
      const b = adm().backups.filter((x) => x.id === el.dataset.id)[0]; if (!b) return;
      b.verified = true; S.save(); audit('backup.verify', b.id);
      A.logAction({ action: 'backup.verify', title: 'Проверено восстановление из бэкапа', object: b.id,
        objectType: 'system', undoable: false, changes: [{ field: 'Восстановление', from: 'не проверено', to: 'проверено' }] });
      A.toast('Восстановление проверено (демо) — критерий S3 из STACK_RESEARCH §12'); A.render();
    },

    'adm-backup-restore': (el) => {
      const b = adm().backups.filter((x) => x.id === el.dataset.id)[0]; if (!b) return;
      A.openModal({
        title: 'Восстановление из бэкапа',
        body: `<p style="margin:0 0 8px">Восстановить данные из <b>${A.esc(b.id)}</b> (${A.esc(b.at)})?</p>
               <div class="tts-priv warn">Текущие данные будут заменены. Действие необратимо и не отменяется через Undo.
               ${b.verified ? '' : 'Восстановление этого бэкапа не проверялось — сначала лучше выполнить проверку.'}</div>
               <label class="field" style="margin-top:10px"><span>Напишите RESTORE для подтверждения</span>
                 <input type="text" name="word" placeholder="RESTORE"></label>`,
        submitText: 'Восстановить',
        onSubmit: (v) => {
          if (String(v.word || '').trim().toUpperCase() !== 'RESTORE') { A.toast('Подтверждение не совпало — операция отменена'); return; }
          A.closeModal(); audit('backup.restore', b.id);
          A.logAction({ action: 'backup.restore', title: 'Восстановление из бэкапа', object: b.id,
            objectType: 'system', undoable: false, danger: true, changes: [] });
          A.toast('Данные восстановлены (демо)'); A.render();
        }
      });
    },

    'adm-flag': (el) => {
      const fl = adm().flags.filter((x) => x.id === el.dataset.id)[0]; if (!fl) return;
      const next = el.checked;
      fl.on = next; S.save(); audit('flag.set', fl.id + ' = ' + (next ? 'on' : 'off'));
      A.logAction({ action: 'admin.flag.set', title: next ? 'Флаг включён' : 'Флаг выключен', object: fl.name,
        objectType: 'system', undoable: true, changes: [{ field: fl.id, from: next ? 'off' : 'on', to: next ? 'on' : 'off' }] });
      A.toast('Флаг «' + fl.name + '» ' + (next ? 'включён' : 'выключен') + ' (демо)');
      A.render();
    },

    'adm-emergency': (el) => {
      const st = s(), key = el.dataset.id, next = el.checked;
      const labels = { readonly: 'режим «только чтение»', registrationsClosed: 'закрытие регистрации', maintenance: 'режим обслуживания' };
      dangerous(`${next ? 'Включить' : 'Выключить'} ${labels[key] || key}? Это повлияет на всех пользователей.`, () => {
        st.admin.emergency[key] = next;
        if (key === 'registrationsClosed') st.auth.registrationsOpen = !next; // реальная связь в демо
        S.save();
        A.logAction({ action: 'admin.emergency.' + key, title: (next ? 'Включён ' : 'Выключен ') + (labels[key] || key),
          object: 'Система', objectType: 'system', undoable: true, danger: true,
          changes: [{ field: labels[key] || key, from: next ? 'выкл' : 'вкл', to: next ? 'вкл' : 'выкл' }] });
      }, 'emergency.' + key, labels[key] || key);
      A.render(); // переключатель возвращается к сохранённому состоянию, пока ждём подтверждения
    },

    'adm-kill-sessions': () => {
      dangerous('Завершить все сессии всех пользователей, кроме текущей? Потребуется повторный вход, включая 2FA.', () => {
        const st = s();
        st.sessions = (st.sessions || []).filter((x) => x.current);
        S.save();
        A.logAction({ action: 'admin.session.kill_all', title: 'Завершены все сессии', object: 'кроме текущей',
          objectType: 'session', undoable: false, danger: true, changes: [] });
      }, 'session.kill_all', 'все, кроме текущей');
    }
  });

  function a_migrations(id) { return adm().migrations.filter((m) => m.id === id)[0]; }
})();
