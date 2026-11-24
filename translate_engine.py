"""Key-less translation, modelled on FluentRead's free-translation pool.

See "translation engine.md". Stdlib only. Engines are undocumented public web
endpoints, so each can break or rate-limit; `translate_texts` batches, fails
over between engines, and cools down engines that fail.
"""

import html
import json
import time
import urllib.error
import urllib.parse
import urllib.request

MAX_BATCH_ITEMS = 32
MAX_BATCH_CHARS = 4000
ATTEMPT_TIMEOUT = 8  # seconds per endpoint attempt
COOLDOWN = 60  # seconds an engine sits out after a failure
USER_AGENT = "Mozilla/5.0"


class TranslationError(Exception):
    pass


def _post(url, data, content_type):
    req = urllib.request.Request(
        url,
        data=data,
        headers={"Content-Type": content_type, "User-Agent": USER_AGENT},
    )
    with urllib.request.urlopen(req, timeout=ATTEMPT_TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf-8"))


def _google(texts, source, target):
    """translate.googleapis.com web batch endpoint (repeated q= fields)."""
    query = urllib.parse.urlencode(
        {"client": "gtx", "sl": source, "tl": target, "dt": "t"}
    )
    body = urllib.parse.urlencode([("q", t) for t in texts]).encode("utf-8")
    reply = _post(
        f"https://translate.googleapis.com/translate_a/t?{query}",
        body,
        "application/x-www-form-urlencoded",
    )
    # One q => reply may be a bare ["text", "lang"]; many => [["text", "lang"], ...].
    if len(texts) == 1 and reply and isinstance(reply[0], str):
        return [reply[0]]
    return [item[0] if isinstance(item, list) else item for item in reply]


def _microsoft(texts, source, target):
    """Edge translate endpoint, no key. Strings are HTML-escaped both ways."""
    query = urllib.parse.urlencode(
        {
            "from": "" if source == "auto" else source,
            "to": target,
            "isEnterpriseClient": "false",
        }
    )
    body = json.dumps([html.escape(t) for t in texts]).encode("utf-8")
    reply = _post(
        f"https://edge.microsoft.com/translate/translatetext?{query}",
        body,
        "application/json",
    )
    return [html.unescape(item["translations"][0]["text"]) for item in reply]


ENGINES = {"google": _google, "microsoft": _microsoft}
_retry_at = {}  # engine name -> monotonic time it may be tried again


def _batches(texts):
    """Yield (start_index, batch) with <=32 items and <=~4000 chars each."""
    batch, chars, start = [], 0, 0
    for i, text in enumerate(texts):
        if batch and (
            len(batch) >= MAX_BATCH_ITEMS or chars + len(text) > MAX_BATCH_CHARS
        ):
            yield start, batch
            batch, chars, start = [], 0, i
        batch.append(text)
        chars += len(text)
    if batch:
        yield start, batch


def _translate_batch(batch, source, target, engines):
    errors = []
    now = time.monotonic()
    # Engines not cooling down first, in given order; cooling ones as last resort.
    ready = [e for e in engines if _retry_at.get(e, 0) <= now]
    cooling = [e for e in engines if e not in ready]
    for name in ready + cooling:
        try:
            result = ENGINES[name](batch, source, target)
            if len(result) != len(batch):
                raise TranslationError(
                    f"got {len(result)} results for {len(batch)} inputs"
                )
            _retry_at.pop(name, None)
            return result
        except (urllib.error.URLError, TimeoutError, TranslationError,
                ValueError, KeyError, IndexError, TypeError) as exc:
            _retry_at[name] = time.monotonic() + COOLDOWN
            errors.append(f"{name}: {exc}")
    raise TranslationError("all engines failed: " + "; ".join(errors))


def translate_texts(texts, source="auto", target="en", engines=("google", "microsoft")):
    """Translate each string; blank strings pass through. Returns same-length list."""
    out = list(texts)
    idx = [i for i, t in enumerate(texts) if t.strip()]
    pending = [texts[i] for i in idx]
    for start, batch in _batches(pending):
        result = _translate_batch(batch, source, target, list(engines))
        for k, translated in enumerate(result):
            out[idx[start + k]] = translated
    return out
