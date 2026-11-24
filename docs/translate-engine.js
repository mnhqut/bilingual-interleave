// Key-less translation, port of ../translate_engine.py (modelled on FluentRead's free pool).
// Calls public web endpoints straight from the browser (both send CORS "*").
(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.TranslateEngine = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {
  const MAX_BATCH_ITEMS = 32;
  const MAX_BATCH_CHARS = 4000;
  const ATTEMPT_TIMEOUT = 8000;
  const COOLDOWN = 60000;

  const escapeHtml = (s) =>
    s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;");
  const unescapeHtml = (s) =>
    s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"')
      .replace(/&#(?:x27|39);/g, "'").replace(/&amp;/g, "&");

  async function post(url, body, contentType, fetchImpl) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ATTEMPT_TIMEOUT);
    try {
      const res = await fetchImpl(url, {
        method: "POST",
        headers: { "Content-Type": contentType },
        body,
        credentials: "omit",
        signal: ctrl.signal,
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return await res.json();
    } finally {
      clearTimeout(timer);
    }
  }

  const ENGINES = {
    async google(texts, source, target, f) {
      const qs = new URLSearchParams({ client: "gtx", sl: source, tl: target, dt: "t" });
      const body = new URLSearchParams();
      for (const t of texts) body.append("q", t);
      const reply = await post(
        `https://translate.googleapis.com/translate_a/t?${qs}`,
        body.toString(), "application/x-www-form-urlencoded", f);
      if (texts.length === 1 && typeof reply[0] === "string") return [reply[0]];
      return reply.map((item) => (Array.isArray(item) ? item[0] : item));
    },
    async microsoft(texts, source, target, f) {
      const qs = new URLSearchParams({
        from: source === "auto" ? "" : source, to: target, isEnterpriseClient: "false",
      });
      const reply = await post(
        `https://edge.microsoft.com/translate/translatetext?${qs}`,
        JSON.stringify(texts.map(escapeHtml)), "application/json", f);
      return reply.map((item) => unescapeHtml(item.translations[0].text));
    },
  };

  const retryAt = {};

  function* batches(texts) {
    let batch = [], chars = 0, start = 0;
    for (let i = 0; i < texts.length; i++) {
      if (batch.length && (batch.length >= MAX_BATCH_ITEMS || chars + texts[i].length > MAX_BATCH_CHARS)) {
        yield [start, batch];
        batch = []; chars = 0; start = i;
      }
      batch.push(texts[i]);
      chars += texts[i].length;
    }
    if (batch.length) yield [start, batch];
  }

  async function translateBatch(batch, source, target, engines, f) {
    const now = Date.now();
    const ready = engines.filter((e) => (retryAt[e] || 0) <= now);
    const order = ready.concat(engines.filter((e) => !ready.includes(e)));
    const errors = [];
    for (const name of order) {
      try {
        const result = await ENGINES[name](batch, source, target, f);
        if (result.length !== batch.length) {
          throw new Error(`got ${result.length} results for ${batch.length} inputs`);
        }
        delete retryAt[name];
        return result;
      } catch (err) {
        retryAt[name] = Date.now() + COOLDOWN;
        errors.push(`${name}: ${err.message}`);
      }
    }
    throw new Error("All engines failed: " + errors.join("; "));
  }

  // opts: { source, target, engines, fetch, onProgress(done,total) }
  async function translateTexts(texts, opts) {
    const o = Object.assign({ source: "auto", target: "en", engines: ["google", "microsoft"] }, opts);
    const f = o.fetch || ((...a) => fetch(...a));
    const out = texts.slice();
    const idx = [];
    texts.forEach((t, i) => { if (t.trim()) idx.push(i); });
    const pending = idx.map((i) => texts[i]);
    let done = 0;
    for (const [start, batch] of batches(pending)) {
      const result = await translateBatch(batch, o.source, o.target, o.engines, f);
      result.forEach((t, k) => { out[idx[start + k]] = t; });
      done += batch.length;
      if (o.onProgress) o.onProgress(done, pending.length);
    }
    return out;
  }

  return { translateTexts, ENGINES: Object.keys(ENGINES) };
});
