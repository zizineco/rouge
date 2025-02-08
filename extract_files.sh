#!/bin/bash

# 使用方法チェック
if [ "$#" -ne 1 ]; then
  echo "Usage: $0 <json_file>"
  exit 1
fi

json_file="$1"

# jq の存在確認
if ! command -v jq >/dev/null 2>&1; then
  echo "Error: jq is not installed. Please install jq and try again."
  exit 1
fi

# JSON 配列内のアイテム数を取得
count=$(jq '. | length' "$json_file")

# 各アイテムごとに、filename と content を jq -r で抽出して直接リダイレクトする
for (( i=0; i<count; i++ )); do
  filename=$(jq -r ".[$i].filename" "$json_file")
  # content を生の出力として filename に直接リダイレクト
  jq -r ".[$i].content" "$json_file" > "$filename"
  echo "Created file: $filename"
done