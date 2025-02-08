export const viewWidth = 80;       // 表示キャンバスのセル数（横）
export const viewHeight = 25;      // 表示キャンバスのセル数（縦）
export const levelWidth = 120;     // マップ全体のセル数（横）
export const levelHeight = 40;     // マップ全体のセル数（縦）

export const isMobile = window.innerWidth < 600;

// cellSize のデフォルト値を返す関数 (または定数)
export function getDefaultCellSize() {
  return isMobile ? 32 : 16;
}

// ディスプレイ設定
// fontSize は後で上書きするので初期値だけ入れておく
export const displayOptions = {
  width: viewWidth,
  height: viewHeight,
  fontSize: getDefaultCellSize(), // とりあえずここでは初期値
  forceSquareRatio: true,
  bg: "black",
  fg: "white"
};

