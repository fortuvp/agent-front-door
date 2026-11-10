/* Harbour Line website: in-browser stand-in for /ferry/api/* (used only with ?mock=1).
   Mirrors the catalogue in SPEC.md ("Harbour Line catalogue"). The live site reads shop/data.mjs
   through the server; keep these numbers in step with it. */
(function () {
  'use strict';

  var CATALOGUE = {
    operator: 'Harbour Line',
    currency: 'USDC',
    inrPerUsdc: 88,
    routes: [
      { id: 'gateway-elephanta', from: 'Gateway of India', to: 'Elephanta Island', duration: 'About 1 hour each way' },
      { id: 'gateway-mandwa', from: 'Gateway of India', to: 'Mandwa Jetty', duration: 'About 1 hour each way' }
    ],
    seatClasses: [
      { id: 'economy', name: 'Economy', price: 2.6, description: 'Covered benches on the lower deck.' },
      { id: 'upper-deck', name: 'Upper deck', price: 3.2, description: 'Open-air seats with the best view of the harbour.' },
      { id: 'upper-deck-guide', name: 'Upper deck with guide', price: 4.8, description: 'Upper deck, plus a guided walk to the caves.' }
    ],
    boardingPoints: [
      { id: 'jetty-1', name: 'Gateway jetty 1', description: 'Main gate. Steps down to the boat.', stepFree: false },
      { id: 'jetty-4', name: 'Gateway jetty 4', description: 'Step-free access, with a ramp and handrail.', stepFree: true }
    ]
  };

  // seats left per class: [economy, upper-deck, upper-deck-guide]
  var SAT = {
    'gateway-elephanta': {
      out: [['09:00', [14, 0, 3]], ['09:30', [22, 6, 4]], ['10:00', [11, 2, 0]], ['10:30', [30, 12, 8]], ['11:30', [38, 16, 10]]],
      ret: [['12:30', [20, 8, 6]], ['14:00', [25, 10, 6]], ['15:30', [34, 14, 8]], ['17:00', [40, 20, 10]]]
    },
    'gateway-mandwa': {
      out: [['08:15', [30, 12, 4]], ['10:45', [44, 20, 8]], ['13:15', [51, 26, 10]]],
      ret: [['15:00', [38, 14, 6]], ['18:30', [20, 9, 2]]]
    }
  };
  var WEEKDAY = {
    'gateway-elephanta': {
      out: [['09:00', [48, 14, 6]], ['10:00', [52, 20, 9]], ['11:30', [60, 26, 12]]],
      ret: [['14:00', [57, 24, 11]], ['17:00', [40, 16, 7]]]
    },
    'gateway-mandwa': {
      out: [['08:15', [40, 18, 6]], ['13:15', [55, 28, 12]]],
      ret: [['15:00', [44, 20, 8]], ['18:30', [30, 12, 4]]]
    }
  };

  function classIds() { return CATALOGUE.seatClasses.map(function (c) { return c.id; }); }
  function priceOf(id) {
    var c = CATALOGUE.seatClasses.filter(function (x) { return x.id === id; })[0];
    return c ? c.price : 0;
  }
  function slotList(list) {
    var ids = classIds();
    return list.map(function (s) {
      var seats = {}, prices = {};
      ids.forEach(function (id, i) { seats[id] = s[1][i]; prices[id] = priceOf(id); });
      return { time: s[0], seatsLeft: seats, prices: prices };
    });
  }
  function departures(route, date) {
    var d = new Date(date + 'T12:00:00');
    var table = (d.getDay() === 6 || d.getDay() === 0) ? SAT : WEEKDAY;
    var r = table[route];
    if (!r) return null;
    return { route: route, date: date, departures: slotList(r.out), returns: slotList(r.ret) };
  }
  function round2(n) { return Math.round(n * 100) / 100; }

  var quotes = {}, orders = {}, nQuote = 0, nOrder = 0;

  function price(booking) {
    var pax = booking.passengers || [];
    var paying = pax.filter(function (p) { return !(Number(p.age) < 5); }).length;
    var free = pax.length - paying;
    var cls = CATALOGUE.seatClasses.filter(function (c) { return c.id === booking.seatClass; })[0];
    var lines = [{ label: cls.name + ', return', qty: paying, unit: cls.price, amount: round2(paying * cls.price) }];
    if (free) lines.push({ label: 'Under 5, travels free', qty: free, unit: 0, amount: 0 });
    return { lines: lines, total: round2(paying * cls.price), paying: paying };
  }

  function quote(booking) {
    var p = price(booking);
    var id = 'q_' + (Date.now().toString(36)) + (++nQuote);
    var cheaper = Object.assign({}, booking, { seatClass: 'economy' });
    var later = Object.assign({}, booking, { departure: '10:30', seatClass: 'upper-deck' });
    var q = {
      quoteId: id,
      booking: booking,
      lines: p.lines,
      total: p.total,
      currency: 'USDC',
      inrApprox: Math.round(p.total * CATALOGUE.inrPerUsdc),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
      alternatives: [
        { id: 'alt-cheaper', label: 'Cheaper', change: { seatClass: 'economy' }, total: price(cheaper).total },
        { id: 'alt-later', label: 'Later', change: { departure: '10:30', seatClass: 'upper-deck' }, total: price(later).total }
      ]
    };
    quotes[id] = q;
    return q;
  }

  function refCode() {
    var a = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789', s = 'HL-';
    for (var i = 0; i < 6; i++) s += a[Math.floor(Math.random() * a.length)];
    return s;
  }

  function seatsFor(booking) {
    var prefix = booking.seatClass === 'economy' ? 'E' : booking.seatClass === 'upper-deck-guide' ? 'G' : 'U';
    var start = 12 + Math.floor(Math.random() * 20);
    return (booking.passengers || []).map(function (p, i) { return { passenger: p.name, seat: prefix + (start + i) }; });
  }

  function err(status, message) { var e = new Error(message); e.status = status; e.data = { error: message }; return e; }

  function handle(method, path, body) {
    var url = new URL(path, 'http://mock/');
    var p = url.pathname.replace(/^\//, '');
    var delay = 180 + Math.floor(Math.random() * 220);
    return new Promise(function (resolve, reject) {
      setTimeout(function () {
        try {
          if (method === 'GET' && p === 'routes') {
            return resolve(JSON.parse(JSON.stringify(CATALOGUE)));
          }
          if (method === 'GET' && p === 'departures') {
            var d = departures(url.searchParams.get('route'), url.searchParams.get('date'));
            if (!d) return reject(err(404, 'Unknown route'));
            return resolve(d);
          }
          if (method === 'POST' && p === 'quote') {
            if (!body || !body.seatClass) return reject(err(400, 'Missing seat class'));
            return resolve(quote(body));
          }
          if (method === 'POST' && p === 'orders') {
            var q = quotes[body && body.quoteId];
            if (!q) return reject(err(404, 'That price has expired. Go back and check the price again.'));
            var id = 'ord_' + Date.now().toString(36) + (++nOrder);
            var ref = refCode();
            var o = {
              orderId: id, quoteId: q.quoteId, channel: body.channel || 'web', status: 'paid', total: q.total,
              ref: ref,
              receipt: {
                orderId: id, ref: ref, paidAt: new Date().toISOString(), amount: q.total, asset: 'USDC',
                network: 'card-test', mode: 'ledger', txHash: null, explorerUrl: null, tickets: seatsFor(q.booking)
              }
            };
            orders[id] = o;
            return resolve({ orderId: id, status: 'paid', ref: ref });
          }
          var m = p.match(/^orders\/([^/]+)$/);
          if (method === 'GET' && m) {
            if (!orders[m[1]]) return reject(err(404, 'Order not found'));
            return resolve(JSON.parse(JSON.stringify(orders[m[1]])));
          }
          reject(err(404, 'Not found'));
        } catch (e) { reject(e); }
      }, delay);
    });
  }

  window.HLMock = { CATALOGUE: CATALOGUE, handle: handle };
})();
