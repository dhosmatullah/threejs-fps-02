// The nine other fighters: three Penjaga teammates and five Sungai attackers, each a
// low-poly body (legs, torso, head, gun) with a name, a weapon profile and a simple
// tactical brain. They walk the world's waypoint graph (breadth-first paths), hold the
// sites they are assigned, advance on the objective they are given, and fight when
// their vision — a field-of-view cone, a range limit, a real line-of-sight ray and the
// smoke check — or their hearing (gunfire within earshot) gives them a target. Fire is
// resolved in bursts with hit chances that fall with distance and target speed, so a
// moving target is genuinely harder to hit, for them exactly as for the player.
import * as THREE from 'three';
import { PALETTE } from './palette.js';

const TEAM_GUNS = {
  rifle: { damage: 13, interval: 0.115, burst: 4, pause: [0.5, 0.95] },
  smg: { damage: 10, interval: 0.075, burst: 6, pause: [0.4, 0.8] },
  pistol: { damage: 12, interval: 0.27, burst: 2, pause: [0.6, 1.0] },
};
const NAMES = {
  penjaga: ['Bima', 'Raka', 'Sari'],
  sungai: ['Jaka', 'Bara', 'Lintang', 'Pandu', 'Reno'],
};
const EYE = 1.52;
const CHEST = 1.18;

export function createBots(scene, world, deps) {
  const { rng } = deps;
  const teamMaterials = {
    penjaga: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.penjaga), roughness: 0.75 }),
    sungai: new THREE.MeshStandardMaterial({ color: new THREE.Color(PALETTE.sungai), roughness: 0.75 }),
  };
  const darkMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#23252c'), roughness: 0.7 });
  const skinMaterial = new THREE.MeshStandardMaterial({ color: new THREE.Color('#c9a189'), roughness: 0.8 });
  const torsoGeometry = new THREE.BoxGeometry(0.52, 0.72, 0.3);
  const headGeometry = new THREE.BoxGeometry(0.3, 0.3, 0.3);
  const legGeometry = new THREE.BoxGeometry(0.17, 0.78, 0.2);
  const gunGeometry = new THREE.BoxGeometry(0.07, 0.09, 0.78);

  const bots = [];
  const hitMeshes = [];

  function makeBody(team) {
    const group = new THREE.Group();
    const legL = new THREE.Mesh(legGeometry, darkMaterial);
    legL.position.set(-0.14, 0.39, 0);
    const legR = new THREE.Mesh(legGeometry, darkMaterial);
    legR.position.set(0.14, 0.39, 0);
    const torso = new THREE.Mesh(torsoGeometry, teamMaterials[team]);
    torso.position.y = 1.14;
    const head = new THREE.Mesh(headGeometry, skinMaterial);
    head.position.y = 1.66;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.34, 0.1, 0.34), teamMaterials[team]);
    cap.position.y = 1.84;
    const gun = new THREE.Mesh(gunGeometry, darkMaterial);
    gun.position.set(0.18, 1.28, -0.3);
    group.add(legL, legR, torso, head, cap, gun);
    group.traverse((mesh) => {
      if (mesh.isMesh) mesh.castShadow = true;
    });
    scene.add(group);
    return { group, legL, legR, torso, head, gun };
  }

  function spawnBot(team, index, at, gunKind) {
    const body = makeBody(team);
    const bot = {
      team,
      name: NAMES[team][index % NAMES[team].length],
      ...body,
      health: 100,
      alive: true,
      yaw: team === 'sungai' ? Math.PI : 0,
      role: 'advance',
      gunKind,
      gun: TEAM_GUNS[gunKind],
      path: [],
      pathIndex: 0,
      goal: null,
      holdAt: null,
      target: null, // 'player' or a bot
      lastSeenAt: -99,
      lastSeenPos: new THREE.Vector3(),
      investigate: null,
      nextThink: rng() * 0.12,
      burstLeft: 0,
      nextShotAt: 0,
      pauseUntil: 0,
      reactionUntil: 0,
      strafeDir: 1,
      strafeSwitchAt: 0,
      flashed: 0,
      phase: rng() * 9,
      fallT: 0,
      speedNow: 0,
      isCarrier: false,
      planting: false,
    };
    bot.group.position.set(at[0], 0, at[1]);
    bot.torso.userData.bot = bot;
    bot.torso.userData.part = 'torso';
    bot.head.userData.bot = bot;
    bot.head.userData.part = 'head';
    hitMeshes.push(bot.torso, bot.head);
    bots.push(bot);
    return bot;
  }

  // Breadth-first path over the waypoint graph, as node indices from a to b.
  function findPath(a, b) {
    if (a === b) return [a];
    const prev = new Map([[a, -1]]);
    const queue = [a];
    while (queue.length) {
      const node = queue.shift();
      for (const next of world.graph.adjacency[node]) {
        if (prev.has(next)) continue;
        prev.set(next, node);
        if (next === b) {
          const path = [b];
          let cursor = b;
          while (prev.get(cursor) !== -1) {
            cursor = prev.get(cursor);
            path.unshift(cursor);
          }
          return path;
        }
        queue.push(next);
      }
    }
    return [a];
  }

  function setGoal(bot, x, z, then = null) {
    const from = world.nearestNode(bot.group.position.x, bot.group.position.z);
    const to = world.nearestNode(x, z);
    bot.path = findPath(from, to);
    bot.pathIndex = 0;
    bot.goal = { x, z, then };
    bot.resume = { x, z, then };
  }

  const scratchFrom = new THREE.Vector3();
  const scratchTo = new THREE.Vector3();

  function canSee(bot, tx, ty, tz, now) {
    const pos = bot.group.position;
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist > 40) return false;
    if (dist > 3.2) {
      const facing = Math.atan2(-Math.sin(bot.yaw), -Math.cos(bot.yaw)); // direction of -z rotated
      const toTarget = Math.atan2(dx, dz);
      let diff = Math.abs(((toTarget - facing + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
      if (diff > 1.05) return false;
    }
    scratchFrom.set(pos.x, EYE, pos.z);
    scratchTo.set(tx, ty, tz);
    if (deps.smokeBlocks(scratchFrom, scratchTo)) return false;
    return !deps.raycastBlocked(scratchFrom, scratchTo);
  }

  function acquireTarget(bot, ctx, now) {
    let best = null;
    let bestDist = Infinity;
    const consider = (kind, ref, x, y, z) => {
      const d = Math.hypot(x - bot.group.position.x, z - bot.group.position.z);
      if (d < bestDist && canSee(bot, x, y, z, now)) {
        best = { kind, ref };
        bestDist = d;
      }
    };
    if (bot.team === 'sungai' && ctx.playerAlive) {
      consider('player', null, ctx.playerPos.x, ctx.playerPos.y + CHEST, ctx.playerPos.z);
    }
    for (const other of bots) {
      if (!other.alive || other.team === bot.team) continue;
      consider('bot', other, other.group.position.x, CHEST, other.group.position.z);
    }
    if (best) {
      if (bot.target !== best.ref || (best.kind === 'player' && bot.target !== 'player')) {
        bot.reactionUntil = now + 0.24 + rng() * 0.22;
      }
      bot.target = best.kind === 'player' ? 'player' : best.ref;
      bot.lastSeenAt = now;
      if (best.kind === 'player') bot.lastSeenPos.copy(ctx.playerPos);
      else bot.lastSeenPos.copy(best.ref.group.position);
    } else if (bot.target && now - bot.lastSeenAt > 2.6) {
      bot.investigate = bot.lastSeenPos.clone();
      bot.target = null;
    }
  }

  function targetPosition(bot, ctx) {
    if (bot.target === 'player') return ctx.playerPos;
    if (bot.target) return bot.target.group.position;
    return null;
  }

  function fireAt(bot, ctx, now) {
    const targetPos = targetPosition(bot, ctx);
    if (!targetPos) return;
    if (bot.burstLeft <= 0) {
      if (now < bot.pauseUntil || now < bot.reactionUntil) return;
      bot.burstLeft = bot.gun.burst;
      bot.nextShotAt = now;
    }
    if (now < bot.nextShotAt) return;
    bot.nextShotAt = now + bot.gun.interval;
    bot.burstLeft -= 1;
    if (bot.burstLeft === 0) {
      bot.pauseUntil = now + bot.gun.pause[0] + rng() * (bot.gun.pause[1] - bot.gun.pause[0]);
    }
    const from = bot.group.position;
    const muzzle = new THREE.Vector3(
      from.x - Math.sin(bot.yaw) * 0.55 + 0.18 * Math.cos(bot.yaw),
      1.3,
      from.z - Math.cos(bot.yaw) * 0.55 - 0.18 * Math.sin(bot.yaw),
    );
    const dist = Math.hypot(targetPos.x - from.x, targetPos.z - from.z);
    const targetSpeed = bot.target === 'player' ? ctx.playerSpeed : (bot.target ? bot.target.speedNow : 0);
    let chance = 0.36 - Math.max(0, dist - 8) * 0.006 - (targetSpeed / 5) * 0.15;
    if (bot.target === 'player' && ctx.playerCrouching) chance -= 0.045;
    chance = Math.max(0.07, Math.min(0.42, chance));
    const hit = rng() < chance;
    const aim = new THREE.Vector3(targetPos.x, (bot.target === 'player' ? targetPos.y : 0) + CHEST, targetPos.z);
    if (!hit) {
      aim.x += (rng() * 2 - 1) * (0.5 + dist * 0.03);
      aim.y += (rng() * 2 - 1) * 0.4;
      aim.z += (rng() * 2 - 1) * (0.5 + dist * 0.03);
    }
    deps.onTracer(muzzle, aim, bot.team === 'sungai' ? '#ff9a7a' : '#9ad4ff');
    deps.onBotShot(bot);
    if (!hit) return;
    const damage = bot.gun.damage * (rng() < 0.13 ? 2.1 : 1);
    if (bot.target === 'player') {
      deps.onPlayerHit(damage, bot);
    } else if (bot.target) {
      damageBot(bot.target, damage, 'torso', bot);
    }
  }

  function damageBot(bot, amount, part, killer) {
    if (!bot.alive) return false;
    bot.health -= amount;
    if (bot.health > 0) {
      // Being shot at is information: turn to the shooter and remember the spot.
      if (killer && killer.group) bot.lastSeenPos.copy(killer.group.position);
      else if (killer && killer.position) bot.lastSeenPos.copy(killer.position);
      bot.lastSeenAt = performance.now() / 1000;
      return false;
    }
    bot.alive = false;
    bot.fallT = 0;
    bot.target = null;
    deps.onKill(bot, killer);
    return true;
  }

  function collide(pos, radius = 0.34) {
    for (const box of world.colliders) {
      if (box.max.y < 0.12 || box.min.y > 1.8) continue;
      const cx = Math.max(box.min.x, Math.min(pos.x, box.max.x));
      const cz = Math.max(box.min.z, Math.min(pos.z, box.max.z));
      const dx = pos.x - cx;
      const dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 >= radius * radius) continue;
      if (d2 > 0.0001) {
        const d = Math.sqrt(d2);
        pos.x = cx + (dx / d) * radius;
        pos.z = cz + (dz / d) * radius;
      } else {
        // Centre inside the box: push out along the shallower axis.
        const pushLeft = pos.x - box.min.x;
        const pushRight = box.max.x - pos.x;
        const pushNear = pos.z - box.min.z;
        const pushFar = box.max.z - pos.z;
        const min = Math.min(pushLeft, pushRight, pushNear, pushFar);
        if (min === pushLeft) pos.x = box.min.x - radius;
        else if (min === pushRight) pos.x = box.max.x + radius;
        else if (min === pushNear) pos.z = box.min.z - radius;
        else pos.z = box.max.z + radius;
      }
    }
  }

  function moveToward(bot, tx, tz, dt, speed) {
    const pos = bot.group.position;
    const dx = tx - pos.x;
    const dz = tz - pos.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.05) {
      bot.speedNow = 0;
      return true;
    }
    const stepLen = Math.min(dist, speed * dt);
    pos.x += (dx / dist) * stepLen;
    pos.z += (dz / dist) * stepLen;
    bot.speedNow = speed;
    const wantYaw = Math.atan2(-dx, -dz);
    let diff = ((wantYaw - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
    bot.yaw += diff * Math.min(1, dt * 8);
    collide(pos);
    return dist < 0.45;
  }

  function followPath(bot, dt, speed) {
    if (!bot.goal) return true;
    if (bot.pathIndex < bot.path.length) {
      const [nx, nz] = world.graph.nodes[bot.path[bot.pathIndex]];
      if (moveToward(bot, nx, nz, dt, speed)) bot.pathIndex += 1;
      return false;
    }
    const arrived = moveToward(bot, bot.goal.x, bot.goal.z, dt, speed);
    if (arrived) {
      const then = bot.goal.then;
      bot.goal = null;
      if (then) then(bot);
    }
    return arrived;
  }

  function stepBot(bot, dt, ctx, now) {
    const pos = bot.group.position;
    if (!bot.alive) {
      bot.fallT = Math.min(1, bot.fallT + dt / 0.38);
      bot.group.rotation.x = -bot.fallT * (Math.PI / 2) * 0.92;
      bot.group.position.y = -bot.fallT * 0.12;
      return;
    }
    bot.flashed = Math.max(0, bot.flashed - dt);
    bot.speedNow = 0;

    if (now >= bot.nextThink) {
      bot.nextThink = now + 0.12;
      if (bot.flashed <= 0 && !bot.planting) acquireTarget(bot, ctx, now);
    }

    const targetPos = targetPosition(bot, ctx);
    if (bot.target && bot.target !== 'player' && !bot.target.alive) bot.target = null;
    const seesTarget = bot.target && now - bot.lastSeenAt < 0.35;

    if (bot.planting) {
      // Standing still over the charge; match.js owns the timer.
    } else if (seesTarget && targetPos) {
      // Fight: face the target, close to mid range or strafe inside it, fire bursts.
      const dx = targetPos.x - pos.x;
      const dz = targetPos.z - pos.z;
      const dist = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(-dx, -dz);
      let diff = ((wantYaw - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
      bot.yaw += diff * Math.min(1, dt * 10);
      if (dist > 15) {
        moveToward(bot, targetPos.x, targetPos.z, dt, 3.6);
      } else {
        if (now > bot.strafeSwitchAt) {
          bot.strafeSwitchAt = now + 0.7 + rng() * 0.8;
          bot.strafeDir = rng() < 0.5 ? -1 : 1;
        }
        const px = -dz / (dist || 1);
        const pz = dx / (dist || 1);
        pos.x += px * bot.strafeDir * 1.9 * dt;
        pos.z += pz * bot.strafeDir * 1.9 * dt;
        bot.speedNow = 1.9;
        collide(pos);
      }
      if (bot.flashed <= 0) fireAt(bot, ctx, now);
    } else if (bot.target) {
      // Lost sight a moment ago: push to the last seen position.
      followPath(bot, dt, 4.2);
      if (!bot.goal) setGoal(bot, bot.lastSeenPos.x, bot.lastSeenPos.z);
    } else if (bot.investigate) {
      if (!bot.goal) setGoal(bot, bot.investigate.x, bot.investigate.z, () => { bot.investigate = null; });
      followPath(bot, dt, 4.0);
    } else if (bot.goal) {
      followPath(bot, dt, bot.role === 'hold' ? 4.4 : 4.3);
    } else if (bot.resume && Math.hypot(bot.resume.x - pos.x, bot.resume.z - pos.z) > 1.2) {
      // An interruption (a fight, a noise) ended: go back to the standing order.
      const resume = bot.resume;
      setGoal(bot, resume.x, resume.z, resume.then);
    } else if (bot.holdAt) {
      const [hx, hz] = bot.holdAt;
      if (Math.hypot(hx - pos.x, hz - pos.z) > 0.6) moveToward(bot, hx, hz, dt, 3.4);
      else {
        // Settle and watch the lane they were posted on.
        const wantYaw = bot.holdYaw ?? bot.yaw;
        let diff = ((wantYaw - bot.yaw + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        bot.yaw += diff * Math.min(1, dt * 3);
      }
    }

    // Walk cycle: legs swing with speed, the body bobs a little, the body faces its yaw.
    bot.group.rotation.y = bot.yaw;
    const swing = Math.sin(now * 9 + bot.phase) * 0.5 * Math.min(1, bot.speedNow / 3);
    bot.legL.rotation.x = swing;
    bot.legR.rotation.x = -swing;
    bot.group.position.y = Math.abs(Math.sin(now * 9 + bot.phase)) * 0.035 * Math.min(1, bot.speedNow / 3);
  }

  return {
    bots,
    hitMeshes,
    damage: damageBot,
    spawnRound({ targetSite, carrierIndex }) {
      for (const bot of bots) scene.remove(bot.group);
      bots.length = 0;
      hitMeshes.length = 0;
      const penjagaGuns = ['rifle', 'rifle', 'smg'];
      const penjagaPosts = [
        { hold: world.holdPoints.A[1], yaw: Math.PI },
        { hold: world.holdPoints.B[1], yaw: Math.PI },
        { hold: world.holdPoints.mid[0], yaw: 0 },
      ];
      for (let i = 0; i < 3; i += 1) {
        const bot = spawnBot('penjaga', i, world.spawns.penjaga[i + 1], penjagaGuns[i]);
        const post = penjagaPosts[i];
        bot.holdAt = post.hold;
        bot.holdYaw = post.yaw;
        bot.yaw = post.yaw;
        bot.role = 'hold';
        // Defenders start the round already posted at their positions.
        bot.group.position.set(post.hold[0], 0, post.hold[1]);
        bot.group.rotation.y = post.yaw;
      }
      const sungaiGuns = ['rifle', 'smg', 'rifle', 'smg', 'rifle'];
      for (let i = 0; i < 5; i += 1) {
        const bot = spawnBot('sungai', i, world.spawns.sungai[i], sungaiGuns[i]);
        bot.isCarrier = i === carrierIndex;
        bot.role = bot.isCarrier ? 'carrier' : 'attack';
        if (bot.isCarrier) {
          const site = world.sites[targetSite];
          bot.siteTarget = site;
          setGoal(bot, site.x, site.z);
        } else {
          // Wingers stage at the corridor mouth or the plaza on their site's side,
          // then push in once the carrier is close or the round is half gone.
          const west = targetSite === 'A';
          const stage = west ? (i % 2 ? [-9.5, 1.2] : [-13.5, -3.6]) : (i % 2 ? [9.5, 1.2] : [13.5, -3.6]);
          bot.stageAt = stage;
          bot.sitePoint = west ? world.holdPoints.A[1] : world.holdPoints.B[1];
          setGoal(bot, stage[0], stage[1], (self) => {
            self.role = 'stage';
            self.holdAt = self.stageAt;
            self.holdYaw = west ? -0.7 : 0.7;
          });
        }
      }
    },
    pushIn(site) {
      // Wingers leave their staging points for the site's edge.
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'sungai' || bot.isCarrier || bot.role !== 'stage') continue;
        bot.role = 'attack';
        setGoal(bot, bot.sitePoint[0], bot.sitePoint[1], (self) => { self.holdAt = self.sitePoint; self.role = 'hold'; });
      }
    },
    convergeOn(siteLetter) {
      // Defenders fall back to the planted / threatened site.
      const holds = world.holdPoints[siteLetter];
      let slot = 0;
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'penjaga') continue;
        const hold = holds[slot % holds.length];
        slot += 1;
        bot.holdAt = hold;
        bot.role = 'hold';
        setGoal(bot, hold[0], hold[1]);
      }
    },
    carrier() {
      return bots.find((bot) => bot.isCarrier) ?? null;
    },
    makeCarrier(bot, siteLetter) {
      for (const other of bots) other.isCarrier = false;
      bot.isCarrier = true;
      bot.role = 'carrier';
      bot.siteTarget = world.sites[siteLetter];
      setGoal(bot, bot.siteTarget.x, bot.siteTarget.z);
    },
    fetchBomb(pos) {
      // The nearest living attacker goes for the dropped charge.
      let best = null;
      let bestDist = Infinity;
      for (const bot of bots) {
        if (!bot.alive || bot.team !== 'sungai' || bot.isCarrier) continue;
        const d = Math.hypot(bot.group.position.x - pos.x, bot.group.position.z - pos.z);
        if (d < bestDist) { bestDist = d; best = bot; }
      }
      if (best) setGoal(best, pos.x, pos.z);
      return best;
    },
    botNear(x, z, radius, team) {
      for (const bot of bots) {
        if (!bot.alive || bot.team !== team) continue;
        if (Math.hypot(bot.group.position.x - x, bot.group.position.z - z) < radius) return bot;
      }
      return null;
    },
    aliveCount(team) {
      return bots.filter((bot) => bot.alive && bot.team === team).length;
    },
    notifyNoise(x, z, radius, byTeam) {
      const now = performance.now() / 1000;
      for (const bot of bots) {
        if (!bot.alive || bot.team === byTeam || bot.target) continue;
        const d = Math.hypot(bot.group.position.x - x, bot.group.position.z - z);
        if (d < radius) {
          bot.investigate = new THREE.Vector3(x, 0, z);
          bot.lastSeenAt = now - 2.2; // stale on purpose: they come and look, not teleport-aim
        }
      }
    },
    step(dt, ctx) {
      const now = ctx.time;
      for (const bot of bots) stepBot(bot, dt, ctx, now);
    },
  };
}
