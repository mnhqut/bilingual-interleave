import argparse
import re
import tkinter as tk

def split_paragraphs(text):
    return [
        p.strip()
        for p in re.split(r"\n\s*\n", text)
        if p.strip()
    ]


def split_sentences(text):
    # Split after sentence-ending punctuation: . ! ?
    return [
        line.strip()
        for line in re.split(r"(?<=[.!?])\s+", text.strip())
        if line.strip()
    ]

def add_newlines_after_periods(text):
    # Replace spaces/tabs after periods with a newline.
    # Leave existing newlines unchanged.
    return re.sub(r"\.[ \t]+", ".\n", text)

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


def interleave_file(filename, mode):
    with open(filename, "r", encoding="utf-8") as f:
        text = f.read()

    if mode == "paragraph":
        items = split_paragraphs(text)
        return interleave(items)

    elif mode == "sentence":
        items = split_sentences(text)
        return interleave(items)

    elif mode == "newline":
        return add_newlines_after_periods(text)

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
        choices=["paragraph", "sentence", "newline"],
        default="paragraph",
        help="Interleave by paragraph or sentence, or add newline after periods",
    )

    parser.add_argument(
        "-o",
        "--output",
        help="Save result to TXT file instead of printing",
    )

    args = parser.parse_args()

    result = interleave_file("input.txt", args.mode)

    copy_to_clipboard(result)

    if args.output:
        with open(args.output, "w", encoding="utf-8") as f:
            f.write(result)
    else:
        print(result)


if __name__ == "__main__":
    main()


