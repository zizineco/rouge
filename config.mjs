export const viewWidth = 80;       // 表示キャンバスのセル数（横）
export const viewHeight = 25;      // 表示キャンバスのセル数（縦）
export const levelWidth = 120;     // マップ全体のセル数（横）
export const levelHeight = 40;     // マップ全体のセル数（縦）

export const isMobile = window.innerWidth < 600;
export let cellSize = isMobile ? 32 : 16;

export const displayOptions = {
  width: viewWidth,
  height: viewHeight,
  fontSize: cellSize,
  forceSquareRatio: true,
  bg: "black",
  fg: "white"
};

