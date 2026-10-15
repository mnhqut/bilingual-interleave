// Pure logic port of interleave.py. No DOM access so it runs in browser and Node.
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.InterleaveCore = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const MARKER_RE = /⟦S\d+⟧/;
  const MARKER_SPLIT_RE = /⟦S\d+⟧/;
  const BLANK_LINE_SPLIT_RE = /\n\s*\n/;

  // ---- Paragraph / interleave (parity with interleave.py) ----

  function splitParagraphs(text) {
    // Marked text: sentence markers define boundaries.
    if (MARKER_RE.test(text)) {
      return text.split(MARKER_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
    }
    // Unmarked text: blank lines define paragraph boundaries.
    return text.split(BLANK_LINE_SPLIT_RE).map((p) => p.trim()).filter(Boolean);
  }

  function interleave(items) {
    if (items.length % 2 !== 0) {
      throw new Error(`Expected even number of items, got ${items.length}`);
    }
    const n = items.length / 2;
    const pairs = [];
    for (let i = 0; i < n; i++) {
      // One empty line between original and translation.
      pairs.push(`${items[i]}\n\n${items[n + i]}`);
    }
    // Two empty lines between pairs.
    return pairs.join("\n\n\n");
  }

  // ---- Language data ----
  // abbr: lowercase tokens (no trailing dot) after which "." does not end a sentence.
  // stop: common function words, used only for Latin-script language detection.
  // quotes: extra bracket pairs inside which sentence boundaries are suppressed.

  const LANGS = {
    en: {
      abbr: "mr mrs ms dr prof sr jr st vs etc inc ltd co no fig vol approx dept al cf jan feb mar apr jun jul aug sep sept oct nov dec gen gov sen rep rev hon capt col lt sgt mt ft ave blvd rd est min max ed eds pp ch sec",
      stop: "the and of to is in that it was for with as on be at by this are from have not you he she they we his her but",
    },
    es: {
      abbr: "sr sra srta sres dr dra prof profa ud uds vd vds etc pág págs núm nº avda admón dpto ej cap vol tel cía apdo gral cf pp aprox figs",
      stop: "el la de que y en los se del las por un una con es para no su al lo como más pero muy está son",
      quotes: [["«", "»"]],
    },
    fr: {
      abbr: "m mm mme mmes mlle mlles dr pr prof st ste etc cf p pp env av apr art éd vol ch chap n° no tel fig cie ex suiv",
      stop: "le les des et est un une que pour dans qui pas du au sur avec ce ne son il elle je vous nous sont mais",
      quotes: [["«", "»"]],
    },
    de: {
      abbr: "z.b d.h u.a usw bzw ca evtl ggf inkl nr str dr prof hr fr vgl sog bspw mio mrd tel std min max abb kap bd ff geb dipl ing etc",
      stop: "der die das und ist nicht ein eine mit den von zu auf sich dem im für auch sind er sie wir ich es",
    },
    ru: {
      abbr: "г гг ул им руб тыс млн млрд см напр др проф стр рис т п д к тов гр пр обл акад доц св сокр ср",
      stop: "и в не на что он она это как но по из за то все так его от для был быть мы вы они",
      quotes: [["«", "»"]],
    },
    ja: { abbr: "", stop: "", quotes: [["“", "”"]] },
    zh: { abbr: "", stop: "", quotes: [["“", "”"]] },
    ko: { abbr: "", stop: "", quotes: [["“", "”"]] },
  };
  for (const key of Object.keys(LANGS)) {
    const l = LANGS[key];
    l.abbrSet = new Set(l.abbr.split(/\s+/).filter(Boolean));
    l.stopSet = new Set(l.stop.split(/\s+/).filter(Boolean));
    l.quotes = l.quotes || [];
  }
  const LATIN_LANGS = ["en", "es", "fr", "de"];
  // Brackets whose contents are never split, in every language.
  const COMMON_PAIRS = [["「", "」"], ["『", "』"], ["（", "）"], ["【", "】"], ["《", "》"]];

  // ---- Language detection (script counts, then stop-word scoring for Latin) ----

  function detectLanguage(text) {
    const c = { hangul: 0, cjk: 0, kana: 0, cyr: 0, latin: 0 };
    for (const ch of text) {
      const cp = ch.codePointAt(0);
      if ((cp >= 0xac00 && cp <= 0xd7af) || (cp >= 0x1100 && cp <= 0x11ff) || (cp >= 0x3130 && cp <= 0x318f)) c.hangul++;
      else if (cp >= 0x3040 && cp <= 0x30ff) { c.kana++; c.cjk++; }
      else if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) c.cjk++;
      else if (cp >= 0x0400 && cp <= 0x04ff) c.cyr++;
      else if (cp < 0x250 && /\p{L}/u.test(ch)) c.latin++;
    }
    // CJK / Hangul characters carry more meaning each: weight them up so a short
    // sentence is not outvoted by a longer translation in Latin script.
    const score = { hangul: c.hangul * 3, cjk: c.cjk * 3, cyr: c.cyr, latin: c.latin };
    const top = Object.keys(score).reduce((a, b) => (score[b] > score[a] ? b : a));
    if (score[top] === 0) return "en";
    if (top === "hangul") return "ko";
    if (top === "cjk") return c.kana > 0 ? "ja" : "zh";
    if (top === "cyr") return "ru";
    return detectLatin(text);
  }

  function detectLatin(text) {
    const score = { en: 0, es: 0, fr: 0, de: 0 };
    const words = text.toLowerCase().match(/\p{L}+/gu) || [];
    for (const w of words) {
      for (const k of LATIN_LANGS) if (LANGS[k].stopSet.has(w)) score[k]++;
    }
    score.es += 3 * (text.match(/[¿¡]/g) || []).length + 2 * (text.match(/ñ/gi) || []).length;
    score.de += 3 * (text.match(/ß/g) || []).length + (text.match(/[äö]/gi) || []).length;
    score.fr += (text.match(/[çœêèùà]/gi) || []).length;
    const top = LATIN_LANGS.reduce((a, b) => (score[b] > score[a] ? b : a));
    return score[top] === 0 ? "en" : top;
  }

  // ---- Sentence segmentation ----

  const CLOSERS = "\"'”’»›)\\]」』）】";
  const TERM_RE = new RegExp(`[.!?…。！？]+[${CLOSERS}]*`, "gu");
  const CJK_TERM_RE = /[。！？]/;
  const CLOSER_ONLY_RE = new RegExp(`[${CLOSERS}]+$`, "u");
  // Characters that may sit between a terminator and the first letter of the next sentence.
  const LEAD_RE = /^[\s"'“‘„«»「『（(\[【《¿¡—–\-…]+/u;

  function isLowerLetter(ch) {
    return ch !== ch.toUpperCase() && ch === ch.toLowerCase();
  }

  // Token right before index (letters, digits, dots, degree sign), lowercased, no trailing dot.
  function tokenBefore(text, index) {
    const m = /([\p{L}\p{N}.°]+)$/u.exec(text.slice(0, index));
    return m ? m[1].toLowerCase().replace(/\.$/, "") : "";
  }

  function count(str, sub) {
    return str.split(sub).length - 1;
  }

  // True when the span ends inside an unclosed bracket / quotation pair.
  function insideQuote(span, lang) {
    for (const [open, close] of COMMON_PAIRS.concat(LANGS[lang].quotes)) {
      if (count(span, open) > count(span, close)) return true;
    }
    return false;
  }

  function splitBlock(block, lang) {
    const L = LANGS[lang] || LANGS.en;
    const out = [];
    let start = 0;
    let m;
    TERM_RE.lastIndex = 0;
    while ((m = TERM_RE.exec(block)) !== null) {
      const end = m.index + m[0].length;
      const cjkTerm = CJK_TERM_RE.test(m[0]);
      const ws = /^\s*/.exec(block.slice(end))[0];
      if (!cjkTerm && !ws) continue; // "3.5", "e.g.x": not a boundary
      const after = block.slice(end + ws.length);
      if (after === "") break;
      if (insideQuote(block.slice(start, end), lang)) continue;

      const closers = CLOSER_ONLY_RE.exec(m[0]);
      const core = closers ? m[0].slice(0, m[0].length - closers[0].length) : m[0];

      if (cjkTerm) {
        // "。」と言った": a closed quote continued by a hiragana particle is one sentence.
        if (closers && /[」』”）]/.test(closers[0]) && /^[぀-ゟ]/.test(after)) continue;
      } else {
        const first = after.replace(LEAD_RE, "")[0];
        if (first === undefined) continue;
        // Conservative: a lowercase start never begins a sentence.
        if (isLowerLetter(first)) continue;
        if (core === ".") {
          const tok = tokenBefore(block, m.index);
          if (L.abbrSet.has(tok)) continue;
          if (/^\p{L}$/u.test(tok)) continue; // initials: "J. Smith", "А. С. Пушкин"
          if (/^\p{L}(\.\p{L})+$/u.test(tok)) continue; // dotted initialisms: "U.S.", "p.m.", "z.B."
          if (lang === "de" && /^\d{1,2}$/.test(tok)) continue; // German ordinals: "am 3. Mai"
          if (/\d/.test(first) && /\d$/.test(tok)) continue;
        }
      }

      out.push(block.slice(start, end).trim());
      start = end + ws.length;
      TERM_RE.lastIndex = start;
    }
    const tail = block.slice(start).trim();
    if (tail) out.push(tail);
    return out.filter(Boolean);
  }

  // language: "auto" or one of en es fr de ru ja zh ko. Auto detects per blank-line block.
  function splitSentenceList(text, language) {
    const lang = language || "auto";
    const out = [];
    for (const block of text.split(BLANK_LINE_SPLIT_RE)) {
      if (!block.trim()) continue;
      const l = lang === "auto" ? detectLanguage(block) : lang;
      out.push(...splitBlock(block, l));
    }
    return out;
  }

  function detectLanguages(text) {
    const seen = [];
    for (const block of text.split(BLANK_LINE_SPLIT_RE)) {
      if (!block.trim()) continue;
      const l = detectLanguage(block);
      if (!seen.includes(l)) seen.push(l);
    }
    return seen;
  }

  function splitSentences(text, language) {
    return splitSentenceList(text, language)
      .map((sentence, i) => `⟦S${i + 1}⟧ ${sentence}`)
      .join("\n\n");
  }

  function run(text, mode, language) {
    if (mode === "split_sentence") return splitSentences(text, language);
    return interleave(splitParagraphs(text));
  }

  return {
    splitParagraphs, interleave, splitSentences, splitSentenceList,
    detectLanguage, detectLanguages, run,
    LANGUAGES: Object.keys(LANGS),
  };
});
