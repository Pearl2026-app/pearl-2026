// Preloaded (node -r) into the API, the website and the admin on Hostinger (owner, 11 Nov). On a Hostinger Web App the
// processes of one app cannot reach each other over 127.0.0.1 (a server listening there is never answered), so the
// parts talk over Unix sockets instead, with no change to the apps themselves:
// - LISTEN_SOCKET: the process's server listens on this socket file instead of the port it asks for;
// - API_SOCKET with API_INTERNAL_URL: requests the website and the admin make to API_INTERNAL_URL (the API, from server
//   code with fetch, and Next's rewrites with node:http) go to the API's socket.
'use strict';
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const { Readable } = require('node:stream');

const LISTEN = process.env.LISTEN_SOCKET;
if (LISTEN) {
  const listen = net.Server.prototype.listen;
  let taken = false;
  net.Server.prototype.listen = function (...args) {
    if (taken) return listen.apply(this, args);
    taken = true;
    try {
      fs.unlinkSync(LISTEN);
    } catch {
      // no old socket
    }
    const done = args.find((a) => typeof a === 'function');
    return listen.call(this, LISTEN, done);
  };
}

const API_SOCKET = process.env.API_SOCKET;
const API = process.env.API_INTERNAL_URL && new URL(process.env.API_INTERNAL_URL);
if (API_SOCKET && API) {
  const isApi = (host, port) => (host === API.hostname || host === `${API.hostname}:${API.port}`) && String(port ?? API.port) === API.port;

  // node:http (Next's rewrites proxy): point requests for the API at its socket
  for (const mod of [http]) {
    for (const name of ['request', 'get']) {
      const orig = mod[name];
      mod[name] = function (...args) {
        const i = args.findIndex((a) => a && typeof a === 'object' && !(a instanceof URL));
        const o = i >= 0 ? args[i] : null;
        if (o && !o.socketPath && isApi(o.hostname ?? o.host, o.port)) args[i] = { ...o, socketPath: API_SOCKET };
        return orig.apply(this, args);
      };
    }
  }

  // fetch (server components): requests for the API go over its socket through node:http
  const origFetch = globalThis.fetch;
  globalThis.fetch = async function (input, init) {
    const req = new Request(input, init);
    const u = new URL(req.url);
    if (u.origin !== API.origin) return origFetch(input, init);
    const body = req.method === 'GET' || req.method === 'HEAD' ? null : Buffer.from(await req.arrayBuffer());
    const headers = Object.fromEntries(req.headers);
    headers.host = u.host;
    headers['accept-encoding'] = 'identity'; // the body is handed on as it comes, so never compressed
    if (body) headers['content-length'] = String(body.length);
    return new Promise((resolve, reject) => {
      const r = http.request({ socketPath: API_SOCKET, method: req.method, path: u.pathname + u.search, headers }, (res) => {
        const h = new Headers();
        for (const [k, v] of Object.entries(res.headers)) for (const x of [].concat(v ?? [])) h.append(k, x);
        const empty = req.method === 'HEAD' || [101, 204, 205, 304].includes(res.statusCode);
        if (empty) res.resume();
        resolve(new Response(empty ? null : Readable.toWeb(res), { status: res.statusCode, statusText: res.statusMessage, headers: h }));
      });
      r.on('error', reject);
      if (req.signal) req.signal.addEventListener('abort', () => r.destroy(req.signal.reason ?? new Error('aborted')), { once: true });
      r.end(body ?? undefined);
    });
  };
}
