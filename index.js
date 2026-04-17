const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const ui = {
  startOverlay: document.getElementById("startOverlay"),
  gameOverOverlay: document.getElementById("gameOverOverlay"),
  upgradeOverlay: document.getElementById("upgradeOverlay"),
  startBtn: document.getElementById("startBtn"),
  restartBtn: document.getElementById("restartBtn"),
  upgradeOptions: document.getElementById("upgradeOptions"),
  waveLabel: document.getElementById("waveLabel"),
  scoreLabel: document.getElementById("scoreLabel"),
  bestLabel: document.getElementById("bestLabel"),
  enemyLabel: document.getElementById("enemyLabel"),
  hpBar: document.getElementById("hpBar"),
  hpText: document.getElementById("hpText"),
  dashBar: document.getElementById("dashBar"),
  dashText: document.getElementById("dashText"),
  bossWrap: document.getElementById("bossWrap"),
  bossBar: document.getElementById("bossBar"),
  bossText: document.getElementById("bossText"),
  finalStats: document.getElementById("finalStats"),
  moduleList: document.getElementById("moduleList"),
  pauseBtn: document.getElementById("pauseBtn"),
  settingsBtn: document.getElementById("settingsBtn"),
  pauseOverlay: document.getElementById("pauseOverlay"),
  resumeBtn: document.getElementById("resumeBtn"),
  pauseRestartBtn: document.getElementById("pauseRestartBtn"),
  musicVolume: document.getElementById("musicVolume"),
  sfxVolume: document.getElementById("sfxVolume"),
  qualityMode: document.getElementById("qualityMode"),
  reduceMotion: document.getElementById("reduceMotion"),
  touchControls: document.getElementById("touchControls"),
  touchStick: document.getElementById("touchStick"),
  touchKnob: document.getElementById("touchKnob"),
  touchFire: document.getElementById("touchFire"),
  touchDash: document.getElementById("touchDash"),
};

const STORAGE_KEY = "neon_siege_progress_v1";
const SETTINGS_KEY = "neon_siege_settings_v1";

const state = {
  running: false,
  pausedForUpgrade: false,
  pausedByMenu: false,
  gameOver: false,
  score: 0,
  wave: 1,
  bestScore: 0,
  bestWave: 1,
  bossWaveEvery: 5,
  enemyTarget: 6,
  enemySpawned: 0,
  particles: [],
  enemyBullets: [],
  bullets: [],
  enemies: [],
  floatTexts: [],
  modules: [],
  mouse: { x: canvas.width / 2, y: canvas.height / 2, down: false },
  touchMove: { x: 0, y: 0, active: false },
  keys: new Set(),
  lastTime: 0,
  stars: [],
  flash: 0,
  shake: 0,
  hitstop: 0,
  quality: "high",
  reducedMotion: false,
};

const player = {
  x: canvas.width / 2,
  y: canvas.height / 2,
  r: 14,
  speed: 240,
  maxHp: 100,
  hp: 100,
  damage: 20,
  fireRate: 0.19,
  bulletSpeed: 620,
  bulletLife: 0.95,
  bulletSize: 4,
  lifesteal: 0,
  multishot: 1,
  spread: 0.2,
  cd: 0,
  invuln: 0,
  dashForce: 520,
  dashDuration: 0.18,
  dashCdMax: 2.2,
  dashCd: 0,
  dashTime: 0,
  dashVx: 0,
  dashVy: 0,
};

let boss = null;

const upgradePool = [
  { id: "dmg", name: "Overclocked Rounds", desc: "+8 bullet damage", apply: () => (player.damage += 8) },
  { id: "firerate", name: "Rapid Trigger", desc: "18% faster fire rate", apply: () => (player.fireRate *= 0.82) },
  { id: "hp", name: "Nano Repairs", desc: "+30 max HP, heal 30", apply: () => { player.maxHp += 30; player.hp = Math.min(player.maxHp, player.hp + 30); } },
  { id: "speed", name: "Kinetic Boots", desc: "+40 move speed", apply: () => (player.speed += 40) },
  { id: "dash", name: "Blink Core", desc: "Dash cooldown -20%", apply: () => (player.dashCdMax *= 0.8) },
  { id: "pierce", name: "Dual Shot", desc: "+1 projectile", apply: () => (player.multishot = Math.min(3, player.multishot + 1)) },
  { id: "leech", name: "Vamp Protocol", desc: "4% lifesteal", apply: () => (player.lifesteal += 0.04) },
  { id: "projectile", name: "Hypervelocity", desc: "+140 bullet speed", apply: () => (player.bulletSpeed += 140) },
];

function rand(min, max) {
  return Math.random() * (max - min) + min;
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function dist(ax, ay, bx, by) {
  const dx = ax - bx;
  const dy = ay - by;
  return Math.hypot(dx, dy);
}

const audio = {
  ctx: null,
  master: null,
  musicGain: null,
  sfxGain: null,
  musicNodes: [],
  musicTimer: null,
  ambienceOn: false,
  enabled: false,
};

function qualityScale() {
  if (state.quality === "low") return 0.45;
  if (state.quality === "medium") return 0.72;
  return 1;
}

function emitCount(base) {
  return Math.max(1, Math.ceil(base * qualityScale()));
}

function saveProgress() {
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify({ bestScore: state.bestScore, bestWave: state.bestWave })
  );
}

function loadProgress() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    state.bestScore = Number(parsed.bestScore) || 0;
    state.bestWave = Number(parsed.bestWave) || 1;
  } catch {
    // Ignore malformed localStorage payload.
  }
}

function saveSettings() {
  localStorage.setItem(
    SETTINGS_KEY,
    JSON.stringify({
      musicVolume: Number(ui.musicVolume.value),
      sfxVolume: Number(ui.sfxVolume.value),
      quality: ui.qualityMode.value,
      reducedMotion: ui.reduceMotion.checked,
    })
  );
}

function loadSettings() {
  const raw = localStorage.getItem(SETTINGS_KEY);
  if (!raw) return;
  try {
    const parsed = JSON.parse(raw);
    if (parsed.musicVolume != null) ui.musicVolume.value = String(parsed.musicVolume);
    if (parsed.sfxVolume != null) ui.sfxVolume.value = String(parsed.sfxVolume);
    if (parsed.quality) ui.qualityMode.value = parsed.quality;
    ui.reduceMotion.checked = Boolean(parsed.reducedMotion);
  } catch {
    // Ignore malformed localStorage payload.
  }
}

function applySettings() {
  state.quality = ui.qualityMode.value;
  state.reducedMotion = ui.reduceMotion.checked;
  if (audio.musicGain) audio.musicGain.gain.value = Number(ui.musicVolume.value);
  if (audio.sfxGain) audio.sfxGain.gain.value = Number(ui.sfxVolume.value);
  saveSettings();
}

function initAudio() {
  if (audio.enabled) return;
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (!AudioCtx) return;

  audio.ctx = new AudioCtx();
  audio.master = audio.ctx.createGain();
  audio.master.gain.value = 0.5;
  audio.master.connect(audio.ctx.destination);

  audio.musicGain = audio.ctx.createGain();
  audio.musicGain.gain.value = Number(ui.musicVolume.value);
  audio.musicGain.connect(audio.master);

  audio.sfxGain = audio.ctx.createGain();
  audio.sfxGain.gain.value = Number(ui.sfxVolume.value);
  audio.sfxGain.connect(audio.master);

  audio.enabled = true;
}

function ensureAudioReady() {
  initAudio();
  if (!audio.ctx) return;
  if (audio.ctx.state !== "running") {
    audio.ctx.resume().catch(() => {
      // Resume can fail before user gesture; next gesture retries.
    });
  }
}

function stopSpaceAmbience() {
  if (!audio.enabled || !audio.ctx) return;
  audio.ambienceOn = false;
  if (audio.musicTimer) {
    clearInterval(audio.musicTimer);
    audio.musicTimer = null;
  }
  for (const node of audio.musicNodes) {
    try {
      node.stop(audio.ctx.currentTime + 0.02);
    } catch {
      // Node may already be stopped.
    }
  }
  audio.musicNodes.length = 0;
}

function playPadNote(freq, duration, volume, type = "triangle") {
  if (!audio.ctx) return;
  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  const filter = audio.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 900;
  osc.type = type;
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.7);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audio.musicGain);
  osc.start(now);
  osc.stop(now + duration + 0.08);
  audio.musicNodes.push(osc);
}

function startSpaceAmbience() {
  ensureAudioReady();
  if (!audio.enabled || !audio.ctx || audio.ctx.state !== "running" || audio.ambienceOn) return;
  audio.ambienceOn = true;
  const chordSets = [
    [130.81, 196.0, 261.63],   // C
    [146.83, 220.0, 293.66],   // D
    [174.61, 261.63, 349.23],  // F
    [164.81, 246.94, 329.63],  // E
  ];
  let idx = 0;
  const trigger = () => {
    if (!audio.ambienceOn) return;
    const chord = chordSets[idx % chordSets.length];
    idx += 1;
    playPadNote(chord[0], 4.8, 0.025, "sine");
    playPadNote(chord[1], 4.4, 0.02, "triangle");
    playPadNote(chord[2], 3.6, 0.016, "triangle");
    if (Math.random() < 0.65) {
      playPadNote(chord[2] * 2, 0.75, 0.009, "sine");
    }
  };
  trigger();
  audio.musicTimer = setInterval(trigger, 2200);
}

function playSfx(freq = 440, duration = 0.1, type = "triangle", volume = 1) {
  ensureAudioReady();
  if (!audio.enabled || !audio.ctx || audio.ctx.state !== "running") return;
  const now = audio.ctx.currentTime;
  const osc = audio.ctx.createOscillator();
  const gain = audio.ctx.createGain();
  const filter = audio.ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1800;
  osc.type = type;
  osc.frequency.setValueAtTime(freq, now);
  gain.gain.setValueAtTime(0.0001, now);
  gain.gain.exponentialRampToValueAtTime(Math.max(0.0001, volume), now + 0.02);
  gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
  osc.connect(filter);
  filter.connect(gain);
  gain.connect(audio.sfxGain);
  osc.start(now);
  osc.stop(now + duration + 0.02);
}

function addFloatText(x, y, text, color = "#9fe7ff") {
  state.floatTexts.push({ x, y, text, color, life: 0.6 });
}

function initStars() {
  state.stars.length = 0;
  for (let i = 0; i < 95; i += 1) {
    state.stars.push({
      x: rand(0, canvas.width),
      y: rand(0, canvas.height),
      s: rand(1, 2.4),
      v: rand(10, 35),
      a: rand(0.35, 0.95),
    });
  }
}

function spawnEnemy(type = "drone") {
  const edge = Math.floor(Math.random() * 4);
  let x = 0;
  let y = 0;
  if (edge === 0) { x = rand(0, canvas.width); y = -20; }
  if (edge === 1) { x = canvas.width + 20; y = rand(0, canvas.height); }
  if (edge === 2) { x = rand(0, canvas.width); y = canvas.height + 20; }
  if (edge === 3) { x = -20; y = rand(0, canvas.height); }

  const base = {
    x, y,
    vx: 0, vy: 0,
    hitCd: 0,
  };

  if (type === "brute") {
    state.enemies.push({
      ...base,
      type,
      r: 22,
      hp: 160 + state.wave * 18,
      maxHp: 160 + state.wave * 18,
      speed: 70 + state.wave * 3,
      color: "#ff8a47",
      damage: 18,
      score: 120,
    });
    return;
  }

  if (type === "spitter") {
    state.enemies.push({
      ...base,
      type,
      r: 16,
      hp: 78 + state.wave * 9,
      maxHp: 78 + state.wave * 9,
      speed: 84 + state.wave * 2,
      color: "#c98cff",
      damage: 12,
      score: 70,
      shootCd: rand(1.2, 1.9),
    });
    return;
  }

  state.enemies.push({
    ...base,
    type: "drone",
    r: 13,
    hp: 55 + state.wave * 8,
    maxHp: 55 + state.wave * 8,
    speed: 102 + state.wave * 5,
    color: "#ff4f94",
    damage: 10,
    score: 40,
  });
}

function spawnWave() {
  state.enemySpawned = 0;
  state.enemyTarget = 6 + state.wave * 2;
  const hasBoss = state.wave % state.bossWaveEvery === 0;
  if (hasBoss) {
    spawnBoss();
    ui.bossWrap.classList.remove("hidden");
    playSfx(140, 0.22, "sawtooth", 0.3);
  } else {
    boss = null;
    ui.bossWrap.classList.add("hidden");
    playSfx(520, 0.08, "triangle", 0.14);
  }
}

function spawnBoss() {
  boss = {
    x: canvas.width / 2,
    y: -100,
    r: 44,
    hp: 900 + state.wave * 110,
    maxHp: 900 + state.wave * 110,
    speed: 72 + state.wave * 2,
    damage: 22,
    pulseCd: 2.3,
    summonCd: 4.2,
    active: true,
    score: 900,
  };
}

function emitParticles(x, y, color, count, speed = 130) {
  const total = state.reducedMotion ? Math.min(3, count) : emitCount(count);
  for (let i = 0; i < total; i += 1) {
    const a = rand(0, Math.PI * 2);
    const v = rand(speed * 0.4, speed);
    state.particles.push({
      x,
      y,
      vx: Math.cos(a) * v,
      vy: Math.sin(a) * v,
      life: rand(0.2, 0.55),
      maxLife: rand(0.2, 0.55),
      size: rand(1.3, 3.8),
      color,
    });
  }
}

function shoot(dt) {
  player.cd -= dt;
  if (!state.mouse.down || player.cd > 0) return;

  const angle = Math.atan2(state.mouse.y - player.y, state.mouse.x - player.x);
  const shots = player.multishot;
  const step = shots > 1 ? player.spread / (shots - 1) : 0;
  const start = angle - player.spread / 2;

  for (let i = 0; i < shots; i += 1) {
    const a = shots === 1 ? angle : start + step * i;
    state.bullets.push({
      x: player.x + Math.cos(a) * (player.r + 4),
      y: player.y + Math.sin(a) * (player.r + 4),
      vx: Math.cos(a) * player.bulletSpeed,
      vy: Math.sin(a) * player.bulletSpeed,
      life: player.bulletLife,
      r: player.bulletSize,
      damage: player.damage,
    });
  }

  emitParticles(player.x, player.y, "#6be7ff", 5, 95);
  playSfx(560, 0.04, "square", 0.18);
  player.cd = player.fireRate;
}

function movePlayer(dt) {
  let ix = 0;
  let iy = 0;
  if (state.keys.has("w") || state.keys.has("arrowup")) iy -= 1;
  if (state.keys.has("s") || state.keys.has("arrowdown")) iy += 1;
  if (state.keys.has("a") || state.keys.has("arrowleft")) ix -= 1;
  if (state.keys.has("d") || state.keys.has("arrowright")) ix += 1;
  if (state.touchMove.active) {
    ix += state.touchMove.x;
    iy += state.touchMove.y;
  }

  const len = Math.hypot(ix, iy) || 1;
  ix /= len;
  iy /= len;

  player.dashCd -= dt;
  if (player.dashTime > 0) {
    player.dashTime -= dt;
    player.x += player.dashVx * dt;
    player.y += player.dashVy * dt;
    emitParticles(player.x, player.y, "#71e7ff", 2, 70);
  } else {
    player.x += ix * player.speed * dt;
    player.y += iy * player.speed * dt;
  }

  player.x = clamp(player.x, player.r, canvas.width - player.r);
  player.y = clamp(player.y, player.r, canvas.height - player.r);
}

function dash() {
  if (player.dashCd > 0 || player.dashTime > 0) return;
  const angle = Math.atan2(state.mouse.y - player.y, state.mouse.x - player.x);
  player.dashVx = Math.cos(angle) * player.dashForce;
  player.dashVy = Math.sin(angle) * player.dashForce;
  player.dashTime = player.dashDuration;
  player.dashCd = player.dashCdMax;
  player.invuln = 0.12;
  emitParticles(player.x, player.y, "#6af4ff", 22, 230);
  state.shake = Math.max(state.shake, 0.12);
  playSfx(290, 0.08, "sawtooth", 0.2);
}

function updateEnemies(dt) {
  if (!boss && state.enemySpawned < state.enemyTarget) {
    const spawnChance = 1.9 * dt;
    if (Math.random() < spawnChance) {
      const roll = Math.random();
      let type = "drone";
      if (roll < 0.14 + state.wave * 0.01) type = "brute";
      else if (roll < 0.28 + state.wave * 0.012) type = "spitter";
      spawnEnemy(type);
      state.enemySpawned += 1;
    }
  }

  for (let i = state.enemies.length - 1; i >= 0; i -= 1) {
    const e = state.enemies[i];
    e.hitCd -= dt;
    const angle = Math.atan2(player.y - e.y, player.x - e.x);
    e.vx = Math.cos(angle) * e.speed;
    e.vy = Math.sin(angle) * e.speed;
    e.x += e.vx * dt;
    e.y += e.vy * dt;

    if (e.type === "spitter") {
      e.shootCd -= dt;
      if (e.shootCd <= 0) {
        e.shootCd = rand(1.2, 1.8);
        const a = Math.atan2(player.y - e.y, player.x - e.x);
        state.enemyBullets.push({
          x: e.x + Math.cos(a) * (e.r + 2),
          y: e.y + Math.sin(a) * (e.r + 2),
          vx: Math.cos(a) * 260,
          vy: Math.sin(a) * 260,
          life: 2.6,
          r: 4.5,
          damage: 10 + state.wave * 0.8,
        });
      }
    }

    const touch = dist(e.x, e.y, player.x, player.y) < e.r + player.r;
    if (touch && e.hitCd <= 0 && player.invuln <= 0) {
      damagePlayer(e.damage);
      e.hitCd = 0.65;
    }
  }
}

function updateBoss(dt) {
  if (!boss || !boss.active) return;
  const ratio = boss.hp / boss.maxHp;
  if (ratio < 0.4) {
    boss.speed = 108 + state.wave * 2;
    boss.pulseCd -= dt * 0.35;
  } else if (ratio < 0.7) {
    boss.speed = 90 + state.wave * 2;
    boss.summonCd -= dt * 0.2;
  }

  const arrive = boss.y < 110;
  if (arrive) {
    boss.y += 72 * dt;
  } else {
    const angle = Math.atan2(player.y - boss.y, player.x - boss.x);
    boss.x += Math.cos(angle) * boss.speed * dt;
    boss.y += Math.sin(angle) * boss.speed * dt;
  }

  boss.pulseCd -= dt;
  boss.summonCd -= dt;

  if (boss.pulseCd <= 0) {
    boss.pulseCd = 2.6;
    emitParticles(boss.x, boss.y, "#ff6aa6", 40, 250);
    const hit = dist(boss.x, boss.y, player.x, player.y) < 140;
    if (hit && player.invuln <= 0) damagePlayer(boss.damage + 8);
  }

  if (boss.summonCd <= 0) {
    boss.summonCd = 4.3;
    for (let i = 0; i < 3; i += 1) spawnEnemy("drone");
  }

  const touch = dist(boss.x, boss.y, player.x, player.y) < boss.r + player.r;
  if (touch && player.invuln <= 0) damagePlayer(boss.damage);
}

function updateBullets(dt) {
  for (let i = state.bullets.length - 1; i >= 0; i -= 1) {
    const b = state.bullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || b.x < -40 || b.x > canvas.width + 40 || b.y < -40 || b.y > canvas.height + 40) {
      state.bullets.splice(i, 1);
      continue;
    }

    let hit = false;
    for (let j = state.enemies.length - 1; j >= 0; j -= 1) {
      const e = state.enemies[j];
      if (dist(b.x, b.y, e.x, e.y) < b.r + e.r) {
        e.hp -= b.damage;
        emitParticles(b.x, b.y, "#ff87b4", 8, 145);
        hit = true;
        if (e.hp <= 0) {
          state.score += e.score;
          addFloatText(e.x, e.y - 8, `+${e.score}`);
          if (player.lifesteal > 0) player.hp = Math.min(player.maxHp, player.hp + e.score * player.lifesteal * 0.06);
          emitParticles(e.x, e.y, e.color, 18, 200);
          playSfx(220 + Math.random() * 80, 0.06, "triangle", 0.16);
          state.enemies.splice(j, 1);
        }
        break;
      }
    }

    if (!hit && boss && boss.active && dist(b.x, b.y, boss.x, boss.y) < b.r + boss.r) {
      boss.hp -= b.damage;
      emitParticles(b.x, b.y, "#ff98b8", 10, 160);
      hit = true;
      if (boss.hp <= 0) {
        boss.active = false;
        state.score += boss.score;
        addFloatText(boss.x, boss.y - 24, `+${boss.score}`, "#ffb6cb");
        emitParticles(boss.x, boss.y, "#ff648f", 65, 280);
        state.flash = 0.35;
        state.shake = Math.max(state.shake, 0.38);
        state.hitstop = 0.08;
        playSfx(120, 0.24, "sawtooth", 0.42);
        boss = null;
      }
    }

    if (hit) state.bullets.splice(i, 1);
  }
}

function updateEnemyBullets(dt) {
  for (let i = state.enemyBullets.length - 1; i >= 0; i -= 1) {
    const b = state.enemyBullets[i];
    b.life -= dt;
    b.x += b.vx * dt;
    b.y += b.vy * dt;
    if (b.life <= 0 || b.x < -40 || b.x > canvas.width + 40 || b.y < -40 || b.y > canvas.height + 40) {
      state.enemyBullets.splice(i, 1);
      continue;
    }
    const hitPlayer = dist(b.x, b.y, player.x, player.y) < b.r + player.r;
    if (hitPlayer && player.invuln <= 0) {
      damagePlayer(b.damage);
      state.enemyBullets.splice(i, 1);
      emitParticles(b.x, b.y, "#b58cff", 10, 150);
    }
  }
}

function updateParticles(dt) {
  for (let i = state.particles.length - 1; i >= 0; i -= 1) {
    const p = state.particles[i];
    p.life -= dt;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    p.vx *= 0.98;
    p.vy *= 0.98;
    if (p.life <= 0) state.particles.splice(i, 1);
  }
}

function damagePlayer(amount) {
  if (player.invuln > 0) return;
  player.hp -= amount;
  player.invuln = 0.3;
  state.flash = 0.15;
  state.shake = Math.max(state.shake, 0.22);
  state.hitstop = 0.045;
  playSfx(170, 0.09, "square", 0.24);
  emitParticles(player.x, player.y, "#68e6ff", 20, 205);
  if (player.hp <= 0) endGame();
}

function maybeAdvanceWave() {
  const noBoss = !boss;
  const enemiesDone = state.enemySpawned >= state.enemyTarget && state.enemies.length === 0;
  if (noBoss && enemiesDone && !state.pausedForUpgrade) {
    state.wave += 1;
    state.pausedForUpgrade = true;
    showUpgradeChoices();
  }
}

function pickUpgrades() {
  const copy = [...upgradePool];
  const chosen = [];
  while (chosen.length < 3 && copy.length) {
    const idx = Math.floor(Math.random() * copy.length);
    chosen.push(copy.splice(idx, 1)[0]);
  }
  return chosen;
}

function showUpgradeChoices() {
  const choices = pickUpgrades();
  ui.upgradeOptions.innerHTML = "";
  choices.forEach((u) => {
    const btn = document.createElement("button");
    btn.className = "upgrade-btn";
    btn.innerHTML = `<strong>${u.name}</strong><span>${u.desc}</span>`;
    btn.addEventListener("click", () => {
      u.apply();
      state.modules.push(u.name);
      addFloatText(player.x, player.y - 26, u.name, "#86f6ff");
      playSfx(680, 0.11, "triangle", 0.22);
      ui.upgradeOverlay.classList.remove("active");
      state.pausedForUpgrade = false;
      spawnWave();
    });
    ui.upgradeOptions.appendChild(btn);
  });
  ui.upgradeOverlay.classList.add("active");
}

function renderModules() {
  ui.moduleList.innerHTML = "";
  const recent = state.modules.slice(-4);
  if (!recent.length) {
    const chip = document.createElement("span");
    chip.className = "module-chip";
    chip.textContent = "None yet";
    ui.moduleList.appendChild(chip);
    return;
  }
  recent.forEach((name) => {
    const chip = document.createElement("span");
    chip.className = "module-chip";
    chip.textContent = name;
    ui.moduleList.appendChild(chip);
  });
}

function updateUI() {
  ui.waveLabel.textContent = state.wave;
  ui.scoreLabel.textContent = Math.floor(state.score);
  ui.bestLabel.textContent = Math.floor(Math.max(state.bestScore, state.score));
  ui.enemyLabel.textContent = state.enemies.length + (boss ? " + BOSS" : "");

  const hpRatio = clamp(player.hp / player.maxHp, 0, 1);
  ui.hpBar.style.width = `${hpRatio * 100}%`;
  ui.hpText.textContent = `${Math.ceil(Math.max(player.hp, 0))} / ${player.maxHp}`;

  const dashRatio = 1 - clamp(player.dashCd / player.dashCdMax, 0, 1);
  ui.dashBar.style.width = `${dashRatio * 100}%`;
  ui.dashText.textContent = player.dashCd <= 0 ? "Ready" : `${player.dashCd.toFixed(1)}s`;

  if (boss && boss.active) {
    const bossRatio = clamp(boss.hp / boss.maxHp, 0, 1);
    ui.bossBar.style.width = `${bossRatio * 100}%`;
    ui.bossText.textContent = `${Math.ceil(boss.hp)} / ${boss.maxHp}`;
    ui.bossWrap.classList.remove("hidden");
  } else {
    ui.bossBar.style.width = "0%";
    ui.bossText.textContent = "Dormant";
  }
  renderModules();
}

function drawBackground(dt) {
  ctx.fillStyle = "#060b1a";
  ctx.fillRect(0, 0, canvas.width, canvas.height);

  for (const s of state.stars) {
    s.y += s.v * dt;
    if (s.y > canvas.height + 3) {
      s.y = -3;
      s.x = rand(0, canvas.width);
    }
    ctx.globalAlpha = s.a;
    ctx.fillStyle = "#8ebdff";
    ctx.fillRect(s.x, s.y, s.s, s.s);
  }
  ctx.globalAlpha = 1;

  ctx.strokeStyle = "#15337855";
  ctx.lineWidth = 1;
  for (let x = 0; x < canvas.width; x += 48) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, canvas.height);
    ctx.stroke();
  }
  for (let y = 0; y < canvas.height; y += 48) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(canvas.width, y);
    ctx.stroke();
  }
}

function drawPlayer() {
  const angle = Math.atan2(state.mouse.y - player.y, state.mouse.x - player.x);
  const pulse = 1 + Math.sin(performance.now() * 0.01) * 0.08;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(angle);
  ctx.shadowBlur = 18;
  ctx.shadowColor = "#46e5ff";
  ctx.fillStyle = player.invuln > 0 ? "#9beeff" : "#59dbff";
  ctx.beginPath();
  ctx.moveTo(player.r * 1.4 * pulse, 0);
  ctx.lineTo(-player.r * 0.8, player.r * 0.85);
  ctx.lineTo(-player.r * 0.5, 0);
  ctx.lineTo(-player.r * 0.8, -player.r * 0.85);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawEnemies() {
  for (const e of state.enemies) {
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = e.color;
    ctx.fillStyle = e.color;
    ctx.beginPath();
    ctx.arc(e.x, e.y, e.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    const ratio = clamp(e.hp / e.maxHp, 0, 1);
    ctx.fillStyle = "#16050d";
    ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2, 4);
    ctx.fillStyle = "#ff6b9f";
    ctx.fillRect(e.x - e.r, e.y - e.r - 10, e.r * 2 * ratio, 4);
  }
}

function drawBoss() {
  if (!boss || !boss.active) return;
  ctx.save();
  ctx.shadowBlur = 30;
  ctx.shadowColor = "#ff538b";
  ctx.fillStyle = "#ff4f90";
  ctx.beginPath();
  ctx.arc(boss.x, boss.y, boss.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = "#ffd2df";
  ctx.beginPath();
  ctx.arc(boss.x + 12, boss.y - 12, 8, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function drawBullets() {
  for (const b of state.bullets) {
    ctx.save();
    ctx.shadowBlur = 12;
    ctx.shadowColor = "#7aecff";
    ctx.fillStyle = "#8ff2ff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawEnemyBullets() {
  for (const b of state.enemyBullets) {
    ctx.save();
    ctx.shadowBlur = 10;
    ctx.shadowColor = "#c592ff";
    ctx.fillStyle = "#cfa5ff";
    ctx.beginPath();
    ctx.arc(b.x, b.y, b.r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

function drawParticles() {
  for (const p of state.particles) {
    const alpha = clamp(p.life / p.maxLife, 0, 1);
    ctx.globalAlpha = alpha;
    ctx.fillStyle = p.color;
    ctx.fillRect(p.x, p.y, p.size, p.size);
  }
  ctx.globalAlpha = 1;
}

function updateFloatTexts(dt) {
  for (let i = state.floatTexts.length - 1; i >= 0; i -= 1) {
    const t = state.floatTexts[i];
    t.life -= dt;
    t.y -= 24 * dt;
    if (t.life <= 0) state.floatTexts.splice(i, 1);
  }
}

function drawFloatTexts() {
  ctx.save();
  ctx.textAlign = "center";
  ctx.font = "bold 14px Segoe UI";
  for (const t of state.floatTexts) {
    ctx.globalAlpha = clamp(t.life * 1.8, 0, 1);
    ctx.fillStyle = t.color;
    ctx.fillText(t.text, t.x, t.y);
  }
  ctx.restore();
  ctx.globalAlpha = 1;
}

function drawFlash(dt) {
  if (state.flash <= 0) return;
  state.flash -= dt;
  const alpha = clamp(state.flash * 2.4, 0, 0.28);
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
}

function loop(ts) {
  let dt = clamp((ts - state.lastTime) / 1000, 0, 0.033);
  state.lastTime = ts;
  if (state.hitstop > 0) {
    state.hitstop -= dt;
    dt *= 0.1;
  }
  state.shake = Math.max(0, state.shake - dt);

  if (!state.running) {
    drawBackground(dt);
    drawPlayer();
    updateUI();
    requestAnimationFrame(loop);
    return;
  }

  if (!state.gameOver && !state.pausedForUpgrade && !state.pausedByMenu) {
    player.invuln -= dt;
    movePlayer(dt);
    shoot(dt);
    updateEnemies(dt);
    updateBoss(dt);
    updateBullets(dt);
    updateEnemyBullets(dt);
    updateParticles(dt);
    updateFloatTexts(dt);
    maybeAdvanceWave();
  }

  ctx.save();
  if (state.shake > 0 && !state.reducedMotion) {
    const mag = state.shake * 8;
    ctx.translate(rand(-mag, mag), rand(-mag, mag));
  }
  drawBackground(dt);
  drawBullets();
  drawEnemyBullets();
  drawEnemies();
  drawBoss();
  drawPlayer();
  drawParticles();
  drawFloatTexts();
  drawFlash(dt);
  ctx.restore();
  updateUI();

  requestAnimationFrame(loop);
}

function resetGame() {
  ensureAudioReady();
  startSpaceAmbience();
  state.running = true;
  state.pausedForUpgrade = false;
  state.pausedByMenu = false;
  state.gameOver = false;
  state.score = 0;
  state.wave = 1;
  state.enemyTarget = 6;
  state.enemySpawned = 0;
  state.bullets.length = 0;
  state.enemyBullets.length = 0;
  state.enemies.length = 0;
  state.particles.length = 0;
  state.floatTexts.length = 0;
  state.modules.length = 0;
  boss = null;

  player.x = canvas.width / 2;
  player.y = canvas.height / 2;
  player.maxHp = 100;
  player.hp = 100;
  player.speed = 240;
  player.damage = 20;
  player.fireRate = 0.19;
  player.bulletSpeed = 620;
  player.lifesteal = 0;
  player.multishot = 1;
  player.dashCdMax = 2.2;
  player.dashCd = 0;
  player.cd = 0;
  player.dashTime = 0;
  player.invuln = 0;

  ui.startOverlay.classList.remove("active");
  ui.gameOverOverlay.classList.remove("active");
  ui.upgradeOverlay.classList.remove("active");
  ui.pauseOverlay.classList.remove("active");
  ui.bossWrap.classList.add("hidden");

  playSfx(390, 0.09, "triangle", 0.22);
  spawnWave();
}

function endGame() {
  stopSpaceAmbience();
  state.gameOver = true;
  state.running = false;
  state.bestScore = Math.max(state.bestScore, state.score);
  state.bestWave = Math.max(state.bestWave, state.wave);
  saveProgress();
  ui.finalStats.textContent = `You reached wave ${state.wave} with a score of ${Math.floor(state.score)}.`;
  ui.gameOverOverlay.classList.add("active");
  playSfx(110, 0.3, "sawtooth", 0.28);
}

function togglePause(forceOpen = null) {
  if (state.gameOver || state.pausedForUpgrade) return;
  const next = forceOpen == null ? !state.pausedByMenu : forceOpen;
  state.pausedByMenu = next;
  ui.pauseOverlay.classList.toggle("active", next);
  if (next) stopSpaceAmbience();
  else if (state.running) startSpaceAmbience();
}

function setupInput() {
  const unlockAudio = () => ensureAudioReady();
  window.addEventListener("pointerdown", unlockAudio, { passive: true });
  window.addEventListener("keydown", unlockAudio, { passive: true });

  window.addEventListener("keydown", (e) => {
    const key = e.key.toLowerCase();
    if (key === "escape") {
      e.preventDefault();
      togglePause();
      return;
    }
    state.keys.add(key);
    if (key === "shift") dash();
  });

  window.addEventListener("keyup", (e) => {
    state.keys.delete(e.key.toLowerCase());
  });

  canvas.addEventListener("mousemove", (e) => {
    const rect = canvas.getBoundingClientRect();
    const sx = canvas.width / rect.width;
    const sy = canvas.height / rect.height;
    state.mouse.x = (e.clientX - rect.left) * sx;
    state.mouse.y = (e.clientY - rect.top) * sy;
  });

  canvas.addEventListener("mousedown", () => {
    ensureAudioReady();
    state.mouse.down = true;
  });

  window.addEventListener("mouseup", () => {
    state.mouse.down = false;
  });

  ui.pauseBtn.addEventListener("click", () => togglePause(true));
  ui.settingsBtn.addEventListener("click", () => togglePause(true));
  ui.resumeBtn.addEventListener("click", () => togglePause(false));
  ui.pauseRestartBtn.addEventListener("click", () => {
    togglePause(false);
    resetGame();
  });

  [ui.musicVolume, ui.sfxVolume, ui.qualityMode, ui.reduceMotion].forEach((el) => {
    el.addEventListener("input", applySettings);
    el.addEventListener("change", applySettings);
  });

  const stickRadius = 55;
  function updateStickPosition(clientX, clientY) {
    const rect = ui.touchStick.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    let dx = clientX - cx;
    let dy = clientY - cy;
    const mag = Math.hypot(dx, dy) || 1;
    if (mag > stickRadius) {
      dx = (dx / mag) * stickRadius;
      dy = (dy / mag) * stickRadius;
    }
    state.touchMove.x = clamp(dx / stickRadius, -1, 1);
    state.touchMove.y = clamp(dy / stickRadius, -1, 1);
    state.touchMove.active = true;
    ui.touchKnob.style.left = `${50 + (dx / stickRadius) * 50}%`;
    ui.touchKnob.style.top = `${50 + (dy / stickRadius) * 50}%`;

    const cRect = canvas.getBoundingClientRect();
    state.mouse.x = clamp((clientX - cRect.left) * (canvas.width / cRect.width), 0, canvas.width);
    state.mouse.y = clamp((clientY - cRect.top) * (canvas.height / cRect.height), 0, canvas.height);
  }

  function resetStick() {
    state.touchMove.active = false;
    state.touchMove.x = 0;
    state.touchMove.y = 0;
    ui.touchKnob.style.left = "50%";
    ui.touchKnob.style.top = "50%";
  }

  ui.touchStick.addEventListener("pointerdown", (e) => {
    updateStickPosition(e.clientX, e.clientY);
    ui.touchStick.setPointerCapture(e.pointerId);
  });
  ui.touchStick.addEventListener("pointermove", (e) => {
    if (!state.touchMove.active) return;
    updateStickPosition(e.clientX, e.clientY);
  });
  ui.touchStick.addEventListener("pointerup", resetStick);
  ui.touchStick.addEventListener("pointercancel", resetStick);

  ui.touchFire.addEventListener("pointerdown", () => {
    ensureAudioReady();
    state.mouse.down = true;
  });
  ui.touchFire.addEventListener("pointerup", () => {
    state.mouse.down = false;
  });
  ui.touchFire.addEventListener("pointercancel", () => {
    state.mouse.down = false;
  });
  ui.touchDash.addEventListener("pointerdown", () => dash());
}

ui.startBtn.addEventListener("click", resetGame);
ui.restartBtn.addEventListener("click", resetGame);

loadProgress();
loadSettings();
applySettings();
setupInput();
initStars();
state.lastTime = performance.now();
requestAnimationFrame(loop);