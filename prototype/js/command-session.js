/* Aven — transient multi-step command flow (Stage 2, iteration 2).
   DOM-free orchestration only: clarification/confirmation context is kept in this
   object, never in AvenState/localStorage. Business mutations remain in AvenCommand
   → AvenActions; this layer never writes History. */
window.AvenCommandSession = (function () {
  const Engine = () => window.AvenCommand;
  const CANCEL_RX = /^(?:нет|не надо|отмена|отмени|отменить|cancel)$/i;
  const CONFIRM_RX = /^(?:да|подтвердить|подтверждаю|выполнить|продолжить)$/i;
  const ORDINALS = {
    '1': 0, 'первая': 0, 'первую': 0, 'первый': 0, 'первое': 0,
    '2': 1, 'вторая': 1, 'вторую': 1, 'второй': 1, 'второе': 1,
    '3': 2, 'третья': 2, 'третью': 2, 'третий': 2, 'третье': 2,
    '4': 3, 'четвертая': 3, 'четвертую': 3, 'четвертый': 3, 'четвертое': 3
  };

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function trim(text) { return String(text == null ? '' : text).trim(); }
  function baseContext(ctx) {
    const made = Engine().context(ctx || {});
    return { todayISO: made.todayISO, nowHM: made.nowHM, source: made.source, surface: made.surface };
  }
  function candidateLabel(c) {
    const C = window.AvenActions;
    const bits = [c.title];
    if (c.dateISO || c.due) bits.push(C.dates.dateLabel(c.dateISO || c.due));
    if (c.time) bits.push(C.format.time(c.time));
    bits.push(c.status === 'completed' ? 'выполнена' : 'открыта');
    return bits.join(' · ');
  }
  function clarificationResponse(candidates) {
    return 'Нашла несколько подходящих задач. Уточните выбор: ' +
      candidates.map((c, i) => (i + 1) + '. ' + candidateLabel(c)).join('; ') + '. Пока ничего не изменилось.';
  }

  function create(defaultContext) {
    let pending = null;
    let busy = false;
    const defaults = defaultContext || {};

    function snapshot() { return pending ? clone(pending) : null; }
    function clear() { pending = null; busy = false; }
    function cancelled(reason) {
      clear();
      return { ok: false, status: 'cancelled', response: reason || 'Действие отменено. Ничего не изменилось.', pending: null };
    }
    function setFromResult(intent, result, context) {
      if (result.status === 'ambiguous') {
        pending = {
          type: 'clarification', intent: clone(intent), context: clone(context),
          candidates: clone(result.candidates || [])
        };
        return {
          ok: false, status: 'clarification_required', intent, result,
          response: clarificationResponse(pending.candidates), candidates: clone(pending.candidates), pending: snapshot()
        };
      }
      if (result.status === 'confirmation_required') {
        pending = {
          type: 'confirmation', intent: clone(intent), context: clone(context),
          targetId: result.target && result.target.id,
          targetTitle: result.target && result.target.title,
          summary: result.summary
        };
        return {
          ok: false, status: 'confirmation_required', intent, result,
          response: result.summary, summary: result.summary, pending: snapshot()
        };
      }
      return { ok: !!result.ok, status: result.status, intent, result, response: Engine().respond(result), pending: null };
    }
    function start(text, suppliedContext) {
      clear();
      const context = baseContext(Object.assign({}, defaults, suppliedContext || {}));
      const parsed = Engine().parse(text, context);
      if (!parsed.ok) return { ok: false, status: 'unsupported', intent: parsed, result: null, response: Engine().respondToParseError(parsed), pending: null };
      const result = Engine().execute(parsed, context);
      return setFromResult(parsed, result, context);
    }
    function findChoice(text, candidates) {
      const n = Engine().normalize(text);
      if (Object.prototype.hasOwnProperty.call(ORDINALS, n)) {
        const index = ORDINALS[n];
        return index < candidates.length ? index : -1;
      }
      const exact = candidates.map((c) => Engine().normalize(c.title)).reduce((hits, title, index) => {
        if (title === n) hits.push(index);
        return hits;
      }, []);
      return exact.length === 1 ? exact[0] : -1;
    }
    function choose(index) {
      if (!pending || pending.type !== 'clarification') {
        return { ok: false, status: 'no_pending', response: 'Сейчас нечего выбирать.', pending: null };
      }
      if (busy) return { ok: false, status: 'busy', response: 'Действие уже обрабатывается.', pending: snapshot() };
      const flow = pending;
      const candidate = flow.candidates[index];
      if (!candidate) return {
        ok: false, status: 'invalid_clarification', response: clarificationResponse(flow.candidates),
        candidates: clone(flow.candidates), pending: snapshot()
      };
      /* Очистить ДО execute: повторный click/Enter уже не увидит pending flow. */
      pending = null; busy = true;
      const result = Engine().execute(flow.intent, Object.assign({}, flow.context, {
        targetId: candidate.id, expectedTitle: candidate.title, selected: true
      }));
      busy = false;
      if (result.status === 'confirmation_required') return setFromResult(flow.intent, result, flow.context);
      return { ok: !!result.ok, status: result.status, intent: flow.intent, result, response: Engine().respond(result), pending: null };
    }
    function confirm() {
      if (!pending || pending.type !== 'confirmation') {
        return { ok: false, status: 'no_pending', response: 'Сейчас нет действия, которое нужно подтвердить.', pending: null };
      }
      if (busy) return { ok: false, status: 'busy', response: 'Действие уже обрабатывается.', pending: snapshot() };
      const flow = pending;
      pending = null; busy = true;
      const result = Engine().execute(flow.intent, Object.assign({}, flow.context, {
        targetId: flow.targetId, expectedTitle: flow.targetTitle, confirmed: true
      }));
      busy = false;
      return { ok: !!result.ok, status: result.status, intent: flow.intent, result, response: Engine().respond(result), pending: null };
    }
    function submit(text, suppliedContext) {
      const value = trim(text);
      if (!pending) return start(value, suppliedContext);
      const normalized = Engine().normalize(value);
      if (CANCEL_RX.test(normalized)) return cancelled();
      if (pending.type === 'confirmation' && CONFIRM_RX.test(normalized)) return confirm();

      /* Явно распознанная новая команда всегда выигрывает у старого flow. */
      const context = baseContext(Object.assign({}, defaults, suppliedContext || {}));
      const independent = Engine().parse(value, context);
      if (independent.ok) return start(value, suppliedContext);
      /* Понятная, но неподдержанная новая команда не должна случайно стать ответом
         старому flow. Старый context сбрасывается, показывается честное ограничение. */
      if (independent.error && String(independent.error.code || '').indexOf('UNSUPPORTED_') === 0) {
        clear();
        return { ok: false, status: 'unsupported', intent: independent, result: null,
          response: Engine().respondToParseError(independent), pending: null };
      }

      if (pending.type === 'clarification') {
        const index = findChoice(value, pending.candidates);
        if (index >= 0) return choose(index);
        return {
          ok: false, status: 'invalid_clarification', intent: independent, result: null,
          response: 'Не поняла, какой вариант вы выбрали. ' + clarificationResponse(pending.candidates),
          candidates: clone(pending.candidates), pending: snapshot()
        };
      }
      return {
        ok: false, status: 'confirmation_required', intent: independent, result: null,
        response: 'Ответьте «Подтвердить» или «Отмена». ' + pending.summary,
        summary: pending.summary, pending: snapshot()
      };
    }

    return {
      submit, choose, confirm,
      cancel: () => pending ? cancelled() : { ok: false, status: 'no_pending', response: 'Сейчас нечего отменять.', pending: null },
      reset: clear, pending: snapshot
    };
  }
  return { create };
})();
