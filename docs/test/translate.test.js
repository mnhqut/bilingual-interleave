const test = require("node:test");
const assert = require("node:assert");
const { translateTexts } = require("../translate-engine.js");

const ok = (json) => async () => ({ ok: true, json: async () => json });
const bad = async () => ({ ok: false, status: 429 });

test("google batch, blanks pass through", async () => {
  const fetch = async (url, init) => {
    assert.match(url, /translate_a\/t/);
    assert.deepStrictEqual(new URLSearchParams(init.body).getAll("q"), ["a", "b"]);
    return { ok: true, json: async () => [["A", "en"], ["B", "en"]] };
  };
  assert.deepStrictEqual(await translateTexts(["a", " ", "b"], { fetch }), ["A", " ", "B"]);
});

test("falls back to microsoft and unescapes", async () => {
  const fetch = async (url, init) => {
    if (url.includes("googleapis")) return bad();
    assert.deepStrictEqual(JSON.parse(init.body), ["x &amp; y"]);
    return { ok: true, json: async () => [{ translations: [{ text: "u &amp; v" }] }] };
  };
  assert.deepStrictEqual(await translateTexts(["x & y"], { fetch }), ["u & v"]);
});

test("all engines failing throws", async () => {
  await assert.rejects(translateTexts(["a"], { fetch: bad, engines: ["google", "microsoft"] }), /All engines failed/);
});

test("splits into batches of 32", async () => {
  const sizes = [];
  const fetch = async (url, init) => {
    const q = new URLSearchParams(init.body).getAll("q");
    sizes.push(q.length);
    return { ok: true, json: async () => q.map((t) => [t, "en"]) };
  };
  await translateTexts(Array.from({ length: 70 }, (_, i) => "s" + i), { fetch, engines: ["google"] });
  assert.deepStrictEqual(sizes, [32, 32, 6]);
});
