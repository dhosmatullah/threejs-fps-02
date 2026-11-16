// Boot and the one loop: a fixed 60 Hz simulation feeding a render at the display's
// rate. This file wires the modules together — world, player, arsenal, bots, grenades,
// particles, match, HUD, audio — and owns the player's own shooting: the ray, the
// spread cone, the damage falloff, the tracer and the impact. Everything else lives in
// its module; shared state lives in match.js (rules) and the module that owns it.
//
// ?shot=start|play|end with &seed=N sets up a deterministic frame for a capture,
// renders it twice, then freezes it and sets window.__shotReady.
import * as THREE from 'three';
import { PALETTE } from './palette.js';
import { createWorld } from './world.js';
import { createInput } from './input.js';
import { createPlayer } from './player.js';
import { createArsenal, WEAPONS, GRENADES } from './weapons.js';
import { createBots } from './bots.js';
import { createGrenades } from './grenades.js';
import { createParticles, createTracers } from './particles.js';
import { createMatch } from './match.js';
import { createHud } from './hud.js';
import { createAudio } from './audio.js';

const FIXED_STEP = 1 / 60;
const params = new URLSearchParams(window.location.search);
const shot = params.get('shot');
const seed = Number.parseInt(params.get('seed') ?? '1', 10) || 1;

function mulberry32(initial) {
  let a = initial;
  return function random() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rng = mulberry32(seed * 7919 + 13);

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
document.getElementById('game').appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(PALETTE.canvas);
scene.fog = new THREE.Fog(new THREE.Color(PALETTE.canvas), 34, 95);
const camera = new THREE.PerspectiveCamera(74, window.innerWidth / window.innerHeight, 0.05, 240);
scene.add(camera);

const world = createWorld(scene, rng);
const particles = createParticles(scene);
const tracers = createTracers(scene);
const grenades = createGrenades(scene, world.colliders);
const hud = createHud();
const audio = createAudio();
const player = createPlayer(world.colliders);
const arsenal = createArsenal(camera);
const raycaster = new THREE.Raycaster();

const playerRef = { name: 'Kamu', team: 'penjaga', isPlayer: true, position: player.state.position };
let shake = 0;
let explosionLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 16);
scene.add(explosionLight);
let explosionLightLeft = 0;

// The planted / dropped charge, as a physical object in the world.
const bombMesh = new THREE.Group();
const bombBody = new THREE.Mesh(
  new THREE.BoxGeometry(0.34, 0.16, 0.24),
  new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c3138'), roughness: 0.5, metalness: 0.4 }),
);
const bombLamp = new THREE.Mesh(
  new THREE.SphereGeometry(0.045, 8, 8),
  new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sungai), emissive: new THREE.Color(PALETTE.sungai), emissiveIntensity: 3 }),
);
bombLamp.position.y = 0.12;
bombMesh.add(bombBody, bombLamp);
bombMesh.visible = false;
scene.add(bombMesh);

function raycastBlocked(from, to) {
  const dist = from.distanceTo(to);
  if (dist < 0.01) return false;
  raycaster.set(from, _dir.subVectors(to, from).normalize());
  raycaster.far = dist - 0.25;
  return raycaster.intersectObjects(world.shootables, false).length > 0;
}
const _dir = new THREE.Vector3();
const _from = new THREE.Vector3();
const _to = new THREE.Vector3();
const _muzzle = new THREE.Vector3();

const bots = createBots(scene, world, {
  rng,
  raycastBlocked,
  smokeBlocks: (a, b) => grenades.smokeBlocks(a, b),
  onTracer: (from, to, hex) => tracers.fire(from, to, hex),
  onBotShot: (bot) => {
    const d = bot.group.position.distanceTo(player.state.position);
    if (d < 26) audio.enemyShot();
  },
  onPlayerHit: (amount, bot) => {
    if (match.state.phase !== 'live' || !player.state.alive) return;
    const fromPos = bot.group.position;
    const applied = player.hurt(Math.round(amount));
    if (applied <= 0) return;
    const dx = fromPos.x - player.state.position.x;
    const dz = fromPos.z - player.state.position.z;
    const fx = -Math.sin(player.state.yaw);
    const fz = -Math.cos(player.state.yaw);
    const rx = Math.cos(player.state.yaw);
    const rz = -Math.sin(player.state.yaw);
    const angle = Math.atan2(dx * rx + dz * rz, dx * fx + dz * fz);
    hud.damageFrom(0.4, angle);
    audio.hurt();
    shake = Math.min(0.5, shake + 0.12);
    if (!player.state.alive) {
      hud.banner('Kamu gugur', 'Skuadmu melanjutkan ronde tanpamu', 3);
      hud.killfeed(`${nameTag(bot)} ▸ <b class="p">Kamu</b>`);
      match.onPlayerDeath();
    }
  },
  onKill: (victim, killer) => {
    const killerName = killer ? (killer.isPlayer ? '<b class="p">Kamu</b>' : nameTag(killer)) : 'Ledakan';
    const victimName = nameTag(victim);
    hud.killfeed(`${killerName} ▸ ${victimName}`);
    const byPlayer = Boolean(killer && killer.isPlayer);
    match.onKill(killer ? killer.team : null, victim.team, byPlayer);
    if (victim.isCarrier) {
      // match.step notices the carrier is down and drops the charge next tick.
    }
  },
});

function nameTag(entity) {
  if (!entity) return '—';
  const cls = entity.team === 'penjaga' ? 'p' : 's';
  return `<b class="${cls}">${entity.name}</b>`;
}

const BUY_ITEMS = [
  { id: 'ronda9', key: '1', label: WEAPONS.ronda9.name, price: WEAPONS.ronda9.price },
  { id: 'sebar12', key: '2', label: WEAPONS.sebar12.name, price: WEAPONS.sebar12.price },
  { id: 'runda47', key: '3', label: WEAPONS.runda47.name, price: WEAPONS.runda47.price },
  { id: 'jauh1', key: '4', label: WEAPONS.jauh1.name, price: WEAPONS.jauh1.price },
  { id: 'armor', key: '5', label: 'Rompi Anti-Peluru', price: 650 },
  { id: 'he', key: '6', label: GRENADES.he.name, price: GRENADES.he.price },
  { id: 'flash', key: '7', label: GRENADES.flash.name, price: GRENADES.flash.price },
  { id: 'smoke', key: '8', label: GRENADES.smoke.name, price: GRENADES.smoke.price },
];
hud.buildBuyMenu(BUY_ITEMS);

const match = createMatch({
  hud,
  audio,
  rng,
  aliveCounts: () => ({ penjaga: bots.aliveCount('penjaga'), sungai: bots.aliveCount('sungai') }),
  playerAlive: () => player.state.alive,
  playerArmor: () => player.state.armor,
  giveArmor: () => { player.state.armor = 100; },
  grenadeCount: (id) => arsenal.loadout.grenades[id],
  giveGrenade: (id) => { arsenal.loadout.grenades[id] += 1; },
  owns: (id) => arsenal.loadout.primary === id || arsenal.loadout.sidearm === id,
  giveWeapon: (id) => arsenal.give(id),
  resetArsenal: (survived) => {
    arsenal.resetRound(survived);
    const [sx, sz] = world.spawns.penjaga[0];
    player.respawn(new THREE.Vector3(sx, 0, sz), 0);
    if (!survived) player.state.armor = 0;
  },
  setupRound: (targetSite, carrierIndex) => {
    bombMesh.visible = false;
    bots.spawnRound({ targetSite, carrierIndex });
  },
  carrier: () => bots.carrier(),
  siteOf: (letter) => world.sites[letter],
  pushIn: () => bots.pushIn(),
  convergeOn: (letter) => bots.convergeOn(letter),
  onBombDropped: (pos) => {
    bombMesh.position.set(pos.x, 0.1, pos.z);
    bombMesh.visible = true;
    bots.fetchBomb(pos);
  },
  bombPicker: (pos) => bots.botNear(pos.x, pos.z, 1.3, 'sungai'),
  onBombPickedUp: (bot) => {
    bombMesh.visible = false;
    bots.makeCarrier(bot, match.state.targetSite);
  },
  onBombPlanted: (site, pos) => {
    bombMesh.position.set(pos.x, 0.1, pos.z);
    bombMesh.visible = true;
    bots.convergeOn(site);
  },
  onBombExploded: (pos) => {
    bombMesh.visible = false;
    explodeAt(new THREE.Vector3(pos.x, 0.6, pos.z), 90, 7);
  },
  onRoundEnd: () => {
    if (match.state.phase === 'matchover' && document.pointerLockElement) document.exitPointerLock();
  },
});
function explodeAt(point, maxDamage, radius) {
  audio.explosion();
  particles.explosion(point, rng);
  explosionLight.position.copy(point);
  explosionLight.intensity = 60;
  explosionLightLeft = 0.4;
  shake = Math.min(0.8, shake + 0.3);
  const hurtEntity = (pos, apply) => {
    const d = Math.hypot(pos.x - point.x, pos.z - point.z);
    if (d < radius) apply(Math.round(maxDamage * (1 - d / radius) + 8));
  };
  if (player.state.alive && match.state.phase === 'live') {
    hurtEntity(player.state.position, (dmg) => {
      player.hurt(dmg);
      hud.damageFrom(0.5, 0);
      if (!player.state.alive) match.onPlayerDeath();
    });
  }
  for (const bot of bots.bots) {
    if (bot.alive) hurtEntity(bot.group.position, (dmg) => bots.damage(bot, dmg, 'torso', null));
  }
}

grenades.hooks.onExplode = (point) => explodeAt(point, 78, 5.2);
grenades.hooks.onFlash = (point) => {
  audio.flashPop();
  particles.spark(point, rng);
  // The player is blinded by facing the pop with a clear view of it.
  if (player.state.alive) {
    _dir.subVectors(point, camera.position).normalize();
    camera.getWorldDirection(_to);
    const facing = _dir.dot(_to);
    const dist = camera.position.distanceTo(point);
    if (facing > 0.15 && dist < 24 && !raycastBlocked(camera.position, point)) {
      const strength = Math.min(1.5, ((facing - 0.15) / 0.85) * Math.max(0.25, 1 - dist / 30) * 1.6);
      hud.setFlash(strength);
    }
  }
  for (const bot of bots.bots) {
    if (!bot.alive) continue;
    const d = bot.group.position.distanceTo(point);
    if (d < 16) bot.flashed = Math.max(bot.flashed, 3.2 - d * 0.1);
  }
};
grenades.hooks.onSmoke = () => {};

const input = createInput(renderer.domElement, onLockChange);
let started = false;
let pendingGrenade = null;

hud.onPlay(() => {
  if (shot) return;
  audio.unlock();
  if (match.state.phase === 'matchover') {
    match.startMatch();
  } else if (match.state.phase === 'idle') {
    match.startMatch();
  }
  started = true;
  input.requestLock();
});

function onLockChange(locked) {
  if (shot) return;
  if (locked) {
    hud.hideOverlay();
  } else if (started && match.state.phase !== 'matchover') {
    hud.showOverlay('paused');
  }
}

function syncCamera(dt) {
  const body = player.state;
  const eyeTarget = body.alive ? body.eye : 0.45;
  camera.position.set(body.position.x, body.position.y + eyeTarget, body.position.z);
  const shX = shake > 0 ? (rng() * 2 - 1) * shake * 0.02 : 0;
  const shY = shake > 0 ? (rng() * 2 - 1) * shake * 0.02 : 0;
  camera.rotation.set(body.pitch + shX, body.yaw + shY, body.alive ? 0 : 0.32, 'YXZ');
  const targetFov = arsenal.scoped ? 74 / arsenal.def.zoom : 74;
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 18);
    camera.updateProjectionMatrix();
  }
}

function shootRay(spread) {
  camera.getWorldDirection(_dir);
  _dir.x += (rng() * 2 - 1) * spread;
  _dir.y += (rng() * 2 - 1) * spread;
  _dir.z += (rng() * 2 - 1) * spread;
  _dir.normalize();
  raycaster.set(camera.position, _dir);
  raycaster.far = 90;
  const targets = world.shootables.concat(bots.hitMeshes);
  const hit = raycaster.intersectObjects(targets, false)[0];
  arsenal.muzzleWorld(_muzzle);
  if (!hit) {
    _to.copy(camera.position).addScaledVector(_dir, 60);
    tracers.fire(_muzzle, _to, '#ffd98a');
    return;
  }
  tracers.fire(_muzzle, hit.point, '#ffd98a');
  const bot = hit.object.userData.bot;
  if (bot) {
    const part = hit.object.userData.part;
    const damage = arsenal.damageAt(hit.distance, part);
    const died = bots.damage(bot, damage, part, playerRef);
    particles.hitPuff(hit.point, rng, bot.team === 'sungai' ? '#d95f43' : '#3d9bc4');
    hud.hitMarker(died);
    audio.hit(died);
  } else {
    particles.impact(hit.point, hit.face ? hit.face.normal : _dir, rng);
  }
}

function tryFire() {
  const def = arsenal.def;
  if (pendingGrenade) {
    const kind = pendingGrenade;
    pendingGrenade = null;
    if (arsenal.loadout.grenades[kind] <= 0) return;
    arsenal.loadout.grenades[kind] -= 1;
    camera.getWorldDirection(_dir);
    _from.copy(camera.position).addScaledVector(_dir, 0.5);
    grenades.throwGrenade(kind, _from, _dir, player.state.crouching ? 10 : 13.5);
    audio.throwWhoosh();
    return;
  }
  if (def.kind === 'knife') {
    if (!arsenal.canShoot()) return;
    arsenal.pullTrigger();
    audio.throwWhoosh();
    // A swing connects with the nearest bot inside arm's reach and the view cone.
    camera.getWorldDirection(_dir);
    for (const bot of bots.bots) {
      if (!bot.alive || bot.team === 'penjaga') continue;
      _to.subVectors(bot.group.position, player.state.position);
      const dist = _to.length();
      if (dist < 1.8 && _to.normalize().dot(_dir) > 0.5) {
        const died = bots.damage(bot, def.damage, 'torso', playerRef);
        hud.hitMarker(died);
        audio.hit(died);
        break;
      }
    }
    return;
  }
  if (!arsenal.canShoot()) return;
  if (!arsenal.ready()) {
    if (arsenal.mags[arsenal.current].mag === 0) {
      audio.dryFire();
      if (arsenal.reload()) audio.reloadStart();
    }
    return;
  }
  arsenal.pullTrigger();
  audio.shot(def.sound);
  bots.notifyNoise(player.state.position.x, player.state.position.z, 21, 'penjaga');
  const spread = arsenal.spread(player.groundSpeed(), player.state.crouching);
  for (let pellet = 0; pellet < def.pellets; pellet += 1) shootRay(spread);
  player.recoil(def.kick * (0.85 + rng() * 0.35), (rng() * 2 - 1) * def.kick * 0.55);
  shake = Math.min(0.4, shake + def.kick * 1.4);
}

function handlePressed(pressed) {
  const phase = match.state.phase;
  if (phase === 'buy') {
    for (const item of BUY_ITEMS) {
      if (pressed.has(`Digit${item.key}`)) match.buy(item.id);
    }
    refreshBuyStates();
    return;
  }
  if (phase !== 'live') return;
  if (pressed.has('Digit1')) { pendingGrenade = null; arsenal.switchTo(arsenal.loadout.primary ?? 'knife'); }
  if (pressed.has('Digit2')) { pendingGrenade = null; arsenal.switchTo('p9'); }
  if (pressed.has('Digit3')) { pendingGrenade = null; arsenal.switchTo('knife'); }
  if (pressed.has('Digit4') && arsenal.loadout.grenades.he > 0) pendingGrenade = 'he';
  if (pressed.has('Digit5') && arsenal.loadout.grenades.flash > 0) pendingGrenade = 'flash';
  if (pressed.has('Digit6') && arsenal.loadout.grenades.smoke > 0) pendingGrenade = 'smoke';
  if (pressed.has('KeyR') && arsenal.reload()) audio.reloadStart();
}

function refreshBuyStates() {
  for (const item of BUY_ITEMS) {
    let owned = false;
    let count = 0;
    if (item.id === 'armor') owned = player.state.armor >= 100;
    else if (GRENADES[item.id]) { count = arsenal.loadout.grenades[item.id]; owned = count >= 2; }
    else owned = arsenal.loadout.primary === item.id || arsenal.loadout.sidearm === item.id;
    hud.setBuyItemState(item.id, {
      affordable: match.state.money >= item.price && !owned,
      owned,
      count,
    });
  }
}

function stepSim(dt, now) {
  const phase = match.state.phase;
  const pressed = input.drainPressed();
  if (input.state.locked || shot) handlePressed(pressed);

  if (phase === 'live') {
    const look = input.takeLook();
    const sens = arsenal.scoped ? 0.0021 / arsenal.def.zoom : 0.0021;
    player.look(look.x, look.y, sens);
    const wheel = input.takeWheel();
    if (wheel !== 0 && player.state.alive) {
      pendingGrenade = null;
      arsenal.cycle(wheel);
    }
    arsenal.setScoped(input.state.secondary && player.state.alive);
    if (player.state.alive) {
      player.step(dt, input.state.keys, arsenal.def.moveScale);
      if (player.state.stepped) audio.step();
      if (input.state.firing) tryFire();
    }
    const defusing = match.state.bomb === 'planted'
      && player.state.alive
      && match.state.bombPos
      && Math.hypot(player.state.position.x - match.state.bombPos.x, player.state.position.z - match.state.bombPos.z) < 2.3
      && input.state.keys.has('KeyE');
    hud.showDefusePrompt(match.state.bomb === 'planted' && player.state.alive && match.state.bombPos
      && Math.hypot(player.state.position.x - match.state.bombPos.x, player.state.position.z - match.state.bombPos.z) < 2.3);
    bots.step(dt, {
      time: now,
      playerPos: player.state.position,
      playerAlive: player.state.alive,
      playerSpeed: player.groundSpeed(),
      playerCrouching: player.state.crouching,
    });
    match.step(dt, { defusing });
  } else if (phase === 'buy') {
    const look = input.takeLook();
    player.look(look.x, look.y);
    match.step(dt, {});
  } else {
    match.step(dt, {});
  }

  arsenal.step(dt, player.groundSpeed() > 0.5);
  if (arsenal.justReloaded) {
    arsenal.justReloaded = false;
    audio.reloadEnd();
  }
  grenades.step(dt);
  particles.step(dt);
  tracers.step(dt);
  hud.step(dt);
  hud.setHealth(player.state.health, player.state.armor);
  const def = arsenal.def;
  const magState = arsenal.mags[arsenal.current];
  const weaponLabel = pendingGrenade
    ? `${pendingGrenade === 'he' ? GRENADES.he.name : pendingGrenade === 'flash' ? GRENADES.flash.name : GRENADES.smoke.name} ×${arsenal.loadout.grenades[pendingGrenade]}`
    : def.name;
  hud.setAmmo(magState.mag, magState.reserve, weaponLabel);
  hud.setCrosshairGap(6 + arsenal.spread(player.groundSpeed(), player.state.crouching) * 620);
  hud.setScoped(arsenal.scoped);
  shake = Math.max(0, shake - dt * 2.2);
  if (explosionLightLeft > 0) {
    explosionLightLeft -= dt;
    if (explosionLightLeft <= 0) explosionLight.intensity = 0;
  }
  if (bombMesh.visible) {
    bombLamp.material.emissiveIntensity = (Math.sin(now * 6) > 0 ? 3.2 : 0.4);
  }
  world.update(now);
}

let simTime = performance.now() / 1000;
let accumulator = 0;
let lastTime = performance.now();
let frozen = false;

function frame(nowMs) {
  requestAnimationFrame(frame);
  const dt = Math.min((nowMs - lastTime) / 1000, 0.1);
  lastTime = nowMs;
  if (!frozen) {
    if (!started && !shot) {
      // Menu backdrop: a slow orbit over the compound.
      const t = nowMs / 1000;
      camera.position.set(Math.cos(t * 0.05) * 25, 11, Math.sin(t * 0.05) * 25);
      camera.lookAt(0, 0.8, -3);
      world.update(t);
    } else if (input.state.locked || shot) {
      accumulator += dt;
      let steps = 0;
      while (accumulator >= FIXED_STEP && steps < 5) {
        simTime += FIXED_STEP;
        stepSim(FIXED_STEP, simTime);
        accumulator -= FIXED_STEP;
        steps += 1;
      }
      if (accumulator > FIXED_STEP * 5) accumulator = 0;
      syncCamera(dt);
    } else {
      // Pointer unlocked mid-match: the simulation waits (the pause overlay is up).
      world.update(nowMs / 1000);
    }
  }
  renderer.render(scene, camera);
}

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

// Screenshot setups: deterministic scenes for the maker's captures.
function aimAt(point) {
  const body = player.state;
  const dx = point.x - body.position.x;
  const dy = point.y - (body.position.y + body.eye);
  const dz = point.z - body.position.z;
  const length = Math.hypot(dx, dy, dz) || 1;
  body.yaw = Math.atan2(-dx, -dz);
  body.pitch = Math.asin(Math.max(-1, Math.min(1, dy / length)));
}

function paintTwiceThenReady() {
  let painted = 0;
  function paint() {
    requestAnimationFrame(paint);
    syncCamera(0.016);
    renderer.render(scene, camera);
    painted += 1;
    if (painted === 2) {
      window.__shotReady = true;
      frozen = true;
    }
  }
  requestAnimationFrame(paint);
}

function runShot(name) {
  started = true;
  hud.hideOverlay();
  match.startMatch();
  refreshBuyStates();
  if (name === 'start') {
    // Buy phase at the home spawn, menu open, the yard and market ahead.
    player.state.yaw = 0.12;
    player.state.pitch = -0.02;
  } else if (name === 'play') {
    match.state.phase = 'live';
    hud.showBuyMenu(false);
    hud.clearBanner();
    match.state.timer = 63;
    // Stage a mid-round fight around the market's south edge.
    const fighters = bots.bots;
    const e1 = fighters.find((b) => b.team === 'sungai');
    const e2 = fighters.filter((b) => b.team === 'sungai')[2];
    const mate = fighters.find((b) => b.team === 'penjaga');
    if (e1) { e1.group.position.set(2.8, 0, -5.2); e1.yaw = Math.PI; e1.group.rotation.y = Math.PI; e1.health = 200; }
    if (e2) { e2.group.position.set(-4.4, 0, 0.8); e2.yaw = Math.PI * 0.85; e2.group.rotation.y = e2.yaw; }
    if (mate) { mate.group.position.set(-3.4, 0, 5.2); mate.yaw = 0.2; mate.group.rotation.y = 0.2; }
    const dead = fighters.filter((b) => b.team === 'sungai')[3];
    if (dead) {
      dead.alive = false;
      dead.group.position.set(5.4, -0.12, 6.4);
      dead.group.rotation.x = -1.44;
      hud.killfeed('<b class="p">Kamu</b> ▸ <b class="s">Pandu</b>');
    }
    player.state.position.set(0.2, 0, 7.5);
    player.state.health = 72;
    player.state.armor = 40;
    arsenal.give('runda47');
    // Burn off the draw time on the arsenal alone, so the staged bots stay posed.
    for (let i = 0; i < 30; i += 1) arsenal.step(FIXED_STEP, false);
    aimAt(new THREE.Vector3(2.8, 1.25, -5.2));
    scene.updateMatrixWorld(true);
    for (let i = 0; i < 3; i += 1) {
      syncCamera(0.016);
      scene.updateMatrixWorld(true);
      tryFire();
      for (let j = 0; j < 7; j += 1) arsenal.step(FIXED_STEP, false);
    }
    hud.setHealth(72, 40);
    hud.setAmmo(27, 120, WEAPONS.runda47.name);
    hud.killfeed('<b class="p">Bima</b> ▸ <b class="s">Bara</b>');
    match.syncHud();
  } else {
    // Match end: the home squad held the compound, 7 to 5.
    match.state.phase = 'matchover';
    match.state.score = { penjaga: 7, sungai: 5 };
    match.state.round = 12;
    hud.showBuyMenu(false);
    hud.clearBanner();
    hud.setBombState(null);
    hud.showOverlay('matchend', { won: true, p: 7, s: 5, reason: 'Seluruh Geng Sungai tumbang.' });
    match.syncHud();
    player.state.position.set(0, 0, 9);
    player.state.yaw = 0;
    player.state.pitch = -0.03;
    const mate = bots.bots.find((b) => b.team === 'penjaga');
    if (mate) { mate.group.position.set(-2.8, 0, 3.4); mate.group.rotation.y = 0.4; }
    const mate2 = bots.bots.filter((b) => b.team === 'penjaga')[1];
    if (mate2) { mate2.group.position.set(3.1, 0, 4.4); mate2.group.rotation.y = -0.5; }
  }
  syncCamera(0.016);
  paintTwiceThenReady();
}

if (shot) runShot(shot);
else requestAnimationFrame(frame);
