// Main SPA controller: Navigation, Home/Join, Host Presenter UI, Player Controller UI, Podium & Analytics
window.QL = window.QL || {};

(function () {
  const $ = s => document.querySelector(s);
  const app = $('#app');
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
  const SH = ['▲', '◆', '●', '■'];
  const t = k => window.QL.t(k);
  const pCountText = n => `${n} ${n === 1 ? t('playerLabel') : t('playersLabel')}`;

  let route = 'home'; // 'home' | 'library' | 'studio' | 'host' | 'player'
  let editQuizId = null;
  let theme = localStorage.getItem('ql_theme') || 'auto';

  // Live session state
  let role = null; // 'host' | 'player' | null
  let playerTransport = null;
  let myId = window.QL.net.getClientId();
  let myAvatar = localStorage.getItem('ql_avatar') || window.QL.AVATARS[0];
  let roomCode = '';
  let S = null; // Current synced view state
  let lastQ = -1;
  let picked = null; // number | number[] | string | null
  let multiPicked = new Set();
  let endAt = 0;
  let timerInterval = null;
  let lastTickSec = -1;
  let playerNetMode = 'p2p';

  function applyTheme() {
    document.documentElement.dataset.theme = theme;
    const btn = $('#themeBtn');
    if (btn) btn.textContent = theme === 'dark' ? '🌙' : (theme === 'light' ? '☀️' : '🌓');
  }

  function updateHeader() {
    const langBtn = $('#langBtn');
    if (langBtn) langBtn.textContent = window.QL.lang === 'en' ? 'සිං' : 'EN';
    const sndBtn = $('#soundBtn');
    if (sndBtn) sndBtn.textContent = window.QL.audio.isMuted() ? '🔇' : '🔊';
    applyTheme();

    const nav = $('#mainNav');
    if (!nav) return;
    if (role) {
      nav.innerHTML = `<button class="sec sm" id="leaveLiveBtn">${t('backHome')}</button>`;
      $('#leaveLiveBtn').onclick = () => {
        cleanupSession();
        navigate('home');
      };
    } else {
      nav.innerHTML = `
        <button class="nav-btn ${route === 'home' ? 'active' : ''}" data-nav="home">${t('navPlay')}</button>
        <button class="nav-btn ${route === 'library' ? 'active' : ''}" data-nav="library">${t('navLibrary')}</button>
        <button class="nav-btn ${route === 'studio' ? 'active' : ''}" data-nav="studio">${t('navStudio')}</button>
      `;
      nav.querySelectorAll('[data-nav]').forEach(b => {
        b.onclick = () => navigate(b.dataset.nav);
      });
    }
  }

  function cleanupSession() {
    clearInterval(timerInterval);
    window.QL.engine.destroy();
    if (playerTransport) {
      playerTransport.destroy();
      playerTransport = null;
    }
    role = null;
    S = null;
    roomCode = '';
    picked = null;
    multiPicked.clear();
    lastQ = -1;
  }

  function navigate(target, param = null) {
    if (role && target !== 'host' && target !== 'player') {
      cleanupSession();
    }
    route = target;
    if (target === 'studio') editQuizId = param;
    updateHeader();
    render();
  }

  /* ---------------- HOME VIEW ---------------- */
  function renderHome() {
    const preCode = (new URLSearchParams(location.search).get('join') || '').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 8);
    const savedName = localStorage.getItem('ql_nick') || '';
    const quickQuizzes = window.QL.store.getAll().slice(0, 4);

    app.innerHTML = `
      <section class="hero">
        <div class="hero-copy">
          <span class="pill" id="netModeBadge">⚡ ${t('connModeP2P')}</span>
          <h1>${t('heroTitle')}</h1>
          <p class="muted">${t('heroSub')}</p>
        </div>
      </section>

      <div class="grid2">
        <div class="card join-card">
          <h2>🎮 ${t('joinTitle')}</h2>
          <label for="jc">${t('codeLabel')}</label>
          <input id="jc" class="code-inp" maxlength="8" autocomplete="off" placeholder="${esc(t('codePlaceholder'))}" value="${esc(preCode)}">

          <label for="jn">${t('nameLabel')}</label>
          <input id="jn" maxlength="16" placeholder="${esc(t('namePlaceholder'))}" value="${esc(savedName)}">

          <label>${t('avatarLabel')}</label>
          <div class="avatar-grid" id="avGrid">
            ${window.QL.AVATARS.map(av => `<button type="button" class="av-btn ${av === myAvatar ? 'on' : ''}" data-av="${av}">${av}</button>`).join('')}
          </div>

          <p class="err" id="e-join" role="alert"></p>
          <button class="pri full" id="jb">${t('joinBtn')}</button>
        </div>

        <div class="card host-card">
          <h2>🚀 ${t('hostQuickTitle')}</h2>
          <p class="muted">${t('hostQuickSub')}</p>
          <div class="btn-row" style="margin:12px 0 18px">
            <button class="pri" id="goStudio">${t('openStudioBtn')}</button>
            <button class="sec" id="goLib">${t('browseLibBtn')}</button>
          </div>
          <h3 class="sub-h">${t('recentQuizzes')}</h3>
          <div class="quick-list">
            ${quickQuizzes.map(q => `
              <div class="quick-item">
                <span class="qi-em">${esc(q.emoji || '🎯')}</span>
                <div class="qi-info">
                  <strong>${esc(q.title)}</strong>
                  <span class="muted">${q.qs.length} ${t('qsCount')} · ${esc(q.category)}</span>
                </div>
                <button class="pri sm" data-host-id="${esc(q.id)}">${t('hostNow')}</button>
              </div>
            `).join('')}
          </div>
        </div>
      </div>
    `;

    window.QL.net.detectServerMode().then(isWs => {
      const badge = $('#netModeBadge');
      if (badge) badge.textContent = isWs ? '🛰️ ' + t('connModeWS') : '⚡ ' + t('connModeP2P');
    });

    app.querySelectorAll('.av-btn').forEach(b => {
      b.onclick = () => {
        myAvatar = b.dataset.av;
        localStorage.setItem('ql_avatar', myAvatar);
        app.querySelectorAll('.av-btn').forEach(x => x.classList.toggle('on', x === b));
      };
    });

    $('#goStudio').onclick = () => navigate('studio', null);
    $('#goLib').onclick = () => navigate('library');

    app.querySelectorAll('[data-host-id]').forEach(b => {
      b.onclick = () => {
        const q = window.QL.store.getById(b.dataset.hostId);
        if (q) startHosting(q);
      };
    });

    const submitJoin = () => {
      const code = $('#jc').value.trim().toUpperCase();
      const name = $('#jn').value.trim();
      const err = $('#e-join');
      if (!code || code.length < 4) { err.textContent = t('errNoCode'); return; }
      if (!name) { err.textContent = t('errNoName'); return; }
      err.textContent = '';
      localStorage.setItem('ql_nick', name);
      joinRoom(code, name, myAvatar);
    };

    $('#jb').onclick = submitJoin;
    $('#jn').onkeydown = e => { if (e.key === 'Enter') submitJoin(); };
    $('#jc').onkeydown = e => { if (e.key === 'Enter') $('#jn').focus(); };
  }

  /* ---------------- HOST FLOW ---------------- */
  async function startHosting(quiz) {
    cleanupSession();
    role = 'host';
    route = 'host';
    updateHeader();
    app.innerHTML = `<div class="card center"><div class="spinner"></div><p class="muted">${t('waitingPlayers')}</p></div>`;

    await window.QL.engine.hostCreate(quiz, {
      onUpdate(view) {
        applyState(view);
      },
      onPlayerJoin() {
        window.QL.audio.join();
      },
      onReaction(emoji, fromName) {
        spawnFloatingReaction(emoji, fromName);
      },
      onError(errKey) {
        app.innerHTML = `<div class="card center"><h2>${t('errNet')}</h2><p class="muted">${esc(errKey)}</p><button class="pri" id="hm">${t('backHome')}</button></div>`;
        $('#hm').onclick = () => { cleanupSession(); navigate('home'); };
      }
    });
  }

  /* ---------------- PLAYER FLOW ---------------- */
  async function joinRoom(code, name, avatar) {
    cleanupSession();
    roomCode = code;
    const btn = $('#jb');
    if (btn) btn.disabled = true;

    playerTransport = await window.QL.net.createPlayerTransport(code, {
      onOpen(cid, mode) {
        myId = cid;
        playerNetMode = mode;
        playerTransport.send({ t: 'join', name, avatar });
      },
      onMessage(m) {
        if (!m || typeof m !== 'object') return;
        if (m.t === 'joined') {
          role = 'player';
          route = 'player';
          if (m.id) myId = m.id;
          updateHeader();
          window.QL.audio.join();
          if (S) render();
        } else if (m.t === 'err') {
          if (btn) btn.disabled = false;
          const map = {
            started: 'errStarted',
            locked: 'errLocked',
            name_taken: 'errNameTaken'
          };
          const errEl = $('#e-join');
          if (errEl) errEl.textContent = t(map[m.e] || 'errNet');
          cleanupSession();
        } else if (m.t === 'kicked') {
          cleanupSession();
          updateHeader();
          app.innerHTML = `<div class="card center"><h2>🚫 ${t('errKicked')}</h2><button class="pri" id="hm">${t('backHome')}</button></div>`;
          $('#hm').onclick = () => navigate('home');
        } else if (m.t === 's') {
          if (!role) {
            role = 'player';
            route = 'player';
            updateHeader();
          }
          applyState(m.v);
        }
      },
      onError(errKey) {
        if (btn) btn.disabled = false;
        const errEl = $('#e-join');
        if (errEl) errEl.textContent = t(errKey === 'nocode' ? 'errNoCodeFound' : 'errNet');
        cleanupSession();
      },
      onClose() {
        if (role === 'player' && (!S || S.phase !== 'over')) {
          clearInterval(timerInterval);
          app.innerHTML = `<div class="card center"><h2>📡 ${t('errLost')}</h2><button class="pri" id="hm">${t('backHome')}</button></div>`;
          $('#hm').onclick = () => { cleanupSession(); navigate('home'); };
        }
      }
    });
  }

  function applyState(v) {
    const prevPhase = S ? S.phase : null;
    S = v;
    if (S.qi !== lastQ || S.phase === 'lobby') {
      picked = null;
      multiPicked.clear();
      lastQ = S.qi;
      lastTickSec = -1;
    }
    if (S.left != null) {
      endAt = Date.now() + S.left;
    }
    if (role === 'host') {
      if (S.phase === 'reveal' && prevPhase === 'question') window.QL.audio.reveal();
      if (S.phase === 'over' && prevPhase !== 'over') window.QL.audio.fanfare();
    } else if (role === 'player') {
      if (S.phase === 'reveal' && prevPhase === 'question') {
        const me = (S.results || {})[myId];
        if (me && S.q && S.q.pts !== 'poll') {
          if (me.ok) window.QL.audio.correct();
          else if (!me.partial) window.QL.audio.wrong();
        }
      } else if (S.phase === 'over' && prevPhase !== 'over') {
        window.QL.audio.fanfare();
      }
    }
    render();
  }

  /* ---------------- RENDER DISPATCHER ---------------- */
  function render() {
    clearInterval(timerInterval);

    if (route === 'home') return renderHome();
    if (route === 'library') {
      return window.QL.studio.renderLibrary(app, {
        onEdit: (id) => navigate('studio', id),
        onHost: (quiz) => startHosting(quiz)
      });
    }
    if (route === 'studio') {
      return window.QL.studio.renderStudio(app, editQuizId, {
        onCancel: () => navigate('library'),
        onHost: (quiz) => startHosting(quiz)
      });
    }
    if (route === 'host' && S) return renderHost();
    if (route === 'player' && S) return renderPlayer();
  }

  /* ---------------- HOST VIEWS ---------------- */
  function renderHost() {
    const s = S;
    if (s.phase === 'lobby') {
      const baseUrl = location.href.split('?')[0].split('#')[0];
      const joinUrl = baseUrl + '?join=' + s.code;
      const qrSvg = window.QL.qrSvg(joinUrl, 168);

      app.innerHTML = `
        <div id="react-layer" class="react-layer"></div>
        <div class="lobby-grid">
          <div class="card center lobby-code-card">
            <span class="pill">${s.netMode === 'ws' ? '🛰️ ' + t('connModeWS') : (s.netMode === 'local' ? '💻 Local Tab Mode' : '⚡ ' + t('connModeP2P'))}</span>
            <p class="muted" style="margin-top:8px">${t('lobbyOpen')}</p>
            <div class="code">${esc(s.code)}</div>
            <div class="qr-wrap">${qrSvg}</div>
            <p class="muted sm-hint">${t('scanQr')}</p>
            <div class="share-row">
              <span class="link muted">${esc(joinUrl)}</span>
              <button class="sec sm" id="copyLink">${t('copyLink')}</button>
            </div>
            <p class="muted sm-hint">${t('keepOpen')}</p>
          </div>

          <div class="card lobby-right">
            <div class="lobby-quiz-head">
              <span class="qc-emoji">${esc(s.emoji)}</span>
              <div>
                <h2>${esc(s.title)}</h2>
                <span class="muted">${s.total} ${t('qsCount')} · ${pCountText(s.count)}</span>
              </div>
              <button class="sec sm" id="lockBtn">${s.settings.locked ? '🔒 ' + t('unlockRoom') : '🔓 ' + t('lockRoom')}</button>
            </div>

            <div class="settings-box">
              <h3>⚙️ ${t('settingsTitle')}</h3>
              <div class="settings-grid">
                <label class="set-item">
                  <span>${t('modeLabel')}</span>
                  <select id="set-mode">
                    <option value="classic" ${s.settings.mode === 'classic' ? 'selected' : ''}>${t('modeClassic')}</option>
                    <option value="teams" ${s.settings.mode === 'teams' ? 'selected' : ''}>${t('modeTeams')}</option>
                  </select>
                </label>
                ${s.settings.mode === 'teams' ? `
                  <label class="set-item">
                    <span>${t('teamsCountLabel')}</span>
                    <select id="set-teams">
                      ${[2, 3, 4].map(n => `<option value="${n}" ${s.settings.teamsCount === n ? 'selected' : ''}>${n}</option>`).join('')}
                    </select>
                  </label>
                ` : ''}
                <label class="set-chk"><input type="checkbox" id="set-shufQ" ${s.settings.shuffleQ ? 'checked' : ''}> ${t('shuffleQ')}</label>
                <label class="set-chk"><input type="checkbox" id="set-shufO" ${s.settings.shuffleOpts ? 'checked' : ''}> ${t('shuffleOpts')}</label>
                <label class="set-chk"><input type="checkbox" id="set-streak" ${s.settings.streakBonus ? 'checked' : ''}> ${t('streakBonus')}</label>
                <label class="set-chk"><input type="checkbox" id="set-auto" ${s.settings.autoAdvance ? 'checked' : ''}> ${t('autoAdvance')}</label>
              </div>
            </div>

            <div class="roster-wrap">
              ${s.count === 0 ? `<p class="muted center" style="padding:20px 0">${t('waitingPlayers')}</p>` : `
                <div class="chips">
                  ${s.roster.map(p => {
                    const teamTag = s.settings.mode === 'teams'
                      ? `<span class="team-dot" style="background:${window.QL.TEAMS[p.team % s.settings.teamsCount].color}"></span>`
                      : '';
                    return `<span class="player-chip">${teamTag}${esc(p.avatar)} ${esc(p.name)} <button type="button" class="kick-x" data-kick="${esc(p.id)}" title="${t('kickTitle')}">×</button></span>`;
                  }).join('')}
                </div>
              `}
            </div>

            <button class="pri full" id="hs" ${s.count ? '' : 'disabled'}>
              ${s.count ? t('startBtn') + ` (${s.count})` : t('needPlayer')}
            </button>
          </div>
        </div>
      `;

      $('#copyLink').onclick = () => {
        navigator.clipboard?.writeText(joinUrl).then(() => {
          $('#copyLink').textContent = t('copied');
          setTimeout(() => { if ($('#copyLink')) $('#copyLink').textContent = t('copyLink'); }, 1800);
        }).catch(() => {});
      };
      $('#lockBtn').onclick = () => window.QL.engine.updateSettings({ locked: !s.settings.locked });
      $('#set-mode').onchange = e => window.QL.engine.updateSettings({ mode: e.target.value });
      if ($('#set-teams')) $('#set-teams').onchange = e => window.QL.engine.updateSettings({ teamsCount: +e.target.value });
      $('#set-shufQ').onchange = e => window.QL.engine.updateSettings({ shuffleQ: e.target.checked });
      $('#set-shufO').onchange = e => window.QL.engine.updateSettings({ shuffleOpts: e.target.checked });
      $('#set-streak').onchange = e => window.QL.engine.updateSettings({ streakBonus: e.target.checked });
      $('#set-auto').onchange = e => window.QL.engine.updateSettings({ autoAdvance: e.target.checked });

      app.querySelectorAll('[data-kick]').forEach(b => {
        b.onclick = () => window.QL.engine.kickPlayer(b.dataset.kick);
      });
      $('#hs').onclick = () => window.QL.engine.start();
      return;
    }

    if (s.phase === 'prep') {
      const badge = s.pts === 'double' ? `<span class="pill warn">${t('doublePts')}</span>` : (s.pts === 'poll' ? `<span class="pill">${t('pollMode')}</span>` : '');
      app.innerHTML = `
        <div class="card center prep-card">
          <p class="muted">${t('questionWord')} ${s.qi + 1} ${t('ofWord')} ${s.total}</p>
          ${badge}
          <h1 class="big-hype">${t('getReady')}</h1>
          <div class="prep-bar"></div>
        </div>
      `;
      return;
    }

    if (s.phase === 'question' || s.phase === 'reveal') {
      const rv = s.phase === 'reveal';
      const q = s.q;
      const badge = q.pts === 'double' ? `<span class="pill warn">${t('doublePts')}</span>` : (q.pts === 'poll' ? `<span class="pill">${t('pollMode')}</span>` : '');

      let optsHtml = '';
      if (q.type === 'text') {
        optsHtml = rv
          ? `<div class="text-reveal"><span class="muted">${t('correctAnswerIs')}</span><h2>${esc((s.accepted || []).join(' / '))}</h2></div>`
          : `<div class="card center muted" style="margin:18px 0">⌨️ ${t('typeHint')}</div>`;
      } else {
        const totalVotes = (s.counts || []).reduce((a, b) => a + b, 0) || 1;
        optsHtml = `<div class="opts ${q.o.length === 2 ? 'opts-2' : ''}">
          ${q.o.map((o, i) => {
            const isCorrect = q.type === 'ms' ? (s.corrects || []).includes(i) : i === s.correct;
            const cls = rv ? (isCorrect ? 'on' : 'dim') : '';
            const count = (s.counts && s.counts[i]) || 0;
            const pct = Math.round((count / totalVotes) * 100);
            return `
              <div class="o c${i} ${cls}">
                <div class="o-inner"><span>${SH[i]} ${esc(o)}</span>${rv ? `<span class="o-cnt">${count} (${pct}%)</span>` : ''}</div>
                ${rv ? `<div class="o-bar"><div class="o-fill" style="width:${pct}%"></div></div>` : ''}
              </div>
            `;
          }).join('')}
        </div>`;
      }

      app.innerHTML = `
        <div id="react-layer" class="react-layer"></div>
        <div class="card live-card">
          <div class="row">
            <span class="pill">${t('questionWord')} ${s.qi + 1} / ${s.total}</span>
            ${badge}
            <b></b>
            ${rv ? '' : `<div class="timer-wrap"><span class="tn" id="tn"></span></div>`}
          </div>
          ${rv ? '' : `<div class="time-bar-track"><div class="time-bar-fill" id="tbar"></div></div>`}
          <h1 class="q-title">${esc(q.p)}</h1>
          ${optsHtml}
          ${rv && s.exp ? `<div class="exp-box">💡 ${esc(s.exp)}</div>` : ''}
          <div class="row">
            <span class="muted">${s.answered} / ${s.count} ${t('answeredWord')}</span>
            <b></b>
            ${rv && s.qi + 1 < s.total ? `<button class="sec sm" id="hEnd">${t('endEarly')}</button>` : ''}
            <button class="pri" id="hn">${rv ? (s.qi + 1 >= s.total ? t('finalResults') : t('nextQuestion')) : t('showAnswer')}</button>
          </div>
        </div>
        ${rv ? renderLeaderboardsHtml(s) : ''}
      `;

      $('#hn').onclick = () => window.QL.engine.next();
      if ($('#hEnd')) $('#hEnd').onclick = () => window.QL.engine.endEarly();
      if (!rv) startCountdownTimer(q.t * 1000, true);
      return;
    }

    // Phase: 'over' (Podium + Full Rankings + Analytics)
    renderOverView(s, true);
  }

  function renderLeaderboardsHtml(s) {
    const teamHtml = s.settings && s.settings.mode === 'teams' && s.teams
      ? `<div class="card"><h3>🏆 ${t('teamStandings')}</h3>
          <div class="teams-row">
            ${s.teams.map(tm => `
              <div class="team-pill" style="border-color:${tm.color}">
                <span>${tm.icon} <b>${esc(tm.name)}</b></span>
                <b>${tm.score}</b>
              </div>
            `).join('')}
          </div>
        </div>`
      : '';

    return `
      ${teamHtml}
      <div class="card">
        <h3>🏅 ${t('topPlayers')}</h3>
        ${boardRows(s.top, 5)}
      </div>
    `;
  }

  function boardRows(top, limit = 10) {
    return (top || []).slice(0, limit).map((p, i) => {
      const medal = ['🥇', '🥈', '🥉'][i] || `#${i + 1}`;
      const delta = p.delta > 0 ? `<span class="delta up">▲${p.delta}</span>` : (p.delta < 0 ? `<span class="delta dn">▼${Math.abs(p.delta)}</span>` : '');
      const streak = p.streak > 1 ? `<span class="streak">🔥${p.streak}</span>` : '';
      return `
        <div class="pod">
          <span class="pod-rank">${medal}</span>
          <span class="pod-name">${esc(p.avatar || '🎮')} <b>${esc(p.name)}</b> ${streak} ${delta}</span>
          <b class="pod-score">${p.score}</b>
        </div>
      `;
    }).join('');
  }

  function renderOverView(s, isHost) {
    const top3 = (s.top || []).slice(0, 3);
    const order = [top3[1], top3[0], top3[2]].filter(Boolean);
    const placeMap = top3[1] ? [2, 1, 3] : [1];
    const me = !isHost ? ((s.ranks || {})[myId] || null) : null;

    const teamBanner = s.settings && s.settings.mode === 'teams' && s.teams && s.teams[0]
      ? `<div class="winner-team" style="border-color:${s.teams[0].color}">
          ${s.teams[0].icon} ${t('winningTeam')}: <strong>${esc(s.teams[0].name)}</strong> (${s.teams[0].score})
        </div>`
      : '';

    const analyticsHtml = isHost && s.analytics && s.analytics.length
      ? `<div class="card">
          <div class="row"><h3>📊 ${t('qBreakdown')}</h3><b></b><button class="sec sm" id="csvBtn">⬇ ${t('exportCsv')}</button></div>
          <div class="ana-list">
            ${s.analytics.map(a => {
              const acc = a.totalPlayers ? Math.round((a.correctCount / a.totalPlayers) * 100) : 0;
              return `
                <div class="ana-item">
                  <div class="ana-top"><b>Q${a.qi + 1}. ${esc(a.prompt)}</b><span class="muted">${a.pts === 'poll' ? t('ptsPoll') : `${acc}% ${t('accuracyLabel')}`} · ${(a.avgTimeMs / 1000).toFixed(1)}s ${t('avgTimeLabel')}</span></div>
                  <div class="ana-track"><div class="ana-fill" style="width:${acc}%"></div></div>
                </div>
              `;
            }).join('')}
          </div>
        </div>`
      : '';

    app.innerHTML = `
      <div class="card center over-card">
        <h1>🏆 ${t('gameOver')}</h1>
        <p class="muted">${esc(s.title)}</p>
        ${!isHost && me ? `<div class="my-final"><h2>${t('rankLabel')} #${me.r} / ${s.count}</h2><p>${t('scoreLabel')}: <b>${me.s}</b> · ${t('correctCol')}: <b>${me.correctCount}/${s.total}</b> · ${t('bestStreakCol')}: <b>🔥${me.bestStreak}</b></p></div>` : ''}
        ${teamBanner}
        <div class="podium">
          ${order.map((p, idx) => {
            const rank = top3.length >= 2 ? placeMap[idx] : 1;
            return `
              <div class="podium-col rank-${rank}">
                <div class="p-av">${esc(p.avatar || '🏆')}</div>
                <div class="p-nm">${esc(p.name)}</div>
                <div class="p-sc">${p.score}</div>
                <div class="p-pedestal">${rank === 1 ? '🥇' : (rank === 2 ? '🥈' : '🥉')}</div>
              </div>
            `;
          }).join('')}
        </div>
        <div class="btn-row" style="justify-content:center;margin-top:18px">
          ${isHost ? `<button class="pri" id="playAgainBtn">${t('playAgain')}</button>` : ''}
          <button class="${isHost ? 'sec' : 'pri'}" id="homeBtn">${t('backHome')}</button>
        </div>
      </div>

      <div class="card">
        <h3>🏅 ${t('fullLeaderboard')}</h3>
        ${boardRows(s.top, 50)}
      </div>
      ${analyticsHtml}
    `;

    if ($('#playAgainBtn')) $('#playAgainBtn').onclick = () => window.QL.engine.playAgain();
    $('#homeBtn').onclick = () => { cleanupSession(); navigate('home'); };
    if ($('#csvBtn')) {
      $('#csvBtn').onclick = () => {
        const csv = window.QL.engine.exportCsv();
        const blob = new Blob([csv], { type: 'text/csv' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = `quiz-results-${s.code || 'export'}.csv`;
        a.click();
        URL.revokeObjectURL(a.href);
      };
    }
  }

  /* ---------------- PLAYER VIEWS ---------------- */
  function renderPlayer() {
    const s = S;
    const me = (s.results || {})[myId] || (s.ranks || {})[myId] || null;
    const teamIdx = me && me.team != null ? me.team : null;
    const teamObj = (s.settings && s.settings.mode === 'teams' && teamIdx != null)
      ? window.QL.TEAMS[teamIdx % s.settings.teamsCount]
      : null;

    if (s.phase === 'lobby') {
      const myRoster = (s.roster || []).find(r => r.id === myId);
      const myTeam = (s.settings && s.settings.mode === 'teams' && myRoster)
        ? window.QL.TEAMS[myRoster.team % s.settings.teamsCount]
        : null;

      app.innerHTML = `
        <div class="card center">
          <div class="big-av">${esc(myAvatar)}</div>
          <h1>${t('youreIn')}</h1>
          ${myTeam ? `<div class="team-badge" style="background:${myTeam.color}">${myTeam.icon} ${t('yourTeam')}: ${esc(myTeam.name)}</div>` : ''}
          <p class="muted">${t('waitingHost')}</p>
          <p class="pill">${pCountText(s.count)}</p>
          ${reactionBarHtml()}
        </div>
      `;
      bindReactions();
      return;
    }

    if (s.phase === 'prep') {
      app.innerHTML = `
        <div class="card center prep-card">
          <p class="muted">${t('questionWord')} ${s.qi + 1} ${t('ofWord')} ${s.total}</p>
          <h1 class="big-hype">${t('getReady')}</h1>
        </div>
      `;
      return;
    }

    if (s.phase === 'question') {
      const q = s.q;
      if (picked != null) {
        app.innerHTML = `
          <div class="card center lock-card">
            <div class="big-av">🔒</div>
            <h2>${t('lockedIn')}</h2>
            <p class="muted">${t('questionWord')} ${s.qi + 1} / ${s.total}</p>
          </div>
        `;
        return;
      }

      let body = '';
      if (q.type === 'mc' || q.type === 'tf') {
        body = `<div class="opts ${q.o.length === 2 ? 'opts-2' : ''}">
          ${q.o.map((o, i) => `<button class="o c${i}" data-pick="${i}">${SH[i]} ${esc(o)}</button>`).join('')}
        </div>`;
      } else if (q.type === 'ms') {
        body = `
          <p class="muted center">${t('multiHint')}</p>
          <div class="opts">
            ${q.o.map((o, i) => `<button class="o c${i} ${multiPicked.has(i) ? 'on' : ''}" data-mpick="${i}">${multiPicked.has(i) ? '☑' : '☐'} ${SH[i]} ${esc(o)}</button>`).join('')}
          </div>
          <button class="pri full" id="submitMulti" ${multiPicked.size ? '' : 'disabled'}>${t('submitAns')}</button>
        `;
      } else if (q.type === 'text') {
        body = `
          <p class="muted">${t('typeHint')}</p>
          <input id="txtAns" maxlength="80" autocomplete="off" autofocus placeholder="${esc(t('typeHint'))}">
          <button class="pri full" id="submitTxt">${t('submitAns')}</button>
        `;
      }

      app.innerHTML = `
        <div class="card">
          <div class="row">
            <span class="pill">${s.qi + 1}/${s.total}</span>
            <b></b>
            <span class="tn" id="tn"></span>
          </div>
          <div class="time-bar-track"><div class="time-bar-fill" id="tbar"></div></div>
          <h2 class="q-title">${esc(q.p)}</h2>
          ${body}
        </div>
      `;

      startCountdownTimer(q.t * 1000, false);

      app.querySelectorAll('[data-pick]').forEach(b => {
        b.onclick = () => {
          if (picked != null) return;
          picked = +b.dataset.pick;
          window.QL.audio.lock();
          playerTransport.send({ t: 'answer', ans: picked });
          render();
        };
      });

      app.querySelectorAll('[data-mpick]').forEach(b => {
        b.onclick = () => {
          const i = +b.dataset.mpick;
          if (multiPicked.has(i)) multiPicked.delete(i);
          else multiPicked.add(i);
          window.QL.audio.click();
          render();
        };
      });

      if ($('#submitMulti')) {
        $('#submitMulti').onclick = () => {
          if (!multiPicked.size || picked != null) return;
          picked = [...multiPicked];
          window.QL.audio.lock();
          playerTransport.send({ t: 'answer', ans: picked });
          render();
        };
      }

      if ($('#submitTxt')) {
        const sendTxt = () => {
          const val = $('#txtAns').value.trim();
          if (!val || picked != null) return;
          picked = val;
          window.QL.audio.lock();
          playerTransport.send({ t: 'answer', ans: val });
          render();
        };
        $('#submitTxt').onclick = sendTxt;
        $('#txtAns').onkeydown = e => { if (e.key === 'Enter') sendTxt(); };
      }
      return;
    }

    if (s.phase === 'reveal') {
      const isPoll = s.q && s.q.pts === 'poll';
      const ok = me && me.ok;
      const partial = me && me.partial;
      let icon = '❌';
      let headline = t('wrongAns');
      let cls = 'rev-bad';

      if (isPoll) {
        icon = picked == null ? '⏰' : '🗳️';
        headline = picked == null ? t('timesUp') : t('pollRecorded');
        cls = 'rev-neutral';
      } else if (ok) {
        icon = '✅';
        headline = t('rightAns');
        cls = 'rev-ok';
      } else if (partial) {
        icon = '✨';
        headline = t('partialAns');
        cls = 'rev-ok';
      } else if (picked == null) {
        icon = '⏰';
        headline = t('timesUp');
      }

      let correctText = '';
      if (!isPoll && s.q) {
        if (s.q.type === 'mc' || s.q.type === 'tf') correctText = s.q.o[s.correct];
        else if (s.q.type === 'ms') correctText = (s.corrects || []).map(i => s.q.o[i]).join(', ');
        else if (s.q.type === 'text') correctText = (s.accepted || []).join(' / ');
      }

      app.innerHTML = `
        <div class="card center ${cls}">
          <div class="big-av">${icon}</div>
          <h1>${headline}</h1>
          ${me && me.g > 0 ? `<h2 class="pts-gain">+${me.g}</h2>` : ''}
          ${correctText ? `<p class="muted">${t('correctAnswerIs')} <b>${esc(correctText)}</b></p>` : ''}
          ${s.exp ? `<div class="exp-box">💡 ${esc(s.exp)}</div>` : ''}
          <div class="stat-pills">
            <span class="pill">${t('scoreLabel')}: <b>${me ? me.s : 0}</b></span>
            <span class="pill">${t('rankLabel')}: <b>#${me ? me.r : '-'}</b></span>
            ${me && me.st > 1 ? `<span class="pill warn">🔥 ${me.st}</span>` : ''}
          </div>
          ${teamObj ? `<p class="muted">${teamObj.icon} ${esc(teamObj.name)}</p>` : ''}
          ${reactionBarHtml()}
        </div>
      `;
      bindReactions();
      return;
    }

    renderOverView(s, false);
  }

  function reactionBarHtml() {
    return `
      <div class="react-bar">
        <span class="muted sm-hint">${t('reactHint')}</span>
        <div class="react-btns">
          ${['👏', '🔥', '🎉', '😂', '🤯', '❤️'].map(e => `<button type="button" class="react-btn" data-react="${e}">${e}</button>`).join('')}
        </div>
      </div>
    `;
  }

  function bindReactions() {
    app.querySelectorAll('[data-react]').forEach(b => {
      b.onclick = () => {
        window.QL.audio.click();
        playerTransport && playerTransport.send({ t: 'react', emoji: b.dataset.react });
        b.classList.add('pop');
        setTimeout(() => b.classList.remove('pop'), 220);
      };
    });
  }

  function spawnFloatingReaction(emoji, name) {
    const layer = $('#react-layer');
    if (!layer) return;
    const el = document.createElement('div');
    el.className = 'float-react';
    el.style.left = (10 + Math.random() * 80) + '%';
    el.innerHTML = `<span>${emoji}</span><small>${esc(name)}</small>`;
    layer.appendChild(el);
    setTimeout(() => el.remove(), 2200);
  }

  function startCountdownTimer(totalMs, playTicks) {
    const tn = $('#tn');
    const bar = $('#tbar');
    const tick = () => {
      const rem = Math.max(0, endAt - Date.now());
      const sec = Math.ceil(rem / 1000);
      if (tn) {
        tn.textContent = sec;
        tn.classList.toggle('urgent', sec <= 5);
      }
      if (bar) {
        bar.style.width = Math.max(0, Math.min(100, (rem / totalMs) * 100)) + '%';
      }
      if (playTicks && sec !== lastTickSec && sec > 0 && sec <= 5) {
        lastTickSec = sec;
        window.QL.audio.tick(sec <= 3);
      }
    };
    tick();
    timerInterval = setInterval(tick, 100);
  }

  /* ---------------- BOOT ---------------- */
  $('#langBtn').onclick = () => {
    window.QL.lang = window.QL.lang === 'en' ? 'si' : 'en';
    localStorage.setItem('ql_lang', window.QL.lang);
    updateHeader();
    render();
  };

  $('#soundBtn').onclick = () => {
    window.QL.audio.toggle();
    updateHeader();
  };

  $('#themeBtn').onclick = () => {
    theme = theme === 'auto' ? 'dark' : (theme === 'dark' ? 'light' : 'auto');
    localStorage.setItem('ql_theme', theme);
    applyTheme();
  };

  $('#logoHome').onclick = () => {
    if (role) cleanupSession();
    navigate('home');
  };

  updateHeader();
  render();
})();
