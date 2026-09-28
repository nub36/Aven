/* Aven — Visual Prototype. Страницы: Финансы, Авто, Покупки, Автоматизации, Assistant. Не production. */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const s = () => S.s();

  /* ---------- финансы: экран поверх общего слоя действий (Stage 1.3) ----------
     Раздел больше не содержит своей денежной арифметики и своих правил пересчёта:
     операции, итоги, категории и счета приходят из `AvenActions.finance`. Это тот
     же слой, который позже вызовет разбор текстовой команды. */
  const Core = () => window.AvenActions;
  /* «Сегодня» — только из общего слоя дат, второй копии часов в разделе нет. */
  function todayISO(offset) { return Core().dates.todayISO(offset); }
  /* Формат даты — общий для всего сайта (Профиль → Формат даты), без второй копии правил. */
  function humanDate(iso) { return iso ? Core().dates.humanDate(iso) : '—'; }
  /* Сумма с копейками — для пояснения про точность денег: там округление до
     целых скрыло бы весь смысл примера. Формат валюты общий, второй копии нет. */
  function moneyExact(v) { return Core().money.exact(v); }
  function opDateISO(o) { return Core().finance.dateISO(o); }
  function opAccount(st, id) { return Core().finance.account(id); }
  function opSnapshot(o) { return Core().finance.snapshot(o); }
  /* Короткая подпись столбца: «47,9к» для тысяч, иначе сумма как есть. */
  function shortSum(v) {
    if (v >= 1000) return (Math.round(v / 100) / 10).toString().replace('.', ',') + 'к';
    return String(Math.round(v));
  }

  let finFilter = { type: 'all', cat: 'all', account: 'all', period: 'month', q: '' };

  /* ================= ФИНАНСЫ ================= */
  A.pages.finance = function () {
    const st = s();
    const C = Core();
    const cats = C.finance.categories();
    const accounts = C.finance.accounts();
    const ops = C.finance.getOperations(finFilter).items;
    const totals = C.finance.totals(finFilter);
    const catTotals = C.finance.byCategory(finFilter);
    const catMax = Math.max(1, ...catTotals.map((x) => x.v));
    const catUse = {};
    const accUse = {};
    C.finance.getOperations({}).items.forEach((o) => {
      catUse[o.cat] = (catUse[o.cat] || 0) + 1;
      accUse[o.account || 'card'] = (accUse[o.account || 'card'] || 0) + 1;
    });
    /* Верхние карточки считаются из тех же операций и счетов, что и таблица ниже.
       Раньше здесь показывались отдельно хранимые числа, которые расходились
       с операциями пользователя — это противоречило ADR-010 (честные статусы). */
    const summary = C.finance.summary();
    /* Помесячные расходы считаются из реальных операций. */
    const monthly = C.finance.monthly();
    const maxV = Math.max(1, ...monthly.map((x) => x.v));
    const html = `
    <div class="page-head">
      <div><h1>Финансы</h1><div class="sub">Операции · фильтры · счета · редактирование · демо · MVP_SCOPE §5.6</div></div>
      <div class="btn-row">
        <button class="btn" data-action="fin-export-csv" title="Выгрузить операции в CSV (MVP_SCOPE §5.6, приёмка 5)">Экспорт CSV</button>
        <button class="btn primary" data-action="fin-add" data-tour="finance-create">＋ Операция</button>
        ${A.helpActions ? A.helpActions('finance') : ''}
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:16px" data-tour="finance-summary">
      <div class="card stat"><div class="l">Баланс всего</div><div class="v ${summary.balance < 0 ? 'neg' : ''}">${A.money(summary.balance)}</div>
        <div class="d">${summary.balance < 0 ? '<span class="pill warn">отрицательный баланс — показан, не запрещён (§5.6)</span>' : 'сумма по вашим счетам: ' + accounts.length}</div></div>
      <div class="card stat"><div class="l">Расходы месяца</div><div class="v neg">${A.money(summary.monthExpense)}</div><div class="d">по операциям текущего месяца</div></div>
      <div class="card stat"><div class="l">Доходы месяца</div><div class="v pos">${A.money(summary.monthIncome)}</div><div class="d">по операциям текущего месяца</div></div>
      <div class="card stat"><div class="l">По фильтру</div><div class="v ${totals.net < 0 ? 'neg' : 'pos'}">${A.money(totals.net)}</div><div class="d">доходы ${A.money(totals.income)} · расходы ${A.money(totals.expense)}</div></div>
    </div>

    <div class="card fin-filters" data-tour="finance-filters">
      <div class="field-row">
        <label class="field"><span>Период</span><select data-action="fin-filter-period">
          <option value="today" ${finFilter.period === 'today' ? 'selected' : ''}>Сегодня</option>
          <option value="week" ${finFilter.period === 'week' ? 'selected' : ''}>7 дней</option>
          <option value="month" ${finFilter.period === 'month' ? 'selected' : ''}>Текущий месяц</option>
          <option value="all" ${finFilter.period === 'all' ? 'selected' : ''}>Всё время</option>
        </select></label>
        <label class="field"><span>Тип</span><select data-action="fin-filter-type">
          <option value="all" ${finFilter.type === 'all' ? 'selected' : ''}>Все</option>
          <option value="expense" ${finFilter.type === 'expense' ? 'selected' : ''}>Расходы</option>
          <option value="income" ${finFilter.type === 'income' ? 'selected' : ''}>Доходы</option>
        </select></label>
        <label class="field"><span>Категория</span><select data-action="fin-filter-cat">
          <option value="all" ${finFilter.cat === 'all' ? 'selected' : ''}>Все категории</option>
          ${cats.map((c) => `<option value="${A.esc(c)}" ${finFilter.cat === c ? 'selected' : ''}>${A.esc(c)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Счёт</span><select data-action="fin-filter-account">
          <option value="all" ${finFilter.account === 'all' ? 'selected' : ''}>Все счета</option>
          ${accounts.map((a) => `<option value="${A.esc(a.id)}" ${finFilter.account === a.id ? 'selected' : ''}>${A.esc(a.name)}</option>`).join('')}
        </select></label>
        <label class="field grow"><span>Поиск</span><input type="search" id="fin-q" value="${A.esc(finFilter.q)}" placeholder="Название, комментарий, категория…"></label>
      </div>
    </div>

    <div class="grid cols-2">
      <div class="card">
        <h3>Расходы по месяцам</h3>
        ${monthly.length ? `<div class="bars">
          ${monthly.map((x) => `
          <div class="bar-wrap" title="${A.esc(x.full)}: ${A.esc(A.money(x.v))}">
            <div class="bv">${A.esc(shortSum(x.v))}</div>
            <div class="bar" style="height:${Math.max(8, Math.round(x.v / maxV * 100))}%"></div>
            <div class="bl">${A.esc(x.m)}</div>
          </div>`).join('')}
        </div>
        <div class="s" style="color:var(--muted);font-size:.8rem;margin-top:6px">Считается по вашим операциям: показаны последние ${monthly.length} месяцев подряд, включая месяцы без расходов (у них столбик нулевой). Сравнение периодов и отчёты — отдельный этап.</div>`
      : '<div class="empty">Пока нет операций, по которым можно посчитать расходы по месяцам.</div>'}
        <h3 style="margin-top:20px">Категории по фильтру</h3>
        ${catTotals.length ? catTotals.map((c) => `
        <div class="cat-row">
          <div class="cat-top"><span>${A.esc(c.name)}</span><b>${A.money(c.v)}</b></div>
          <div class="cat-bar"><div style="width:${Math.round(c.v / catMax * 100)}%"></div></div>
        </div>`).join('') : '<div class="empty">Нет расходов по текущему фильтру</div>'}
        <div class="head" style="margin-top:20px" data-tour="finance-refs"><h3>Счета</h3><button class="btn small" data-action="fin-account-add">＋ Счёт</button></div>
        ${accounts.map((a) => `<div class="row-item"><div class="grow"><div class="t">${A.esc(a.name)}</div><div class="s">id: ${A.esc(a.id)} · операций: ${accUse[a.id] || 0}</div></div><b class="num ${a.balance < 0 ? 'neg' : ''}">${A.money(a.balance)}</b><span class="btn-row"><button class="btn small" data-action="fin-account-edit" data-id="${A.esc(a.id)}">Ред.</button><button class="btn small" data-action="fin-account-del" data-id="${A.esc(a.id)}">Удалить</button></span></div>`).join('')}
        <div class="head" style="margin-top:20px"><h3>Категории</h3><button class="btn small" data-action="fin-cat-add">＋ Категория</button></div>
        ${cats.map((c) => `<div class="row-item"><div class="grow"><div class="t">${A.esc(c)}</div><div class="s">операций: ${catUse[c] || 0}${catUse[c] ? ' · удалить нельзя, пока используется' : ''}</div></div><button class="btn small" data-action="fin-cat-del" data-name="${A.esc(c)}">Удалить</button></div>`).join('')}
      </div>
      <div class="card">
        <h3 data-tour="finance-list">Операции <span class="pill">${ops.length}</span></h3>
        ${ops.length ? `<table class="tbl">
          <tr><th>Что</th><th>Категория</th><th>Счёт</th><th>Когда</th><th class="num">Сумма</th><th title="Редактирование / удаление с Undo">⋯</th></tr>
          ${ops.map((o) => `
          <tr class="fin-row" data-id="${A.esc(o.id)}">
            <td>${A.esc(o.title)}${o.comment ? `<div class="s" style="color:var(--muted)">${A.esc(o.comment)}</div>` : ''}</td>
            <td><span class="pill">${A.esc(o.cat)}</span></td>
            <td class="s" style="color:var(--muted)">${A.esc(opAccount(st, o.account).name)}</td>
            <td class="s" style="color:var(--muted)">${A.esc(humanDate(opDateISO(o)))}${o.date && !/^\d{4}-/.test(o.date) ? `<div>${A.esc(o.date)}</div>` : ''}</td>
            <td class="num ${o.type === 'income' ? 'pos' : 'neg'}">${o.type === 'income' ? '+' : '−'}${A.money(o.amount)}</td>
            <td><span class="btn-row"><button class="btn small" data-action="fin-edit" data-id="${A.esc(o.id)}">Ред.</button><button class="btn small" data-action="fin-del" data-id="${A.esc(o.id)}" title="Удалить операцию: подтверждение + Undo, итоги пересчитаются">Удалить</button></span></td>
          </tr>`).join('')}
        </table>` : '<div class="empty">Нет операций по текущему фильтру</div>'}
        <div style="color:var(--muted);font-size:.82rem;margin-top:10px">Категории: ${cats.map(A.esc).join(' · ')}</div>
        <div class="tts-priv" style="margin-top:12px"><span>🧮</span>
          <div><b>Точность денег (SECURITY §5, MVP_SCOPE §5.6, приёмка 1):</b> суммы хранятся целыми
          в минимальных единицах валюты, поэтому <code>${moneyExact(0.1)} + ${moneyExact(0.2)} = ${moneyExact(A.sumMoney(0.1, 0.2))}</code>
          (в копейках <code>${A.minor(0.1)} + ${A.minor(0.2)} = ${A.minor(0.1) + A.minor(0.2)}</code>), а не
          <code>${0.1 + 0.2}</code>, как получилось бы при сложении float. В списках суммы показаны округлённо
          до целых, но считаются всегда по копейкам. Итоги месяца, баланс и баланс счёта
          пересчитываются при добавлении, редактировании и удалении операции; удаление требует подтверждения и отменяется
          через Undo (§5.6, приёмка 4).</div>
        </div>
      </div>
    </div>`;
    return { html, mount: (root) => { const inp = root.querySelector('#fin-q'); if (inp) inp.addEventListener('input', () => { finFilter.q = inp.value; A.render(); }); } };
  };

  /* ================= АВТО =================
     Все правила (что обязательно, как называется запись, как она связана с
     финансами, что вернёт отмена) живут в `AvenActions.auto`. Здесь — только экран. */
  let autoTab = 'overview';
  const AUTO_LABEL = { fuel: 'Заправка', expense: 'Расход авто', service: 'Обслуживание', doc: 'Документ' };

  function autoList(st, kind) { return Core().auto.getRecords(kind).items || []; }
  function autoDateISO(item) { return Core().auto.dateISO(item) || todayISO(); }
  function autoDocISO(item) { return Core().auto.docISO(item); }
  function autoDateLabel(iso) { return iso ? humanDate(iso) : '—'; }
  function autoCost(kind, item) { return Core().auto.cost(kind, item); }
  function autoTitle(kind, item) { return Core().auto.title(kind, item); }
  function autoSnapshot(kind, item) { return Core().auto.snapshot(kind, item); }
  function autoLinkedOp(st, item) { return Core().auto.linkedOp(item); }
  function autoRowActions(kind, item) {
    /* «Связано» определяется по самой операции, а не по сохранённому номеру:
       если операцию удалили в «Финансах», запись снова можно связать. */
    const linked = !!autoLinkedOp(null, item);
    return `<span class="btn-row compact">
      <button class="btn small" data-action="auto-${kind}-edit" data-id="${item.id}">Ред.</button>
      ${kind !== 'doc' ? `<button class="btn small" data-action="auto-fin-link" data-kind="${kind}" data-id="${item.id}" ${linked ? 'disabled' : ''}>В финансы</button>` : ''}
      <button class="btn small danger" data-action="auto-record-del" data-kind="${kind}" data-id="${item.id}">Удалить</button>
    </span>`;
  }
  function autoLinkedPill(st, item) { return autoLinkedOp(st, item) ? '<span class="pill accent">есть расход</span>' : '<span class="pill">без фин. связи</span>'; }

  A.pages.auto = function () {
    const st = s();
    const car = st.car;
    const tabs = [
      ['overview', 'Обзор'], ['fuel', 'Заправки'], ['expenses', 'Расходы'],
      ['service', 'Обслуживание'], ['docs', 'Документы'], ['history', 'История']
    ];
    /* Итоги по авто считает общий слой — те же числа увидят «Главная» и подсказки. */
    const stats = Core().auto.stats();
    const totalCost = stats.totalCost;
    const lastService = stats.lastService;
    const nextLeft = stats.nextServiceLeft;
    let tab = '';
    if (autoTab === 'overview') {
      const lastFuel = (car.fuel || [])[0];
      tab = `
      <div class="grid cols-4">
        <div class="card stat"><div class="l">Средний расход</div><div class="v" style="font-size:1.2rem">${A.esc(stats.consumption)}</div><div class="d">по заправкам и пробегу</div></div>
        <div class="card stat"><div class="l">Затраты по авто</div><div class="v" style="font-size:1.2rem">${A.money(totalCost)}</div><div class="d">топливо + расходы + ТО</div></div>
        <div class="card stat"><div class="l">Последнее ТО</div><div class="v" style="font-size:1.2rem">${lastService ? A.esc(autoDateLabel(autoDateISO(lastService))) : '—'}</div><div class="d">${lastService ? A.esc(lastService.title) : 'нет записей'}</div></div>
        <div class="card stat"><div class="l">Следующее обслуживание</div><div class="v ${nextLeft != null && nextLeft < 0 ? 'neg' : ''}" style="font-size:1.2rem">${nextLeft == null ? '—' : Math.max(0, nextLeft).toLocaleString('ru-RU') + ' км'}</div><div class="d">интервал ${Number(car.serviceIntervalKm) || 10000} км</div></div>
      </div>
      <div class="grid cols-2" style="margin-top:16px">
        <div class="card">
          <h3>Последняя заправка</h3>
          ${lastFuel ? `<div class="row-item"><div class="grow"><div class="t">${A.esc(lastFuel.liters)} л · ${A.money(lastFuel.sum)}</div><div class="s">${A.esc(lastFuel.date || autoDateLabel(autoDateISO(lastFuel)))} · ${(lastFuel.km || 0).toLocaleString('ru-RU')} км · ${lastFuel.liters ? (lastFuel.sum / lastFuel.liters).toFixed(1) : '—'} ₽/л</div></div>${autoLinkedPill(st, lastFuel)}</div>` : '<div class="empty">Заправок пока нет</div>'}
        </div>
        <div class="card">
          <h3 data-tour="auto-link">Финансовая связь</h3>
          <div class="tts-priv"><span>⛽</span><div>Заправки, расходы и ТО могут создавать связанные операции в «Финансах». При Undo откатываются и авто-запись, и расход, и баланс счёта.</div></div>
          <div class="s" style="color:var(--muted);font-size:.82rem;margin-top:8px">Документы остаются без финансовой операции; для файлов и сканов нужен будущий StorageProvider.</div>
        </div>
      </div>`;
    } else if (autoTab === 'fuel') {
      tab = `
      <div class="card">
        <h3>Заправки</h3>
        <table class="tbl">
          <tr><th>Дата</th><th class="num">Литры</th><th class="num">Сумма</th><th class="num">Цена/л</th><th class="num">Пробег</th><th>Связь</th><th></th></tr>
          ${(car.fuel || []).map((f) => `
          <tr><td>${A.esc(f.date || autoDateLabel(autoDateISO(f)))}</td><td class="num">${A.esc(f.liters)} л</td><td class="num">${A.money(f.sum)}</td>
          <td class="num">${f.liters ? (f.sum / f.liters).toFixed(1) : '—'} ₽</td><td class="num">${(f.km || 0).toLocaleString('ru-RU')} км</td><td>${autoLinkedPill(st, f)}</td><td>${autoRowActions('fuel', f)}</td></tr>`).join('')}
        </table>
      </div>`;
    } else if (autoTab === 'expenses') {
      tab = `
      <div class="card">
        <h3>Расходы</h3>
        <table class="tbl">
          <tr><th>Что</th><th>Категория</th><th>Когда</th><th class="num">Сумма</th><th>Связь</th><th></th></tr>
          ${(car.expenses || []).map((e) => `<tr><td>${A.esc(e.title)}</td><td>${A.esc(e.category || 'Другое')}</td><td style="color:var(--muted)">${A.esc(e.date || autoDateLabel(autoDateISO(e)))}</td><td class="num neg">${A.money(e.amount)}</td><td>${autoLinkedPill(st, e)}</td><td>${autoRowActions('expense', e)}</td></tr>`).join('')}
        </table>
      </div>`;
    } else if (autoTab === 'service') {
      tab = `
      <div class="card">
        <h3>Обслуживание</h3>
        ${(car.service || []).map((x) => `
        <div class="row-item"><div class="grow"><div class="t">${A.esc(x.title)} ${autoLinkedPill(st, x)}</div>
        <div class="s">${A.esc(x.date || autoDateLabel(autoDateISO(x)))} · ${(x.km || 0).toLocaleString('ru-RU')} км · ${A.esc(x.comment || 'без комментария')}</div></div><b class="num">${A.money(x.cost)}</b>${autoRowActions('service', x)}</div>`).join('') || '<div class="empty">Записей обслуживания пока нет</div>'}
      </div>`;
    } else if (autoTab === 'docs') {
      tab = `
      <div class="card">
        <h3>Документы</h3>
        ${(car.docs || []).map((d) => {
          const iso = autoDocISO(d);
          const w = iso ? Core().shopping.warrantyState(iso) : { cls: '', label: 'без срока' };
          const label = iso ? w.label.replace('Гарантия ', 'до ') : 'без срока';
          return `<div class="row-item"><div class="grow"><div class="t">${A.esc(d.title)}</div><div class="s">напомнить за ${Number(d.remindDays) || 0} дн.</div></div><span class="pill ${w.cls}">${A.esc(label)}</span>${autoRowActions('doc', d)}</div>`;
        }).join('') || '<div class="empty">Документы не добавлены</div>'}
        <div class="s" style="color:var(--muted);font-size:.82rem;margin-top:8px">Напоминания по дате показаны как данные прототипа; настоящие уведомления — отдельный будущий слой.</div>
      </div>`;
    } else {
      const rows = [];
      (car.fuel || []).forEach((x) => rows.push({ iso: autoDateISO(x), text: 'Заправка ' + x.liters + ' л · ' + A.money(x.sum), meta: (x.km || 0).toLocaleString('ru-RU') + ' км', linked: !!x.financeOpId }));
      (car.expenses || []).forEach((x) => rows.push({ iso: autoDateISO(x), text: x.title + ' · ' + A.money(x.amount), meta: x.category || 'расход', linked: !!x.financeOpId }));
      (car.service || []).forEach((x) => rows.push({ iso: autoDateISO(x), text: x.title + ' · ' + A.money(x.cost), meta: (x.km || 0).toLocaleString('ru-RU') + ' км', linked: !!x.financeOpId, done: true }));
      rows.sort((a, b) => String(b.iso).localeCompare(String(a.iso)));
      tab = `
      <div class="card">
        <h3>История авто</h3>
        <div class="timeline">
          ${rows.map((r) => `<div class="tl-item ${r.done ? 'done' : ''}"><div style="display:flex;gap:12px"><span class="time">${A.esc(autoDateLabel(r.iso))}</span><div><b>${A.esc(r.text)}</b><div class="s">${A.esc(r.meta)} · ${r.linked ? 'есть финансовая операция' : 'без финансовой связи'}</div></div></div></div>`).join('') || '<div class="empty">История пуста</div>'}
        </div>
      </div>`;
    }
    const html = `
    <div class="page-head">
      <div><h1>Авто</h1><div class="sub">Заправки · расходы · ТО · документы · связь с финансами · Stage 1.1 prototype</div></div>
      <div class="btn-row" data-tour="auto-actions">
        <button class="btn" data-action="auto-export-csv">Экспорт CSV</button>
        <button class="btn" data-action="fuel-add">＋ Заправка</button>
        <button class="btn" data-action="auto-expense">＋ Расход</button>
        <button class="btn" data-action="auto-service">＋ Обслуживание</button>
        <button class="btn" data-action="auto-doc">＋ Документ</button>
        <button class="btn" data-action="auto-mileage">Пробег</button>
        ${A.helpActions ? A.helpActions('auto') : ''}
      </div>
    </div>
    <div class="card" style="margin-bottom:16px" data-tour="auto-head">
      <div class="car-head">
        <div class="car-emoji">🚗</div>
        <div>
          <div style="font-size:1.25rem;font-weight:700">${A.esc(car.model)} <span class="pill accent" style="margin-left:6px">основной автомобиль</span></div>
          <div style="color:var(--muted);margin-top:3px">${car.year} год · ${A.esc(car.fuelType || 'топливо')} · документов к вниманию: ${stats.docsAttentionCount}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="l" style="color:var(--muted);font-size:.84rem">Пробег</div>
          <div class="mileage">${(car.mileage || 0).toLocaleString('ru-RU')} км</div>
        </div>
      </div>
    </div>
    <div class="tabs" id="auto-tabs" data-tour="auto-tabs">
      ${tabs.map(([id, label]) => `<button class="tab ${autoTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
    </div>
    ${tab}`;
    return { html, mount: (root) => { A.bindTabs(root.querySelector('#auto-tabs'), (v) => { autoTab = v; A.render(); }); } };
  };

  /* Формы авто: собирают введённое и отдают общему слою действий. Проверка,
     запись в историю, связанный расход и отмена — там, одинаково для всех входов. */
  function autoSubmit(kind, existing, payload, okText) {
    const res = existing
      ? Core().auto.updateRecord(kind, existing.id, payload)
      : Core().auto.createRecord(kind, payload);
    if (!res.ok) { A.toast(res.message || 'Не удалось сохранить запись'); return; }
    A.closeModal(); A.render();
    A.toast(res.linked ? okText.linked : okText.plain);
  }

  function autoFuelForm(existing) {
    const ex = existing ? autoSnapshot('fuel', existing) : { liters: '', sum: '', km: Core().auto.car().mileage || 0, dateISO: todayISO(), note: '', financeOpId: '' };
    A.openModal({
      title: existing ? 'Редактировать заправку' : 'Новая заправка',
      body: `
        <div class="field-row">
          <div class="field"><label>Литры</label><input type="number" name="liters" value="${A.esc(ex.liters)}" step="0.01" placeholder="42"></div>
          <div class="field"><label>Сумма, ₽</label><input type="number" name="sum" value="${existing ? A.esc(ex.sum) : ''}" step="0.01" placeholder="3200"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(ex.dateISO || todayISO())}"></div>
          <div class="field"><label>Пробег, км</label><input type="number" name="km" value="${A.esc(ex.km || Core().auto.car().mileage || 0)}"></div>
        </div>
        <div class="field"><label>Комментарий / АЗС</label><input type="text" name="note" value="${A.esc(ex.note || '')}" placeholder="Лукойл, полный бак…"></div>
        ${existing ? `<div class="tts-priv"><span>💰</span><div>${ex.financeOpId ? 'Связанная финансовая операция будет обновлена вместе с заправкой.' : 'Заправка пока не связана с финансами — используйте кнопку «В финансы» в таблице.'}</div></div>` : `<label class="set-row"><input type="checkbox" name="makeExpense" checked> <div class="grow"><div class="t">Создать связанный расход в финансах</div><div class="s">Сумма попадёт в категорию «Авто», баланс счёта пересчитается; Undo откатит обе записи.</div></div></label>`}`,
      onSubmit: (v) => autoSubmit('fuel', existing, {
        liters: v.liters, sum: v.sum, km: v.km, dateISO: v.date, note: v.note, linkFinance: !!v.makeExpense
      }, { linked: 'Заправка и расход добавлены · можно отменить', plain: existing ? 'Заправка сохранена · можно отменить' : 'Заправка добавлена · можно отменить' })
    });
  }

  function autoExpenseForm(existing) {
    const cats = ['Ремонт', 'Уход', 'Запчасти', 'Парковка', 'Штраф', 'Другое'];
    const ex = existing ? autoSnapshot('expense', existing) : { title: '', amount: '', category: cats[0], dateISO: todayISO(), comment: '', financeOpId: '' };
    A.openModal({
      title: existing ? 'Редактировать расход авто' : 'Расход по автомобилю',
      body: `
        <div class="field"><label>Что</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="Мойка, ремонт…"></div>
        <div class="field-row">
          <div class="field"><label>Категория</label><select name="category">${cats.map((c) => `<option ${ex.category === c ? 'selected' : ''}>${A.esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>Сумма, ₽</label><input type="number" name="amount" value="${existing ? A.esc(ex.amount) : ''}" step="0.01"></div>
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(ex.dateISO || todayISO())}"></div>
        </div>
        <div class="field"><label>Комментарий</label><input type="text" name="comment" value="${A.esc(ex.comment || '')}"></div>
        ${existing ? `<div class="tts-priv"><span>💰</span><div>${ex.financeOpId ? 'Связанный расход в финансах будет обновлён.' : 'Можно связать с финансами отдельной кнопкой в таблице.'}</div></div>` : `<label class="set-row"><input type="checkbox" name="makeExpense" checked> <div class="grow"><div class="t">Создать связанный расход в финансах</div><div class="s">Категория «Авто», пересчёт баланса и Undo для обеих записей.</div></div></label>`}`,
      onSubmit: (v) => autoSubmit('expense', existing, {
        title: v.title, amount: v.amount, category: v.category, dateISO: v.date, comment: v.comment, linkFinance: !!v.makeExpense
      }, { linked: 'Расход авто и финоперация добавлены · можно отменить', plain: existing ? 'Расход авто сохранён · можно отменить' : 'Расход по авто добавлен · можно отменить' })
    });
  }

  function autoServiceForm(existing) {
    const ex = existing ? autoSnapshot('service', existing) : { title: '', cost: '', km: Core().auto.car().mileage || 0, dateISO: todayISO(), comment: '', financeOpId: '' };
    A.openModal({
      title: existing ? 'Редактировать обслуживание' : 'Обслуживание',
      body: `
        <div class="field"><label>Работа</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="Замена масла…"></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(ex.dateISO || todayISO())}"></div>
          <div class="field"><label>Стоимость, ₽</label><input type="number" name="cost" value="${existing ? A.esc(ex.cost) : ''}" step="0.01"></div>
        </div>
        <div class="field"><label>Пробег, км</label><input type="number" name="km" value="${A.esc(ex.km || Core().auto.car().mileage || 0)}"></div>
        <div class="field"><label>Комментарий</label><input type="text" name="comment" value="${A.esc(ex.comment || '')}"></div>
        ${existing ? `<div class="tts-priv"><span>💰</span><div>${ex.financeOpId ? 'Связанная финансовая операция будет обновлена.' : 'Можно связать с финансами отдельной кнопкой.'}</div></div>` : `<label class="set-row"><input type="checkbox" name="makeExpense" checked> <div class="grow"><div class="t">Создать связанный расход в финансах</div><div class="s">Стоимость ТО попадёт в финансы; Undo откатит обе записи.</div></div></label>`}`,
      onSubmit: (v) => autoSubmit('service', existing, {
        title: v.title, cost: v.cost, km: v.km, dateISO: v.date, comment: v.comment, linkFinance: !!v.makeExpense
      }, { linked: 'Обслуживание и финоперация добавлены · можно отменить', plain: existing ? 'Обслуживание сохранено · можно отменить' : 'Обслуживание добавлено · можно отменить' })
    });
  }

  function autoDocForm(existing) {
    const ex = existing ? autoSnapshot('doc', existing) : { title: '', untilISO: '', remindDays: 30 };
    A.openModal({
      title: existing ? 'Редактировать документ авто' : 'Документ авто',
      body: `
        <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="ОСАГО, техосмотр…"></div>
        <div class="field-row">
          <div class="field"><label>Действует до</label><input type="date" name="until" value="${A.esc(ex.untilISO || '')}"></div>
          <div class="field"><label>Напомнить за, дней</label><input type="number" name="remindDays" value="${A.esc(ex.remindDays || 30)}"></div>
        </div>`,
      onSubmit: (v) => autoSubmit('doc', existing, { title: v.title, untilISO: v.until, remindDays: v.remindDays },
        { linked: 'Документ сохранён · можно отменить', plain: existing ? 'Документ сохранён · можно отменить' : 'Документ добавлен · можно отменить' })
    });
  }

  // pages2 загружается после pages1 и переопределяет быструю форму заправки на связанную с финансами версию.
  A.fuelForm = autoFuelForm;

  /* ================= ПОКУПКИ ================= */
  /* ================= ПОКУПКИ =================
     Правила статусов, гарантии, связи с финансами и отмены — в `AvenActions.shopping`. */
  const SHOP_STATUS = { owned: { label: 'в собственности', cls: 'ok' }, sold: { label: 'продано', cls: '' }, archived: { label: 'архив', cls: 'warn' } };
  let shopFilter = { status: 'owned', category: 'all', warranty: 'all', q: '' };

  function purchaseDateISO(p) { return Core().shopping.dateISO(p); }
  function purchaseWarrantyISO(p) { return Core().shopping.warrantyISO(p); }
  function purchaseDateLabel(iso) { return iso ? humanDate(iso) : '—'; }
  function purchaseStatusKey(p) { return Core().shopping.statusKey(p); }
  function purchaseStatusLabel(p) { return Core().shopping.statusLabel(p); }
  function purchaseStatusPill(p) {
    const st = Core().shopping.statuses[purchaseStatusKey(p)];
    return `<span class="pill ${st.cls}">${A.esc(st.label)}</span>`;
  }
  function purchaseWarrantyKind(p) { return Core().shopping.warrantyKind(p); }
  function purchaseCategories() { return Core().shopping.categories(); }
  function purchaseRepairs(p) { return Core().shopping.repairs(p); }
  function purchaseRepairTotal(p) { return Core().shopping.repairTotal(p); }
  function purchaseSnapshot(p) { return Core().shopping.snapshot(p); }

  function purchaseForm(existing) {
    const cats = purchaseCategories();
    const ex = existing ? purchaseSnapshot(existing) : {
      name: '', emoji: '📦', category: cats[0] || 'Другое', price: '', dateISO: todayISO(), store: '', warrantyISO: '',
      sn: '', status: 'owned', condition: '', note: '', financeOpId: ''
    };
    A.openModal({
      title: existing ? 'Редактировать покупку' : 'Новая покупка / имущество',
      wide: true,
      body: `
        <div class="field-row">
          <div class="field"><label>Название</label><input type="text" name="name" value="${A.esc(ex.name)}" placeholder="Ноутбук…"></div>
          <div class="field"><label>Иконка</label><input type="text" name="emoji" value="${A.esc(ex.emoji || '📦')}" maxlength="4"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Категория</label><select name="category">${cats.map((c) => `<option ${ex.category === c ? 'selected' : ''}>${A.esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>Цена, ₽</label><input type="number" name="price" value="${existing ? A.esc(ex.price) : ''}" step="0.01"></div>
          <div class="field"><label>Статус</label><select name="status">
            ${Object.keys(SHOP_STATUS).map((k) => `<option value="${k}" ${ex.status === k ? 'selected' : ''}>${A.esc(SHOP_STATUS[k].label)}</option>`).join('')}
          </select></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Дата покупки</label><input type="date" name="date" value="${A.esc(ex.dateISO || '')}"></div>
          <div class="field"><label>Гарантия до</label><input type="date" name="warranty" value="${A.esc(ex.warrantyISO || '')}"></div>
          <div class="field"><label>Магазин</label><input type="text" name="store" value="${A.esc(ex.store || '')}" placeholder="магазин / продавец"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Серийный номер</label><input type="text" name="sn" value="${A.esc(ex.sn || '')}" placeholder="необязательно"></div>
          <div class="field"><label>Состояние / место</label><input type="text" name="condition" value="${A.esc(ex.condition || '')}" placeholder="используется, гараж, продано…"></div>
        </div>
        <div class="field"><label>Заметка</label><textarea name="note" rows="3" placeholder="чек, комплект, особенности обслуживания">${A.esc(ex.note || '')}</textarea></div>
        ${existing ? '' : `<label class="set-row"><input type="checkbox" name="makeExpense"> <div class="grow"><div class="t">Создать связанный расход в финансах</div><div class="s">Будет добавлена операция расхода, сумма и баланс пересчитаются; Undo удалит и покупку, и расход.</div></div></label>`}
        <div class="tts-priv"><span>📎</span><div><b>Файлы не имитируются:</b> чеки и фото будут настоящими вложениями после выбора StorageProvider; сейчас фиксируются только метаданные и связь с финансами.</div></div>`,
      onSubmit: (v) => {
        const payload = {
          name: v.name, emoji: v.emoji, category: v.category, price: v.price, dateISO: v.date, store: v.store,
          warrantyISO: v.warranty, sn: v.sn, status: v.status, condition: v.condition, note: v.note,
          linkFinance: !!v.makeExpense
        };
        const res = existing ? Core().shopping.updatePurchase(existing.id, payload) : Core().shopping.createPurchase(payload);
        if (!res.ok) { A.toast(res.message || 'Не удалось сохранить покупку'); return; }
        A.closeModal(); A.render();
        A.toast(existing ? 'Покупка сохранена · можно отменить в истории'
          : (res.linked ? 'Покупка и связанный расход добавлены · можно отменить' : 'Покупка добавлена · можно отменить в истории'));
      }
    });
  }

  function purchaseServiceForm(p) {
    A.openModal({
      title: 'Ремонт / обслуживание',
      body: `
        <div class="field"><label>Что сделали</label><input type="text" name="title" placeholder="Ремонт, диагностика, обслуживание"></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date" value="${todayISO()}"></div>
          <div class="field"><label>Стоимость, ₽</label><input type="number" name="cost" step="0.01"></div>
        </div>
        <div class="field"><label>Комментарий</label><input type="text" name="comment" placeholder="сервис, гарантийный случай, детали"></div>`,
      onSubmit: (v) => {
        const res = Core().shopping.addService(p.id, { title: v.title, dateISO: v.date, cost: v.cost, comment: v.comment });
        if (!res.ok) { A.toast(res.message || 'Не удалось добавить запись'); return; }
        A.closeModal(); A.render(); A.toast('Запись обслуживания добавлена · можно отменить');
      }
    });
  }

  A.pages.shopping = function () {
    const st = s();
    const items = st.purchases || [];
    const cats = purchaseCategories();
    /* Отбор и итоги берутся из общего слоя — те же числа увидят «Главная» и подсказки. */
    const filtered = Core().shopping.getPurchases(shopFilter).items;
    const sum = Core().shopping.summary();
    const ownedCount = sum.owned;
    const total = sum.value;
    const activeWarranty = sum.warrantyActive;
    const attention = sum.warrantyAttention;
    const serviceTotal = sum.serviceTotal;
    const html = `
    <div class="page-head">
      <div><h1>Покупки / Имущество</h1><div class="sub">Гарантии · статусы · обслуживание · связь с финансами · Stage 1.1 prototype</div></div>
      <div class="btn-row">
        <button class="btn" data-action="shop-export-csv">Экспорт CSV</button>
        <button class="btn primary" data-action="shop-add" data-tour="shop-create">＋ Покупка</button>
        ${A.helpActions ? A.helpActions('shopping') : ''}
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:16px" data-tour="shop-summary">
      <div class="card stat"><div class="l">В собственности</div><div class="v">${ownedCount}</div><div class="d">активных предметов</div></div>
      <div class="card stat"><div class="l">Оценка стоимости</div><div class="v">${A.money(total)}</div><div class="d">по цене покупки</div></div>
      <div class="card stat"><div class="l">Гарантия действует</div><div class="v">${activeWarranty}</div><div class="d">истекает/истекла: ${attention}</div></div>
      <div class="card stat"><div class="l">Ремонты/сервис</div><div class="v">${A.money(serviceTotal)}</div><div class="d">по всем предметам</div></div>
    </div>
    <div class="card shop-filters" data-tour="shop-filters">
      <div class="field-row">
        <label class="field"><span>Статус</span><select data-action="shop-filter-status">
          <option value="owned" ${shopFilter.status === 'owned' ? 'selected' : ''}>В собственности</option>
          <option value="sold" ${shopFilter.status === 'sold' ? 'selected' : ''}>Продано</option>
          <option value="archived" ${shopFilter.status === 'archived' ? 'selected' : ''}>Архив</option>
          <option value="all" ${shopFilter.status === 'all' ? 'selected' : ''}>Все</option>
        </select></label>
        <label class="field"><span>Категория</span><select data-action="shop-filter-category">
          <option value="all" ${shopFilter.category === 'all' ? 'selected' : ''}>Все</option>
          ${cats.map((c) => `<option value="${A.esc(c)}" ${shopFilter.category === c ? 'selected' : ''}>${A.esc(c)}</option>`).join('')}
        </select></label>
        <label class="field"><span>Гарантия</span><select data-action="shop-filter-warranty">
          <option value="all" ${shopFilter.warranty === 'all' ? 'selected' : ''}>Любая</option>
          <option value="active" ${shopFilter.warranty === 'active' ? 'selected' : ''}>Действует</option>
          <option value="warn" ${shopFilter.warranty === 'warn' ? 'selected' : ''}>Скоро закончится</option>
          <option value="expired" ${shopFilter.warranty === 'expired' ? 'selected' : ''}>Истекла</option>
          <option value="none" ${shopFilter.warranty === 'none' ? 'selected' : ''}>Не указана</option>
        </select></label>
        <label class="field grow"><span>Поиск</span><input id="shop-q" type="search" value="${A.esc(shopFilter.q)}" placeholder="название, магазин, серийный номер…"></label>
      </div>
    </div>
    ${filtered.length ? `<div class="shop-grid" data-tour="shop-list">
      ${filtered.map((p) => {
        const w = Core().shopping.warrantyState(purchaseWarrantyISO(p));
        const linked = p.financeOpId && (st.ops || []).some((o) => o.id === p.financeOpId);
        return `
        <div class="card shop-card" data-action="shop-open" data-id="${p.id}">
          <div class="ph">${A.esc(p.emoji || '📦')}</div>
          <div class="shop-title">${A.esc(p.name)}</div>
          <div class="shop-meta">${A.esc(p.category || 'Другое')} · ${A.money(p.price || 0)} · ${A.esc(p.store || 'магазин не указан')}</div>
          <div class="tags" style="margin:8px 0 10px">${purchaseStatusPill(p)} <span class="pill ${w.cls}">${A.esc(w.label)}</span>${linked ? ' <span class="pill accent">есть расход</span>' : ''}</div>
          <div class="shop-meta">Куплено ${A.esc(p.date || purchaseDateLabel(purchaseDateISO(p)))} · SN ${A.esc(p.sn || '—')}</div>
          <div class="shop-actions">
            <button class="btn small" data-action="shop-edit" data-id="${p.id}">Редактировать</button>
            <button class="btn small" data-action="shop-service" data-id="${p.id}">Сервис</button>
            <button class="btn small" data-action="shop-fin-link" data-id="${p.id}" ${linked ? 'disabled' : ''}>В финансы</button>
            <button class="btn small" data-action="shop-status" data-id="${p.id}">Статус</button>
          </div>
        </div>`;
      }).join('')}
    </div>` : `<div class="card"><div class="empty">Покупки не найдены. Измените фильтры или добавьте новый предмет.</div></div>`}
    <div class="card" style="margin-top:16px">
      <h3>Что честно не имитируем</h3>
      <div class="tts-priv"><span>📁</span><div>Чеки, фото и файлы не создаются фейково: это зависит от будущего StorageProvider. В прототипе уже есть метаданные, статусы, сервисные записи, Undo и связь с финансовыми операциями.</div></div>
    </div>`;
    return { html, mount: (root) => { const inp = root.querySelector('#shop-q'); if (inp) inp.addEventListener('input', () => { shopFilter.q = inp.value; A.render(); }); } };
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

  /* ================= ASSISTANT =================
     Stage 2: экран помощника — это адаптер интерфейса над общим движком команд
     (`AvenCommand`). Здесь нет своего разбора текста, своих правил и своей записи
     в состояние: текст уходит в движок, а движок вызывает те же общие действия,
     что и обычные формы разделов. Отдельной «демо-машины состояний» рядом
     больше нет — иначе получилось бы два разных помощника. */
  A._chat = null;
  A._commandSession = null;
  function commandEngine() { return window.AvenCommand || null; }
  function commandSession() {
    if (!A._commandSession && window.AvenCommandSession) {
      A._commandSession = window.AvenCommandSession.create({ source: 'assistant', surface: 'assistant' });
    }
    return A._commandSession;
  }
  A.pages.assistant = function () {
    /* Первый диалог собирается движком команд по вашим настоящим записям: показывать
       заранее написанные цифры, которых нет в данных, нельзя (ADR-010). Это те же
       вопросы, которые можно задать вручную, — второго источника ответов нет. */
    if (!A._chat) {
      const E = commandEngine();
      const answer = (q, fallback) => (E ? E.run(q, { source: 'assistant-intro', surface: 'assistant' }).response : fallback);
      A._chat = [
        { who: 'user', text: 'Сколько я потратил сегодня?' },
        { who: 'aven', text: answer('сколько я потратил сегодня', 'Помощник ещё загружается.') },
        { who: 'user', text: 'Что у меня завтра?' },
        { who: 'aven', text: answer('что у меня завтра', 'Помощник ещё загружается.') }
      ];
    }
    const assistantSuggestions = window.AvenSuggestions ? window.AvenSuggestions.getSuggestions({ surface: 'assistant', dateISO: window.AvenActions.dates.todayISO() }).slice(0, 2) : [];
    const E = commandEngine();
    const examples = E ? E.examples() : [];
    const notYet = E ? E.supported().notYet : [];
    const html = `
    <div class="assistant">
      <div class="a-inner">
        <div class="a-top"><button class="btn" data-action="assistant-exit">← Выйти из Assistant</button>${A.helpActions ? A.helpActions('commands', 'commands') : ''}</div>
        <div class="a-logo">
          <div class="char-wrap">${(window.AvenChar && !window.AvenChar.isOff() && window.AvenChar.current().id === 'female')
            ? `<img class="char-bust" src="assets/character/web/female-aven-transparent.png" alt="${A.esc(window.AvenChar.current().label)} — виртуальный помощник">`
            : (window.AvenChar ? window.AvenChar.avatar('s52') : '<div class="logo-mark mark">A</div>')}</div>
          <h1>${window.AvenChar && !window.AvenChar.isOff() ? A.esc(window.AvenChar.display()) : 'Aven'}</h1>
          ${window.AvenChar && !window.AvenChar.isOff() ? `<div class="char-name">${A.esc(window.AvenChar.current().label)} · персонаж-оформление</div>` : ''}
          <p>Напишите короткую команду или вопрос</p>
        </div>
        <div class="chat" id="chat" data-tour="command-chat" role="log" aria-live="polite" aria-label="Ответы Aven"></div>
        ${assistantSuggestions.length ? `<div class="assistant-suggestions" aria-label="Текущие предложения Aven">
          <div class="dc-label">Предложения по текущим данным</div>
          ${assistantSuggestions.map((item) => `<a class="btn small" href="${A.esc(((item.actions || []).filter((x) => x.href)[0] || {}).href || '#/home')}" title="Почему: ${A.esc(item.reason)}">✦ ${A.esc(item.title)}</a>`).join('')}
        </div>` : ''}
        <div class="sugg" data-tour="command-examples" aria-label="Примеры команд">
          <span class="dc-label">Примеры — нажмите, чтобы подставить в поле</span>
          ${examples.map((q) => `<button class="btn small" type="button" data-action="cmd-example" data-q="${A.esc(q)}">${A.esc(q)}</button>`).join('')}
        </div>
        <form class="a-input" id="cmd-form" data-tour="command-input" autocomplete="off">
          <button class="icon-btn" type="button" data-action="mic-stt" title="Голосовой ввод (экспериментально)" aria-label="Голосовой ввод (экспериментально)">🎤</button>
          <label class="sr-only" for="chat-input">Команда для Aven</label>
          <input type="text" id="chat-input" name="command" placeholder="Например: что у меня сегодня?" aria-describedby="cmd-hint">
          <button class="btn primary" type="button" data-action="chat-send" title="Отправить" aria-label="Отправить команду">→</button>
        </form>
        <div class="s" id="cmd-hint" data-tour="command-limits" style="color:var(--muted);font-size:.78rem;text-align:center;padding:8px 0 14px">
          Команды разбираются по понятным правилам на вашем устройстве: это не свободный разговор и не внешний AI.
          Всё, что создано командой, попадает в обычные разделы и в «Историю» — там же это можно отменить.
          Пока не умею: ${A.esc(notYet.join(' · '))}. Assistant не заменяет обычные страницы сайта.
        </div>
      </div>
    </div>`;
    return { html, mount: (root) => {
      renderChat();
      const form = root.querySelector('#cmd-form');
      if (form) form.addEventListener('submit', (e) => { e.preventDefault(); A.actions['chat-send'](); });
    } };
  };

  function renderChat() {
    const box = document.getElementById('chat');
    if (!box) return;
    const ava = window.AvenChar && !window.AvenChar.isOff() ? window.AvenChar.avatar('s24') : '';
    box.innerHTML = A._chat.map((m, i) => {
      if (m.who === 'user') return `<div class="msg user">${A.esc(m.text)}</div>`;
      let controls = '';
      if (m.flow && m.flow.status === 'clarification_required') {
        controls = `<div class="command-choices" role="group" aria-label="Выберите задачу">${(m.flow.candidates || []).map((c, n) =>
          `<button type="button" class="command-choice" data-action="command-choice" data-index="${n}"><b>${n + 1}. ${A.esc(c.title)}</b><span>${A.esc([c.dateISO ? window.AvenActions.dates.dateLabel(c.dateISO) : '', c.time ? window.AvenActions.format.time(c.time) : '', c.status === 'completed' ? 'Выполнена' : 'Открыта'].filter(Boolean).join(' · '))}</span></button>`).join('')}</div>`;
      } else if (m.flow && m.flow.status === 'confirmation_required') {
        controls = `<div class="command-confirm" role="group" aria-label="Подтверждение действия">
          <button type="button" class="btn primary" data-action="command-confirm">Подтвердить</button>
          <button type="button" class="btn" data-action="command-cancel">Отмена</button></div>`;
      }
      const body = `<div>${A.esc(m.text)}</div>${controls}
        <button class="speak" data-action="chat-speak" data-i="${i}">🔊 Озвучить</button>`;
      return `<div class="msg aven${controls ? ' command-flow' : ''}"><div class="msg-row">${ava ? `<span class="bubble-avatar">${ava}</span>` : ''}<div style="flex:1;min-width:0">${body}</div></div></div>`;
    }).join('') + (A._stt && A._stt.active ? `<div class="stt-status"><span class="rec"></span>Слушаю… (экспериментальный STT)</div>` : '');
    box.scrollTop = box.scrollHeight;
  }

  function pushAven(text, speak, flow) {
    /* Controls only belong to the newest pending response. Old buttons disappear,
       which also prevents a stale confirmation from looking active. */
    A._chat.forEach((m) => { if (m.flow) delete m.flow; });
    A._chat.push({ who: 'aven', text: text, flow: flow || null });
    A._lastReply = text; // для строки статуса на Главной
    renderChat();
    if (flow && (flow.status === 'clarification_required' || flow.status === 'confirmation_required')) {
      const first = document.querySelector('.command-flow button');
      if (first) first.focus();
    }
    if (speak && s().settings.voice.alwaysVoice) A.speak(text, null);
  }

  /* Единственный путь текстовой команды: движок разбирает текст, сам вызывает общие
     действия и возвращает структурированный результат; экран показывает только
     человеческий ответ. Структура остаётся в A._lastCommand для отладки и тестов. */
  A._assistantSend = function (text) {
    const t = (text || '').trim();
    if (!t) return;
    A._chat.push({ who: 'user', text: t });
    renderChat();
    const P = window.AvenPresence;
    if (P) P.set('thinking');
    setTimeout(() => {
      const E = commandEngine();
      if (!E) { pushAven('Помощник ещё загружается — попробуйте ещё раз через секунду.', false); if (P) P.set('idle'); return; }
      const session = commandSession();
      const out = session ? session.submit(t) : E.run(t, { source: 'assistant', surface: 'assistant' });
      A._lastCommand = out;
      pushAven(out.response, true, out);
      const changed = !!(out.result && out.result.ok && out.intent && out.intent.kind === 'mutation');
      if (P) { if (changed) P.flash('success', 2600); else P.set('idle'); }
    }, 300);
  };

  /* ---------- озвучивание: делегируем browser speechSynthesis (voice.js) ---------- */
  A.speak = function (text, btn) {
    return window.AvenVoice ? window.AvenVoice.speak(text, btn) : false;
  };

  function financeAccountForm(existing) {
    const ex = existing || { name: '', balance: 0 };
    A.openModal({
      title: existing ? 'Редактировать счёт' : 'Новый счёт',
      body: `
        <div class="field"><label>Название счёта</label><input type="text" name="name" value="${A.esc(ex.name || '')}" placeholder="Например: карта, наличные"></div>
        <div class="field"><label>Текущий баланс, ₽</label><input type="number" name="balance" value="${existing ? A.esc(ex.balance) : '0'}" step="0.01"></div>
        <div class="s" style="color:var(--muted);font-size:.8rem">Баланс счёта участвует в общем балансе. Это демо-справочник, не банковская интеграция.</div>`,
      onSubmit: (v) => {
        const res = existing
          ? Core().finance.updateAccount(existing.id, { name: v.name, balance: v.balance })
          : Core().finance.createAccount({ name: v.name, balance: v.balance });
        if (!res.ok) { A.toast(res.message || 'Не удалось сохранить счёт'); return; }
        A.closeModal(); A.render();
        A.toast(existing ? 'Счёт сохранён · общий баланс пересчитан' : 'Счёт добавлен · можно отменить в истории');
      }
    });
  }

  function financeCategoryForm() {
    A.openModal({
      title: 'Новая категория',
      body: `<div class="field"><label>Название категории</label><input type="text" name="name" placeholder="Например: Здоровье"></div>`,
      onSubmit: (v) => {
        const res = Core().finance.createCategory(v.name);
        if (!res.ok) { A.toast(res.message || 'Не удалось создать категорию'); return; }
        A.closeModal(); A.render(); A.toast('Категория добавлена · можно отменить в истории');
      }
    });
  }

  function financeForm(existing) {
    const cats = Core().finance.categories();
    const accounts = Core().finance.accounts();
    const ex = existing || { type: 'expense', cat: cats[0], account: (accounts[0] || {}).id || 'card', amount: '', dateISO: todayISO(), title: '', comment: '' };
    const exDate = opDateISO(ex) || todayISO();
    A.openModal({
      title: existing ? 'Редактировать операцию' : 'Новая операция',
      body: `
        <div class="field-row">
          <div class="field"><label>Тип</label><select name="type"><option value="expense" ${ex.type !== 'income' ? 'selected' : ''}>Расход</option><option value="income" ${ex.type === 'income' ? 'selected' : ''}>Доход</option></select></div>
          <div class="field"><label>Сумма, ₽</label><input type="number" name="amount" value="${existing ? A.esc(ex.amount) : ''}" placeholder="1000" step="0.01"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Категория</label><select name="cat">${cats.map((c) => `<option ${ex.cat === c ? 'selected' : ''}>${A.esc(c)}</option>`).join('')}</select></div>
          <div class="field"><label>Счёт</label><select name="account">${accounts.map((a) => `<option value="${A.esc(a.id)}" ${ex.account === a.id ? 'selected' : ''}>${A.esc(a.name)}</option>`).join('')}</select></div>
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(exDate)}"></div>
        </div>
        <div class="field"><label>Название</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="Например: магазин, зарплата, подписка"></div>
        <div class="field"><label>Комментарий</label><input type="text" name="comment" value="${A.esc(ex.comment || '')}" placeholder="необязательно"></div>`,
      onSubmit: (v) => {
        const payload = { type: v.type, cat: v.cat, account: v.account, title: v.title, amount: v.amount, dateISO: v.date, comment: v.comment };
        const res = existing ? Core().finance.updateOperation(existing.id, payload) : Core().finance.createOperation(payload);
        if (!res.ok) { A.toast(res.message || 'Не удалось сохранить операцию'); return; }
        A.closeModal(); A.render();
        A.toast(existing ? 'Операция сохранена · итоги и счёт пересчитаны · можно отменить'
          : 'Операция записана · итоги и счёт пересчитаны · можно отменить');
      }
    });
  }

  /* ================= действия ================= */
  A.register({
    'fin-add': () => financeForm(),
    'fin-edit': (el) => { const op = Core().finance.getOperation(el.dataset.id).entity; if (op) financeForm(op); else A.toast('Операция не найдена'); },
    'fin-filter-period': (el) => { finFilter.period = el.value; A.render(); },
    'fin-filter-type': (el) => { finFilter.type = el.value; A.render(); },
    'fin-filter-cat': (el) => { finFilter.cat = el.value; A.render(); },
    'fin-filter-account': (el) => { finFilter.account = el.value; A.render(); },
    'fin-account-add': () => financeAccountForm(),
    'fin-account-edit': (el) => {
      const acc = Core().finance.accounts().find((x) => x.id === el.dataset.id);
      if (acc) financeAccountForm(acc); else A.toast('Счёт не найден');
    },
    'fin-account-del': (el) => {
      const acc = Core().finance.account(el.dataset.id);
      if (!acc || !acc.id) { A.toast('Счёт не найден'); return; }
      A.confirmModal('Удалить счёт «' + acc.name + '»? Общий баланс изменится на ' + A.money(-acc.balance) + '. Отмена доступна через историю.', () => {
        const res = Core().finance.deleteAccount(acc.id);
        if (!res.ok) { A.toast(res.message || 'Не удалось удалить счёт'); return; }
        A.render(); A.toast('Счёт удалён · можно отменить');
      });
    },
    'fin-cat-add': () => financeCategoryForm(),
    'fin-cat-del': (el) => {
      const name = el.dataset.name;
      A.confirmModal('Удалить категорию «' + name + '»? Отмена доступна через историю.', () => {
        const res = Core().finance.deleteCategory(name);
        if (!res.ok) { A.toast(res.message || 'Не удалось удалить категорию'); return; }
        A.render(); A.toast('Категория удалена · можно отменить');
      });
    },

    /* удаление операции: подтверждение + пересчёт итогов + Undo (MVP_SCOPE §5.6, приёмка 4) */
    'fin-del': (el) => {
      const it = Core().finance.getOperation(el.dataset.id).entity;
      if (!it) { A.toast('Операция не найдена'); return; }
      A.confirmModal('Удалить операцию «' + it.title + '» на ' + A.money(it.amount) +
        '? Итоги месяца, общий баланс и баланс счёта пересчитаются. Отмена (Undo) останется в истории действий.', () => {
        const res = Core().finance.deleteOperation(el.dataset.id);
        if (!res.ok) { A.toast(res.message || 'Операция не найдена'); return; }
        A.render(); A.toast('Операция удалена, итоги и счёт пересчитаны — можно отменить');
      });
    },

    /* экспорт операций в CSV (MVP_SCOPE §5.6, приёмка 5). BOM — чтобы Excel корректно открыл UTF-8. */
    'fin-export-csv': () => {
      const st = S.s();
      const rows = [['Дата', 'Тип', 'Категория', 'Счёт', 'Название', 'Сумма', 'Сумма в минимальных единицах', 'Комментарий']];
      Core().finance.getOperations({}).items.forEach((o) => rows.push([opDateISO(o) || o.date, o.type === 'income' ? 'доход' : 'расход', o.cat,
        opAccount(st, o.account).name, o.title, (Core().money.minor(o.amount) / 100).toFixed(2), Core().money.minor(o.amount), o.comment || '']));
      const csv = '\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
      A.confirmModal('Выгрузить операции в CSV? Файл содержит данные о расходах и доходах — это приватные данные, поэтому выгрузка подтверждается (MVP_SCOPE §7).', () => {
        A.closeModal();
        if (!A.downloadFile('aven-finance-demo.csv', csv, 'text/csv;charset=utf-8')) return;
        A.toast('Операции выгружены в CSV: ' + (st.ops || []).length + ' строк');
        A.logAction({ action: 'data.export', title: 'Экспорт данных', object: 'Финансы · CSV (' + (st.ops || []).length + ' операций)',
          objectType: 'system', undoable: false, sensitive: true });
      });
    },

    'fuel-add': () => { location.hash = '#/auto'; setTimeout(() => autoFuelForm(), 80); },
    'quick-fuel': () => autoFuelForm(),
    'auto-expense': () => autoExpenseForm(),
    'auto-service': () => autoServiceForm(),
    'auto-doc': () => autoDocForm(),
    'auto-fuel-edit': (el) => {
      const item = Core().auto.getRecord('fuel', el.dataset.id).entity;
      if (item) autoFuelForm(item); else A.toast('Заправка не найдена');
    },
    'auto-expense-edit': (el) => {
      const item = Core().auto.getRecord('expense', el.dataset.id).entity;
      if (item) autoExpenseForm(item); else A.toast('Расход авто не найден');
    },
    'auto-service-edit': (el) => {
      const item = Core().auto.getRecord('service', el.dataset.id).entity;
      if (item) autoServiceForm(item); else A.toast('Обслуживание не найдено');
    },
    'auto-doc-edit': (el) => {
      const item = Core().auto.getRecord('doc', el.dataset.id).entity;
      if (item) autoDocForm(item); else A.toast('Документ не найден');
    },
    'auto-fin-link': (el) => {
      const kind = el.dataset.kind;
      const item = Core().auto.getRecord(kind, el.dataset.id).entity;
      if (!item) { A.toast('Запись авто не найдена'); return; }
      if (Core().auto.linkedOp(item)) { A.toast('Финансовая операция уже связана'); return; }
      if (!(autoCost(kind, item) > 0)) { A.toast('Для финансовой связи нужна сумма больше нуля'); return; }
      A.confirmModal('Создать связанную финансовую операцию для «' + autoTitle(kind, item) + '»? Баланс и счёт пересчитаются, Undo снимет связь и удалит расход.', () => {
        const res = Core().auto.linkFinance(kind, el.dataset.id);
        if (!res.ok) { A.toast(res.message || 'Не удалось создать расход'); return; }
        A.render(); A.toast('Финансовая операция создана · можно отменить');
      });
    },
    'auto-record-del': (el) => {
      const kind = el.dataset.kind;
      const item0 = Core().auto.getRecord(kind, el.dataset.id).entity;
      if (!item0) { A.toast('Запись авто не найдена'); return; }
      const linked0 = Core().auto.linkedOp(item0);
      A.confirmModal('Удалить «' + autoTitle(kind, item0) + '»? Это разрушающее действие' +
        (linked0 ? ': связанная финансовая операция тоже будет удалена и баланс пересчитается.' : ', его можно отменить через Undo.'), () => {
        const res = Core().auto.deleteRecord(kind, el.dataset.id);
        if (!res.ok) { A.toast(res.message || 'Запись авто не найдена'); return; }
        A.render(); A.toast('Запись авто удалена · можно отменить');
      });
    },
    'auto-export-csv': () => {
      const st = s();
      const rows = [['Раздел', 'Дата', 'Название', 'Пробег', 'Литры', 'Сумма', 'Финансовая операция', 'Комментарий']];
      (st.car.fuel || []).forEach((f) => rows.push(['Заправка', f.date || autoDateLabel(autoDateISO(f)), 'Заправка', f.km || '', f.liters || '', (A.minor(f.sum) / 100).toFixed(2), f.financeOpId || '', f.note || '']));
      (st.car.expenses || []).forEach((e) => rows.push(['Расход', e.date || autoDateLabel(autoDateISO(e)), e.title, '', '', (A.minor(e.amount) / 100).toFixed(2), e.financeOpId || '', e.comment || '']));
      (st.car.service || []).forEach((x) => rows.push(['Обслуживание', x.date || autoDateLabel(autoDateISO(x)), x.title, x.km || '', '', (A.minor(x.cost) / 100).toFixed(2), x.financeOpId || '', x.comment || '']));
      (st.car.docs || []).forEach((d) => rows.push(['Документ', d.until || (autoDocISO(d) ? autoDateLabel(autoDocISO(d)) : 'без срока'), d.title, '', '', '', '', 'напомнить за ' + (Number(d.remindDays) || 0) + ' дн.']));
      const csv = '\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
      A.confirmModal('Выгрузить данные автомобиля в CSV? Файл содержит пробег, документы и расходы — это приватные данные, поэтому выгрузка подтверждается.', () => {
        A.closeModal();
        if (!A.downloadFile('aven-auto-demo.csv', csv, 'text/csv;charset=utf-8')) return;
        A.toast('Авто выгружено в CSV: ' + (rows.length - 1) + ' строк');
        A.logAction({ action: 'data.export', title: 'Экспорт данных', object: 'Авто · CSV (' + (rows.length - 1) + ' строк)',
          objectType: 'system', undoable: false, sensitive: true });
      });
    },
    'auto-mileage': () => {
      A.openModal({
        title: 'Обновить пробег',
        body: `<div class="field"><label>Текущий пробег, км</label><input type="number" name="km" value="${Core().auto.car().mileage}"></div>`,
        onSubmit: (v) => {
          const res = Core().auto.setMileage(v.km);
          if (!res.ok) { A.toast(res.message || 'Не удалось обновить пробег'); return; }
          A.closeModal(); A.render(); A.toast('Пробег обновлён · можно отменить в истории');
        }
      });
    },

    'shop-add': () => purchaseForm(),
    'shop-edit': (el) => {
      const p = Core().shopping.getPurchase(el.dataset.id).entity;
      if (p) purchaseForm(p); else A.toast('Покупка не найдена');
    },
    'shop-service': (el) => {
      const p = Core().shopping.getPurchase(el.dataset.id).entity;
      if (p) purchaseServiceForm(p); else A.toast('Покупка не найдена');
    },
    'shop-filter-status': (el) => { shopFilter.status = el.value; A.render(); },
    'shop-filter-category': (el) => { shopFilter.category = el.value; A.render(); },
    'shop-filter-warranty': (el) => { shopFilter.warranty = el.value; A.render(); },
    'shop-status': (el) => {
      const p = Core().shopping.getPurchase(el.dataset.id).entity;
      if (!p) { A.toast('Покупка не найдена'); return; }
      const was = purchaseStatusKey(p);
      A.openModal({
        title: 'Изменить статус',
        body: `<div class="field"><label>Статус</label><select name="status">
          ${Object.keys(SHOP_STATUS).map((k) => `<option value="${k}" ${was === k ? 'selected' : ''}>${A.esc(SHOP_STATUS[k].label)}</option>`).join('')}
        </select></div>`,
        onSubmit: (v) => {
          const res = Core().shopping.setStatus(p.id, v.status);
          if (!res.ok) { A.toast(res.message || 'Не удалось изменить статус'); return; }
          A.closeModal(); A.render(); A.toast('Статус изменён · можно отменить');
        }
      });
    },
    'shop-fin-link': (el) => {
      const p = Core().shopping.getPurchase(el.dataset.id).entity;
      if (!p) { A.toast('Покупка не найдена'); return; }
      if (Core().shopping.linkedOp(p)) { A.toast('Расход уже связан с покупкой'); return; }
      if (!(Number(p.price) > 0)) { A.toast('Для связанного расхода нужна цена больше нуля'); return; }
      A.confirmModal('Создать связанную финансовую операцию для «' + p.name + '»? Сумма попадёт в расходы, баланс и счёт пересчитаются; Undo удалит созданный расход и снимет связь.', () => {
        const res = Core().shopping.linkFinance(p.id);
        if (!res.ok) { A.toast(res.message || 'Не удалось создать расход'); return; }
        A.closeModal(); A.render(); A.toast('Расход создан и связан с покупкой · можно отменить');
      });
    },
    'shop-del': (el) => {
      const p = Core().shopping.getPurchase(el.dataset.id).entity;
      if (!p) { A.toast('Покупка не найдена'); return; }
      A.confirmModal('Удалить покупку «' + p.name + '»? Это разрушающее действие: карточка и сервисные записи исчезнут, но их можно вернуть через Undo. Связанная финансовая операция не удаляется автоматически.', () => {
        const res = Core().shopping.deletePurchase(p.id);
        if (!res.ok) { A.toast(res.message || 'Покупка не найдена'); return; }
        A.closeModal(); A.render(); A.toast('Покупка удалена · можно отменить в истории');
      });
    },
    'shop-export-csv': () => {
      const st = s();
      const rows = [['Название', 'Категория', 'Статус', 'Цена', 'Дата покупки', 'Магазин', 'Гарантия до', 'Серийный номер', 'Ремонт/сервис', 'Связанный расход']];
      Core().shopping.getPurchases({ status: 'all' }).items.forEach((p) => rows.push([
        p.name, p.category || 'Другое', purchaseStatusLabel(p), (Core().money.minor(p.price) / 100).toFixed(2),
        p.date || purchaseDateLabel(purchaseDateISO(p)), p.store || '', p.warranty || purchaseDateLabel(purchaseWarrantyISO(p)),
        p.sn || '', (Core().money.minor(purchaseRepairTotal(p)) / 100).toFixed(2), p.financeOpId || ''
      ]));
      const csv = '\uFEFF' + rows.map((r) => r.map((c) => '"' + String(c == null ? '' : c).replace(/"/g, '""') + '"').join(';')).join('\r\n');
      A.confirmModal('Выгрузить покупки и имущество в CSV? Файл содержит серийные номера, магазины и стоимость — это приватные данные, поэтому выгрузка подтверждается.', () => {
        A.closeModal();
        if (!A.downloadFile('aven-purchases-demo.csv', csv, 'text/csv;charset=utf-8')) return;
        A.toast('Покупки выгружены в CSV: ' + (st.purchases || []).length + ' строк');
        A.logAction({ action: 'data.export', title: 'Экспорт данных', object: 'Покупки · CSV (' + (st.purchases || []).length + ' записей)',
          objectType: 'system', undoable: false, sensitive: true });
      });
    },
    'shop-open': (el) => {
      const p = Core().shopping.getPurchase(el.dataset.id).entity;
      if (!p) return;
      const w = Core().shopping.warrantyState(purchaseWarrantyISO(p));
      const repairs = purchaseRepairs(p);
      const linked = Core().shopping.linkedOp(p);
      A.openModal({
        title: p.name,
        wide: true,
        body: `
          <div class="grid cols-2">
            <div class="set-row"><div class="grow"><div class="t">${A.money(p.price || 0)}</div><div class="s">цена · куплено ${A.esc(p.date || purchaseDateLabel(purchaseDateISO(p)))}</div></div></div>
            <div class="set-row"><div class="grow"><div class="t"><span class="pill ${w.cls}">${A.esc(w.label)}</span></div><div class="s">гарантия</div></div></div>
            <div class="set-row"><div class="grow"><div class="t">${A.esc(p.category || 'Другое')}</div><div class="s">категория · ${A.esc(p.store || 'магазин не указан')}</div></div></div>
            <div class="set-row"><div class="grow"><div class="t">${A.esc(p.sn || '—')}</div><div class="s">серийный номер</div></div></div>
            <div class="set-row"><div class="grow"><div class="t">${purchaseStatusPill(p)}</div><div class="s">статус собственности</div></div></div>
            <div class="set-row"><div class="grow"><div class="t">${linked ? A.esc(linked.title) + ' · ' + A.money(linked.amount) : 'не связан'}</div><div class="s">финансовая операция</div></div></div>
          </div>
          <h4 style="margin:12px 0 8px">Сервис и ремонт</h4>
          ${repairs.length ? repairs.map((r) => `<div class="row-item"><div class="grow"><div class="t">${A.esc(r.title)}</div><div class="s">${A.esc(r.date || purchaseDateLabel(r.dateISO))} · ${A.esc(r.comment || 'без комментария')}</div></div><b class="num">${A.money(r.cost || 0)}</b></div>`).join('') : '<div class="empty">Записей обслуживания пока нет</div>'}
          <div class="tts-priv" style="margin-top:12px"><span>📝</span><div>${A.esc(p.note || 'Заметок нет')}</div></div>
          <div class="btn-row" style="margin-top:14px">
            <button class="btn" data-action="shop-edit" data-id="${p.id}">Редактировать</button>
            <button class="btn" data-action="shop-service" data-id="${p.id}">＋ Сервис</button>
            <button class="btn" data-action="shop-fin-link" data-id="${p.id}" ${linked ? 'disabled' : ''}>Создать расход</button>
            <button class="btn" data-action="shop-status" data-id="${p.id}">Статус</button>
            <button class="btn danger" data-action="shop-del" data-id="${p.id}">Удалить</button>
          </div>`,
        submitText: null, cancelText: 'Закрыть'
      });
    },

    'auto-toggle': (el) => {
      const a = s().automations.find((x) => x.id === el.dataset.id);
      if (!a) return;
      const was = a.enabled;
      a.enabled = el.checked;
      S.save();
      A.logAction({
        action: 'automation.update', title: a.enabled ? 'Автоматизация включена' : 'Автоматизация выключена',
        object: a.name, objectType: 'system', undoable: true,
        changes: [{ field: 'Состояние', from: was ? 'включена' : 'выключена', to: a.enabled ? 'включена' : 'выключена' }],
        undo: { type: 'fields', list: 'automations', id: a.id, fields: { enabled: was } }
      });
      A.render();
      A.toast(a.name + ': ' + (a.enabled ? 'включена (демо)' : 'выключена (демо)') + ' · раздел Stage 4');
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
          const it = { id: S.id('a'), name: v.name || 'Моя автоматизация', icon: '⚡', trigger: v.trigger, enabled: false, last: '—', next: '—' };
          st.automations.push(it);
          S.save();
          A.logAction({
            action: 'automation.create', title: 'Автоматизация создана (выключена)', object: it.name,
            objectType: 'system', undoable: true,
            changes: [{ field: 'Название', from: '—', to: it.name }, { field: 'Триггер', from: '—', to: it.trigger },
                      { field: 'Состояние', from: '—', to: 'выключена' }],
            undo: { type: 'remove', list: 'automations', id: it.id }
          });
          A.closeModal(); A.render(); A.toast('Автоматизация создана выключенной · раздел Stage 4, запись в истории есть');
        }
      });
    },
    'auto-tpl': (el) => A.toast('Шаблон «' + el.dataset.name + '» — демо. Состав решается отдельно (открытый вопрос №30).'),

    'mic-stt': () => {
      if (!window.AvenVoice || !window.AvenVoice.support.stt) {
        A.toast('Голосовой ввод недоступен в этом браузере — используйте текст (экспериментально)');
        return;
      }
      if (A._stt && A._stt.active) { A._stt.stop(); A._stt = null; renderChat(); return; }
      const inp = document.getElementById('chat-input');
      A._stt = window.AvenVoice.createRecognizer({
        onStart: () => { if (inp) inp.placeholder = 'Слушаю… (экспериментальный STT)'; if (window.AvenPresence) window.AvenPresence.set('listening'); renderChat(); },
        onInterim: (t) => { if (inp) inp.value = t; },
        onFinal: (t) => { if (inp) inp.value = t; if (s().settings.voice.stt && s().settings.voice.stt.autoSend) { A._assistantSend(t); inp.value = ''; } },
        onEnd: () => { A._stt = null; if (inp) inp.placeholder = 'Напишите команду… (демо)'; if (window.AvenPresence) window.AvenPresence.set('idle'); renderChat(); },
        onError: (err) => {
          A._stt = null;
          if (window.AvenPresence) window.AvenPresence.set('idle');
          if (inp) inp.placeholder = 'Напишите команду… (демо)';
          const map = { 'not-allowed': 'Нет доступа к микрофону', 'no-speech': 'Речь не распознана', 'audio-capture': 'Микрофон не найден' };
          A.toast((map[err] || 'Ошибка распознавания') + ' (экспериментально)');
          renderChat();
        }
      });
      if (A._stt) A._stt.start();
    },

    'command-choice': (el) => {
      const session = commandSession();
      if (!session) return;
      const out = session.choose(Number(el.dataset.index));
      A._lastCommand = out; pushAven(out.response, true, out);
      if (window.AvenPresence) window.AvenPresence.set(out.ok ? 'success' : 'idle');
      const inp = document.getElementById('chat-input'); if (inp) inp.focus();
    },
    'command-confirm': () => {
      const session = commandSession();
      if (!session) return;
      const out = session.confirm();
      A._lastCommand = out; pushAven(out.response, true, out);
      if (window.AvenPresence) window.AvenPresence.set(out.ok ? 'success' : 'idle');
      const inp = document.getElementById('chat-input'); if (inp) inp.focus();
    },
    'command-cancel': () => {
      const session = commandSession();
      if (!session) return;
      const out = session.cancel();
      A._lastCommand = out; pushAven(out.response, false, out);
      if (window.AvenPresence) window.AvenPresence.set('idle');
      const inp = document.getElementById('chat-input'); if (inp) inp.focus();
    },
    'chat-send': () => {
      const inp = document.getElementById('chat-input');
      if (inp && inp.value.trim()) { A._assistantSend(inp.value); inp.value = ''; }
      else A.toast('Напишите команду — например: «Что у меня сегодня?»');
    },
    /* Пример не выполняется сразу: он подставляется в поле, чтобы человек видел,
       что именно будет отправлено, и мог поправить текст. */
    'cmd-example': (el) => {
      const inp = document.getElementById('chat-input');
      if (inp && el.dataset.q) { inp.value = el.dataset.q; inp.focus(); }
    },
    'chat-speak': (el) => {
      const m = A._chat[+el.dataset.i];
      if (m) A.speak(m.text, el);
    },
    'assistant-exit': () => {
      if (A._commandSession) A._commandSession.reset();
      location.hash = '#/home';
    }
  });

  // Enter отправляет текст один раз; Escape отменяет только незавершённый flow.
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && A._commandSession && A._commandSession.pending() && document.body.classList.contains('assistant-mode')) {
      e.preventDefault();
      const out = A._commandSession.cancel();
      A._lastCommand = out; pushAven(out.response, false, out);
      const inp = document.getElementById('chat-input'); if (inp) inp.focus();
      return;
    }
    if (e.key === 'Enter' && e.target && e.target.id === 'chat-input') {
      e.preventDefault(); // иначе форма отправится ещё раз и команда уйдёт дважды
      window.Aven.actions['chat-send']();
    }
  });
})();
