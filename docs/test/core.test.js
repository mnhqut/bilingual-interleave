// Run: node --test web/test/
const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../interleave-core.js");

test("blank lines split paragraphs and interleave pairs", () => {
  const items = core.splitParagraphs("A\n\nB\n\nC\n\nD");
  assert.deepEqual(items, ["A", "B", "C", "D"]);
  assert.equal(core.interleave(items), "A\n\nC\n\n\nB\n\nD");
});

test("marker text uses markers as boundaries", () => {
  const items = core.splitParagraphs("⟦S1⟧ One.\n\n⟦S2⟧ Uno.");
  assert.deepEqual(items, ["One.", "Uno."]);
});

test("odd item count throws", () => {
  assert.throws(() => core.interleave(["a", "b", "c"]), /Expected even number/);
});

test("empty and whitespace-only input yields no blocks", () => {
  assert.deepEqual(core.splitParagraphs(""), []);
  assert.deepEqual(core.splitParagraphs(" \n\n  \n"), []);
});

test("sentence split labels sentences with markers", () => {
  assert.equal(
    core.splitSentences("Hi there. Ok?"),
    "⟦S1⟧ Hi there.\n\n⟦S2⟧ Ok?"
  );
});

test("sentence split keeps abbreviations together", () => {
  assert.deepEqual(core.splitSentenceList("Dr. Smith left. He waved."), [
    "Dr. Smith left.",
    "He waved.",
  ]);
});

test("unicode text passes through unchanged", () => {
  assert.equal(core.interleave(["Bonjour", "Hello"]), "Bonjour\n\nHello");
  assert.deepEqual(core.splitSentenceList("Cảm ơn bạn. Đi thôi."), [
    "Cảm ơn bạn.",
    "Đi thôi.",
  ]);
});

const S = core.splitSentenceList;

test("english: lowercase after quoted question does not split", () => {
  assert.deepEqual(S('"Why?" he asked. Then left.'), ['"Why?" he asked.', "Then left."]);
  assert.deepEqual(S("He lives in the U.S. now. Fine."), ["He lives in the U.S. now.", "Fine."]);
});

test("spanish: inverted marks and abbreviations", () => {
  assert.deepEqual(S("El Sr. López llegó. ¿Qué tal? ¡Muy bien! Nos vemos."), [
    "El Sr. López llegó.", "¿Qué tal?", "¡Muy bien!", "Nos vemos.",
  ]);
});

test("french: guillemet quote kept whole", () => {
  assert.deepEqual(S("M. Dupont est arrivé. Il a dit : « Viens ici. Maintenant. » Puis il est parti."), [
    "M. Dupont est arrivé.",
    "Il a dit : « Viens ici. Maintenant. » Puis il est parti.",
  ]);
});

test("german: ordinal dates and z.B.", () => {
  assert.deepEqual(S("Er kam am 3. Mai an. Das ist nicht gut, z.B. weil es regnet. Wir gehen."), [
    "Er kam am 3. Mai an.", "Das ist nicht gut, z.B. weil es regnet.", "Wir gehen.",
  ]);
});

test("russian: initials and abbreviations", () => {
  assert.deepEqual(S("А. С. Пушкин родился в 1799 г. в Москве. Он был поэтом."), [
    "А. С. Пушкин родился в 1799 г. в Москве.", "Он был поэтом.",
  ]);
});

test("japanese: 。 boundaries, quote with particle stays joined", () => {
  assert.deepEqual(S("今日は雨です。「行こう。」と彼は言った。明日は晴れ！"), [
    "今日は雨です。", "「行こう。」と彼は言った。", "明日は晴れ！",
  ]);
});

test("chinese: fullwidth terminators", () => {
  assert.deepEqual(S("今天下雨。我们去吧！你好吗？"), ["今天下雨。", "我们去吧！", "你好吗？"]);
});

test("korean: ascii terminators, no case", () => {
  assert.deepEqual(S("오늘은 비가 옵니다. 내일은 맑을 것입니다! 가요?"), [
    "오늘은 비가 옵니다.", "내일은 맑을 것입니다!", "가요?",
  ]);
});

test("language detection", () => {
  const d = core.detectLanguage;
  assert.deepEqual(
    [d("The cat is on the mat."), d("El gato está en la casa."), d("Le chat est dans la maison."),
     d("Das ist nicht gut."), d("Это не так."), d("今日は雨です。"), d("今天下雨。"), d("오늘은 비가 옵니다.")],
    ["en", "es", "fr", "de", "ru", "ja", "zh", "ko"]
  );
});

test("auto mode detects per blank-line block; explicit language overrides", () => {
  assert.deepEqual(S("Hello there. Bye.\n\n你好。再见。"), ["Hello there.", "Bye.", "你好。", "再见。"]);
  assert.deepEqual(S("Dr. Smith left.", "en"), ["Dr. Smith left."]);
});
