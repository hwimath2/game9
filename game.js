// --- 1) 이미지 프리로드 ---
const ASSETS = {
  bg:  "background.png",
  p:   "player.png",
  e1:  "enemy1.png",
  e2:  "enemy2.png",
  h1:  "health_item1.png",
  h2:  "health_item2.png"
};
const IMG = {};
let loadedCount = 0;
const TOTAL_ASSETS = Object.keys(ASSETS).length;
let imagesLoaded = false;

for (const key in ASSETS) {
  IMG[key] = new Image();
  IMG[key].src = ASSETS[key];
  IMG[key].onload = () => {
    if (++loadedCount === TOTAL_ASSETS) {
      imagesLoaded = true;
      initGame(); // 이미지 로드 완료 후 바로 게임 초기화
    }
  };
}

// --- 2) 캔버스 설정 ---
const canvas = document.getElementById("gameCanvas");
const ctx    = canvas.getContext("2d");
// 모바일에 최적화된 세로 비율
canvas.width  = 450;
canvas.height = 800;

// --- 3) 상수 정의 ---
const PLAYER_SIZE   = 80;
const ENEMY_SIZE    = 100;    // 적 크기 조정
const ITEM_SIZE     = 60;
const ITEM_INTERVAL = 10000; // 10초마다 아이템
const BASE_SHOT_INT = 500;   // 자동 발사 기본 간격(ms)
const SPEED_FACTOR  = 0.02;  // 적 속도 증가 비율 (초당)

// --- 4) 상태 변수 ---
let player, enemies, missiles, items, explosions;
let playerEnergy, score, gameOver;
let missileCount, missilePickups, shotInterval;
let lastItemTime, lastShotTime, startTime;
let touchStartX = null;  // 터치 시작 위치
let playerStartX = null; // 터치 시작시 플레이어 위치
let bgScroll = 0;        // 배경 스크롤 위치
let gameRunning = false; // 게임 실행 여부

// 폭발 효과 클래스
class Explosion {
  constructor(x, y, size) {
    this.x = x;
    this.y = y;
    this.size = size;
    this.maxSize = size;
    this.lifespan = 20; // 폭발 지속 프레임 수
    this.currentLife = 0;
    this.particles = [];
    
    // 폭발 파티클 생성
    const particleCount = Math.floor(size / 5); // 크기에 비례한 파티클 수
    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: 0,
        y: 0,
        size: Math.random() * 4 + 2,
        speedX: (Math.random() - 0.5) * 6,
        speedY: (Math.random() - 0.5) * 6,
        color: [
          '#ff0000', // 빨강
          '#ff5500', // 주황
          '#ffaa00', // 주황-노랑
          '#ffff00'  // 노랑
        ][Math.floor(Math.random() * 4)]
      });
    }
  }

  update() {
    this.currentLife++;
    
    // 파티클 업데이트
    for (let p of this.particles) {
      p.x += p.speedX;
      p.y += p.speedY;
      
      // 파티클 크기 감소
      if (this.currentLife > this.lifespan / 2) {
        p.size *= 0.95;
      }
    }
    
    return this.currentLife <= this.lifespan;
  }

  draw() {
    // 폭발 중앙 광원
    const gradient = ctx.createRadialGradient(
      this.x, this.y, 0,
      this.x, this.y, this.size * (1 - this.currentLife / this.lifespan)
    );
    gradient.addColorStop(0, 'rgba(255, 255, 200, ' + (1 - this.currentLife / this.lifespan) + ')');
    gradient.addColorStop(0.5, 'rgba(255, 100, 0, ' + (0.8 - this.currentLife / this.lifespan) + ')');
    gradient.addColorStop(1, 'rgba(255, 0, 0, 0)');
    
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size * (1 - this.currentLife / (this.lifespan * 1.5)), 0, Math.PI * 2);
    ctx.fillStyle = gradient;
    ctx.fill();
    
    // 파티클 그리기
    for (let p of this.particles) {
      ctx.globalAlpha = 1 - this.currentLife / this.lifespan;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(
        this.x + p.x, 
        this.y + p.y, 
        p.size, 
        0, Math.PI * 2
      );
      ctx.fill();
    }
    
    ctx.globalAlpha = 1;
  }
}

// --- 5) 키 입력 & 터치 이벤트 ---
const keys = {};
window.addEventListener("keydown", e => keys[e.key] = true);
window.addEventListener("keyup", e => keys[e.key] = false);

// 터치 이벤트 처리 - player가 초기화된 후에 작동하도록 수정
function setupTouchEvents() {
  // 터치 이벤트 처리
  canvas.addEventListener("touchstart", e => {
    if (!player) return;
    touchStartX = e.touches[0].clientX;
    playerStartX = player.x;
    e.preventDefault();
  });

  canvas.addEventListener("touchmove", e => {
    if (!player || touchStartX === null) return;
    const diff = e.touches[0].clientX - touchStartX;
    let newX = playerStartX + diff;
    
    // 화면 경계 체크
    newX = Math.max(0, Math.min(canvas.width - player.w, newX));
    player.x = newX;
    e.preventDefault();
  });

  canvas.addEventListener("touchend", () => {
    touchStartX = null;
    playerStartX = null;
  });

  // 마우스 드래그도 지원 (테스트용)
  canvas.addEventListener("mousedown", e => {
    if (!player) return;
    touchStartX = e.clientX;
    playerStartX = player.x;
  });

  canvas.addEventListener("mousemove", e => {
    if (!player || touchStartX === null) return;
    const diff = e.clientX - touchStartX;
    let newX = playerStartX + diff;
    newX = Math.max(0, Math.min(canvas.width - player.w, newX));
    player.x = newX;
  });

  canvas.addEventListener("mouseup", () => {
    touchStartX = null;
    playerStartX = null;
  });
}

// 터치 이벤트 설정 호출
setupTouchEvents();

// Player 클래스의 move 메서드 수정
class Player {
    constructor() {
        this.w  = PLAYER_SIZE;
        this.h  = PLAYER_SIZE;
        this.x  = canvas.width/2 - this.w/2;
        this.y  = canvas.height - this.h - 30;
        this.sp = 5;
    }
    move() {
        // PC에서는 좌우 방향키로만 조작
        if (keys["ArrowLeft"] && this.x > 0)
            this.x -= this.sp;
        if (keys["ArrowRight"] && this.x < canvas.width - this.w)
            this.x += this.sp;
        // 상하 이동 비활성화
    }
    draw() {
        ctx.drawImage(IMG.p, this.x, this.y, this.w, this.h);
    }
}

// 개선된 미사일 클래스
class Missile {
  constructor(x, y, ang = 0) {
    this.x = x;
    this.y = y;
    this.w = 8;
    this.h = 22;
    this.sp = 8;
    this.ang = ang * Math.PI/180;
    this.trail = []; // 미사일 궤적
    
    // 초기 궤적 생성
    for (let i = 0; i < 10; i++) {
      this.trail.push({
        x: x,
        y: y + i * 3,
        alpha: 1 - (i / 10)
      });
    }
  }
  
  move() {
    // 궤적 업데이트
    for (let i = this.trail.length - 1; i > 0; i--) {
      this.trail[i].x = this.trail[i-1].x;
      this.trail[i].y = this.trail[i-1].y;
    }
    
    // 새 위치 계산
    this.y -= this.sp;
    this.x += Math.sin(this.ang) * 5;
    
    // 첫 번째 궤적 위치 업데이트
    if (this.trail.length > 0) {
      this.trail[0].x = this.x + this.w/2;
      this.trail[0].y = this.y + this.h;
    }
  }
  
  draw() {
    // 미사일 회전 적용
    ctx.save();
    ctx.translate(this.x + this.w/2, this.y + this.h/2);
    ctx.rotate(this.ang);
    
    // 미사일 본체 그리기 (막대기 형태에서 개선된 형태)
    const bodyGradient = ctx.createLinearGradient(-this.w/2, -this.h/2, this.w/2, this.h/2);
    bodyGradient.addColorStop(0, "#4477ff"); // 파란색 베이스
    bodyGradient.addColorStop(0.5, "#77aaff"); // 밝은 파란색 하이라이트
    bodyGradient.addColorStop(1, "#4477ff"); // 다시 파란색
    
    // 미사일 몸체 (둥근 직사각형)
    ctx.fillStyle = bodyGradient;
    
    // 둥근 직사각형 그리기
    const radius = this.w / 2;
    ctx.beginPath();
    ctx.moveTo(-this.w/2, -this.h/2 + radius);
    ctx.lineTo(-this.w/2, this.h/2 - radius);
    ctx.arcTo(-this.w/2, this.h/2, -this.w/2 + radius, this.h/2, radius);
    ctx.lineTo(this.w/2 - radius, this.h/2);
    ctx.arcTo(this.w/2, this.h/2, this.w/2, this.h/2 - radius, radius);
    ctx.lineTo(this.w/2, -this.h/2 + radius);
    ctx.arcTo(this.w/2, -this.h/2, this.w/2 - radius, -this.h/2, radius);
    ctx.lineTo(-this.w/2 + radius, -this.h/2);
    ctx.arcTo(-this.w/2, -this.h/2, -this.w/2, -this.h/2 + radius, radius);
    ctx.closePath();
    ctx.fill();
    
    // 미사일 팁 (삼각형)
    const tipGradient = ctx.createLinearGradient(0, -this.h/2 - 5, 0, -this.h/2);
    tipGradient.addColorStop(0, "#77aaff");
    tipGradient.addColorStop(1, "#4477ff");
    
    ctx.fillStyle = tipGradient;
    ctx.beginPath();
    ctx.moveTo(0, -this.h/2 - 5);
    ctx.lineTo(-this.w/2, -this.h/2 + 2);
    ctx.lineTo(this.w/2, -this.h/2 + 2);
    ctx.closePath();
    ctx.fill();
    
    // 미사일 하단 (추진 부분)
    const thrustGradient = ctx.createLinearGradient(0, this.h/2, 0, this.h/2 + 3);
    thrustGradient.addColorStop(0, "#ff9900");
    thrustGradient.addColorStop(1, "#ff3300");
    
    ctx.fillStyle = thrustGradient;
    ctx.beginPath();
    ctx.moveTo(-this.w/2 + 1, this.h/2);
    ctx.lineTo(-this.w/4, this.h/2 + 3);
    ctx.lineTo(this.w/4, this.h/2 + 3);
    ctx.lineTo(this.w/2 - 1, this.h/2);
    ctx.closePath();
    ctx.fill();
    
    // 미사일 하이라이트 (반짝이는 효과)
    ctx.fillStyle = "rgba(255, 255, 255, 0.7)";
    ctx.beginPath();
    ctx.ellipse(-this.w/4, -this.h/4, this.w/10, this.h/5, 0, 0, Math.PI * 2);
    ctx.fill();
    
    ctx.restore();
    
    // 궤적 그리기
    ctx.save();
    for (let i = 0; i < this.trail.length; i++) {
      const t = this.trail[i];
      const size = (1 - (i / this.trail.length)) * 5;
      
      // 불꽃 색상 구성
      const colors = [
        "rgba(255, 200, 0, " + t.alpha * 0.7 + ")",  // 노란색
        "rgba(255, 100, 0, " + t.alpha * 0.8 + ")",  // 주황색
        "rgba(255, 0, 0, " + t.alpha * 0.6 + ")"     // 빨간색
      ];
      
      // 각 색상의 불꽃 파티클
      for (let j = 0; j < colors.length; j++) {
        const wobble = Math.sin(Date.now() * 0.01 + i * 0.5) * 2;
        ctx.fillStyle = colors[j];
        ctx.beginPath();
        ctx.arc(
          t.x + (Math.random() - 0.5) * 2, 
          t.y + i * 1.5 + (Math.random() - 0.5) * 2,
          size * (3-j) / 3 + wobble * (1-j/3),
          0, Math.PI * 2
        );
        ctx.fill();
      }
    }
    ctx.restore();
  }
}

class Enemy {
  constructor(type) {
    this.w      = ENEMY_SIZE;
    this.h      = ENEMY_SIZE;
    this.x      = Math.random() * (canvas.width - this.w);
    this.y      = -this.h;
    this.type   = type;       // 1 또는 2
    this.health = type;       // 체력: 1 or 2
    this.baseSp = 2;          // 기본 속도
  }
  move(now) {
    const elapsed = (now - startTime) / 1000;
    const speed   = this.baseSp + elapsed * SPEED_FACTOR;
    this.y += speed;
  }
  draw() {
    const img = this.type === 1 ? IMG.e1 : IMG.e2;
    ctx.drawImage(img, this.x, this.y, this.w, this.h);
  }
}

class Item {
  constructor() {
    this.w    = ITEM_SIZE;
    this.h    = ITEM_SIZE;
    this.x    = Math.random() * (canvas.width - this.w);
    this.y    = -this.h;
    this.sp   = 3;
    this.type = Math.random() < 0.5 ? "health" : "missile";
    this.angle = 0;
  }
  move() {
    this.y += this.sp;
    // 아이템 회전 효과
    this.angle += 0.05;
  }
  draw() {
    const img = this.type === "health" ? IMG.h1 : IMG.h2;
    
    // 회전 및 부유 효과
    ctx.save();
    ctx.translate(this.x + this.w/2, this.y + this.h/2);
    ctx.rotate(this.angle);
    // 부유 효과 (위아래로 살짝 움직임)
    const floatEffect = Math.sin(Date.now() * 0.003) * 5;
    ctx.drawImage(img, -this.w/2, -this.h/2 + floatEffect, this.w, this.h);
    
    // 반짝임 효과
    ctx.globalAlpha = 0.2 + Math.sin(Date.now() * 0.01) * 0.2;
    ctx.globalCompositeOperation = 'lighter';
    ctx.drawImage(img, -this.w/2, -this.h/2 + floatEffect, this.w, this.h);
    ctx.restore();
  }
}

// --- 7) 충돌 검사 & 발사 함수 ---
function isCollision(a, b) {
  return a.x < b.x + b.w &&
         a.x + a.w > b.x &&
         a.y < b.y + b.h &&
         a.y + a.h > b.y;
}

function shootMissile() {
  const sx = player.x + player.w/2 - 4;
  const sy = player.y;
  
  if (missileCount === 1) {
    missiles.push(new Missile(sx, sy));
  } else {
    for (let i = 0; i < missileCount; i++) {
      const ang = (i - (missileCount-1)/2) * 15;
      missiles.push(new Missile(sx, sy, ang));
    }
  }
}

// --- 8) 게임 초기화 ---
function initGame() {
  player         = new Player();
  enemies        = [];
  missiles       = [];
  items          = [];
  explosions     = [];
  playerEnergy   = 100;
  score          = 0;
  gameOver       = false;
  missileCount   = 1;
  missilePickups = 0;
  shotInterval   = BASE_SHOT_INT;
  startTime      = performance.now();
  lastItemTime   = startTime;
  lastShotTime   = startTime;
  
  // HTML에서 비디오가 제어되므로 여기서는 게임 루프만 시작
  // HTML에서 window.gameStarted = true를 설정하면 게임 루프가 실행됨
  gameRunning = true;
  requestAnimationFrame(gameLoop);
}

// --- 9) 화면 그리기 헬퍼 ---
function drawBackground() {
  // 배경 스크롤링 효과 구현
  bgScroll = (bgScroll + 1) % canvas.height;
  
  // 배경 이미지를 캔버스 크기에 맞게 그리기 (두 개를 그려서 무한 스크롤)
  ctx.drawImage(IMG.bg, 0, bgScroll, canvas.width, canvas.height);
  ctx.drawImage(IMG.bg, 0, bgScroll - canvas.height, canvas.width, canvas.height);
}

// 개선된 UI 그리기
function drawUI() {
  // 에너지 바 그리기 (개선된 스타일)
  const barWidth = 200;
  const barHeight = 20;
  const barX = 20;
  const barY = 20;
  
  // 에너지 바 배경 (그라데이션)
  const barBg = ctx.createLinearGradient(barX, barY, barX + barWidth, barY);
  barBg.addColorStop(0, "#333333");
  barBg.addColorStop(1, "#666666");
  ctx.fillStyle = barBg;
  ctx.fillRect(barX, barY, barWidth, barHeight);
  
  // 에너지 바 테두리 (발광 효과)
  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = 5;
  ctx.strokeStyle = "#00ffff";
  ctx.lineWidth = 2;
  ctx.strokeRect(barX, barY, barWidth, barHeight);
  ctx.shadowBlur = 0;
  
  // 에너지 바 채우기 (그라데이션)
  const energyWidth = (playerEnergy/100) * barWidth;
  let energyGrad;
  if (playerEnergy > 60) {
    energyGrad = ctx.createLinearGradient(barX, barY, barX + energyWidth, barY);
    energyGrad.addColorStop(0, "#00ff66");
    energyGrad.addColorStop(1, "#66ff99");
  } else if (playerEnergy > 30) {
    energyGrad = ctx.createLinearGradient(barX, barY, barX + energyWidth, barY);
    energyGrad.addColorStop(0, "#ffcc00");
    energyGrad.addColorStop(1, "#ffff00");
  } else {
    energyGrad = ctx.createLinearGradient(barX, barY, barX + energyWidth, barY);
    energyGrad.addColorStop(0, "#ff3300");
    energyGrad.addColorStop(1, "#ff6600");
  }
  ctx.fillStyle = energyGrad;
  ctx.fillRect(barX, barY, energyWidth, barHeight);
  
  // 에너지 양 표시
  ctx.font = "12px Arial";
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.fillText(`${playerEnergy}%`, barX + barWidth/2, barY + barHeight - 5);
  
  // 점수 표시 (그림자 효과)
  ctx.font = "24px Arial";
  ctx.fillStyle = "white";
  ctx.textAlign = "right";
  ctx.shadowColor = "#00ffff";
  ctx.shadowBlur = 10;
  ctx.fillText(`점수: ${score}`, canvas.width - 20, 40);
  ctx.shadowBlur = 0;
  
  // 무기 상태 표시
  const weaponX = canvas.width - 100;
  const weaponY = 60;
  ctx.font = "14px Arial";
  ctx.fillStyle = "#ffcc00";
  ctx.textAlign = "right";
  ctx.fillText(`무기 Lv: ${missilePickups + 1}`, canvas.width - 20, weaponY);
  
  // 미사일 아이콘 그리기
  for (let i = 0; i < missileCount; i++) {
    const iconX = canvas.width - 20 - (i * 15);
    const iconY = weaponY + 20;
    
    // 미니 미사일 아이콘
    ctx.save();
    ctx.translate(iconX, iconY);
    
    ctx.fillStyle = "#4477ff";
    ctx.beginPath();
    ctx.roundRect(-3, -8, 6, 16, 2);
    ctx.fill();
    
    // 미사일 팁
    ctx.fillStyle = "#77aaff";
    ctx.beginPath();
    ctx.moveTo(0, -10);
    ctx.lineTo(-3, -8);
    ctx.lineTo(3, -8);
    ctx.closePath();
    ctx.fill();
    
    // 미사일 불꽃
    ctx.fillStyle = "#ff9900";
    ctx.beginPath();
    ctx.moveTo(-3, 8);
    ctx.lineTo(0, 10);
    ctx.lineTo(3, 8);
    ctx.closePath();
    ctx.fill();
    
    ctx.restore();
  }
}

// --- 11) 메인 게임 루프 ---
function gameLoop(now) {
  if (!gameRunning) {
    // 게임이 실행 중이 아니면 루프 중단
    return;
  }

  // 캔버스 초기화
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  // 1) 배경 및 UI 그리기
  drawBackground();
  drawUI();

  // 2) 자동 미사일 발사
  if (now - lastShotTime >= shotInterval) {
    shootMissile();
    lastShotTime = now;
  }

  // 3) 플레이어
  player.move();
  player.draw();

  // 4) 적 스폰
  if (Math.random() < 0.02) {
    enemies.push(new Enemy(Math.random() < 0.5 ? 1 : 2));
  }

  // 5) 아이템 10초마다 스폰
  if (now - lastItemTime >= ITEM_INTERVAL) {
    items.push(new Item());
    lastItemTime = now;
  }

  // 6) 적 처리
  for (let i = enemies.length-1; i >= 0; i--) {
    const e = enemies[i];
    e.move(now);
    e.draw();
    if (e.y > canvas.height) { enemies.splice(i, 1); continue; }

    if (isCollision(player, e)) {
      playerEnergy -= 20;
      enemies.splice(i, 1);
      // 폭발 효과 추가
      explosions.push(new Explosion(e.x + e.w/2, e.y + e.h/2, e.w));
      if (playerEnergy <= 0) gameOver = true;
      continue;
    }
    for (let j = missiles.length-1; j >= 0; j--) {
      if (isCollision(missiles[j], e)) {
        missiles.splice(j, 1);
        e.health--;
        if (e.health <= 0) {
          score++;
          enemies.splice(i, 1);
          // 폭발 효과 추가
          explosions.push(new Explosion(e.x + e.w/2, e.y + e.h/2, e.w));
        }
        break;
      }
    }
  }

  // 7) 아이템 처리
  for (let i = items.length-1; i >= 0; i--) {
    const it = items[i];
    it.move();
    it.draw();
    if (it.y > canvas.height) { items.splice(i, 1); continue; }

    if (isCollision(player, it)) {
      if (it.type === "health") {
        playerEnergy = Math.min(100, playerEnergy + 30);
      } else {
        missilePickups = Math.min(3, missilePickups + 1);
        if (missilePickups === 1) {
          shotInterval = BASE_SHOT_INT / 2;
        } else if (missilePickups === 2) {
          missileCount = 2;
        } else if (missilePickups === 3) {
          missileCount = 3;
        }
      }
      items.splice(i, 1);
    }
  }

  // 8) 미사일 처리
  for (let i = missiles.length-1; i >= 0; i--) {
    missiles[i].move();
    missiles[i].draw();
    if (missiles[i].y < -missiles[i].h) missiles.splice(i, 1);
  }
  
  // 폭발 효과 업데이트
  for (let i = explosions.length-1; i >= 0; i--) {
    if (!explosions[i].update()) {
      explosions.splice(i, 1);
    } else {
      explosions[i].draw();
    }
  }

  // 9) 게임 오버
  if (gameOver) {
    // 고급 게임 오버 화면
    ctx.fillStyle = "rgba(0, 0, 0, 0.7)";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    
    ctx.shadowColor = "#ff0000";
    ctx.shadowBlur = 20;
    ctx.font = "40px Arial";
    ctx.fillStyle = "#ff3300";
    ctx.textAlign = "center";
    ctx.fillText("게임 오버!", canvas.width/2, canvas.height/2 - 40);
    
    ctx.shadowBlur = 10;
    ctx.font = "24px Arial";
    ctx.fillStyle = "white";
    ctx.fillText(`최종 점수: ${score}`, canvas.width/2, canvas.height/2 + 20);
    
    ctx.shadowBlur = 0;
    ctx.font = "16px Arial";
    ctx.fillStyle = "#ffcc00";
    ctx.fillText("다시 시작하려면 화면을 탭하세요", canvas.width/2, canvas.height/2 + 70);
    
    // 재시작 이벤트 리스너 추가
    canvas.addEventListener("click", restartGame, { once: true });
    canvas.addEventListener("touchstart", restartGame, { once: true });
    
    return; // 루프 완전 종료
  }

  // 10) 다음 프레임
  requestAnimationFrame(gameLoop);
}

// 게임 재시작 함수
function restartGame() {
  gameOver = false;
  initGame();
}

// HTML에서 게임 시작 함수 호출할 수 있도록 전역으로 노출
window.startGame = function() {
  // 이미지가 로드되었으면 바로 게임 시작, 아니면 로드 완료 시 시작
  if (imagesLoaded) {
    gameRunning = true;
    requestAnimationFrame(gameLoop);
  }
};

// 초기화 시 이미지 로드 완료되면 자동으로 게임 준비는 하되
// 실제 게임 실행은 HTML에서 startGame() 호출 시 시작
