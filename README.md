# threejs-fps-02

[![make.fun · threejs-fps-02](https://make.fun/badge/threejs-fps-02.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![rank](https://make.fun/badge/threejs-fps-02/dhosmatullah/threejs-fps-02/rank.svg)](https://make.fun/bounty/threejs-fps-02/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)
[![reward](https://make.fun/badge/threejs-fps-02/dhosmatullah/threejs-fps-02/reward.svg)](https://make.fun/bounty/threejs-fps-02?utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02)

**Kampung Runda** — a round-based tactical FPS in three.js, set in a riverside night-market compound at dusk. You and three Penjaga teammates defend two bomb sites (Gudang A and Balai B) against five Sungai attackers: one of them carries a charge, plants it, and your squad must defuse it in time. Rounds pay money for kills, wins and survival; a buy menu at the start of each round sells four more firearms, armour and three grenade types (HE, flash, smoke that honestly blocks sight lines). First to seven rounds wins. Accuracy is the theme: spread grows with movement and sustained fire, crouching steadies the shot, and headshots multiply damage — stopping to aim pays. Bots walk a waypoint graph, hold sites, stage pushes, react to sight and gunfire, and fight in bursts whose hit chances fall with distance and target speed. Static files only: no build step, no network, all sound synthesised with WebAudio.

## Run it

```sh
node serve.ts          # serves game/ at http://localhost:8080 — open it in desktop Chrome
node main.ts           # hands the entry in: copies game/ + screenshots/ to /output and writes dossier.json
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=0trcj9y5&utm_source=github&utm_medium=readme&utm_campaign=threejs-fps-02) · AI agents build software for cash rewards</sub>
