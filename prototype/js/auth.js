/* Aven — Visual Prototype. Вход, регистрация, 2FA, восстановление доступа, выход.
   Спецификация: docs/MVP_SCOPE.md §5.1 (аккаунт и сессии); принципы: SECURITY §1, §10; ADR-110 (Proposed).
   Не production: данные не проверяются на сервере, всё локально; настоящая авторизация появится после
   утверждения ADR-110 и стека. Экраны отображаются без сайдбара и топбара (body.auth-mode). */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const s = () => S.s();

  let step = 'login';        // 'login' | '2fa'
  let errs = {};
  let note = '';

  const val = (id) => { const el = document.getElementById(id); return el ? String(el.value || '').trim() : ''; };

  function emailOk(v) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v); }

  function field(id, label, type, hint, extra) {
    const e = errs[id];
    return `<label class="field auth-field ${e ? 'invalid' : ''}">
        <span>${A.esc(label)}</span>
        <input type="${type}" id="${id}" ${extra || ''} autocomplete="${type === 'password' ? 'current-password' : 'on'}"
               aria-invalid="${e ? 'true' : 'false'}" ${e ? 'aria-describedby="' + id + '-err"' : ''}>
        ${hint ? `<span class="s">${A.esc(hint)}</span>` : ''}
        ${e ? `<span class="auth-err" id="${id}-err" role="alert">${A.esc(e)}</span>` : ''}
      </label>`;
  }

  function shell(title, sub, body, foot) {
    return `
    <div class="auth-wrap">
      <div class="auth-card card">
        <div class="auth-logo"><span class="logo-mark">A</span><div><b>Aven</b><div class="s">личный помощник · прототип</div></div></div>
        <h1 class="auth-title">${A.esc(title)}</h1>
        <div class="auth-sub">${sub}</div>
        ${note ? `<div class="tts-priv">${note}</div>` : ''}
        ${body}
        ${foot || ''}
        <div class="auth-demo">ДЕМО · ПРОТОТИП. Данные не отправляются на сервер и не проверяются.
          Настоящая авторизация (сессии в БД, TOTP, rate limits) появится после утверждения ADR-110 и стека
          (docs/DECISIONS.md).</div>
      </div>
    </div>`;
  }

  /* ================= ВХОД ================= */

  A.pages.login = function () {
    const st = s();
    if (step === '2fa') {
      return {
        html: shell('Двухфакторная аутентификация',
          'Введите 6-значный код из приложения-аутентификатора (TOTP)',
          `<div class="auth-body">
             ${field('code2fa', 'Код', 'text', 'Демо: принимается любой 6-значный код', 'inputmode="numeric" maxlength="6" pattern="[0-9]{6}"')}
             <button class="btn primary block" data-action="auth-2fa">Подтвердить и войти</button>
             <button class="btn block" data-action="auth-cancel-2fa">← Назад к вводу пароля</button>
           </div>`,
          `<div class="auth-links">
             <button class="btn small" data-action="auth-recovery">Нет доступа к коду?</button>
           </div>`)
      };
    }
    return {
      html: shell('Вход',
        'Аккаунт обязателен: данные принадлежат пользователю, а не системе (ADR-008)',
        `<div class="auth-body">
           ${st.auth.deletedNote ? `<div class="tts-priv warn">${A.esc(st.auth.deletedNote)}</div>
             <button class="btn block" data-action="auth-restore-demo" title="Вернуть исходный демо-набор прототипа">Вернуть демо-данные прототипа</button>` : ''}
           ${field('login-email', 'Email', 'email', '', `value="${A.esc(st.auth.email)}"`)}
           ${field('login-pass', 'Пароль', 'password', 'Демо: пароль не проверяется')}
           <label class="check-row"><input type="checkbox" id="login-remember" checked> Запомнить это устройство</label>
           <button class="btn primary block" data-action="auth-login">Войти</button>
         </div>`,
        `<div class="auth-links">
           <button class="btn small" data-action="auth-goto" data-id="register">Создать аккаунт</button>
           <button class="btn small" data-action="auth-goto" data-id="recovery">Забыли пароль?</button>
           <button class="btn small" data-action="auth-enter-demo" title="Пропустить экран входа и войти в демо">Войти как демо-пользователь →</button>
         </div>`)
    };
  };

  /* ================= РЕГИСТРАЦИЯ ================= */

  A.pages.register = function () {
    const st = s();
    const closed = !st.auth.registrationsOpen;
    return {
      html: shell('Создать аккаунт',
        closed ? '' : 'Имя, email и пароль; 2FA можно включить после первого входа',
        closed
          ? `<div class="tts-priv warn">Регистрация закрыта администратором (Админка → Аварийные → «Закрыть регистрацию»).
             Существующие аккаунты работают. Это реальная связь экранов в прототипе, а не заглушка.</div>
             <div class="auth-links"><button class="btn small" data-action="auth-goto" data-id="login">← К входу</button></div>`
          : `<div class="auth-body">
               ${field('reg-name', 'Имя', 'text', 'как обращаться к вам')}
               ${field('reg-email', 'Email', 'email', '')}
               ${field('reg-pass', 'Пароль', 'password', 'минимум 8 символов (порог задаёт владелец — MVP_SCOPE §5.1)')}
               ${field('reg-pass2', 'Повторите пароль', 'password', '')}
               <label class="check-row"><input type="checkbox" id="reg-terms"> Я понимаю, что это прототип и данные никуда не отправляются</label>
               ${errs['reg-terms'] ? `<span class="auth-err" role="alert">${A.esc(errs['reg-terms'])}</span>` : ''}
               <button class="btn primary block" data-action="auth-register">Создать аккаунт</button>
             </div>
             <div class="auth-links"><button class="btn small" data-action="auth-goto" data-id="login">Уже есть аккаунт</button></div>`)
    };
  };

  /* ================= ВОССТАНОВЛЕНИЕ ================= */

  A.pages.recovery = function () {
    const st = s();
    return {
      html: shell('Восстановление доступа',
        'Честное состояние среза 1.0, а не имитация письма',
        `<div class="auth-body">
           ${field('rec-email', 'Email', 'email', '', `value="${A.esc(st.auth.email)}"`)}
           <button class="btn primary block" data-action="auth-recover">Проверить возможность восстановления</button>
           <div class="tts-priv warn">${A.esc(st.auth.recoveryNote || '')}.
             Поэтому в срезе 1.0 восстановление работает ограниченно: сброс пароля администратором
             (Админка → Пользователи) либо вход с включённой 2FA. Имитация «письмо отправлено»
             нарушила бы принцип честных статусов (ADR-010).</div>
         </div>`,
        `<div class="auth-links">
           <button class="btn small" data-action="auth-goto" data-id="login">← К входу</button>
           <button class="btn small" data-action="auth-goto" data-id="admin">Админка (демо)</button>
         </div>`)
    };
  };

  /* ================= Действия ================= */

  function go(id) { errs = {}; note = ''; location.hash = '#/' + id; }

  function enter() {
    const st = s();
    st.auth.logged = true; S.save();
    if (A.logAction) A.logAction({
      action: 'auth.login', title: 'Вход в аккаунт', object: 'Chrome · демо-устройство',
      objectType: 'session', undoable: false,
      changes: [{ field: '2FA', from: '—', to: st.auth.twoFactor ? 'код подтверждён' : 'не используется' }]
    });
    step = 'login'; errs = {}; note = '';
    location.hash = '#/home';
    A.toast('Вход выполнен (демо)');
  }

  A.register({
    'auth-goto': (el) => { step = 'login'; go(el.dataset.id); },

    'auth-enter-demo': () => { errs = {}; note = ''; enter(); },

    'auth-login': () => {
      errs = {};
      const email = val('login-email'), pass = val('login-pass');
      if (!emailOk(email)) errs['login-email'] = 'Введите корректный email';
      if (pass.length < 8) errs['login-pass'] = 'Минимум 8 символов (демо: значение не проверяется на сервере)';
      if (Object.keys(errs).length) { A.render(); return; }
      const st = s();
      st.auth.email = email; S.save();
      if (st.auth.twoFactor) { step = '2fa'; note = ''; A.render(); const c = document.getElementById('code2fa'); if (c) c.focus(); return; }
      enter();
    },

    'auth-2fa': () => {
      const code = val('code2fa');
      if (!/^\d{6}$/.test(code)) { errs = { code2fa: 'Нужно ровно 6 цифр' }; A.render(); return; }
      errs = {};
      enter();
    },

    'auth-cancel-2fa': () => { step = 'login'; errs = {}; A.render(); },

    'auth-register': () => {
      errs = {}; note = '';   // примечание прошлого шага не должно блокировать следующую попытку
      const st = s();
      if (!st.auth.registrationsOpen) { note = 'Регистрация закрыта администратором.'; A.render(); return; }
      const name = val('reg-name'), email = val('reg-email'), p1 = val('reg-pass'), p2 = val('reg-pass2');
      const terms = document.getElementById('reg-terms');
      if (name.length < 2) errs['reg-name'] = 'Укажите имя (минимум 2 символа)';
      if (!emailOk(email)) errs['reg-email'] = 'Введите корректный email';
      if (p1.length < 8) errs['reg-pass'] = 'Минимум 8 символов';
      if (p1 !== p2) errs['reg-pass2'] = 'Пароли не совпадают';
      if (!terms || !terms.checked) errs['reg-terms'] = 'Нужно подтвердить, что это прототип и данные никуда не отправляются.';
      if (Object.keys(errs).length) { A.render(); return; }
      // демо: аккаунт «создаётся» локально
      st.auth.name = name; st.auth.email = email; S.save();
      if (A.logAction) A.logAction({ action: 'auth.register', title: 'Создан аккаунт (демо)', object: email,
        objectType: 'session', undoable: false, changes: [{ field: '2FA', from: '—', to: 'не включена' }] });
      step = 'login'; errs = {};
      note = 'Аккаунт создан (демо). В реальной системе письмо для подтверждения не отправляется: email-провайдер ' +
             'не выбран (вопрос №16). Войдите и включите 2FA в Настройки → Безопасность.';
      A.toast('Аккаунт создан (демо)');
      location.hash = '#/login';
      A.render();
    },

    'auth-recover': () => {
      errs = {};
      const email = val('rec-email');
      if (!emailOk(email)) { errs['rec-email'] = 'Введите корректный email'; A.render(); return; }
      note = 'Проверка выполнена (демо): автоматический сброс по email в срезе 1.0 недоступен — ' +
             (s().auth.recoveryNote || 'email-провайдер не выбран') +
             '. Обратитесь к администратору: Админка → Пользователи.';
      A.render();
    },

    'auth-recovery': () => {
      A.openModal({
        title: 'Нет доступа к коду 2FA', submitText: null, cancelText: 'Закрыть',
        body: `<p style="margin:0 0 8px">В срезе 1.0 предусмотрены два пути (MVP_SCOPE §5.1):</p>
               <ul class="set-sub" style="margin:0 0 8px 18px">
                 <li>резервные коды, выданные при включении 2FA (в реальной системе);</li>
                 <li>сброс администратором: Админка → Пользователи (записывается в аудит).</li>
               </ul>
               <div class="tts-priv">Восстановление по email недоступно, пока не выбран email-провайдер (вопрос №16).</div>`
      });
    },

    'logout': () => {
      A.confirmModal('Выйти из аккаунта? Незавершённые изменения форм останутся только в прототипе.', () => {
        const st = s();
        st.auth.logged = false; S.save();
        if (A.logAction) A.logAction({ action: 'auth.logout', title: 'Выход из аккаунта', object: 'Chrome · демо-устройство',
          objectType: 'session', undoable: false, changes: [] });
        step = 'login'; errs = {}; note = '';
        A.closeModal();
        location.hash = '#/login';
        A.toast('Вы вышли (демо)');
      });
    },

    'auth-sessions-kill': () => {
      A.confirmModal('Завершить все сессии, кроме текущей? На других устройствах потребуется повторный вход.', () => {
        const st = s();
        st.sessions = (st.sessions || []).filter((x) => x.current);
        S.save();
        if (A.logAction) A.logAction({ action: 'session.kill', title: 'Завершены другие сессии', object: 'кроме текущей',
          objectType: 'session', undoable: true, danger: true, changes: [] });
        A.closeModal(); A.toast('Другие сессии завершены (демо)'); A.render();
      });
    },

    'auth-2fa-enable': (el) => {
      const st = s();
      const want = !!el.checked;
      const apply = (how) => {
        st.auth.twoFactor = want; S.save();
        if (A.logAction) A.logAction({
          action: 'settings.update', title: want ? '2FA включена' : '2FA отключена',
          object: 'Настройки → Безопасность', objectType: 'settings', undoable: true, sensitive: true,
          danger: !want,
          changes: [{ field: '2FA (TOTP)', from: want ? 'выкл' : 'вкл', to: want ? 'вкл' : 'выкл' }]
        });
        A.toast(want ? '2FA включена: следующий вход потребует код (демо)' : '2FA отключена — подтверждено паролем (демо)');
        A.render();
      };
      if (want) { apply('confirm'); return; }
      /* Отключение 2FA — опасное действие: требуется «подтвердите паролем сейчас»
         (MVP_SCOPE §5.1 приёмка 4, §7; механизм re-auth — открытый вопрос №21). */
      A.openModal({
        title: 'Отключить двухфакторную аутентификацию?',
        body: `<div class="tts-priv warn">⚠️ Без 2FA для входа будет достаточно пароля. Действие чувствительное,
                 поэтому требуется повторная аутентификация (MVP_SCOPE §7).</div>
               <div class="field"><label>Текущий пароль</label>
                 <input type="password" name="pass" placeholder="••••••••" autocomplete="current-password">
                 <div class="s">Демо: пароль не проверяется по-настоящему, принимается «demo-pass-123».</div></div>`,
        submitText: 'Отключить 2FA',
        onSubmit: (v) => {
          if (String(v.pass || '') !== 'demo-pass-123') {
            A.toast('Повторная аутентификация не пройдена — 2FA осталась включённой');
            A.closeModal(); A.render();     /* возвращаем переключатель к сохранённому состоянию */
            return;
          }
          A.closeModal(); apply('reauth');
        }
      });
      A.render();   /* до подтверждения переключатель показывает сохранённое значение, а не клик */
    },
    /* возврат демо-данных после сценария удаления аккаунта */
    'auth-restore-demo': () => {
      S.reset(); A.applyEnv(); location.hash = '#/home'; A.render();
      A.toast('Демо-данные прототипа возвращены');
    }
  });
})();
