// ============
// game.mjs
// ============

import {
  viewWidth,
  viewHeight,
  levelWidth,
  levelHeight,
  displayOptions,
  isMobile,
  getDefaultCellSize
} from './config.mjs';

export class Game {
  constructor() {
    // ゲーム状態の初期化
    this.gameOver = false;
    this.currentFloor = 1;
    this.levels = {};         // 各フロアの状態保存
    this.messageHistory = []; // メッセージ履歴を保存する配列

    // レベル生成時の状態変数
    this.map = {};
    this.freeCells = [];
    this.upStairs = null;
    this.downStairs = null;
    this.enemies = [];
    this.healingItems = [];  // 回復アイテム（ポーション）
    this.weaponItems = [];   // 床に落ちた武器
    this.player = null;

    // config からデフォルト値を取得し、拡大縮小で再代入可能な
    // "this.cellSize" プロパティとして持つ
    this.cellSize = getDefaultCellSize();

    // サウンドとセリフ
    this.attackSound = new Audio('wood.mp3');
    this.attackSound.volume = 0.5;
    this.enemyDialogues = [
      'お前の運は尽きた！',
      'これで終わりだ！',
      '死ね！',
      'なめるな！',
      'お前を潰してやる！'
    ];

    // ROT.js の display 初期化
    // displayOptions.fontSize を上書きして使う
    displayOptions.fontSize = this.cellSize;
    this.display = new ROT.Display(displayOptions);

    // キャンバスのサイズをCSS的に指定
    this.updateDisplaySize();
    document.body.appendChild(this.display.getContainer());

    // タッチイベント関連の初期化
    this.touchStartX = null;
    this.touchStartY = null;
    this.swipeThreshold = 30;
    this.registerTouchEvents();

    // キーボードイベント登録
    window.addEventListener('keydown', this.handleKeyDown.bind(this));

    // キャンバスへのクリックイベント登録（敵クリック用）
    const container = this.display.getContainer();
    if (container) {
      container.addEventListener('click', this.onClick.bind(this));
    }

    // 各UIボタンのイベント登録
    const zoomInEl = document.getElementById('zoom-in');
    if (zoomInEl) {
      zoomInEl.addEventListener('click', this.zoomIn.bind(this));
    }
    const zoomOutEl = document.getElementById('zoom-out');
    if (zoomOutEl) {
      zoomOutEl.addEventListener('click', this.zoomOut.bind(this));
    }
    const helpEl = document.getElementById('help');
    if (helpEl) {
      helpEl.addEventListener('click', this.toggleHelp.bind(this));
    }
    const historyToggleEl = document.getElementById('history-toggle');
    if (historyToggleEl) {
      historyToggleEl.addEventListener('click', this.toggleHistory.bind(this));
    }

    // 全体マップ表示用
    this.overviewMode = false;
    this.fullMapDisplay = null;

    // 初期レベル生成
    this.generateLevel();
  }

  // =============================
  // 画面レイアウト関連
  // =============================

  updateDisplaySize() {
    // CSSの幅・高さを指定
    const container = this.display.getContainer();
    container.style.width  = (viewWidth * this.cellSize) + 'px';
    container.style.height = (viewHeight * this.cellSize) + 'px';
  }

  updateDisplay() {
    // 既存の表示キャンバスをDOMから除去
    const oldContainer = this.display.getContainer();
    if (oldContainer && oldContainer.parentNode) {
      oldContainer.parentNode.removeChild(oldContainer);
    }

    // 表示オプションを再設定
    displayOptions.fontSize = this.cellSize;

    // 新たにROT.Display生成
    this.display = new ROT.Display(displayOptions);
    this.updateDisplaySize();
    document.body.appendChild(this.display.getContainer());

    // イベント再登録
    this.registerTouchEvents();
    const newContainer = this.display.getContainer();
    if (newContainer) {
      newContainer.addEventListener('click', this.onClick.bind(this));
    }

    // 再描画
    this.render();
  }

  zoomIn() {
    // 拡大 (必要に応じ制限)
    if (this.cellSize < 64) {
      this.cellSize += 4;
      this.updateDisplay();
    }
  }

  zoomOut() {
    // 縮小 (必要に応じ制限)
    if (this.cellSize > 8) {
      this.cellSize -= 4;
      this.updateDisplay();
    }
  }

  // =============================
  // 入力関連
  // =============================

  handleKeyDown(e) {
    if (this.gameOver) return;
    let dx = 0, dy = 0;

    switch(e.key) {
      case 'ArrowUp':
      case 'w':
      case 'W':
        dy = -1;
        break;
      case 'ArrowDown':
      case 's':
      case 'S':
        dy = 1;
        break;
      case 'ArrowLeft':
      case 'a':
      case 'A':
        dx = -1;
        break;
      case 'ArrowRight':
      case 'd':
      case 'D':
        dx = 1;
        break;
      case 'u':
      case 'U':
        this.useHealingItem();
        return;
      case 'e':
      case 'E':
        this.equipWeapon();
        return;
      case 'h':
      case 'H':
        this.toggleHelp();
        return;
      case 'm':
      case 'M':
        this.toggleOverview();
        return;
      default:
        return;
    }
    if (dx !== 0 || dy !== 0) {
      this.movePlayer(dx, dy);
      e.preventDefault();
    }
  }

  registerTouchEvents() {
    const container = this.display.getContainer();
    if (container) {
      // passive: false にすることで preventDefault() を有効に
      container.addEventListener('touchstart', this.onTouchStart.bind(this), { passive: false });
      container.addEventListener('touchend',   this.onTouchEnd.bind(this),   { passive: false });
    }
  }

  onTouchStart(e) {
    // UI要素をタップした場合はゲーム操作をしない
    if (
      e.target.closest('#zoom-controls') ||
      e.target.closest('#history-controls') ||
      e.target.closest('#help') ||
      e.target.closest('#message-history-overlay')
    ) {
      return;
    }

    const touch = e.touches[0];
    this.touchStartX = touch.clientX;
    this.touchStartY = touch.clientY;
    e.preventDefault();
  }

  onTouchEnd(e) {
    if (this.touchStartX === null || this.touchStartY === null) return;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - this.touchStartX;
    const deltaY = touch.clientY - this.touchStartY;

    // スワイプ判定
    if (Math.abs(deltaX) < this.swipeThreshold && Math.abs(deltaY) < this.swipeThreshold) {
      // スワイプが短ければタップ扱い
      this.handleInteraction(touch.clientX, touch.clientY);
      this.touchStartX = null;
      this.touchStartY = null;
      return;
    }

    // スワイプ移動
    let angle = Math.atan2(deltaY, deltaX);
    const step = Math.PI / 4;
    let normalized = (angle + 2 * Math.PI) % (2 * Math.PI);
    const offsetAngle = 3 * Math.PI / 2;
    let adjustedAngle = (normalized - offsetAngle + 2 * Math.PI) % (2 * Math.PI);
    let index = Math.floor((adjustedAngle + step / 2) / step) % 8;
    const dir = ROT.DIRS[8][index];
    this.autoRun(dir);

    this.touchStartX = null;
    this.touchStartY = null;
    e.preventDefault();
  }

  // キャンバスクリック（敵選択など）
  onClick(e) {
    this.handleInteraction(e.clientX, e.clientY);
  }

  handleInteraction(clientX, clientY) {
    const container = this.display.getContainer();
    const rect = container.getBoundingClientRect();
    const xPixel = clientX - rect.left;
    const yPixel = clientY - rect.top;

    // this.cellSize で割り算してセル座標に
    const cellX = Math.floor(xPixel / this.cellSize);
    const cellY = Math.floor(yPixel / this.cellSize);

    const centerX = Math.floor(viewWidth / 2);
    const centerY = Math.floor(viewHeight / 2);
    const offsetX = centerX - this.player.x;
    const offsetY = centerY - this.player.y;

    // マップ上の座標
    const mapX = cellX - offsetX;
    const mapY = cellY - offsetY;

    // 敵判定
    const enemy = this.enemies.find(e => e.x === mapX && e.y === mapY);
    if (enemy) {
      this.enemies.forEach(e => e.selected = false);
      enemy.selected = true;
      this.showEnemyStatus(enemy);
      this.render();
    } else {
      this.enemies.forEach(e => e.selected = false);
      this.clearEnemyStatus();
      this.render();
    }
  }

  // =============================
  // ゲームロジック
  // =============================

  movePlayer(dx, dy) {
    if (this.gameOver) return;
    const newX = this.player.x + dx;
    const newY = this.player.y + dy;
    const newKey = `${newX},${newY}`;

    // 階段判定
    if ((this.downStairs && newX === this.downStairs.x && newY === this.downStairs.y) ||
        (this.upStairs   && newX === this.upStairs.x   && newY === this.upStairs.y)) {
      this.changeFloor((this.downStairs && newX === this.downStairs.x) ? 'down' : 'up');
      return;
    }

    // 敵判定
    const enemy = this.enemies.find(e => e.x === newX && e.y === newY);
    if (enemy) {
      this.playerAttack(enemy);
      this.render();
      return;
    }

    // 通路・部屋判定
    if (this.map[newKey] !== '.') return;

    // 移動後、敵も動かす
    this.player.x = newX;
    this.player.y = newY;
    this.checkPickup();
    this.moveEnemies();
    this.render();
  }

  autoRun(dir) {
    // スワイプで一気に移動する機能
    if (this.gameOver) return;
    this.movePlayer(dir[0], dir[1]);
    const fovCells = this.computeFov();
    const enemyVisible = this.enemies.some(e => fovCells[`${e.x},${e.y}`]);
    if (enemyVisible) return; // 敵が見えたら止まる

    // 回り道が多い場所では止まる
    let freeCount = 0;
    const { x, y } = this.player;
    ROT.DIRS[8].forEach(d => {
      const nx = x + d[0];
      const ny = y + d[1];
      if (this.map[`${nx},${ny}`] === '.') freeCount++;
    });
    if (freeCount > 2) return;

    // 再帰的に移動
    setTimeout(() => { this.autoRun(dir); }, 150);
  }

  moveEnemies() {
    this.enemies.forEach(enemy => {
      const dx = enemy.x - this.player.x;
      const dy = enemy.y - this.player.y;
      const dist = Math.sqrt(dx * dx + dy * dy);

      // プレイヤーが近いと敵が警戒
      if (!enemy.alerted) {
        if (dist <= enemy.senseRadius) {
          enemy.alerted = true;
        } else {
          return;
        }
      }

      // 隣接なら攻撃
      if (Math.abs(enemy.x - this.player.x) <= 1 && Math.abs(enemy.y - this.player.y) <= 1) {
        this.enemyAttack(enemy);
        return;
      }

      // A* でプレイヤーに向かって移動
      const astar = new ROT.Path.AStar(
        this.player.x,
        this.player.y,
        (x, y) => {
          return this.map[`${x},${y}`] === '.';
        },
        { topology: 8 }
      );

      const path = [];
      astar.compute(enemy.x, enemy.y, (x, y) => {
        path.push({ x, y });
      });
      if (path.length > 1) {
        enemy.x = path[1].x;
        enemy.y = path[1].y;
      }
    });
  }

  generateLevel(forcedUpStairs = null, forcedDownStairs = null) {
    // 既に生成済みならロード
    if (this.levels[this.currentFloor]) {
      const levelData = this.levels[this.currentFloor];
      this.map          = levelData.map;
      this.freeCells    = levelData.freeCells;
      this.upStairs     = levelData.upStairs;
      this.downStairs   = levelData.downStairs;
      this.enemies      = levelData.enemies;
      this.healingItems = levelData.healingItems || [];
      this.weaponItems  = levelData.weaponItems  || [];
      if (levelData.playerPos) {
        this.player.x = levelData.playerPos.x;
        this.player.y = levelData.playerPos.y;
      }
      this.render();
      return;
    }

    // 新規生成
    this.map = {};
    this.freeCells = [];
    const digger = new ROT.Map.Digger(levelWidth, levelHeight);
    digger.create((x, y, value) => {
      const key = `${x},${y}`;
      if (value) {
        this.map[key] = '#';
      } else {
        this.map[key] = '.';
        this.freeCells.push({ x, y });
      }
    });

    // 上下階段
    if (this.currentFloor === 1) {
      this.downStairs = this.getRandomFreeCell();
      this.upStairs = null; // 1Fには上階段を作らない
    } else {
      // 上階段
      this.upStairs = (
        forcedUpStairs &&
        this.freeCells.find(cell => cell.x === forcedUpStairs.x && cell.y === forcedUpStairs.y)
      )
        ? forcedUpStairs
        : (forcedUpStairs ? this.getNearestFreeCell(forcedUpStairs) : this.getRandomFreeCell());

      // 下階段
      if (forcedDownStairs) {
        this.downStairs = (
          this.freeCells.find(cell => cell.x === forcedDownStairs.x && cell.y === forcedDownStairs.y)
        )
          ? forcedDownStairs
          : this.getNearestFreeCell(forcedDownStairs);
      } else {
        do {
          this.downStairs = this.getRandomFreeCell();
        } while (
          this.downStairs.x === this.upStairs.x &&
          this.downStairs.y === this.upStairs.y
        );
      }
    }

    // プレイヤー初期位置
    if (!this.player) {
      const start = this.getRandomFreeCellExcluding([this.upStairs, this.downStairs]);
      this.player = {
        x: start.x,
        y: start.y,
        hp: 20,
        maxHp: 20,
        level: 1,
        exp: 0,
        nextExp: 20,
        inventory: [],
        weapons: [],
        equippedWeapon: null
      };
    }

    // 敵生成
    this.enemies = [];
    const enemyCount = 3;
    const enemyTypes = [
      {
        type: 'Goblin',
        symbol: 'g',
        color: 'green',
        baseHp: 8,
        senseRadius: 6,
        drop: { name: 'Rusty Dagger', bonus: 1, symbol: 'd', color: 'white' }
      },
      {
        type: 'Orc',
        symbol: 'o',
        color: 'orange',
        baseHp: 12,
        senseRadius: 8,
        drop: { name: 'Orcish Axe', bonus: 2, symbol: 'A', color: 'brown' }
      },
      {
        type: 'Troll',
        symbol: 'T',
        color: 'darkgreen',
        baseHp: 20,
        senseRadius: 10,
        drop: { name: 'Heavy Club', bonus: 3, symbol: 'C', color: 'gray' }
      }
    ];

    while (this.enemies.length < enemyCount) {
      const cell = this.getRandomFreeCellExcluding([
        this.upStairs, this.downStairs, this.player
      ]);
      if (!cell) break;
      const enemyType = enemyTypes[Math.floor(ROT.RNG.getUniform() * enemyTypes.length)];
      cell.hp = enemyType.baseHp + (this.currentFloor - 1) * 2;
      cell.level = this.currentFloor;
      cell.symbol = enemyType.symbol;
      cell.color = enemyType.color;
      cell.senseRadius = enemyType.senseRadius;
      cell.drop = enemyType.drop;
      cell.name = enemyType.type;
      cell.alerted = false;
      cell.selected = false;
      this.enemies.push(cell);
    }

    // アイテム配置
    this.healingItems = [];
    const healingItemCount = 3;
    while (this.healingItems.length < healingItemCount) {
      const cell = this.getRandomFreeCellExcluding([
        this.upStairs, this.downStairs, this.player,
        ...this.enemies, ...this.healingItems
      ]);
      if (!cell) break;
      cell.amount = 10;
      this.healingItems.push(cell);
    }

    // 武器アイテム配置（初期はなし）
    this.weaponItems = [];

    // フロア情報を保存
    this.levels[this.currentFloor] = {
      map: this.map,
      freeCells: this.freeCells,
      upStairs: this.upStairs,
      downStairs: this.downStairs,
      enemies: this.enemies,
      healingItems: this.healingItems,
      weaponItems: this.weaponItems,
      playerPos: { x: this.player.x, y: this.player.y }
    };

    this.render();
  }

  // =============================
  // 描画関連
  // =============================

  render() {
    // メインの表示
    this.display.clear();

    const centerX = Math.floor(viewWidth / 2);
    const centerY = Math.floor(viewHeight / 2);
    const offsetX = centerX - this.player.x;
    const offsetY = centerY - this.player.y;

    const visibleCells = this.computeFov();

    this.drawMap(offsetX, offsetY, visibleCells);
    this.drawStairs(offsetX, offsetY);
    this.drawHealingItems(offsetX, offsetY, visibleCells);
    this.drawWeaponItems(offsetX, offsetY, visibleCells);
    this.drawEnemies(offsetX, offsetY, visibleCells);
    this.drawPlayer(offsetX, offsetY);
    this.updateStatus();

    // 全体マップ
    if (this.overviewMode && this.fullMapDisplay) {
      this.renderFullMap();
      const fullMapContainer = document.getElementById('fullmap');
      fullMapContainer.innerHTML = '';
      fullMapContainer.appendChild(this.fullMapDisplay.getContainer());
    }
  }

  drawMap(offsetX, offsetY, visibleCells) {
    for (let key in this.map) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr) + offsetX;
      const y = parseInt(yStr) + offsetY;
      let color;

      if (visibleCells[key]) {
        color = (this.map[key] === '#') ? 'grey' : 'lightgrey';
      } else {
        color = (this.map[key] === '#') ? 'darkslategray' : 'dimgray';
      }
      this.display.draw(x, y, this.map[key], color);
    }
  }

  drawStairs(offsetX, offsetY) {
    if (this.upStairs) {
      this.display.draw(
        this.upStairs.x + offsetX,
        this.upStairs.y + offsetY,
        '<',
        'lightblue'
      );
    }
    if (this.downStairs) {
      this.display.draw(
        this.downStairs.x + offsetX,
        this.downStairs.y + offsetY,
        '>',
        'lightblue'
      );
    }
  }

  drawHealingItems(offsetX, offsetY, visibleCells) {
    this.healingItems.forEach(item => {
      const key = `${item.x},${item.y}`;
      if (visibleCells[key]) {
        this.display.draw(
          item.x + offsetX,
          item.y + offsetY,
          '!',
          'green'
        );
      }
    });
  }

  drawWeaponItems(offsetX, offsetY, visibleCells) {
    this.weaponItems.forEach(weapon => {
      const key = `${weapon.x},${weapon.y}`;
      if (visibleCells[key]) {
        this.display.draw(
          weapon.x + offsetX,
          weapon.y + offsetY,
          weapon.symbol,
          weapon.color
        );
      }
    });
  }

  drawEnemies(offsetX, offsetY, visibleCells) {
    this.enemies.forEach(enemy => {
      const key = `${enemy.x},${enemy.y}`;
      if (visibleCells[key]) {
        if (enemy.selected) {
          // 背景を赤に
          this.display.draw(enemy.x + offsetX, enemy.y + offsetY, enemy.symbol, enemy.color, 'red');
        } else {
          this.display.draw(enemy.x + offsetX, enemy.y + offsetY, enemy.symbol, enemy.color);
        }
      }
    });
  }

  drawPlayer(offsetX, offsetY) {
    this.display.draw(
      this.player.x + offsetX,
      this.player.y + offsetY,
      '@',
      'yellow'
    );
  }

  computeFov() {
    const visibleCells = {};
    const fov = new ROT.FOV.PreciseShadowcasting((x, y) => {
      return this.map[`${x},${y}`] !== '#';
    });
    fov.compute(this.player.x, this.player.y, 5, (x, y) => {
      visibleCells[`${x},${y}`] = true;
    });
    return visibleCells;
  }

  // =============================
  // 表示メッセージ / ステータス関連
  // =============================

  updateStatus() {
    document.getElementById('status').innerText =
      `HP: ${this.player.hp}/${this.player.maxHp}  ` +
      `Floor: ${this.currentFloor}  ` +
      `Level: ${this.player.level}  ` +
      `EXP: ${this.player.exp}/${this.player.nextExp}  ` +
      `Potions: ${this.player.inventory.length}  ` +
      `Weapon: ${this.player.equippedWeapon ? this.player.equippedWeapon.name : 'None'}`;
  }

  showDialogue(message) {
    this.messageHistory.push(message);
    const dialogue = document.getElementById('dialogue');
    dialogue.innerText = message;
    dialogue.style.display = 'block';
    setTimeout(() => {
      dialogue.style.display = 'none';
    }, 2000);
  }

  showEnemyStatus(enemy) {
    const enemyStatusEl = document.getElementById('enemy-status');
    enemyStatusEl.innerText = `Enemy: ${enemy.name}   HP: ${enemy.hp}`;
    enemyStatusEl.style.display = 'block';
  }

  clearEnemyStatus() {
    const enemyStatusEl = document.getElementById('enemy-status');
    enemyStatusEl.style.display = 'none';
  }

  updateMessageHistoryOverlay() {
    const contentEl = document.getElementById('message-history-content');
    let html = '<ul>';
    this.messageHistory.forEach(msg => {
      html += `<li>${msg}</li>`;
    });
    html += '</ul>';
    contentEl.innerHTML = html;
  }

  toggleHelp() {
    const helpEl = document.getElementById('help');
    helpEl.style.display = (helpEl.style.display === 'block') ? 'none' : 'block';
  }

  toggleHistory() {
    const overlay = document.getElementById('message-history-overlay');
    if (overlay.style.display === 'block') {
      overlay.style.display = 'none';
    } else {
      this.updateMessageHistoryOverlay();
      overlay.style.display = 'block';
    }
  }

  // =============================
  // 戦闘・アイテム・経験値
  // =============================

  showAttackEffect(x, y) {
    const frames = [
      { symbol: '!', color: 'orange' },
      { symbol: '*', color: 'red' },
      { symbol: '!', color: 'yellow' }
    ];
    let frame = 0;
    const centerX = Math.floor(viewWidth / 2);
    const centerY = Math.floor(viewHeight / 2);
    const offsetX = centerX - this.player.x;
    const offsetY = centerY - this.player.y;

    const interval = setInterval(() => {
      if (frame < frames.length) {
        this.display.draw(
          x + offsetX,
          y + offsetY,
          frames[frame].symbol,
          frames[frame].color
        );
        frame++;
      } else {
        clearInterval(interval);
        this.render();
      }
    }, 100);
  }

  playerAttack(enemy) {
    const bonus = this.player.equippedWeapon ? this.player.equippedWeapon.bonus : 0;
    const damage = 5 + bonus;

    this.attackSound.currentTime = 0;
    this.attackSound.play().catch(e => console.error('Sound playback error:', e));
    this.showAttackEffect(enemy.x, enemy.y);

    enemy.hp -= damage;
    if (enemy.hp <= 0) {
      // 敵死亡
      this.enemies = this.enemies.filter(e => e !== enemy);
      this.gainExperience(10);
      if (enemy.drop) {
        const droppedItem = { ...enemy.drop };
        droppedItem.x = enemy.x;
        droppedItem.y = enemy.y;
        this.weaponItems.push(droppedItem);
        this.showDialogue(`Enemy dropped a ${droppedItem.name}!`);
      }
      this.clearEnemyStatus();
    }
  }

  enemyAttack(enemy) {
    this.attackSound.currentTime = 0;
    this.attackSound.play().catch(e => console.error('Sound playback error:', e));

    const msg = this.enemyDialogues[Math.floor(Math.random() * this.enemyDialogues.length)];
    this.enemySpeak(msg);
    this.showAttackEffect(this.player.x, this.player.y);

    const damage = 3;
    this.player.hp -= damage;
    if (this.player.hp <= 0) {
      this.gameOver = true;
    }
  }

  enemySpeak(message) {
    const dialogue = document.getElementById('dialogue');
    dialogue.innerText = message;
    dialogue.style.display = 'block';
    setTimeout(() => {
      dialogue.style.display = 'none';
    }, 3000);
  }

  checkPickup() {
    // 回復アイテム
    for (let i = 0; i < this.healingItems.length; i++) {
      if (this.player.x === this.healingItems[i].x && this.player.y === this.healingItems[i].y) {
        this.player.inventory.push(this.healingItems[i]);
        this.healingItems.splice(i, 1);
        i--;
        this.showDialogue('Healing potion picked up!');
      }
    }

    // 武器アイテム
    for (let i = 0; i < this.weaponItems.length; i++) {
      if (this.player.x === this.weaponItems[i].x && this.player.y === this.weaponItems[i].y) {
        this.player.weapons.push(this.weaponItems[i]);
        this.weaponItems.splice(i, 1);
        i--;
        const newWeapon = this.player.weapons[this.player.weapons.length - 1];
        this.showDialogue(`Picked up a ${newWeapon.name}!`);
      }
    }
  }

  useHealingItem() {
    if (this.player.inventory.length > 0) {
      const potion = this.player.inventory.shift();
      const healAmount = potion.amount;
      const oldHp = this.player.hp;
      this.player.hp = Math.min(this.player.hp + healAmount, this.player.maxHp);
      this.showDialogue(`Used healing potion: HP ${oldHp} -> ${this.player.hp}`);
    } else {
      this.showDialogue('No healing potions!');
    }
  }

  equipWeapon() {
    if (this.player.weapons.length === 0) {
      this.showDialogue('No weapons in inventory!');
      return;
    }
    let list = '';
    for (let i = 0; i < this.player.weapons.length; i++) {
      const w = this.player.weapons[i];
      list += `${i}: ${w.name} (Bonus: +${w.bonus})\n`;
    }
    const input = window.prompt(`Choose weapon to equip:\n${list}`, '0');
    if (input !== null) {
      const index = parseInt(input);
      if (!isNaN(index) && index >= 0 && index < this.player.weapons.length) {
        this.player.equippedWeapon = this.player.weapons[index];
        this.showDialogue(`Equipped ${this.player.equippedWeapon.name}!`);
      } else {
        this.showDialogue('Invalid choice!');
      }
    }
  }

  gainExperience(amount) {
    this.player.exp += amount;
    while (this.player.exp >= this.player.nextExp) {
      this.player.exp -= this.player.nextExp;
      this.player.level++;
      this.player.nextExp = Math.floor(this.player.nextExp * 1.5);
      this.player.maxHp += 5;
      this.player.hp = this.player.maxHp;
    }
    this.updateStatus();
  }

  // =============================
  // フロア移動
  // =============================

  changeFloor(direction) {
    if (!this.levels[this.currentFloor]) {
      this.levels[this.currentFloor] = {};
    }

    // 現在フロアのプレイヤー位置などを保存
    this.levels[this.currentFloor].playerPos = { x: this.player.x, y: this.player.y };
    this.levels[this.currentFloor].healingItems = this.healingItems;
    this.levels[this.currentFloor].weaponItems = this.weaponItems;

    if (direction === 'down') {
      // 下へ
      const forced = this.levels[this.currentFloor].downStairs;
      this.currentFloor++;
      this.generateLevel(forced, null);
      // 次フロアでは上階段の場所にプレイヤーを配置
      this.player.x = this.upStairs.x;
      this.player.y = this.upStairs.y;
      this.levels[this.currentFloor].playerPos = { x: this.player.x, y: this.player.y };
    } else if (direction === 'up') {
      // 上へ
      if (this.currentFloor === 1) return; // 1Fから上は行けない
      const forced = this.levels[this.currentFloor].upStairs;
      this.currentFloor--;
      this.generateLevel(null, forced);
      // 前フロアでは下階段の場所にプレイヤーを配置
      this.player.x = this.downStairs.x;
      this.player.y = this.downStairs.y;
      this.levels[this.currentFloor].playerPos = { x: this.player.x, y: this.player.y };
    }
    this.render();
  }

  // =============================
  // 全体マップ
  // =============================

  toggleOverview() {
    this.overviewMode = !this.overviewMode;
    const fullMapContainer = document.getElementById('fullmap');
    if (this.overviewMode) {
      if (!this.fullMapDisplay) {
        this.fullMapDisplay = new ROT.Display({
          width: levelWidth,
          height: levelHeight,
          fontSize: 4,
          forceSquareRatio: true,
          bg: 'black',
          fg: 'white'
        });
      }
      this.renderFullMap();
      fullMapContainer.innerHTML = '';
      fullMapContainer.appendChild(this.fullMapDisplay.getContainer());
      fullMapContainer.style.display = 'block';
    } else {
      fullMapContainer.style.display = 'none';
    }
  }

  renderFullMap() {
    if (!this.fullMapDisplay) return;
    this.fullMapDisplay.clear();

    // タイル描画
    for (let key in this.map) {
      const [xStr, yStr] = key.split(',');
      const x = parseInt(xStr);
      const y = parseInt(yStr);
      const tile = this.map[key];
      let color = tile === '#' ? 'grey' : 'lightgrey';
      this.fullMapDisplay.draw(x, y, tile, color);
    }

    // 階段
    if (this.upStairs) {
      this.fullMapDisplay.draw(
        this.upStairs.x,
        this.upStairs.y,
        '<',
        'lightblue'
      );
    }
    if (this.downStairs) {
      this.fullMapDisplay.draw(
        this.downStairs.x,
        this.downStairs.y,
        '>',
        'lightblue'
      );
    }

    // アイテム
    this.healingItems.forEach(item => {
      this.fullMapDisplay.draw(
        item.x,
        item.y,
        '!',
        'green'
      );
    });
    this.weaponItems.forEach(weapon => {
      this.fullMapDisplay.draw(
        weapon.x,
        weapon.y,
        weapon.symbol,
        weapon.color
      );
    });

    // 敵
    this.enemies.forEach(enemy => {
      this.fullMapDisplay.draw(
        enemy.x,
        enemy.y,
        enemy.symbol,
        enemy.color
      );
    });

    // プレイヤー
    this.fullMapDisplay.draw(
      this.player.x,
      this.player.y,
      '@',
      'yellow'
    );
  }
}

