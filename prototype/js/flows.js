/* Aven — Visual Prototype. Демо state machine: многошаговые сценарии (заправка,
   важное событие) и демо-команды. Это НЕ Command Engine (Stage 2), а наглядная
   машина состояний для UX-прототипа: шаги валидируются, есть отмена и честные
   подсказки. Не production. */
window.AvenFlows = (function () {
  const S = window.AvenState;
  const A = window.Aven;
  const s = () => S.s();

  let active = null; // { id, step, data }

  function num(text) {
    const m = String(text).replace(/[^\d.,-]/g, '').replace(',', '.');
    const n = parseFloat(m);
    return isNaN(n) ? null : n;
  }
  function yesno(text) {
    const t = String(text).trim().toLowerCase();
    if (/^(да|y|yes|ok|ок|ага|конечно|подтвер)/.test(t)) return 'yes';
    if (/^(нет|n|no|неа|отмен)/.test(t)) return 'no';
    return null;
  }
  function fmtMoney(n) { return A ? A.money(n) : (n + ' ₽'); }
  function pad(n) { return String(n).padStart(2, '0'); }
  function isoOffset(offset) {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setDate(d.getDate() + (offset || 0));
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }
  function parseWhen(text) {
    const t = String(text || '').toLowerCase();
    let date = /послезавтра/.test(t) ? isoOffset(2) : /завтра/.test(t) ? isoOffset(1) : isoOffset(0);
    const dm = /(\d{1,2})[.\-/](\d{1,2})(?:[.\-/](\d{2,4}))?/.exec(t);
    if (dm) {
      const y = dm[3] ? (+dm[3] < 100 ? 2000 + +dm[3] : +dm[3]) : new Date().getFullYear();
      date = y + '-' + pad(+dm[2]) + '-' + pad(+dm[1]);
    }
    const tm = /(\d{1,2})[:.](\d{2})/.exec(t);
    return { date, time: tm ? pad(+tm[1]) + ':' + pad(+tm[2]) : '12:00' };
  }

  const FLOWS = {
    fuel: {
      id: 'fuel',
      title: 'Заправка (многошагово)',
      command: 'Заправился',
      steps: [
        { key: 'liters', ask: 'Сколько литров залили? (например, 42)', parse: num, min: 1, max: 300, err: 'Нужно число литров, например «42».' },
        { key: 'sum', ask: 'На какую сумму, в рублях? (например, 3200)', parse: num, min: 1, max: 100000, err: 'Нужна сумма в рублях, например «3200».' },
        { key: 'km', ask: 'Текущий пробег, км? (Enter/пусто — оставить прежний)', parse: num, optional: true, def: () => s().car.mileage, err: 'Нужен пробег числом или пусто.' },
        { key: 'confirm', ask: 'Записать заправку: {liters} л на {sum} ₽, пробег {km} км? (да/нет)', parse: yesno, err: 'Ответьте «да» или «нет».' }
      ],
      finish(data) {
        const st = s();
        st.car.fuel.unshift({ id: S.id('f'), liters: data.liters, sum: data.sum, km: data.km, date: 'сегодня' });
        st.car.mileage = data.km || st.car.mileage;
        st.ops.unshift({ id: S.id('o'), type: 'expense', cat: 'Авто', title: 'АЗС (демо-заправка)', amount: data.sum, date: 'сегодня', comment: data.liters + ' л' });
        st.finMonth.expense += data.sum;
        S.save();
        return 'Заправка записана: ' + data.liters + ' л, ' + fmtMoney(data.sum) + ', пробег ' + (data.km || st.car.mileage).toLocaleString('ru-RU') + ' км. Данные в «Авто → Заправки» и «Финансы».';
      }
    },
    event: {
      id: 'event',
      title: 'Важное событие',
      command: 'Важное событие',
      steps: [
        { key: 'title', ask: 'Как назвать событие? (например, «Забрать посылку»)', parse: (t) => (t && t.trim() ? t.trim() : null), err: 'Нужно название события.' },
        { key: 'when', ask: 'Когда? (например, «завтра в 18:00» или «30.09 в 09:00»)', parse: (t) => (t && t.trim() ? t.trim() : null), err: 'Укажите дату/время.' },
        { key: 'important', ask: 'Пометить как ВАЖНОЕ (да/нет)?', parse: yesno, err: 'Ответьте «да» или «нет».' },
        { key: 'confirm', ask: 'Создать событие «{title}» — {when}{imp}? (да/нет)', parse: yesno, err: 'Ответьте «да» или «нет».' }
      ],
      finish(data) {
        const important = data.important === 'yes';
        const when = parseWhen(data.when);
        const st = s();
        if (!Array.isArray(st.events)) st.events = [];
        const ev = {
          id: S.id('e'), title: data.title, date: when.date, time: when.time, end: '', allDay: false,
          place: '', importance: important ? 'важное' : 'обычная', repeat: 'none', desc: 'Создано через демо-сценарий Assistant'
        };
        st.events.unshift(ev);
        S.save();
        if (A && A.logAction) A.logAction({
          action: 'event.create', title: 'Событие создано', object: ev.title + ' · ' + ev.date + ' · ' + ev.time,
          objectType: 'event', undoable: true,
          changes: [{ field: 'Название', from: '—', to: ev.title }, { field: 'Дата/время', from: '—', to: ev.date + ' ' + ev.time },
                    { field: 'Важность', from: '—', to: ev.importance }],
          undo: { type: 'remove', list: 'events', id: ev.id }
        });
        return 'Событие «' + data.title + '» (' + data.when + ') ' + (important ? 'помечено как ВАЖНОЕ' : 'создано') + '. Оно видно в «Календаре», «Дне» и на Главной.';
      }
    }
  };

  function interpolate(text, data) {
    return String(text).replace(/\{(\w+)\}/g, (m, k) => {
      if (k === 'sum') return fmtMoney(data.sum != null ? data.sum : 0);
      if (k === 'imp') return data.important === 'yes' ? ', важное' : '';
      return data[k] != null ? data[k] : '';
    });
  }

  function isActive() { return !!active; }
  function currentFlow() { return active ? FLOWS[active.id] : null; }

  function start(id) {
    const f = FLOWS[id];
    if (!f) return null;
    active = { id, step: 0, data: {} };
    return { question: interpolate(f.steps[0].ask, active.data), flow: f };
  }

  /* вернуть { kind: 'next'|'done'|'cancel'|'error', text } */
  function advance(rawText) {
    if (!active) return null;
    const f = FLOWS[active.id];
    const step = f.steps[active.step];
    const text = (rawText == null ? '' : String(rawText)).trim();

    if (/^(отмен|cancel|стоп|stop|выход)/i.test(text)) { cancel(); return { kind: 'cancel', text: 'Сценарий «' + f.title + '» отменён. Ничего не записано.' }; }

    let val = step.parse(text);
    if (val === null || val === undefined) {
      if (step.optional && text === '') val = step.def ? step.def() : null;
      else return { kind: 'error', text: step.err };
    }
    if (typeof val === 'number') {
      if (step.min != null && val < step.min) return { kind: 'error', text: step.err + ' (слишком мало)' };
      if (step.max != null && val > step.max) return { kind: 'error', text: step.err + ' (слишком много)' };
    }
    active.data[step.key] = val;
    active.step += 1;

    if (active.step >= f.steps.length) {
      // последний шаг — подтверждение
      if (active.data.confirm === 'yes') {
        const out = f.finish(active.data);
        active = null;
        return { kind: 'done', text: out };
      }
      active = null;
      return { kind: 'cancel', text: 'Не подтверждено — ничего не записано.' };
    }
    return { kind: 'next', text: interpolate(f.steps[active.step].ask, active.data) };
  }

  function cancel() { active = null; }

  function listCommands() {
    return Object.keys(FLOWS).map((k) => ({ id: k, title: FLOWS[k].title, command: FLOWS[k].command }));
  }

  return { FLOWS, isActive, currentFlow, start, advance, cancel, listCommands };
})();
