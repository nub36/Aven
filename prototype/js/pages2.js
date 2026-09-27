/* Aven — Visual Prototype. Страницы: Финансы, Авто, Покупки, Автоматизации, Assistant. Не production. */
(function () {
  const A = window.Aven, S = window.AvenState;
  A.pages = A.pages || {};
  const s = () => S.s();

  /* ---------- финансы: даты, фильтры, пересчёт итогов ---------- */
  const pad = (n) => String(n).padStart(2, '0');
  function todayISO(offset) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function humanDate(iso) {
    if (!iso) return '—';
    const p = String(iso).split('-').map(Number);
    if (!p[0] || !p[1] || !p[2]) return iso;
    return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(p[0], p[1] - 1, p[2], 12));
  }
  function opDateISO(o) { return o.dateISO || (o.date === 'сегодня' ? todayISO() : o.date === 'вчера' ? todayISO(-1) : ''); }
  function opAccount(st, id) { return (st.finAccounts || []).find((a) => a.id === id) || (st.finAccounts || [])[0] || { id: 'card', name: 'Основная карта', balance: 0 }; }
  function accountPath(st, id) {
    const i = (st.finAccounts || []).findIndex((a) => a.id === id);
    return i >= 0 ? 'finAccounts.' + i + '.balance' : null;
  }
  function finEffect(op) {
    const amt = Number(op && op.amount) || 0;
    return op && op.type === 'income'
      ? { expense: 0, income: amt, balance: amt, account: amt }
      : { expense: amt, income: 0, balance: -amt, account: -amt };
  }
  function finAdjustPayload(st, fromOp, toOp) {
    const a = finEffect(fromOp || {}), b = finEffect(toOp || {});
    const out = [
      { path: 'finMonth.expense', delta: A.sumMoney(b.expense, -a.expense) },
      { path: 'finMonth.income', delta: A.sumMoney(b.income, -a.income) },
      { path: 'finMonth.balance', delta: A.sumMoney(b.balance, -a.balance) }
    ].filter((x) => A.minor(x.delta) !== 0);
    const acc = {};
    if (fromOp && fromOp.account) acc[fromOp.account] = A.sumMoney(acc[fromOp.account] || 0, -a.account);
    if (toOp && toOp.account) acc[toOp.account] = A.sumMoney(acc[toOp.account] || 0, b.account);
    Object.keys(acc).forEach((id) => {
      const path = accountPath(st, id);
      if (path && A.minor(acc[id]) !== 0) out.push({ path, delta: acc[id] });
    });
    return out;
  }
  function applyFinAdjust(st, adjust) {
    (adjust || []).forEach((x) => {
      const parts = x.path.split('.');
      const key = parts.pop();
      let o = st;
      parts.forEach((p) => { if (o) o = o[p]; });
      if (o && typeof o[key] === 'number') o[key] = A.sumMoney(o[key], x.delta);
    });
  }
  function opSnapshot(o) {
    return { type: o.type, cat: o.cat, account: o.account || 'card', title: o.title, amount: o.amount, date: o.date, dateISO: opDateISO(o), comment: o.comment || '' };
  }
  function opPeriodMatch(iso, period) {
    if (period === 'all') return true;
    const today = todayISO();
    if (period === 'today') return iso === today;
    if (period === 'week') {
      const d = new Date(iso || today), t = new Date(today);
      return (t - d) / 86400000 <= 7 && (t - d) / 86400000 >= 0;
    }
    if (period === 'month') return String(iso || '').slice(0, 7) === today.slice(0, 7);
    return true;
  }
  let finFilter = { type: 'all', cat: 'all', account: 'all', period: 'month', q: '' };

  /* ================= ФИНАНСЫ ================= */
  A.pages.finance = function () {
    const st = s();
    const cats = st.finCategories || ['Авто', 'Продукты', 'Дом', 'Подписки', 'Другое', 'Доход'];
    const accounts = st.finAccounts || [];
    const q = finFilter.q.trim().toLowerCase();
    let ops = (st.ops || []).slice().filter((o) => {
      const iso = opDateISO(o);
      if (finFilter.type !== 'all' && o.type !== finFilter.type) return false;
      if (finFilter.cat !== 'all' && o.cat !== finFilter.cat) return false;
      if (finFilter.account !== 'all' && (o.account || 'card') !== finFilter.account) return false;
      if (!opPeriodMatch(iso, finFilter.period)) return false;
      if (!q) return true;
      return [o.title, o.comment, o.cat, opAccount(st, o.account).name].join(' ').toLowerCase().includes(q);
    });
    ops.sort((a, b) => (opDateISO(b) || '').localeCompare(opDateISO(a) || '') || String(b.id).localeCompare(String(a.id)));
    const totals = ops.reduce((acc, o) => {
      if (o.type === 'income') acc.income = A.sumMoney(acc.income, o.amount);
      else acc.expense = A.sumMoney(acc.expense, o.amount);
      return acc;
    }, { expense: 0, income: 0 });
    totals.net = A.sumMoney(totals.income, -totals.expense);
    const catTotals = cats.map((c) => ({ name: c, v: ops.filter((o) => o.type === 'expense' && o.cat === c).reduce((sum, o) => A.sumMoney(sum, o.amount), 0) }))
      .filter((c) => c.v > 0);
    const catMax = Math.max(1, ...catTotals.map((x) => x.v));
    const catUse = {};
    const accUse = {};
    (st.ops || []).forEach((o) => { catUse[o.cat] = (catUse[o.cat] || 0) + 1; accUse[o.account || 'card'] = (accUse[o.account || 'card'] || 0) + 1; });
    const maxV = Math.max.apply(null, st.finChart.map((x) => x.v));
    const html = `
    <div class="page-head">
      <div><h1>Финансы</h1><div class="sub">Операции · фильтры · счета · редактирование · демо · MVP_SCOPE §5.6</div></div>
      <div class="btn-row">
        <button class="btn" data-action="fin-export-csv" title="Выгрузить операции в CSV (MVP_SCOPE §5.6, приёмка 5)">Экспорт CSV</button>
        <button class="btn primary" data-action="fin-add">＋ Операция</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card stat"><div class="l">Баланс всего</div><div class="v ${st.finMonth.balance < 0 ? 'neg' : ''}">${A.money(st.finMonth.balance)}</div>
        <div class="d">${st.finMonth.balance < 0 ? '<span class="pill warn">отрицательный баланс — показан, не запрещён (§5.6)</span>' : 'пересчитывается при операциях'}</div></div>
      <div class="card stat"><div class="l">Расходы месяца</div><div class="v neg">${A.money(st.finMonth.expense)}</div><div class="d">целые копейки</div></div>
      <div class="card stat"><div class="l">Доходы месяца</div><div class="v pos">${A.money(st.finMonth.income)}</div><div class="d">целые копейки</div></div>
      <div class="card stat"><div class="l">По фильтру</div><div class="v ${totals.net < 0 ? 'neg' : 'pos'}">${A.money(totals.net)}</div><div class="d">доходы ${A.money(totals.income)} · расходы ${A.money(totals.expense)}</div></div>
    </div>

    <div class="card fin-filters">
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
        <div class="bars">
          ${st.finChart.map((x) => `
          <div class="bar-wrap" title="${x.m}: ${A.money(x.v)}">
            <div class="bv">${Math.round(x.v / 1000)}к</div>
            <div class="bar" style="height:${Math.max(8, Math.round(x.v / maxV * 100))}%"></div>
            <div class="bl">${x.m}</div>
          </div>`).join('')}
        </div>
        <h3 style="margin-top:20px">Категории по фильтру</h3>
        ${catTotals.length ? catTotals.map((c) => `
        <div class="cat-row">
          <div class="cat-top"><span>${A.esc(c.name)}</span><b>${A.money(c.v)}</b></div>
          <div class="cat-bar"><div style="width:${Math.round(c.v / catMax * 100)}%"></div></div>
        </div>`).join('') : '<div class="empty">Нет расходов по текущему фильтру</div>'}
        <div class="head" style="margin-top:20px"><h3>Счета</h3><button class="btn small" data-action="fin-account-add">＋ Счёт</button></div>
        ${accounts.map((a) => `<div class="row-item"><div class="grow"><div class="t">${A.esc(a.name)}</div><div class="s">id: ${A.esc(a.id)} · операций: ${accUse[a.id] || 0}</div></div><b class="num ${a.balance < 0 ? 'neg' : ''}">${A.money(a.balance)}</b><span class="btn-row"><button class="btn small" data-action="fin-account-edit" data-id="${A.esc(a.id)}">Ред.</button><button class="btn small" data-action="fin-account-del" data-id="${A.esc(a.id)}">Удалить</button></span></div>`).join('')}
        <div class="head" style="margin-top:20px"><h3>Категории</h3><button class="btn small" data-action="fin-cat-add">＋ Категория</button></div>
        ${cats.map((c) => `<div class="row-item"><div class="grow"><div class="t">${A.esc(c)}</div><div class="s">операций: ${catUse[c] || 0}${catUse[c] ? ' · удалить нельзя, пока используется' : ''}</div></div><button class="btn small" data-action="fin-cat-del" data-name="${A.esc(c)}">Удалить</button></div>`).join('')}
      </div>
      <div class="card">
        <h3>Операции <span class="pill">${ops.length}</span></h3>
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
          в минимальных единицах валюты, поэтому <code>0.1 + 0.2 = ${A.money(A.sumMoney(0.1, 0.2))}</code>
          (в копейках <code>${A.minor(0.1)} + ${A.minor(0.2)} = ${A.minor(0.1) + A.minor(0.2)}</code>), а не
          <code>${0.1 + 0.2}</code>, как получилось бы при сложении float. Итоги месяца, баланс и баланс счёта
          пересчитываются при добавлении, редактировании и удалении операции; удаление требует подтверждения и отменяется
          через Undo (§5.6, приёмка 4).</div>
        </div>
      </div>
    </div>`;
    return { html, mount: (root) => { const inp = root.querySelector('#fin-q'); if (inp) inp.addEventListener('input', () => { finFilter.q = inp.value; A.render(); }); } };
  };

  /* ================= АВТО ================= */
  const AUTO_LABEL = { fuel: 'Заправка', expense: 'Расход авто', service: 'Обслуживание', doc: 'Документ' };
  let autoTab = 'overview';

  function autoList(st, kind) {
    const car = st.car || {};
    if (kind === 'fuel') return car.fuel || (car.fuel = []);
    if (kind === 'expense') return car.expenses || (car.expenses = []);
    if (kind === 'service') return car.service || (car.service = []);
    if (kind === 'doc') return car.docs || (car.docs = []);
    return [];
  }
  function autoListPath(kind) {
    return kind === 'fuel' ? 'car.fuel' : kind === 'expense' ? 'car.expenses' : kind === 'service' ? 'car.service' : 'car.docs';
  }
  function autoDateISO(item) { return (item && (item.dateISO || isoFromHumanDate(item.date))) || todayISO(); }
  function autoDocISO(item) { return (item && (item.untilISO || isoFromHumanDate(item.until))) || ''; }
  function autoDateLabel(iso) { return iso ? humanDate(iso) : '—'; }
  function autoCost(kind, item) {
    if (!item) return 0;
    if (kind === 'fuel') return Number(item.sum) || 0;
    if (kind === 'expense') return Number(item.amount) || 0;
    if (kind === 'service') return Number(item.cost) || 0;
    return 0;
  }
  function autoTitle(kind, item) {
    if (kind === 'fuel') return 'Заправка ' + (Number(item.liters) || 0) + ' л';
    return (item && item.title) || AUTO_LABEL[kind] || 'Авто';
  }
  function autoLinkedOp(st, item) {
    return item && item.financeOpId ? (st.ops || []).find((o) => o.id === item.financeOpId) : null;
  }
  function autoFinanceOp(st, kind, item) {
    const account = ((st.finAccounts || [])[0] || {}).id || 'card';
    const iso = kind === 'doc' ? todayISO() : autoDateISO(item);
    const title = kind === 'fuel' ? autoTitle(kind, item) : 'Авто: ' + autoTitle(kind, item);
    return {
      id: S.id('o'), type: 'expense', cat: (st.finCategories || []).indexOf('Авто') >= 0 ? 'Авто' : ((st.finCategories || [])[0] || 'Другое'),
      account, title, amount: autoCost(kind, item), date: autoDateLabel(iso), dateISO: iso,
      comment: 'Связано с авто: ' + ((st.car || {}).model || 'автомобиль') + ' · ' + AUTO_LABEL[kind],
      carKind: kind, carItemId: item.id
    };
  }
  function autoCreateFinance(st, kind, item) {
    const op = autoFinanceOp(st, kind, item);
    if (!(op.amount > 0)) return null;
    st.ops.unshift(op);
    item.financeOpId = op.id;
    const adjust = finAdjustPayload(st, null, op);
    applyFinAdjust(st, adjust);
    return { op, adjust };
  }
  function autoUpdateLinkedFinance(st, kind, item) {
    const op = autoLinkedOp(st, item);
    if (!op) return null;
    const prev = Object.assign({}, op);
    const iso = autoDateISO(item);
    const next = Object.assign({}, prev, {
      title: kind === 'fuel' ? autoTitle(kind, item) : 'Авто: ' + autoTitle(kind, item),
      amount: autoCost(kind, item), dateISO: iso, date: autoDateLabel(iso),
      comment: 'Связано с авто: ' + ((st.car || {}).model || 'автомобиль') + ' · ' + AUTO_LABEL[kind]
    });
    Object.assign(op, next);
    const adjust = finAdjustPayload(st, prev, next);
    applyFinAdjust(st, adjust);
    return { op, prev, next, adjust };
  }
  function autoSnapshot(kind, item) {
    if (kind === 'fuel') return { liters: Number(item.liters) || 0, sum: Number(item.sum) || 0, km: Number(item.km) || 0,
      date: item.date || autoDateLabel(autoDateISO(item)), dateISO: autoDateISO(item), note: item.note || '', financeOpId: item.financeOpId || '' };
    if (kind === 'expense') return { title: item.title || '', amount: Number(item.amount) || 0, category: item.category || 'Другое',
      date: item.date || autoDateLabel(autoDateISO(item)), dateISO: autoDateISO(item), comment: item.comment || '', financeOpId: item.financeOpId || '' };
    if (kind === 'service') return { title: item.title || '', cost: Number(item.cost) || 0, km: Number(item.km) || 0,
      date: item.date || autoDateLabel(autoDateISO(item)), dateISO: autoDateISO(item), comment: item.comment || '', financeOpId: item.financeOpId || '' };
    return { title: item.title || '', until: item.until || (autoDocISO(item) ? autoDateLabel(autoDocISO(item)) : 'без срока'),
      untilISO: autoDocISO(item), remindDays: Number(item.remindDays) || 0 };
  }
  function autoChanges(kind, prev, next) {
    const spec = kind === 'fuel'
      ? { liters: ['Литры', (v) => (Number(v) || 0) + ' л'], sum: ['Сумма', A.money], km: ['Пробег', (v) => (Number(v) || 0).toLocaleString('ru-RU') + ' км'], dateISO: ['Дата', autoDateLabel], note: ['Комментарий', (v) => v || '—'] }
      : kind === 'expense'
        ? { title: ['Что', (v) => v || '—'], amount: ['Сумма', A.money], category: ['Категория', (v) => v || '—'], dateISO: ['Дата', autoDateLabel], comment: ['Комментарий', (v) => v || '—'] }
        : kind === 'service'
          ? { title: ['Работа', (v) => v || '—'], cost: ['Стоимость', A.money], km: ['Пробег', (v) => (Number(v) || 0).toLocaleString('ru-RU') + ' км'], dateISO: ['Дата', autoDateLabel], comment: ['Комментарий', (v) => v || '—'] }
          : { title: ['Документ', (v) => v || '—'], untilISO: ['Срок', (v) => v ? autoDateLabel(v) : 'без срока'], remindDays: ['Напомнить за', (v) => (Number(v) || 0) + ' дн.'] };
    return Object.keys(spec).reduce((out, k) => {
      const a = prev[k] == null ? '' : prev[k], b = next[k] == null ? '' : next[k];
      const money = k === 'sum' || k === 'amount' || k === 'cost';
      if (money ? A.minor(a) !== A.minor(b) : String(a) !== String(b)) {
        out.push({ field: spec[k][0], from: spec[k][1](a), to: spec[k][1](b) });
      }
      return out;
    }, []);
  }
  function autoFuelStats(car) {
    const fuel = (car.fuel || []).slice().sort((a, b) => (Number(a.km) || 0) - (Number(b.km) || 0));
    const liters = fuel.reduce((sum, f) => sum + (Number(f.liters) || 0), 0);
    const money = fuel.reduce((sum, f) => A.sumMoney(sum, f.sum || 0), 0);
    const firstKm = fuel.length ? Number(fuel[0].km) || 0 : 0;
    const lastKm = fuel.length ? Number(fuel[fuel.length - 1].km) || 0 : firstKm;
    const distance = Math.max(0, lastKm - firstKm);
    const consumption = distance > 0 ? (liters / distance * 100).toFixed(1) + ' л / 100 км' : 'недостаточно данных';
    return { liters, money, avgPrice: liters > 0 ? money / liters : 0, distance, consumption };
  }
  function autoDocsAttention(car) {
    return (car.docs || []).filter((d) => {
      const iso = autoDocISO(d); if (!iso) return false;
      const days = Math.ceil((new Date(iso) - new Date(todayISO())) / 86400000);
      return days <= (Number(d.remindDays) || 30);
    }).length;
  }
  function autoRowActions(kind, item) {
    const linked = !!item.financeOpId;
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
    const fuelStats = autoFuelStats(car);
    const expenseTotal = (car.expenses || []).reduce((sum, e) => A.sumMoney(sum, e.amount || 0), 0);
    const serviceTotal = (car.service || []).reduce((sum, e) => A.sumMoney(sum, e.cost || 0), 0);
    const totalCost = A.sumMoney(fuelStats.money, expenseTotal, serviceTotal);
    const lastService = (car.service || []).slice().sort((a, b) => (Number(b.km) || 0) - (Number(a.km) || 0))[0];
    const nextLeft = lastService ? ((Number(lastService.km) || 0) + (Number(car.serviceIntervalKm) || 10000) - (Number(car.mileage) || 0)) : null;
    let tab = '';
    if (autoTab === 'overview') {
      const lastFuel = (car.fuel || [])[0];
      tab = `
      <div class="grid cols-4">
        <div class="card stat"><div class="l">Средний расход</div><div class="v" style="font-size:1.2rem">${A.esc(fuelStats.consumption)}</div><div class="d">по заправкам и пробегу</div></div>
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
          <h3>Финансовая связь</h3>
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
          const w = iso ? A.warrantyStatus(autoDateLabel(iso)) : { cls: '', label: 'без срока' };
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
      <div class="btn-row">
        <button class="btn" data-action="auto-export-csv">Экспорт CSV</button>
        <button class="btn" data-action="fuel-add">＋ Заправка</button>
        <button class="btn" data-action="auto-expense">＋ Расход</button>
        <button class="btn" data-action="auto-service">＋ Обслуживание</button>
        <button class="btn" data-action="auto-doc">＋ Документ</button>
        <button class="btn" data-action="auto-mileage">Пробег</button>
      </div>
    </div>
    <div class="card" style="margin-bottom:16px">
      <div class="car-head">
        <div class="car-emoji">🚗</div>
        <div>
          <div style="font-size:1.25rem;font-weight:700">${A.esc(car.model)} <span class="pill accent" style="margin-left:6px">основной автомобиль</span></div>
          <div style="color:var(--muted);margin-top:3px">${car.year} год · ${A.esc(car.fuelType || 'топливо')} · документов к вниманию: ${autoDocsAttention(car)}</div>
        </div>
        <div style="margin-left:auto;text-align:right">
          <div class="l" style="color:var(--muted);font-size:.84rem">Пробег</div>
          <div class="mileage">${(car.mileage || 0).toLocaleString('ru-RU')} км</div>
        </div>
      </div>
    </div>
    <div class="tabs" id="auto-tabs">
      ${tabs.map(([id, label]) => `<button class="tab ${autoTab === id ? 'active' : ''}" data-tab="${id}">${label}</button>`).join('')}
    </div>
    ${tab}`;
    return { html, mount: (root) => { A.bindTabs(root.querySelector('#auto-tabs'), (v) => { autoTab = v; A.render(); }); } };
  };

  function autoFuelForm(existing) {
    const ex = existing ? autoSnapshot('fuel', existing) : { liters: '', sum: '', km: (s().car || {}).mileage || 0, dateISO: todayISO(), note: '', financeOpId: '' };
    A.openModal({
      title: existing ? 'Редактировать заправку' : 'Новая заправка',
      body: `
        <div class="field-row">
          <div class="field"><label>Литры</label><input type="number" name="liters" value="${A.esc(ex.liters)}" step="0.01" placeholder="42"></div>
          <div class="field"><label>Сумма, ₽</label><input type="number" name="sum" value="${existing ? A.esc(ex.sum) : ''}" step="0.01" placeholder="3200"></div>
        </div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(ex.dateISO || todayISO())}"></div>
          <div class="field"><label>Пробег, км</label><input type="number" name="km" value="${A.esc(ex.km || (s().car || {}).mileage || 0)}"></div>
        </div>
        <div class="field"><label>Комментарий / АЗС</label><input type="text" name="note" value="${A.esc(ex.note || '')}" placeholder="Лукойл, полный бак…"></div>
        ${existing ? `<div class="tts-priv"><span>💰</span><div>${ex.financeOpId ? 'Связанная финансовая операция будет обновлена вместе с заправкой.' : 'Заправка пока не связана с финансами — используйте кнопку «В финансы» в таблице.'}</div></div>` : `<label class="set-row"><input type="checkbox" name="makeExpense" checked> <div class="grow"><div class="t">Создать связанный расход в финансах</div><div class="s">Сумма попадёт в категорию «Авто», баланс счёта пересчитается; Undo откатит обе записи.</div></div></label>`}`,
      onSubmit: (v) => {
        const st = S.s();
        const liters = Math.round((Number(v.liters) || 0) * 100) / 100;
        const sum = A.minor(v.sum) / 100;
        const km = Math.round(Number(v.km) || ((st.car || {}).mileage || 0));
        if (!(liters > 0)) { A.toast('Введите литры больше нуля'); return; }
        if (!(sum >= 0)) { A.toast('Введите сумму'); return; }
        const fields = { liters, sum, km, dateISO: v.date || todayISO(), date: autoDateLabel(v.date || todayISO()), note: (v.note || '').trim() };
        if (existing) {
          const prev = autoSnapshot('fuel', existing);
          Object.assign(existing, fields);
          const link = autoUpdateLinkedFinance(st, 'fuel', existing);
          S.save();
          const changes = autoChanges('fuel', prev, autoSnapshot('fuel', existing));
          if (link) changes.push({ field: 'Связанный расход', from: link.prev.title + ' · ' + A.money(link.prev.amount), to: link.next.title + ' · ' + A.money(link.next.amount) });
          A.logAction({
            action: 'car.fuel.update', title: 'Заправка изменена', object: liters + ' л · ' + A.money(sum), objectType: 'car', undoable: true,
            changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: link ? { type: 'batch', steps: [
              { type: 'fields', list: 'car.fuel', id: existing.id, fields: prev },
              { type: 'fields', list: 'ops', id: link.op.id, fields: link.prev }
            ], adjust: finAdjustPayload(st, link.next, link.prev) } : { type: 'fields', list: 'car.fuel', id: existing.id, fields: prev }
          });
          A.closeModal(); A.render(); A.toast('Заправка сохранена · можно отменить');
        } else {
          const wasMileage = st.car.mileage;
          const f = Object.assign({ id: S.id('f'), financeOpId: '' }, fields);
          st.car.fuel.unshift(f);
          if (km > st.car.mileage) st.car.mileage = km;
          const link = v.makeExpense ? autoCreateFinance(st, 'fuel', f) : null;
          S.save();
          const steps = [{ type: 'remove', list: 'car.fuel', id: f.id }];
          if (link) steps.push({ type: 'remove', list: 'ops', id: link.op.id });
          if (st.car.mileage !== wasMileage) steps.push({ type: 'value', path: 'car.mileage', value: wasMileage });
          A.logAction({
            action: 'car.fuel.create', title: 'Заправка добавлена', object: f.liters + ' л · ' + A.money(f.sum),
            objectType: 'car', undoable: true,
            changes: [{ field: 'Литры', from: '—', to: f.liters + ' л' }, { field: 'Сумма', from: '—', to: A.money(f.sum) },
                      { field: 'Пробег', from: '—', to: f.km + ' км' }, { field: 'Связанный расход', from: '—', to: link ? 'создан' : 'не создан' }],
            undo: steps.length > 1 ? { type: 'batch', steps, adjust: link ? finAdjustPayload(st, link.op, null) : [] } : steps[0]
          });
          A.closeModal(); A.render(); A.toast(link ? 'Заправка и расход добавлены · можно отменить' : 'Заправка добавлена · можно отменить');
        }
      }
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
      onSubmit: (v) => {
        const st = S.s();
        const amount = A.minor(v.amount) / 100;
        if (!(amount > 0)) { A.toast('Введите сумму больше нуля'); return; }
        const fields = { title: (v.title || '').trim() || 'Расход', amount, category: v.category || 'Другое',
          dateISO: v.date || todayISO(), date: autoDateLabel(v.date || todayISO()), comment: (v.comment || '').trim() };
        if (existing) {
          const prev = autoSnapshot('expense', existing);
          Object.assign(existing, fields);
          const link = autoUpdateLinkedFinance(st, 'expense', existing);
          S.save();
          const changes = autoChanges('expense', prev, autoSnapshot('expense', existing));
          if (link) changes.push({ field: 'Связанный расход', from: link.prev.title + ' · ' + A.money(link.prev.amount), to: link.next.title + ' · ' + A.money(link.next.amount) });
          A.logAction({ action: 'car.expense.update', title: 'Расход авто изменён', object: existing.title + ' · ' + A.money(existing.amount),
            objectType: 'car', undoable: true, changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: link ? { type: 'batch', steps: [
              { type: 'fields', list: 'car.expenses', id: existing.id, fields: prev },
              { type: 'fields', list: 'ops', id: link.op.id, fields: link.prev }
            ], adjust: finAdjustPayload(st, link.next, link.prev) } : { type: 'fields', list: 'car.expenses', id: existing.id, fields: prev } });
          A.closeModal(); A.render(); A.toast('Расход авто сохранён · можно отменить');
        } else {
          const it = Object.assign({ id: S.id('ce'), financeOpId: '' }, fields);
          st.car.expenses.unshift(it);
          const link = v.makeExpense ? autoCreateFinance(st, 'expense', it) : null;
          S.save();
          A.logAction({ action: 'car.expense.create', title: 'Расход по авто добавлен', object: it.title + ' · ' + A.money(it.amount),
            objectType: 'car', undoable: true,
            changes: [{ field: 'Что', from: '—', to: it.title }, { field: 'Сумма', from: '—', to: A.money(it.amount) }, { field: 'Связанный расход', from: '—', to: link ? 'создан' : 'не создан' }],
            undo: link ? { type: 'batch', steps: [
              { type: 'remove', list: 'car.expenses', id: it.id }, { type: 'remove', list: 'ops', id: link.op.id }
            ], adjust: finAdjustPayload(st, link.op, null) } : { type: 'remove', list: 'car.expenses', id: it.id } });
          A.closeModal(); A.render(); A.toast(link ? 'Расход авто и финоперация добавлены · можно отменить' : 'Расход по авто добавлен · можно отменить');
        }
      }
    });
  }

  function autoServiceForm(existing) {
    const ex = existing ? autoSnapshot('service', existing) : { title: '', cost: '', km: (s().car || {}).mileage || 0, dateISO: todayISO(), comment: '', financeOpId: '' };
    A.openModal({
      title: existing ? 'Редактировать обслуживание' : 'Обслуживание',
      body: `
        <div class="field"><label>Работа</label><input type="text" name="title" value="${A.esc(ex.title || '')}" placeholder="Замена масла…"></div>
        <div class="field-row">
          <div class="field"><label>Дата</label><input type="date" name="date" value="${A.esc(ex.dateISO || todayISO())}"></div>
          <div class="field"><label>Стоимость, ₽</label><input type="number" name="cost" value="${existing ? A.esc(ex.cost) : ''}" step="0.01"></div>
        </div>
        <div class="field"><label>Пробег, км</label><input type="number" name="km" value="${A.esc(ex.km || (s().car || {}).mileage || 0)}"></div>
        <div class="field"><label>Комментарий</label><input type="text" name="comment" value="${A.esc(ex.comment || '')}"></div>
        ${existing ? `<div class="tts-priv"><span>💰</span><div>${ex.financeOpId ? 'Связанная финансовая операция будет обновлена.' : 'Можно связать с финансами отдельной кнопкой.'}</div></div>` : `<label class="set-row"><input type="checkbox" name="makeExpense" checked> <div class="grow"><div class="t">Создать связанный расход в финансах</div><div class="s">Стоимость ТО попадёт в финансы; Undo откатит обе записи.</div></div></label>`}`,
      onSubmit: (v) => {
        const st = S.s();
        const cost = A.minor(v.cost) / 100;
        if (!(cost >= 0)) { A.toast('Введите стоимость'); return; }
        const fields = { title: (v.title || '').trim() || 'Работа', dateISO: v.date || todayISO(), date: autoDateLabel(v.date || todayISO()),
          cost, km: Math.round(Number(v.km) || 0), comment: (v.comment || '').trim() };
        if (existing) {
          const prev = autoSnapshot('service', existing);
          Object.assign(existing, fields);
          const link = autoUpdateLinkedFinance(st, 'service', existing);
          S.save();
          const changes = autoChanges('service', prev, autoSnapshot('service', existing));
          if (link) changes.push({ field: 'Связанный расход', from: link.prev.title + ' · ' + A.money(link.prev.amount), to: link.next.title + ' · ' + A.money(link.next.amount) });
          A.logAction({ action: 'car.service.update', title: 'Обслуживание изменено', object: existing.title + ' · ' + A.money(existing.cost),
            objectType: 'car', undoable: true, changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: link ? { type: 'batch', steps: [
              { type: 'fields', list: 'car.service', id: existing.id, fields: prev },
              { type: 'fields', list: 'ops', id: link.op.id, fields: link.prev }
            ], adjust: finAdjustPayload(st, link.next, link.prev) } : { type: 'fields', list: 'car.service', id: existing.id, fields: prev } });
          A.closeModal(); A.render(); A.toast('Обслуживание сохранено · можно отменить');
        } else {
          const it = Object.assign({ id: S.id('cs'), financeOpId: '' }, fields);
          st.car.service.unshift(it);
          const link = v.makeExpense ? autoCreateFinance(st, 'service', it) : null;
          S.save();
          A.logAction({ action: 'car.service.create', title: 'Обслуживание добавлено', object: it.title + ' · ' + A.money(it.cost),
            objectType: 'car', undoable: true,
            changes: [{ field: 'Работа', from: '—', to: it.title }, { field: 'Стоимость', from: '—', to: A.money(it.cost) }, { field: 'Пробег', from: '—', to: it.km + ' км' }],
            undo: link ? { type: 'batch', steps: [
              { type: 'remove', list: 'car.service', id: it.id }, { type: 'remove', list: 'ops', id: link.op.id }
            ], adjust: finAdjustPayload(st, link.op, null) } : { type: 'remove', list: 'car.service', id: it.id } });
          A.closeModal(); A.render(); A.toast(link ? 'Обслуживание и финоперация добавлены · можно отменить' : 'Обслуживание добавлено · можно отменить');
        }
      }
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
      onSubmit: (v) => {
        const st = S.s();
        const fields = { title: (v.title || '').trim() || 'Документ', untilISO: v.until || '', until: v.until ? autoDateLabel(v.until) : 'без срока', remindDays: Math.max(0, Math.round(Number(v.remindDays) || 0)) };
        if (existing) {
          const prev = autoSnapshot('doc', existing);
          Object.assign(existing, fields);
          S.save();
          A.logAction({ action: 'car.doc.update', title: 'Документ авто изменён', object: existing.title, objectType: 'car', undoable: true,
            changes: autoChanges('doc', prev, autoSnapshot('doc', existing)), undo: { type: 'fields', list: 'car.docs', id: existing.id, fields: prev } });
          A.closeModal(); A.render(); A.toast('Документ сохранён · можно отменить');
        } else {
          const it = Object.assign({ id: S.id('cd') }, fields);
          st.car.docs.unshift(it);
          S.save();
          A.logAction({ action: 'car.doc.create', title: 'Документ авто добавлен', object: it.title, objectType: 'car', undoable: true,
            changes: [{ field: 'Документ', from: '—', to: it.title }, { field: 'Срок', from: '—', to: it.until }],
            undo: { type: 'remove', list: 'car.docs', id: it.id } });
          A.closeModal(); A.render(); A.toast('Документ добавлен · можно отменить');
        }
      }
    });
  }

  // pages2 загружается после pages1 и переопределяет быструю форму заправки на связанную с финансами версию.
  A.fuelForm = autoFuelForm;

  /* ================= ПОКУПКИ ================= */
  const SHOP_STATUS = {
    owned: { label: 'в собственности', cls: 'ok' },
    sold: { label: 'продано', cls: '' },
    archived: { label: 'архив', cls: 'warn' }
  };
  let shopFilter = { status: 'owned', category: 'all', warranty: 'all', q: '' };

  function isoFromHumanDate(v) {
    const m = /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(String(v || '').trim());
    return m ? m[3] + '-' + m[2] + '-' + m[1] : '';
  }
  function purchaseDateISO(p) { return p.dateISO || isoFromHumanDate(p.date); }
  function purchaseWarrantyISO(p) { return p.warrantyISO || isoFromHumanDate(p.warranty); }
  function purchaseDateLabel(iso) { return iso ? humanDate(iso) : '—'; }
  function purchaseStatusKey(p) {
    const raw = String((p && p.status) || 'owned').toLowerCase();
    if (raw === 'owned' || raw === 'в собственности') return 'owned';
    if (raw === 'sold' || raw === 'продано' || raw === 'продана') return 'sold';
    if (raw === 'archived' || raw === 'архив' || raw === 'в архиве') return 'archived';
    return 'owned';
  }
  function purchaseStatusLabel(p) { return SHOP_STATUS[purchaseStatusKey(p)].label; }
  function purchaseStatusPill(p) {
    const st = SHOP_STATUS[purchaseStatusKey(p)];
    return `<span class="pill ${st.cls}">${A.esc(st.label)}</span>`;
  }
  function purchaseWarrantyKind(p) {
    if (!p || (!p.warranty && !p.warrantyISO) || p.warranty === '—') return 'none';
    const label = p.warranty || purchaseDateLabel(purchaseWarrantyISO(p));
    const w = A.warrantyStatus(label);
    if (w.cls === 'danger') return 'expired';
    if (w.cls === 'warn') return 'warn';
    if (w.cls === 'ok') return 'active';
    return 'none';
  }
  function purchaseCategories(st) {
    const out = (st.purchaseCategories || ['Электроника', 'Дом', 'Авто', 'Другое']).slice();
    (st.purchases || []).forEach((p) => { if (p.category && out.indexOf(p.category) < 0) out.push(p.category); });
    return out;
  }
  function purchaseRepairs(p) { return Array.isArray(p.repairs) ? p.repairs : []; }
  function purchaseRepairTotal(p) {
    return purchaseRepairs(p).reduce((sum, r) => A.sumMoney(sum, r.cost || 0), 0);
  }
  function purchaseSnapshot(p) {
    return {
      name: p.name || '', emoji: p.emoji || '📦', category: p.category || 'Другое', price: Number(p.price) || 0,
      date: p.date || purchaseDateLabel(purchaseDateISO(p)), dateISO: purchaseDateISO(p), store: p.store || '',
      warranty: p.warranty || purchaseDateLabel(purchaseWarrantyISO(p)), warrantyISO: purchaseWarrantyISO(p),
      sn: p.sn || '', status: purchaseStatusKey(p), condition: p.condition || '', note: p.note || '',
      financeOpId: p.financeOpId || ''
    };
  }
  function purchaseFinanceCat(st, p) {
    const finCats = st.finCategories || [];
    if (finCats.indexOf(p.category) >= 0) return p.category;
    if (/авто/i.test(p.category || '') && finCats.indexOf('Авто') >= 0) return 'Авто';
    if (finCats.indexOf('Другое') >= 0) return 'Другое';
    return finCats[0] || 'Другое';
  }
  function purchaseFinanceOp(st, p) {
    const account = ((st.finAccounts || [])[0] || {}).id || 'card';
    const iso = purchaseDateISO(p) || todayISO();
    return {
      id: S.id('o'), type: 'expense', cat: purchaseFinanceCat(st, p), account,
      title: 'Покупка: ' + (p.name || 'Покупка'), amount: Number(p.price) || 0,
      date: purchaseDateLabel(iso), dateISO: iso,
      comment: 'Связано с покупкой/имуществом: ' + (p.name || 'Покупка'), purchaseId: p.id
    };
  }
  function purchaseChanges(prev, next) {
    const labels = { name: 'Название', emoji: 'Иконка', category: 'Категория', price: 'Цена', dateISO: 'Дата покупки',
      store: 'Магазин', warrantyISO: 'Гарантия до', sn: 'Серийный номер', status: 'Статус', condition: 'Состояние/место', note: 'Заметка' };
    const fmt = (k, v) => {
      if (k === 'price') return A.money(v || 0);
      if (k === 'dateISO' || k === 'warrantyISO') return purchaseDateLabel(v);
      if (k === 'status') return (SHOP_STATUS[v] || SHOP_STATUS.owned).label;
      return v || '—';
    };
    const keys = ['name', 'emoji', 'category', 'price', 'dateISO', 'store', 'warrantyISO', 'sn', 'status', 'condition', 'note'];
    return keys.reduce((acc, k) => {
      const a = prev[k] == null ? '' : prev[k], b = next[k] == null ? '' : next[k];
      if (k === 'price' ? A.minor(a) !== A.minor(b) : String(a) !== String(b)) acc.push({ field: labels[k], from: fmt(k, a), to: fmt(k, b) });
      return acc;
    }, []);
  }
  function purchaseForm(existing) {
    const st0 = s();
    const cats = purchaseCategories(st0);
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
        const st = S.s();
        const price = A.minor(v.price) / 100;
        if (!((v.name || '').trim())) { A.toast('Введите название покупки'); return; }
        if (!(price >= 0)) { A.toast('Цена должна быть числом'); return; }
        const fields = {
          name: (v.name || '').trim(), emoji: (v.emoji || '📦').trim() || '📦', category: v.category || 'Другое', price,
          dateISO: v.date || '', date: v.date ? humanDate(v.date) : '—', store: (v.store || '').trim(),
          warrantyISO: v.warranty || '', warranty: v.warranty ? humanDate(v.warranty) : '—', sn: (v.sn || '').trim(),
          status: v.status || 'owned', condition: (v.condition || '').trim(), note: (v.note || '').trim()
        };
        if (existing) {
          const prev = purchaseSnapshot(existing);
          Object.assign(existing, fields);
          const next = purchaseSnapshot(existing);
          let linked = null, linkedPrev = null, linkedNext = null, linkedAdjust = [];
          if (existing.financeOpId) linked = (st.ops || []).find((o) => o.id === existing.financeOpId);
          if (linked) {
            linkedPrev = opSnapshot(linked);
            linkedNext = Object.assign({}, linkedPrev, {
              title: 'Покупка: ' + existing.name, amount: existing.price,
              dateISO: purchaseDateISO(existing) || linkedPrev.dateISO || todayISO(),
              date: purchaseDateLabel(purchaseDateISO(existing) || linkedPrev.dateISO || todayISO()),
              comment: 'Связано с покупкой/имуществом: ' + existing.name
            });
            linkedAdjust = finAdjustPayload(st, linkedPrev, linkedNext);
            Object.assign(linked, linkedNext);
            applyFinAdjust(st, linkedAdjust);
          }
          S.save();
          const changes = purchaseChanges(prev, next);
          if (linked) changes.push({ field: 'Связанный расход', from: linkedPrev.title + ' · ' + A.money(linkedPrev.amount), to: linkedNext.title + ' · ' + A.money(linkedNext.amount) });
          A.logAction({
            action: 'purchase.update', title: 'Покупка изменена', object: existing.name, objectType: 'purchase', undoable: true,
            changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: linked ? { type: 'batch', steps: [
              { type: 'fields', list: 'purchases', id: existing.id, fields: prev },
              { type: 'fields', list: 'ops', id: linked.id, fields: linkedPrev }
            ], adjust: finAdjustPayload(st, linkedNext, linkedPrev) } :
              { type: 'fields', list: 'purchases', id: existing.id, fields: prev }
          });
          A.closeModal(); A.render(); A.toast('Покупка сохранена · можно отменить в истории');
        } else {
          const it = Object.assign({ id: S.id('p'), repairs: [], financeOpId: '' }, fields);
          st.purchases.unshift(it);
          let op = null, adjust = [];
          if (v.makeExpense && it.price > 0) {
            op = purchaseFinanceOp(st, it);
            st.ops.unshift(op);
            it.financeOpId = op.id;
            adjust = finAdjustPayload(st, null, op);
            applyFinAdjust(st, adjust);
          }
          S.save();
          A.logAction({
            action: 'purchase.create', title: 'Покупка добавлена', object: it.name + ' · ' + A.money(it.price),
            objectType: 'purchase', undoable: true,
            changes: [
              { field: 'Название', from: '—', to: it.name }, { field: 'Цена', from: '—', to: A.money(it.price) },
              { field: 'Категория', from: '—', to: it.category }, { field: 'Гарантия до', from: '—', to: it.warranty },
              { field: 'Связанный расход', from: '—', to: op ? op.title + ' · ' + A.money(op.amount) : 'не создан' }
            ],
            undo: op ? { type: 'batch', steps: [
              { type: 'remove', list: 'purchases', id: it.id }, { type: 'remove', list: 'ops', id: op.id }
            ], adjust: finAdjustPayload(st, op, null) } : { type: 'remove', list: 'purchases', id: it.id }
          });
          A.closeModal(); A.render(); A.toast(op ? 'Покупка и связанный расход добавлены · можно отменить' : 'Покупка добавлена · можно отменить в истории');
        }
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
        const st = S.s();
        const item = (st.purchases || []).find((x) => x.id === p.id);
        if (!item) { A.toast('Покупка не найдена'); return; }
        if (!Array.isArray(item.repairs)) item.repairs = [];
        const rec = { id: S.id('pr'), title: (v.title || '').trim() || 'Обслуживание', dateISO: v.date || todayISO(),
          date: v.date ? humanDate(v.date) : 'сегодня', cost: A.minor(v.cost) / 100, comment: (v.comment || '').trim() };
        item.repairs.unshift(rec);
        const idx = A.indexOfId(st.purchases, item.id);
        S.save();
        A.logAction({
          action: 'purchase.service.create', title: 'Обслуживание покупки добавлено', object: item.name + ' · ' + rec.title,
          objectType: 'purchase', undoable: true,
          changes: [{ field: 'Работа', from: '—', to: rec.title }, { field: 'Стоимость', from: '—', to: A.money(rec.cost) }],
          undo: { type: 'remove', list: 'purchases.' + idx + '.repairs', id: rec.id }
        });
        A.closeModal(); A.render(); A.toast('Запись обслуживания добавлена · можно отменить');
      }
    });
  }

  A.pages.shopping = function () {
    const st = s();
    const items = st.purchases || [];
    const cats = purchaseCategories(st);
    const q = shopFilter.q.trim().toLowerCase();
    const filtered = items.filter((p) => {
      const status = purchaseStatusKey(p);
      if (shopFilter.status !== 'all' && status !== shopFilter.status) return false;
      if (shopFilter.category !== 'all' && (p.category || 'Другое') !== shopFilter.category) return false;
      if (shopFilter.warranty !== 'all' && purchaseWarrantyKind(p) !== shopFilter.warranty) return false;
      if (!q) return true;
      return [p.name, p.category, p.store, p.sn, p.note, purchaseStatusLabel(p)].join(' ').toLowerCase().includes(q);
    });
    const owned = items.filter((p) => purchaseStatusKey(p) === 'owned');
    const total = owned.reduce((sum, p) => A.sumMoney(sum, p.price || 0), 0);
    const activeWarranty = items.filter((p) => ['active', 'warn'].indexOf(purchaseWarrantyKind(p)) >= 0).length;
    const attention = items.filter((p) => ['warn', 'expired'].indexOf(purchaseWarrantyKind(p)) >= 0).length;
    const serviceTotal = items.reduce((sum, p) => A.sumMoney(sum, purchaseRepairTotal(p)), 0);
    const html = `
    <div class="page-head">
      <div><h1>Покупки / Имущество</h1><div class="sub">Гарантии · статусы · обслуживание · связь с финансами · Stage 1.1 prototype</div></div>
      <div class="btn-row">
        <button class="btn" data-action="shop-export-csv">Экспорт CSV</button>
        <button class="btn primary" data-action="shop-add">＋ Покупка</button>
      </div>
    </div>
    <div class="grid cols-4" style="margin-bottom:16px">
      <div class="card stat"><div class="l">В собственности</div><div class="v">${owned.length}</div><div class="d">активных предметов</div></div>
      <div class="card stat"><div class="l">Оценка стоимости</div><div class="v">${A.money(total)}</div><div class="d">по цене покупки</div></div>
      <div class="card stat"><div class="l">Гарантия действует</div><div class="v">${activeWarranty}</div><div class="d">истекает/истекла: ${attention}</div></div>
      <div class="card stat"><div class="l">Ремонты/сервис</div><div class="v">${A.money(serviceTotal)}</div><div class="d">по всем предметам</div></div>
    </div>
    <div class="card shop-filters">
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
    ${filtered.length ? `<div class="shop-grid">
      ${filtered.map((p) => {
        const w = A.warrantyStatus(p.warranty || purchaseDateLabel(purchaseWarrantyISO(p)));
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
          <div class="char-wrap">${(window.AvenChar && !window.AvenChar.isOff() && window.AvenChar.current().id === 'female')
            ? `<img class="char-bust" src="assets/character/web/female-aven-transparent.png" alt="${A.esc(window.AvenChar.current().label)} — виртуальный помощник">`
            : (window.AvenChar ? window.AvenChar.avatar('s52') : '<div class="logo-mark mark">A</div>')}</div>
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

  function assistantDaySummary(dateISO) {
    const C = window.AvenActions;
    const label = C.dates.dateLabel(dateISO);
    const evs = C.events.getEventsForDate(dateISO).items;
    const tasks = C.tasks.getTasksForDate(dateISO, { includeCompleted: true }).items;
    const openTasks = tasks.filter((t) => !C.tasks.isCompleted(t));
    const doneTasks = tasks.filter((t) => C.tasks.isCompleted(t));
    const eText = evs.length ? evs.map((e) => (C.format.eventTime(e) + ' — ' + e.title)).join('; ') : 'событий нет';
    const tText = openTasks.length ? openTasks.map((t) => t.title).join('; ') : 'активных задач нет';
    return label.charAt(0).toUpperCase() + label.slice(1) + ': ' + eText + '. Задачи: ' + tText + (doneTasks.length ? '. Выполнено: ' + doneTasks.length + '.' : '.') + ' Данные взяты из общего task/event state.';
  }
  function assistantOverdueSummary() {
    const C = window.AvenActions;
    const tasks = C.tasks.getOverdueTasks(C.dates.todayISO()).items;
    if (!tasks.length) return 'Просроченных задач нет. Проверено по общему task state.';
    return 'Просроченные задачи: ' + tasks.map((t) => t.title + ' — срок ' + C.format.taskDueLabel(t)).join('; ') + '.';
  }

  function pushAven(text, speak) {
    A._chat.push({ who: 'aven', text: text });
    A._lastReply = text; // для строки статуса на Главной
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
    if (/(просроч| overdue)/.test(tn) && /задач/.test(tn)) return assistantOverdueSummary();
    if (/(что|план|дела).*(завтра)|завтра.*(что|план|дела)/.test(tn)) return assistantDaySummary(window.AvenActions.dates.todayISO(1));
    if (/(что|план|дела).*(сегодня)|сегодня.*(что|план|дела)/.test(tn)) return assistantDaySummary(window.AvenActions.dates.todayISO());
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
    const P = window.AvenPresence;
    if (P) P.set('thinking');
    setTimeout(() => {
      let out; let kind = null;
      if (window.AvenFlows && window.AvenFlows.isActive()) {
        const r = window.AvenFlows.advance(t);
        out = r ? r.text : replyFor(t);
        kind = r ? r.kind : null;
      } else {
        out = routeCommand(t);
      }
      pushAven(out, true);
      if (P) {
        if (kind === 'done') { if (/ВАЖНОЕ/.test(out)) P.flash('important', 4200); else P.flash('success', 2600); }
        else if (kind === 'next') P.set('waiting');
        else P.set('idle'); // если TTS заговорит — voice.js сам переведёт в speaking
      }
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
        const st = S.s();
        if (!Array.isArray(st.finAccounts)) st.finAccounts = [];
        const name = (v.name || '').trim();
        const bal = A.minor(v.balance) / 100;
        if (!name) { A.toast('Введите название счёта'); return; }
        if (existing) {
          const prev = { name: existing.name, balance: existing.balance };
          const delta = A.sumMoney(bal, -prev.balance);
          existing.name = name;
          existing.balance = bal;
          st.finMonth.balance = A.sumMoney(st.finMonth.balance, delta);
          S.save();
          const changes = [];
          if (prev.name !== name) changes.push({ field: 'Название счёта', from: prev.name, to: name });
          if (A.minor(prev.balance) !== A.minor(bal)) changes.push({ field: 'Баланс счёта', from: A.money(prev.balance), to: A.money(bal) });
          A.logAction({
            action: 'finance.account.update', title: 'Счёт изменён', object: name, objectType: 'system', undoable: true,
            changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: { type: 'fields', list: 'finAccounts', id: existing.id, fields: prev,
                    adjust: A.minor(delta) ? [{ path: 'finMonth.balance', delta: -delta }] : [] }
          });
          A.closeModal(); A.render(); A.toast('Счёт сохранён · общий баланс пересчитан');
        } else {
          const acc = { id: S.id('acc'), name, balance: bal };
          st.finAccounts.unshift(acc);
          st.finMonth.balance = A.sumMoney(st.finMonth.balance, bal);
          S.save();
          A.logAction({
            action: 'finance.account.create', title: 'Счёт создан', object: name + ' · ' + A.money(bal),
            objectType: 'system', undoable: true,
            changes: [{ field: 'Название', from: '—', to: name }, { field: 'Баланс', from: '—', to: A.money(bal) }],
            undo: { type: 'remove', list: 'finAccounts', id: acc.id,
                    adjust: A.minor(bal) ? [{ path: 'finMonth.balance', delta: -bal }] : [] }
          });
          A.closeModal(); A.render(); A.toast('Счёт добавлен · можно отменить в истории');
        }
      }
    });
  }

  function financeCategoryForm() {
    A.openModal({
      title: 'Новая категория',
      body: `<div class="field"><label>Название категории</label><input type="text" name="name" placeholder="Например: Здоровье"></div>`,
      onSubmit: (v) => {
        const st = S.s();
        const name = (v.name || '').trim();
        if (!name) { A.toast('Введите название категории'); return; }
        if ((st.finCategories || []).some((c) => c.toLowerCase() === name.toLowerCase())) { A.toast('Такая категория уже есть'); return; }
        const prev = (st.finCategories || []).slice();
        st.finCategories = prev.concat([name]);
        S.save();
        A.logAction({
          action: 'finance.category.create', title: 'Категория создана', object: name, objectType: 'system', undoable: true,
          changes: [{ field: 'Категория', from: '—', to: name }],
          undo: { type: 'value', path: 'finCategories', value: prev }
        });
        A.closeModal(); A.render(); A.toast('Категория добавлена · можно отменить в истории');
      }
    });
  }

  function financeForm(existing) {
    const st0 = s();
    const cats = st0.finCategories || ['Авто', 'Продукты', 'Дом', 'Подписки', 'Другое', 'Доход'];
    const accounts = st0.finAccounts || [];
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
        const st = S.s();
        const amt = A.minor(v.amount) / 100;
        if (!(amt > 0)) { A.toast('Введите сумму больше нуля'); return; }
        const opFields = {
          type: v.type,
          cat: v.cat,
          account: v.account || ((st.finAccounts || [])[0] || {}).id || 'card',
          title: (v.title || '').trim() || v.cat,
          amount: amt,
          dateISO: v.date || todayISO(),
          date: v.date ? humanDate(v.date) : 'сегодня',
          comment: (v.comment || '').trim()
        };
        if (existing) {
          const prev = opSnapshot(existing);
          const next = Object.assign({}, prev, opFields);
          applyFinAdjust(st, finAdjustPayload(st, prev, next));
          Object.assign(existing, opFields);
          S.save();
          const labels = { type: 'Тип', cat: 'Категория', account: 'Счёт', title: 'Название', amount: 'Сумма', dateISO: 'Дата', comment: 'Комментарий' };
          const changes = [];
          ['type', 'cat', 'account', 'title', 'amount', 'dateISO', 'comment'].forEach((k) => {
            const from = prev[k], to = next[k];
            if (String(from == null ? '' : from) === String(to == null ? '' : to)) return;
            const fmt = (val) => k === 'amount' ? A.money(val) : k === 'dateISO' ? humanDate(val) : k === 'account' ? opAccount(st, val).name : (k === 'type' ? (val === 'income' ? 'Доход' : 'Расход') : (val || '—'));
            changes.push({ field: labels[k], from: fmt(from), to: fmt(to) });
          });
          A.logAction({
            action: next.type === 'income' ? 'finance.income.update' : 'finance.expense.update',
            title: 'Операция изменена', object: next.title + ' · ' + A.money(next.amount),
            objectType: next.type === 'income' ? 'income' : 'expense', undoable: true,
            changes: changes.length ? changes : [{ field: 'Изменений нет', from: '—', to: '—' }],
            undo: { type: 'fields', list: 'ops', id: existing.id, fields: prev, adjust: finAdjustPayload(st, next, prev) }
          });
          A.closeModal(); A.render(); A.toast('Операция сохранена · итоги и счёт пересчитаны · можно отменить');
        } else {
          const op = Object.assign({ id: S.id('o') }, opFields);
          st.ops.unshift(op);
          applyFinAdjust(st, finAdjustPayload(st, null, op));
          S.save();
          A.logAction({
            action: op.type === 'expense' ? 'finance.expense.create' : 'finance.income.create',
            title: (op.type === 'expense' ? 'Расход' : 'Доход') + ' добавлен', object: op.title + ' · ' + A.money(amt),
            objectType: op.type === 'expense' ? 'expense' : 'income', undoable: true,
            changes: [
              { field: 'Сумма', from: '—', to: A.money(amt) + ' (' + A.minor(amt) + ' мин. ед.)' },
              { field: 'Категория', from: '—', to: op.cat },
              { field: 'Счёт', from: '—', to: opAccount(st, op.account).name },
              { field: 'Дата', from: '—', to: humanDate(op.dateISO) }
            ],
            undo: { type: 'remove', list: 'ops', id: op.id, adjust: finAdjustPayload(st, op, null) }
          });
          A.closeModal(); A.render(); A.toast('Операция записана · итоги и счёт пересчитаны · можно отменить');
        }
      }
    });
  }

  /* ================= действия ================= */
  A.register({
    'fin-add': () => financeForm(),
    'fin-edit': (el) => { const op = (s().ops || []).find((x) => x.id === el.dataset.id); if (op) financeForm(op); else A.toast('Операция не найдена'); },
    'fin-filter-period': (el) => { finFilter.period = el.value; A.render(); },
    'fin-filter-type': (el) => { finFilter.type = el.value; A.render(); },
    'fin-filter-cat': (el) => { finFilter.cat = el.value; A.render(); },
    'fin-filter-account': (el) => { finFilter.account = el.value; A.render(); },
    'fin-account-add': () => financeAccountForm(),
    'fin-account-edit': (el) => {
      const acc = (s().finAccounts || []).find((x) => x.id === el.dataset.id);
      if (acc) financeAccountForm(acc); else A.toast('Счёт не найден');
    },
    'fin-account-del': (el) => {
      const st = S.s();
      const list = st.finAccounts || [];
      const i = list.findIndex((x) => x.id === el.dataset.id);
      const acc = list[i];
      if (i < 0 || !acc) { A.toast('Счёт не найден'); return; }
      const used = (st.ops || []).some((o) => (o.account || 'card') === acc.id);
      if (used) { A.toast('Нельзя удалить счёт с операциями — сначала перенесите или удалите операции'); return; }
      A.confirmModal('Удалить счёт «' + acc.name + '»? Общий баланс изменится на ' + A.money(-acc.balance) + '. Отмена доступна через историю.', () => {
        const s2 = S.s();
        const idx = (s2.finAccounts || []).findIndex((x) => x.id === acc.id);
        const item = (s2.finAccounts || [])[idx];
        if (idx < 0 || !item) { A.toast('Счёт не найден'); return; }
        s2.finAccounts.splice(idx, 1);
        s2.finMonth.balance = A.sumMoney(s2.finMonth.balance, -item.balance);
        S.save();
        A.logAction({
          action: 'finance.account.delete', title: 'Счёт удалён', object: item.name, objectType: 'system', danger: true, undoable: true,
          changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалён' }, { field: 'Баланс', from: A.money(item.balance), to: '0 ₽' }],
          undo: { type: 'restore', list: 'finAccounts', index: idx, item: JSON.parse(JSON.stringify(item)),
                  adjust: A.minor(item.balance) ? [{ path: 'finMonth.balance', delta: item.balance }] : [] }
        });
        A.render(); A.toast('Счёт удалён · можно отменить');
      });
    },
    'fin-cat-add': () => financeCategoryForm(),
    'fin-cat-del': (el) => {
      const st = S.s();
      const name = el.dataset.name;
      if ((st.ops || []).some((o) => o.cat === name)) { A.toast('Нельзя удалить категорию, которая используется в операциях'); return; }
      const prev = (st.finCategories || []).slice();
      A.confirmModal('Удалить категорию «' + name + '»? Отмена доступна через историю.', () => {
        const s2 = S.s();
        s2.finCategories = (s2.finCategories || []).filter((c) => c !== name);
        S.save();
        A.logAction({
          action: 'finance.category.delete', title: 'Категория удалена', object: name, objectType: 'system', danger: true, undoable: true,
          changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалена' }],
          undo: { type: 'value', path: 'finCategories', value: prev }
        });
        A.render(); A.toast('Категория удалена · можно отменить');
      });
    },

    /* удаление операции: подтверждение + пересчёт итогов + Undo (MVP_SCOPE §5.6, приёмка 4) */
    'fin-del': (el) => {
      const list = S.s().ops || [];
      const i0 = list.findIndex((x) => x && x.id === el.dataset.id);
      const it = list[i0];
      if (i0 < 0 || !it) { A.toast('Операция не найдена'); return; }
      A.confirmModal('Удалить операцию «' + it.title + '» на ' + A.money(it.amount) +
        '? Итоги месяца, общий баланс и баланс счёта пересчитаются. Отмена (Undo) останется в истории действий.', () => {
        const st = S.s();
        const i = (st.ops || []).findIndex((x) => x && x.id === el.dataset.id);
        const op = (st.ops || [])[i];
        if (i < 0 || !op) { A.toast('Операция не найдена'); return; }
        const prevBalance = st.finMonth.balance;
        st.ops.splice(i, 1);
        applyFinAdjust(st, finAdjustPayload(st, op, null));
        S.save();
        A.logAction({
          action: op.type === 'expense' ? 'finance.expense.delete' : 'finance.income.delete',
          title: 'Операция удалена', object: op.title + ' · ' + A.money(op.amount),
          objectType: op.type === 'expense' ? 'expense' : 'income', undoable: true, danger: true,
          changes: [
            { field: 'Состояние', from: 'в списке', to: 'Удалена' },
            { field: 'Баланс', from: A.money(prevBalance), to: A.money(st.finMonth.balance) },
            { field: 'Счёт', from: opAccount(st, op.account).name, to: 'пересчитан' }
          ],
          undo: { type: 'restore', list: 'ops', index: i, item: JSON.parse(JSON.stringify(op)),
                  adjust: finAdjustPayload(st, null, op) }
        });
        A.render(); A.toast('Операция удалена, итоги и счёт пересчитаны — можно отменить');
      });
    },

    /* экспорт операций в CSV (MVP_SCOPE §5.6, приёмка 5). BOM — чтобы Excel корректно открыл UTF-8. */
    'fin-export-csv': () => {
      const st = S.s();
      const rows = [['Дата', 'Тип', 'Категория', 'Счёт', 'Название', 'Сумма', 'Сумма в минимальных единицах', 'Комментарий']];
      (st.ops || []).forEach((o) => rows.push([opDateISO(o) || o.date, o.type === 'income' ? 'доход' : 'расход', o.cat,
        opAccount(st, o.account).name, o.title, (A.minor(o.amount) / 100).toFixed(2), A.minor(o.amount), o.comment || '']));
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
      const item = autoList(s(), 'fuel').find((x) => x.id === el.dataset.id);
      if (item) autoFuelForm(item); else A.toast('Заправка не найдена');
    },
    'auto-expense-edit': (el) => {
      const item = autoList(s(), 'expense').find((x) => x.id === el.dataset.id);
      if (item) autoExpenseForm(item); else A.toast('Расход авто не найден');
    },
    'auto-service-edit': (el) => {
      const item = autoList(s(), 'service').find((x) => x.id === el.dataset.id);
      if (item) autoServiceForm(item); else A.toast('Обслуживание не найдено');
    },
    'auto-doc-edit': (el) => {
      const item = autoList(s(), 'doc').find((x) => x.id === el.dataset.id);
      if (item) autoDocForm(item); else A.toast('Документ не найден');
    },
    'auto-fin-link': (el) => {
      const kind = el.dataset.kind;
      const st = s();
      const item = autoList(st, kind).find((x) => x.id === el.dataset.id);
      if (!item) { A.toast('Запись авто не найдена'); return; }
      if (autoLinkedOp(st, item)) { A.toast('Финансовая операция уже связана'); return; }
      if (!(autoCost(kind, item) > 0)) { A.toast('Для финансовой связи нужна сумма больше нуля'); return; }
      A.confirmModal('Создать связанную финансовую операцию для «' + autoTitle(kind, item) + '»? Баланс и счёт пересчитаются, Undo снимет связь и удалит расход.', () => {
        const st2 = S.s();
        const item2 = autoList(st2, kind).find((x) => x.id === el.dataset.id);
        if (!item2) { A.toast('Запись авто не найдена'); return; }
        const prev = autoSnapshot(kind, item2);
        const link = autoCreateFinance(st2, kind, item2);
        if (!link) { A.toast('Не удалось создать расход'); return; }
        S.save();
        A.logAction({
          action: 'car.finance.link', title: 'Авто связано с финансами', object: autoTitle(kind, item2) + ' · ' + A.money(link.op.amount),
          objectType: 'car', undoable: true,
          changes: [{ field: 'Связанный расход', from: '—', to: link.op.title + ' · ' + A.money(link.op.amount) },
                    { field: 'Счёт', from: '—', to: opAccount(st2, link.op.account).name }],
          undo: { type: 'batch', steps: [
            { type: 'fields', list: autoListPath(kind), id: item2.id, fields: prev },
            { type: 'remove', list: 'ops', id: link.op.id }
          ], adjust: finAdjustPayload(st2, link.op, null) }
        });
        A.render(); A.toast('Финансовая операция создана · можно отменить');
      });
    },
    'auto-record-del': (el) => {
      const kind = el.dataset.kind;
      const st = s();
      const list = autoList(st, kind);
      const idx0 = list.findIndex((x) => x.id === el.dataset.id);
      const item0 = list[idx0];
      if (idx0 < 0 || !item0) { A.toast('Запись авто не найдена'); return; }
      const linked0 = autoLinkedOp(st, item0);
      A.confirmModal('Удалить «' + autoTitle(kind, item0) + '»? Это разрушающее действие' +
        (linked0 ? ': связанная финансовая операция тоже будет удалена и баланс пересчитается.' : ', его можно отменить через Undo.') , () => {
        const st2 = S.s();
        const list2 = autoList(st2, kind);
        const idx = list2.findIndex((x) => x.id === el.dataset.id);
        const item = list2[idx];
        if (idx < 0 || !item) { A.toast('Запись авто не найдена'); return; }
        const itemCopy = JSON.parse(JSON.stringify(item));
        const linked = autoLinkedOp(st2, item);
        const opIdx = linked ? A.indexOfId(st2.ops || [], linked.id) : -1;
        const opCopy = linked ? JSON.parse(JSON.stringify(linked)) : null;
        list2.splice(idx, 1);
        if (linked && opIdx >= 0) {
          st2.ops.splice(opIdx, 1);
          applyFinAdjust(st2, finAdjustPayload(st2, linked, null));
        }
        S.save();
        A.logAction({
          action: 'car.' + kind + '.delete', title: AUTO_LABEL[kind] + ' удалён', object: autoTitle(kind, itemCopy),
          objectType: 'car', undoable: true, danger: true,
          changes: [{ field: 'Состояние', from: 'в списке', to: 'Удалено' },
                    { field: 'Финансы', from: linked ? 'связанный расход' : '—', to: linked ? 'расход удалён' : '—' }],
          undo: linked ? { type: 'batch', steps: [
            { type: 'restore', list: autoListPath(kind), index: idx, item: itemCopy },
            { type: 'restore', list: 'ops', index: Math.max(0, opIdx), item: opCopy }
          ], adjust: finAdjustPayload(st2, null, opCopy) } : { type: 'restore', list: autoListPath(kind), index: idx, item: itemCopy }
        });
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
        body: `<div class="field"><label>Текущий пробег, км</label><input type="number" name="km" value="${s().car.mileage}"></div>`,
        onSubmit: (v) => {
          const st = S.s();
          const was = st.car.mileage;
          const km = +v.km || was;
          st.car.mileage = km;
          S.save();
          A.logAction({
            action: 'car.mileage.update', title: 'Пробег обновлён', object: km + ' км', objectType: 'car',
            undoable: true, changes: [{ field: 'Пробег, км', from: String(was), to: String(km) }],
            undo: { type: 'value', path: 'car.mileage', value: was }
          });
          A.closeModal(); A.render(); A.toast('Пробег обновлён · можно отменить в истории');
        }
      });
    },

    'shop-add': () => purchaseForm(),
    'shop-edit': (el) => {
      const p = (s().purchases || []).find((x) => x.id === el.dataset.id);
      if (p) purchaseForm(p); else A.toast('Покупка не найдена');
    },
    'shop-service': (el) => {
      const p = (s().purchases || []).find((x) => x.id === el.dataset.id);
      if (p) purchaseServiceForm(p); else A.toast('Покупка не найдена');
    },
    'shop-filter-status': (el) => { shopFilter.status = el.value; A.render(); },
    'shop-filter-category': (el) => { shopFilter.category = el.value; A.render(); },
    'shop-filter-warranty': (el) => { shopFilter.warranty = el.value; A.render(); },
    'shop-status': (el) => {
      const p = (s().purchases || []).find((x) => x.id === el.dataset.id);
      if (!p) { A.toast('Покупка не найдена'); return; }
      const was = purchaseStatusKey(p);
      A.openModal({
        title: 'Изменить статус',
        body: `<div class="field"><label>Статус</label><select name="status">
          ${Object.keys(SHOP_STATUS).map((k) => `<option value="${k}" ${was === k ? 'selected' : ''}>${A.esc(SHOP_STATUS[k].label)}</option>`).join('')}
        </select></div>`,
        onSubmit: (v) => {
          const st = S.s();
          const item = (st.purchases || []).find((x) => x.id === p.id);
          if (!item) { A.toast('Покупка не найдена'); return; }
          const prev = purchaseSnapshot(item);
          item.status = v.status || 'owned';
          S.save();
          A.logAction({
            action: 'purchase.status.update', title: 'Статус покупки изменён', object: item.name,
            objectType: 'purchase', undoable: true,
            changes: [{ field: 'Статус', from: SHOP_STATUS[was].label, to: SHOP_STATUS[purchaseStatusKey(item)].label }],
            undo: { type: 'fields', list: 'purchases', id: item.id, fields: prev }
          });
          A.closeModal(); A.render(); A.toast('Статус изменён · можно отменить');
        }
      });
    },
    'shop-fin-link': (el) => {
      const p = (s().purchases || []).find((x) => x.id === el.dataset.id);
      if (!p) { A.toast('Покупка не найдена'); return; }
      if (p.financeOpId && (s().ops || []).some((o) => o.id === p.financeOpId)) { A.toast('Расход уже связан с покупкой'); return; }
      if (!(Number(p.price) > 0)) { A.toast('Для связанного расхода нужна цена больше нуля'); return; }
      A.confirmModal('Создать связанную финансовую операцию для «' + p.name + '»? Сумма попадёт в расходы, баланс и счёт пересчитаются; Undo удалит созданный расход и снимет связь.', () => {
        const st = S.s();
        const item = (st.purchases || []).find((x) => x.id === p.id);
        if (!item) { A.toast('Покупка не найдена'); return; }
        const prev = purchaseSnapshot(item);
        const op = purchaseFinanceOp(st, item);
        st.ops.unshift(op);
        item.financeOpId = op.id;
        const adjust = finAdjustPayload(st, null, op);
        applyFinAdjust(st, adjust);
        S.save();
        A.logAction({
          action: 'purchase.finance.link', title: 'Покупка связана с финансами', object: item.name + ' · ' + A.money(op.amount),
          objectType: 'purchase', undoable: true,
          changes: [{ field: 'Связанный расход', from: '—', to: op.title + ' · ' + A.money(op.amount) },
                    { field: 'Счёт', from: '—', to: opAccount(st, op.account).name }],
          undo: { type: 'batch', steps: [
            { type: 'fields', list: 'purchases', id: item.id, fields: prev },
            { type: 'remove', list: 'ops', id: op.id }
          ], adjust: finAdjustPayload(st, op, null) }
        });
        A.closeModal(); A.render(); A.toast('Расход создан и связан с покупкой · можно отменить');
      });
    },
    'shop-del': (el) => {
      const st = s();
      const p = (st.purchases || []).find((x) => x.id === el.dataset.id);
      if (!p) { A.toast('Покупка не найдена'); return; }
      A.confirmModal('Удалить покупку «' + p.name + '»? Это разрушающее действие: карточка и сервисные записи исчезнут, но их можно вернуть через Undo. Связанная финансовая операция не удаляется автоматически.', () => {
        const st2 = S.s();
        const idx = A.indexOfId(st2.purchases, p.id);
        const item = (st2.purchases || []).find((x) => x.id === p.id);
        if (!item) return;
        st2.purchases.splice(idx, 1);
        S.save();
        A.logAction({
          action: 'purchase.delete', title: 'Покупка удалена', object: item.name, objectType: 'purchase',
          undoable: true, danger: true,
          changes: [{ field: 'Статус', from: purchaseStatusLabel(item), to: 'Удалена' }],
          undo: { type: 'restore', list: 'purchases', index: idx, item }
        });
        A.closeModal(); A.render(); A.toast('Покупка удалена · можно отменить в истории');
      });
    },
    'shop-export-csv': () => {
      const st = s();
      const rows = [['Название', 'Категория', 'Статус', 'Цена', 'Дата покупки', 'Магазин', 'Гарантия до', 'Серийный номер', 'Ремонт/сервис', 'Связанный расход']];
      (st.purchases || []).forEach((p) => rows.push([
        p.name, p.category || 'Другое', purchaseStatusLabel(p), (A.minor(p.price) / 100).toFixed(2),
        p.date || purchaseDateLabel(purchaseDateISO(p)), p.store || '', p.warranty || purchaseDateLabel(purchaseWarrantyISO(p)),
        p.sn || '', (A.minor(purchaseRepairTotal(p)) / 100).toFixed(2), p.financeOpId || ''
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
      const st = s();
      const p = (st.purchases || []).find((x) => x.id === el.dataset.id);
      if (!p) return;
      const w = A.warrantyStatus(p.warranty || purchaseDateLabel(purchaseWarrantyISO(p)));
      const repairs = purchaseRepairs(p);
      const linked = p.financeOpId && (st.ops || []).find((o) => o.id === p.financeOpId);
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

    'flow-start': (el) => {
      const r = window.AvenFlows.start(el.dataset.id);
      if (r) {
        A._chat.push({ who: 'aven', text: 'Начинаю демо-сценарий «' + r.flow.title + '». ' + r.question });
        A._lastReply = r.question;
        renderChat();
        if (window.AvenPresence) window.AvenPresence.set('waiting'); // сценарий ждёт ответа пользователя
      }
    },

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
