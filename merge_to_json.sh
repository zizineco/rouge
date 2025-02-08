#!/bin/bash

# Usage:
#   ./to_json_array_rawfile.sh file1 file2 ...
#   > output.json

if [ $# -lt 1 ]; then
  echo "Usage: $0 file1 [file2 ...]"
  exit 1
fi

# jq コマンドがインストールされているかチェック
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is not installed. Please install jq and try again."
  exit 1
fi

# 一時ファイルを作成し、最初は空の JSON 配列 "[]" を書き込む
tempfile=$(mktemp)
echo '[]' > "$tempfile"

# 引数で与えられたファイルを順に処理して JSON 配列に追加していく
for f in "$@"; do
  if [ ! -f "$f" ]; then
    echo "Warning: '$f' is not a regular file. Skipping." >&2
    continue
  fi

  # 次の中間結果を格納する一時ファイルを用意
  newtemp=$(mktemp)

  # --rawfile は jq がファイル内容を丸ごと読み込み、$c という変数に入れてくれる
  # tempfile で読み込んだ既存配列に要素を追加し、結果を newtemp に書き出す
  jq \
    --arg fn "$f" \
    --rawfile c "$f" \
    '. + [{"filename": $fn, "content": $c}]' \
    "$tempfile" > "$newtemp"

  # 中間ファイルを更新
  mv "$newtemp" "$tempfile"
done

# 最終的な JSON 配列を標準出力に返す
cat "$tempfile"

# 後始末として一時ファイルを削除
rm "$tempfile"
