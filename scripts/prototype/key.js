// Shared by the recorder (Node) and the browser mock: how a request is named, so a recorded answer is found again.
(function (root) {
  function fnv(s, seed) {
    var x = seed >>> 0;
    for (var i = 0; i < s.length; i++) {
      x ^= s.charCodeAt(i);
      x = Math.imul(x, 16777619) >>> 0;
    }
    return ('0000000' + x.toString(16)).slice(-8);
  }
  function hash(s) {
    return fnv(s, 2166136261) + fnv(s, 3735928559);
  }
  // Requests whose answer depends on whether the cart has something in it.
  var CART = ['/api/v1/cart', '/api/v1/cart/count', '/api/v1/checkout/quote'];
  function key(role, method, pathAndQuery, cart, extra) {
    var u = new URL(pathAndQuery, 'http://x');
    var q = [];
    u.searchParams.forEach(function (v, k) {
      q.push([k, v]);
    });
    q.sort(function (a, b) {
      return a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : a[1] < b[1] ? -1 : 1;
    });
    var qs = q.map(function (p) { return encodeURIComponent(p[0]) + '=' + encodeURIComponent(p[1]); }).join('&');
    var k = role + '|' + method.toUpperCase() + '|' + u.pathname + (qs && method.toUpperCase() === 'GET' ? '?' + qs : '');
    if (CART.indexOf(u.pathname) >= 0) k += '#cart:' + (cart || 'empty');
    if (extra) k += '#' + extra;
    return k;
  }
  root.protoKey = { hash: hash, key: key };
})(typeof globalThis !== 'undefined' ? globalThis : window);
