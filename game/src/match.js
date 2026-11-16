// The match: first to seven rounds takes Kampung Runda. This file is the one place
// match state lives — phase (buy, live, planted, over, match end), the round clock,
// both team scores, the player's money and loadout survival, and the charge itself:
// the Sungai carrier plants it on a site (3.2 s, standing exposed), it ticks for 35 s,
// and a Penjaga who reaches it holds the defuse key for 5 s to cut the wire. Round wins
// pay, kills pay, and the buy phase at the start of every round is where it is spent.
// Everything here is rules and timers; main.js feeds it events (kills, the carrier's
// position, the defuse key) and reads state out for the HUD.
import { WEAPONS, GRENADES } from './weapons.js';

export const ROUND_TIME = 100;
export const BUY_TIME = 14;
export const PLANT_TIME = 3.2;
export const DEFUSE_TIME = 5;
export const FUSE_TIME = 35;
export const WIN_SCORE = 7;
export const MAX_ROUNDS = 13;
const START_MONEY = 800;
const MAX_MONEY = 9000;

export function createMatch(deps) {
  const { hud, audio, rng } = deps;
  const state = {
    phase: 'idle', // idle | buy | live | over | matchover
    round: 0,
    score: { penjaga: 0, sungai: 0 },
    money: START_MONEY,
    timer: 0,
    phaseLeft: 0,
    targetSite: 'A',
    carrierIndex: 0,
    bomb: 'carried', // carried | planting | planted | dropped | done
    bombSite: null,
    bombPos: null,
    plantProgress: 0,
    defuseProgress: 0,
    fuse: 0,
    lastBeepSecond: -1,
    playerAliveAtRoundStart: true,
    winner: null,
    roundWinner: null,
    pushedIn: false,
  };

  function teamAliveCounts() {
    return deps.aliveCounts();
  }

  function startMatch() {
    state.score = { penjaga: 0, sungai: 0 };
    state.money = START_MONEY;
    state.round = 0;
    deps.resetArsenal(false);
    startRound();
  }

  function startRound() {
    state.round += 1;
    state.phase = 'buy';
    state.phaseLeft = BUY_TIME;
    state.timer = ROUND_TIME;
    state.targetSite = rng() < 0.5 ? 'A' : 'B';
    state.carrierIndex = Math.floor(rng() * 5);
    state.bomb = 'carried';
    state.bombSite = null;
    state.bombPos = null;
    state.plantProgress = 0;
    state.defuseProgress = 0;
    state.fuse = 0;
    state.lastBeepSecond = -1;
    state.roundWinner = null;
    state.pushedIn = false;
    deps.setupRound(state.targetSite, state.carrierIndex);
    hud.showBuyMenu(true);
    hud.banner(`Ronde ${state.round}`, `Beli perlengkapan — ronde mulai dalam ${BUY_TIME} detik`, 2.6);
    syncHud();
  }

  function syncHud() {
    hud.setScoreboard(state.score.penjaga, state.score.sungai, state.round);
    hud.setMoney(state.money);
    hud.setTimer(state.bomb === 'planted' ? state.fuse : state.timer, state.bomb === 'planted');
  }

  function buy(id) {
    if (state.phase !== 'buy') return;
    if (id === 'armor') {
      if (deps.playerArmor() >= 100) { audio.denied(); return; }
      if (state.money < 650) { audio.denied(); return; }
      state.money -= 650;
      deps.giveArmor();
      audio.buy();
      syncHud();
      return;
    }
    if (GRENADES[id]) {
      const def = GRENADES[id];
      if (deps.grenadeCount(id) >= 2 || state.money < def.price) { audio.denied(); return; }
      state.money -= def.price;
      deps.giveGrenade(id);
      audio.buy();
      syncHud();
      return;
    }
    const def = WEAPONS[id];
    if (!def || def.slot === 'knife') return;
    if (deps.owns(id) || state.money < def.price) { audio.denied(); return; }
    state.money -= def.price;
    deps.giveWeapon(id);
    audio.buy();
    syncHud();
  }

  function endRound(winner, reason) {
    if (state.phase === 'over' || state.phase === 'matchover') return;
    state.roundWinner = winner;
    state.score[winner] += 1;
    state.bomb = state.bomb === 'planted' ? 'done' : state.bomb;
    const playerTeamWon = winner === 'penjaga';
    state.money = Math.min(MAX_MONEY, state.money + (playerTeamWon ? 1400 : 900));
    if (deps.playerAlive()) state.money = Math.min(MAX_MONEY, state.money + 150);
    audio[playerTeamWon ? 'roundWin' : 'roundLose']();
    hud.showBuyMenu(false);
    hud.setBombState(null);
    const matchDone = state.score[winner] >= WIN_SCORE || state.round >= MAX_ROUNDS;
    if (matchDone) {
      state.phase = 'matchover';
      state.winner = state.score.penjaga === state.score.sungai
        ? (winner) // a tied count on the last round goes to its winner
        : (state.score.penjaga > state.score.sungai ? 'penjaga' : 'sungai');
      hud.showOverlay('matchend', { won: state.winner === 'penjaga', p: state.score.penjaga, s: state.score.sungai, reason });
    } else {
      state.phase = 'over';
      state.phaseLeft = 4.5;
      hud.banner(
        playerTeamWon ? 'Ronde dimenangkan!' : 'Ronde kalah',
        reason,
        4.2,
      );
    }
    syncHud();
    deps.onRoundEnd(winner);
  }

  function checkElimination() {
    const counts = teamAliveCounts();
    const penjagaAlive = counts.penjaga + (deps.playerAlive() ? 1 : 0);
    if (counts.sungai === 0 && state.bomb !== 'planted') {
      endRound('penjaga', 'Seluruh Geng Sungai tumbang.');
      return true;
    }
    if (penjagaAlive === 0) {
      endRound('sungai', state.bomb === 'planted' ? 'Skuad Penjaga tumbang dengan bom aktif.' : 'Skuad Penjaga tumbang.');
      return true;
    }
    return false;
  }

  return {
    state,
    startMatch,
    buy,
    syncHud,
    onKill(killerTeam, victimTeam, byPlayer) {
      if (byPlayer && victimTeam === 'sungai') {
        state.money = Math.min(MAX_MONEY, state.money + 300);
        syncHud();
      }
      if (state.phase === 'live') checkElimination();
    },
    onPlayerDeath() {
      if (state.phase === 'live') checkElimination();
    },
    step(dt, ctx) {
      if (state.phase === 'buy') {
        state.phaseLeft -= dt;
        hud.setBuyTimer(state.phaseLeft);
        if (state.phaseLeft <= 0) {
          state.phase = 'live';
          hud.showBuyMenu(false);
          hud.banner('Bertahan!', 'Jangan biarkan bom ditanam di Gudang atau Balai', 1.6);
        }
        syncHud();
        return;
      }
      if (state.phase === 'over') {
        state.phaseLeft -= dt;
        if (state.phaseLeft <= 0) {
          deps.resetArsenal(deps.playerAlive());
          startRound();
        }
        return;
      }
      if (state.phase !== 'live') return;

      // The carrier plants when standing on the site; the wingers push in behind him.
      const carrier = deps.carrier();
      if (state.bomb === 'carried') {
        state.timer -= dt;
        if (!state.pushedIn && state.timer < ROUND_TIME * 0.55) {
          state.pushedIn = true;
          deps.pushIn();
        }
        if (carrier && carrier.alive) {
          const site = deps.siteOf(state.targetSite);
          const dist = Math.hypot(carrier.group.position.x - site.x, carrier.group.position.z - site.z);
          if (dist < site.r) {
            state.bomb = 'planting';
            state.plantProgress = 0;
            carrier.planting = true;
            deps.convergeOn(state.targetSite);
          }
        } else if (carrier && !carrier.alive && state.bomb === 'carried') {
          state.bomb = 'dropped';
          state.bombPos = { x: carrier.group.position.x, z: carrier.group.position.z };
          deps.onBombDropped(state.bombPos);
        }
        if (state.timer <= 0) {
          endRound('penjaga', 'Waktu habis — kawasan aman.');
          return;
        }
      } else if (state.bomb === 'dropped') {
        state.timer -= dt;
        const picker = deps.bombPicker(state.bombPos);
        if (picker) {
          state.bomb = 'carried';
          deps.onBombPickedUp(picker);
        } else if (state.timer <= 0) {
          endRound('penjaga', 'Waktu habis — bom tidak sempat ditanam.');
          return;
        }
      } else if (state.bomb === 'planting') {
        if (!carrier || !carrier.alive) {
          state.bomb = 'dropped';
          state.plantProgress = 0;
          if (carrier) carrier.planting = false;
          state.bombPos = carrier ? { x: carrier.group.position.x, z: carrier.group.position.z } : state.bombPos;
          deps.onBombDropped(state.bombPos);
        } else {
          state.plantProgress += dt;
          hud.setPlantProgress(state.plantProgress / PLANT_TIME, 'Bom sedang ditanam…');
          if (state.plantProgress >= PLANT_TIME) {
            state.bomb = 'planted';
            state.bombSite = state.targetSite;
            state.bombPos = { x: carrier.group.position.x, z: carrier.group.position.z };
            state.fuse = FUSE_TIME;
            carrier.planting = false;
            carrier.isCarrier = false;
            audio.plant();
            hud.setBombState({ site: state.bombSite, fuse: state.fuse });
            hud.banner('Bom ditanam!', `Jinakkan di Situs ${state.bombSite} sebelum meledak`, 2.6);
            deps.onBombPlanted(state.bombSite, state.bombPos);
          }
        }
      } else if (state.bomb === 'planted') {
        state.fuse -= dt;
        const second = Math.ceil(state.fuse);
        if (second !== state.lastBeepSecond) {
          state.lastBeepSecond = second;
          audio.beep(state.fuse <= 5.2);
        }
        hud.setBombState({ site: state.bombSite, fuse: state.fuse });
        // Defuse: the player (or, failing that, nobody — teammates guard, the player cuts)
        if (ctx.defusing && deps.playerAlive()) {
          state.defuseProgress += dt;
          hud.setPlantProgress(state.defuseProgress / DEFUSE_TIME, 'Menjinakkan bom…');
          if (state.defuseProgress >= DEFUSE_TIME) {
            state.bomb = 'done';
            state.money = Math.min(MAX_MONEY, state.money + 350);
            endRound('penjaga', 'Bom berhasil dijinakkan.');
            return;
          }
        } else {
          state.defuseProgress = Math.max(0, state.defuseProgress - dt * 1.5);
          if (state.defuseProgress <= 0) hud.setPlantProgress(0, '');
        }
        if (state.fuse <= 0) {
          state.bomb = 'done';
          deps.onBombExploded(state.bombPos);
          endRound('sungai', `Bom meledak di Situs ${state.bombSite}.`);
          return;
        }
        // Elimination still ends a planted round — but only the defenders' wipe does;
        // killing every attacker after the plant does not stop the charge.
        const counts = teamAliveCounts();
        if (counts.penjaga + (deps.playerAlive() ? 1 : 0) === 0) {
          endRound('sungai', 'Skuad Penjaga tumbang dengan bom aktif.');
          return;
        }
      }
      syncHud();
    },
  };
}
