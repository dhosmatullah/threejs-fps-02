// The armoury: five firearms, a knife, and the loadout that carries them. Each weapon
// is a row of numbers (damage, cadence, magazine, spread standing and moving, falloff)
// plus a low-poly view model built from boxes. The arsenal owns firing state — cooldown,
// reload, bloom, draw time, scope — while main.js owns the ray and the damage, so the
// numbers live in exactly one place. Accuracy is the theme: the first shot of a stopped
// player is nearly true, and spread grows with movement, with bloom, and with the trigger
// held down, so stopping to aim pays.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

export const WEAPONS = {
  p9: {
    name: 'P9 Samping', kind: 'pistol', slot: 'sidearm', price: 0, auto: false,
    damage: 26, headMult: 3.6, rpm: 360, mag: 12, reserve: 96, reload: 1.35,
    spreadStill: 0.0035, spreadMove: 0.026, kick: 0.011, pellets: 1, zoom: 0,
    range: 20, moveScale: 1.0, sound: 'pistol',
  },
  ronda9: {
    name: 'Ronda-9', kind: 'smg', slot: 'primary', price: 1400, auto: true,
    damage: 19, headMult: 3.2, rpm: 800, mag: 32, reserve: 128, reload: 1.95,
    spreadStill: 0.007, spreadMove: 0.042, kick: 0.007, pellets: 1, zoom: 0,
    range: 14, moveScale: 1.0, sound: 'smg',
  },
  sebar12: {
    name: 'Sebar-12', kind: 'shotgun', slot: 'primary', price: 1800, auto: false,
    damage: 9, headMult: 2.2, rpm: 68, mag: 6, reserve: 30, reload: 2.6,
    spreadStill: 0.045, spreadMove: 0.06, kick: 0.035, pellets: 8, zoom: 0,
    range: 7, moveScale: 0.97, sound: 'shotgun',
  },
  runda47: {
    name: 'Runda-47', kind: 'rifle', slot: 'primary', price: 2700, auto: true,
    damage: 33, headMult: 4.0, rpm: 600, mag: 30, reserve: 120, reload: 2.3,
    spreadStill: 0.0022, spreadMove: 0.034, kick: 0.013, pellets: 1, zoom: 0,
    range: 26, moveScale: 0.95, sound: 'rifle',
  },
  jauh1: {
    name: 'Jauh-1', kind: 'sniper', slot: 'primary', price: 4500, auto: false,
    damage: 96, headMult: 2.0, rpm: 42, mag: 5, reserve: 25, reload: 2.8,
    spreadStill: 0.0006, spreadMove: 0.05, kick: 0.05, pellets: 1, zoom: 3.2,
    range: 60, moveScale: 0.88, sound: 'sniper',
  },
  knife: {
    name: 'Pisau Runda', kind: 'knife', slot: 'knife', price: 0, auto: false,
    damage: 55, headMult: 1, rpm: 100, mag: Infinity, reserve: Infinity, reload: 0,
    spreadStill: 0, spreadMove: 0, kick: 0, pellets: 1, zoom: 0,
    range: 1.7, moveScale: 1.03, sound: 'knife',
  },
};

export const GRENADES = {
  he: { name: 'Granat HE', price: 300 },
  flash: { name: 'Granat Kilat', price: 200 },
  smoke: { name: 'Granat Asap', price: 300 },
};

const darkMetal = new THREE.MeshStandardMaterial({ color: new THREE.Color('#26262c'), roughness: 0.45, metalness: 0.6 });
const gripMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.wood), roughness: 0.8, metalness: 0.05 });
const accentMat = new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.teal), roughness: 0.5, metalness: 0.3 });

function part(w, h, d, x, y, z, material = darkMetal) {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), material);
  mesh.position.set(x, y, z);
  return mesh;
}

function buildViewModel(kind) {
  const model = new THREE.Group();
  if (kind === 'knife') {
    const blade = part(0.016, 0.05, 0.3, 0, 0.01, -0.2, accentMat);
    const handle = part(0.03, 0.045, 0.13, 0, 0, 0.02, gripMat);
    model.add(blade, handle);
  } else if (kind === 'pistol') {
    model.add(part(0.055, 0.09, 0.2, 0, 0, -0.05));
    model.add(part(0.05, 0.12, 0.06, 0, -0.09, 0.03, gripMat));
    model.add(part(0.02, 0.03, 0.02, 0, 0.06, -0.13));
  } else if (kind === 'sniper') {
    model.add(part(0.07, 0.09, 0.62, 0, 0, -0.1));
    model.add(part(0.03, 0.03, 0.5, 0, 0.02, -0.6));
    model.add(part(0.05, 0.07, 0.09, 0, 0.09, -0.12, accentMat)); // scope
    model.add(part(0.06, 0.16, 0.07, 0, -0.1, -0.05, gripMat));
    model.add(part(0.06, 0.07, 0.24, 0, -0.02, 0.3, gripMat));
  } else if (kind === 'shotgun') {
    model.add(part(0.075, 0.09, 0.5, 0, 0, -0.12));
    model.add(part(0.055, 0.055, 0.34, 0, -0.01, -0.5));
    model.add(part(0.07, 0.08, 0.16, 0, -0.05, -0.3, gripMat)); // pump
    model.add(part(0.065, 0.08, 0.22, 0, -0.02, 0.28, gripMat));
  } else if (kind === 'smg') {
    model.add(part(0.07, 0.1, 0.4, 0, 0, -0.08));
    model.add(part(0.04, 0.04, 0.22, 0, 0.01, -0.38));
    model.add(part(0.045, 0.17, 0.06, 0, -0.13, -0.02, accentMat)); // long magazine
    model.add(part(0.06, 0.07, 0.16, 0, -0.01, 0.24, gripMat));
  } else {
    // rifle
    model.add(part(0.08, 0.1, 0.46, 0, 0, -0.1));
    model.add(part(0.04, 0.04, 0.4, 0, 0.025, -0.48));
    model.add(part(0.045, 0.15, 0.06, 0, -0.12, -0.06, gripMat)); // curved magazine
    model.add(part(0.05, 0.11, 0.05, 0, -0.08, 0.08, gripMat));
    model.add(part(0.07, 0.08, 0.24, 0, -0.015, 0.3, gripMat));
    model.add(part(0.02, 0.05, 0.02, 0, 0.075, -0.62));
  }
  model.position.set(0.25, -0.22, -0.45);
  return model;
}

export function createArsenal(camera) {
  const loadout = {
    primary: null,
    sidearm: 'p9',
    knife: 'knife',
    grenades: { he: 0, flash: 0, smoke: 0 },
    armor: false,
  };
  const mags = {}; // per-weapon magazine and reserve, kept while owned
  for (const id of Object.keys(WEAPONS)) {
    mags[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
  }
  let current = 'p9';
  let cooldown = 0;
  let reloadLeft = 0;
  let drawLeft = 0;
  let bloom = 0;
  let kick = 0;
  let scoped = false;
  let swing = 0;

  const models = {};
  for (const [id, def] of Object.entries(WEAPONS)) {
    const model = buildViewModel(def.kind);
    model.visible = false;
    camera.add(model);
    models[id] = model;
  }
  models[current].visible = true;

  const flash = new THREE.Mesh(
    new THREE.PlaneGeometry(0.3, 0.3),
    new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.92, depthWrite: false, side: THREE.DoubleSide }),
  );
  flash.visible = false;
  camera.add(flash);
  const flashLight = new THREE.PointLight(new THREE.Color(PALETTE.accent), 0, 6);
  camera.add(flashLight);
  let flashLeft = 0;

  function def() {
    return WEAPONS[current];
  }
  function magState() {
    return mags[current];
  }
  function muzzleLocal() {
    const kind = def().kind;
    if (kind === 'sniper') return [0.25, -0.2, -1.05];
    if (kind === 'rifle') return [0.25, -0.19, -0.95];
    if (kind === 'shotgun') return [0.25, -0.21, -0.9];
    if (kind === 'smg') return [0.25, -0.2, -0.72];
    return [0.25, -0.2, -0.6];
  }

  return {
    loadout,
    mags,
    get current() { return current; },
    get def() { return def(); },
    get scoped() { return scoped; },
    get reloading() { return reloadLeft > 0; },
    get drawing() { return drawLeft > 0; },

    give(id) {
      const d = WEAPONS[id];
      if (!d || d.slot === 'knife') return;
      if (d.slot === 'primary') loadout.primary = id;
      mags[id] = { mag: d.mag, reserve: d.reserve };
      if (d.slot === 'primary' || current === 'p9') current = id;
      drawLeft = 0.4;
      reloadLeft = 0;
      scoped = false;
      for (const [key, model] of Object.entries(models)) model.visible = key === current;
    },
    switchTo(id) {
      if (id === current || !WEAPONS[id]) return false;
      if (WEAPONS[id].slot === 'primary' && loadout.primary !== id) return false;
      if (WEAPONS[id].slot === 'sidearm' && loadout.sidearm !== id) return false;
      current = id;
      drawLeft = 0.32;
      reloadLeft = 0;
      bloom = 0;
      scoped = false;
      for (const [key, model] of Object.entries(models)) model.visible = key === current;
      return true;
    },
    cycle(direction) {
      const owned = [loadout.primary, loadout.sidearm, 'knife'].filter(Boolean);
      const index = owned.indexOf(current);
      const next = owned[(index + direction + owned.length) % owned.length];
      this.switchTo(next);
    },
    ready() {
      return cooldown <= 0 && reloadLeft <= 0 && drawLeft <= 0 && magState().mag > 0;
    },
    canShoot() {
      return cooldown <= 0 && reloadLeft <= 0 && drawLeft <= 0;
    },
    pullTrigger() {
      const d = def();
      cooldown = 60 / d.rpm;
      if (d.kind !== 'knife') {
        magState().mag -= 1;
        flashLeft = 0.05;
        kick = Math.min(0.09, kick + 0.05);
        bloom = Math.min(0.02, bloom + 0.0045);
      } else {
        swing = 1;
      }
    },
    reload() {
      const d = def();
      const state = magState();
      if (reloadLeft > 0 || state.mag >= d.mag || state.reserve <= 0 || d.kind === 'knife') return false;
      reloadLeft = d.reload;
      scoped = false;
      return true;
    },
    setScoped(value) {
      scoped = value && def().zoom > 0 && reloadLeft <= 0 && drawLeft <= 0;
    },
    spread(speed, crouching) {
      const d = def();
      const moveRatio = Math.min(1, speed / 5);
      let value = d.spreadStill + (d.spreadMove - d.spreadStill) * moveRatio * moveRatio + bloom;
      if (crouching) value *= 0.72;
      if (scoped) value = d.spreadStill;
      return value;
    },
    damageAt(distance, part) {
      const d = def();
      const falloff = distance <= d.range ? 1 : Math.max(0.45, 1 - (distance - d.range) / 90);
      const base = d.damage * falloff;
      return part === 'head' ? base * d.headMult : base;
    },
    resetRound(keepGear) {
      if (!keepGear) {
        loadout.primary = null;
        loadout.grenades = { he: 0, flash: 0, smoke: 0 };
        for (const id of Object.keys(WEAPONS)) {
          mags[id] = { mag: WEAPONS[id].mag, reserve: WEAPONS[id].reserve };
        }
        current = 'p9';
      } else {
        for (const id of [loadout.primary, 'p9']) {
          if (!id) continue;
          mags[id].mag = WEAPONS[id].mag;
          mags[id].reserve = Math.max(mags[id].reserve, WEAPONS[id].mag);
        }
        current = loadout.primary ?? 'p9';
      }
      cooldown = 0;
      reloadLeft = 0;
      drawLeft = 0;
      bloom = 0;
      scoped = false;
      for (const [key, model] of Object.entries(models)) model.visible = key === current;
    },
    step(dt, moving) {
      cooldown = Math.max(0, cooldown - dt);
      drawLeft = Math.max(0, drawLeft - dt);
      bloom = Math.max(0, bloom - dt * 0.03);
      kick += (0 - kick) * Math.min(1, dt * 13);
      swing = Math.max(0, swing - dt * 3.2);
      const model = models[current];
      const d = def();
      const bob = moving ? Math.sin(performance.now() * 0.011) * 0.008 : 0;
      const targetX = scoped ? 0 : 0.25;
      model.position.x += (targetX - model.position.x) * Math.min(1, dt * 16);
      model.position.y = -0.22 + bob + (drawLeft > 0 ? -drawLeft * 0.5 : 0);
      model.position.z = -0.45 + kick;
      model.rotation.x = kick * 2.4 + (reloadLeft > 0 ? -0.6 * Math.sin((1 - reloadLeft / d.reload) * Math.PI) : 0) + swing * -0.9;
      model.rotation.z = swing * 0.5;
      if (reloadLeft > 0) {
        reloadLeft = Math.max(0, reloadLeft - dt);
        if (reloadLeft === 0) {
          const state = magState();
          const take = Math.min(d.mag - state.mag, state.reserve);
          state.mag += take;
          state.reserve -= take;
          this.justReloaded = true;
        }
      }
      flashLeft = Math.max(0, flashLeft - dt);
      const [mx, my, mz] = muzzleLocal();
      flash.position.set(mx, my, mz);
      flash.visible = flashLeft > 0;
      if (flash.visible) flash.rotation.z = flashLeft * 40;
      flashLight.position.set(mx, my, mz + 0.2);
      flashLight.intensity = flashLeft > 0 ? 20 : 0;
    },
    muzzleWorld(out) {
      const [mx, my, mz] = muzzleLocal();
      out.set(mx, my, mz);
      return models[current].parent.localToWorld(out);
    },
    justReloaded: false,
  };
}
