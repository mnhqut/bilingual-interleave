import argparse
import re
import tkinter as tk

import nltk
from nltk.tokenize import sent_tokenize

from translate_engine import ENGINES, TranslationError, translate_texts


def split_paragraphs(text):
    # Marked text: sentence markers define boundaries.
    if re.search(r"⟦S\d+⟧", text):
        return [
            p.strip()
            for p in re.split(r"⟦S\d+⟧", text)
            if p.strip()
        ]

    # Unmarked text: blank lines define paragraph boundaries.
    return [
        p.strip()
        for p in re.split(r"\n\s*\n", text)
        if p.strip()
    ]

def split_sentences(text: str, language: str) -> str:
    """Split text into sentences using NLTK Punkt."""
    try:
        sentences = sent_tokenize(text, language=language)
    except LookupError:
        print(
            f"\nNLTK sentence tokenizer data for language "
            f"'{language}' is not installed.\n"
            f"Run:\n\n"
            f"    python -c \"import nltk; nltk.download('punkt_tab')\"\n"
        )
        raise SystemExit(1)

    return "\n\n".join(
        f"⟦S{i}⟧ {sentence.strip()}"
        for i, sentence in enumerate(sentences, start=1)
        if sentence.strip()
    )


def interleave(items):
    if len(items) % 2 != 0:
        raise ValueError(
            f"Expected even number of items, got {len(items)}"
        )

    n = len(items) // 2
    pairs = []

    for i in range(n):
        # One empty line between original and translation.
        pairs.append(f"{items[i]}\n\n{items[n + i]}")

    # Two empty lines between pairs.
    return "\n\n\n".join(pairs)


def translate_file(text, language, source, target, engines):
    """Segment, translate with key-less engines, interleave."""
    if re.search(r"⟦S\d+⟧", text) or re.search(r"\n\s*\n", text.strip()):
        originals = split_paragraphs(text)
    else:
        originals = [s.strip() for s in split_sentences(text, language).split("\n\n")]
        originals = [re.sub(r"^⟦S\d+⟧\s*", "", s) for s in originals if s]
    try:
        translations = translate_texts(originals, source, target, engines)
    except TranslationError as exc:
        raise SystemExit(f"Translation failed: {exc}")
    return interleave(originals + translations)


def interleave_file(filename):
    with open(filename, "r", encoding="utf-8") as f:
        text = f.read()

    items = split_paragraphs(text)
    return interleave(items)



def copy_to_clipboard(text):
    root = tk.Tk()
    root.withdraw()
    root.clipboard_clear()
    root.clipboard_append(text)
    root.update()
    root.after(100, root.destroy)
    root.mainloop()


def main():
    parser = argparse.ArgumentParser(
        description="Interleave original and translated text."
    )

    parser.add_argument(
        "--mode",
        choices=["interleave", "split_sentence", "translate"],
        default="interleave",
        help="Interleave by paragraph, or split document into paragraphs of each sentence",
    )

    parser.add_argument(
        "--language",
        default="english",
        help=(
            "Language used for sentence segmentation by NLTK "
            "(default: english). Examples: english, french, german"
        ),
    )

    parser.add_argument(
        "--source",
        default="auto",
        help="translate mode: source language code (default: auto-detect)",
    )

    parser.add_argument(
        "--target",
        default="en",
        help="translate mode: target language code, e.g. en, fr, vi (default: en)",
    )

    parser.add_argument(
        "--engine",
        default=",".join(ENGINES),
        help="translate mode: comma-separated engines in failover order (default: %(default)s)",
    )

    parser.add_argument(
        "-i",
        "--input",
        default="input.txt",
        help="Input TXT file (default: input.txt)",
    )
    
    parser.add_argument(
        "-o",
        "--output",
        help="Save result to TXT file instead of printing",
    )

    args = parser.parse_args()

    if args.mode == "split_sentence":
        with open(args.input, "r", encoding="utf-8") as f:
            text = f.read()
            result = split_sentences(text, args.language)
    elif args.mode == "translate":
        engines = [e.strip() for e in args.engine.split(",") if e.strip()]
        unknown = [e for e in engines if e not in ENGINES]
        if unknown:
            parser.error(f"unknown engine(s): {', '.join(unknown)}")
        with open(args.input, "r", encoding="utf-8") as f:
            text = f.read()
        result = translate_file(text, args.language, args.source, args.target, engines)
    else:
        result = interleave_file(args.input)

    copy_to_clipboard(result)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result)
    else:
        print(result)


if __name__ == "__main__":
    main()

