// Thrown grenades: a small pool of projectiles with gravity and box bounces, and the
// three effects the tactics turn on. HE wounds in a radius, Kilat (flash) blinds whoever
// faces it — the player through a fading white overlay, bots through a blind timer —
// and Asap (smoke) grows a cloud that blocks sight lines for twelve seconds, which the
// bots' vision checks honestly: a ray through a cloud is a ray that sees nothing.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const GRAVITY = 13;
const RADIUS = 0.09;

export function createGrenades(scene, colliders) {
  const group = new THREE.Group();
  scene.add(group);
  const bodyMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#2c3138'), roughness: 0.5, metalness: 0.4 });
  const bandMaterials = {
    he: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sungai), roughness: 0.5 }),
    flash: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.ink), roughness: 0.4 }),
    smoke: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.muted), roughness: 0.6 }),
  };
  const geometry = new THREE.SphereGeometry(RADIUS, 10, 8);

  const items = [];
  for (let i = 0; i < 10; i += 1) {
    const mesh = new THREE.Mesh(geometry, bodyMaterial);
    const band = new THREE.Mesh(new THREE.TorusGeometry(RADIUS * 0.95, 0.02, 6, 14), bandMaterials.he);
    band.rotation.x = Math.PI / 2;
    mesh.add(band);
    mesh.visible = false;
    group.add(mesh);
    items.push({
      mesh, band, active: false, kind: 'he', fuse: 0,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), resting: 0,
    });
  }

  // Smoke clouds: a handful of soft sprites that grow, hold, and thin out.
  const smokeTexture = (() => {
    const canvas = document.createElement('canvas');
    canvas.width = 128;
    canvas.height = 128;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(64, 64, 6, 64, 64, 62);
    gradient.addColorStop(0, 'rgba(200,204,214,0.55)');
    gradient.addColorStop(0.6, 'rgba(170,175,188,0.32)');
    gradient.addColorStop(1, 'rgba(160,165,178,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 128, 128);
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    return texture;
  })();
  const clouds = [];
  for (let i = 0; i < 6; i += 1) {
    const sprites = [];
    const cloudGroup = new THREE.Group();
    for (let j = 0; j < 7; j += 1) {
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: smokeTexture, transparent: true, opacity: 0, depthWrite: false }));
      sprite.scale.set(2.6, 2.2, 1);
      cloudGroup.add(sprite);
      sprites.push(sprite);
    }
    cloudGroup.visible = false;
    group.add(cloudGroup);
    clouds.push({ group: cloudGroup, sprites, life: 0, center: new THREE.Vector3(), radius: 2.6 });
  }

  const probe = new THREE.Box3();
  const next = new THREE.Vector3();
  const hooks = { onExplode: null, onFlash: null, onSmoke: null };

  function collides(x, y, z) {
    probe.min.set(x - RADIUS, y - RADIUS, z - RADIUS);
    probe.max.set(x + RADIUS, y + RADIUS, z + RADIUS);
    for (const collider of colliders) if (probe.intersectsBox(collider)) return collider;
    return null;
  }

  function detonate(item) {
    item.active = false;
    item.mesh.visible = false;
    if (item.kind === 'he' && hooks.onExplode) hooks.onExplode(item.position.clone());
    if (item.kind === 'flash' && hooks.onFlash) hooks.onFlash(item.position.clone());
    if (item.kind === 'smoke') {
      const cloud = clouds.find((c) => c.life <= 0) ?? clouds[0];
      cloud.center.copy(item.position);
      cloud.center.y = Math.max(0.9, cloud.center.y);
      cloud.life = 12;
      cloud.group.position.copy(cloud.center);
      cloud.group.visible = true;
      cloud.sprites.forEach((sprite, index) => {
        const angle = (index / cloud.sprites.length) * Math.PI * 2;
        sprite.position.set(Math.cos(angle) * 1.1 * (index % 2), (index % 3) * 0.5 - 0.3, Math.sin(angle) * 1.1 * (index % 2));
      });
      if (hooks.onSmoke) hooks.onSmoke(item.position.clone());
    }
  }

  return {
    hooks,
    clouds,
    throwGrenade(kind, from, direction, strength = 13) {
      const item = items.find((entry) => !entry.active);
      if (!item) return false;
      item.active = true;
      item.kind = kind;
      item.band.material = bandMaterials[kind];
      item.position.copy(from);
      item.velocity.copy(direction).multiplyScalar(strength);
      item.velocity.y += 2.2;
      item.fuse = kind === 'smoke' ? 99 : kind === 'flash' ? 1.35 : 1.6;
      item.resting = 0;
      item.mesh.position.copy(from);
      item.mesh.visible = true;
      return true;
    },
    // Does the segment a->b pass through live smoke? Bots and the flash check use it.
    smokeBlocks(a, b) {
      for (const cloud of clouds) {
        if (cloud.life <= 0) continue;
        // Closest distance from the cloud centre to the segment, in the cheap way:
        // sample the segment's midpoint and quarter points against the radius.
        for (const t of [0.25, 0.5, 0.75]) {
          const x = a.x + (b.x - a.x) * t;
          const y = a.y + (b.y - a.y) * t;
          const z = a.z + (b.z - a.z) * t;
          const dx = x - cloud.center.x;
          const dy = (y - cloud.center.y) * 1.4;
          const dz = z - cloud.center.z;
          if (dx * dx + dy * dy + dz * dz < cloud.radius * cloud.radius) return true;
        }
      }
      return false;
    },
    step(dt) {
      for (const item of items) {
        if (!item.active) continue;
        item.fuse -= dt;
        if (item.fuse <= 0) {
          detonate(item);
          continue;
        }
        if (item.kind === 'smoke' && item.resting > 0.25) {
          detonate(item);
          continue;
        }
        item.velocity.y -= GRAVITY * dt;
        next.copy(item.position).addScaledVector(item.velocity, dt);
        const hitX = collides(next.x, item.position.y, item.position.z);
        if (hitX) {
          item.velocity.x *= -0.42;
          next.x = item.position.x;
        }
        const hitZ = collides(item.position.x, item.position.y, next.z);
        if (hitZ) {
          item.velocity.z *= -0.42;
          next.z = item.position.z;
        }
        const hitY = collides(next.x, next.y, next.z);
        if (hitY) {
          if (item.velocity.y < 0 && next.y < hitY.max.y + RADIUS + 0.05) {
            next.y = hitY.max.y + RADIUS;
            item.velocity.y = Math.abs(item.velocity.y) > 1.4 ? -item.velocity.y * 0.38 : 0;
            item.velocity.x *= 0.7;
            item.velocity.z *= 0.7;
            if (Math.abs(item.velocity.y) < 0.1 && item.velocity.lengthSq() < 0.4) item.resting += dt;
          } else {
            item.velocity.y *= -0.4;
            next.y = item.position.y;
          }
        }
        if (next.y < RADIUS) {
          next.y = RADIUS;
          item.velocity.y = Math.abs(item.velocity.y) > 1.4 ? -item.velocity.y * 0.38 : 0;
          item.velocity.x *= 0.7;
          item.velocity.z *= 0.7;
          if (item.velocity.lengthSq() < 0.4) item.resting += dt;
        }
        item.position.copy(next);
        item.mesh.position.copy(next);
        item.mesh.rotation.x += dt * 4;
      }
      for (const cloud of clouds) {
        if (cloud.life <= 0) {
          cloud.group.visible = false;
          continue;
        }
        cloud.life -= dt;
        const age = 12 - cloud.life;
        const grow = Math.min(1, age / 1.6);
        const fade = Math.min(1, cloud.life / 2.5);
        for (const sprite of cloud.sprites) {
          sprite.material.opacity = 0.85 * grow * fade;
          const s = 2.2 + grow * 1.6;
          sprite.scale.set(s, s * 0.82, 1);
        }
      }
    },
  };
}
