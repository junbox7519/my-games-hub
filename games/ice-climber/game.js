(() => {
  "use strict";

  const TILE = 40;
  const COLS = 12;
  const ROWS = 12;

  const canvas = document.getElementById("game");
  const ctx = canvas.getContext("2d");
  canvas.width = COLS * TILE;
  canvas.height = ROWS * TILE;

  const scoreEl = document.getElementById("score");
  const levelEl = document.getElementById("level");
  const livesEl = document.getElementById("lives");
  const timeFillEl = document.getElementById("timeFill");
  const overlay = document.getElementById("overlay");
  const overlayTitle = document.getElementById("overlayTitle");
  const overlayMsg = document.getElementById("overlayMsg");
  const startBtn = document.getElementById("startBtn");

  const GRAVITY = 1500;
  const MOVE_SPEED = 175;
  const JUMP_VEL = -560;
  const MAX_FALL = 720;
  const PLAYER_W = 26;
  const PLAYER_H = 32;
  const HAMMER_TIME = 0.18;
  const HAMMER_COOLDOWN = 0.28;
  const STUN_TIME = 3.5;
  const INVULN_TIME = 1.6;
  const COMBO_WINDOW = 3;

  /** @type {boolean[][]} */
  let grid = [];
  let unbreakable = [];
  let enemies = [];
  let particles = [];
  let popups = [];
  let condor = null;

  let player = null;
  let score = 0;
  let lives = 3;
  let level = 1;
  let combo = 0;
  let comboTimer = 0;
  let levelTime = 0;
  let levelTimeMax = 45;
  let facing = 1;
  let invuln = 0;
  let hammerTimer = 0;
  let hammerCooldown = 0;

  let state = "ready"; // ready | playing | over
  let lastTs = 0;

  const keys = {};

  function wrapCol(c) {
    return ((c % COLS) + COLS) % COLS;
  }

  function solidAt(col, row) {
    if (row < 0 || row >= ROWS) return false;
    col = wrapCol(col);
    return !!grid[row][col];
  }

  function breakableAt(col, row) {
    if (row < 0 || row >= ROWS) return false;
    col = wrapCol(col);
    return !!grid[row][col] && !unbreakable[row][col];
  }

  function tileSolidAtPixel(px, py) {
    const col = Math.floor(px / TILE);
    const row = Math.floor(py / TILE);
    return solidAt(col, row);
  }

  function wrapEntityX(e) {
    if (e.x + e.w < 0) e.x += COLS * TILE;
    if (e.x > COLS * TILE) e.x -= COLS * TILE;
  }

  function moveX(e, dx) {
    if (dx === 0) return;
    e.x += dx;
    wrapEntityX(e);
    const y1 = e.y + 3;
    const y2 = e.y + e.h - 3;
    if (dx > 0) {
      if (tileSolidAtPixel(e.x + e.w, y1) || tileSolidAtPixel(e.x + e.w, y2)) {
        e.x = Math.floor((e.x + e.w) / TILE) * TILE - e.w;
        if (e.vx !== undefined) e.vx = 0;
        e.hitWall = true;
      }
    } else {
      if (tileSolidAtPixel(e.x, y1) || tileSolidAtPixel(e.x, y2)) {
        e.x = Math.floor(e.x / TILE + 1) * TILE;
        if (e.vx !== undefined) e.vx = 0;
        e.hitWall = true;
      }
    }
  }

  function moveY(e, dy) {
    if (dy === 0) return;
    e.y += dy;
    const x1 = e.x + 3;
    const x2 = e.x + e.w - 3;
    e.onGround = false;
    if (dy > 0) {
      if (tileSolidAtPixel(x1, e.y + e.h) || tileSolidAtPixel(x2, e.y + e.h)) {
        e.y = Math.floor((e.y + e.h) / TILE) * TILE - e.h;
        e.vy = 0;
        e.onGround = true;
      }
    } else {
      if (tileSolidAtPixel(x1, e.y) || tileSolidAtPixel(x2, e.y)) {
        e.y = Math.floor(e.y / TILE + 1) * TILE;
        e.vy = 0;
      }
    }
  }

  function aabbOverlap(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  function randInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
  }

  function buildLevel(lv) {
    grid = [];
    unbreakable = [];
    for (let r = 0; r < ROWS; r++) {
      grid.push(new Array(COLS).fill(false));
      unbreakable.push(new Array(COLS).fill(false));
    }

    // top goal platform (row 0) - solid, unbreakable
    for (let c = 0; c < COLS; c++) {
      grid[0][c] = true;
      unbreakable[0][c] = true;
    }
    // ground floor (last row) - solid, unbreakable
    for (let c = 0; c < COLS; c++) {
      grid[ROWS - 1][c] = true;
      unbreakable[ROWS - 1][c] = true;
    }

    // middle rows: breakable ice platforms with a few gaps
    for (let r = 1; r < ROWS - 1; r++) {
      const gapCount = randInt(2, 4);
      const gapCols = new Set();
      while (gapCols.size < gapCount) {
        gapCols.add(randInt(0, COLS - 1));
      }
      for (let c = 0; c < COLS; c++) {
        grid[r][c] = !gapCols.has(c);
      }
    }

    // enemies
    enemies = [];
    const enemyCount = Math.min(2 + Math.floor(lv * 1.2), 9);
    const rowsAvailable = [];
    for (let r = 1; r < ROWS - 1; r++) rowsAvailable.push(r);

    for (let i = 0; i < enemyCount; i++) {
      const row = rowsAvailable[randInt(0, rowsAvailable.length - 1)];
      let col = randInt(0, COLS - 1);
      let tries = 0;
      while (!grid[row][col] && tries < 20) {
        col = randInt(0, COLS - 1);
        tries++;
      }
      const fast = lv > 3 && Math.random() < 0.4;
      enemies.push({
        x: col * TILE + 4,
        y: row * TILE - 30,
        w: 30,
        h: 28,
        vx: (Math.random() < 0.5 ? -1 : 1) * (fast ? 95 : 60),
        vy: 0,
        onGround: false,
        stunned: 0,
        fast,
        wobble: Math.random() * 10,
      });
    }

    condor = null;
    particles = [];
    popups = [];
    levelTimeMax = Math.max(22, 45 - (lv - 1) * 2);
    levelTime = levelTimeMax;
  }

  function spawnPlayer() {
    player = {
      x: Math.floor(COLS / 2) * TILE + 6,
      y: (ROWS - 1) * TILE - PLAYER_H,
      w: PLAYER_W,
      h: PLAYER_H,
      vx: 0,
      vy: 0,
      onGround: true,
    };
    invuln = INVULN_TIME;
  }

  function startGame() {
    score = 0;
    lives = 3;
    level = 1;
    combo = 0;
    comboTimer = 0;
    buildLevel(level);
    spawnPlayer();
    state = "playing";
    overlay.hidden = true;
    updateHud();
  }

  function nextLevel() {
    level++;
    score += 500 + level * 50;
    buildLevel(level);
    spawnPlayer();
    updateHud();
  }

  function loseLife(reason) {
    lives--;
    combo = 0;
    updateHud();
    if (lives <= 0) {
      gameOver();
      return;
    }
    spawnPlayer();
  }

  function gameOver() {
    state = "over";
    overlayTitle.textContent = "ゲームオーバー";
    overlayMsg.innerHTML = `スコア: <strong>${score}</strong><br>レベル ${level} まで到達しました。`;
    startBtn.textContent = "もう一度あそぶ";
    overlay.hidden = false;
  }

  function updateHud() {
    scoreEl.textContent = score;
    levelEl.textContent = level;
    livesEl.textContent = "♥".repeat(Math.max(lives, 0)) || "-";
  }

  function addPopup(x, y, text, color) {
    popups.push({ x, y, text, color, life: 0.8 });
  }

  function breakBlock(col, row) {
    col = wrapCol(col);
    if (!grid[row][col] || unbreakable[row][col]) return false;
    grid[row][col] = false;
    for (let i = 0; i < 8; i++) {
      particles.push({
        x: col * TILE + TILE / 2,
        y: row * TILE + TILE / 2,
        vx: (Math.random() - 0.5) * 220,
        vy: -Math.random() * 200 - 40,
        life: 0.5,
        color: "#bae6fd",
      });
    }
    return true;
  }

  function swingHammer() {
    if (hammerCooldown > 0) return;
    hammerTimer = HAMMER_TIME;
    hammerCooldown = HAMMER_COOLDOWN;

    const reach = {
      x: facing > 0 ? player.x + player.w : player.x - 26,
      y: player.y,
      w: 26,
      h: player.h,
    };

    let hitEnemy = false;
    for (const en of enemies) {
      if (en.stunned <= 0 && aabbOverlap(reach, en)) {
        en.stunned = STUN_TIME;
        en.vx = 0;
        hitEnemy = true;
      }
    }

    if (!hitEnemy) {
      const footRow = Math.floor((player.y + player.h - 1) / TILE);
      const col = Math.floor((facing > 0 ? player.x + player.w : player.x - 1) / TILE);
      if (breakableAt(col, footRow)) {
        breakBlock(col, footRow);
      }
    }
  }

  function bindInput() {
    window.addEventListener("keydown", (e) => {
      if (["ArrowLeft", "ArrowRight", "ArrowUp", " ", "Space"].includes(e.key) || e.code === "Space") {
        e.preventDefault();
      }
      keys[e.key] = true;
      if (e.code === "Space" || e.key === "ArrowUp") keys["jump"] = true;
      if (e.key === "z" || e.key === "Z" || e.key === "x" || e.key === "X") {
        if (state === "playing") swingHammer();
      }
      if ((e.key === "Enter" || e.key === " ") && state !== "playing") {
        startGame();
      }
    });
    window.addEventListener("keyup", (e) => {
      keys[e.key] = false;
      if (e.code === "Space" || e.key === "ArrowUp") keys["jump"] = false;
    });

    const bindHold = (id, key) => {
      const el = document.getElementById(id);
      if (!el) return;
      const on = (ev) => {
        ev.preventDefault();
        keys[key] = true;
      };
      const off = (ev) => {
        ev.preventDefault();
        keys[key] = false;
      };
      el.addEventListener("touchstart", on, { passive: false });
      el.addEventListener("touchend", off, { passive: false });
      el.addEventListener("mousedown", on);
      el.addEventListener("mouseup", off);
      el.addEventListener("mouseleave", off);
    };
    bindHold("btnLeft", "ArrowLeft");
    bindHold("btnRight", "ArrowRight");
    bindHold("btnJump", "jump");

    const hammerBtn = document.getElementById("btnHammer");
    if (hammerBtn) {
      const trigger = (ev) => {
        ev.preventDefault();
        if (state === "playing") swingHammer();
        else startGame();
      };
      hammerBtn.addEventListener("touchstart", trigger, { passive: false });
      hammerBtn.addEventListener("mousedown", trigger);
    }

    startBtn.addEventListener("click", startGame);
    overlay.addEventListener("click", (e) => {
      if (e.target === startBtn) return;
      if (state !== "playing") startGame();
    });
  }

  function spawnCondor() {
    condor = {
      x: player.x < canvas.width / 2 ? canvas.width - 40 : 0,
      y: TILE * 2,
      w: 32,
      h: 26,
    };
  }

  function updateEnemies(dt) {
    for (const en of enemies) {
      if (en.stunned > 0) {
        en.stunned -= dt;
        continue;
      }
      en.vy = Math.min((en.vy || 0) + GRAVITY * dt, MAX_FALL);
      moveY(en, en.vy * dt);

      en.hitWall = false;
      moveX(en, en.vx * dt);

      // check ahead for ground; if none, turn around before walking off
      if (en.onGround) {
        const ahead = en.vx > 0 ? en.x + en.w + 2 : en.x - 2;
        const footRow = Math.floor((en.y + en.h + 1) / TILE);
        if (!solidAt(Math.floor(ahead / TILE), footRow)) {
          en.vx *= -1;
        }
      }
      if (en.hitWall) en.vx *= -1;
    }

    if (condor) {
      const dx = player.x - condor.x;
      const dy = player.y - condor.y;
      const dist = Math.max(1, Math.hypot(dx, dy));
      const speed = 110;
      condor.x += (dx / dist) * speed * dt;
      condor.y += (dy / dist) * speed * dt;
    }
  }

  function checkPlayerHits() {
    if (invuln > 0) return;
    for (let i = enemies.length - 1; i >= 0; i--) {
      const en = enemies[i];
      if (!aabbOverlap(player, en)) continue;
      if (en.stunned > 0) {
        // defeat
        combo = comboTimer > 0 ? Math.min(combo + 1, 4) : 0;
        comboTimer = COMBO_WINDOW;
        const pts = 100 * Math.pow(2, combo);
        score += pts;
        addPopup(en.x, en.y, "+" + pts, "#fde68a");
        enemies.splice(i, 1);
        updateHud();
      } else {
        loseLife();
        return;
      }
    }
    if (condor && aabbOverlap(player, condor)) {
      loseLife();
    }
  }

  function update(dt) {
    if (state !== "playing") return;

    if (comboTimer > 0) {
      comboTimer -= dt;
      if (comboTimer <= 0) combo = 0;
    }
    if (invuln > 0) invuln -= dt;
    if (hammerTimer > 0) hammerTimer -= dt;
    if (hammerCooldown > 0) hammerCooldown -= dt;

    let moveDir = 0;
    if (keys["ArrowLeft"]) moveDir -= 1;
    if (keys["ArrowRight"]) moveDir += 1;
    if (moveDir !== 0) facing = moveDir;

    player.vx = moveDir * MOVE_SPEED;
    if (keys["jump"] && player.onGround) {
      player.vy = JUMP_VEL;
      player.onGround = false;
    }

    player.vy = Math.min(player.vy + GRAVITY * dt, MAX_FALL);

    moveX(player, player.vx * dt);
    moveY(player, player.vy * dt);

    updateEnemies(dt);
    checkPlayerHits();

    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += GRAVITY * 0.6 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.life -= dt;
      if (p.life <= 0) particles.splice(i, 1);
    }
    for (let i = popups.length - 1; i >= 0; i--) {
      const p = popups[i];
      p.y -= 30 * dt;
      p.life -= dt;
      if (p.life <= 0) popups.splice(i, 1);
    }

    // reached the goal (top platform)
    if (player.y <= TILE + 2 && player.onGround) {
      nextLevel();
      popups.push({ x: player.x, y: player.y - 20, text: "CLEAR!", color: "#4ade80", life: 1.2 });
    }

    // timer / condor
    if (!condor) {
      levelTime -= dt;
      if (levelTime <= 0) {
        levelTime = 0;
        spawnCondor();
      }
    }
    timeFillEl.style.width = Math.max(0, (levelTime / levelTimeMax) * 100) + "%";
  }

  function drawBackground() {
    ctx.fillStyle = "#0b1220";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = "rgba(148,163,184,0.06)";
    for (let i = 0; i < 40; i++) {
      const x = (i * 53) % canvas.width;
      const y = (i * 97) % canvas.height;
      ctx.fillRect(x, y, 2, 2);
    }
  }

  function drawGrid() {
    for (let r = 0; r < ROWS; r++) {
      for (let c = 0; c < COLS; c++) {
        if (!grid[r][c]) continue;
        const x = c * TILE;
        const y = r * TILE;
        ctx.fillStyle = unbreakable[r][c] ? "#475569" : "#5eead4";
        ctx.fillRect(x, y, TILE, TILE);
        ctx.strokeStyle = "rgba(15,23,42,0.35)";
        ctx.lineWidth = 2;
        ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        if (!unbreakable[r][c]) {
          ctx.fillStyle = "rgba(255,255,255,0.35)";
          ctx.fillRect(x + 4, y + 4, TILE - 8, 4);
        }
      }
    }
  }

  function drawPlayer() {
    if (invuln > 0 && Math.floor(invuln * 12) % 2 === 0) return;
    const x = player.x;
    const y = player.y;
    ctx.fillStyle = "#f97316";
    ctx.fillRect(x, y + 10, player.w, player.h - 10);
    ctx.fillStyle = "#fde68a";
    ctx.fillRect(x + 4, y, player.w - 8, 14);
    ctx.fillStyle = "#0f172a";
    const eyeX = facing > 0 ? x + player.w - 8 : x + 3;
    ctx.fillRect(eyeX, y + 5, 3, 3);

    if (hammerTimer > 0) {
      ctx.strokeStyle = "#e2e8f0";
      ctx.lineWidth = 4;
      ctx.beginPath();
      const hx = facing > 0 ? x + player.w : x;
      ctx.moveTo(hx, y + 8);
      ctx.lineTo(hx + facing * 22, y + 18);
      ctx.stroke();
    }
  }

  function drawEnemies() {
    for (const en of enemies) {
      ctx.fillStyle = en.stunned > 0 ? "#facc15" : en.fast ? "#c084fc" : "#e2e8f0";
      ctx.beginPath();
      ctx.ellipse(en.x + en.w / 2, en.y + en.h / 2, en.w / 2, en.h / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#1e293b";
      const dir = en.vx >= 0 ? 1 : -1;
      ctx.fillRect(en.x + en.w / 2 + dir * 5 - 2, en.y + en.h / 2 - 4, 3, 3);
      if (en.stunned > 0) {
        ctx.fillStyle = "#1e293b";
        ctx.font = "10px sans-serif";
        ctx.fillText("☆", en.x + 4, en.y - 4);
      }
    }
    if (condor) {
      ctx.fillStyle = "#f87171";
      ctx.beginPath();
      ctx.moveTo(condor.x, condor.y + condor.h / 2);
      ctx.lineTo(condor.x + condor.w, condor.y);
      ctx.lineTo(condor.x + condor.w, condor.y + condor.h);
      ctx.closePath();
      ctx.fill();
    }
  }

  function drawParticles() {
    for (const p of particles) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / 0.5);
      ctx.fillRect(p.x, p.y, 4, 4);
      ctx.globalAlpha = 1;
    }
    for (const p of popups) {
      ctx.fillStyle = p.color;
      ctx.globalAlpha = Math.max(0, p.life / 0.8);
      ctx.font = "bold 13px sans-serif";
      ctx.fillText(p.text, p.x, p.y);
      ctx.globalAlpha = 1;
    }
  }

  function draw() {
    drawBackground();
    if (grid.length) {
      drawGrid();
      drawEnemies();
      if (player) drawPlayer();
      drawParticles();
    }
  }

  function loop(ts) {
    if (!lastTs) lastTs = ts;
    let dt = (ts - lastTs) / 1000;
    dt = Math.min(dt, 0.033);
    lastTs = ts;

    update(dt);
    draw();

    requestAnimationFrame(loop);
  }

  bindInput();
  buildLevel(1);
  spawnPlayer();
  draw();
  requestAnimationFrame(loop);
})();
