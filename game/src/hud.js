// The DOM HUD: crosshair that breathes with the weapon's spread, hit marker, health and
// armour, ammunition and money, the round clock and scoreboard, a killfeed, round
// banners, the buy menu, the bomb and defuse readouts, and the full-screen overlays
// (title, pause, match end). It never touches the simulation; main.js and match.js push
// values in and read the play callback out. Timers run on the dt main.js feeds step(),
// so a frozen screenshot frame is a frozen HUD too.
import { PALETTE } from './palette.js';

const $ = (id) => document.getElementById(id);

export function createHud() {
  const els = {
    crosshair: $('crosshair'),
    hitmarker: $('hitmarker'),
    healthFill: $('health-fill'),
    healthText: $('health-text'),
    armorWrap: $('armor'),
    armorFill: $('armor-fill'),
    ammoMag: $('ammo-mag'),
    ammoReserve: $('ammo-reserve'),
    ammoWrap: $('ammo'),
    weaponName: $('weapon-name'),
    money: $('money'),
    timer: $('timer'),
    scoreP: $('score-p'),
    scoreS: $('score-s'),
    roundLabel: $('round-label'),
    killfeed: $('killfeed'),
    banner: $('banner'),
    bannerTitle: $('banner-title'),
    bannerSub: $('banner-sub'),
    buymenu: $('buymenu'),
    buyTimer: $('buy-timer'),
    buyMoney: $('buy-money'),
    bomb: $('bomb'),
    bombFill: $('bomb-fill'),
    bombSite: $('bomb-site'),
    progress: $('progress'),
    progressFill: $('progress-fill'),
    progressLabel: $('progress-label'),
    vignette: $('vignette'),
    damageDir: $('damage-dir'),
    flash: $('flash'),
    scope: $('scope'),
    defusePrompt: $('defuse-prompt'),
    overlay: $('overlay'),
    overlayTitle: $('overlay-title'),
    overlayCopy: $('overlay-copy'),
    play: $('play'),
  };
  const cache = { mag: -1, reserve: -1, money: -1, hp: -1, armor: -1, timer: '' };
  let hitTimer = 0;
  let bannerLeft = 0;
  let vignetteStrength = 0;
  let flashStrength = 0;
  const buyItems = new Map();
  const feedRows = [];

  function fmtTime(seconds) {
    const total = Math.max(0, Math.ceil(seconds));
    return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, '0')}`;
  }

  return {
    setHealth(hp, armor) {
      if (hp !== cache.hp) {
        cache.hp = hp;
        els.healthFill.style.width = `${hp}%`;
        els.healthText.textContent = String(hp);
        els.healthFill.style.background = hp <= 25 ? PALETTE.sungai : PALETTE.accent;
      }
      if (armor !== cache.armor) {
        cache.armor = armor;
        els.armorWrap.style.display = armor > 0 ? 'flex' : 'none';
        els.armorFill.style.width = `${armor}%`;
      }
    },
    setAmmo(mag, reserve, weaponName) {
      if (mag !== cache.mag || reserve !== cache.reserve) {
        cache.mag = mag;
        cache.reserve = reserve;
        els.ammoMag.textContent = mag === Infinity ? '—' : String(mag);
        els.ammoReserve.textContent = reserve === Infinity ? '' : `/ ${reserve}`;
        els.ammoWrap.classList.toggle('empty', mag === 0);
      }
      if (weaponName && els.weaponName.textContent !== weaponName) els.weaponName.textContent = weaponName;
    },
    setMoney(value) {
      if (value === cache.money) return;
      cache.money = value;
      els.money.textContent = `$${value}`;
      els.buyMoney.textContent = `$${value}`;
    },
    setScoreboard(penjaga, sungai, round) {
      els.scoreP.textContent = String(penjaga);
      els.scoreS.textContent = String(sungai);
      els.roundLabel.textContent = `RONDE ${round}`;
    },
    setTimer(seconds, isFuse) {
      const text = fmtTime(seconds);
      if (text === cache.timer && !isFuse) return;
      cache.timer = text;
      els.timer.textContent = text;
      els.timer.classList.toggle('danger', isFuse || seconds <= 10);
    },
    setCrosshairGap(px) {
      els.crosshair.style.setProperty('--gap', `${Math.round(px)}px`);
    },
    hitMarker(killed) {
      els.hitmarker.classList.add('on');
      els.hitmarker.classList.toggle('kill', killed);
      hitTimer = killed ? 0.28 : 0.12;
    },
    killfeed(html, cls = '') {
      const row = document.createElement('div');
      row.className = `feed-row ${cls}`;
      row.innerHTML = html;
      els.killfeed.prepend(row);
      feedRows.unshift({ row, age: 0 });
      while (feedRows.length > 5) {
        const old = feedRows.pop();
        old.row.remove();
      }
    },
    banner(title, sub, seconds = 2.4) {
      els.bannerTitle.textContent = title;
      els.bannerSub.textContent = sub ?? '';
      els.banner.classList.add('show');
      bannerLeft = seconds;
    },
    clearBanner() {
      bannerLeft = 0;
      els.banner.classList.remove('show');
    },
    buildBuyMenu(items) {
      els.buymenu.querySelectorAll('.buy-item').forEach((node) => node.remove());
      buyItems.clear();
      for (const item of items) {
        const node = document.createElement('div');
        node.className = 'buy-item';
        node.innerHTML = `<span class="buy-key">${item.key}</span><span class="buy-name">${item.label}</span><span class="buy-price">$${item.price}</span><span class="buy-count"></span>`;
        els.buymenu.appendChild(node);
        buyItems.set(item.id, node);
      }
    },
    setBuyItemState(id, { affordable, owned, count }) {
      const node = buyItems.get(id);
      if (!node) return;
      node.classList.toggle('cant', !affordable && !owned);
      node.classList.toggle('owned', Boolean(owned));
      node.querySelector('.buy-count').textContent = count ? `×${count}` : '';
    },
    showBuyMenu(show) {
      els.buymenu.classList.toggle('show', show);
    },
    setBuyTimer(seconds) {
      els.buyTimer.textContent = `Mulai dalam ${Math.max(0, Math.ceil(seconds))} detik — tekan angka untuk membeli`;
    },
    setBombState(bomb) {
      if (!bomb) {
        els.bomb.classList.remove('show');
        return;
      }
      els.bomb.classList.add('show');
      els.bombSite.textContent = `BOM · SITUS ${bomb.site}`;
      els.bombFill.style.width = `${Math.max(0, (bomb.fuse / 35) * 100)}%`;
    },
    setPlantProgress(frac, label) {
      if (frac <= 0) {
        els.progress.classList.remove('show');
        return;
      }
      els.progress.classList.add('show');
      els.progressFill.style.width = `${Math.min(100, frac * 100)}%`;
      els.progressLabel.textContent = label;
    },
    showDefusePrompt(show) {
      els.defusePrompt.classList.toggle('show', show);
    },
    damageFrom(strength, angleRad) {
      vignetteStrength = Math.min(1, vignetteStrength + strength);
      els.damageDir.style.transform = `translate(-50%, -50%) rotate(${angleRad}rad)`;
      els.damageDir.style.opacity = '1';
    },
    setFlash(value) {
      flashStrength = Math.max(flashStrength, value);
    },
    setScoped(scoped) {
      els.scope.classList.toggle('show', scoped);
      els.crosshair.style.opacity = scoped ? '0' : '1';
    },
    showOverlay(mode, data = {}) {
      if (mode === 'start') {
        els.overlayTitle.textContent = 'Kampung Runda';
        els.overlayCopy.textContent = 'FPS taktis 4 lawan 5 di pasar malam tepi sungai. Geng Sungai datang menanam bom di Gudang (A) atau Balai (B) — skuad Penjaga-mu bertahan. Menangkan 7 ronde: habisi mereka, tahan waktu, atau jinakkan bomnya. Uang dari setiap ronde dibelanjakan di menu beli.';
        els.play.textContent = 'Main';
      } else if (mode === 'paused') {
        els.overlayTitle.textContent = 'Jeda';
        els.overlayCopy.textContent = 'Permainan berhenti sejenak. Klik untuk lanjut.';
        els.play.textContent = 'Lanjut';
      } else if (mode === 'matchend') {
        els.overlayTitle.textContent = data.won ? 'Kampung Aman!' : 'Kampung Jatuh';
        els.overlayCopy.textContent = `${data.reason ?? ''} Skor akhir — Penjaga ${data.p} : ${data.s} Sungai.`;
        els.play.textContent = 'Main lagi';
      }
      els.overlay.hidden = false;
    },
    hideOverlay() {
      els.overlay.hidden = true;
    },
    onPlay(handler) {
      els.play.addEventListener('click', handler);
    },
    step(dt) {
      for (let i = feedRows.length - 1; i >= 0; i -= 1) {
        const entry = feedRows[i];
        entry.age += dt;
        if (entry.age > 3.6) entry.row.classList.add('fade');
        if (entry.age > 4.3) {
          entry.row.remove();
          feedRows.splice(i, 1);
        }
      }
      if (hitTimer > 0) {
        hitTimer -= dt;
        if (hitTimer <= 0) els.hitmarker.classList.remove('on', 'kill');
      }
      if (bannerLeft > 0) {
        bannerLeft -= dt;
        if (bannerLeft <= 0) els.banner.classList.remove('show');
      }
      vignetteStrength = Math.max(0, vignetteStrength - dt * 1.5);
      els.vignette.style.opacity = String(vignetteStrength * 0.85);
      if (vignetteStrength <= 0.02) els.damageDir.style.opacity = '0';
      flashStrength = Math.max(0, flashStrength - dt * 0.55);
      els.flash.style.opacity = String(Math.min(1, flashStrength));
    },
  };
}
