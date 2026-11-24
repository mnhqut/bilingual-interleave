# Bilingual Interleave (web)

Static browser version of `../interleave.py`. No install, no server. Network is used only by the optional "Translate + interleave" mode.

## Run locally
Open `index.html` directly in a browser, or serve the folder:

    python3 -m http.server --directory web 8000

Then visit http://localhost:8000.

## Deploy
Copy the `web/` folder to any static host (GitHub Pages, Netlify, Cloudflare Pages, nginx).
No build step. Files: `index.html`, `interleave-core.js`, `translate-engine.js`.

## Test
    node --test docs/test/core.test.js docs/test/translate.test.js

# Sentence splitting differs from NLTK Punkt of .py implementation
Punkt is a learned model (trained abbreviation list + collocation stats). Browser port is a rule-based heuristic, deliberately conservative: when unsure it does NOT split.

Languages: English, Spanish, French, German, Russian, Japanese, Chinese, Korean.
- Language is auto-detected per blank-line block (or chosen in the UI). No dependencies.
  - Script counts pick ko / ja (any kana) / zh / ru / Latin. CJK and Hangul characters are weighted x3 so a short original is not outvoted by a longer Latin translation.
  - Latin script: stop-word counts + accent hints (¿¡ñ → es, ß → de, çœê → fr). No hits → English.
  - A block mixing two languages gets one language's abbreviation list; terminators for all scripts still work.
- Rules shared by all languages:
  - Terminators `. ! ? …` need following whitespace; `。！？` do not.
  - Lowercase start after a Latin terminator never splits (`"Why?" he asked.`, `p.m. today`).
  - Never split inside unclosed `「」 『』 （） 【】 《》`; plus `« »` (es/fr/ru) and `“ ”` (ja/zh/ko).
  - Initials (`J.`, `А.`), dotted initialisms (`U.S.`, `z.B.`), decimals (`3.5`) do not split.
  - A blank line is always a boundary. NLTK would let a sentence span it.
- Per language:
  - en/es/fr/de/ru: fixed abbreviation lists (see `LANGS`), ~20-40 entries each. Not exhaustive.
  - es: `¿ ¡` skipped when finding the next sentence start.
  - de: `1–2 digits.` is an ordinal (`am 3. Mai`), never a boundary.
  - ja/zh: `。」` followed by hiragana (`「行こう。」と言った`) stays one sentence.
  - ko: ASCII `. ? !` plus space; no case, so the lowercase rule is moot.
- Known gaps:
  - Unknown abbreviation before a capital word still splits.
  - Sentence ending in an initialism (`in the U.S. He left`) is NOT split (conservative miss).
  - `Hello world. this is` is not split (NLTK splits). `e.g. at 5` is not split (NLTK splits).
  - A stray unmatched `«` or `「` suppresses later splits in the same block.
  - Lists, headings, URLs, emails: not specially handled.
  - `……` and `—` are not terminators in CJK.
  - Italian, Portuguese, Arabic, Thai, etc.: undetected, English rules apply.
- Validation: `node --test web/test/core.test.js` (17 tests, one per language). Parity vs NLTK checked only on an English 5-line corpus; other languages not compared against NLTK.
# Translate mode
Port of `../translate_engine.py`. Browser calls Google (`translate.googleapis.com/translate_a/t`) and Microsoft Edge (`edge.microsoft.com/translate/translatetext`) directly; both reply with `Access-Control-Allow-Origin: *`, so no proxy is needed. Batches of <=32 items / 4000 chars, failover between engines, 60 s cooldown per failed engine.
- Unofficial endpoints: may rate-limit or change. Text leaves the browser, unlike the other modes.
- Input with blank lines or `⟦Si⟧` markers is translated block by block; otherwise it is split into sentences first.
