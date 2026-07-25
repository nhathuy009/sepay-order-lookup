#!/usr/bin/env python3
"""
gen_context.py
Gộp toàn bộ code trong project thành 1 file Markdown (PROJECT_CONTEXT.md)
để paste/upload cho Claude (hoặc AI khác) nắm bắt nhanh toàn bộ dự án.

Cách dùng:
    python gen_context.py
    # hoặc chỉ định thư mục gốc khác:
    python gen_context.py --root ./sepay-order-lookup --out CONTEXT.md
"""

import argparse
import os
from pathlib import Path

# --- CẤU HÌNH ---------------------------------------------------------

# Các đuôi file sẽ được đưa vào file gộp
INCLUDE_EXT = {
    ".py", ".html", ".js", ".ts", ".jsx", ".tsx", ".css",
    ".json", ".md", ".txt", ".yaml", ".yml",
}

# Tên file cụ thể luôn được đưa vào dù không khớp đuôi ở trên
INCLUDE_FILENAMES = {
    ".gitignore", ".env.example", "vercel.json", "requirements.txt",
}

# Thư mục sẽ bỏ qua hoàn toàn
EXCLUDE_DIRS = {
    ".git", "node_modules", "__pycache__", ".vercel", ".venv",
    "venv", "dist", "build", ".next",
}

# File/pattern nhạy cảm tuyệt đối không đưa vào (tránh lộ secret)
EXCLUDE_FILENAMES = {
    ".env", ".env.local", ".env.production",
}

# Đuôi file coi là "ngôn ngữ" để tô màu code block trong markdown
LANG_MAP = {
    ".py": "python", ".js": "javascript", ".ts": "typescript",
    ".jsx": "jsx", ".tsx": "tsx", ".html": "html", ".css": "css",
    ".json": "json", ".md": "markdown", ".yaml": "yaml", ".yml": "yaml",
    ".txt": "text",
}

MAX_FILE_SIZE_BYTES = 300_000  # bỏ qua file quá lớn (vd. data json khổng lồ)

# -----------------------------------------------------------------------


def should_include(path: Path) -> bool:
    if path.name in EXCLUDE_FILENAMES:
        return False
    if path.name in INCLUDE_FILENAMES:
        return True
    return path.suffix.lower() in INCLUDE_EXT


def build_tree(root: Path) -> str:
    lines = []

    def walk(dir_path: Path, prefix: str = ""):
        entries = sorted(
            [p for p in dir_path.iterdir() if p.name not in EXCLUDE_DIRS],
            key=lambda p: (p.is_file(), p.name.lower()),
        )
        for i, entry in enumerate(entries):
            connector = "└── " if i == len(entries) - 1 else "├── "
            lines.append(f"{prefix}{connector}{entry.name}")
            if entry.is_dir():
                extension = "    " if i == len(entries) - 1 else "│   "
                walk(entry, prefix + extension)

    lines.append(root.name + "/")
    walk(root)
    return "\n".join(lines)


def gather_files(root: Path):
    result = []
    for dirpath, dirnames, filenames in os.walk(root):
        dirnames[:] = [d for d in dirnames if d not in EXCLUDE_DIRS]
        for fname in sorted(filenames):
            fpath = Path(dirpath) / fname
            if should_include(fpath):
                result.append(fpath)
    return sorted(result)


def read_file_safe(path: Path) -> str:
    try:
        if path.stat().st_size > MAX_FILE_SIZE_BYTES:
            return f"[Bỏ qua: file lớn hơn {MAX_FILE_SIZE_BYTES} bytes]"
        return path.read_text(encoding="utf-8", errors="replace")
    except Exception as e:
        return f"[Lỗi khi đọc file: {e}]"


def main():
    parser = argparse.ArgumentParser(description="Gộp code project thành 1 file Markdown")
    parser.add_argument("--root", default=".", help="Thư mục gốc của project (mặc định: thư mục hiện tại)")
    parser.add_argument("--out", default="PROJECT_CONTEXT.md", help="Tên file markdown xuất ra")
    args = parser.parse_args()

    root = Path(args.root).resolve()
    out_path = root / args.out

    files = gather_files(root)

    with open(out_path, "w", encoding="utf-8") as f:
        f.write(f"# Project Context: {root.name}\n\n")
        f.write("## Cấu trúc thư mục\n\n```\n")
        f.write(build_tree(root))
        f.write("\n```\n\n")
        f.write("## Nội dung file\n\n")

        for fpath in files:
            rel = fpath.relative_to(root)
            lang = LANG_MAP.get(fpath.suffix.lower(), "")
            content = read_file_safe(fpath)
            f.write(f"### `{rel.as_posix()}`\n\n")
            f.write(f"```{lang}\n{content}\n```\n\n")

    print(f"Đã tạo: {out_path}")
    print(f"Tổng số file đã gộp: {len(files)}")


if __name__ == "__main__":
    main()