/* Aven — Visual Prototype. Reusable Guided Tutorial / Tour engine.
   Только UX-прототип: декларативные шаги, подсветка UI и optional narration через существующий AvenVoice/AvenTTS.
   Не создаёт отдельную бизнес-логику задач/событий и не меняет voice/TTS infrastructure. */
window.AvenTutorial = (function () {
  const A = window.Aven;
  const S = window.AvenState;
  const s = () => S.s();

  const STORE_KEY = 'tutorials';
  const MOBILE_QUERY = '(max-width: 640px)';
  let active = null; // { id, step, previousFocus, navigating }
  let els = null;
  let resizeTimer = null;

  const defs = {
    home: {
      id: 'home', route: 'home', title: 'Главная',
      steps: [
        { target: 'home-hero', title: 'Aven как центр дня', text: 'Здесь Aven собирает ближайшие события, задачи и последние изменения. Картинка помощника — просто оформление: она ничего не меняет в ваших записях.' },
        { target: 'command-bar', title: 'Строка «Чем помочь?»', text: 'В эту строку можно написать короткую команду — например, «Что у меня сегодня?» или «Создай задачу купить масло на завтра». Она передаёт текст помощнику, который выполняет команду обычным путём. Полный список понятных фраз — в справке «Текстовые команды». Все разделы работают и без неё — мышью и кнопками.' },
        { target: 'home-summary', title: 'Карточки', text: 'Карточки показывают ваши задачи, календарь, расходы, авто, гарантии, заметки и уведомления. Измените что-то в разделе — и карточка обновится: это одни и те же данные.' },
        { target: 'quick-actions', title: 'Быстрые действия', text: 'Кнопки открывают обычные формы: добавить расход, задачу, событие или заметку. Всё, что вы создаёте, попадает в «Историю», и любое действие можно отменить.' }
      ]
    },
    tasks: {
      id: 'tasks', route: 'tasks', title: 'Задачи',
      steps: [
        { target: 'task-create', title: 'Создать задачу', text: 'Нажмите, чтобы открыть форму. Укажите название, при желании — описание, дату, срок, приоритет, теги и напоминание. Обязательно только название.' },
        { target: 'task-tabs', title: 'Вкладки', text: 'Вкладки помогают быстро найти нужное: активные, на сегодня, предстоящие, просроченные, выполненные и архив. Переключение вкладок ничего не меняет в задачах.' },
        { target: 'task-filters', title: 'Поиск и фильтры', text: 'Поиск, проект, приоритет и тег сужают список. Это тоже только просмотр — сами задачи не меняются и остаются общими для «Задач», «Дня» и «Главной».' },
        { target: 'task-list', title: 'Выполнить, изменить, удалить', text: 'Галочка отмечает задачу выполненной (и возвращает обратно), «Редактировать» меняет поля, «Удалить» спросит подтверждение. Любое из этих действий можно отменить в «Истории».' }
      ]
    },
    calendar: {
      id: 'calendar', route: 'calendar', title: 'Календарь',
      steps: [
        { target: 'calendar-create', title: 'Создать событие', text: 'Кнопка «＋ Событие» открывает форму. Новое событие сразу появится в календаре, в разделе «День» и на «Главной».' },
        { target: 'calendar-views', title: 'Месяц, список, неделя, день', text: 'Месяц удобен для обзора, список — для ближайших событий, неделя и день — чтобы сосредоточиться на одной дате. Это разные виды одних и тех же событий.' },
        { target: 'calendar-board', title: 'Выбор дня', text: 'Нажмите на день, чтобы его выбрать. Для события можно включить напоминание — оно появится в разделе «Уведомления». Оповещения при закрытой вкладке прототип не шлёт.' },
        { target: 'calendar-event-actions', title: 'Изменить и удалить', text: 'Нажмите на событие, чтобы открыть его, изменить или удалить с подтверждением. Изменения можно отменить в «Истории».' }
      ]
    },
    day: {
      id: 'day', route: 'day', title: 'День',
      steps: [
        { target: 'day-date', title: 'Выбор даты', text: 'Переключайтесь между вчера, сегодня и завтра или выберите любую дату. Меняется только то, что показано — сами записи остаются на месте.' },
        { target: 'day-summary', title: 'Сводка дня', text: 'Короткая сводка показывает, сколько на выбранный день событий, открытых и выполненных задач и что просрочено.' },
        { target: 'day-timeline', title: 'План дня', text: 'Здесь по времени собраны события и задачи выбранного дня — те же, что в «Календаре» и «Задачах».' },
        { target: 'day-tasks', title: 'Действия с задачами', text: 'Задачу прямо отсюда можно выполнить, вернуть или открыть на редактирование — как в разделе «Задачи».' },
        { target: 'day-attention', title: 'Требует внимания', text: 'Здесь показано срочное: просроченные задачи, документы авто и гарантии с близким сроком. Полный список — в разделе «Уведомления».' }
      ]
    },
    suggestions: {
      id: 'suggestions', route: 'home', title: 'Предложения Aven',
      steps: [
        { target: 'home-suggestions', title: 'Полезное следующее действие', text: 'Aven может предложить следующий шаг, если заметит что-то важное в ваших задачах, событиях, авто или покупках. Это простые локальные правила, а не скрытый анализ.' },
        { target: 'home-suggestions', title: 'Почему предложение появилось', text: 'Под каждым предложением указана конкретная причина: какие сроки, события или записи были учтены. Вы сами решаете, полезно ли предложение.' },
        { target: 'home-suggestions', title: 'Что произойдёт', text: 'Основная кнопка заранее говорит о результате: открыть нужный раздел или создать задачу через обычный механизм Aven.' },
        { target: 'home-suggestions', title: 'Выполнить действие', text: 'Нажмите основную кнопку, когда предложение подходит. Если создаётся запись, она появится в соответствующем разделе и в Истории.' },
        { target: 'home-suggestions', title: 'Отложить', text: 'Кнопка «Отложить» убирает предложение до следующего дня. После срока оно появится снова, только если причина всё ещё актуальна.' },
        { target: 'home-suggestions', title: 'Скрыть', text: 'Кнопка «Скрыть» больше не показывает это предложение. Скрытие можно отменить в разделе «История».' },
        { target: 'home-suggestions', title: 'Не уведомление', text: 'Уведомление сообщает, что что-то произошло или требует внимания. Предложение предлагает полезное действие. Поэтому эти блоки разделены.' }
      ]
    },
    notifications: {
      id: 'notifications', route: 'notifications', title: 'Уведомления',
      steps: [
        { target: 'notif-head', title: 'Центр уведомлений', text: 'Это одно место для всего, о чём стоит вспомнить. Aven сам собирает сюда пункты из ваших задач, событий, документов авто, гарантий и напоминаний.' },
        { target: 'notif-stats', title: 'Сколько всего', text: 'Вверху видно, сколько непрочитанных пунктов, сколько активных всего и сколько требуют внимания (просроченное и то, у чего скоро истекает срок).' },
        { target: 'notif-tabs', title: 'Как отфильтровать', text: 'Вкладки показывают активные, непрочитанные, пункты на сегодня, срочное, отложенные и скрытые. Это только просмотр.' },
        { target: 'notif-add', title: 'Своё напоминание', text: 'Кнопка «＋ Напоминание» создаёт собственную запись: о чём и на какую дату напомнить. Её можно изменить и удалить.' },
        { target: 'notif-list', title: 'Что можно сделать с пунктом', text: 'Пункт можно открыть в его разделе, отметить прочитанным, отложить на потом или скрыть. Любое из этих действий отменяется в «Истории».' },
        { target: 'notif-honest', title: 'Честно об ограничениях', text: 'Это уведомления внутри приложения. Пока вкладка закрыта, писем и push‑сообщений не будет — для этого нужен сервер. Какие источники показывать, настраивается в «Настройках».' }
      ]
    },
    notes: {
      id: 'notes', route: 'notes', title: 'Заметки',
      steps: [
        { target: 'notes-create', title: 'Создать заметку', text: 'Кнопка «＋ Заметка» открывает форму. Обязательно только название; текст, папку и теги можно добавить сразу или позже.' },
        { target: 'notes-filters', title: 'Найти нужное', text: 'Папка, тег и поиск сужают список. Это только просмотр: сами заметки не меняются. Вкладка «Архив» показывает то, что вы убрали с глаз.' },
        { target: 'notes-list', title: 'Закрепить и убрать в архив', text: 'Закреплённые заметки идут первыми и попадают на «Главную». Архив прячет заметку, но сохраняет её целиком. Оба действия отменяются в «Истории».' },
        { target: 'notes-editor', title: 'Текст сохраняется сам', text: 'Печатайте прямо в поле: через пару секунд после паузы текст сохранится, и появится подпись «сохранено». Прежний текст можно вернуть в «Истории».' }
      ]
    },
    finance: {
      id: 'finance', route: 'finance', title: 'Финансы',
      steps: [
        { target: 'finance-summary', title: 'Суммы вверху', text: 'Баланс, расходы и доходы месяца считаются из ваших операций и счетов прямо сейчас. Отдельных «итогов», которые могли бы разойтись с записями, нет.' },
        { target: 'finance-create', title: 'Записать трату или доход', text: 'Кнопка «＋ Операция» открывает форму: тип, сумма больше нуля, категория, счёт и дата. Название помогает вспомнить, за что платили.' },
        { target: 'finance-filters', title: 'Период, тип, категория, счёт', text: 'Фильтры показывают нужный срез: сегодня, неделя, месяц или всё. Итоги под фильтрами считаются по тому же срезу, что и список.' },
        { target: 'finance-list', title: 'Изменить, удалить, отменить', text: 'Операцию можно изменить или удалить; удаление спросит подтверждение. Суммы и баланс счёта пересчитаются, а действие останется в «Истории» с кнопкой «Отменить».' },
        { target: 'finance-refs', title: 'Счета и категории', text: 'Здесь можно добавить свои счета и категории. Удалить получится только те, которые нигде не используются, — иначе операции остались бы без принадлежности.' }
      ]
    },
    auto: {
      id: 'auto', route: 'auto', title: 'Автомобиль',
      steps: [
        { target: 'auto-head', title: 'Автомобиль и пробег', text: 'Вверху видно автомобиль, текущий пробег и сколько документов требуют внимания. Пробег можно обновить кнопкой «Пробег».' },
        { target: 'auto-actions', title: 'Что можно записать', text: 'Четыре вида записей: заправка, расход, обслуживание и документ. Литры и суммы должны быть больше нуля — иначе Aven подскажет, что поправить.' },
        { target: 'auto-tabs', title: 'Вкладки раздела', text: 'Обзор показывает итоги, остальные вкладки — списки записей и историю по автомобилю. Переключение вкладок ничего не меняет в данных.' },
        { target: 'auto-link', title: 'Связь с расходами', text: 'Заправка, расход и обслуживание могут сразу создать трату в «Финансах». Отмена уберёт и запись об автомобиле, и трату — половины не останется.' }
      ]
    },
    shopping: {
      id: 'shopping', route: 'shopping', title: 'Покупки и имущество',
      steps: [
        { target: 'shop-summary', title: 'Что у вас есть', text: 'Вверху — сколько вещей в собственности, их стоимость по цене покупки, сколько гарантий действует и сколько требуют внимания.' },
        { target: 'shop-create', title: 'Добавить покупку', text: 'Кнопка «＋ Покупка» открывает форму: название обязательно, остальное — цена, магазин, серийный номер, гарантия и заметка — по желанию.' },
        { target: 'shop-filters', title: 'Статус, категория, гарантия', text: 'Фильтры показывают нужный срез: например, только вещи с истекающей гарантией. Поиск ищет по названию, магазину и серийному номеру.' },
        { target: 'shop-list', title: 'Карточка вещи', text: 'Нажмите на карточку, чтобы открыть подробности: там можно записать ремонт, сменить статус, создать связанную трату или удалить запись — всё с возможностью отмены.' }
      ]
    },
    morning: {
      id: 'morning', route: 'morning', title: 'Утренний обзор',
      steps: [
        { target: 'daily-step-summary', title: 'Сводка дня', prepare: () => window.Aven.dailySetStep('morning', 'summary'),
          text: 'Первый шаг показывает дату и короткую сводку: сколько сегодня событий, открытых задач, что уже выполнено и есть ли просроченное. Это те же данные, что в «Задачах» и «Календаре».' },
        { target: 'daily-step-next', title: 'Ближайшее событие', prepare: () => window.Aven.dailySetStep('morning', 'next'),
          text: 'Второй шаг показывает ближайшее событие и все события этого дня. Кнопка «Открыть» ведёт к обычной карточке события в «Календаре».' },
        { target: 'daily-step-tasks', title: 'Задачи на сегодня', prepare: () => window.Aven.dailySetStep('morning', 'tasks'),
          text: 'Здесь задачи сегодняшнего дня. Их можно выполнить, вернуть или открыть. Отметка выполнения сразу видна в разделе «Задачи» и в «Дне», а отменить её можно в «Истории».' },
        { target: 'daily-step-attention', title: 'Что требует внимания', prepare: () => window.Aven.dailySetStep('morning', 'attention'),
          text: 'Просроченные задачи и важные уведомления собраны в одном шаге. Это факты и сроки, а не новые записи: полный список — в разделе «Уведомления».' },
        { target: 'daily-step-suggestions', title: 'Предложения Aven', prepare: () => window.Aven.dailySetStep('morning', 'suggestions'),
          text: 'Предложения — это следующий полезный шаг с указанной причиной. Их можно выполнить, отложить или скрыть; они не дублируют уведомления.' },
        { target: 'daily-controls', title: 'Переход в «День»', prepare: () => window.Aven.dailySetStep('morning', 'finish'),
          text: 'Кнопка «Завершить и открыть День» заканчивает обзор и переводит в рабочий раздел «День». Обзор можно пропустить в любой момент — ничего не блокируется.' }
      ]
    },
    evening: {
      id: 'evening', route: 'evening', title: 'Итоги дня',
      steps: [
        { target: 'daily-step-summary', title: 'Итоги', prepare: () => window.Aven.dailySetStep('evening', 'summary'),
          text: 'Первый шаг показывает, сколько задач выполнено и осталось, что просрочено и какие события прошли. Только фактические данные, без оценок дня.' },
        { target: 'daily-step-completed', title: 'Выполненное', prepare: () => window.Aven.dailySetStep('evening', 'completed'),
          text: 'Список задач, отмеченных выполненными в этот день. Если отметка была ошибочной, кнопка «Вернуть» снова откроет задачу.' },
        { target: 'daily-step-remaining', title: 'Оставшееся', prepare: () => window.Aven.dailySetStep('evening', 'remaining'),
          text: 'Незакрытые задачи дня, просроченное и важные уведомления. Отсюда удобно решить, что сделать сейчас, а что перенести.' },
        { target: 'daily-step-remaining', title: 'Перенос на завтра', prepare: () => window.Aven.dailySetStep('evening', 'remaining'),
          text: 'Кнопка «На завтра» меняет дату и срок задачи обычным способом. Новая дата сразу появится в «Задачах», «Дне» и «Календаре», а «История» вернёт прежнюю.' },
        { target: 'daily-step-tomorrow', title: 'Завтра', prepare: () => window.Aven.dailySetStep('evening', 'tomorrow'),
          text: 'Шаг «Завтра» показывает уже запланированные события и задачи. Можно добавить задачу на завтра или сразу открыть завтрашний «День».' },
        { target: 'daily-controls', title: 'Завершение', prepare: () => window.Aven.dailySetStep('evening', 'finish'),
          text: 'Кнопка «Завершить и открыть День» подводит итоги и переводит в «День». Вернуться к итогам можно позже — сценарий ничего не блокирует.' }
      ]
    },
    commands: {
      id: 'commands', route: 'assistant', title: 'Текстовые команды',
      steps: [
        { target: 'command-input', title: 'Где писать команду', text: 'Это поле помощника. Напишите сюда короткую фразу и нажмите Enter или стрелку. Мышь не обязательна: до поля, примеров и кнопки можно дойти клавишей Tab.' },
        { target: 'command-examples', title: 'Примеры вместо угадывания', text: 'Нажмите на любой пример — он подставится в поле, и вы увидите, что именно будет отправлено. Текст можно поправить перед отправкой: сам по себе пример ничего не меняет.' },
        { target: 'command-chat', title: 'Спросите про день', text: 'Начните с безопасного вопроса: «Что у меня сегодня?». Aven ответит по вашим настоящим записям — тем же событиям и задачам, что показывают «День» и «Календарь». Вопрос ничего не меняет.' },
        { target: 'command-chat', title: 'Создайте задачу одной фразой', text: 'Теперь попробуйте: «Создай задачу купить масло на завтра». Aven создаст обычную задачу — такую же, как через форму. Ответ скажет, что именно создано и на какую дату.' },
        { target: 'command-chat', title: 'Проверьте в обычном разделе', text: 'После команды откройте «Задачи» или «День» — новая задача уже там. Отдельных «командных» записей не бывает: это одни и те же данные во всех разделах.' },
        { target: 'command-chat', title: 'Запишите заметку одной фразой', text: 'Попробуйте: «Создай заметку купить фильтр для машины». Текст после слова «заметку» целиком становится содержимым заметки — даже если внутри есть похожие на другие команды слова, вроде «встреча» или «расход». Это обычная заметка, как через форму.' },
        { target: 'command-chat', title: 'Найдите заметку через помощника', text: 'Фраза «Покажи заметки про машину» найдёт только что созданную заметку и покажет её текст. Поиск ничего не меняет — это просто быстрый способ посмотреть. Откройте «Заметки», чтобы увидеть её и там же.' },
        { target: 'command-chat', title: 'Выберите нужную задачу', text: 'Если под фразу «Отметь отчёт выполненным» подходят две задачи, Aven покажет обе с датами. Нажмите нужный вариант или ответьте «первая», «вторая», «1» либо «2». До выбора ничего не изменится.' },
        { target: 'command-chat', title: 'Проверьте перед подтверждением', text: 'Если Aven нашла запись только по части названия, она покажет конкретное действие и кнопки «Подтвердить» и «Отмена». Подтверждение выполняет действие один раз; «нет», «отмена» или Escape не меняют данные и не добавляют запись в «Историю».' },
        { target: 'command-limits', title: 'Отмена и ограничения', text: 'После выполненной команды работает обычная кнопка «Отменить» в «Истории» — это касается и заметок. Временный выбор забывается после ответа, отказа, новой команды или выхода из Assistant. Удаление, расходы, напоминания, перенос событий и изменение уже существующих заметок текстом пока не поддерживаются.' }
      ]
    },
    settings: {
      id: 'settings', route: 'settings', title: 'Настройки под себя',
      steps: [
        { target: 'settings-profile', title: 'Зачем сюда заходить', prepare: () => window.Aven.openSettingsCat('profile'),
          text: 'Сценарий простой: вы приехали в другой город, начали считать деньги в другой валюте — и хотите, чтобы Aven показывал всё привычно. Всё это задаётся здесь, в «Профиле», один раз.' },
        { target: 'settings-profile', title: 'Как к вам обращаться', prepare: () => window.Aven.openSettingsCat('profile'),
          text: 'Поменяйте «Имя» или «Обращение» и уйдите с поля — Aven сразу начнёт здороваться по-новому на «Главной». Отдельной кнопки «Сохранить» нет: значение сохраняется, как только вы перестаёте печатать.' },
        { target: 'settings-profile', title: 'Валюта, дата и время', prepare: () => window.Aven.openSettingsCat('profile'),
          text: 'Выберите валюту — и все суммы в расходах, авто и покупках пересчитаются в её обозначение. Формат даты и времени меняет вид дат везде: в календаре, «Дне», уведомлениях и истории. Внизу карточки показан живой пример.' },
        { target: 'settings-profile', title: 'Начало недели и часовой пояс', prepare: () => window.Aven.openSettingsCat('profile'),
          text: '«Начало недели» меняет первый столбец в календаре. «Часовой пояс» определяет, который сейчас час: от него зависит приветствие и то, предложит ли Aven утренний обзор или итоги дня. Уже записанное время событий при этом не сдвигается.' },
        { target: 'settings-aven', title: 'Когда у вас утро и вечер', prepare: () => window.Aven.openSettingsCat('aven'),
          text: 'Если вы встаёте в шесть, поставьте «Утро» на 06:00 — и утренний обзор начнёт предлагаться раньше. Границы должны идти по возрастанию: утро, день, вечер, ночь. Если перепутать, Aven не сохранит значение и объяснит почему.' },
        { target: 'settings-aven', title: 'Если передумали', prepare: () => window.Aven.openSettingsCat('aven'),
          text: 'Каждое изменение записано в «Историю» строкой «было → стало». Откройте «Историю», нажмите «Отменить» — прежнее значение вернётся, и экран обновится сам. Ничего не нужно вспоминать и вводить заново.' }
      ]
    },
    profile: {
      id: 'profile', route: 'profile', title: 'Профиль',
      steps: [
        { target: 'profile-fields', title: 'Ваши данные', text: 'Здесь то же, что в Настройках → Профиль: имя, обращение и город. Измените в одном месте — увидите в другом, потому что это одни и те же данные, а не две копии.' },
        { target: 'profile-formats', title: 'Как показывать данные', text: 'Валюта, часовой пояс, форматы даты и времени, день начала недели. Пример под полями сразу показывает, как это будет выглядеть в остальных разделах.' },
        { target: 'profile-formats', title: 'Проверьте на своём примере', text: 'Поменяйте формат времени на 12 часов и загляните в «Календарь»: время событий покажется с AM и PM. Само событие при этом не изменилось — изменился только способ показа.' },
        { target: 'profile-fields', title: 'Что здесь не меняется', text: 'Почта показана, но не редактируется: адрес входа, пароль и подтверждение по второму фактору относятся к безопасности и живут в Настройках → Безопасность.' }
      ]
    },
    help: {
      id: 'help', route: 'help', title: 'Помощь',
      steps: [
        { target: 'help-search', title: 'Поиск по Help', text: 'Поиск локальный и быстрый: ищет по заголовкам, ключевым словам и текстам статей без AI и внешних сервисов.' },
        { target: 'help-categories', title: 'Категории', text: 'Категории сгруппированы по существующим возможностям: старт, Главная, задачи, календарь, день, команды, голос, FAQ и доступность.' },
        { target: 'help-results', title: 'Материалы и обучение', text: 'Из Help можно открыть релевантную статью, запустить tutorial для раздела или прослушать текст, если голос включён.' }
      ]
    }
  };

  function store() {
    const st = s();
    if (!st[STORE_KEY]) st[STORE_KEY] = { voice: false, progress: {}, completed: {} };
    st[STORE_KEY].progress = st[STORE_KEY].progress || {};
    st[STORE_KEY].completed = st[STORE_KEY].completed || {};
    return st[STORE_KEY];
  }
  function save() { if (S && S.save) S.save(); }
  function isMobile() {
    try { return window.matchMedia && window.matchMedia(MOBILE_QUERY).matches; }
    catch (e) { return window.innerWidth <= 640; }
  }
  function currentRoute() { return (location.hash || '#/home').replace(/^#\//, '') || 'home'; }
  function targetSelector(name) { return '[data-tour="' + String(name || '').replace(/"/g, '') + '"]'; }
  function stepDef() { return active && defs[active.id] && defs[active.id].steps[active.step]; }

  function textForSpeech(step) {
    if (!step) return '';
    return step.title + '. ' + step.text;
  }
  function stopVoice() {
    try { if (window.AvenVoice && window.AvenVoice.stop) window.AvenVoice.stop(); }
    catch (e) { /* narration is optional */ }
  }
  function speakStep() {
    const st = store();
    const step = stepDef();
    if (!active || !st.voice || !step) return false;
    stopVoice();
    try {
      if (window.AvenVoice && window.AvenVoice.speak) return !!window.AvenVoice.speak(textForSpeech(step), null);
    } catch (e) { /* TTS failure must not break tutorial */ }
    return false;
  }

  function ensureEls() {
    if (els && document.body.contains(els.layer)) return els;
    const layer = document.createElement('div');
    layer.className = 'tour-layer';
    layer.innerHTML = '<div class="tour-scrim" aria-hidden="true"></div><div class="tour-pop" role="dialog" aria-modal="false" aria-live="polite"></div>';
    document.body.appendChild(layer);
    layer.querySelector('.tour-scrim').addEventListener('click', () => close());
    document.body.classList.add('tour-open');
    els = { layer, pop: layer.querySelector('.tour-pop') };
    return els;
  }
  function clearTarget() {
    document.querySelectorAll('.tour-target-active').forEach((el) => el.classList.remove('tour-target-active'));
  }
  function cleanup(removeCompletion) {
    stopVoice();
    clearTarget();
    if (els && els.layer && els.layer.parentNode) els.layer.parentNode.removeChild(els.layer);
    document.body.classList.remove('tour-open');
    els = null;
    window.removeEventListener('resize', onResize);
    document.removeEventListener('keydown', onKey);
    const prev = active && active.previousFocus;
    active = null;
    if (removeCompletion === true) return;
    try { if (prev && document.contains(prev)) prev.focus(); } catch (e) { /* noop */ }
  }
  function onResize() {
    clearTimeout(resizeTimer);
    resizeTimer = setTimeout(render, 80);
  }
  function onKey(e) {
    if (!active) return;
    if (e.key === 'Escape') { e.preventDefault(); close(); }
    if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); prev(); }
  }
  window.addEventListener('hashchange', () => {
    if (!active) return;
    if (active.navigating) { active.navigating = false; setTimeout(render, 180); return; }
    close();
  });

  function placePopover(target) {
    if (!els) return;
    const pop = els.pop;
    pop.classList.toggle('tour-pop-mobile', isMobile());
    if (isMobile() || !target) {
      pop.style.left = '12px';
      pop.style.right = '12px';
      pop.style.top = 'auto';
      pop.style.bottom = '12px';
      pop.style.maxWidth = 'none';
      return;
    }
    const r = target.getBoundingClientRect();
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    const pw = Math.min(380, Math.max(300, pop.offsetWidth || 340));
    const ph = Math.min(320, pop.offsetHeight || 220);
    let left = r.left + Math.min(r.width / 2, 160) + 18;
    let top = r.top;
    if (left + pw + 16 > vw) left = r.left - pw - 18;
    if (left < 12) left = Math.min(vw - pw - 12, 12);
    if (top + ph + 16 > vh) top = Math.max(12, vh - ph - 16);
    pop.style.left = Math.round(left) + 'px';
    pop.style.right = 'auto';
    pop.style.top = Math.round(top) + 'px';
    pop.style.bottom = 'auto';
    pop.style.maxWidth = pw + 'px';
  }

  function render() {
    if (!active) return;
    const def = defs[active.id];
    const step = def && def.steps[active.step];
    if (!def || !step) return close();
    const ui = ensureEls();
    /* Шаг может подготовить экран (например, открыть нужный шаг дневного сценария).
       Это не бизнес-логика: обучение только переключает представление. */
    if (typeof step.prepare === 'function') { try { step.prepare(); } catch (e) { /* обучение не должно ломать страницу */ } }
    clearTarget();
    const target = document.querySelector(targetSelector(step.target));
    if (target) {
      target.classList.add('tour-target-active');
      try { target.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'smooth' }); } catch (e) { /* jsdom */ }
    }
    const total = def.steps.length;
    const st = store();
    const canPrev = active.step > 0;
    const isLast = active.step >= total - 1;
    ui.pop.innerHTML = `
      <div class="tour-kicker">Обучение · ${A.esc(def.title)} · шаг ${active.step + 1}/${total}</div>
      <h3>${A.esc(step.title)}</h3>
      <p>${A.esc(step.text)}</p>
      ${target ? '' : '<div class="tour-missing">Этот элемент сейчас не виден. Можно продолжить обучение: engine не ломает страницу при missing target.</div>'}
      <div class="tour-controls" aria-label="Управление обучением">
        <button class="btn small" data-action="tour-prev" ${canPrev ? '' : 'disabled'}>← Назад</button>
        ${isLast ? '<button class="btn primary small" data-action="tour-finish">Готово</button>' : '<button class="btn primary small" data-action="tour-next">Далее →</button>'}
        <button class="btn small" data-action="tour-skip">Пропустить</button>
      </div>
      <div class="tour-voice">
        <button class="btn small" data-action="tour-voice" aria-pressed="${st.voice ? 'true' : 'false'}">${st.voice ? '🔊 Голос: вкл' : '🔇 Голос: выкл'}</button>
        <button class="btn small" data-action="tour-repeat">Повторить</button>
        <button class="btn small" data-action="tour-stop">Стоп</button>
        <button class="icon-btn" data-action="tour-close" aria-label="Закрыть обучение">✕</button>
      </div>`;
    placePopover(target);
    st.progress[active.id] = active.step;
    save();
    const focus = ui.pop.querySelector(isLast ? '[data-action="tour-finish"]' : '[data-action="tour-next"]');
    try { focus && focus.focus(); } catch (e) { /* noop */ }
    speakStep();
  }

  function start(id, opts) {
    const def = defs[id];
    if (!def) return false;
    close(false);
    const st = store();
    const restart = opts && opts.restart;
    const saved = Number(st.progress[id] || 0);
    active = {
      id,
      step: restart ? 0 : Math.max(0, Math.min(saved, def.steps.length - 1)),
      previousFocus: document.activeElement,
      navigating: false
    };
    window.addEventListener('resize', onResize);
    document.addEventListener('keydown', onKey);
    const route = currentRoute();
    if (def.route && route !== def.route) {
      active.navigating = true;
      location.hash = '#/' + def.route;
      setTimeout(render, 260);
    } else render();
    return true;
  }
  function next() {
    if (!active) return;
    const def = defs[active.id];
    stopVoice();
    active.step = Math.min(active.step + 1, def.steps.length - 1);
    render();
  }
  function prev() {
    if (!active) return;
    stopVoice();
    active.step = Math.max(active.step - 1, 0);
    render();
  }
  function finish() {
    if (!active) return;
    const st = store();
    st.completed[active.id] = true;
    st.progress[active.id] = 0;
    save();
    A && A.toast && A.toast('Обучение завершено: ' + (defs[active.id] && defs[active.id].title));
    close(false);
  }
  function skip() {
    if (!active) return;
    const st = store();
    st.progress[active.id] = 0;
    save();
    A && A.toast && A.toast('Обучение пропущено — можно запустить позже из Help');
    close(false);
  }
  function close(showToast) {
    if (!active) return;
    cleanup(false);
    if (showToast !== false && A && A.toast) A.toast('Обучение закрыто');
  }
  function toggleVoice() {
    const st = store();
    st.voice = !st.voice;
    save();
    if (!st.voice) stopVoice();
    render();
  }
  function repeat() { speakStep(); }

  /* tourId позволяет разделить категорию Help и идентификатор обучения
     (например, справка «Утро и вечер» — обучение «Утренний обзор»). */
  A.helpActions = function (topic, tourId) {
    const id = A.esc(topic || 'home');
    const tour = A.esc(tourId || topic || 'home');
    return `<div class="context-help btn-row" data-tour="context-help">
      <button class="btn small" data-action="help-topic" data-topic="${id}">? Справка</button>
      <button class="btn small" data-action="tutorial-start" data-tour-id="${tour}">▶ Обучение</button>
    </div>`;
  };

  A.register({
    'tutorial-start': (el) => start(el.dataset.tourId || el.dataset.id || 'home', { restart: true }),
    'tour-next': () => next(),
    'tour-prev': () => prev(),
    'tour-finish': () => finish(),
    'tour-skip': () => skip(),
    'tour-close': () => close(),
    'tour-voice': () => toggleVoice(),
    'tour-repeat': () => repeat(),
    'tour-stop': () => stopVoice()
  });

  return {
    definitions: defs,
    start, next, prev, finish, skip, close,
    isActive: () => !!active,
    current: () => active ? { id: active.id, step: active.step } : null,
    store
  };
})();
