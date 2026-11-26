// Host multiplayer game engine (rooms, teams, scoring, streaks, analytics, reconnects, reactions)
window.QL = window.QL || {};

(function () {
  const AVATARS = ['🦊', '🐼', '🦁', '🐸', '🐙', '🦄', '🐝', '🦉', '🐧', '🦖', '🚀', '⚡', '🔥', '💎', '🎮', '🌟'];
  const TEAMS = [
    { name: 'Red Dragons', color: '#e5384f', icon: '🐉' },
    { name: 'Blue Falcons', color: '#2f6df6', icon: '🦅' },
    { name: 'Gold Lions', color: '#c98f00', icon: '🦁' },
    { name: 'Green Vipers', color: '#12a36b', icon: '🐍' }
  ];

  let R = null; // Active host room state
  let listeners = {
    onUpdate: null,
    onReaction: null,
    onPlayerJoin: null,
    onError: null
  };

  function shuffleArr(arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = (Math.random() * (i + 1)) | 0;
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  }

  function prepareQuestions(rawQuiz, settings) {
    let qs = rawQuiz.qs.map(q => JSON.parse(JSON.stringify(q)));
    if (settings.shuffleQ) qs = shuffleArr(qs);
    if (settings.shuffleOpts) {
      qs = qs.map(q => {
        if (q.type === 'mc') {
          const idxs = shuffleArr(q.o.map((_, i) => i));
          q.o = idxs.map(i => q.o[i]);
          q.c = idxs.indexOf(q.c);
        } else if (q.type === 'ms') {
          const idxs = shuffleArr(q.o.map((_, i) => i));
          q.o = idxs.map(i => q.o[i]);
          q.cs = q.cs.map(oldC => idxs.indexOf(oldC));
        }
        return q;
      });
    }
    return qs;
  }

  function normText(s) {
    return String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  }

  function rankedPlayers() {
    return [...R.players.entries()].sort((a, b) => {
      if (b[1].score !== a[1].score) return b[1].score - a[1].score;
      return b[1].correctCount - a[1].correctCount;
    });
  }

  function computeTeams() {
    if (R.settings.mode !== 'teams') return [];
    const n = R.settings.teamsCount;
    const buckets = Array.from({ length: n }, (_, i) => ({
      id: i,
      name: TEAMS[i].name,
      color: TEAMS[i].color,
      icon: TEAMS[i].icon,
      score: 0,
      members: 0
    }));
    for (const p of R.players.values()) {
      const ti = p.team % n;
      buckets[ti].score += p.score;
      buckets[ti].members++;
    }
    return buckets.sort((a, b) => b.score - a.score);
  }

  function buildView() {
    const r = R;
    const q = r.qs[r.qi];
    const v = {
      phase: r.phase,
      title: r.quiz.title,
      emoji: r.quiz.emoji || '🎯',
      code: r.code,
      netMode: r.netMode,
      count: r.players.size,
      total: r.qs.length,
      qi: r.qi,
      settings: Object.assign({}, r.settings)
    };

    if (r.phase === 'lobby') {
      v.roster = [...r.players.entries()].map(([id, p]) => ({
        id,
        name: p.name,
        avatar: p.avatar,
        team: p.team,
        connected: p.connected
      }));
      v.teams = computeTeams();
    }

    if (r.phase === 'prep' && q) {
      v.qType = q.type;
      v.pts = q.pts;
      v.left = Math.max(0, r.endsAt - Date.now());
    }

    if ((r.phase === 'question' || r.phase === 'reveal') && q) {
      v.q = {
        type: q.type,
        p: q.p,
        o: q.o || [],
        t: q.t,
        pts: q.pts
      };
      v.left = Math.max(0, r.endsAt - Date.now());
      v.answered = [...r.players.values()].filter(p => p.ans != null).length;
    }

    if (r.phase === 'reveal' && q) {
      v.exp = q.exp || '';
      if (q.type === 'mc' || q.type === 'tf') {
        v.correct = q.c;
        v.counts = new Array(q.o.length).fill(0);
      } else if (q.type === 'ms') {
        v.corrects = q.cs;
        v.counts = new Array(q.o.length).fill(0);
      } else if (q.type === 'text') {
        v.accepted = q.accepted;
        v.counts = [];
      }

      v.results = {};
      const list = rankedPlayers();
      list.forEach(([id, p], idx) => {
        if (q.type === 'mc' || q.type === 'tf') {
          if (typeof p.ans === 'number' && v.counts[p.ans] !== undefined) v.counts[p.ans]++;
        } else if (q.type === 'ms' && Array.isArray(p.ans)) {
          for (const a of p.ans) if (v.counts[a] !== undefined) v.counts[a]++;
        }
        v.results[id] = {
          g: p.gain,
          s: p.score,
          st: p.streak,
          ok: p.ok,
          partial: p.partial,
          r: idx + 1,
          delta: p.prevRank ? p.prevRank - (idx + 1) : 0,
          team: p.team
        };
      });
    }

    if (r.phase === 'reveal' || r.phase === 'over') {
      const list = rankedPlayers();
      v.top = list.slice(0, r.phase === 'over' ? 50 : 10).map(([id, p], idx) => ({
        id,
        name: p.name,
        avatar: p.avatar,
        score: p.score,
        streak: p.streak,
        bestStreak: p.bestStreak,
        correctCount: p.correctCount,
        team: p.team,
        delta: p.prevRank ? p.prevRank - (idx + 1) : 0
      }));
      v.teams = computeTeams();
      if (r.phase === 'over') {
        v.ranks = {};
        list.forEach(([id, p], idx) => {
          v.ranks[id] = {
            r: idx + 1,
            s: p.score,
            correctCount: p.correctCount,
            bestStreak: p.bestStreak,
            team: p.team
          };
        });
        v.analytics = r.analytics;
      }
    }

    return v;
  }

  function push() {
    if (!R) return;
    const v = buildView();
    R.transport.broadcast({ t: 's', v });
    listeners.onUpdate && listeners.onUpdate(v);
  }

  function clearTimers() {
    if (!R) return;
    clearTimeout(R.timer);
    clearTimeout(R.autoTimer);
  }

  function beginPrep() {
    if (!R) return;
    clearTimers();
    R.phase = 'prep';
    R.endsAt = Date.now() + 1800;
    R.timer = setTimeout(startQuestion, 1800);
    push();
  }

  function startQuestion() {
    if (!R) return;
    clearTimers();
    const q = R.qs[R.qi];
    R.phase = 'question';
    R.startedAt = Date.now();
    R.endsAt = R.startedAt + q.t * 1000;
    for (const p of R.players.values()) {
      p.ans = null;
      p.at = 0;
      p.gain = 0;
      p.ok = false;
      p.partial = false;
    }
    R.timer = setTimeout(reveal, q.t * 1000 + 300);
    push();
  }

  function reveal() {
    if (!R || R.phase !== 'question') return;
    clearTimers();
    const q = R.qs[R.qi];
    R.phase = 'reveal';

    // Capture previous ranks before updating scores
    rankedPlayers().forEach(([, p], i) => {
      p.prevRank = i + 1;
    });

    const baseMax = q.pts === 'double' ? 2000 : (q.pts === 'poll' ? 0 : 1000);
    let answeredCount = 0;
    let correctCount = 0;
    let totalTimeMs = 0;

    for (const p of R.players.values()) {
      if (p.ans != null) {
        answeredCount++;
        totalTimeMs += Math.max(0, p.at - R.startedAt);
      }

      let isCorrect = false;
      let isPartial = false;
      let fractionScore = 0;

      if (q.pts === 'poll') {
        isCorrect = p.ans != null;
        fractionScore = 0;
      } else if (q.type === 'mc' || q.type === 'tf') {
        isCorrect = p.ans === q.c;
        fractionScore = isCorrect ? 1 : 0;
      } else if (q.type === 'ms') {
        if (Array.isArray(p.ans) && p.ans.length > 0) {
          const allPickedValid = p.ans.every(i => q.cs.includes(i));
          if (allPickedValid && p.ans.length === q.cs.length) {
            isCorrect = true;
            fractionScore = 1;
          } else if (allPickedValid) {
            isPartial = true;
            fractionScore = p.ans.length / q.cs.length;
          }
        }
      } else if (q.type === 'text') {
        if (typeof p.ans === 'string') {
          const given = normText(p.ans);
          isCorrect = q.accepted.some(a => normText(a) === given);
          fractionScore = isCorrect ? 1 : 0;
        }
      }

      if (q.pts === 'poll') {
        p.gain = 0;
        p.ok = p.ans != null;
        p.partial = false;
      } else if (isCorrect || isPartial) {
        const speed = Math.max(0, Math.min(1, (R.endsAt - p.at) / (q.t * 1000)));
        const speedPts = Math.round(baseMax * (0.5 + 0.5 * speed) * fractionScore);
        const streakBonus = (R.settings.streakBonus && isCorrect) ? Math.min(p.streak, 4) * 100 : 0;
        p.gain = speedPts + streakBonus;
        if (isCorrect) {
          p.streak++;
          p.bestStreak = Math.max(p.bestStreak, p.streak);
          p.correctCount++;
          correctCount++;
        } else {
          p.streak = 0;
        }
        p.ok = isCorrect;
        p.partial = isPartial;
        p.score += p.gain;
      } else {
        p.gain = 0;
        p.streak = 0;
        p.ok = false;
        p.partial = false;
      }
    }

    R.analytics.push({
      qi: R.qi,
      prompt: q.p,
      type: q.type,
      pts: q.pts,
      answeredCount,
      correctCount,
      totalPlayers: R.players.size,
      avgTimeMs: answeredCount ? Math.round(totalTimeMs / answeredCount) : 0
    });

    push();

    if (R.settings.autoAdvance) {
      R.autoTimer = setTimeout(() => {
        if (R && R.phase === 'reveal') next();
      }, 5000);
    }
  }

  function next() {
    if (!R) return;
    if (R.phase === 'prep') {
      startQuestion();
    } else if (R.phase === 'question') {
      reveal();
    } else if (R.phase === 'reveal') {
      clearTimers();
      if (R.qi + 1 >= R.qs.length) {
        R.phase = 'over';
        push();
      } else {
        R.qi++;
        beginPrep();
      }
    }
  }

  function endEarly() {
    if (!R || R.phase === 'lobby' || R.phase === 'over') return;
    clearTimers();
    R.phase = 'over';
    push();
  }

  function start() {
    if (!R || R.phase !== 'lobby' || R.players.size === 0) return;
    R.qs = prepareQuestions(R.quiz, R.settings);
    R.qi = 0;
    R.analytics = [];
    for (const p of R.players.values()) {
      p.score = 0;
      p.prevRank = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.correctCount = 0;
      p.ans = null;
    }
    beginPrep();
  }

  function playAgain() {
    if (!R) return;
    clearTimers();
    R.phase = 'lobby';
    R.qi = 0;
    R.analytics = [];
    for (const p of R.players.values()) {
      p.score = 0;
      p.prevRank = 0;
      p.streak = 0;
      p.bestStreak = 0;
      p.correctCount = 0;
      p.ans = null;
    }
    push();
  }

  function updateSettings(patch) {
    if (!R || R.phase !== 'lobby') return;
    Object.assign(R.settings, patch);
    if (patch.teamsCount || patch.mode) {
      let i = 0;
      for (const p of R.players.values()) {
        p.team = i % R.settings.teamsCount;
        i++;
      }
    }
    push();
  }

  function kickPlayer(id) {
    if (!R || !R.players.has(id)) return;
    R.transport.sendTo(id, { t: 'kicked' });
    R.players.delete(id);
    push();
  }

  function handleMessage(id, m) {
    if (!R || !m || typeof m !== 'object') return;

    if (m.t === 'join') {
      const existing = R.players.get(id);
      if (existing) {
        existing.connected = true;
        if (m.avatar && AVATARS.includes(m.avatar)) existing.avatar = m.avatar;
        R.transport.sendTo(id, { t: 'joined', id });
        push();
        return;
      }

      if (R.phase !== 'lobby') {
        R.transport.sendTo(id, { t: 'err', e: 'started' });
        return;
      }
      if (R.settings.locked) {
        R.transport.sendTo(id, { t: 'err', e: 'locked' });
        return;
      }

      const name = window.QL.store.cl(m.name, 16);
      if (!name) return;

      const lower = name.toLowerCase();
      for (const p of R.players.values()) {
        if (p.connected && p.name.toLowerCase() === lower) {
          R.transport.sendTo(id, { t: 'err', e: 'name_taken' });
          return;
        }
      }

      const avatar = AVATARS.includes(m.avatar) ? m.avatar : AVATARS[R.players.size % AVATARS.length];
      const team = R.players.size % R.settings.teamsCount;

      R.players.set(id, {
        name,
        avatar,
        team,
        connected: true,
        score: 0,
        prevRank: 0,
        streak: 0,
        bestStreak: 0,
        correctCount: 0,
        ans: null,
        at: 0,
        gain: 0,
        ok: false,
        partial: false
      });

      R.transport.sendTo(id, { t: 'joined', id });
      listeners.onPlayerJoin && listeners.onPlayerJoin(name, avatar);
      push();
      return;
    }

    if (m.t === 'answer') {
      const p = R.players.get(id);
      const q = R.qs[R.qi];
      if (!p || !q || R.phase !== 'question' || Date.now() > R.endsAt + 600 || p.ans != null) return;

      if (q.type === 'mc' || q.type === 'tf') {
        const idx = Number(m.ans);
        if (!(idx >= 0 && idx < q.o.length)) return;
        p.ans = idx;
      } else if (q.type === 'ms') {
        if (!Array.isArray(m.ans)) return;
        const clean = [...new Set(m.ans.map(Number).filter(i => i >= 0 && i < q.o.length))];
        if (!clean.length) return;
        p.ans = clean;
      } else if (q.type === 'text') {
        const str = window.QL.store.cl(m.ans, 80);
        if (!str) return;
        p.ans = str;
      } else {
        return;
      }

      p.at = Date.now();
      const allAnswered = [...R.players.values()].every(x => !x.connected || x.ans != null);
      if (allAnswered && R.players.size > 0) reveal();
      else push();
      return;
    }

    if (m.t === 'react') {
      const p = R.players.get(id);
      if (!p) return;
      const now = Date.now();
      if (p.lastReact && now - p.lastReact < 700) return;
      p.lastReact = now;
      const allowed = ['👏', '🔥', '🎉', '😂', '🤯', '❤️'];
      if (allowed.includes(m.emoji)) {
        listeners.onReaction && listeners.onReaction(m.emoji, p.name);
      }
    }
  }

  function handleDisconnect(id) {
    if (!R) return;
    const p = R.players.get(id);
    if (!p) return;
    if (R.phase === 'lobby') {
      R.players.delete(id);
    } else {
      p.connected = false;
    }
    push();
  }

  async function hostCreate(quiz, cbs = {}) {
    destroy();
    listeners = Object.assign({ onUpdate: null, onReaction: null, onPlayerJoin: null, onError: null }, cbs);

    R = {
      quiz: JSON.parse(JSON.stringify(quiz)),
      qs: quiz.qs,
      players: new Map(),
      phase: 'lobby',
      qi: 0,
      endsAt: 0,
      startedAt: 0,
      timer: null,
      autoTimer: null,
      code: '',
      netMode: 'p2p',
      analytics: [],
      settings: {
        mode: 'classic',
        teamsCount: 2,
        shuffleQ: false,
        shuffleOpts: false,
        streakBonus: true,
        autoAdvance: false,
        locked: false
      },
      transport: null
    };

    R.transport = await window.QL.net.createHostTransport({
      onReady(code, netMode) {
        if (!R) return;
        R.code = code;
        R.netMode = netMode;
        push();
      },
      onMessage: handleMessage,
      onDisconnect: handleDisconnect,
      onError(errKey) {
        listeners.onError && listeners.onError(errKey);
      }
    });
  }

  function destroy() {
    if (!R) return;
    clearTimers();
    if (R.transport) R.transport.destroy();
    R = null;
  }

  function exportCsv() {
    if (!R) return '';
    const rows = [['Rank', 'Player', 'Team', 'Score', 'Correct', 'Total Questions', 'Best Streak']];
    rankedPlayers().forEach(([, p], i) => {
      rows.push([
        i + 1,
        '"' + p.name.replace(/"/g, '""') + '"',
        R.settings.mode === 'teams' ? TEAMS[p.team % R.settings.teamsCount].name : '-',
        p.score,
        p.correctCount,
        R.qs.length,
        p.bestStreak
      ]);
    });
    return rows.map(r => r.join(',')).join('\n');
  }

  window.QL.AVATARS = AVATARS;
  window.QL.TEAMS = TEAMS;
  window.QL.engine = {
    hostCreate,
    destroy,
    start,
    next,
    reveal,
    endEarly,
    playAgain,
    updateSettings,
    kickPlayer,
    exportCsv,
    getState: () => (R ? buildView() : null)
  };
})();
