// One pooled particle system for everything that flies and fades: bullet impacts,
// hit puffs, explosion debris, smoke wisps. A fixed pool of points with per-particle
// velocity, gravity and life held in flat arrays — nothing is allocated after boot,
// and the hot loop only writes into typed arrays.
import * as THREE from 'three';

const MAX = 640;

export function createParticles(scene) {
  const positions = new Float32Array(MAX * 3);
  const colors = new Float32Array(MAX * 3);
  const sizes = new Float32Array(MAX);
  const velocity = new Float32Array(MAX * 3);
  const life = new Float32Array(MAX);
  const maxLife = new Float32Array(MAX);
  const gravity = new Float32Array(MAX);
  const baseColor = new Float32Array(MAX * 3);
  let cursor = 0;

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  const material = new THREE.PointsMaterial({
    size: 0.09,
    vertexColors: true,
    transparent: true,
    opacity: 0.95,
    depthWrite: false,
    sizeAttenuation: true,
  });
  const points = new THREE.Points(geometry, material);
  points.frustumCulled = false;
  scene.add(points);
  for (let i = 0; i < MAX; i += 1) positions[i * 3 + 1] = -50;

  const tmpColor = new THREE.Color();

  function spawn(x, y, z, vx, vy, vz, seconds, hex, grav = -6) {
    const i = cursor;
    cursor = (cursor + 1) % MAX;
    positions[i * 3] = x;
    positions[i * 3 + 1] = y;
    positions[i * 3 + 2] = z;
    velocity[i * 3] = vx;
    velocity[i * 3 + 1] = vy;
    velocity[i * 3 + 2] = vz;
    life[i] = seconds;
    maxLife[i] = seconds;
    gravity[i] = grav;
    tmpColor.set(hex);
    baseColor[i * 3] = tmpColor.r;
    baseColor[i * 3 + 1] = tmpColor.g;
    baseColor[i * 3 + 2] = tmpColor.b;
  }

  function burst(point, normal, count, hex, speed = 2.2, rng) {
    for (let n = 0; n < count; n += 1) {
      const spread = 0.9;
      spawn(
        point.x, point.y, point.z,
        normal.x * speed * (0.4 + rng() * 0.8) + (rng() * 2 - 1) * spread,
        Math.abs(normal.y) * speed * rng() + rng() * 1.4,
        normal.z * speed * (0.4 + rng() * 0.8) + (rng() * 2 - 1) * spread,
        0.3 + rng() * 0.4, hex,
      );
    }
  }

  return {
    impact(point, normal, rng) {
      burst(point, normal, 7, '#cbb98f', 2.4, rng);
    },
    hitPuff(point, rng, hex = '#d95f43') {
      burst(point, { x: 0, y: 1, z: 0 }, 9, hex, 1.5, rng);
    },
    explosion(point, rng) {
      burst(point, { x: 0, y: 1, z: 0 }, 42, '#ffb347', 6.5, rng);
      burst(point, { x: 0, y: 1, z: 0 }, 26, '#d95f43', 4.2, rng);
      burst(point, { x: 0, y: 1, z: 0 }, 18, '#5a5148', 2.0, rng);
    },
    spark(point, rng) {
      burst(point, { x: 0, y: 1, z: 0 }, 5, '#ffd98a', 3.2, rng);
    },
    step(dt) {
      for (let i = 0; i < MAX; i += 1) {
        if (life[i] <= 0) continue;
        life[i] -= dt;
        if (life[i] <= 0) {
          positions[i * 3 + 1] = -50;
          continue;
        }
        velocity[i * 3 + 1] += gravity[i] * dt;
        positions[i * 3] += velocity[i * 3] * dt;
        positions[i * 3 + 1] += velocity[i * 3 + 1] * dt;
        positions[i * 3 + 2] += velocity[i * 3 + 2] * dt;
        if (positions[i * 3 + 1] < 0.03) {
          positions[i * 3 + 1] = 0.03;
          velocity[i * 3 + 1] = 0;
        }
        const fade = Math.min(1, life[i] / (maxLife[i] * 0.55));
        colors[i * 3] = baseColor[i * 3] * fade;
        colors[i * 3 + 1] = baseColor[i * 3 + 1] * fade;
        colors[i * 3 + 2] = baseColor[i * 3 + 2] * fade;
      }
      geometry.attributes.position.needsUpdate = true;
      geometry.attributes.color.needsUpdate = true;
    },
  };
}

// A small pool of tracer streaks: thin stretched boxes that flash from a muzzle to
// the point a shot reached, then fade. Reused round-robin, allocated once.
export function createTracers(scene) {
  const COUNT = 24;
  const pool = [];
  const material = new THREE.MeshBasicMaterial({
    color: new THREE.Color('#ffd98a'),
    transparent: true,
    opacity: 0,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });
  const geometry = new THREE.BoxGeometry(0.012, 0.012, 1);
  for (let i = 0; i < COUNT; i += 1) {
    const mesh = new THREE.Mesh(geometry, material.clone());
    mesh.visible = false;
    scene.add(mesh);
    pool.push({ mesh, life: 0 });
  }
  let cursor = 0;
  const mid = new THREE.Vector3();
  const dir = new THREE.Vector3();

  return {
    fire(from, to, hex = '#ffd98a') {
      const slot = pool[cursor];
      cursor = (cursor + 1) % COUNT;
      mid.addVectors(from, to).multiplyScalar(0.5);
      dir.subVectors(to, from);
      const length = dir.length();
      if (length < 0.5) return;
      slot.mesh.position.copy(mid);
      slot.mesh.scale.set(1, 1, length);
      slot.mesh.lookAt(to);
      slot.mesh.material.color.set(hex);
      slot.mesh.material.opacity = 0.75;
      slot.mesh.visible = true;
      slot.life = 0.055;
    },
    step(dt) {
      for (const slot of pool) {
        if (slot.life <= 0) continue;
        slot.life -= dt;
        slot.mesh.material.opacity = Math.max(0, slot.life / 0.055) * 0.75;
        if (slot.life <= 0) slot.mesh.visible = false;
      }
    },
  };
}
