// Visual Quiz Studio & Quiz Library UI
window.QL = window.QL || {};

(function () {
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));

  const EMOJIS = ['🎯', '🦁', '💻', '🚀', '🧠', '🎉', '📚', '🌍', '⚡', '🏆', '🔬', '🎨'];
  const CATEGORIES = ['General', 'Technology', 'Science', 'Geography', 'History', 'Math', 'Fun', 'Custom'];

  function t(k) { return window.QL.t(k); }

  function renderLibrary(root, cbs) {
    const saved = window.QL.store.getSaved();
    const templates = window.QL.store.getTemplates();

    root.innerHTML = `
      <div class="page-head">
        <div>
          <h1>${t('libTitle')}</h1>
        </div>
        <div class="btn-row">
          <button class="sec" id="lib-imp-text">${t('importText')}</button>
          <label class="btn sec" for="lib-imp-json" style="cursor:pointer">${t('importJson')}</label>
          <input type="file" id="lib-imp-json" accept=".json,application/json" hidden>
          <button class="pri" id="lib-new">${t('createNew')}</button>
        </div>
      </div>
      <div id="lib-toast" class="toast" hidden></div>

      <section class="lib-sec">
        <h2 class="sec-title">${t('myQuizzes')} (${saved.length})</h2>
        ${saved.length === 0 ? `<div class="card muted center">${t('noSaved')}</div>` : `
          <div class="quiz-grid">
            ${saved.map(q => quizCard(q, true)).join('')}
          </div>
        `}
      </section>

      <section class="lib-sec">
        <h2 class="sec-title">${t('templatesTitle')}</h2>
        <div class="quiz-grid">
          ${templates.map(q => quizCard(q, false)).join('')}
        </div>
      </section>
    `;

    const showToast = (msg, isErr = false) => {
      const el = root.querySelector('#lib-toast');
      el.textContent = msg;
      el.className = 'toast ' + (isErr ? 'toast-err' : 'toast-ok');
      el.hidden = false;
      setTimeout(() => { el.hidden = true; }, 3200);
    };

    root.querySelector('#lib-new').onclick = () => cbs.onEdit(null);
    root.querySelector('#lib-imp-text').onclick = () => openBulkModal(null, (quiz) => {
      const savedQ = window.QL.store.save(quiz);
      if (savedQ) cbs.onEdit(savedQ.id);
    });

    root.querySelector('#lib-imp-json').onchange = async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        const items = Array.isArray(parsed) ? parsed : [parsed];
        let count = 0;
        for (const item of items) {
          delete item.id;
          if (window.QL.store.save(item)) count++;
        }
        if (count > 0) {
          renderLibrary(root, cbs);
          showToast(t('importedOk'));
        } else {
          showToast(t('importErr'), true);
        }
      } catch {
        showToast(t('importErr'), true);
      }
    };

    root.querySelectorAll('[data-act]').forEach(btn => {
      btn.onclick = () => {
        const act = btn.dataset.act;
        const id = btn.dataset.id;
        const quiz = window.QL.store.getById(id);
        if (!quiz) return;
        if (act === 'host') cbs.onHost(quiz);
        else if (act === 'edit') cbs.onEdit(id);
        else if (act === 'dup') {
          const copy = window.QL.store.duplicate(id);
          if (copy) cbs.onEdit(copy.id);
        } else if (act === 'export') {
          downloadJson(quiz);
        } else if (act === 'del') {
          if (confirm(t('confirmDelete'))) {
            window.QL.store.remove(id);
            renderLibrary(root, cbs);
          }
        }
      };
    });
  }

  function quizCard(q, isOwned) {
    return `
      <div class="card quiz-card">
        <div class="qc-top">
          <span class="qc-emoji">${esc(q.emoji || '🎯')}</span>
          <span class="badge">${esc(q.category || 'Custom')}</span>
          <span class="muted">${q.qs.length} ${t('qsCount')}</span>
        </div>
        <h3>${esc(q.title)}</h3>
        <p class="muted qc-desc">${esc(q.description || '')}</p>
        <div class="qc-actions">
          <button class="pri sm" data-act="host" data-id="${esc(q.id)}">${t('hostNow')}</button>
          ${isOwned
            ? `<button class="sec sm" data-act="edit" data-id="${esc(q.id)}">${t('editBtn')}</button>
               <button class="sec sm" data-act="dup" data-id="${esc(q.id)}" title="${t('duplicate')}">📋</button>
               <button class="sec sm" data-act="export" data-id="${esc(q.id)}" title="${t('exportJson')}">⬇</button>
               <button class="sec sm danger" data-act="del" data-id="${esc(q.id)}" title="${t('deleteBtn')}">🗑</button>`
            : `<button class="sec sm" data-act="dup" data-id="${esc(q.id)}">${t('duplicate')} & ${t('editBtn')}</button>`
          }
        </div>
      </div>
    `;
  }

  function downloadJson(quiz) {
    const blob = new Blob([JSON.stringify(quiz, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = (quiz.title || 'quiz').toLowerCase().replace(/[^a-z0-9]+/g, '-') + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  }

  /* ---------------- Visual Quiz Studio ---------------- */
  function createEmptyQuestion(type = 'mc') {
    if (type === 'tf') {
      return { type: 'tf', p: '', o: [t('trueText'), t('falseText')], c: 0, t: 15, pts: 'standard', exp: '' };
    }
    if (type === 'ms') {
      return { type: 'ms', p: '', o: ['', '', '', ''], cs: [0], t: 20, pts: 'standard', exp: '' };
    }
    if (type === 'text') {
      return { type: 'text', p: '', accepted: [''], t: 25, pts: 'standard', exp: '' };
    }
    return { type: 'mc', p: '', o: ['', '', '', ''], c: 0, t: 20, pts: 'standard', exp: '' };
  }

  function renderStudio(root, quizId, cbs) {
    let draft;
    const existing = quizId ? window.QL.store.getById(quizId) : null;
    if (existing) {
      draft = JSON.parse(JSON.stringify(existing));
      if (draft.builtin) delete draft.id; // Cloning template on save
    } else {
      draft = {
        title: '',
        description: '',
        category: 'General',
        emoji: '🎯',
        qs: [createEmptyQuestion('mc')]
      };
    }

    function draw() {
      root.innerHTML = `
        <div class="page-head">
          <h1>${t('studioTitle')}</h1>
          <div class="btn-row">
            <button class="sec" id="st-bulk">${t('importText')}</button>
            <button class="sec" id="st-cancel">${t('cancel')}</button>
            <button class="sec" id="st-save">${t('saveQuiz')}</button>
            <button class="pri" id="st-host">${t('saveAndHost')}</button>
          </div>
        </div>
        <div id="st-err" class="err" role="alert"></div>
        <div id="st-toast" class="toast toast-ok" hidden></div>

        <div class="card studio-meta">
          <div class="meta-row">
            <div class="emoji-pick">
              <label>${t('emojiLabel')}</label>
              <select id="st-emoji">
                ${EMOJIS.map(em => `<option value="${em}" ${draft.emoji === em ? 'selected' : ''}>${em}</option>`).join('')}
              </select>
            </div>
            <div class="flex1">
              <label for="st-title">${t('quizTitleLabel')}</label>
              <input id="st-title" maxlength="80" placeholder="${esc(t('quizTitlePlaceholder'))}" value="${esc(draft.title)}">
            </div>
            <div>
              <label for="st-cat">${t('categoryLabel')}</label>
              <select id="st-cat">
                ${CATEGORIES.map(c => `<option value="${c}" ${draft.category === c ? 'selected' : ''}>${c}</option>`).join('')}
              </select>
            </div>
          </div>
          <label for="st-desc">${t('quizDescLabel')}</label>
          <input id="st-desc" maxlength="160" placeholder="${esc(t('quizDescPlaceholder'))}" value="${esc(draft.description || '')}">
        </div>

        <div id="st-qs">
          ${draft.qs.map((q, idx) => renderQuestionEditor(q, idx, draft.qs.length)).join('')}
        </div>

        <div class="center" style="margin:20px 0">
          <button class="pri" id="st-add">${t('addQuestion')}</button>
        </div>
      `;

      bindStudioEvents();
    }

    function renderQuestionEditor(q, idx, total) {
      let body = '';
      if (q.type === 'mc' || q.type === 'ms') {
        const isMs = q.type === 'ms';
        body = `
          <p class="muted sm-hint">${isMs ? t('correctHintMS') : t('correctHintMC')}</p>
          <div class="st-opts">
            ${[0, 1, 2, 3].map(oi => {
              const checked = isMs ? (q.cs || []).includes(oi) : q.c === oi;
              return `
                <div class="st-opt-row c${oi}-border">
                  <button type="button" class="chk-btn ${checked ? 'on' : ''}" data-qi="${idx}" data-oi="${oi}" aria-label="Mark option ${oi + 1} correct">
                    ${checked ? '✓' : ''}
                  </button>
                  <input type="text" class="opt-inp" data-qi="${idx}" data-oi="${oi}" maxlength="120" placeholder="${esc(t('optPlaceholder'))} ${oi + 1}" value="${esc((q.o && q.o[oi]) || '')}">
                </div>
              `;
            }).join('')}
          </div>
        `;
      } else if (q.type === 'tf') {
        body = `
          <div class="st-opts">
            ${[0, 1].map(oi => `
              <button type="button" class="tf-pick ${q.c === oi ? 'on' : ''}" data-qi="${idx}" data-oi="${oi}">
                ${oi === 0 ? '▲ ' + t('trueText') : '◆ ' + t('falseText')} ${q.c === oi ? '✓' : ''}
              </button>
            `).join('')}
          </div>
        `;
      } else if (q.type === 'text') {
        body = `
          <label>${t('acceptedLabel')}</label>
          <input type="text" class="txt-acc" data-qi="${idx}" placeholder="${esc(t('acceptedPlaceholder'))}" value="${esc((q.accepted || []).join(', '))}">
        `;
      }

      return `
        <div class="card q-editor" data-qidx="${idx}">
          <div class="qe-head">
            <strong>${t('qLabel')} ${idx + 1}</strong>
            <div class="qe-controls">
              <select class="q-type-sel" data-qi="${idx}" aria-label="${t('qTypeLabel')}">
                <option value="mc" ${q.type === 'mc' ? 'selected' : ''}>${t('typeMC')}</option>
                <option value="tf" ${q.type === 'tf' ? 'selected' : ''}>${t('typeTF')}</option>
                <option value="ms" ${q.type === 'ms' ? 'selected' : ''}>${t('typeMS')}</option>
                <option value="text" ${q.type === 'text' ? 'selected' : ''}>${t('typeText')}</option>
              </select>
              <select class="q-time-sel" data-qi="${idx}" aria-label="${t('timeLabel')}">
                ${[5, 10, 15, 20, 30, 45, 60].map(sec => `<option value="${sec}" ${Number(q.t) === sec ? 'selected' : ''}>${sec}s</option>`).join('')}
              </select>
              <select class="q-pts-sel" data-qi="${idx}" aria-label="${t('pointsLabel')}">
                <option value="standard" ${q.pts === 'standard' ? 'selected' : ''}>${t('ptsStandard')}</option>
                <option value="double" ${q.pts === 'double' ? 'selected' : ''}>${t('ptsDouble')}</option>
                <option value="poll" ${q.pts === 'poll' ? 'selected' : ''}>${t('ptsPoll')}</option>
              </select>
              ${idx > 0 ? `<button type="button" class="sec sm q-up" data-qi="${idx}">↑</button>` : ''}
              ${idx < total - 1 ? `<button type="button" class="sec sm q-dn" data-qi="${idx}">↓</button>` : ''}
              <button type="button" class="sec sm q-dup" data-qi="${idx}" title="${t('duplicate')}">📋</button>
              ${total > 1 ? `<button type="button" class="sec sm danger q-del" data-qi="${idx}" title="${t('deleteBtn')}">✕</button>` : ''}
            </div>
          </div>
          <input type="text" class="q-prompt" data-qi="${idx}" maxlength="240" placeholder="${esc(t('qPlaceholder'))}" value="${esc(q.p)}">
          ${body}
          <input type="text" class="q-exp" data-qi="${idx}" maxlength="240" placeholder="${esc(t('explainPlaceholder'))}" value="${esc(q.exp || '')}">
        </div>
      `;
    }

    function syncInputs() {
      const titleEl = root.querySelector('#st-title');
      if (titleEl) draft.title = titleEl.value;
      const descEl = root.querySelector('#st-desc');
      if (descEl) draft.description = descEl.value;
      const catEl = root.querySelector('#st-cat');
      if (catEl) draft.category = catEl.value;
      const emEl = root.querySelector('#st-emoji');
      if (emEl) draft.emoji = emEl.value;

      root.querySelectorAll('.q-prompt').forEach(el => {
        draft.qs[+el.dataset.qi].p = el.value;
      });
      root.querySelectorAll('.q-exp').forEach(el => {
        draft.qs[+el.dataset.qi].exp = el.value;
      });
      root.querySelectorAll('.opt-inp').forEach(el => {
        const q = draft.qs[+el.dataset.qi];
        if (!q.o) q.o = ['', '', '', ''];
        q.o[+el.dataset.oi] = el.value;
      });
      root.querySelectorAll('.txt-acc').forEach(el => {
        draft.qs[+el.dataset.qi].accepted = el.value.split(',').map(s => s.trim());
      });
    }

    function bindStudioEvents() {
      root.querySelector('#st-cancel').onclick = () => cbs.onCancel();
      root.querySelector('#st-bulk').onclick = () => {
        syncInputs();
        openBulkModal(draft.title, (parsed) => {
          if (!draft.title.trim()) draft.title = parsed.title;
          draft.qs = parsed.qs;
          draw();
        });
      };

      root.querySelector('#st-add').onclick = () => {
        syncInputs();
        draft.qs.push(createEmptyQuestion('mc'));
        draw();
      };

      root.querySelectorAll('.q-type-sel').forEach(sel => {
        sel.onchange = () => {
          syncInputs();
          const i = +sel.dataset.qi;
          const old = draft.qs[i];
          const fresh = createEmptyQuestion(sel.value);
          fresh.p = old.p;
          fresh.t = old.t;
          fresh.pts = old.pts;
          fresh.exp = old.exp;
          draft.qs[i] = fresh;
          draw();
        };
      });

      root.querySelectorAll('.q-time-sel').forEach(sel => {
        sel.onchange = () => { draft.qs[+sel.dataset.qi].t = +sel.value; };
      });
      root.querySelectorAll('.q-pts-sel').forEach(sel => {
        sel.onchange = () => { draft.qs[+sel.dataset.qi].pts = sel.value; };
      });

      root.querySelectorAll('.chk-btn').forEach(btn => {
        btn.onclick = () => {
          syncInputs();
          const qi = +btn.dataset.qi;
          const oi = +btn.dataset.oi;
          const q = draft.qs[qi];
          if (q.type === 'ms') {
            q.cs = q.cs || [];
            if (q.cs.includes(oi)) {
              if (q.cs.length > 1) q.cs = q.cs.filter(x => x !== oi);
            } else {
              q.cs.push(oi);
            }
          } else {
            q.c = oi;
          }
          draw();
        };
      });

      root.querySelectorAll('.tf-pick').forEach(btn => {
        btn.onclick = () => {
          syncInputs();
          draft.qs[+btn.dataset.qi].c = +btn.dataset.oi;
          draw();
        };
      });

      root.querySelectorAll('.q-up').forEach(b => {
        b.onclick = () => {
          syncInputs();
          const i = +b.dataset.qi;
          [draft.qs[i - 1], draft.qs[i]] = [draft.qs[i], draft.qs[i - 1]];
          draw();
        };
      });
      root.querySelectorAll('.q-dn').forEach(b => {
        b.onclick = () => {
          syncInputs();
          const i = +b.dataset.qi;
          [draft.qs[i + 1], draft.qs[i]] = [draft.qs[i], draft.qs[i + 1]];
          draw();
        };
      });
      root.querySelectorAll('.q-dup').forEach(b => {
        b.onclick = () => {
          syncInputs();
          const i = +b.dataset.qi;
          draft.qs.splice(i + 1, 0, JSON.parse(JSON.stringify(draft.qs[i])));
          draw();
        };
      });
      root.querySelectorAll('.q-del').forEach(b => {
        b.onclick = () => {
          syncInputs();
          draft.qs.splice(+b.dataset.qi, 1);
          draw();
        };
      });

      const doSave = (andHost) => {
        syncInputs();
        const errEl = root.querySelector('#st-err');
        if (!draft.title.trim()) draft.title = 'Untitled Quiz';
        const clean = window.QL.store.save(draft);
        if (!clean || clean.qs.length !== draft.qs.length) {
          errEl.textContent = t('errBadQuiz');
          errEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
          return;
        }
        errEl.textContent = '';
        draft = clean;
        if (andHost) {
          cbs.onHost(clean);
        } else {
          const toast = root.querySelector('#st-toast');
          toast.textContent = t('savedToast');
          toast.hidden = false;
          setTimeout(() => { toast.hidden = true; }, 2500);
        }
      };

      root.querySelector('#st-save').onclick = () => doSave(false);
      root.querySelector('#st-host').onclick = () => doSave(true);
    }

    draw();
  }

  function openBulkModal(defaultTitle, onApply) {
    const sample = `${defaultTitle || 'Quick Quiz'}
What is the largest planet in our solar system? | Earth | Mars | Jupiter | Venus | 3 | 15
HTML stands for HyperText Markup Language? | True | False | - | - | 1 | 10`;

    const overlay = document.createElement('div');
    overlay.className = 'modal-backdrop';
    overlay.innerHTML = `
      <div class="card modal-box">
        <h2>${t('bulkTitle')}</h2>
        <p class="muted">${t('bulkHint')}</p>
        <textarea id="bulk-ta">${esc(sample)}</textarea>
        <p class="err" id="bulk-err"></p>
        <div class="btn-row" style="justify-content:flex-end">
          <button class="sec" id="bulk-cancel">${t('cancel')}</button>
          <button class="pri" id="bulk-go">${t('bulkApply')}</button>
        </div>
      </div>
    `;
    document.body.appendChild(overlay);

    overlay.querySelector('#bulk-cancel').onclick = () => overlay.remove();
    overlay.querySelector('#bulk-go').onclick = () => {
      const parsed = window.QL.store.parseBulkText(overlay.querySelector('#bulk-ta').value);
      if (!parsed) {
        overlay.querySelector('#bulk-err').textContent = t('errBadQuiz');
        return;
      }
      overlay.remove();
      onApply(parsed);
    };
  }

  window.QL.studio = {
    renderLibrary,
    renderStudio
  };
})();
