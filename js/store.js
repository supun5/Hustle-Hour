// Quiz templates, localStorage persistence, validation, bulk text parser, and import/export
window.QL = window.QL || {};

(function () {
  const STORAGE_KEY = 'ql_saved_quizzes_v1';

  const TEMPLATES = [
    {
      id: 'tpl-srilanka',
      title: 'Sri Lanka Explorer',
      description: 'History, geography, and culture of Sri Lanka.',
      category: 'Geography',
      emoji: '🦁',
      builtin: true,
      qs: [
        {
          type: 'mc',
          p: 'What is the administrative capital of Sri Lanka?',
          o: ['Colombo', 'Sri Jayawardenepura Kotte', 'Kandy', 'Galle'],
          c: 1,
          t: 20,
          pts: 'standard',
          exp: 'Sri Jayawardenepura Kotte has been the official administrative capital since 1982.'
        },
        {
          type: 'mc',
          p: 'Which is the national animal of Sri Lanka?',
          o: ['Elephant', 'Leopard', 'Grizzled giant squirrel', 'Sambar'],
          c: 2,
          t: 15,
          pts: 'standard',
          exp: 'The Sri Lankan grizzled giant squirrel (Dandulena) is recognized as the national animal.'
        },
        {
          type: 'tf',
          p: 'Sigiriya is an ancient rock fortress built during the reign of King Kashyapa.',
          o: ['True', 'False'],
          c: 0,
          t: 15,
          pts: 'standard',
          exp: 'King Kashyapa I (477–495 CE) chose Sigiriya as his capital and royal citadel.'
        },
        {
          type: 'mc',
          p: 'Sri Lanka is world-famous for exporting which drink?',
          o: ['Coffee', 'Ceylon Tea', 'Cocoa', 'Matcha'],
          c: 1,
          t: 15,
          pts: 'double',
          exp: 'Ceylon Tea is grown across regions like Nuwara Eliya, Dimbula, and Uva.'
        }
      ]
    },
    {
      id: 'tpl-tech',
      title: 'Web & IT Blitz',
      description: 'Essential computer science, web protocols, and coding trivia.',
      category: 'Technology',
      emoji: '💻',
      builtin: true,
      qs: [
        {
          type: 'mc',
          p: 'Which HTTP status code means "Not Found"?',
          o: ['200', '301', '404', '500'],
          c: 2,
          t: 15,
          pts: 'standard',
          exp: '404 indicates the server could not find the requested resource.'
        },
        {
          type: 'ms',
          p: 'Which of these are valid JavaScript primitive data types?',
          o: ['string', 'boolean', 'array', 'symbol'],
          cs: [0, 1, 3],
          t: 20,
          pts: 'standard',
          exp: 'Arrays are objects in JavaScript; string, boolean, and symbol are primitives.'
        },
        {
          type: 'tf',
          p: 'WebRTC allows browsers to communicate directly peer-to-peer without routing media through a central server.',
          o: ['True', 'False'],
          c: 0,
          t: 15,
          pts: 'standard',
          exp: 'WebRTC establishes direct peer-to-peer data and media channels after signaling.'
        },
        {
          type: 'text',
          p: 'What does HTML stand for? (4 words)',
          accepted: ['HyperText Markup Language', 'Hyper Text Markup Language'],
          t: 25,
          pts: 'double',
          exp: 'HTML stands for HyperText Markup Language.'
        }
      ]
    },
    {
      id: 'tpl-space',
      title: 'Cosmic Odyssey',
      description: 'Planets, stars, and space exploration milestones.',
      category: 'Science',
      emoji: '🚀',
      builtin: true,
      qs: [
        {
          type: 'mc',
          p: 'Which planet in our solar system has the most confirmed moons?',
          o: ['Jupiter', 'Saturn', 'Uranus', 'Neptune'],
          c: 1,
          t: 20,
          pts: 'standard',
          exp: 'Saturn leads with over 140 confirmed moons!'
        },
        {
          type: 'tf',
          p: 'A day on Venus is longer than a year on Venus.',
          o: ['True', 'False'],
          c: 0,
          t: 15,
          pts: 'standard',
          exp: 'Venus takes 243 Earth days to rotate once, and 225 Earth days to orbit the Sun.'
        },
        {
          type: 'mc',
          p: 'What was the name of the first artificial Earth satellite launched in 1957?',
          o: ['Voyager 1', 'Apollo 1', 'Sputnik 1', 'Explorer 1'],
          c: 2,
          t: 15,
          pts: 'double',
          exp: 'Sputnik 1 was launched by the Soviet Union on October 4, 1957.'
        },
        {
          type: 'mc',
          p: 'Which galaxy is closest to the Milky Way as our major spiral neighbor?',
          o: ['Andromeda', 'Triangulum', 'Whirlpool', 'Sombrero'],
          c: 0,
          t: 20,
          pts: 'standard',
          exp: 'The Andromeda Galaxy (M31) is about 2.5 million light-years away.'
        }
      ]
    },
    {
      id: 'tpl-icebreaker',
      title: 'Team Icebreaker & Polls',
      description: 'Fun quick-fire warm-up questions and live audience polls.',
      category: 'Fun',
      emoji: '🎉',
      builtin: true,
      qs: [
        {
          type: 'mc',
          p: 'Which superpower would you pick for a week?',
          o: ['Teleportation', 'Time Pause', 'Invisibility', 'Mind Reading'],
          c: 0,
          t: 15,
          pts: 'poll',
          exp: 'Pure poll — everyone gets to share their pick!'
        },
        {
          type: 'tf',
          p: 'Coffee is better than tea for late-night studying.',
          o: ['True', 'False'],
          c: 0,
          t: 12,
          pts: 'poll'
        },
        {
          type: 'mc',
          p: 'How many sides does a dodecagon have?',
          o: ['10', '12', '14', '20'],
          c: 1,
          t: 15,
          pts: 'standard',
          exp: 'Dodeca- means 12 in Greek.'
        }
      ]
    }
  ];

  const cl = (s, n) => String(s == null ? '' : s).trim().slice(0, n);

  function sanitizeQuestion(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const type = ['mc', 'tf', 'ms', 'text'].includes(raw.type) ? raw.type : 'mc';
    const p = cl(raw.p, 240);
    if (!p) return null;
    const t = Math.min(60, Math.max(5, Number(raw.t) || 20));
    const pts = ['standard', 'double', 'poll'].includes(raw.pts) ? raw.pts : 'standard';
    const exp = cl(raw.exp, 240);

    if (type === 'tf') {
      const c = Number(raw.c) === 1 ? 1 : 0;
      const o = Array.isArray(raw.o) && raw.o.length === 2
        ? raw.o.map(x => cl(x, 60) || 'Option')
        : ['True', 'False'];
      return { type: 'tf', p, o, c, t, pts, exp };
    }

    if (type === 'text') {
      const accepted = (Array.isArray(raw.accepted) ? raw.accepted : String(raw.accepted || '').split(','))
        .map(x => cl(x, 80))
        .filter(Boolean);
      if (!accepted.length) return null;
      return { type: 'text', p, accepted, t, pts, exp };
    }

    const o = (Array.isArray(raw.o) ? raw.o : []).map(x => cl(x, 120)).filter(Boolean).slice(0, 4);
    if (o.length < 2) return null;

    if (type === 'ms') {
      const cs = Array.isArray(raw.cs)
        ? [...new Set(raw.cs.map(Number).filter(i => i >= 0 && i < o.length))]
        : [0];
      if (!cs.length) return null;
      return { type: 'ms', p, o, cs, t, pts, exp };
    }

    const c = Number(raw.c);
    if (!(c >= 0 && c < o.length)) return null;
    return { type: 'mc', p, o, c, t, pts, exp };
  }

  function sanitizeQuiz(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const title = cl(raw.title, 80);
    if (!title) return null;
    const qs = (Array.isArray(raw.qs) ? raw.qs : []).map(sanitizeQuestion).filter(Boolean).slice(0, 80);
    if (!qs.length) return null;
    return {
      id: cl(raw.id, 60) || ('qz-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6)),
      title,
      description: cl(raw.description, 160),
      category: cl(raw.category, 30) || 'Custom',
      emoji: cl(raw.emoji, 8) || '🎯',
      updatedAt: Number(raw.updatedAt) || Date.now(),
      qs
    };
  }

  function loadSaved() {
    try {
      const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
      return Array.isArray(raw) ? raw.map(sanitizeQuiz).filter(Boolean) : [];
    } catch {
      return [];
    }
  }

  function writeSaved(list) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  }

  function parseBulkText(text) {
    const lines = String(text || '').split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length < 2) return null;
    const title = cl(lines[0], 80) || 'Custom Quiz';
    const qs = [];
    for (const line of lines.slice(1)) {
      const parts = line.split('|').map(s => s.trim());
      if (parts.length < 6) return null;
      const p = cl(parts[0], 240);
      const o = parts.slice(1, 5).map(x => cl(x, 120));
      const c = Number(parts[5]) - 1;
      const t = Math.min(60, Math.max(5, Number(parts[6]) || 20));
      if (!p || o.some(x => !x) || !(c >= 0 && c < 4)) return null;
      qs.push({ type: 'mc', p, o, c, t, pts: 'standard', exp: cl(parts[7], 240) });
    }
    return qs.length ? { title, qs } : null;
  }

  window.QL.store = {
    cl,
    getTemplates: () => TEMPLATES.map(q => JSON.parse(JSON.stringify(q))),
    getSaved: () => loadSaved(),
    getAll() {
      return [...loadSaved(), ...this.getTemplates()];
    },
    getById(id) {
      return this.getAll().find(q => q.id === id) || null;
    },
    save(quizRaw) {
      const clean = sanitizeQuiz(quizRaw);
      if (!clean) return null;
      clean.updatedAt = Date.now();
      delete clean.builtin;
      const list = loadSaved();
      const idx = list.findIndex(q => q.id === clean.id);
      if (idx >= 0) list[idx] = clean;
      else list.unshift(clean);
      writeSaved(list);
      return clean;
    },
    duplicate(id) {
      const src = this.getById(id);
      if (!src) return null;
      const copy = JSON.parse(JSON.stringify(src));
      copy.id = 'qz-' + Date.now() + '-' + Math.random().toString(36).slice(2, 6);
      copy.title = cl(copy.title + ' (Copy)', 80);
      delete copy.builtin;
      return this.save(copy);
    },
    remove(id) {
      const list = loadSaved().filter(q => q.id !== id);
      writeSaved(list);
    },
    sanitizeQuiz,
    sanitizeQuestion,
    parseBulkText
  };
})();
