// Front-end-only prototype: answers the site's /api/v1 requests from recordings of the real system, in the browser.
// Nothing is sent anywhere and nothing is saved. __KEY_JS__ and __IDENTITIES__ are filled in when the site is assembled.
(function () {
  if (window.__protoMock) return;
  window.__protoMock = true;
  __KEY_JS__
  var K = window.protoKey;
  var IDENTITIES = __IDENTITIES__;
  var CODE = '123456';
  var PASSWORD = 'Sahyadri@2026';
  var store = {
    get: function (k) { try { return localStorage.getItem('proto.' + k); } catch (e) { return null; } },
    set: function (k, v) { try { v == null ? localStorage.removeItem('proto.' + k) : localStorage.setItem('proto.' + k, v); } catch (e) {} },
  };
  var realFetch = window.fetch.bind(window);
  var json = function (status, body) {
    return new Response(status === 204 ? null : JSON.stringify(body), { status: status, headers: { 'Content-Type': 'application/json' } });
  };
  var notSaved = function () { return json(400, { code: 'PROTOTYPE', message: 'This is a prototype: changes are not saved.' }); };
  var who = function (id) {
    if (!id) return null;
    var s = String(id).trim().toLowerCase();
    if (s.indexOf('@') < 0) s = s.replace(/\D/g, '').slice(-10);
    return IDENTITIES[s] || null;
  };
  var setSession = function (role) {
    store.set('role', role);
    document.cookie = role ? 'sp_s=1; path=/; max-age=2592000' : 'sp_s=; path=/; max-age=0';
  };
  async function recorded(keys) {
    for (var i = 0; i < keys.length; i++) {
      try {
        var r = await realFetch('/mock/d/' + K.hash(keys[i]) + '.json', { cache: 'force-cache' });
        if (r.ok) {
          var f = await r.json();
          return json(f.s, f.b);
        }
      } catch (e) {}
    }
    return null;
  }

  window.fetch = async function (input, init) {
    var raw = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    var url = new URL(raw, location.href);
    if (url.origin !== location.origin || url.pathname.indexOf('/api/v1/') !== 0) return realFetch(input, init);
    var method = ((init && init.method) || (typeof input === 'object' && input.method) || 'GET').toUpperCase();
    var body = null;
    if (init && typeof init.body === 'string') try { body = JSON.parse(init.body); } catch (e) {}
    var path = url.pathname.slice('/api/v1'.length);
    var role = store.get('role');
    var cart = store.get('cart') || 'empty';
    var k = function (r, extra) { return K.key(r, method, url.pathname + url.search, cart, extra); };
    var answer = function (extra) { return recorded(role ? [k(role, extra), k('anon', extra)] : [k('anon', extra)]); };

    // Sign-in with the demo logins; the code is always 123456.
    if (method === 'POST' && path === '/auth/staff/login') {
      var r1 = who(body && body.email);
      if (!r1 || (body && body.password) !== PASSWORD) return json(400, { code: 'LOGIN_FAILED', message: 'Use a demo login (shown on this page) with password Sahyadri@2026.' });
      store.set('pending', r1);
      return (await recorded([k(r1)])) || json(200, { challengeId: 'demo', sentTo: 'your phone', channel: 'SMS' });
    }
    if (method === 'POST' && (path === '/auth/partner/otp/request' || path === '/auth/otp/request')) {
      var r2 = who(body && (body.identifier || body.phone)) || (path === '/auth/otp/request' ? 'customerAsha' : null);
      if (!r2) return json(400, { code: 'LOGIN_FAILED', message: 'Use a demo partner login: 9800000003 (vendor), 9800000004 (franchise) or 9800000005 (delivery).' });
      store.set('pending', r2);
      return (await recorded([k(r2), k('anon')])) || json(200, { challengeId: 'demo', expiresAt: new Date(Date.now() + 300000).toISOString() });
    }
    if (method === 'POST' && /^\/auth\/(staff\/verify|partner\/otp\/verify|otp\/verify)$/.test(path)) {
      if (!body || String(body.code) !== CODE) return json(400, { code: 'OTP_INVALID', message: 'Wrong code. In this prototype the code is always 123456.', fields: { code: 'Wrong code' } });
      var r3 = store.get('pending');
      if (!r3) return json(400, { code: 'OTP_EXPIRED', message: 'Start again.' });
      setSession(r3);
      return (await recorded([k(r3)])) || json(200, { user: { role: r3 } });
    }
    if (method === 'POST' && path === '/auth/staff/otp/email') return (await recorded([k(store.get('pending') || 'anon')])) || json(200, { challengeId: 'demo', sentTo: 'your email', channel: 'EMAIL' });
    if (method === 'POST' && path === '/auth/logout') { setSession(null); return json(200, { ok: true }); }
    if (method === 'POST' && path === '/auth/refresh') return role ? json(200, { ok: true }) : json(400, { code: 'REFRESH_INVALID', message: 'Please sign in.' });
    if (path === '/me' && method === 'GET' && !role) return json(401, { code: 'UNAUTHENTICATED', message: 'Please sign in.' });
    if (method === 'POST' && path === '/auth/device-token') return json(200, { ok: true });

    // Cart and checkout: the cart remembers only whether something is in it.
    if (method === 'POST' && path === '/cart/items') { store.set('cart', 'full'); cart = 'full'; return (await answer()) || json(200, { token: 'demo', count: 1 }); }
    if ((method === 'DELETE' && path.indexOf('/cart/items/') === 0) || (method === 'PATCH' && path.indexOf('/cart/items/') === 0 && body && body.quantity === 0)) {
      store.set('cart', 'empty');
      return json(200, { count: 0 });
    }
    if (method === 'POST' && path === '/checkout') {
      var placed = await answer('pm:' + ((body && body.paymentMethod) || 'COD'));
      if (placed && placed.ok) store.set('cart', 'empty');
      return placed || notSaved();
    }

    var res = await answer();
    if (res) return res;
    if (window.console) console.info('[prototype] not recorded:', method, url.pathname + url.search);
    if (method === 'GET') return json(404, { code: 'NOT_FOUND', message: 'Not available in this prototype.' });
    return notSaved();
  };
})();
