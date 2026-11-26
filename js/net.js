// Unified multiplayer transport:
// 1) Auto-uses WebSocket relay when served by server.js (LAN/classroom mode)
// 2) Otherwise uses hybrid PeerJS (WebRTC across devices) + BroadcastChannel (instant same-browser multi-tab)
window.QL = window.QL || {};

(function () {
  let serverWsAvailable = null;

  async function detectServerMode() {
    if (serverWsAvailable !== null) return serverWsAvailable;
    if (!location.protocol.startsWith('http')) {
      serverWsAvailable = false;
      return false;
    }
    try {
      const ctrl = new AbortController();
      const id = setTimeout(() => ctrl.abort(), 800);
      const res = await fetch('/api/mode', { signal: ctrl.signal, cache: 'no-store' });
      clearTimeout(id);
      if (res.ok) {
        const data = await res.json();
        serverWsAvailable = Boolean(data && data.ws);
        return serverWsAvailable;
      }
    } catch {}
    serverWsAvailable = false;
    return false;
  }

  function getClientId() {
    let id = sessionStorage.getItem('ql_client_id');
    if (!id) {
      id = 'p-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
      sessionStorage.setItem('ql_client_id', id);
    }
    return id;
  }

  function genCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    return Array.from({ length: 5 }, () => chars[(Math.random() * chars.length) | 0]).join('');
  }

  // Create a Host transport session
  async function createHostTransport(handlers) {
    const useWs = await detectServerMode();
    if (useWs) {
      return createWsHost(handlers);
    }
    return createStaticHost(handlers);
  }

  // Create a Player transport session
  async function createPlayerTransport(code, handlers) {
    const useWs = await detectServerMode();
    if (useWs) {
      return createWsPlayer(code, handlers);
    }
    return createStaticPlayer(code, handlers);
  }

  /* ---------------- WebSocket Relay Transport (LAN Server) ---------------- */
  function wsUrl() {
    return (location.protocol === 'https:' ? 'wss://' : 'ws://') + location.host + '/ws';
  }

  function createWsHost(handlers, tries = 0) {
    const code = genCode();
    const ws = new WebSocket(wsUrl());
    let closed = false;

    ws.onopen = () => {
      ws.send(JSON.stringify({ op: 'host', code }));
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.op === 'hosted') {
        handlers.onReady && handlers.onReady(code, 'ws');
      } else if (msg.op === 'err' && msg.reason === 'taken' && tries < 5) {
        ws.close();
        createWsHost(handlers, tries + 1);
      } else if (msg.op === 'msg' && msg.from) {
        handlers.onMessage && handlers.onMessage(msg.from, msg.data);
      } else if (msg.op === 'peer_left' && msg.from) {
        handlers.onDisconnect && handlers.onDisconnect(msg.from);
      }
    };

    ws.onerror = () => {
      if (!closed) handlers.onError && handlers.onError('net');
    };

    ws.onclose = () => {
      if (!closed) handlers.onError && handlers.onError('net');
    };

    return {
      mode: 'ws',
      get code() { return code; },
      sendTo(peerId, data) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ op: 'send', to: peerId, data }));
        }
      },
      broadcast(data) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ op: 'broadcast', data }));
        }
      },
      destroy() {
        closed = true;
        try { ws.close(); } catch {}
      }
    };
  }

  function createWsPlayer(code, handlers) {
    const clientId = getClientId();
    const ws = new WebSocket(wsUrl());
    let closed = false;
    let opened = false;

    ws.onopen = () => {
      opened = true;
      ws.send(JSON.stringify({ op: 'join', code, clientId }));
    };

    ws.onmessage = (ev) => {
      let msg;
      try { msg = JSON.parse(ev.data); } catch { return; }
      if (msg.op === 'joined_room') {
        handlers.onOpen && handlers.onOpen(clientId, 'ws');
      } else if (msg.op === 'err') {
        handlers.onError && handlers.onError(msg.reason === 'not_found' ? 'nocode' : 'net');
      } else if (msg.op === 'msg') {
        handlers.onMessage && handlers.onMessage(msg.data);
      } else if (msg.op === 'host_left') {
        if (!closed) handlers.onClose && handlers.onClose();
      }
    };

    ws.onerror = () => {
      if (!closed && !opened) handlers.onError && handlers.onError('net');
    };

    ws.onclose = () => {
      if (!closed) handlers.onClose && handlers.onClose();
    };

    return {
      mode: 'ws',
      clientId,
      send(data) {
        if (ws.readyState === 1) {
          ws.send(JSON.stringify({ op: 'send', data }));
        }
      },
      destroy() {
        closed = true;
        try { ws.close(); } catch {}
      }
    };
  }

  /* ---------------- Static Transport: PeerJS + BroadcastChannel ---------------- */
  function createStaticHost(handlers, tries = 0) {
    const code = genCode();
    let destroyed = false;
    let readyFired = false;
    let peer = null;
    const peerConns = new Map(); // clientId -> DataConnection
    const peerToClient = new Map(); // peerjsPeerId -> clientId
    const bcClients = new Set();

    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ql-room-' + code) : null;

    function fireReady(modeLabel) {
      if (readyFired || destroyed) return;
      readyFired = true;
      handlers.onReady && handlers.onReady(code, modeLabel);
    }

    if (bc) {
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || destroyed) return;
        if (msg.op === 'ping' && msg.from) {
          bc.postMessage({ op: 'pong', to: msg.from, code });
        } else if (msg.op === 'msg' && msg.from) {
          bcClients.add(msg.from);
          handlers.onMessage && handlers.onMessage(msg.from, msg.data);
        } else if (msg.op === 'bye' && msg.from) {
          bcClients.delete(msg.from);
          handlers.onDisconnect && handlers.onDisconnect(msg.from);
        }
      };
    }

    if (typeof window.Peer !== 'undefined') {
      try {
        peer = new window.Peer('cqa-' + code);
        peer.on('open', () => {
          fireReady('p2p');
        });
        peer.on('connection', (c) => {
          c.on('data', (m) => {
            if (!m || typeof m !== 'object') return;
            const cid = m.cid || c.peer;
            peerConns.set(cid, c);
            peerToClient.set(c.peer, cid);
            handlers.onMessage && handlers.onMessage(cid, m);
          });
          c.on('close', () => {
            const cid = peerToClient.get(c.peer) || c.peer;
            if (peerConns.get(cid) === c) peerConns.delete(cid);
            handlers.onDisconnect && handlers.onDisconnect(cid);
          });
        });
        peer.on('error', (e) => {
          if (e.type === 'unavailable-id' && tries < 5) {
            destroyed = true;
            try { bc && bc.close(); } catch {}
            try { peer.destroy(); } catch {}
            createStaticHost(handlers, tries + 1);
            return;
          }
          // If PeerJS fails (e.g. offline/file://) but BroadcastChannel works, still open room locally!
          if (!readyFired && bc) {
            fireReady('local');
          } else if (!readyFired) {
            handlers.onError && handlers.onError('net');
          }
        });
        // Safety fallback if PeerJS hangs on strict networks
        setTimeout(() => {
          if (!readyFired && bc && !destroyed) {
            fireReady('local');
          }
        }, 2800);
      } catch {
        if (bc) fireReady('local');
        else handlers.onError && handlers.onError('net');
      }
    } else {
      if (bc) fireReady('local');
      else handlers.onError && handlers.onError('net');
    }

    return {
      mode: 'p2p',
      get code() { return code; },
      sendTo(clientId, data) {
        if (bcClients.has(clientId) && bc) {
          bc.postMessage({ op: 'msg', to: clientId, data });
          return;
        }
        const c = peerConns.get(clientId);
        if (c && c.open) c.send(data);
      },
      broadcast(data) {
        if (bc && bcClients.size) {
          bc.postMessage({ op: 'msg', to: '*', data });
        }
        for (const c of peerConns.values()) {
          if (c && c.open) c.send(data);
        }
      },
      destroy() {
        destroyed = true;
        if (bc) {
          try { bc.postMessage({ op: 'host_bye' }); bc.close(); } catch {}
        }
        if (peer) {
          try { peer.destroy(); } catch {}
        }
      }
    };
  }

  function createStaticPlayer(code, handlers) {
    const clientId = getClientId();
    let destroyed = false;
    let channel = null; // 'bc' or 'peer'
    let conn = null;
    let peer = null;
    const bc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('ql-room-' + code) : null;

    function finishBc() {
      if (channel || destroyed) return;
      channel = 'bc';
      if (peer) { try { peer.destroy(); } catch {} peer = null; }
      handlers.onOpen && handlers.onOpen(clientId, 'local');
    }

    if (bc) {
      bc.onmessage = (ev) => {
        const msg = ev.data;
        if (!msg || destroyed) return;
        if (msg.op === 'pong' && msg.to === clientId && !channel) {
          finishBc();
        } else if (msg.op === 'msg' && (msg.to === clientId || msg.to === '*')) {
          handlers.onMessage && handlers.onMessage(msg.data);
        } else if (msg.op === 'host_bye' && channel === 'bc') {
          handlers.onClose && handlers.onClose();
        }
      };
      bc.postMessage({ op: 'ping', from: clientId });
    }

    const peerWait = bc ? 380 : 0;
    const timer = setTimeout(() => {
      if (channel || destroyed) return;
      if (typeof window.Peer === 'undefined') {
        handlers.onError && handlers.onError('nocode');
        return;
      }
      try {
        peer = new window.Peer();
        peer.on('open', () => {
          if (channel || destroyed) return;
          conn = peer.connect('cqa-' + code, { reliable: true });
          conn.on('open', () => {
            if (channel || destroyed) return;
            channel = 'peer';
            if (bc) { try { bc.close(); } catch {} }
            handlers.onOpen && handlers.onOpen(clientId, 'p2p');
          });
          conn.on('data', (m) => {
            if (!destroyed) handlers.onMessage && handlers.onMessage(m);
          });
          conn.on('close', () => {
            if (!destroyed && channel === 'peer') handlers.onClose && handlers.onClose();
          });
        });
        peer.on('error', (e) => {
          if (!channel && !destroyed) {
            handlers.onError && handlers.onError(e.type === 'peer-unavailable' ? 'nocode' : 'net');
          }
        });
      } catch {
        if (!channel && !destroyed) handlers.onError && handlers.onError('net');
      }
    }, peerWait);

    return {
      mode: 'p2p',
      clientId,
      send(data) {
        const payload = Object.assign({}, data, { cid: clientId });
        if (channel === 'bc' && bc) {
          bc.postMessage({ op: 'msg', from: clientId, data: payload });
        } else if (channel === 'peer' && conn && conn.open) {
          conn.send(payload);
        }
      },
      destroy() {
        destroyed = true;
        clearTimeout(timer);
        if (bc) {
          try {
            if (channel === 'bc') bc.postMessage({ op: 'bye', from: clientId });
            bc.close();
          } catch {}
        }
        if (peer) {
          try { peer.destroy(); } catch {}
        }
      }
    };
  }

  window.QL.net = {
    detectServerMode,
    getClientId,
    createHostTransport,
    createPlayerTransport
  };
})();
