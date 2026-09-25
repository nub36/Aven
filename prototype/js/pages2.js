/* Aven — Visual Prototype. Страницы: Финансы, Авто, Покупки, Автоматизации, Assistant. Не production. */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const s = () => S.s();

  /* ================= ФИНАНСЫ ================= */
  A.pages.finance = function () {
    const st = s();
    const maxV = Math.max.apply(null, st.finChart.map((x) => x.v));
    const catMax = Math.max.apply(null, st.finCats.map((x) => x.v));
    const html = `
    <div class="page-head">
      <div><h1>Финансы</h1><div class="sub">Работает через обычные формы, независимо от Command Engine · демо</div></div>
      <button class="btn primary" data-action="fin-add">＋ Операция</button>
    </div>
    <div class="grid cols-3" style="margin-bottom:16px">
      <div class="card stat"><div class="l">Баланс</div><div class="v">${A.money(st.finMonth.balance)}</div><div class="d">демо-значение</div></div>
      <div class="card stat"><div class="l">Расходы месяца</div><div class="v neg">${A.money(st.finMonth.expense)}</div><div class="d">сентябрь (демо)</div></div>
      <div class="card stat"><div class="l">Доходы месяца</div><div class="v pos">${A.money(st.finMonth.income)}</div><div class="d">сентябрь (демо)</div></div>
    </div>
    <div class="grid cols-2">
      <div class="card">
        <h3>Расходы по месяцам</h3>
        <div class="bars">
          ${st.finChart.map((x) => `
          <div class="bar-wrap" title="${x.m}: ${A.money(x.v)}">
            <div class="bv">${Math.round(x.v / 1000)}к</div>
            <div class="bar" style="height:${Math.max(8, Math.round(x.v / maxV * 100))}%"></div>
            <div class="bl">${x.m}</div>
          </div>`).join('')}
        </div>
        <h3 style="margin-top:20px">Категории месяца</h3>
        ${st.finCats.map((c) => `
        <div class="cat-row">
          <div class="cat-top"><span>${A.esc(c.name)}</span><b>${A.money(c.v)}</b></div>
          <div class="cat-bar"><div style="width:${Math.round(c.v / catMax * 100)}%"></div></div>
        </div>`).join('')}
      </div>
      <div class="card">
        <h3>Последние операции</h3>
        <table class="tbl">
          <tr><th>Что</th><th>Категория</th><th>Когда</th><th class="num">Сумма</th></tr>
          ${st.ops.map((o) => `
          <tr>
            <td>${A.esc(o.title)}</td>
            <td><span class="pill">${A.esc(o.cat)}</span></td>
            <td class="s" style="color:var(--muted)">${A.esc(o.date)}</td>
            <td class="num ${o.type === 'income' ? 'pos' : 'neg'}">${o.type === 'income' ? '+' : '−'}${A.money(o.amount)}</td>
          </tr>`).join('')}
        </table>
        <div style="color:var(--muted);font-size:.82rem;margin-top:10px">Категории: Авто · Продукты · Дом · Подписки · Другое · Доход</div>
      </div>
    </div>`;
    return { html };
  };

  /* ================= АВТО ================= */
  let autoTab = 'overview';
  A.pages.auto = function () {
    const car = s().car;
    const tabs = [
      ['overview', 'Обзор'], ['fuel', 'Заправки'], ['expenses', 'Расходы'],
      ['service', 'Обслуживание'], ['docs', 'Документы'], ['history', 'История']
    ];
    let tab = '';
    if (autoTab === 'overview') {
      tab = `
      <div class="grid cols-4">
        <div class="card stat"><div class="l">Средний расход</div><div class="v" style="font-size:1.2rem">${A.esc(car.consumption)}</div></div>
        <div class="card stat"><div class="l">Затраты месяца</div><div class="v" style="font-size:1.2rem">${A.esc(car.monthCost)}</div></div>
        <div class="card stat"><div class="l">Последнее ТО</div><div class="v" style="font-size:1.2rem">12.08.2026</div><div class="d">замена масла</div></div>
        <div class="card stat"><div class="l">Следующее обслуживание</div><div class="v" style="font-size:1.2rem">2 480 км</div><div class="d">или до 12.02.2027</div></div>
      </div>
      <div class="card" style="margin-top:16px">
        <h3>Последняя заправка</h3>
        <div class="row-item"><div class="grow"><div class="t">42 л · 3 200 ₽</div><div class="s">29.09 · 104 120 км · 76.2 ₽/л</div></div><span class="pill ok">актуально</span></div>
        <div class="s" style="color:var(--muted);font-size:.82rem;margin-top:8px">Все данные привязываются к конкретному автомобилю (концепция).</div>
      </div>`;
    } else if (autoTab === 'fuel') {
      tab = `
      <div class="card">
        <h3>Заправки</h3>
        <table class="tbl">
          <tr><th>Дата</th><th class="num">Литры</th><th class="num">Сумма</th><th class="num">Цена/л</th><th class="num">Пробег</th></tr>
          ${car.fuel.map((f) => `
          <tr><td>${A.esc(f.date)}</td><td class="num">${f.liters} л</td><td class="num">${A.money(f.sum)}</td>
          <td class="num">${(f.sum / f.liters).toFixed(1)} ₽</td><td class="num">${f.km.toLocaleString('ru-RU')} км</td></tr>`).join('')}
        </table>
      </div>`;
    } else if (autoTab === 'expenses') {
      tab = `
      <div class="card">
        <h3>Расходы</h3>
        <table class="tbl">
          <tr><th>Что</th><th>Когда</th><th class="num">Сумма</th></tr>
          ${car.expenses.map((e) => `<tr><td>${A.esc(e.title)}</td><td style="color:var(--muted)">${A.esc(e.date)}</td><td class="num neg">${A.money(e.amount)}</td></tr>`).join('')}
        </table>
      </div>`;
    } else if (autoTab === 'service') {
      tab = `
      <div class="card">
        <h3>Обслуживание</h3>
        ${car.service.map((x) => `
        <div class="row-item"><div class="grow"><div class="t">${A.esc(x.title)}</div>
        <div class="s">${A.esc(x.date)} · ${x.km.toLocaleString('ru-RU')} км</div></div><b class="num">${A.money(x.cost)}</b></div>`).join('')}
      </div>`;
    } else if (autoTab === 'docs') {
      tab = `
      <div class="card">
        <h3>Документы</h3>
        ${car.docs.map((d) => {
          const w = A.warrantyStatus(d.until === 'без срока' ? '' : d.until.split('.').reverse().join('.'));
          const cls = d.until === 'без срока' ? '' : w.cls;
          const label = d.until === 'без срока' ? 'без срока' : 'до ' + d.until;
          return `<div class="row-item"><div class="grow"><div class="t">${A.esc(d.title)}</div></div><span class="pill ${cls}">${A.esc(label)}</span></div>`;
        }).join('')}
        <div class="s" style="color:var(--muted);font-size:.82rem;margin-top:8px">Напоминания по дате и пробегу — в перспективе.</div>
      </div>`;
    } else {
      tab = `
      <div class="card">
        <h3>История</h3>
        <div class="timeline">
          <div class="tl-item"><div style="display:flex;gap:12px"><span class="time">22.09</span><div><b>Ремонт подвески — 25 000 ₽</b></div></div></div>
          <div class="tl-item"><div style="display:flex;gap:12px"><span class="time">29.09</span><div><b>Заправка 42 л / 3 200 ₽</b></div></div></div>
          <div class="tl-item done"><div style="display:flex;gap:12px"><span class="time">12.08</span><div><b>Замена масла — 8 900 ₽ (102 300 км)</b></div></div></div>
          <div class="tl-item done"><div style="display:flex;gap:12px"><span class="time">04.06</span><div><b>ТО: колодки — 14 200 ₽ (98 700 км)</b></div></div></div>
        </div>
      </div>`;
    }
    const html = `
    <div class="page-head">
      <div><h1>Авто</h1><div class="sub">Самостоятельный функциональный раздел · демо</div></div>
      <div class="btn-row">
        <button class="btn" data-action="fuel-add">＋ Заправка</button>
        <button class="btn" data-action="auto-expense">＋ Расход</button>
        <button class="btn" data-action="auto-service">＋ Обслуживание</button>
        <button class="btn" data-action="auto-mileage">Обновить пробег</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="car-head">
        <div class="car-emoji">🚗</div>
        <div>
          <div style="font-size:1.25rem;font-weight:700">${A.esc(car.model)} <span class="pill accent" style="margin-left:6px">основной автомобиль</span></div>
          <div style="color:var(--muted);margin-top:3px">${car.year} год · бензин · демо-данные</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="l" style="color:var(--muted);font-size:.84rem">Пробег</div>
          <div class="mileage">${car.mileage.toLocaleString('ru-RU')} км</div>
        </div>
      </div>
    </div>
    <div class="tabs" id="auto-tabs">
      ${tabs.map(([id, label]) => `<button class="tab ${autoTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
    </div>
    ${tab}`;
    return { html, mount: (root) => { A.bindTabs(root.querySelector('#auto-tabs'), (v) => { autoTab = v; A.render(); }); } };
  };

  /* ================= ПОКУПКИ ================= */
  A.pages.shopping = function () {
    const items = s().purchases;
    const html = `
    <div class="page-head">
      <div><h1>Покупки / Имущество</h1><div class="sub">Гарантии · чеки · обслуживание · демо</div></div>
      <button class="btn primary" data-action="shop-add">＋ Покупка</button>
    </div>
    <div class="shop-grid">
      ${items.map((p) => {
        const w = A.warrantyStatus(p.warranty);
        return `
        <div class="card shop-card" data-action="shop-open" data-id="${p.id}">
          <div class="ph">${p.emoji}</div>
          <div style="font-weight:700;font-size:1.05rem">${A.esc(p.name)}</div>
          <div style="color:var(--muted);margin:4px 0 10px">${A.money(p.price)} · куплено ${A.esc(p.date)}</div>
          <span class="pill ${w.cls}">${A.esc(w.label)}</span>
        </div>`;
      }).join('')}
    </div>
    <div class="s" style="color:var(--muted);font-size:.84rem;margin-top:14px">Фото/файлы, серийные номера, ремонты и статус собственности — в демо частично; полный состав — FEATURES.md.</div>`;
    return { html };
  };

  /* ================= АВТОМАТИЗАЦИИ ================= */
  A.pages.automation = function () {
    const st = s();
    const html = `
    <div class="page-head">
      <div><h1>Автоматизации</h1><div class="sub">Готовые автоматизации · простые правила · расписания · демо</div></div>
      <button class="btn primary" data-action="auto-add">＋ Автоматизация</button>
    </div>
    <div class="card" style="margin-bottom:16px">
      <h3>Активные</h3>
      ${st.automations.map((a) => `
      <div class="auto-li">
        <div class="auto-ico">${a.icon}</div>
        <div class="grow" style="flex:1">
          <div style="font-weight:600">${A.esc(a.name)}</div>
          <div style="color:var(--muted);font-size:.85rem">${A.esc(a.trigger)}</div>
          <div style="color:var(--muted);font-size:.8rem;margin-top:3px">последний запуск: ${A.esc(a.last)} · следующий: ${A.esc(a.next)}</div>
        </div>
        <label class="switch" title="Включить/выключить (демо)">
          <input type="checkbox" ${a.enabled ? 'checked' : ''} data-action="auto-toggle" data-id="${a.id}">
          <span class="slider"></span>
        </label>
      </div>`).join('')}
    </div>
    <div class="grid cols-2">
      <div class="card">
        <h3>Visual Automation Canvas — планируется</h3>
        <div class="s" style="color:var(--muted);font-size:.88rem;margin-bottom:12px">Node-based редактор — Stage 4, после стабилизации данных и Action Core. Ниже — только макет концепции:</div>
        <div class="canvas-preview">
          <div class="cnode trigger">[08:00]</div><span class="carrow">→</span>
          <div class="cnode">[Получить события]</div><span class="carrow">→</span>
          <div class="cnode">[Получить задачи]</div><span class="carrow">→</span>
          <div class="cnode">[Сформировать обзор]</div><span class="carrow">→</span>
          <div class="cnode">[Произнести]</div>
        </div>
        <div class="s" style="color:var(--muted);font-size:.8rem;margin-top:10px">Типы блоков (план): Trigger · Schedule · Action · Condition · Delay · Variables · Math · Data · HTTP/API · Webhook · Loop · Output · Speak · Notification · User data · Device.</div>
      </div>
      <div class="card">
        <h3>Готовые шаблоны</h3>
        ${window.AvenDemo.staticData.automationTemplates.map((t) => `
        <div class="row-item"><div class="grow"><div class="t">${A.esc(t)}</div></div><button class="btn small" data-action="auto-tpl" data-name="${A.esc(t)}">Включить</button></div>`).join('')}
        <div class="s" style="color:var(--muted);font-size:.82rem;margin-top:10px">Обычный пользователь не обязан разбираться в Canvas.</div>
      </div>
    </div>`;
    return { html };
  };

  /* ================= ASSISTANT ================= */
  A._chat = null;
  A.pages.assistant = function () {
    if (!A._chat) {
      A._chat = [
        { who: 'user', text: 'Сколько я потратил сегодня?' },
        { who: 'aven', text: 'Сегодня записано расходов на 3 420 ₽.' },
        { who: 'user', text: 'Что у меня завтра?' },
        { who: 'aven', text: 'Завтра у вас два события: планёрка в 10:00 и спортзал в 18:30. Напомнить о них заранее?' }
      ];
    }
    const html = `
    <div class="assistant">
      <div class="a-inner">
        <div class="a-top"><button class="btn" data-action="assistant-exit">← Выйти из Assistant</button></div>
        <div class="a-logo">
          <div class="char-wrap">${window.AvenChar ? window.AvenChar.avatar('s52') : '<div class="logo-mark mark">A</div>'}</div>
          <h1>${window.AvenChar && !window.AvenChar.isOff() ? A.esc(window.AvenChar.display()) : 'Aven'}</h1>
          ${window.AvenChar && !window.AvenChar.isOff() ? `<div class="char-name">${A.esc(window.AvenChar.current().label)} · персонаж-оформление</div>` : ''}
          <p>Что сделать?</p>
        </div>
        <div class="chat" id="chat"></div>
        <div class="sugg">
          <button class="btn small" data-action="sugg" data-q="Что сегодня?">Что сегодня?</button>
          <button class="btn small" data-action="sugg" data-q="Добавить расход">Добавить расход</button>
          <button class="btn small" data-action="sugg" data-q="Моя машина">Моя машина</button>
          <button class="btn small" data-action="sugg" data-q="Создать напоминание">Создать напоминание</button>
        </div>
        <div class="demo-cmds">
          <span class="dc-label">Демо-команды (state machine, без AI)</span>
          ${window.AvenFlows ? window.AvenFlows.listCommands().map((c) => `<button class="btn small" data-action="flow-start" data-id="${c.id}">⚡ ${A.esc(c.command)}</button>`).join('') : ''}
          <button class="btn small" data-action="sugg" data-q="Отмена">Отмена</button>
          <button class="btn small" data-action="sugg" data-q="Помощь">Помощь</button>
        </div>
        <div class="a-input">
          <button class="icon-btn" data-action="mic-stt" title="Голосовой ввод (экспериментально)">🎤</button>
          <input type="text" id="chat-input" placeholder="Напишите команду… (демо)">
          <button class="btn primary" data-action="chat-send" title="Отправить">→</button>
        </div>
        <div class="s" style="color:var(--muted);font-size:.78rem;text-align:center;padding:8px 0 14px">Assistant не заменяет обычные страницы сайта · прототип · персонаж и голос — опциональный слой</div>
      </div>
    </div>`;
    return { html, mount: renderChat };
  };

  function renderChat() {
    const box = document.getElementById('chat');
    if (!box) return;
    const ava = window.AvenChar && !window.AvenChar.isOff() ? window.AvenChar.avatar('s24') : '';
    box.innerHTML = A._chat.map((m, i) => {
      if (m.who === 'user') return `<div class="msg user">${A.esc(m.text)}</div>`;
      const body = `<div>${A.esc(m.text)}</div>
        <button class="speak" data-action="chat-speak" data-i="${i}">🔊 Озвучить</button>`;
      return `<div class="msg aven"><div class="msg-row">${ava ? `<span class="bubble-avatar">${ava}</span>` : ''}<div style="flex:1">${body}</div></div></div>`;
    }).join('') + (A._stt && A._stt.active ? `<div class="stt-status"><span class="rec"></span>Слушаю… (экспериментальный STT)</div>` : '');
    box.scrollTop = box.scrollHeight;
  }

  function replyFor(q) {
    const qn = q.toLowerCase();
    for (const r of window.AvenDemo.staticData.assistantReplies) {
      if (new RegExp(r.q).test(qn)) return r.a;
    }
    return window.AvenDemo.staticData.assistantDefault;
  }

  function pushAven(text, speak) {
    A._chat.push({ who: 'aven', text: text });
    renderChat();
    if (speak && s().settings.voice.alwaysVoice) A.speak(text, null);
  }

  function helpText() {
    const cmds = window.AvenFlows ? window.AvenFlows.listCommands().map((c) => '«' + c.command + '»').join(', ') : '';
    return 'Демо-команды (без AI): ' + cmds + '. Также работают подсказки выше. Скажите «Отмена», чтобы прервать сценарий.';
  }

  /* демо-роутинг: многошаговые сценарии + простые команды; fallback — статичные ответы */
  function routeCommand(t) {
    const tn = t.toLowerCase();
    if (/(отмен|cancel|стоп|stop)/.test(tn)) {
      if (window.AvenFlows) window.AvenFlows.cancel();
      return window.AvenChar ? window.AvenChar.phrase('cancel') : 'Отменено.';
    }
    if (/заправ|залил|бензин|топлив/.test(tn)) {
      const r = window.AvenFlows.start('fuel');
      return 'Начинаю демо-сценарий «Заправка» (многошагово). ' + r.question;
    }
    if (/(важн|событ)/.test(tn)) {
      const r = window.AvenFlows.start('event');
      return 'Начинаю демо-сценарий «Важное событие». ' + r.question;
    }
    if (/(помощь|команды|что ты умеешь)/.test(tn)) return helpText();
    return replyFor(t);
  }

  A._assistantSend = function (text) {
    const t = (text || '').trim();
    if (!t) return;
    A._chat.push({ who: 'user', text: t });
    renderChat();
    setTimeout(() => {
      let out;
      if (window.AvenFlows && window.AvenFlows.isActive()) {
        const r = window.AvenFlows.advance(t);
        out = r ? r.text : replyFor(t);
      } else {
        out = routeCommand(t);
      }
      pushAven(out, true);
    }, 300);
  };

  /* ---------- озвучивание: делегируем browser speechSynthesis (voice.js) ---------- */
  A.speak = function (text, btn) {
    return window.AvenVoice ? window.AvenVoice.speak(text, btn) : false;
  };

  /* ================= действия ================= */
  A.register({
    'fin-add': () => {
      A.openModal({
        title: 'Новая операция',
        body: `
          <div class="field-row">
            <div class="field"><label>Тип</label><select name="type"><option value="expense">Расход</option><option value="income">Доход</option></select></div>
            <div class="field"><label>Сумма, ₽</label><input type="number" name="amount" placeholder="1000"></div>
          </div>
          <div class="field-row">
            <div class="field"><label>Категория</label><select name="cat"><option>Авто</option><option>Продукты</option><option>Дом</option><option>Подписки</option><option>Другое</option><option>Доход</option></select></div>
            <div class="field"><label>Дата</label><input type="date" name="date"></div>
          </div>
          <div class="field"><label>Комментарий</label><input type="text" name="comment"></div>`,
        onSubmit: (v) => {
          const st = S.s();
          const amt = +v.amount || 0;
          st.ops.unshift({ id: S.id('o'), type: v.type, cat: v.cat, title: v.comment || v.cat, amount: amt, date: 'сегодня', comment: '' });
          if (v.type === 'expense') st.finMonth.expense += amt; else st.finMonth.income += amt;
          S.save(); A.closeModal(); A.render(); A.demoToast('Операция добавлена (демо)');
        }
      });
    },

    'fuel-add': () => { location.hash = '#/auto'; setTimeout(() => { if (window.Aven.fuelForm) window.Aven.fuelForm(); }, 80); },
    'auto-expense': () => {
      A.openModal({
        title: 'Расход по автомобилю',
        body: `
          <div class="field"><label>Что</label><input type="text" name="title" placeholder="Мойка, ремонт…"></div>
          <div class="field-row">
            <div class="field"><label>Сумма, ₽</label><input type="number" name="amount"></div>
            <div class="field"><label>Дата</label><input type="date" name="date"></div>
          </div>`,
        onSubmit: (v) => {
          const st = S.s();
          st.car.expenses.unshift({ id: S.id('ce'), title: v.title || 'Расход', amount: +v.amount || 0, date: 'сегодня' });
          S.save(); A.closeModal(); A.render(); A.demoToast('Расход по авто добавлен (демо)');
        }
      });
    },
    'auto-service': () => {
      A.openModal({
        title: 'Обслуживание',
        body: `
          <div class="field"><label>Работа</label><input type="text" name="title" placeholder="Замена масла…"></div>
          <div class="field-row">
            <div class="field"><label>Дата</label><input type="date" name="date"></div>
            <div class="field"><label>Стоимость, ₽</label><input type="number" name="cost"></div>
          </div>
          <div class="field"><label>Пробег, км</label><input type="number" name="km" value="${s().car.mileage}"></div>`,
        onSubmit: (v) => {
          const st = S.s();
          st.car.service.unshift({ id: S.id('cs'), title: v.title || 'Работа', date: 'сегодня', cost: +v.cost || 0, km: +v.km || 0 });
          S.save(); A.closeModal(); A.render(); A.demoToast('Обслуживание добавлено (демо)');
        }
      });
    },
    'auto-mileage': () => {
      A.openModal({
        title: 'Обновить пробег',
        body: `<div class="field"><label>Текущий пробег, км</label><input type="number" name="km" value="${s().car.mileage}"></div>`,
        onSubmit: (v) => {
          const st = S.s();
          st.car.mileage = +v.km || st.car.mileage;
          S.save(); A.closeModal(); A.render(); A.demoToast('Пробег обновлён (демо)');
        }
      });
    },

    'shop-add': () => {
      A.openModal({
        title: 'Новая покупка',
        body: `
          <div class="field"><label>Название</label><input type="text" name="name" placeholder="Ноутбук…"></div>
          <div class="field-row">
            <div class="field"><label>Цена, ₽</label><input type="number" name="price"></div>
            <div class="field"><label>Дата покупки</label><input type="date" name="date"></div>
          </div>
          <div class="field"><label>Гарантия до</label><input type="date" name="warranty"></div>
          <div class="field"><label>Серийный номер</label><input type="text" name="sn" placeholder="необязательно"></div>`,
        onSubmit: (v) => {
          const st = S.s();
          const fmt = (iso) => { if (!iso) return '—'; const p = iso.split('-'); return p[2] + '.' + p[1] + '.' + p[0]; };
          st.purchases.unshift({ id: S.id('p'), name: v.name || 'Покупка', emoji: '📦', price: +v.price || 0, date: fmt(v.date), warranty: fmt(v.warranty), sn: v.sn, status: 'в собственности' });
          S.save(); A.closeModal(); A.render(); A.demoToast('Покупка добавлена (демо)');
        }
      });
    },
    'shop-open': (el) => {
      const p = s().purchases.find((x) => x.id === el.dataset.id);
      if (!p) return;
      const w = A.warrantyStatus(p.warranty);
      A.openModal({
        title: p.name,
        body: `
          <div class="set-row"><div class="grow"><div class="t">${A.money(p.price)}</div><div class="s">цена · куплено ${A.esc(p.date)}</div></div></div>
          <div class="set-row"><div class="grow"><div class="t"><span class="pill ${w.cls}">${A.esc(w.label)}</span></div><div class="s">гарантия</div></div></div>
          <div class="set-row"><div class="grow"><div class="t">${A.esc(p.sn || '—')}</div><div class="s">серийный номер (демо)</div></div></div>
          <div class="set-row"><div class="grow"><div class="t">${A.esc(p.status)}</div><div class="s">статус собственности</div></div></div>`,
        submitText: null, cancelText: 'Закрыть'
      });
    },

    'auto-toggle': (el) => {
      const a = s().automations.find((x) => x.id === el.dataset.id);
      if (a) { a.enabled = el.checked; S.save(); A.toast(a.name + ': ' + (a.enabled ? 'включена (демо)' : 'выключена (демо)')); }
    },
    'auto-add': () => {
      A.openModal({
        title: 'Новая автоматизация',
        body: `
          <div class="field"><label>Название</label><input type="text" name="name" placeholder="Моя автоматизация"></div>
          <div class="field"><label>Триггер</label><select name="trigger"><option>Каждый день, 09:00</option><option>По расписанию…</option><option>При добавлении заправки</option><option>При новой расходной операции</option></select></div>
          <div class="field"><label>Действие</label><select name="action"><option>Показать уведомление</option><option>Сформировать обзор</option><option>Посчитать статистику</option></select></div>
          <div class="s" style="color:var(--muted);font-size:.8rem">Полный Canvas — Stage 4; здесь — упрощённое демо.</div>`,
        onSubmit: (v) => {
          const st = S.s();
          st.automations.push({ id: S.id('a'), name: v.name || 'Моя автоматизация', icon: '⚡', trigger: v.trigger, enabled: false, last: '—', next: '—' });
          S.save(); A.closeModal(); A.render(); A.demoToast('Автоматизация создана выключенной (демо)');
        }
      });
    },
    'auto-tpl': (el) => A.toast('Шаблон «' + el.dataset.name + '» — демо. Состав решается отдельно (открытый вопрос №30).'),

    'flow-start': (el) => {
      const r = window.AvenFlows.start(el.dataset.id);
      if (r) { A._chat.push({ who: 'aven', text: 'Начинаю демо-сценарий «' + r.flow.title + '». ' + r.question }); renderChat(); }
    },

    'mic-stt': () => {
      if (!window.AvenVoice || !window.AvenVoice.support.stt) {
        A.toast('Голосовой ввод недоступен в этом браузере — используйте текст (экспериментально)');
        return;
      }
      if (A._stt && A._stt.active) { A._stt.stop(); A._stt = null; renderChat(); return; }
      const inp = document.getElementById('chat-input');
      A._stt = window.AvenVoice.createRecognizer({
        onStart: () => { if (inp) inp.placeholder = 'Слушаю… (экспериментальный STT)'; renderChat(); },
        onInterim: (t) => { if (inp) inp.value = t; },
        onFinal: (t) => { if (inp) inp.value = t; if (s().settings.voice.stt && s().settings.voice.stt.autoSend) { A._assistantSend(t); inp.value = ''; } },
        onEnd: () => { A._stt = null; if (inp) inp.placeholder = 'Напишите команду… (демо)'; renderChat(); },
        onError: (err) => {
          A._stt = null;
          if (inp) inp.placeholder = 'Напишите команду… (демо)';
          const map = { 'not-allowed': 'Нет доступа к микрофону', 'no-speech': 'Речь не распознана', 'audio-capture': 'Микрофон не найден' };
          A.toast((map[err] || 'Ошибка распознавания') + ' (экспериментально)');
          renderChat();
        }
      });
      if (A._stt) A._stt.start();
    },

    'chat-send': () => {
      const inp = document.getElementById('chat-input');
      if (inp && inp.value.trim()) { A._assistantSend(inp.value); inp.value = ''; }
    },
    'sugg': (el) => {
      const q = el.dataset.q;
      if (q === 'Добавить расход') {
        A._chat.push({ who: 'user', text: q });
        A._chat.push({ who: 'aven', text: 'Открываю форму расхода (демо).' });
        renderChat();
        setTimeout(() => window.Aven.actions['fin-add'](), 250);
        return;
      }
      A._assistantSend(q);
    },
    'chat-speak': (el) => {
      const m = A._chat[+el.dataset.i];
      if (m) A.speak(m.text, el);
    },
    'assistant-exit': () => { location.hash = '#/home'; }
  });

  // Enter в поле чата
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && e.target.id === 'chat-input') {
      window.Aven.actions['chat-send']();
    }
  });
})();
