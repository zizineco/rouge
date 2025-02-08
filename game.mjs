// game.mjs
// プレイヤーステータス(#status)がCanvasの下にならないよう、CSSで #status { z-index: 9999; position: fixed; } に修正
// これによりプレイヤーステータスが常に前面に表示されます。

import {
  levelWidth,
  levelHeight,
  displayOptions
} from './config.mjs';

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max);
}

export class Game {
  constructor() {
    this.gameOver = false;
    this.currentFloor = 1;
    this.levels = {};
    this.messageHistory = [];

    // マップ情報
    this.map = {};
    this.freeCells = [];
    this.upStairs = null;
    this.downStairs = null;
    this.enemies = [];
    this.healingItems = [];
    this.weaponItems = [];
    this.player = null;

    this.cellSize = 16;

    this.attackSound = new Audio('wood.mp3');
    this.attackSound.volume = 0.5;
    this.enemyDialogues = [
      'お前の運は尽きた！',
      'これで終わりだ！',
      '死ね！',
      'なめるな！',
      'お前を潰してやる！'
    ];

    // レベル生成
    this.generateLevel();

    // ROT.Display
    this.display = new ROT.Display(displayOptions);

    const container = this.display.getContainer();
    container.style.position = 'absolute';
    container.style.top = '0';
    container.style.left = '0';
    document.body.appendChild(container);

    // ウィンドウリサイズ
    window.addEventListener('resize', this.resizeToFit.bind(this));
    this.resizeToFit();

    // キーボード
    window.addEventListener('keydown', this.handleKeyDown.bind(this));

    // タッチ
    this.touchStartX = null;
    this.touchStartY = null;
    this.registerTouchEvents();

    // UIボタン
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

    this.overviewMode = false;
    this.fullMapDisplay = null;

    // 初回描画
    this.render();
  }

  resizeToFit() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    let newWidthCells = Math.floor(w / this.cellSize);
    let newHeightCells= Math.floor(h / this.cellSize);

    newWidthCells  = clamp(newWidthCells, 10, 120);
    newHeightCells = clamp(newHeightCells, 10, 60);

    this.display.setOptions({
      width: newWidthCells,
      height: newHeightCells,
      fontSize: this.cellSize
    });

    this.render();
  }

  zoomIn() {
    let desired = this.cellSize + 4;
    desired = clamp(desired, 4, 80);
    this.cellSize = desired;
    this.resizeToFit();
  }

  zoomOut() {
    let desired = this.cellSize - 4;
    desired = clamp(desired, 4, 80);
    this.cellSize = desired;
    this.resizeToFit();
  }

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

    if(dx!==0 || dy!==0) {
      this.movePlayer(dx, dy);
      e.preventDefault();
    }
  }

  movePlayer(dx, dy) {
    if (this.gameOver) return;
    const newX = this.player.x + dx;
    const newY = this.player.y + dy;
    const newKey = `${newX},${newY}`;

    // 階段
    if ((this.downStairs && newX===this.downStairs.x && newY===this.downStairs.y) ||
        (this.upStairs   && newX===this.upStairs.x   && newY===this.upStairs.y)) {
      this.changeFloor((this.downStairs && newX===this.downStairs.x)?'down':'up');
      return;
    }

    // 敵
    const enemy = this.enemies.find(e=> e.x===newX && e.y===newY);
    if (enemy) {
      this.playerAttack(enemy);
      this.render();
      return;
    }

    // 壁判定
    if (this.map[newKey]!=='.') {
      return;
    }

    // 通路
    this.player.x = newX;
    this.player.y = newY;

    this.checkPickup();
    this.moveEnemies();
    this.render();
  }

  registerTouchEvents() {
    const container = this.display.getContainer();
    if(!container)return;

    container.addEventListener('touchstart', e => {
      if(
        e.target.closest('#zoom-controls')||
        e.target.closest('#history-controls')||
        e.target.closest('#help')||
        e.target.closest('#message-history-overlay')
      ){
        return;
      }
      const touch=e.touches[0];
      this.touchStartX = touch.clientX;
      this.touchStartY = touch.clientY;
      e.preventDefault();
    },{passive:false});

    container.addEventListener('touchend', e => {
      if(this.touchStartX===null||this.touchStartY===null)return;
      const touch=e.changedTouches[0];
      this.handleInteraction(touch.clientX,touch.clientY);
      this.touchStartX=null;
      this.touchStartY=null;
      e.preventDefault();
    },{passive:false});

    container.addEventListener('click', this.onClick.bind(this));
  }

  onClick(e) {
    this.handleInteraction(e.clientX, e.clientY);
  }

  handleInteraction(clientX, clientY){
    const container=this.display.getContainer();
    const rect=container.getBoundingClientRect();
    const xPixel= clientX - rect.left;
    const yPixel= clientY - rect.top;

    const opts=this.display.getOptions();
    const screenW=opts.width;
    const screenH=opts.height;
    const cellSize=opts.fontSize;

    const centerX=Math.floor(screenW/2);
    const centerY=Math.floor(screenH/2);

    const cellX=Math.floor(xPixel/cellSize);
    const cellY=Math.floor(yPixel/cellSize);

    const offsetX= centerX - this.player.x;
    const offsetY= centerY - this.player.y;

    const mapX= cellX - offsetX;
    const mapY= cellY - offsetY;

    const enemy = this.enemies.find(en=>en.x===mapX&&en.y===mapY);
    if(enemy){
      this.enemies.forEach(e=> e.selected=false);
      enemy.selected=true;
      this.showEnemyStatus(enemy);
      this.render();
    } else {
      this.enemies.forEach(e=> e.selected=false);
      this.clearEnemyStatus();
      this.render();
    }
  }

  moveEnemies() {
    this.enemies.forEach(enemy=>{
      const dx= enemy.x - this.player.x;
      const dy= enemy.y - this.player.y;
      const dist= Math.sqrt(dx*dx+dy*dy);

      if(!enemy.alerted){
        if(dist<= enemy.senseRadius){
          enemy.alerted=true;
        } else {
          return;
        }
      }

      if(Math.abs(dx)<=1 && Math.abs(dy)<=1){
        this.enemyAttack(enemy);
        return;
      }

      const astar=new ROT.Path.AStar(
        this.player.x,
        this.player.y,
        (x,y)=> this.map[`${x},${y}`]==='.',
        { topology:8 }
      );
      const path=[];
      astar.compute(enemy.x, enemy.y,(x,y)=>{
        path.push({x,y});
      });
      if(path.length>1){
        enemy.x= path[1].x;
        enemy.y= path[1].y;
      }
    });
  }

  generateLevel(forcedUpStairs=null, forcedDownStairs=null){
    if(this.levels[this.currentFloor]){
      const levelData=this.levels[this.currentFloor];
      this.map=levelData.map;
      this.freeCells=levelData.freeCells;
      this.upStairs=levelData.upStairs;
      this.downStairs=levelData.downStairs;
      this.enemies=levelData.enemies;
      this.healingItems=levelData.healingItems||[];
      this.weaponItems=levelData.weaponItems||[];
      if(levelData.playerPos){
        if(!this.player){
          this.player={
            x:levelData.playerPos.x,
            y:levelData.playerPos.y,
            hp:20,
            maxHp:20,
            level:1,
            exp:0,
            nextExp:20,
            inventory:[],
            weapons:[],
            equippedWeapon:null
          };
        } else {
          this.player.x=levelData.playerPos.x;
          this.player.y=levelData.playerPos.y;
        }
      }
      return;
    }

    this.map={};
    this.freeCells=[];
    const digger=new ROT.Map.Digger(levelWidth, levelHeight);
    digger.create((x,y,value)=>{
      const key=`${x},${y}`;
      if(value){
        this.map[key]='#';
      } else {
        this.map[key]='.';
        this.freeCells.push({x,y});
      }
    });

    if(this.currentFloor===1){
      this.downStairs=this.getRandomFreeCell();
      this.upStairs=null;
    } else {
      this.upStairs= forcedUpStairs?
        (this.freeCells.find(c=> c.x===forcedUpStairs.x && c.y===forcedUpStairs.y)
         ? forcedUpStairs : this.getNearestFreeCell(forcedUpStairs))
        : this.getRandomFreeCell();

      if(forcedDownStairs){
        this.downStairs=(this.freeCells.find(c=> c.x===forcedDownStairs.x&&c.y===forcedDownStairs.y)
                        ?forcedDownStairs:this.getNearestFreeCell(forcedDownStairs));
      } else {
        do{
          this.downStairs=this.getRandomFreeCell();
        }while(
          this.downStairs.x===this.upStairs?.x &&
          this.downStairs.y===this.upStairs?.y
        );
      }
    }

    if(!this.player){
      const start=this.getRandomFreeCellExcluding([]);
      this.player={
        x:start.x,
        y:start.y,
        hp:20,
        maxHp:20,
        level:1,
        exp:0,
        nextExp:20,
        inventory:[],
        weapons:[],
        equippedWeapon:null
      };
    }

    this.enemies=[];
    const enemyCount=3;
    const enemyTypes=[
      {
        type:'Goblin', symbol:'g', color:'green', baseHp:8,
        senseRadius:6, drop:{ name:'Rusty Dagger', bonus:1, symbol:'d', color:'white'}
      },
      {
        type:'Orc', symbol:'o', color:'orange', baseHp:12,
        senseRadius:8, drop:{ name:'Orcish Axe', bonus:2, symbol:'A', color:'brown'}
      },
      {
        type:'Troll', symbol:'T', color:'darkgreen', baseHp:20,
        senseRadius:10, drop:{ name:'Heavy Club', bonus:3, symbol:'C', color:'gray'}
      }
    ];

    while(this.enemies.length<enemyCount){
      const cell=this.getRandomFreeCellExcluding([
        this.upStairs,this.downStairs,this.player
      ]);
      if(!cell)break;
      const et= enemyTypes[Math.floor(ROT.RNG.getUniform()*enemyTypes.length)];
      cell.hp=et.baseHp;
      cell.level=this.currentFloor;
      cell.symbol=et.symbol;
      cell.color=et.color;
      cell.senseRadius=et.senseRadius;
      cell.drop=et.drop;
      cell.name=et.type;
      cell.alerted=false;
      cell.selected=false;
      this.enemies.push(cell);
    }

    this.healingItems=[];
    const healingItemCount=3;
    while(this.healingItems.length<healingItemCount){
      const cell=this.getRandomFreeCellExcluding([
        this.upStairs,this.downStairs,this.player,
        ...this.enemies,...this.healingItems
      ]);
      if(!cell)break;
      cell.amount=10;
      this.healingItems.push(cell);
    }

    this.weaponItems=[];

    this.levels[this.currentFloor]={
      map:this.map,
      freeCells:this.freeCells,
      upStairs:this.upStairs,
      downStairs:this.downStairs,
      enemies:this.enemies,
      healingItems:this.healingItems,
      weaponItems:this.weaponItems,
      playerPos:{ x:this.player.x, y:this.player.y }
    };
  }

  getRandomFreeCell(){
    if(this.freeCells.length===0)return null;
    return this.freeCells[Math.floor(ROT.RNG.getUniform()*this.freeCells.length)];
  }

  getRandomFreeCellExcluding(exclusions=[]){
    const candidates=this.freeCells.filter(cell=>{
      return !exclusions.some(ex=>ex&&cell.x===ex.x&&cell.y===ex.y);
    });
    if(!candidates.length)return null;
    return candidates[Math.floor(ROT.RNG.getUniform()*candidates.length)];
  }

  getNearestFreeCell(target){
    let minDist=Infinity; let nearest=null;
    this.freeCells.forEach(cell=>{
      const dx=cell.x-target.x;
      const dy=cell.y-target.y;
      const dist=Math.sqrt(dx*dx+dy*dy);
      if(dist<minDist){
        minDist=dist;
        nearest=cell;
      }
    });
    return nearest;
  }

  render(){
    if(!this.player)return;
    this.display.clear();

    const opts=this.display.getOptions();
    const screenW=opts.width;
    const screenH=opts.height;

    const centerX=Math.floor(screenW/2);
    const centerY=Math.floor(screenH/2);

    const offsetX=centerX-this.player.x;
    const offsetY=centerY-this.player.y;

    const visibleCells=this.computeFov();

    this.drawMap(offsetX,offsetY,visibleCells);
    this.drawStairs(offsetX,offsetY);
    this.drawHealingItems(offsetX,offsetY,visibleCells);
    this.drawWeaponItems(offsetX,offsetY,visibleCells);
    this.drawEnemies(offsetX,offsetY,visibleCells);
    this.drawPlayer(offsetX,offsetY);

    this.updateStatus();

    if(this.overviewMode&&this.fullMapDisplay){
      this.renderFullMap();
      const fullMapContainer=document.getElementById('fullmap');
      fullMapContainer.innerHTML='';
      fullMapContainer.appendChild(this.fullMapDisplay.getContainer());
    }
  }

  drawMap(offsetX,offsetY,visibleCells){
    for(const key in this.map){
      const [xStr,yStr]=key.split(',');
      const mapX=parseInt(xStr);
      const mapY=parseInt(yStr);
      const screenX=mapX+offsetX;
      const screenY=mapY+offsetY;

      let color;
      if(visibleCells[key]){
        color=(this.map[key]==='#')?'grey':'lightgrey';
      } else {
        color=(this.map[key]==='#')?'darkslategray':'dimgray';
      }
      this.display.draw(screenX,screenY,this.map[key],color);
    }
  }

  drawStairs(offsetX,offsetY){
    if(this.upStairs){
      this.display.draw(
        this.upStairs.x+offsetX,
        this.upStairs.y+offsetY,
        '<','lightblue'
      );
    }
    if(this.downStairs){
      this.display.draw(
        this.downStairs.x+offsetX,
        this.downStairs.y+offsetY,
        '>','lightblue'
      );
    }
  }

  drawHealingItems(offsetX,offsetY,visibleCells){
    this.healingItems.forEach(item=>{
      const key=`${item.x},${item.y}`;
      if(visibleCells[key]){
        this.display.draw(item.x+offsetX,item.y+offsetY,'!', 'green');
      }
    });
  }

  drawWeaponItems(offsetX,offsetY,visibleCells){
    this.weaponItems.forEach(w=>{
      const key=`${w.x},${w.y}`;
      if(visibleCells[key]){
        this.display.draw(w.x+offsetX,w.y+offsetY,w.symbol,w.color);
      }
    });
  }

  drawEnemies(offsetX,offsetY,visibleCells){
    this.enemies.forEach(enemy=>{
      const key=`${enemy.x},${enemy.y}`;
      if(visibleCells[key]){
        if(enemy.selected){
          this.display.draw(
            enemy.x+offsetX,
            enemy.y+offsetY,
            enemy.symbol,
            enemy.color,
            'red'
          );
        } else {
          this.display.draw(
            enemy.x+offsetX,
            enemy.y+offsetY,
            enemy.symbol,
            enemy.color
          );
        }
      }
    });
  }

  drawPlayer(offsetX,offsetY){
    this.display.draw(
      this.player.x+offsetX,
      this.player.y+offsetY,
      '@','yellow'
    );
  }

  computeFov(){
    const visibleCells={};
    const fov=new ROT.FOV.PreciseShadowcasting((x,y)=>{
      return this.map[`${x},${y}`]!=='#';
    });
    if(this.player){
      fov.compute(this.player.x,this.player.y,5,(x,y)=>{
        visibleCells[`${x},${y}`]=true;
      });
    }
    return visibleCells;
  }

  // ステータス更新
  updateStatus(){
    if(!this.player)return;
    document.getElementById('status').innerText=
      `HP: ${this.player.hp}/${this.player.maxHp}  `+
      `Floor: ${this.currentFloor}  `+
      `Level: ${this.player.level}  `+
      `EXP: ${this.player.exp}/${this.player.nextExp}  `+
      `Potions: ${this.player.inventory.length}  `+
      `Weapon: ${this.player.equippedWeapon?this.player.equippedWeapon.name:'None'}`;
  }

  showDialogue(msg){
    this.messageHistory.push(msg);
    const dialogue=document.getElementById('dialogue');
    dialogue.innerText=msg;
    dialogue.style.display='block';
    setTimeout(()=>{
      dialogue.style.display='none';
    },2000);
  }

  showEnemyStatus(enemy){
    const st=document.getElementById('enemy-status');
    st.innerText=`Enemy: ${enemy.name} HP:${enemy.hp}`;
    st.style.display='block';
  }

  clearEnemyStatus(){
    document.getElementById('enemy-status').style.display='none';
  }

  updateMessageHistoryOverlay(){
    const contentEl=document.getElementById('message-history-content');
    let html='<ul>';
    this.messageHistory.forEach(msg=>{
      html+=`<li>${msg}</li>`;
    });
    html+='</ul>';
    contentEl.innerHTML=html;
  }

  toggleHelp(){
    const helpEl=document.getElementById('help');
    helpEl.style.display=(helpEl.style.display==='block')?'none':'block';
  }

  toggleHistory(){
    const overlay=document.getElementById('message-history-overlay');
    if(overlay.style.display==='block') {
      overlay.style.display='none';
    } else {
      this.updateMessageHistoryOverlay();
      overlay.style.display='block';
    }
  }

  // アニメーションをマップ座標ではなく表示座標に合わせるため、オフセットを計算
  showAttackEffect(mapX, mapY){
    const frames=[
      {symbol:'!', color:'orange'},
      {symbol:'*', color:'red'},
      {symbol:'!', color:'yellow'}
    ];
    let frame=0;

    // 現在の表示座標へのオフセットを算出
    const opts = this.display.getOptions();
    const screenW = opts.width;
    const screenH = opts.height;
    const centerX = Math.floor(screenW / 2);
    const centerY = Math.floor(screenH / 2);
    const offsetX = centerX - this.player.x;
    const offsetY = centerY - this.player.y;

    const interval=setInterval(()=>{
      if(frame<frames.length){
        // mapX, mapY を表示用に変換
        const sx = mapX + offsetX;
        const sy = mapY + offsetY;
        this.display.draw(sx, sy, frames[frame].symbol, frames[frame].color);
        frame++;
      } else {
        clearInterval(interval);
        this.render();
      }
    },100);
  }

  playerAttack(enemy){
    const bonus=this.player.equippedWeapon?this.player.equippedWeapon.bonus:0;
    const damage=5+bonus;

    this.attackSound.currentTime=0;
    this.attackSound.play().catch(e=>console.error(e));
    this.showAttackEffect(enemy.x,enemy.y);

    enemy.hp-=damage;
    if(enemy.hp<=0){
      this.enemies=this.enemies.filter(e=> e!==enemy);
      this.gainExperience(10);
      if(enemy.drop){
        const droppedItem={...enemy.drop,x:enemy.x,y:enemy.y};
        this.weaponItems.push(droppedItem);
        this.showDialogue(`Enemy dropped a ${droppedItem.name}!`);
      }
      this.clearEnemyStatus();
    }
  }

  enemyAttack(enemy){
    this.attackSound.currentTime=0;
    this.attackSound.play().catch(e=>console.error(e));
    const msg=this.enemyDialogues[Math.floor(Math.random()*this.enemyDialogues.length)];
    this.enemySpeak(msg);
    // 敵がプレイヤーを攻撃するので、アニメーションはプレイヤーの位置に合わせる
    this.showAttackEffect(this.player.x,this.player.y);

    const damage=3;
    this.player.hp-=damage;
    if(this.player.hp<=0){
      this.gameOver=true;
    }
  }

  enemySpeak(msg){
    const dialogue=document.getElementById('dialogue');
    dialogue.innerText=msg;
    dialogue.style.display='block';
    setTimeout(()=>{
      dialogue.style.display='none';
    },3000);
  }

  checkPickup(){
    for(let i=0;i<this.healingItems.length;i++){
      if(this.player.x===this.healingItems[i].x&&this.player.y===this.healingItems[i].y){
        this.player.inventory.push(this.healingItems[i]);
        this.healingItems.splice(i,1);
        i--;
        this.showDialogue('Healing potion picked up!');
      }
    }

    for(let i=0;i<this.weaponItems.length;i++){
      if(this.player.x===this.weaponItems[i].x&&this.player.y===this.weaponItems[i].y){
        this.player.weapons.push(this.weaponItems[i]);
        this.weaponItems.splice(i,1);
        i--;
        const newW=this.player.weapons[this.player.weapons.length-1];
        this.showDialogue(`Picked up a ${newW.name}!`);
      }
    }
  }

  useHealingItem(){
    if(this.player.inventory.length>0){
      const potion=this.player.inventory.shift();
      const oldHp=this.player.hp;
      this.player.hp=Math.min(this.player.hp+potion.amount,this.player.maxHp);
      this.showDialogue(`Used healing potion: HP ${oldHp}->${this.player.hp}`);
    } else {
      this.showDialogue('No healing potions!');
    }
  }

  equipWeapon(){
    if(this.player.weapons.length===0){
      this.showDialogue('No weapons in inventory!');
      return;
    }
    let list='';
    for(let i=0; i<this.player.weapons.length; i++){
      const w=this.player.weapons[i];
      list+=`${i}: ${w.name} (+${w.bonus})\n`;
    }
    const input=window.prompt(`Choose weapon to equip:\n${list}`,'0');
    if(input!==null){
      const index=parseInt(input);
      if(!isNaN(index)&&index>=0&&index<this.player.weapons.length){
        this.player.equippedWeapon=this.player.weapons[index];
        this.showDialogue(`Equipped ${this.player.equippedWeapon.name}!`);
      } else {
        this.showDialogue('Invalid choice!');
      }
    }
  }

  gainExperience(amount){
    this.player.exp+=amount;
    while(this.player.exp>=this.player.nextExp){
      this.player.exp-=this.player.nextExp;
      this.player.level++;
      this.player.nextExp=Math.floor(this.player.nextExp*1.5);
      this.player.maxHp+=5;
      this.player.hp=this.player.maxHp;
    }
    this.updateStatus();
  }

  changeFloor(direction){
    if(!this.levels[this.currentFloor]){
      this.levels[this.currentFloor]={};
    }
    this.levels[this.currentFloor].playerPos={x:this.player.x,y:this.player.y};
    this.levels[this.currentFloor].healingItems=this.healingItems;
    this.levels[this.currentFloor].weaponItems=this.weaponItems;

    if(direction==='down'){
      const forced=this.levels[this.currentFloor].downStairs;
      this.currentFloor++;
      this.generateLevel(forced,null);
      this.player.x=this.upStairs.x;
      this.player.y=this.upStairs.y;
      this.levels[this.currentFloor].playerPos={x:this.player.x,y:this.player.y};
    } else if(direction==='up'){
      if(this.currentFloor===1)return;
      const forced=this.levels[this.currentFloor].upStairs;
      this.currentFloor--;
      this.generateLevel(null,forced);
      this.player.x=this.downStairs.x;
      this.player.y=this.downStairs.y;
      this.levels[this.currentFloor].playerPos={x:this.player.x,y:this.player.y};
    }
    this.render();
  }

  toggleOverview(){
    this.overviewMode=!this.overviewMode;
    const fullMapContainer=document.getElementById('fullmap');
    if(this.overviewMode){
      if(!this.fullMapDisplay){
        this.fullMapDisplay=new ROT.Display({
          width:levelWidth,
          height:levelHeight,
          fontSize:4,
          forceSquareRatio:true,
          bg:'black',
          fg:'white',
          useHiDPI:false
        });
      }
      this.renderFullMap();
      fullMapContainer.innerHTML='';
      fullMapContainer.appendChild(this.fullMapDisplay.getContainer());
      fullMapContainer.style.display='block';
    } else {
      fullMapContainer.style.display='none';
    }
  }

  renderFullMap(){
    if(!this.fullMapDisplay)return;
    this.fullMapDisplay.clear();
    for(let key in this.map){
      const [xStr,yStr]=key.split(',');
      const x=parseInt(xStr);
      const y=parseInt(yStr);
      const tile=this.map[key];
      let color=(tile==='#')?'grey':'lightgrey';
      this.fullMapDisplay.draw(x,y,tile,color);
    }

    if(this.upStairs){
      this.fullMapDisplay.draw(this.upStairs.x,this.upStairs.y,'<','lightblue');
    }
    if(this.downStairs){
      this.fullMapDisplay.draw(this.downStairs.x,this.downStairs.y,'>','lightblue');
    }

    this.healingItems.forEach(item=>{
      this.fullMapDisplay.draw(item.x,item.y,'!', 'green');
    });
    this.weaponItems.forEach(w=>{
      this.fullMapDisplay.draw(w.x,w.y,w.symbol,w.color);
    });

    this.enemies.forEach(enemy=>{
      this.fullMapDisplay.draw(enemy.x,enemy.y,enemy.symbol,enemy.color);
    });

    this.fullMapDisplay.draw(this.player.x,this.player.y,'@','yellow');
  }
}

