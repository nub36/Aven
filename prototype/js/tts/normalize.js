/* Aven prototype — нормализация текста ДЛЯ РЕЧИ (docs/TTS_RESEARCH.md §6).
 *
 * Экранный текст НЕ меняется: normalize() возвращает отдельную строку speechText,
 * которая уходит только в TTS. Работает в браузере (window.AvenSpeechText) и в Node
 * (module.exports) — тесты: node research/tts/normalize.test.js
 *
 * Поддерживается (именительный/винительный падеж, как в типовых ответах Aven):
 *   время 9:30 / 14:00, даты 25.09.2026 и «25 сентября», деньги 3 420 ₽ / руб. / 3 420,50 ₽,
 *   км, км/ч, л, %, °C, кг, мин, ч, десятичные дроби, обычные числа до миллиардов,
 *   словарь произношения (Aven → Авен), сокращения (т.е., и т.д.).
 * Ограничение: косвенные падежи числительных («к 3 часам», «более 5 литров»)
 * не согласуются — число читается в именительном падеже.
 */
(function (root) {
  'use strict';

  var LEXICON = [
    [/(?<![A-Za-zА-Яа-яЁё0-9_])Aven(?![A-Za-zА-Яа-яЁё0-9_])/g, 'Авен'],          // произношение имени — решение владельца (Авен / Эйвен)
    [/(?<![A-Za-zА-Яа-яЁё0-9_])т\.\s?е\./gi, 'то есть'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])и т\.\s?д\./gi, 'и так далее'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])и т\.\s?п\./gi, 'и тому подобное'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])т\.\s?к\./gi, 'так как'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])(?:OK|ОК)(?![A-Za-zА-Яа-яЁё0-9_])/g, 'окей'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])AI(?![A-Za-zА-Яа-яЁё0-9_])/g, 'эй-ай'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])GPS(?![A-Za-zА-Яа-яЁё0-9_])/g, 'джи-пи-эс'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])SMS(?![A-Za-zА-Яа-яЁё0-9_])/gi, 'эс-эм-эс'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])PIN(?![A-Za-zА-Яа-яЁё0-9_])/g, 'пин'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])АЗС(?![A-Za-zА-Яа-яЁё0-9_])/g, 'заправка'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])ОСАГО(?![A-Za-zА-Яа-яЁё0-9_])/g, 'осаго'],
    [/(?<![A-Za-zА-Яа-яЁё0-9_])КАСКО(?![A-Za-zА-Яа-яЁё0-9_])/g, 'каско']
  ];

  var ONES = {
    m: ['ноль', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
    f: ['ноль', 'одна', 'две', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'],
    n: ['ноль', 'одно', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять']
  };
  var TEENS = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать',
    'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  var TENS = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят',
    'восемьдесят', 'девяносто'];
  var HUNDREDS = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот',
    'восемьсот', 'девятьсот'];
  var SCALES = [
    { g: 'f', forms: ['тысяча', 'тысячи', 'тысяч'] },
    { g: 'm', forms: ['миллион', 'миллиона', 'миллионов'] },
    { g: 'm', forms: ['миллиард', 'миллиарда', 'миллиардов'] }
  ];

  /** Форма существительного после числа: 1 час, 2 часа, 5 часов (11–14 → 5). */
  function plural(n, forms) {
    n = Math.abs(n) % 100;
    if (n >= 11 && n <= 14) return forms[2];
    var d = n % 10;
    if (d === 1) return forms[0];
    if (d >= 2 && d <= 4) return forms[1];
    return forms[2];
  }

  function triad(n, g) {
    var out = [];
    var h = Math.floor(n / 100), t = Math.floor((n % 100) / 10), o = n % 10;
    if (h) out.push(HUNDREDS[h]);
    if (t === 1) { out.push(TEENS[o]); return out; }
    if (t) out.push(TENS[t]);
    if (o) out.push(ONES[g][o]);
    return out;
  }

  /** Число прописью (целое ≥ 0). g: 'm' | 'f' | 'n' — род единиц. */
  function numberToWords(num, g) {
    g = g || 'm';
    num = Math.floor(Math.abs(Number(num)));
    if (!isFinite(num)) return String(num);
    if (num === 0) return 'ноль';
    if (num >= 1e12) return String(num).split('').map(function (d) { return ONES.m[+d]; }).join(' ');
    var parts = [];
    var scaleIdx = -1;
    var groups = [];
    while (num > 0) { groups.push(num % 1000); num = Math.floor(num / 1000); }
    for (var i = groups.length - 1; i >= 0; i--) {
      var v = groups[i];
      if (!v) continue;
      if (i === 0) { parts = parts.concat(triad(v, g)); continue; }
      scaleIdx = i - 1;
      var sc = SCALES[scaleIdx];
      parts = parts.concat(triad(v, sc.g));
      parts.push(plural(v, sc.forms));
    }
    return parts.join(' ');
  }

  // Порядковые (для дат): день — средний род им. п. («двадцать пятое»), год — род. п. («шестого года»)
  var ORD_N = ['', 'первое', 'второе', 'третье', 'четвёртое', 'пятое', 'шестое', 'седьмое', 'восьмое',
    'девятое', 'десятое', 'одиннадцатое', 'двенадцатое', 'тринадцатое', 'четырнадцатое', 'пятнадцатое',
    'шестнадцатое', 'семнадцатое', 'восемнадцатое', 'девятнадцатое', 'двадцатое'];
  var ORD_TENS_N = { 20: 'двадцатое', 30: 'тридцатое' };
  var ORD_GEN = ['', 'первого', 'второго', 'третьего', 'четвёртого', 'пятого', 'шестого', 'седьмого',
    'восьмого', 'девятого', 'десятого', 'одиннадцатого', 'двенадцатого', 'тринадцатого',
    'четырнадцатого', 'пятнадцатого', 'шестнадцатого', 'семнадцатого', 'восемнадцатого',
    'девятнадцатого'];
  var ORD_TENS_GEN = ['', '', 'двадцатого', 'тридцатого', 'сорокового', 'пятидесятого',
    'шестидесятого', 'семидесятого', 'восьмидесятого', 'девяностого'];
  var MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа',
    'сентября', 'октября', 'ноября', 'декабря'];

  // после «до / с / от / после / около / до конца» день читается в родительном падеже
  var GEN_PREP = /(?:^|[\s(])(?:до|с|со|от|после|около|кроме|из-за)\s+$/i;

  function dayOrdinal(d, gen) {
    if (gen) return d < 20 ? ORD_GEN[d] : (d % 10 ? TENS[Math.floor(d / 10)] + ' ' + ORD_GEN[d % 10] : ORD_TENS_GEN[d / 10]);
    if (d <= 20) return ORD_N[d];
    if (ORD_TENS_N[d]) return ORD_TENS_N[d];
    return TENS[Math.floor(d / 10)] + ' ' + ORD_N[d % 10];
  }

  function yearOrdinalGen(y) {
    // 2026 → «две тысячи двадцать шестого»; 2000 → «двухтысячного»; 1990 → «тысяча девятьсот девяностого»
    if (y === 2000) return 'двухтысячного';
    var head = y - (y % 100), tail = y % 100;
    var words;
    if (tail === 0) {
      return numberToWords(head - (head % 1000)) + ' ' + ({ 1: 'сотого', 2: 'двухсотого', 9: 'девятисотого' }[(head % 1000) / 100] || 'сотого');
    }
    words = head ? numberToWords(head) + ' ' : '';
    if (tail < 20) return words + ORD_GEN[tail];
    var t = Math.floor(tail / 10), o = tail % 10;
    return words + (o ? TENS[t] + ' ' + ORD_GEN[o] : ORD_TENS_GEN[t]);
  }

  function dateToWords(d, m, y, gen) {
    var s = dayOrdinal(d, gen) + ' ' + MONTHS_GEN[m - 1];
    if (y) s += ' ' + yearOrdinalGen(y) + ' года';
    return s;
  }

  var H_FORMS = ['час', 'часа', 'часов'];
  var MIN_FORMS = ['минута', 'минуты', 'минут'];

  function timeToWords(h, mi) {
    var s = (h === 0 ? 'ноль' : numberToWords(h)) + ' ' + plural(h, H_FORMS);
    if (mi) s += ' ' + numberToWords(mi, 'f') + ' ' + plural(mi, MIN_FORMS);
    return s;
  }

  // Единицы после числа: [регулярка суффикса, род числа, формы]
  var UNITS = [
    [/^\s?(?:₽|руб\.?|р\.)(?![а-яё])/i, 'm', ['рубль', 'рубля', 'рублей']],
    [/^\s?(?:рубл[а-яё]*)/i, 'm', ['рубль', 'рубля', 'рублей']],
    [/^\s?(?:коп\.?)(?![а-яё])/i, 'f', ['копейка', 'копейки', 'копеек']],
    [/^\s?(?:\$)/, 'm', ['доллар', 'доллара', 'долларов']],
    [/^\s?(?:€)/, 'm', ['евро', 'евро', 'евро']],
    [/^\s?км\/ч(?![а-яё])/i, 'm', ['километр в час', 'километра в час', 'километров в час']],
    [/^\s?км(?![а-яё])/i, 'm', ['километр', 'километра', 'километров']],
    [/^\s?м(?![а-яё])/, 'm', ['метр', 'метра', 'метров']],
    [/^\s?кг(?![а-яё])/i, 'm', ['килограмм', 'килограмма', 'килограммов']],
    [/^\s?л\/100\s?км(?![а-яё])/i, 'm', ['литр на сто километров', 'литра на сто километров', 'литров на сто километров']],
    [/^\s?л(?![а-яё])\.?/i, 'm', ['литр', 'литра', 'литров']],
    [/^\s?%/, 'm', ['процент', 'процента', 'процентов']],
    [/^\s?°\s?C(?![a-zа-яё])/i, 'm', ['градус', 'градуса', 'градусов']],
    [/^\s?°/, 'm', ['градус', 'градуса', 'градусов']],
    [/^\s?мин(?![а-яё])\.?/i, 'f', ['минута', 'минуты', 'минут']],
    [/^\s?ч(?![а-яё])\.?/i, 'm', ['час', 'часа', 'часов']],
    [/^\s?шт(?![а-яё])\.?/i, 'f', ['штука', 'штуки', 'штук']]
  ];

  // Слова, после которых число — существительное женского/среднего рода (без сокращения)
  var FEM_NOUN = /^\s+(минут|секунд|недел|задач|заправ|поездк|запис|тысяч|штук|копе)/i;
  var NEUT_NOUN = /^\s+(событи|сообщени|уведомлени|напоминани)/i;
  var FEM_ACC = /^\s+(минуту|секунду|неделю|задачу|поездку|заправку|штуку|тысячу|запись)(?![а-яё])/i;
  var NOUN_FORMS = [
    [/^\s+дел(?:о|а)?(?![а-яё])/i, ['дело', 'дела', 'дел']]
  ];

  function fractionWords(intPart, frac, g) {
    // 1,5 → «одна целая пять десятых»
    var denom = { 1: ['десятая', 'десятых', 'десятых'], 2: ['сотая', 'сотых', 'сотых'] }[frac.length];
    if (!denom) return numberToWords(intPart, g) + ' и ' + frac.split('').map(function (d) { return ONES.m[+d]; }).join(' ');
    var fi = parseInt(frac, 10);
    return numberToWords(intPart, 'f') + ' ' + plural(intPart, ['целая', 'целых', 'целых']) + ' ' +
      numberToWords(fi, 'f') + ' ' + plural(fi, denom);
  }

  function normalize(text) {
    if (text == null) return '';
    var s = String(text);

    // 0) убрать эмодзи и markdown-символы, которые TTS читает вслух или спотыкается
    s = s.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}]/gu, '')
      .replace(/[*_`#]+/g, '')
      .replace(/\s*→\s*/g, ' — ');

    // 1) словарь
    LEXICON.forEach(function (p) {
      s = s.replace(p[0], function (m) {
        var r = p[1];
        return /^[A-ZА-ЯЁ]/.test(m) && /^[a-zа-яё]/.test(r) && m !== m.toUpperCase() ? r.charAt(0).toUpperCase() + r.slice(1) : r;
      });
    });

    // 2) даты: 25.09.2026 / 25.09
    s = s.replace(/\b(\d{1,2})\.(\d{1,2})(?:\.(\d{4}))?\b/g, function (all, d, m, y, off, whole) {
      d = +d; m = +m;
      if (d < 1 || d > 31 || m < 1 || m > 12) return all;
      return dateToWords(d, m, y ? +y : 0, GEN_PREP.test(whole.slice(0, off)));
    });
    // «25 сентября [2026 года]»
    s = s.replace(new RegExp('\\b(\\d{1,2})\\s+(' + MONTHS_GEN.join('|') + ')(?:\\s+(\\d{4})(?:\\s*(?:года|г\\.))?)?', 'g'),
      function (all, d, mon, y, off) {
        return dayOrdinal(+d, GEN_PREP.test(s.slice(0, off))) + ' ' + mon + (y ? ' ' + yearOrdinalGen(+y) + ' года' : '');
      });

    // 3) время: 9:30, 14:00, 09.30 не трогаем (занято датами)
    s = s.replace(/\b([01]?\d|2[0-3]):([0-5]\d)\b/g, function (all, h, mi) {
      return timeToWords(+h, +mi);
    });

    // 4) числа с разделителями тысяч: «3 420», «104 520», «1 000 000» → склеиваем
    s = s.replace(/\b\d{1,3}(?:[\u00a0\u202f ]\d{3})+\b/g, function (all) { return all.replace(/[\u00a0\u202f ]/g, ''); });

    // 5) деньги с копейками: 3420,50 ₽
    s = s.replace(/\b(\d+)[,.](\d{2})\s?(₽|руб\.?)(?![а-яё])/gi, function (all, r, k) {
      r = +r; k = +k;
      return numberToWords(r) + ' ' + plural(r, ['рубль', 'рубля', 'рублей']) +
        (k ? ' ' + numberToWords(k, 'f') + ' ' + plural(k, ['копейка', 'копейки', 'копеек']) : '');
    });

    // 6) остальные числа (+ десятичные) с единицами — ручной проход, чтобы «съесть» суффикс единицы
    var re = /(\d+)(?:[,.](\d+))?/g, out = '', last = 0, mt;
    while ((mt = re.exec(s))) {
      var before = s.slice(last, mt.index);
      var rest = s.slice(re.lastIndex);
      var n = parseInt(mt[1], 10), frac = mt[2];
      var sign = '';
      if (/(^|[\s(])-$/.test(before)) { sign = 'минус '; before = before.slice(0, -1); }
      var spoken = null, consumed = 0;
      for (var i = 0; i < UNITS.length && spoken === null; i++) {
        var mm = rest.match(UNITS[i][0]);
        if (mm) {
          spoken = (frac ? fractionWords(n, frac, UNITS[i][1]) : numberToWords(n, UNITS[i][1])) + ' ' +
            (frac ? UNITS[i][2][1] : plural(n, UNITS[i][2]));
          consumed = mm[0].length;
        }
      }
      for (var j = 0; j < NOUN_FORMS.length && spoken === null && !frac; j++) {
        var nm = rest.match(NOUN_FORMS[j][0]);
        if (nm) { spoken = numberToWords(n, 'n') + ' ' + plural(n, NOUN_FORMS[j][1]); consumed = nm[0].length; }
      }
      if (spoken === null) {
        var g = FEM_NOUN.test(rest) ? 'f' : (NEUT_NOUN.test(rest) ? 'n' : 'm');
        spoken = frac ? fractionWords(n, frac, g) : numberToWords(n, g);
        if (!frac && FEM_ACC.test(rest)) spoken = spoken.replace(/одна$/, 'одну');
      }
      // сокращение с точкой в конце предложения («… руб.») — точку-паузу сохраняем
      if (consumed && /\.\s*$/.test(rest.slice(0, consumed)) && /^\s*($|[А-ЯЁA-Z])/.test(rest.slice(consumed))) spoken += '.';
      out += before + sign + spoken;
      last = re.lastIndex + consumed;
      re.lastIndex = last;
    }
    s = out + s.slice(last);

    // 7) типографика для пауз
    s = s.replace(/\s*[—–]\s*/g, ' — ').replace(/\s+([,.!?:;])/g, '$1').replace(/\s{2,}/g, ' ').trim();
    return s;
  }

  var api = {
    normalize: normalize,
    numberToWords: numberToWords,
    plural: plural,
    timeToWords: timeToWords,
    dateToWords: dateToWords,
    lexicon: LEXICON
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.AvenSpeechText = api;
})(typeof window !== 'undefined' ? window : this);
