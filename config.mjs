// ============
// config.mjs
// ============
// 画面関連の設定や、モバイル判定等をまとめる

export const viewWidth = 80;       // 表示キャンバスのセル数（横）
export const viewHeight = 25;      // 表示キャンバスのセル数（縦）
export const levelWidth = 120;     // マップ全体のセル数（横）
export const levelHeight = 40;     // マップ全体のセル数（縦）

export const isMobile = window.innerWidth < 600;

// cellSize を直接 export すると再代入エラーが出る環境があるため
// 関数として定義し、使用側で独自に this.cellSize などの変数に持つ方式を推奨
export function getDefaultCellSize() {
  return isMobile ? 32 : 16;
}

// ROT.Display 用初期設定（fontSize は後から上書き可能）
export const displayOptions = {
  width: viewWidth,
  height: viewHeight,
  fontSize: 16, // とりあえず仮の初期値
  forceSquareRatio: true,
  bg: "black",
  fg: "white"
};

