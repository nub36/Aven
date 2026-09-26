/* Aven — Visual Prototype. Presence: единая точка ОТОБРАЖЕНИЯ состояния Aven
   (idle / listening / thinking / preparing / speaking / waiting / success / important).
   Это НЕ второй state engine: состояние выводится из существующих подсистем —
   TTS (voice.js), STT (voice.js), демо state machine (flows.js), Assistant.
   Здесь только честная презентация состояния текстом + классами для glow/wave.
   Не production. */
window.AvenPresence = (function () {
  const LABELS = {
    idle: 'Готова',
    listening: 'Слушаю…',
    thinking: 'Думаю…',
    preparing: 'Готовлю речь…',
    speaking: 'Говорю…',
    waiting: 'Жду ответа…',
    success: 'Готово',
    important: 'Важное событие'
  };

  let cur = 'idle';
  let curLabel = null; // точная подпись вместо LABELS[cur] (например «Говорю · Natural» — TTS знает источник голоса)
  let timer = null;

  function apply() {
    document.querySelectorAll('.aven-state').forEach((el) => {
      el.textContent = '● ' + (curLabel || LABELS[cur]);
      el.dataset.state = cur;
    });
    const hero = document.querySelector('.hero');
    if (hero) hero.dataset.state = cur;
    document.body.dataset.avenState = cur;
  }

  /* opts.hold — миллисекунды, после которых состояние вернётся в idle;
     opts.label — точная подпись состояния (честный источник голоса: «Говорю · Natural» /
     «Говорю · системный голос»), сбрасывается при следующем set() */
  function set(st, opts) {
    if (!LABELS[st]) st = 'idle';
    if (timer) { clearTimeout(timer); timer = null; }
    cur = st;
    curLabel = (opts && opts.label) || null;
    apply();
    const hold = opts && opts.hold;
    if (hold) timer = setTimeout(() => { cur = 'idle'; curLabel = null; apply(); }, hold);
  }

  function flash(st, hold) { set(st, { hold: hold || 2600 }); }

  return { set, flash, apply, get: () => cur, LABELS };
})();
