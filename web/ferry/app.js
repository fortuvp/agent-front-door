/* Harbour Line website: a small state machine.
   Every user action becomes an event passed to app.apply(event):
     {type:"web.click", field:<action>, value?}   buttons, chips, cards, custom widgets
     {type:"web.input", field:<field>, value}     each keystroke (full value)
     {type:"web.field", field:<field>, value}     a text field committed (change / blur)
   The app emits those causes plus effects (web.view, web.step, web.error, web.submit, web.done)
   to listeners (recorder.js). replay.js feeds recorded causes back through app.apply. */
(function () {
  'use strict';

  var Q = new URLSearchParams(location.search);
  var FLAGS = {
    mock: Q.has('mock') && Q.get('mock') !== '0',
    lane: Q.get('lane') || '3',
    demo: Q.get('demo') || '',
    replay: Q.get('replay') || '',
    // Quick sign-in for the presenter's live lane (not lane 2's recorded agent, not a replay):
    // any name or none, and Create account or Sign in goes straight to the trip page. ?quick=0 turns it off.
    quick: false
  };
  FLAGS.quick = !FLAGS.replay && FLAGS.lane !== '2' && Q.get('quick') !== '0';
  var API = new URL('api/', location.href).href;
  var A = window.HLArt;
  var I = A.icon;

  var VIEW_LABEL = { home: 'Home', auth: 'Sign in', trip: 'Trip', passengers: 'Passengers', review: 'Review', pay: 'Pay', ticket: 'Ticket' };
  var STEPS = ['trip', 'passengers', 'review', 'pay'];
  var ID_TYPES = [
    { id: 'passport', name: 'Passport', ph: 'A1234567' },
    { id: 'aadhaar', name: 'Aadhaar card', ph: '1234 5678 9012' },
    { id: 'driving-licence', name: 'Driving licence', ph: 'MH1420110062' }
  ];
  var MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
  var DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  // ---------- helpers ----------
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function num(v) { var n = Number(v); return isFinite(n) ? n : 0; }
  function fmtU(n) { return num(n).toFixed(2); }
  function inr(n) { return Math.round(num(n) * (S.cat ? S.cat.inrPerUsdc : 88)).toLocaleString('en-IN'); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function ymd(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function parseYmd(s) { var p = String(s).split('-').map(Number); return new Date(p[0], p[1] - 1, p[2]); }
  function fmtDate(s, long) {
    if (!s) return '';
    var d = parseYmd(s);
    return DAYS[d.getDay()] + ' ' + d.getDate() + ' ' + MONTHS[d.getMonth()].slice(0, long ? 99 : 3) + (long ? ' ' + d.getFullYear() : '');
  }
  function mins(t) { var p = String(t).split(':'); return Number(p[0]) * 60 + Number(p[1] || 0); }
  function hhmm(m) { return pad(Math.floor(m / 60)) + ':' + pad(m % 60); }
  function titleCase(s) { return String(s || '').replace(/-/g, ' ').replace(/^\w/, function (c) { return c.toUpperCase(); }); }
  function sleep(ms) { return new Promise(function (r) { setTimeout(r, ms); }); }
  function $(sel) { return document.querySelector(sel); }
  function cssq(v) { return String(v).replace(/["\\]/g, '\\$&'); }
  function codeFor(email) {
    var h = 2166136261, e = String(email || '').trim().toLowerCase();
    for (var i = 0; i < e.length; i++) { h ^= e.charCodeAt(i); h = Math.imul(h, 16777619); }
    return String((h >>> 0) % 900000 + 100000);
  }
  function luhn(d) {
    var sum = 0, alt = false;
    for (var i = d.length - 1; i >= 0; i--) {
      var n = Number(d[i]);
      if (alt) { n *= 2; if (n > 9) n -= 9; }
      sum += n; alt = !alt;
    }
    return sum % 10 === 0;
  }

  // ---------- data normalisation (accepts a few shapes from /ferry/api) ----------
  function normCatalogue(r) {
    r = r || {};
    var routes = (r.routes || []).map(function (x) {
      return {
        id: x.id || x.slug,
        from: x.from || x.origin || (x.fromName) || 'Gateway of India',
        to: x.to || x.destination || x.toName || x.name || titleCase(x.id),
        duration: x.duration || x.crossing || (x.minutes ? (x.minutes >= 60 && x.minutes % 60 === 0 ? 'About ' + (x.minutes / 60 === 1 ? 'an hour' : x.minutes / 60 + ' hours') : 'About ' + x.minutes + ' minutes') + ' each way' : ''),
        note: x.note || '',
        prices: (x.prices && typeof x.prices === 'object') ? x.prices : null,
        decoy: !!x.decoy
      };
    }).map(function (x) {
      if (typeof x.from === 'object') x.from = x.from.name || x.from.label || '';
      if (typeof x.to === 'object') x.to = x.to.name || x.to.label || '';
      return x;
    });
    var classes = (r.seatClasses || r.classes || r.seat_classes || []).map(function (c) {
      return {
        id: c.id, name: c.name || c.label || titleCase(c.id),
        price: num(c.price != null ? c.price : c.priceUsdc != null ? c.priceUsdc : c.usdc != null ? c.usdc : c.unit),
        description: c.description || c.blurb || c.note || ''
      };
    });
    var boarding = (r.boardingPoints || r.boarding || r.boarding_points || []).map(function (b) {
      var txt = (b.description || b.note || '') + ' ' + (b.name || b.label || '');
      return {
        id: b.id, name: b.name || b.label || titleCase(b.id), description: b.description || b.note || '',
        stepFree: !!(b.stepFree || b.step_free || /step-free/i.test(txt))
      };
    });
    // the server keeps prices per route; fill class prices from the main route when a class has none
    var main = routes.filter(function (x) { return x.prices; })[0];
    classes.forEach(function (c) { if (!c.price && main && main.prices[c.id] != null) c.price = num(main.prices[c.id]); });
    return { routes: routes, classes: classes, boarding: boarding, inrPerUsdc: num(r.inrPerUsdc || r.inr || r.usdcInr) || 88 };
  }
  function normSlots(arr) {
    return (arr || []).map(function (s) {
      if (typeof s === 'string') s = { time: s };
      var time = s.time || s.departure || s.departs || s.at || s.id;
      var seats = {}, prices = {};
      var src = s.seatsLeft || s.seats || s.classes || s.availability || s.left || {};
      if (Array.isArray(src)) {
        src.forEach(function (c) {
          var id = c.id || c.class || c.seatClass;
          seats[id] = num(c.seatsLeft != null ? c.seatsLeft : c.left != null ? c.left : c.seats != null ? c.seats : c.available);
          if (c.price != null) prices[id] = num(c.price);
        });
      } else if (typeof src === 'object') {
        Object.keys(src).forEach(function (k) {
          var v = src[k];
          if (v && typeof v === 'object') {
            seats[k] = num(v.seatsLeft != null ? v.seatsLeft : v.left != null ? v.left : v.seats != null ? v.seats : v.available);
            if (v.price != null) prices[k] = num(v.price);
          } else seats[k] = num(v);
        });
      }
      var pr = s.prices || s.price;
      if (pr && typeof pr === 'object') Object.keys(pr).forEach(function (k) { prices[k] = num(pr[k]); });
      if (s.soldOut && typeof s.soldOut === 'object') Object.keys(s.soldOut).forEach(function (k) { if (s.soldOut[k]) seats[k] = 0; });
      var total = 0; Object.keys(seats).forEach(function (k) { total += seats[k] || 0; });
      if (s.totalLeft != null) total = num(s.totalLeft);
      var sold = (typeof s.soldOut === 'boolean') ? s.soldOut : total === 0;
      return { time: String(time).slice(0, 5), seats: seats, prices: prices, total: total, soldOut: sold };
    }).filter(function (s) { return s.time && /^\d\d:\d\d$/.test(s.time); }).sort(function (a, b) { return a.time < b.time ? -1 : 1; });
  }
  function normDepartures(r) {
    var out, ret;
    if (Array.isArray(r)) {
      out = r.filter(function (s) { return !/ret|back|inbound/i.test(s.direction || s.leg || ''); });
      ret = r.filter(function (s) { return /ret|back|inbound/i.test(s.direction || s.leg || ''); });
    } else {
      r = r || {};
      out = r.departures || r.outbound || r.out || r.slots || r.there || [];
      ret = r.returns || r.inbound || r.back || r['return'] || [];
      if (!Array.isArray(out) && out && (out.slots || out.departures)) out = out.slots || out.departures;
      if (!Array.isArray(ret) && ret && (ret.slots || ret.departures)) ret = ret.slots || ret.departures;
    }
    return { out: normSlots(out), ret: normSlots(ret) };
  }

  // ---------- API ----------
  function api(method, path, body) {
    if (FLAGS.mock && window.HLMock) return window.HLMock.handle(method, path, body);
    return fetch(API + path, {
      method: method,
      headers: { 'Content-Type': 'application/json', 'Accept': 'application/json', 'X-Lane': FLAGS.lane, 'X-Client': 'ferry-web' },
      body: body ? JSON.stringify(body) : undefined
    }).then(function (res) {
      return res.text().then(function (txt) {
        var data = {};
        try { data = txt ? JSON.parse(txt) : {}; } catch (e) { data = { error: txt }; }
        if (!res.ok) {
          var e = new Error((data && (data.message || data.error)) || ('Request failed (' + res.status + ')'));
          e.status = res.status; e.data = data; throw e;
        }
        return data;
      });
    });
  }

  // ---------- state ----------
  function blankPax() { return { name: '', age: '', idType: '', idNumber: '' }; }
  var S = {
    view: 'home', cookie: null, cat: null, busy: 0,
    user: null, accounts: {},
    auth: { tab: 'create', phase: 'form', email: '', password: '', password2: '', terms: false, siEmail: '', siPassword: '', code: '', pendingEmail: '', toast: false },
    trip: { route: '', date: '', out: '', ret: '', calMonth: '' },
    slots: { key: '', loading: false, error: '', out: [], ret: [] },
    pax: { list: [blankPax()], seatClass: '', board: '', assist: '' },
    quote: null, review: { terms: false, note: '' },
    pay: { number: '', expiry: '', cvc: '', name: '', processing: false, declined: '' },
    order: null, receipt: null,
    errors: {}, open: '', formError: ''
  };
  var committed = {}, dirty = {}, toastTimer = null;

  var listeners = [];
  function emit(e) {
    if (!e.t) e.t = Date.now();
    if (e.step == null) e.step = S.view;
    for (var i = 0; i < listeners.length; i++) { try { listeners[i](e); } catch (x) { console.warn(x); } }
  }

  function task(fn) {
    S.busy++;
    return Promise.resolve().then(fn).then(function (v) { S.busy--; return v; }, function (e) { S.busy--; throw e; });
  }

  // ---------- labels ----------
  function paxN(f) { var m = /^pax\.(\d+)\./.exec(f); return m ? Number(m[1]) : -1; }
  function labelOf(f) {
    var n = paxN(f);
    if (n >= 0) {
      var k = f.split('.')[2];
      return 'Passenger ' + (n + 1) + ' · ' + ({ name: 'Full name', age: 'Age', idType: 'ID type', idNumber: 'ID number' }[k] || k);
    }
    return ({
      'auth.email': 'Email address', 'auth.password': 'Password', 'auth.password2': 'Repeat password',
      'auth.siEmail': 'Email address', 'auth.siPassword': 'Password', 'auth.code': 'Email code', 'auth.terms': 'Terms',
      'trip.route': 'Route', 'trip.date': 'Date', 'trip.out': 'Departure', 'trip.ret': 'Return',
      'pax.class': 'Seat class', 'pax.board': 'Boarding point', 'pax.assist': 'Special assistance', 'pax.count': 'Passengers',
      'review.terms': 'Conditions of carriage',
      'pay.number': 'Card number', 'pay.expiry': 'Expiry date', 'pay.cvc': 'Security code', 'pay.name': 'Name on card'
    })[f] || f;
  }
  function routeName(id) {
    var r = S.cat && S.cat.routes.filter(function (x) { return x.id === id; })[0];
    return r ? r.from + ' to ' + r.to : id;
  }
  function priceOf(id) {
    var o = S.slots && slot(S.slots.out, S.trip.out);
    if (o && o.prices[id] != null) return o.prices[id];
    var r = S.cat && S.cat.routes.filter(function (x) { return x.id === S.trip.route; })[0];
    if (r && r.prices && r.prices[id] != null) return num(r.prices[id]);
    var c = S.cat && S.cat.classes.filter(function (x) { return x.id === id; })[0];
    return c ? c.price : 0;
  }
  function className(id) { var c = S.cat && S.cat.classes.filter(function (x) { return x.id === id; })[0]; return c ? c.name : titleCase(id); }
  function boardName(id) { var b = S.cat && S.cat.boarding.filter(function (x) { return x.id === id; })[0]; return b ? b.name : titleCase(id); }
  function clickLabel(act, val) {
    var n = Number(String(val || '').split(':')[0]) + 1;
    switch (act) {
      case 'cookie.necessary': return 'Cookies: only necessary';
      case 'cookie.all': return 'Cookies: accept all';
      case 'nav.book': return 'Book tickets';
      case 'nav.signin': return 'Sign in';
      case 'nav.home': return 'Home';
      case 'auth.tab': return val === 'signin' ? 'Sign in tab' : 'Create account tab';
      case 'auth.terms': return 'Accept the terms';
      case 'auth.create': return 'Create account';
      case 'auth.signin': return 'Sign in';
      case 'auth.verify': return 'Verify code';
      case 'auth.resend': return 'Send the code again';
      case 'auth.back': return 'Use a different email';
      case 'toast.close': return 'Close the message';
      case 'trip.route.toggle': return 'Open the route list';
      case 'trip.route.pick': return 'Route: ' + routeName(val);
      case 'trip.date.toggle': return 'Open the calendar';
      case 'trip.cal.prev': return 'Previous month';
      case 'trip.cal.next': return 'Next month';
      case 'trip.date.pick': return 'Date: ' + fmtDate(val);
      case 'trip.out': return 'Leave at ' + val;
      case 'trip.ret': return 'Return at ' + val;
      case 'trip.next': return 'Continue to passengers';
      case 'pax.inc': return 'Add a passenger';
      case 'pax.dec': return 'Remove a passenger';
      case 'pax.idtype.toggle': return 'Passenger ' + n + ' · open ID types';
      case 'pax.idtype.pick': {
        var t = ID_TYPES.filter(function (x) { return x.id === String(val).split(':')[1]; })[0];
        return 'Passenger ' + n + ' · ID type: ' + (t ? t.name : '');
      }
      case 'pax.class': return 'Seats: ' + className(val);
      case 'pax.board': return 'Boarding: ' + boardName(val);
      case 'pax.back': return 'Back to trip';
      case 'pax.next': return 'Check the price';
      case 'review.alt': return 'Choose the ' + (Number(val) === 0 ? 'first' : 'second') + ' other option';
      case 'review.terms': return 'Accept the conditions of carriage';
      case 'review.back': return 'Back to passengers';
      case 'review.next': return 'Continue to payment';
      case 'step.goto': return 'Go back to ' + (VIEW_LABEL[val] || val);
      case 'pay.back': return 'Back to review';
      case 'pay.submit': return 'Pay ' + (S.quote ? fmtU(S.quote.total) + ' USDC' : '');
      case 'ticket.new': return 'Book another trip';
      case 'popover.close': return 'Close the list';
    }
    return act;
  }

  // ---------- field values ----------
  function formatValue(f, v) {
    v = String(v == null ? '' : v);
    var d;
    if (f === 'pay.number') { d = v.replace(/\D/g, '').slice(0, 19); return d.replace(/(\d{4})(?=\d)/g, '$1 '); }
    if (f === 'pay.expiry') {
      d = v.replace(/\D/g, '').slice(0, 4);
      if (d.length === 1 && Number(d) > 1) d = '0' + d;
      return d.length > 2 ? d.slice(0, 2) + ' / ' + d.slice(2) : d;
    }
    if (f === 'pay.cvc') return v.replace(/\D/g, '').slice(0, 4);
    if (f === 'auth.code') return v.replace(/\D/g, '').slice(0, 6);
    if (/^pax\.\d+\.age$/.test(f)) return v.replace(/\D/g, '').slice(0, 3);
    if (f === 'pax.assist') return v.slice(0, 300);
    if (/^pax\.\d+\.name$/.test(f) || f === 'pay.name') return v.slice(0, 60);
    return v.slice(0, 120);
  }
  function getField(f) {
    var p = f.split('.');
    if (p[0] === 'auth') return S.auth[p[1]];
    if (p[0] === 'pay') return S.pay[p[1]];
    if (f === 'pax.assist') return S.pax.assist;
    if (p[0] === 'pax' && S.pax.list[Number(p[1])]) return S.pax.list[Number(p[1])][p[2]];
    return undefined;
  }
  function setField(f, v) {
    var p = f.split('.');
    if (p[0] === 'auth' && p[1] in S.auth) { S.auth[p[1]] = v; return true; }
    if (p[0] === 'pay' && p[1] in S.pay) { S.pay[p[1]] = v; return true; }
    if (f === 'pax.assist') { S.pax.assist = v; return true; }
    if (p[0] === 'pax' && S.pax.list[Number(p[1])] && p[2] in S.pax.list[Number(p[1])]) { S.pax.list[Number(p[1])][p[2]] = v; return true; }
    return false;
  }
  function syncDom(f, v) {
    var el = document.querySelector('[data-field="' + cssq(f) + '"]');
    if (el && el.value !== v) {
      var atEnd = document.activeElement !== el || el.selectionStart === el.value.length;
      el.value = v;
      if (atEnd && document.activeElement === el) { try { el.setSelectionRange(v.length, v.length); } catch (e) { /* ignore */ } }
    }
    if (f === 'pax.assist') { var c = $('#assist-count'); if (c) c.textContent = v.length + ' / 300'; }
    if (f === 'pay.number') {
      var bEl = $('.cf-brand'), bn = brand(v);
      if (bEl && bEl.getAttribute('data-brand') !== bn) { bEl.setAttribute('data-brand', bn); bEl.className = 'cf-brand' + (bn ? ' on' : ''); bEl.innerHTML = bn || I('card'); }
    }
  }
  function clearError(f) {
    if (!S.errors[f]) return;
    delete S.errors[f];
    var w = document.querySelector('[data-wrap="' + cssq(f) + '"]');
    if (w) { w.classList.remove('has-err'); var m = w.querySelector('.fld-err'); if (m) m.textContent = ''; }
    if (!Object.keys(S.errors).length) { S.formError = ''; var b = $('#form-error'); if (b) b.remove(); }
  }

  function onInput(f, value, ev) {
    var v = formatValue(f, value);
    if (!setField(f, v)) return;
    syncDom(f, v);
    clearError(f);
    dirty[f] = true;
    emit({ type: 'web.input', field: f, value: v, label: labelOf(f), t: ev && ev.t });
  }
  function onField(f, value, ev) {
    var v = formatValue(f, value);
    if (!setField(f, v)) return;
    syncDom(f, v);
    clearError(f);
    delete dirty[f];
    if (committed[f] === v) return;
    committed[f] = v;
    emit({ type: 'web.field', field: f, value: v, label: labelOf(f), t: ev && ev.t });
  }
  function commitDirty() {
    Object.keys(dirty).forEach(function (f) { onField(f, getField(f)); });
  }

  // ---------- navigation and validation ----------
  function go(view) {
    var changed = S.view !== view;
    S.view = view; S.open = ''; S.formError = ''; S.errors = {};
    if (changed) {
      emit({ type: 'web.step', step: view, label: VIEW_LABEL[view] });
      if (view === 'ticket') {
        var ref = (S.order && S.order.ref) || (S.receipt && S.receipt.ref) || (S.order && S.order.orderId) || '';
        emit({ type: 'web.done', step: view, label: 'Booked, reference ' + ref, value: ref, valueLen: String(ref).length });
      }
    }
    render(true);
  }
  function fail(errs, banner) {
    S.errors = errs;
    var keys = Object.keys(errs);
    S.formError = banner || (keys.length === 1 ? 'There is 1 problem on this page.' : 'There are ' + keys.length + ' problems on this page.');
    keys.forEach(function (k) { emit({ type: 'web.error', field: k, label: errs[k] }); });
    render();
    var first = document.querySelector('.has-err') || $('#form-error');
    if (first) first.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  function slot(list, t) { return list.filter(function (s) { return s.time === t; })[0]; }
  function seatsLeft(cls) {
    var o = slot(S.slots.out, S.trip.out), r = slot(S.slots.ret, S.trip.ret);
    var a = o ? (o.seats[cls] != null ? o.seats[cls] : o.total) : Infinity;
    var b = r ? (r.seats[cls] != null ? r.seats[cls] : r.total) : Infinity;
    return Math.min(a, b);
  }
  function normId(type, v) {
    v = String(v || '').toUpperCase().replace(/[\s-]/g, '');
    return v;
  }
  function idError(type, raw) {
    var v = normId(type, raw);
    if (!v) return '';
    if (type === 'passport' && !/^[A-Z][0-9]{7}$/.test(v)) return 'A passport number is one letter and 7 digits, like A1234567.';
    if (type === 'aadhaar' && !/^[0-9]{12}$/.test(v)) return 'An Aadhaar number has 12 digits.';
    if (type === 'driving-licence' && !/^[A-Z]{2}[0-9]{8,13}$/.test(v)) return 'A driving licence number is 2 letters, then 8 to 13 digits, like MH1420110062.';
    return '';
  }
  function emailOk(e) { return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(e).trim()); }

  function loadSlots() {
    var key = S.trip.route + '|' + S.trip.date;
    if (!S.trip.route || !S.trip.date || S.slots.key === key) return;
    S.slots = { key: key, loading: true, error: '', out: [], ret: [] };
    task(function () {
      return api('GET', 'departures?route=' + encodeURIComponent(S.trip.route) + '&date=' + encodeURIComponent(S.trip.date)).then(function (r) {
        if (S.slots.key !== key) return;
        var d = normDepartures(r);
        S.slots.out = d.out; S.slots.ret = d.ret; S.slots.loading = false;
      }, function (e) {
        if (S.slots.key !== key) return;
        S.slots.loading = false; S.slots.error = 'We could not load the sailings for this day. ' + (e.message || '');
      });
    }).then(function () { render(); });
  }

  function booking(overrides) {
    var b = {
      route: S.trip.route, date: S.trip.date, departure: S.trip.out, 'return': S.trip.ret,
      seatClass: S.pax.seatClass, boardingPoint: S.pax.board,
      passengers: S.pax.list.map(function (p) {
        var o = { name: p.name.trim().replace(/\s+/g, ' '), age: Number(p.age) };
        if (p.idType) o.idType = p.idType;
        if (p.idNumber.trim()) o.idNumber = normId(p.idType, p.idNumber);
        return o;
      })
    };
    if (S.pax.assist.trim()) b.assistance = S.pax.assist.trim();
    if (overrides) Object.keys(overrides).forEach(function (k) { b[k] = overrides[k]; });
    return b;
  }

  function requestQuote(b, after) {
    S.formError = '';
    return task(function () {
      return api('POST', 'quote', b).then(function (q) {
        S.quote = q;
        after && after(q);
      }, function (e) {
        S.formError = 'We could not get a price. ' + (e.message || 'Please try again.');
        emit({ type: 'web.error', field: 'quote', label: S.formError });
      });
    }).then(function () { render(); });
  }

  function altChange(alt) {
    var c = alt && alt.change;
    if (alt && alt.booking) {
      var bk = alt.booking, o = {};
      ['departure', 'return', 'seatClass', 'boardingPoint'].forEach(function (k) { if (bk[k] != null) o[k] = bk[k]; });
      return o;
    }
    if (c && typeof c === 'object') return c;
    var s = ((alt && (alt.id + ' ' + alt.label + ' ' + (c || ''))) || '').toLowerCase();
    var m = /(\d\d:\d\d)/.exec(s);
    if (/cheap|econom/.test(s)) return { seatClass: 'economy' };
    if (/later|10:30/.test(s) || m) return { departure: m ? m[1] : '10:30', seatClass: 'upper-deck' };
    return {};
  }
  var ALT_KIND = { cheaper: 'Cheaper', later: 'Later', earlier: 'Earlier', upgrade: 'More comfort', 'other-jetty': 'Other jetty' };
  function altKicker(alt, i) {
    if (alt.kind && ALT_KIND[alt.kind]) return ALT_KIND[alt.kind];
    if (ALT_KIND[alt.id]) return ALT_KIND[alt.id];
    if (alt.label && alt.label.length < 16) return alt.label;
    return i === 0 ? 'Cheaper' : 'Later';
  }
  function altSub(alt) { return alt.booking && typeof alt.change === 'string' ? alt.change : ''; }
  function altText(alt) {
    if (alt.booking && alt.label && alt.label.length >= 16) return alt.label;
    var ch = altChange(alt), parts = [];
    if (ch.departure && ch.departure !== S.trip.out) parts.push('Leave at ' + ch.departure);
    if (ch['return'] && ch['return'] !== S.trip.ret) parts.push('back at ' + ch['return']);
    if (ch.seatClass) parts.push(className(ch.seatClass));
    if (ch.boardingPoint && ch.boardingPoint !== S.pax.board) parts.push('board at ' + boardName(ch.boardingPoint));
    if ((!ch.departure || ch.departure === S.trip.out) && (!ch['return'] || ch['return'] === S.trip.ret) && ch.seatClass && ch.seatClass !== S.pax.seatClass) parts.push('same times');
    if (typeof alt.change === 'string' && !parts.length) parts.push(alt.change);
    var s = parts.join(', ');
    return s.charAt(0).toUpperCase() + s.slice(1);
  }
  function altIsCurrent(alt) {
    var ch = altChange(alt), cur = { departure: S.trip.out, 'return': S.trip.ret, seatClass: S.pax.seatClass, boardingPoint: S.pax.board };
    return Object.keys(ch).every(function (k) { return cur[k] === ch[k]; });
  }

  function expiryError(v) {
    var m = /^(\d\d) \/ (\d\d)$/.exec(v);
    if (!v) return 'Enter the expiry date.';
    if (!m) return 'Enter the expiry date as MM / YY.';
    var mo = Number(m[1]), yr = 2000 + Number(m[2]);
    if (mo < 1 || mo > 12) return 'The month must be between 01 and 12.';
    var end = new Date(yr, mo, 0, 23, 59, 59);
    if (end < new Date()) return 'This card has expired.';
    return '';
  }

  function pay() {
    var p = S.pay, errs = {};
    var digits = p.number.replace(/\D/g, '');
    if (!digits) errs['pay.number'] = 'Enter the card number.';
    else if (digits.length < 13 || !luhn(digits)) errs['pay.number'] = 'This card number is not valid. Check it and try again.';
    var ee = expiryError(p.expiry); if (ee) errs['pay.expiry'] = ee;
    if (!p.cvc) errs['pay.cvc'] = 'Enter the security code.';
    else if (p.cvc.length < 3) errs['pay.cvc'] = 'The security code is the 3 digits on the back of the card.';
    if (!p.name.trim()) errs['pay.name'] = 'Enter the name on the card.';
    p.declined = '';
    if (Object.keys(errs).length) return fail(errs);
    p.processing = true; S.formError = '';
    render();
    task(function () {
      return sleep(1600).then(function () {
        if (digits !== '4242424242424242') {
          p.processing = false;
          p.declined = 'Your card was declined. Your bank did not approve this payment. Check the details or use another card.';
          emit({ type: 'web.error', field: 'pay.number', label: 'Card declined' });
          return;
        }
        var body = { quoteId: S.quote.quoteId, channel: 'web', card: { last4: digits.slice(-4) }, lane: FLAGS.lane };
        var attempt = function (retry) {
          return api('POST', 'orders', body).then(function (o) {
            S.order = o;
            emit({ type: 'web.submit', field: 'pay.submit', label: 'Paid with the card ending ' + digits.slice(-4), value: o.orderId });
            return api('GET', 'orders/' + encodeURIComponent(o.orderId)).then(function (full) {
              S.receipt = (full && full.receipt) || null;
              if (full && full.ref && !S.order.ref) S.order.ref = full.ref;
            }, function () { /* ticket uses local data */ });
          }, function (e) {
            if (retry && (e.status === 404 || e.status === 409 || e.status === 410)) {
              return api('POST', 'quote', booking()).then(function (q) { S.quote = q; body.quoteId = q.quoteId; return attempt(false); });
            }
            throw e;
          });
        };
        return attempt(true).then(function () {
          p.processing = false;
          go('ticket');
        }, function (e) {
          p.processing = false;
          S.formError = 'We could not complete your booking. ' + (e.message || 'Please try again.');
          emit({ type: 'web.error', field: 'pay.submit', label: S.formError });
        });
      });
    }).then(function () { if (S.view === 'pay') render(); });
  }

  // ---------- clicks ----------
  function onClick(act, val, ev) {
    commitDirty();
    emit({ type: 'web.click', field: act, value: val == null ? undefined : String(val), label: (ev && ev.label) || clickLabel(act, val), t: ev && ev.t });
    var a = S.auth, t = S.trip, px = S.pax, errs;
    switch (act) {
      case 'cookie.necessary': case 'cookie.all':
        S.cookie = act === 'cookie.all' ? 'all' : 'necessary'; break;
      case 'nav.home': if (S.view === 'ticket' || S.view === 'auth' || S.view === 'home') { go('home'); return; } break;
      case 'nav.book': go(S.user ? 'trip' : 'auth'); return;
      case 'nav.signin': if (!S.user) { a.tab = 'signin'; a.phase = 'form'; go('auth'); return; } break;
      case 'auth.tab': a.tab = val === 'signin' ? 'signin' : 'create'; a.phase = 'form'; S.errors = {}; S.formError = ''; break;
      case 'auth.terms': a.terms = !a.terms; clearError('auth.terms'); break;
      case 'auth.create':
        if (FLAGS.quick) {
          S.user = { email: (a.email || '').trim().toLowerCase() || 'guest' };
          S.errors = {}; S.formError = '';
          emit({ type: 'web.submit', field: 'auth.create', label: 'Signed in' });
          go('trip'); return;
        }
        errs = {};
        if (!a.email.trim()) errs['auth.email'] = 'Enter your email address.';
        else if (!emailOk(a.email)) errs['auth.email'] = 'Enter an email address like name@example.com.';
        else if (S.accounts[a.email.trim().toLowerCase()]) errs['auth.email'] = 'There is already an account with this email. Sign in instead.';
        if (!a.password) errs['auth.password'] = 'Create a password.';
        else if (a.password.length < 8) errs['auth.password'] = 'Use at least 8 characters.';
        else if (!/\d/.test(a.password) || !/[a-z]/i.test(a.password)) errs['auth.password'] = 'Use at least one letter and one number.';
        if (!a.password2) errs['auth.password2'] = 'Type your password again.';
        else if (a.password && a.password2 !== a.password) errs['auth.password2'] = 'The passwords do not match.';
        if (!a.terms) errs['auth.terms'] = 'Tick the box to accept the terms.';
        if (Object.keys(errs).length) return fail(errs);
        a.pendingEmail = a.email.trim().toLowerCase();
        a.phase = 'code'; a.code = ''; committed['auth.code'] = '';
        S.errors = {}; S.formError = '';
        emit({ type: 'web.submit', field: 'auth.create', label: 'Created an account' });
        sendCode();
        break;
      case 'auth.signin':
        if (FLAGS.quick) {
          S.user = { email: (a.siEmail || '').trim().toLowerCase() || 'guest' };
          S.errors = {}; S.formError = '';
          emit({ type: 'web.submit', field: 'auth.signin', label: 'Signed in' });
          go('trip'); return;
        }
        errs = {};
        var se = a.siEmail.trim().toLowerCase();
        if (!se) errs['auth.siEmail'] = 'Enter your email address.';
        else if (!emailOk(se)) errs['auth.siEmail'] = 'Enter an email address like name@example.com.';
        else if (!S.accounts[se]) errs['auth.siEmail'] = 'We could not find an account with this email. Create an account first.';
        if (!a.siPassword) errs['auth.siPassword'] = 'Enter your password.';
        else if (S.accounts[se] && S.accounts[se] !== a.siPassword) errs['auth.siPassword'] = 'That password is not right.';
        if (Object.keys(errs).length) return fail(errs);
        S.user = { email: se };
        emit({ type: 'web.submit', field: 'auth.signin', label: 'Signed in' });
        go('trip'); return;
      case 'auth.verify':
        if (!a.code) return fail({ 'auth.code': 'Enter the 6-digit code from the message.' });
        if (a.code.length < 6) return fail({ 'auth.code': 'The code has 6 digits.' });
        if (a.code !== codeFor(a.pendingEmail)) return fail({ 'auth.code': 'That code is not right. Check the newest message and try again.' });
        S.accounts[a.pendingEmail] = a.password;
        S.user = { email: a.pendingEmail };
        a.toast = false; clearTimeout(toastTimer);
        emit({ type: 'web.submit', field: 'auth.verify', label: 'Email code accepted' });
        go('trip'); return;
      case 'auth.resend': a.toast = false; sendCode(); break;
      case 'auth.back': a.phase = 'form'; a.toast = false; clearTimeout(toastTimer); break;
      case 'toast.close': a.toast = false; break;

      case 'trip.route.toggle': S.open = S.open === 'route' ? '' : 'route'; break;
      case 'trip.route.pick':
        if (t.route !== val) { t.route = val; t.out = ''; t.ret = ''; }
        S.open = ''; clearError('trip.route'); loadSlots(); break;
      case 'trip.date.toggle':
        S.open = S.open === 'date' ? '' : 'date';
        if (!t.calMonth) t.calMonth = (t.date || ymd(new Date())).slice(0, 7);
        break;
      case 'trip.cal.prev': case 'trip.cal.next': {
        var cm = parseYmd((t.calMonth || ymd(new Date()).slice(0, 7)) + '-01');
        cm.setMonth(cm.getMonth() + (act === 'trip.cal.next' ? 1 : -1));
        t.calMonth = ymd(cm).slice(0, 7); break;
      }
      case 'trip.date.pick':
        if (!dateAllowed(val)) break;
        if (t.date !== val) { t.date = val; t.out = ''; t.ret = ''; }
        t.calMonth = val.slice(0, 7); S.open = ''; clearError('trip.date'); loadSlots(); break;
      case 'trip.out': {
        var so = slot(S.slots.out, val);
        if (!so || so.soldOut) break;
        t.out = val; clearError('trip.out'); clearError('trip.ret'); break;
      }
      case 'trip.ret': {
        var sr = slot(S.slots.ret, val);
        if (!sr || sr.soldOut) break;
        t.ret = val; clearError('trip.ret'); break;
      }
      case 'trip.next':
        errs = {};
        if (!t.route) errs['trip.route'] = 'Choose a route.';
        if (!t.date) errs['trip.date'] = 'Choose a date.';
        if (t.route && t.date && !t.out) errs['trip.out'] = 'Choose a departure time.';
        if (t.route && t.date && !t.ret) errs['trip.ret'] = 'Choose a return time.';
        if (t.out && t.ret && mins(t.ret) - mins(t.out) < 120) {
          errs['trip.ret'] = 'Your return must be at least 2 hours after you leave. Pick a boat at ' + hhmm(mins(t.out) + 120) + ' or later.';
        }
        if (Object.keys(errs).length) return fail(errs);
        emit({ type: 'web.submit', field: 'trip.next', label: 'Trip chosen: ' + fmtDate(t.date) + ', ' + t.out + ' and back at ' + t.ret });
        go('passengers'); return;
      case 'step.goto': {
        var target = STEPS.indexOf(val), cur = STEPS.indexOf(S.view);
        if (target >= 0 && cur >= 0 && target < cur) { go(val); return; }
        break;
      }

      case 'pax.inc': if (px.list.length < 8) { px.list.push(blankPax()); clearError('pax.count'); } break;
      case 'pax.dec': if (px.list.length > 1) { px.list.pop(); } break;
      case 'pax.idtype.toggle': { var key = 'idtype:' + val; S.open = S.open === key ? '' : key; break; }
      case 'pax.idtype.pick': {
        var parts = String(val).split(':'), i = Number(parts[0]);
        if (px.list[i]) { px.list[i].idType = parts[1]; clearError('pax.' + i + '.idType'); clearError('pax.' + i + '.idNumber'); }
        S.open = ''; break;
      }
      case 'pax.class': if (seatsLeft(val) > 0) { px.seatClass = val; clearError('pax.class'); } break;
      case 'pax.board': px.board = val; clearError('pax.board'); break;
      case 'pax.back': go('trip'); return;
      case 'pax.next': {
        errs = {};
        px.list.forEach(function (p, i) {
          var k = 'pax.' + i + '.';
          var name = p.name.trim();
          if (!name) errs[k + 'name'] = 'Enter the full name, as it is on the ID.';
          else if (name.split(/\s+/).length < 2) errs[k + 'name'] = 'Enter a first and a last name.';
          var age = p.age === '' ? NaN : Number(p.age);
          if (p.age === '') errs[k + 'age'] = 'Enter age.';
          else if (!(age >= 0 && age <= 110)) errs[k + 'age'] = 'Age 0 to 110.';
          var needId = age >= 18;
          if (needId && !p.idType) errs[k + 'idType'] = 'Choose an ID type.';
          if (needId && !p.idNumber.trim()) errs[k + 'idNumber'] = 'Enter the ID number. Everyone 18 or over needs one.';
          else if (p.idNumber.trim() && !p.idType) errs[k + 'idType'] = 'Choose an ID type.';
          else if (p.idNumber.trim()) { var ie = idError(p.idType, p.idNumber); if (ie) errs[k + 'idNumber'] = ie; }
        });
        if (!px.seatClass) errs['pax.class'] = 'Choose where you want to sit.';
        else {
          var left = seatsLeft(px.seatClass);
          if (left < px.list.length) errs['pax.class'] = 'Only ' + left + ' ' + className(px.seatClass).toLowerCase() + ' seats are left on these boats. Choose another class or fewer passengers.';
        }
        if (!px.board) errs['pax.board'] = 'Choose where you will board.';
        if (Object.keys(errs).length) return fail(errs);
        emit({ type: 'web.submit', field: 'pax.next', label: 'Asked for the price' });
        S.formError = '';
        render();
        requestQuote(booking(), function () { S.review = { terms: false, note: '' }; go('review'); });
        return;
      }

      case 'review.alt': {
        var alts = (S.quote && S.quote.alternatives) || [];
        var alt = alts[Number(val)] || alts.filter(function (x) { return x.id === val; })[0];
        if (!alt || altIsCurrent(alt)) break;
        var ch = altChange(alt), prev = { out: t.out, ret: t.ret, cls: px.seatClass, board: px.board };
        var note = 'Changed to: ' + altText(alt) + '.';
        if (ch.departure) t.out = ch.departure;
        if (ch['return']) t.ret = ch['return'];
        if (ch.seatClass) px.seatClass = ch.seatClass;
        if (ch.boardingPoint) px.board = ch.boardingPoint;
        render();
        requestQuote(booking(), function () { S.review.note = note; S.review.terms = false; }).then(function () {
          if (!S.quote || S.formError) { t.out = prev.out; t.ret = prev.ret; px.seatClass = prev.cls; px.board = prev.board; render(); }
        });
        return;
      }
      case 'review.terms': S.review.terms = !S.review.terms; clearError('review.terms'); break;
      case 'review.back': go('passengers'); return;
      case 'review.next':
        if (!S.review.terms) return fail({ 'review.terms': 'Tick the box to accept the conditions of carriage.' });
        emit({ type: 'web.submit', field: 'review.next', label: 'Accepted the price, ' + fmtU(S.quote.total) + ' USDC' });
        go('pay'); return;

      case 'pay.back': if (!S.pay.processing) { go('review'); return; } break;
      case 'pay.submit': if (!S.pay.processing) { pay(); return; } break;
      case 'ticket.new': resetBooking(); go('trip'); return;
      case 'popover.close': S.open = ''; break;
      default: return;
    }
    render();
  }

  function sendCode() {
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { S.auth.toast = true; renderToast(); }, FLAGS.demo ? 0 : 3000);
  }
  function resetBooking() {
    S.trip = { route: '', date: '', out: '', ret: '', calMonth: '' };
    S.slots = { key: '', loading: false, error: '', out: [], ret: [] };
    S.pax = { list: [blankPax()], seatClass: '', board: '', assist: '' };
    S.quote = null; S.review = { terms: false, note: '' };
    S.pay = { number: '', expiry: '', cvc: '', name: '', processing: false, declined: '' };
    S.order = null; S.receipt = null; committed = {}; dirty = {};
  }
  // dates before today are closed; 4 to 30 Nov 2026 always stay open so the demo date works on any day
  function minDate() { var today = ymd(new Date()); return today < '2026-11-04' ? today : '2026-11-04'; }
  function maxDate() { var m = new Date(); m.setDate(m.getDate() + 120); var s = ymd(m); return s > '2026-11-30' ? s : '2026-11-30'; }
  function dateAllowed(s) { return /^\d{4}-\d\d-\d\d$/.test(String(s)) && s >= minDate() && s <= maxDate(); }

  // ---------- rendering ----------
  function field(o) {
    var err = S.errors[o.f];
    var v = getField(o.f);
    return '<label class="fld' + (err ? ' has-err' : '') + (o.cls ? ' ' + o.cls : '') + '" data-wrap="' + esc(o.f) + '">' +
      '<span class="fld-label">' + esc(o.label) + (o.opt ? ' <span class="opt">optional</span>' : '') + '</span>' +
      (o.area
        ? '<textarea class="inp" data-field="' + esc(o.f) + '" rows="3" maxlength="300" placeholder="' + esc(o.ph || '') + '" spellcheck="false">' + esc(v) + '</textarea>'
        : '<input class="inp' + (o.big ? ' inp-big' : '') + '" data-field="' + esc(o.f) + '" type="' + (o.type || 'text') + '" value="' + esc(v) + '"' +
          ' autocomplete="' + (o.type === 'password' ? 'new-password' : 'off') + '" autocapitalize="off" autocorrect="off" spellcheck="false"' +
          (o.mode ? ' inputmode="' + o.mode + '"' : '') + (o.max ? ' maxlength="' + o.max + '"' : '') +
          (o.enter ? ' data-enter="' + o.enter + '"' : '') +
          ' placeholder="' + esc(o.ph || '') + '" aria-invalid="' + (!!err) + '">') +
      (o.hint ? '<span class="fld-hint">' + o.hint + '</span>' : '') +
      '<span class="fld-err" role="alert">' + (err ? esc(err) : '') + '</span>' +
      '</label>';
  }
  function errText(f) { return '<span class="fld-err" role="alert">' + (S.errors[f] ? esc(S.errors[f]) : '') + '</span>'; }
  function checkbox(act, on, f, html) {
    return '<div class="check' + (S.errors[f] ? ' has-err' : '') + '" data-wrap="' + f + '">' +
      '<button type="button" class="check-box' + (on ? ' on' : '') + '" role="checkbox" aria-checked="' + on + '" data-act="' + act + '">' + I('check') + '</button>' +
      '<span class="check-text" data-act="' + act + '">' + html + '</span>' + errText(f) + '</div>';
  }

  function header() {
    var u = S.user;
    return '<header class="top"><div class="top-in">' +
      '<button type="button" class="brand" data-act="nav.home" aria-label="Harbour Line home">' + A.mark(32) +
      '<span class="wordmark">Harbour<span class="wm-line">Line</span></span></button>' +
      '<nav class="top-nav" aria-label="Main"><span>Timetable</span><span>Fares</span><span>Island guide</span><span>Help</span></nav>' +
      '<div class="top-user">' + (u
        ? '<span class="avatar">' + esc(u.email.charAt(0).toUpperCase()) + '</span><span class="who">' + esc(u.email) + '</span>'
        : '<button type="button" class="link-btn" data-act="nav.signin">Sign in</button>') +
      '</div></div></header>';
  }

  function viewHome() {
    return '<section class="hero">' + A.hero('0 0 1200 460', 'hero-wide') + A.hero('420 40 780 420', 'hero-narrow') +
      '<div class="hero-in"><div class="hero-copy">' +
      '<p class="eyebrow">' + I('wave') + 'Gateway of India to Elephanta Island</p>' +
      '<h1>Cross the harbour to the island of caves</h1>' +
      '<p class="lede">Daily sailings from the Gateway of India. About an hour each way, with open-air seats on the upper deck.</p>' +
      '<div class="hero-cta"><button type="button" class="btn btn-sand btn-lg" data-act="nav.book">Book tickets ' + I('arrowRight') + '</button>' +
      '<span class="hero-note">' + I('info') + 'Weekend tickets are sold online only</span></div>' +
      '</div></div></section>' +
      '<section class="facts"><div class="wrap facts-in">' +
      '<div class="fact">' + I('clock') + '<div><b>First boat 09:00</b><span>Last boat back 17:00</span></div></div>' +
      '<div class="fact">' + I('ramp') + '<div><b>Step-free at jetty 4</b><span>Ramp and handrail onto the boat</span></div></div>' +
      '<div class="fact">' + I('shelter') + '<div><b>Free cancellation</b><span>Until 18:00 the day before</span></div></div>' +
      '</div></section>' +
      '<section class="wrap timetable">' +
      '<div class="tt-head"><h2>Weekend timetable</h2><p>Gateway of India and Elephanta Island</p></div>' +
      '<div class="tt">' +
      '<div class="tt-col"><h3>From the Gateway</h3><ul>' + ['09:00', '09:30', '10:00', '10:30', '11:30'].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>' +
      '<div class="tt-col"><h3>Back from Elephanta</h3><ul>' + ['12:30', '14:00', '15:30', '17:00'].map(function (x) { return '<li>' + x + '</li>'; }).join('') + '</ul></div>' +
      '</div><p class="muted small">Times can change with the weather. On weekdays there are fewer boats.</p></section>';
  }

  function viewAuth() {
    var a = S.auth, body;
    if (a.phase === 'code') {
      body = '<div class="auth-code">' +
        '<span class="auth-icon">' + I('mail') + '</span>' +
        '<h2>Check your email</h2>' +
        '<p>We sent a 6-digit code to <b>' + esc(a.pendingEmail) + '</b>. It can take a moment to arrive.</p>' +
        field({ f: 'auth.code', label: 'Code', mode: 'numeric', max: 7, big: true, enter: 'auth.verify', ph: '000000' }) +
        '<button type="button" class="btn btn-primary btn-block" data-act="auth.verify">Verify and continue</button>' +
        '<div class="auth-links"><button type="button" class="link-btn" data-act="auth.resend">Send the code again</button>' +
        '<button type="button" class="link-btn" data-act="auth.back">Use a different email</button></div></div>';
    } else if (a.tab === 'signin') {
      body = '<div class="auth-form">' +
        field({ f: 'auth.siEmail', label: 'Email address', mode: 'email', enter: 'auth.signin' }) +
        field({ f: 'auth.siPassword', label: 'Password', type: 'password', enter: 'auth.signin' }) +
        '<button type="button" class="btn btn-primary btn-block" data-act="auth.signin">Sign in</button>' +
        '<p class="auth-alt">New to Harbour Line? <button type="button" class="link-btn" data-act="auth.tab" data-val="create">Create an account</button></p></div>';
    } else {
      body = '<div class="auth-form">' +
        field({ f: 'auth.email', label: 'Email address', mode: 'email', enter: 'auth.create' }) +
        '<div class="row2">' +
        field({ f: 'auth.password', label: 'Password', type: 'password', hint: 'At least 8 characters, with a number', enter: 'auth.create' }) +
        field({ f: 'auth.password2', label: 'Repeat password', type: 'password', enter: 'auth.create' }) + '</div>' +
        checkbox('auth.terms', a.terms, 'auth.terms', 'I agree to the <u>terms of use</u> and the <u>privacy notice</u>.') +
        '<button type="button" class="btn btn-primary btn-block" data-act="auth.create">Create account</button>' +
        '<p class="auth-alt">Already have an account? <button type="button" class="link-btn" data-act="auth.tab" data-val="signin">Sign in</button></p></div>';
    }
    var tabs = a.phase === 'code' ? '' :
      '<div class="tabs" role="tablist">' +
      '<button type="button" role="tab" class="tab' + (a.tab === 'create' ? ' on' : '') + '" data-act="auth.tab" data-val="create">Create account</button>' +
      '<button type="button" role="tab" class="tab' + (a.tab === 'signin' ? ' on' : '') + '" data-act="auth.tab" data-val="signin">Sign in</button></div>';
    return '<section class="auth wrap">' +
      '<div class="auth-card card">' +
      '<div class="auth-head"><h1>Sign in to book</h1><p>You need a Harbour Line account to buy tickets online.</p></div>' +
      formError() + tabs + body + '</div>' +
      '<aside class="auth-side">' + A.boatBadge() +
      '<ul><li>' + I('check') + 'Your tickets in one place</li><li>' + I('check') + 'Change or cancel a booking</li><li>' + I('check') + 'Faster boarding at the gate</li></ul></aside>' +
      '</section>';
  }

  function stepper() {
    var cur = STEPS.indexOf(S.view);
    return '<ol class="steps">' + STEPS.map(function (s, i) {
      var cls = i < cur ? 'done' : i === cur ? 'cur' : 'todo';
      var inner = '<span class="n">' + (i < cur ? I('check') : (i + 1)) + '</span><span class="t">' + VIEW_LABEL[s] + '</span>';
      return '<li class="' + cls + '">' + (i < cur && !S.pay.processing
        ? '<button type="button" data-act="step.goto" data-val="' + s + '">' + inner + '</button>' : '<span>' + inner + '</span>') + '</li>';
    }).join('') + '</ol>';
  }

  function estimate() {
    var c = S.cat && S.cat.classes.filter(function (x) { return x.id === S.pax.seatClass; })[0];
    if (S.quote && ['review', 'pay'].indexOf(S.view) >= 0) return { total: S.quote.total, exact: true };
    if (!c) return null;
    var paying = S.pax.list.filter(function (p) { return !(p.age !== '' && Number(p.age) < 5); }).length;
    return { total: Math.round(paying * priceOf(c.id) * 100) / 100, exact: false };
  }

  function summary() {
    var t = S.trip, est = estimate();
    function row(k, v) { return '<div class="sum-row"><dt>' + k + '</dt><dd>' + (v ? esc(v) : '<span class="dash">Not chosen</span>') + '</dd></div>'; }
    return '<div class="sum card">' +
      '<div class="sum-art">' + A.boatBadge() + '</div>' +
      '<h3>Your trip</h3><dl>' +
      row('Route', t.route ? routeName(t.route) : '') +
      row('Date', t.date ? fmtDate(t.date, true) : '') +
      row('Leaving', t.out) + row('Back', t.ret) +
      row('Passengers', String(S.pax.list.length)) +
      row('Seats', S.pax.seatClass ? className(S.pax.seatClass) : '') +
      row('Boarding', S.pax.board ? boardName(S.pax.board) : '') +
      '</dl>' +
      (est ? '<div class="sum-total"><span>' + (est.exact ? 'Total' : 'Estimated total') + '</span><b>' + fmtU(est.total) + ' USDC</b><small>About ₹' + inr(est.total) + '</small></div>' : '') +
      '<p class="sum-note">' + I('shelter') + 'Free cancellation until 18:00 the day before.</p>' +
      '</div>';
  }
  function miniSummary() {
    var t = S.trip, bits = [];
    if (t.date) bits.push(fmtDate(t.date)); if (t.out) bits.push(t.out + (t.ret ? ' to ' + t.ret : ''));
    bits.push(S.pax.list.length + (S.pax.list.length === 1 ? ' passenger' : ' passengers'));
    var est = estimate(); if (est) bits.push(fmtU(est.total) + ' USDC');
    return '<div class="mini-sum">' + A.ribbon() + '<span>' + esc(bits.join(' · ')) + '</span></div>';
  }
  function formError() {
    return S.formError ? '<div class="banner banner-err" id="form-error" role="alert">' + I('alert') + '<span>' + esc(S.formError) + '</span></div>' : '';
  }
  function bookShell(main) {
    return '<div class="book-head"><div class="wrap">' +
      '<div class="book-title"><span class="route-tag">' + I('pin') + (S.trip.route ? esc(routeName(S.trip.route)) : 'Book a crossing') + '</span></div>' +
      stepper() + '</div></div>' +
      '<div class="wrap book-grid"><div class="book-main">' + miniSummary() + formError() + main + '</div>' +
      '<aside class="book-aside">' + summary() + '</aside></div>';
  }

  function calendar() {
    var t = S.trip;
    var first = parseYmd((t.calMonth || ymd(new Date()).slice(0, 7)) + '-01');
    var y = first.getFullYear(), m = first.getMonth();
    var startDow = (first.getDay() + 6) % 7; // Monday first
    var daysIn = new Date(y, m + 1, 0).getDate();
    var today = ymd(new Date());
    var minMonth = minDate().slice(0, 7);
    var cells = '';
    for (var i = 0; i < startDow; i++) cells += '<span class="day empty"></span>';
    for (var d = 1; d <= daysIn; d++) {
      var s = y + '-' + pad(m + 1) + '-' + pad(d);
      var dow = new Date(y, m, d).getDay();
      var ok = dateAllowed(s);
      var cls = 'day' + (s === t.date ? ' sel' : '') + (s === today ? ' today' : '') + (dow === 6 || dow === 0 ? ' wknd' : '');
      cells += ok
        ? '<button type="button" class="' + cls + '" data-act="trip.date.pick" data-val="' + s + '" aria-label="' + fmtDate(s, true) + '">' + d + '</button>'
        : '<span class="' + cls + ' off">' + d + '</span>';
    }
    var prevOk = (y + '-' + pad(m + 1)) > minMonth;
    return '<div class="pop cal" role="dialog" aria-label="Choose a date">' +
      '<div class="cal-head"><button type="button" class="cal-nav" data-act="trip.cal.prev"' + (prevOk ? '' : ' disabled') + ' aria-label="Previous month">' + I('chevronLeft') + '</button>' +
      '<b>' + MONTHS[m] + ' ' + y + '</b>' +
      '<button type="button" class="cal-nav" data-act="trip.cal.next" aria-label="Next month">' + I('chevronRight') + '</button></div>' +
      '<div class="cal-grid">' + ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su'].map(function (x) { return '<span class="dow">' + x + '</span>'; }).join('') + cells + '</div>' +
      '<div class="cal-foot"><span class="dot"></span>More boats on Saturdays and Sundays</div></div>';
  }

  function chips(list, act, sel, kind) {
    if (S.slots.loading) return '<div class="chips">' + [1, 2, 3, 4].map(function () { return '<span class="chip skel"></span>'; }).join('') + '</div>';
    if (S.slots.error) return '<div class="banner banner-err">' + I('alert') + '<span>' + esc(S.slots.error) + '</span></div>';
    if (!list.length) return '<p class="muted">No boats on this day. Try another date.</p>';
    return '<div class="chips" role="listbox">' + list.map(function (s, i) {
      var up = s.seats['upper-deck'];
      var note = '', full = false;
      if (!s.soldOut && up === 0) { note = 'Upper deck sold out'; full = true; }
      else if (!s.soldOut && up != null && up < 10) note = 'Upper deck: ' + up + ' left';
      if (kind === 'ret' && i === list.length - 1 && !note) note = 'Last boat';
      var low = !s.soldOut && s.total < 15;
      return '<button type="button" class="chip' + (sel === s.time ? ' sel' : '') + (s.soldOut ? ' sold' : '') + (low ? ' low' : '') + '"' +
        ' data-act="' + act + '" data-val="' + s.time + '"' + (s.soldOut ? ' disabled aria-disabled="true"' : '') + ' aria-pressed="' + (sel === s.time) + '">' +
        '<span class="chip-time">' + s.time + '</span>' +
        '<span class="chip-seats">' + (s.soldOut ? 'Sold out' : s.total + ' seats left') + '</span>' +
        (note ? '<span class="chip-note' + (full ? ' full' : '') + '">' + note + '</span>' : '') +
        '</button>';
    }).join('') + '</div>';
  }

  function viewTrip() {
    var t = S.trip, cat = S.cat || { routes: [] };
    var r = cat.routes.filter(function (x) { return x.id === t.route; })[0];
    var dd = '<div class="dd' + (S.open === 'route' ? ' open' : '') + (S.errors['trip.route'] ? ' has-err' : '') + '" data-wrap="trip.route">' +
      '<span class="fld-label">Route</span>' +
      '<button type="button" class="dd-btn" data-act="trip.route.toggle" aria-haspopup="listbox" aria-expanded="' + (S.open === 'route') + '">' +
      '<span class="dd-val">' + (r ? '<b>' + esc(r.from) + '</b><span class="to">to</span><b>' + esc(r.to) + '</b>' : '<span class="ph">Choose a route</span>') + '</span>' + I('chevronDown', 'chev') + '</button>' +
      (S.open === 'route' ? '<div class="pop dd-list" role="listbox">' + cat.routes.map(function (x) {
        return '<button type="button" class="dd-opt' + (x.id === t.route ? ' sel' : '') + '" role="option" data-act="trip.route.pick" data-val="' + esc(x.id) + '">' +
          '<span class="dd-opt-main">' + esc(x.from) + ' to ' + esc(x.to) + '</span><span class="dd-opt-sub">' + esc(x.duration) + '</span>' +
          (x.id === t.route ? I('check', 'tick') : '') + '</button>';
      }).join('') + '</div>' : '') + errText('trip.route') + '</div>';
    var date = '<div class="dd' + (S.open === 'date' ? ' open' : '') + (S.errors['trip.date'] ? ' has-err' : '') + '" data-wrap="trip.date">' +
      '<span class="fld-label">Date</span>' +
      '<button type="button" class="dd-btn" data-act="trip.date.toggle" aria-haspopup="dialog" aria-expanded="' + (S.open === 'date') + '">' +
      I('calendar', 'lead') + '<span class="dd-val">' + (t.date ? '<b>' + fmtDate(t.date, true) + '</b>' : '<span class="ph">Choose a date</span>') + '</span>' + I('chevronDown', 'chev') + '</button>' +
      (S.open === 'date' ? calendar() : '') + errText('trip.date') + '</div>';
    var times = '';
    if (t.route && t.date) {
      var dest = r ? r.to.replace(/ Island| Jetty/, '') : 'the island';
      times = '<section class="panel">' +
        '<div class="slot-group' + (S.errors['trip.out'] ? ' has-err' : '') + '" data-wrap="trip.out"><h3>Leaving the Gateway</h3>' + chips(S.slots.out, 'trip.out', t.out, 'out') + errText('trip.out') + '</div>' +
        '<div class="slot-group' + (S.errors['trip.ret'] ? ' has-err' : '') + '" data-wrap="trip.ret"><h3>Coming back from ' + esc(dest) + '</h3>' + chips(S.slots.ret, 'trip.ret', t.ret, 'ret') + errText('trip.ret') + '</div>' +
        '<p class="muted small">' + I('clock') + 'The crossing takes about an hour. Plan at least 2 hours on the island.</p>' +
        '</section>';
    } else {
      times = '<section class="panel panel-quiet"><p class="muted">' + I('clock') + 'Choose a route and a date to see the boats and the seats left.</p></section>';
    }
    return bookShell(
      '<section class="panel"><h2>Where and when</h2><div class="row2">' + dd + date + '</div></section>' + times +
      '<div class="actions"><span></span><button type="button" class="btn btn-primary btn-lg" data-act="trip.next">Continue to passengers ' + I('arrowRight') + '</button></div>');
  }

  function paxBlock(p, i) {
    var k = 'pax.' + i + '.';
    var open = S.open === 'idtype:' + i;
    var tsel = ID_TYPES.filter(function (x) { return x.id === p.idType; })[0];
    var idSel = '<div class="sel' + (open ? ' open' : '') + (S.errors[k + 'idType'] ? ' has-err' : '') + ' a-idt" data-wrap="' + k + 'idType">' +
      '<span class="fld-label">ID type</span>' +
      '<button type="button" class="dd-btn" data-act="pax.idtype.toggle" data-val="' + i + '" aria-haspopup="listbox" aria-expanded="' + open + '">' +
      '<span class="dd-val">' + (tsel ? '<b>' + tsel.name + '</b>' : '<span class="ph">Choose</span>') + '</span>' + I('chevronDown', 'chev') + '</button>' +
      (open ? '<div class="pop dd-list" role="listbox">' + ID_TYPES.map(function (x) {
        return '<button type="button" class="dd-opt' + (x.id === p.idType ? ' sel' : '') + '" role="option" data-act="pax.idtype.pick" data-val="' + i + ':' + x.id + '">' +
          '<span class="dd-opt-main">' + x.name + '</span>' + (x.id === p.idType ? I('check', 'tick') : '') + '</button>';
      }).join('') + '</div>' : '') + errText(k + 'idType') + '</div>';
    var age = Number(p.age);
    var tag = p.age !== '' && age < 5 ? '<span class="tag tag-sea">Travels free</span>' : p.age !== '' && age < 18 ? '<span class="tag">ID not needed</span>' : '';
    return '<fieldset class="pax">' +
      '<legend><span class="pax-n">' + (i + 1) + '</span>Passenger ' + (i + 1) + (i === 0 ? ' <span class="muted">(lead)</span>' : '') + tag + '</legend>' +
      '<div class="pax-grid">' +
      field({ f: k + 'name', label: 'Full name, as on the ID', cls: 'a-name' }) +
      field({ f: k + 'age', label: 'Age', mode: 'numeric', max: 3, cls: 'a-age' }) +
      idSel +
      field({ f: k + 'idNumber', label: 'ID number', cls: 'a-idn', ph: tsel ? tsel.ph : '' }) +
      '</div></fieldset>';
  }

  function viewPassengers() {
    var px = S.pax, cat = S.cat || { classes: [], boarding: [] };
    var o = slot(S.slots.out, S.trip.out);
    var icons = { economy: 'shelter', 'upper-deck': 'sun', 'upper-deck-guide': 'guide' };
    var classes = cat.classes.map(function (c) {
      var left = seatsLeft(c.id), sold = left <= 0;
      var avail = sold ? 'Sold out on the ' + (o && o.seats[c.id] === 0 ? S.trip.out : S.trip.ret) : left < 10 ? 'Only ' + left + ' seats left' : 'Seats available';
      return '<button type="button" class="opt-card' + (px.seatClass === c.id ? ' sel' : '') + (sold ? ' sold' : '') + '" data-act="pax.class" data-val="' + esc(c.id) + '"' + (sold ? ' disabled aria-disabled="true"' : '') + ' aria-pressed="' + (px.seatClass === c.id) + '">' +
        '<span class="oc-top"><span class="oc-icon">' + I(icons[c.id] || 'seat') + '</span><span class="oc-check">' + I('check') + '</span></span>' +
        '<span class="oc-name">' + esc(c.name) + '</span>' +
        '<span class="oc-desc">' + esc(c.description) + '</span>' +
        '<span class="oc-price"><b>' + fmtU(priceOf(c.id)) + ' USDC</b><small>About ₹' + inr(priceOf(c.id)) + ' a person, return</small></span>' +
        '<span class="oc-avail' + (sold ? ' sold' : left < 10 ? ' low' : '') + '">' + avail + '</span>' +
        '</button>';
    }).join('');
    var boards = cat.boarding.map(function (b) {
      return '<button type="button" class="opt-card opt-row' + (px.board === b.id ? ' sel' : '') + '" data-act="pax.board" data-val="' + esc(b.id) + '" aria-pressed="' + (px.board === b.id) + '">' +
        '<span class="oc-icon">' + I(b.stepFree ? 'ramp' : 'steps') + '</span>' +
        '<span class="oc-body"><span class="oc-name">' + esc(b.name) + (b.stepFree ? ' <span class="tag tag-sea">Step-free</span>' : '') + '</span>' +
        '<span class="oc-desc">' + esc(b.description) + '</span></span>' +
        '<span class="oc-check">' + I('check') + '</span></button>';
    }).join('');
    return bookShell(
      '<section class="panel">' +
      '<div class="panel-head"><h2>Who is travelling</h2>' +
      '<div class="stepper" data-wrap="pax.count"><button type="button" class="step-btn" data-act="pax.dec" aria-label="Remove a passenger"' + (px.list.length <= 1 ? ' disabled' : '') + '>' + I('minus') + '</button>' +
      '<output aria-live="polite"><b>' + px.list.length + '</b><span>' + (px.list.length === 1 ? 'passenger' : 'passengers') + '</span></output>' +
      '<button type="button" class="step-btn" data-act="pax.inc" aria-label="Add a passenger"' + (px.list.length >= 8 ? ' disabled' : '') + '>' + I('plus') + '</button></div></div>' +
      '<p class="muted small">' + I('info') + 'Children under 5 travel free. Everyone 18 or over needs a photo ID on board.</p>' +
      px.list.map(paxBlock).join('') + '</section>' +
      '<section class="panel' + (S.errors['pax.class'] ? ' has-err' : '') + '" data-wrap="pax.class"><h2>Where you sit</h2>' +
      '<p class="muted small">Prices are per person, for the return trip.</p>' +
      '<div class="cards3">' + classes + '</div>' + errText('pax.class') + '</section>' +
      '<section class="panel' + (S.errors['pax.board'] ? ' has-err' : '') + '" data-wrap="pax.board"><h2>Where you board</h2><div class="cards2">' + boards + '</div>' + errText('pax.board') + '</section>' +
      '<section class="panel"><h2>Special assistance <span class="opt">optional</span></h2>' +
      '<p class="muted small">Tell the crew if anyone needs help getting on or off the boat.</p>' +
      field({ f: 'pax.assist', label: 'Message to the crew', area: true, ph: 'For example: one passenger uses a wheelchair.' }) +
      '<span class="count" id="assist-count">' + px.assist.length + ' / 300</span></section>' +
      '<div class="actions"><button type="button" class="btn btn-ghost" data-act="pax.back">' + I('arrowLeft') + 'Back</button>' +
      '<button type="button" class="btn btn-primary btn-lg" data-act="pax.next"' + (S.busy ? ' aria-busy="true"' : '') + '>Check the price ' + I('arrowRight') + '</button></div>');
  }

  function viewReview() {
    var q = S.quote;
    if (!q) return bookShell('<section class="panel"><p class="muted">Getting your price.</p></section>');
    var t = S.trip, px = S.pax;
    var alts = (q.alternatives || []).slice(0, 2);
    var names = px.list.map(function (p) { return esc(p.name.trim()) + ' <span class="muted">(' + esc(p.age) + ')</span>'; }).join('<br>');
    function rrow(k, v, goto) {
      return '<div class="rv-row"><dt>' + k + '</dt><dd>' + v + '</dd>' +
        (goto ? '<button type="button" class="link-btn rv-change" data-act="step.goto" data-val="' + goto + '">Change</button>' : '') + '</div>';
    }
    var lines = (q.lines || []).map(function (l) {
      var free = !num(l.amount) && !num(l.unit);
      return '<tr><td>' + esc(l.label) + (l.qty != null && !(free && Number(l.qty) === 1) ? ' <span class="muted">× ' + l.qty + '</span>' : '') + '</td><td class="num">' + (free ? 'Free' : fmtU(l.amount)) + '</td></tr>';
    }).join('');
    var altHtml = alts.map(function (alt, i) {
      var cur = altIsCurrent(alt);
      var diff = num(alt.total) - num(q.total);
      var dtxt = Math.abs(diff) < 0.005 ? 'Same price' : diff < 0 ? fmtU(-diff) + ' USDC less' : fmtU(diff) + ' USDC more';
      var kicker = altKicker(alt, i), sub = altSub(alt);
      return '<div class="alt' + (cur ? ' cur' : '') + '">' +
        '<span class="alt-kicker">' + esc(kicker) + '</span>' +
        '<span class="alt-what">' + esc(altText(alt)) + '</span>' +
        (sub ? '<span class="alt-sub">' + esc(sub) + '</span>' : '') +
        '<span class="alt-total"><b>' + fmtU(alt.total) + '</b> USDC</span>' +
        '<span class="alt-diff' + (diff < 0 ? ' less' : '') + '">' + dtxt + '</span>' +
        (cur ? '<span class="alt-cur">This is your choice</span>' : '<button type="button" class="btn btn-ghost btn-sm" data-act="review.alt" data-val="' + i + '">Choose</button>') +
        '</div>';
    }).join('');
    return bookShell(
      (S.review.note ? '<div class="banner banner-ok">' + I('check') + '<span>' + esc(S.review.note) + ' The price is updated.</span></div>' : '') +
      '<section class="panel"><h2>Check your booking</h2><dl class="rv">' +
      rrow('Route', esc(routeName(t.route)), 'trip') +
      rrow('Date', esc(fmtDate(t.date, true)), 'trip') +
      rrow('Boats', 'Leave ' + esc(t.out) + ', back ' + esc(t.ret), 'trip') +
      rrow('Passengers', names, 'passengers') +
      rrow('Seats', esc(className(px.seatClass)), 'passengers') +
      rrow('Boarding', esc(boardName(px.board)), 'passengers') +
      (px.assist.trim() ? rrow('Assistance', esc(px.assist.trim()), 'passengers') : '') +
      '</dl></section>' +
      '<section class="panel price"><h2>Price</h2><table class="lines"><tbody>' + lines + '</tbody></table>' +
      '<div class="total"><span>Total</span><span><b>' + fmtU(q.total) + '</b> USDC</span></div>' +
      '<p class="inr">About ₹' + Math.round(num(q.inrApprox) || num(q.total) * S.cat.inrPerUsdc).toLocaleString('en-IN') + ' (approx.)</p>' +
      '<p class="hold">' + I('clock') + 'We hold this price for 10 minutes.</p></section>' +
      (alts.length ? '<section class="panel"><h2>Other options</h2><p class="muted small">Same day, same passengers.</p><div class="alts">' + altHtml + '</div></section>' : '') +
      '<section class="panel panel-quiet">' + checkbox('review.terms', S.review.terms, 'review.terms', 'I have read the <u>conditions of carriage</u> and the cancellation rules.') + '</section>' +
      '<div class="actions"><button type="button" class="btn btn-ghost" data-act="review.back">' + I('arrowLeft') + 'Back</button>' +
      '<button type="button" class="btn btn-primary btn-lg" data-act="review.next">Continue to payment ' + I('arrowRight') + '</button></div>');
  }

  function brand(num) {
    var d = num.replace(/\D/g, '');
    if (/^4/.test(d)) return 'VISA';
    if (/^(5[1-5]|2[2-7])/.test(d)) return 'MC';
    if (/^3[47]/.test(d)) return 'AMEX';
    if (/^6/.test(d)) return 'RUPAY';
    return '';
  }
  function viewPay() {
    var p = S.pay, q = S.quote;
    var b = brand(p.number);
    return bookShell(
      '<section class="panel pay">' +
      '<div class="pay-head"><h2>Pay by card</h2><span class="cards-acc"><i>VISA</i><i>MC</i><i>RUPAY</i></span></div>' +
      '<div class="banner banner-info">' + I('info') + '<span><b>Test mode.</b> Use the test card 4242 4242 4242 4242, any future date and any 3 digits. Other cards are declined.</span></div>' +
      (p.declined ? '<div class="banner banner-err" role="alert">' + I('alert') + '<span>' + esc(p.declined) + '</span></div>' : '') +
      '<div class="card-form">' +
      '<div class="cf-num">' + field({ f: 'pay.number', label: 'Card number', mode: 'numeric', max: 23, ph: '1234 5678 9012 3456', enter: 'pay.submit' }) +
      '<span class="cf-brand' + (b ? ' on' : '') + '" data-brand="' + b + '">' + (b || I('card')) + '</span></div>' +
      '<div class="row3">' +
      field({ f: 'pay.expiry', label: 'Expiry date', mode: 'numeric', max: 7, ph: 'MM / YY', enter: 'pay.submit' }) +
      field({ f: 'pay.cvc', label: 'Security code', mode: 'numeric', max: 4, ph: '123', hint: '3 digits on the back', enter: 'pay.submit' }) +
      '</div>' +
      field({ f: 'pay.name', label: 'Name on card', enter: 'pay.submit' }) +
      '</div>' +
      '<button type="button" class="btn btn-primary btn-lg btn-block btn-pay" data-act="pay.submit"' + (p.processing ? ' aria-busy="true"' : '') + '>' +
      (p.processing ? '<span class="spin"></span>Processing your payment' : I('lock') + 'Pay ' + fmtU(q && q.total) + ' USDC') + '</button>' +
      '<p class="muted small center">About ₹' + inr(q && q.total) + '. This is a test payment: no money moves.</p>' +
      '</section>' +
      '<div class="actions"><button type="button" class="btn btn-ghost" data-act="pay.back"' + (p.processing ? ' disabled' : '') + '>' + I('arrowLeft') + 'Back</button><span></span></div>');
  }

  function viewTicket() {
    var o = S.order || {}, r = S.receipt || {};
    var ref = o.ref || r.ref || o.orderId || 'HL-000000';
    var t = S.trip, px = S.pax;
    var tickets = (r.tickets && r.tickets.length) ? r.tickets : px.list.map(function (p, i) {
      var pre = px.seatClass === 'economy' ? 'E' : px.seatClass === 'upper-deck-guide' ? 'G' : 'U';
      return { passenger: p.name.trim(), seat: pre + (14 + i) };
    });
    var cancel = t.date ? (function () { var d = parseYmd(t.date); d.setDate(d.getDate() - 1); return fmtDate(ymd(d), true).replace(/ \d{4}$/, ''); })() : '';
    var dest = routeName(t.route).split(' to ');
    return '<section class="ticket wrap">' +
      '<div class="done-head"><span class="done-icon">' + I('check') + '</span><div><h1>You are booked</h1>' +
      '<p>Your tickets are also in your email' + (S.user ? ', ' + esc(S.user.email) : '') + '.</p></div></div>' +
      '<article class="pass">' +
      '<div class="pass-top">' + A.mark(26) + '<span class="pass-brand">Harbour Line</span><span class="pass-kind">Boarding pass</span></div>' +
      '<div class="pass-route"><div><small>From</small><b>' + esc(dest[0] || '') + '</b></div>' +
      '<div class="pass-boat">' + A.ribbon() + '</div>' +
      '<div class="ta-r"><small>To</small><b>' + esc(dest[1] || '') + '</b></div></div>' +
      '<div class="pass-grid">' +
      '<div><small>Date</small><b>' + esc(fmtDate(t.date, true)) + '</b></div>' +
      '<div><small>Leaving</small><b>' + esc(t.out) + '</b></div>' +
      '<div><small>Back</small><b>' + esc(t.ret) + '</b></div>' +
      '<div><small>Boarding</small><b>' + esc(boardName(px.board)) + '</b></div>' +
      '<div><small>Seats</small><b>' + esc(className(px.seatClass)) + '</b></div>' +
      '<div><small>Paid</small><b>' + fmtU((S.quote && S.quote.total) || o.total) + ' USDC</b></div>' +
      '</div>' +
      '<div class="pass-perf"></div>' +
      '<div class="pass-foot">' +
      '<div class="pass-qr">' + A.qr(ref, 150) + '<span class="ref">' + esc(ref) + '</span></div>' +
      '<ul class="pass-pax">' + tickets.map(function (x) {
        return '<li><span>' + esc(x.passenger || x.name || '') + '</span><b>' + esc(x.seat || '') + '</b></li>';
      }).join('') + '</ul></div></article>' +
      '<div class="ticket-notes">' +
      '<p>' + I('clock') + 'Show this pass at the ' + esc(boardName(px.board).replace('Gateway ', '')) + ' gate 20 minutes before your boat leaves.</p>' +
      (cancel ? '<p>' + I('shelter') + 'Free cancellation until 18:00 on ' + esc(cancel) + '.</p>' : '') +
      (px.assist.trim() ? '<p>' + I('users') + 'The crew has your message: “' + esc(px.assist.trim()) + '”</p>' : '') +
      '</div>' +
      '<div class="actions"><span></span><button type="button" class="btn btn-ghost" data-act="ticket.new">Book another trip</button></div>' +
      '</section>';
  }

  function cookieLayer() {
    if (S.cookie) return '';
    return '<div class="cookie-back"></div><div class="cookie" role="dialog" aria-modal="true" aria-label="Cookies">' +
      '<div class="cookie-in"><div class="cookie-text"><h2>We use cookies</h2>' +
      '<p>Some cookies are needed to make this site work. With your permission we also use cookies to count visits and to show you offers from our partners.</p></div>' +
      '<div class="cookie-btns"><button type="button" class="btn btn-ghost" data-act="cookie.necessary">Only necessary</button>' +
      '<button type="button" class="btn btn-primary" data-act="cookie.all">Accept all</button></div></div></div>';
  }
  function renderToast() {
    var el = $('#layer-toast');
    if (!el) return;
    var a = S.auth;
    if (!a.toast || S.view !== 'auth') { el.innerHTML = ''; return; }
    var c = codeFor(a.pendingEmail);
    el.innerHTML = '<div class="toast" role="status">' +
      '<div class="toast-app"><span class="toast-ic">' + I('mail') + '</span><span>Mail</span><span class="toast-time">now</span>' +
      '<button type="button" class="toast-x" data-act="toast.close" aria-label="Close">' + I('close') + '</button></div>' +
      '<div class="toast-body"><b>Harbour Line</b><span>Your sign-in code is <b class="code">' + c.slice(0, 3) + ' ' + c.slice(3) + '</b>. It expires in 10 minutes.</span></div></div>';
  }

  var lastView = null;
  function render(scrollTop) {
    var ae = document.activeElement;
    var f = ae && ae.dataset ? ae.dataset.field : null;
    var sel = null;
    if (f) { try { sel = [ae.selectionStart, ae.selectionEnd]; } catch (e) { sel = null; } }
    var root = $('#app');
    var views = { home: viewHome, auth: viewAuth, trip: viewTrip, passengers: viewPassengers, review: viewReview, pay: viewPay, ticket: viewTicket };
    root.innerHTML = header() + '<main id="view" class="view-' + S.view + (lastView !== S.view ? ' enter' : '') + '">' + views[S.view]() + '</main>' + footer();
    lastView = S.view;
    var ck = $('#layer-cookie');
    ck.innerHTML = cookieLayer();
    if (S.cookie) root.removeAttribute('inert'); else root.setAttribute('inert', '');
    renderToast();
    if (scrollTop) window.scrollTo(0, 0);
    if (f) {
      var el = document.querySelector('[data-field="' + cssq(f) + '"]');
      if (el) { el.focus({ preventScroll: true }); if (sel && sel[0] != null) { try { el.setSelectionRange(sel[0], sel[1]); } catch (e) { /* ignore */ } } }
    }
  }
  function footer() {
    return '<footer class="foot"><div class="wrap foot-in">' +
      '<span class="foot-brand">' + A.mark(20) + 'Harbour Line</span>' +
      '<span>Gateway of India, Mumbai</span><span>Help desk 08:00 to 18:00</span>' +
      '<span class="foot-demo">A demo site. Harbour Line is fictional and no real tickets are sold.</span>' +
      '</div></footer>';
  }

  // ---------- DOM wiring ----------
  function blocked() { return window.HL && HL.flags && HL.flags.replaying; }
  document.addEventListener('click', function (e) {
    if (blocked() && e.isTrusted) { e.preventDefault(); e.stopPropagation(); return; }
    var el = e.target.closest ? e.target.closest('[data-act]') : null;
    if (el) {
      if (el.disabled) return;
      e.preventDefault();
      apply({ type: 'web.click', field: el.dataset.act, value: el.dataset.val });
      return;
    }
    if (S.open && !(e.target.closest && e.target.closest('.pop'))) apply({ type: 'web.click', field: 'popover.close' });
  }, true);
  document.addEventListener('input', function (e) {
    if (blocked() && e.isTrusted) return;
    var f = e.target && e.target.dataset && e.target.dataset.field;
    if (f) apply({ type: 'web.input', field: f, value: e.target.value });
  });
  document.addEventListener('change', function (e) {
    if (blocked() && e.isTrusted) return;
    var f = e.target && e.target.dataset && e.target.dataset.field;
    if (f) apply({ type: 'web.field', field: f, value: e.target.value });
  });
  document.addEventListener('keydown', function (e) {
    if (blocked() && e.isTrusted) return;
    if (e.key === 'Escape' && S.open) { apply({ type: 'web.click', field: 'popover.close' }); return; }
    if (e.key === 'Enter' && e.target && e.target.dataset && e.target.dataset.enter && e.target.tagName === 'INPUT') {
      e.preventDefault();
      apply({ type: 'web.field', field: e.target.dataset.field, value: e.target.value });
      apply({ type: 'web.click', field: e.target.dataset.enter });
    }
  });
  window.addEventListener('pagehide', function () { commitDirty(); });

  // ---------- public API ----------
  function apply(ev) {
    if (!ev || !ev.type) return;
    if (ev.type === 'web.input') return onInput(ev.field, ev.value, ev);
    if (ev.type === 'web.field') return onField(ev.field, ev.value, ev);
    if (ev.type === 'web.click') {
      if (ev.field === 'popover.close' && !S.open) return;
      return onClick(ev.field, ev.value, ev);
    }
  }

  // the mission, as events: used by ?demo=<step> for screenshots and as a self-test
  function script(kind) {
    var email = 'asha.rao@example.com', s = [];
    function c(f, v) { s.push({ type: 'web.click', field: f, value: v }); }
    function fl(f, v) { s.push({ type: 'web.field', field: f, value: v }); }
    function stop(n) { s.push({ stop: n }); }
    stop('cookie');
    c('cookie.necessary'); stop('home');
    c('nav.book'); stop('auth');
    if (kind === 'auth-errors') { fl('auth.email', 'asha.rao@example'); fl('auth.password', 'harbour'); fl('auth.password2', 'harbor'); c('auth.create'); stop('auth-errors'); return s; }
    fl('auth.email', email); fl('auth.password', 'harbour2026'); fl('auth.password2', 'harbour2026'); c('auth.terms'); stop('auth-filled');
    c('auth.create'); stop('code');
    fl('auth.code', codeFor(email)); c('auth.verify'); stop('trip-empty');
    c('trip.route.toggle'); stop('route');
    c('trip.route.pick', 'gateway-elephanta'); c('trip.date.toggle'); stop('calendar');
    c('trip.date.pick', '2026-11-07');
    if (kind === 'trip-errors') { c('trip.out', '11:30'); c('trip.ret', '12:30'); c('trip.next'); stop('trip-errors'); return s; }
    c('trip.out', '09:30'); c('trip.ret', '14:00'); stop('trip');
    c('trip.next'); stop('passengers-empty');
    c('pax.inc'); c('pax.inc'); c('pax.inc');
    if (kind === 'errors') {
      fl('pax.0.name', 'Asha'); fl('pax.0.age', '31'); c('pax.idtype.toggle', '0'); c('pax.idtype.pick', '0:passport'); fl('pax.0.idNumber', 'P44177');
      fl('pax.1.name', 'Leo Marin'); c('pax.class', 'upper-deck'); c('pax.next'); stop('errors'); return s;
    }
    var P = [['Asha Rao', '31', 'passport', 'P4417702'], ['Leo Marin', '34', 'passport', 'X9024416'], ['Mei Tan', '27', 'driving-licence', 'MH0220190045'], ['Sam Okoye', '40', 'passport', 'A7781230']];
    P.forEach(function (p, i) {
      fl('pax.' + i + '.name', p[0]); fl('pax.' + i + '.age', p[1]); c('pax.idtype.toggle', String(i));
      if (i === 2) stop('idtype');
      c('pax.idtype.pick', i + ':' + p[2]); fl('pax.' + i + '.idNumber', p[3]);
    });
    c('pax.class', 'upper-deck'); c('pax.board', 'jetty-4'); fl('pax.assist', 'Sam uses a cane. Please help him get on and off the boat.'); stop('passengers');
    c('pax.next'); stop('review');
    c('review.terms'); c('review.next'); stop('pay-empty');
    if (kind === 'declined') { fl('pay.number', '4000 0566 5566 5556'); fl('pay.expiry', '12 / 28'); fl('pay.cvc', '123'); fl('pay.name', 'Asha Rao'); c('pay.submit'); stop('declined'); return s; }
    fl('pay.number', '4242 4242 4242 4242'); fl('pay.expiry', '12 / 28'); fl('pay.cvc', '123'); fl('pay.name', 'Asha Rao'); stop('pay');
    c('pay.submit'); stop('ticket');
    return s;
  }
  function idle() {
    return new Promise(function (resolve) {
      (function check(n) { if (!S.busy || n > 400) resolve(); else setTimeout(function () { check(n + 1); }, 25); })(0);
    });
  }
  function runScript(target) {
    var kind = ['auth-errors', 'trip-errors', 'errors', 'declined'].indexOf(target) >= 0 ? target : 'full';
    var steps = script(kind);
    var i = 0;
    return (function next() {
      if (i >= steps.length) return idle();
      var st = steps[i++];
      if (st.stop) { if (st.stop === target) return idle(); return next(); }
      return idle().then(function () { apply(st); return next(); });
    })();
  }

  var app = {
    apply: apply,
    on: function (fn) { listeners.push(fn); },
    state: function () { return S; },
    busy: function () { return S.busy > 0; },
    idle: idle,
    codeFor: codeFor,
    script: script,
    runScript: runScript,
    ready: null
  };
  var readyResolve;
  app.ready = new Promise(function (r) { readyResolve = r; });
  window.HL = window.HL || {};
  window.HL.app = app;
  window.HL.flags = Object.assign(window.HL.flags || {}, FLAGS);

  // ---------- boot ----------
  function boot() {
    document.body.insertAdjacentHTML('afterbegin', A.heroDefs());
    render(true);
    task(function () {
      return api('GET', 'routes').then(function (r) { S.cat = normCatalogue(r); }, function () {
        S.cat = normCatalogue(window.HLMock ? window.HLMock.CATALOGUE : {});
      });
    }).then(function () {
      if (!S.cat.routes.length && window.HLMock) S.cat = normCatalogue(window.HLMock.CATALOGUE);
      render();
      readyResolve();
    });
    setTimeout(function () { emit({ type: 'web.view', step: 'home', label: 'Opened the Harbour Line website', value: location.pathname + location.search }); }, 0);
    if (FLAGS.demo) {
      document.documentElement.classList.add('demo');
      app.ready.then(function () { return runScript(FLAGS.demo); }).then(function () {
        document.documentElement.setAttribute('data-demo-ready', '1');
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot); else boot();
})();
