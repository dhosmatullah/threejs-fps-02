// The map: Kampung Runda, a riverside night-market compound at dusk, built from boxes,
// cylinders and canvas-generated textures (no model or image files). Two walled halls
// hold the bomb sites — Gudang in the west, Balai in the east — with a market square
// and a fountain plaza between them, three lanes north, and both spawns at the ends.
// Every solid is a collider for movement and a surface a bullet stops on. The file also
// lays the waypoint graph the bots walk: nodes in open ground, edges along clear lanes.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

function canvasTexture(size, draw, repeatX = 1, repeatY = 1) {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  draw(canvas.getContext('2d'), size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.RepeatWrapping;
  texture.repeat.set(repeatX, repeatY);
  texture.anisotropy = 4;
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

function speckle(ctx, size, base, flecks, count, rng) {
  ctx.fillStyle = base;
  ctx.fillRect(0, 0, size, size);
  for (let i = 0; i < count; i += 1) {
    ctx.fillStyle = flecks[Math.floor(rng() * flecks.length)];
    ctx.globalAlpha = 0.12 + rng() * 0.2;
    const w = 2 + rng() * 9;
    ctx.fillRect(rng() * size, rng() * size, w, w * (0.4 + rng()));
  }
  ctx.globalAlpha = 1;
}

export function createWorld(scene, rng) {
  const group = new THREE.Group();
  scene.add(group);

  const groundTexture = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, PALETTE.ground, ['#2e333d', '#454c59', '#59616f'], 900, rng);
    ctx.strokeStyle = 'rgba(10,10,14,0.35)';
    ctx.lineWidth = 3;
    for (let i = 0; i <= 4; i += 1) {
      ctx.beginPath(); ctx.moveTo((s / 4) * i, 0); ctx.lineTo((s / 4) * i, s); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(0, (s / 4) * i); ctx.lineTo(s, (s / 4) * i); ctx.stroke();
    }
  }, 7, 6);
  const plasterTexture = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, PALETTE.plaster, ['#86694a', '#ae9068', '#77572f'], 700, rng);
    ctx.fillStyle = 'rgba(60,40,20,0.18)';
    for (let i = 0; i < 7; i += 1) ctx.fillRect(rng() * s, 0, 3 + rng() * 6, s);
  }, 2, 1);
  const woodTexture = canvasTexture(256, (ctx, s) => {
    speckle(ctx, s, PALETTE.wood, ['#5d3f24', '#7f5a36'], 260, rng);
    ctx.fillStyle = 'rgba(30,18,8,0.5)';
    for (let i = 0; i < 5; i += 1) ctx.fillRect(0, (s / 5) * i, s, 3);
  }, 1, 1);

  const std = (opts) => new THREE.MeshStandardMaterial({ roughness: 0.92, metalness: 0.03, ...opts });
  const materials = {
    ground: std({ map: groundTexture, roughness: 0.97 }),
    plaster: std({ map: plasterTexture }),
    teal: std({ color: new THREE.Color(PALETTE.teal) }),
    wood: std({ map: woodTexture }),
    roof: std({ color: new THREE.Color(PALETTE.roof), roughness: 0.8 }),
    leaf: std({ color: new THREE.Color(PALETTE.leaf), roughness: 1 }),
    dark: std({ color: new THREE.Color('#05070b'), roughness: 1 }),
    water: std({ color: new THREE.Color(PALETTE.teal), roughness: 0.18, metalness: 0.25, emissive: new THREE.Color('#123f3a'), emissiveIntensity: 0.7 }),
    lantern: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.accent), emissive: new THREE.Color(PALETTE.accent), emissiveIntensity: 2.4 }),
    pole: std({ color: new THREE.Color('#22242c'), roughness: 0.6, metalness: 0.5 }),
  };

  const colliders = [];
  const shootables = [];

  function box(w, h, d, x, y, z, material, { collide = true, shoot = true } = {}) {
    const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    if (collide) colliders.push(new THREE.Box3().setFromObject(mesh));
    if (shoot) shootables.push(mesh);
    return mesh;
  }
  function cylinder(rt, rb, h, x, y, z, material, segments = 14) {
    const mesh = new THREE.Mesh(new THREE.CylinderGeometry(rt, rb, h, segments), materials[material]);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    colliders.push(new THREE.Box3().setFromObject(mesh));
    shootables.push(mesh);
    return mesh;
  }

  // Ground and the compound walls.
  box(46, 0.4, 38, 0, -0.2, 0, 'ground');
  box(46.6, 4.4, 0.6, 0, 2.2, -18.3, 'plaster');
  box(46.6, 4.4, 0.6, 0, 2.2, 18.3, 'plaster');
  box(0.6, 4.4, 37.2, -22.3, 2.2, 0, 'plaster');
  box(0.6, 4.4, 37.2, 22.3, 2.2, 0, 'plaster');
  // A red tile coping along the top of the compound walls, so the rim reads at dusk.
  box(46.6, 0.28, 0.9, 0, 4.5, -18.3, 'roof');
  box(46.6, 0.28, 0.9, 0, 4.5, 18.3, 'roof');
  box(0.9, 0.28, 37.2, -22.3, 4.5, 0, 'roof');
  box(0.9, 0.28, 37.2, 22.3, 4.5, 0, 'roof');

  // The two halls. Walls 3.4 high with a flat tile roof; each has a south door and a
  // plaza-side door, and holds one bomb site.
  function hall(sign) {
    const cx = 14 * sign;
    box(12.4, 3.4, 0.35, cx, 1.7, -16, 'plaster');
    box(5.0, 3.4, 0.35, cx - 3.5 * sign, 1.7, -6, 'plaster');
    box(5.6, 3.4, 0.35, cx + 3.2 * sign, 1.7, -6, 'teal');
    box(0.35, 3.4, 10.4, cx + 6 * sign, 1.7, -11, 'plaster');
    box(0.35, 3.4, 4.6, cx - 6 * sign, 1.7, -13.7, 'teal');
    box(0.35, 3.4, 4.0, cx - 6 * sign, 1.7, -8, 'plaster');
    box(12.7, 0.3, 10.7, cx, 3.55, -11, 'roof');
    // Interior cover: a low counter across the east side and crates in the corners,
    // leaving the west walk from the south door to the site pad clear.
    box(2.2, 1.05, 0.55, cx + 2.2 * sign, 0.525, -9.2, 'wood');
    box(1.15, 1.15, 1.15, cx - 3.2 * sign, 0.575, -7.6, 'wood');
    box(1.15, 1.15, 1.15, cx + 4.4 * sign, 0.575, -14.4, 'wood');
    box(1.15, 1.15, 1.15, cx + 4.4 * sign, 1.725, -14.4, 'wood');
  }
  hall(-1);
  hall(1);

  // Bomb site pads: a painted ring and letter on the floor of each hall.
  const sites = {
    A: { x: -14, z: -11.5, r: 3.6 },
    B: { x: 14, z: -11.5, r: 3.6 },
  };
  for (const [letter, site] of Object.entries(sites)) {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(site.r - 0.35, site.r, 40),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(PALETTE.accent), transparent: true, opacity: 0.85, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.position.set(site.x, 0.02, site.z);
    group.add(ring);
    const letterTexture = canvasTexture(128, (ctx, s) => {
      ctx.clearRect(0, 0, s, s);
      ctx.fillStyle = PALETTE.accent;
      ctx.font = `900 ${s * 0.72}px system-ui, sans-serif`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(letter, s / 2, s / 2 + s * 0.04);
    });
    letterTexture.wrapS = THREE.ClampToEdgeWrapping;
    letterTexture.wrapT = THREE.ClampToEdgeWrapping;
    const plate = new THREE.Mesh(
      new THREE.PlaneGeometry(2.2, 2.2),
      new THREE.MeshBasicMaterial({ map: letterTexture, transparent: true, opacity: 0.9 }),
    );
    plate.rotation.x = -Math.PI / 2;
    plate.position.set(site.x, 0.021, site.z);
    group.add(plate);
  }

  // The market: two rows of stalls with an aisle between them.
  function stall(x, z) {
    box(2.6, 1.05, 1.3, x, 0.525, z, 'wood');
    box(3.0, 0.1, 2.2, x, 2.3, z, 'roof');
    for (const dx of [-1.35, 1.35]) for (const dz of [-0.95, 0.95]) box(0.12, 2.3, 0.12, x + dx, 1.15, z + dz, 'pole', { shoot: false });
    box(1.1, 0.5, 0.8, x - 0.5, 1.3, z, 'leaf', { shoot: false });
  }
  for (const x of [-7.5, -3.8, 3.8, 7.5]) stall(x, -1);
  for (const x of [-5.6, 0, 5.6]) stall(x, 3.6);

  // The fountain in the plaza between the market and the halls.
  cylinder(1.7, 1.85, 0.85, 0, 0.425, -4.2, 'teal');
  const water = new THREE.Mesh(new THREE.CylinderGeometry(1.45, 1.45, 0.08, 20), materials.water);
  water.position.set(0, 0.82, -4.2);
  water.receiveShadow = true;
  group.add(water);
  shootables.push(water);
  cylinder(0.22, 0.3, 1.5, 0, 0.75, -4.2, 'teal', 10);

  // Cover and clutter in the open lanes.
  box(1.9, 1.05, 0.6, -1.45, 0.525, -12.2, 'teal'); // low wall, north plaza, in two
  box(1.9, 1.05, 0.6, 1.45, 0.525, -12.2, 'teal'); // halves with a walk gap at centre
  box(1.15, 1.15, 1.15, -6, 0.575, -15, 'wood');
  box(1.15, 1.15, 1.15, 6, 0.575, -15, 'wood');
  box(1.15, 1.15, 1.15, -5.5, 0.575, -8.6, 'wood');
  box(1.15, 1.15, 1.15, 5.5, 0.575, -8.6, 'wood');
  box(2.2, 1.05, 0.6, -16, 0.525, -3.2, 'plaster'); // west corridor cover
  box(2.2, 1.05, 0.6, 16, 0.525, -3.2, 'plaster'); // east corridor cover
  box(1.15, 1.15, 1.15, 2.8, 0.575, 8.6, 'wood'); // south yard
  box(1.15, 1.15, 1.15, 2.8, 1.725, 8.6, 'wood');
  box(1.15, 1.15, 1.15, -3.4, 0.575, 9.4, 'wood');
  box(2.6, 0.62, 0.9, -9.5, 0.31, 13.5, 'teal'); // planters
  box(2.4, 0.5, 0.7, -9.5, 0.85, 13.5, 'leaf', { shoot: false });
  box(2.6, 0.62, 0.9, 9.5, 0.31, 13.5, 'teal');
  box(2.4, 0.5, 0.7, 9.5, 0.85, 13.5, 'leaf', { shoot: false });
  // A food cart in the south yard.
  box(2.2, 0.95, 1.2, -6, 0.85, 12.3, 'wood');
  box(2.5, 0.08, 1.5, -6, 1.75, 12.3, 'roof');
  const wheelGeo = new THREE.CylinderGeometry(0.42, 0.42, 0.1, 14);
  for (const dz of [-0.55, 0.55]) {
    const wheel = new THREE.Mesh(wheelGeo, materials.pole);
    wheel.rotation.x = Math.PI / 2;
    wheel.position.set(-6, 0.42, 12.3 + dz);
    wheel.castShadow = true;
    group.add(wheel);
  }

  // Lanterns: a pole, a glowing box, and (at six of them) a real point light.
  const lanternLights = [];
  function lantern(x, z, withLight, hangY = 0) {
    if (hangY > 0) {
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), materials.lantern);
      lamp.position.set(x, hangY, z);
      group.add(lamp);
    } else {
      cylinder(0.06, 0.08, 3.1, x, 1.55, z, 'pole', 8);
      const lamp = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.36, 0.3), materials.lantern);
      lamp.position.set(x, 3.2, z);
      group.add(lamp);
    }
    if (withLight) {
      const light = new THREE.PointLight(new THREE.Color(PALETTE.accent), 26, 17, 1.9);
      light.position.set(x, hangY > 0 ? hangY : 3.1, z);
      group.add(light);
      lanternLights.push({ light, base: 26, phase: rng() * 9 });
    }
  }
  lantern(0, -4.2, true);
  lantern(-9.2, 1.2, false);
  lantern(9.2, 1.2, true);
  lantern(-14, -11.5, true, 3.0);
  lantern(14, -11.5, true, 3.0);
  lantern(0, 14.5, true);
  lantern(0, -15.5, true);
  lantern(-19, 6, false);
  lantern(19, 6, false);

  // Moonlight and sky.
  const sky = new THREE.HemisphereLight(new THREE.Color('#3d4a6b'), new THREE.Color('#20180f'), 1.12);
  scene.add(sky);
  const moon = new THREE.DirectionalLight(new THREE.Color('#b9cdec'), 1.7);
  moon.position.set(15, 24, 11);
  moon.castShadow = true;
  moon.shadow.mapSize.set(2048, 2048);
  moon.shadow.camera.left = -27;
  moon.shadow.camera.right = 27;
  moon.shadow.camera.top = 27;
  moon.shadow.camera.bottom = -27;
  moon.shadow.camera.far = 60;
  moon.shadow.bias = -0.0006;
  scene.add(moon, moon.target);

  // The town beyond the walls: dark silhouettes and a field of stars.
  for (let i = 0; i < 16; i += 1) {
    const angle = (i / 16) * Math.PI * 2 + rng() * 0.2;
    const dist = 34 + rng() * 14;
    const h = 5 + rng() * 9;
    const silhouette = new THREE.Mesh(new THREE.BoxGeometry(6 + rng() * 7, h, 6 + rng() * 5), materials.dark);
    silhouette.position.set(Math.cos(angle) * dist, h / 2 - 0.5, Math.sin(angle) * dist);
    group.add(silhouette);
  }
  const starGeo = new THREE.BufferGeometry();
  const starPos = new Float32Array(320 * 3);
  for (let i = 0; i < 320; i += 1) {
    const angle = rng() * Math.PI * 2;
    const tilt = 0.25 + rng() * 1.2;
    starPos[i * 3] = Math.cos(angle) * Math.cos(tilt) * 110;
    starPos[i * 3 + 1] = Math.sin(tilt) * 110;
    starPos[i * 3 + 2] = Math.sin(angle) * Math.cos(tilt) * 110;
  }
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xcdd8ee, size: 0.55, sizeAttenuation: true, fog: false }));
  group.add(stars);

  // The waypoint graph the bots walk. Nodes sit in open ground; edges join neighbours
  // with a clear walk between them. Indices are stable: the bots' routes name them.
  const nodes = [
    [0, 15], [-8, 11], [8, 11], [-5.5, 6.8], [5.5, 6.8], [0, 1.2], // 0-5: south yard, market entries, aisle
    [-9.5, 1.2], [9.5, 1.2], [-3.6, -4.2], [3.6, -4.2], // 6-9: market sides, plaza
    [-13.5, -3.6], [13.5, -3.6], // 10-11: corridors
    [-13.7, -4.6], [13.7, -4.6], // 12-13: outside the halls' south doors
    [-13.7, -7.6], [13.7, -7.6], // 14-15: inside the south doors
    [-14, -11.5], [14, -11.5], // 16-17: the sites
    [-9.6, -10.7], [9.6, -10.7], // 18-19: inside the plaza-side doors
    [-6.4, -10.7], [6.4, -10.7], // 20-21: outside the plaza-side doors
    [0, -10.5], [0, -14.6], [-4.5, -13.2], [4.5, -13.2], // 22-25: north plaza and the river gang's spawn
  ];
  const edgePairs = [
    [0, 1], [0, 2], [1, 3], [2, 4], [3, 5], [4, 5], [3, 6], [4, 7], [5, 6], [5, 7],
    [6, 8], [7, 9], [8, 9], [6, 10], [7, 11], [10, 12], [11, 13], [12, 14], [13, 15],
    [14, 16], [15, 17], [16, 18], [17, 19], [18, 20], [19, 21], [20, 22], [21, 22],
    [22, 23], [23, 24], [23, 25], [24, 20], [25, 21], [8, 22], [9, 22], [10, 8], [11, 9],
  ];
  const adjacency = nodes.map(() => []);
  for (const [a, b] of edgePairs) {
    adjacency[a].push(b);
    adjacency[b].push(a);
  }

  return {
    colliders,
    shootables,
    group,
    sites,
    graph: { nodes, adjacency },
    spawns: {
      penjaga: [[-2.6, 15.6], [2.6, 15.6], [-1.2, 16.9], [1.2, 16.9]],
      sungai: [[-3, -14.8], [0, -15.4], [3, -14.8], [-1.6, -13.6], [1.6, -13.6]],
    },
    holdPoints: {
      A: [[-16.8, -13.6], [-11.2, -8.6], [-13.7, -7.6]],
      B: [[16.8, -13.6], [11.2, -8.6], [13.7, -7.6]],
      mid: [[3.6, -4.2], [-3.6, -4.2], [0, -10.5]],
    },
    nearestNode(x, z) {
      let best = 0;
      let bestDist = Infinity;
      for (let i = 0; i < nodes.length; i += 1) {
        const d = (nodes[i][0] - x) ** 2 + (nodes[i][1] - z) ** 2;
        if (d < bestDist) { bestDist = d; best = i; }
      }
      return best;
    },
    update(t) {
      for (const entry of lanternLights) {
        entry.light.intensity = entry.base + Math.sin(t * 7 + entry.phase) * 1.6 + Math.sin(t * 13.7 + entry.phase * 2) * 1.1;
      }
      water.position.y = 0.82 + Math.sin(t * 1.4) * 0.012;
    },
  };
}
