# Quiz Live — Multiplayer Quiz Game Platform

A live multiplayer quiz game platform (like Kahoot / Quizizz) that runs **100% statically** on any web host — plus an optional zero-dependency **LAN WebSocket server** for campus/classroom Wi-Fi.

## Features
- **Visual Quiz Studio & Library**: Create, edit, duplicate, save (`localStorage`), and import/export quizzes (JSON or quick pipe-delimited bulk text). Includes 4 built-in starter templates.
- **4 Question Types**: Multiple Choice (`mc`), True/False (`tf`), Multi-Select (`ms` with partial credit), and Type Answer (`text`).
- **Scoring & Modes**: Standard (1000), Double Points (2000), and No-Points Poll mode, speed bonuses, answer streaks, **Classic Individual** or **Team Battle** (2–4 teams).
- **Host Presenter & Player Controller**:
  - Room code, copyable share link, and built-in offline **QR code** scanner target.
  - Lobby controls: shuffle questions/options, toggle streaks, auto-advance, lock room, kick players.
  - Live answer distribution bars, explanations, floating player emoji reactions, synthesized Web Audio SFX, bilingual **English / සිංහල** UI, and light/dark themes.
  - Animated Top-3 Podium, question accuracy analytics, and **CSV export**.

## Hosting Options

### 1. Static Hosting (Zero Backend)
Upload the folder as-is to **Netlify Drop**, **GitHub Pages**, **Cloudflare Pages**, or **Vercel**, or open `index.html` locally.
- Uses **PeerJS (WebRTC)** for cross-device play and **BroadcastChannel** for instant same-browser multi-tab play.

### 2. Optional LAN / Classroom Server (Zero `npm install`)
If strict campus or office Wi-Fi blocks WebRTC peer-to-peer connections, run the built-in Node.js WebSocket relay server:

```bash
node server.js
```

Open the printed `http://<LAN-IP>:3000` URL on the host and players' phones — the app automatically detects `/api/mode` and switches to WebSocket mode.
