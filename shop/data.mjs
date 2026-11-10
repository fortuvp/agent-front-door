// Harbour Line catalogue: the single source for the website, the API, the CLI and the door texts.
// Harbour Line is a fictional ferry operator made for a demo. All names and ID numbers are fictional.
// Pure data and pure functions, no imports: safe to load in Node and in the browser
// (the server also serves this file at /ferry/data.mjs and /shop/data.mjs).
// Money is kept in cents of a USDC (integers) and shown with two decimals.

export const OPERATOR = { name: "Harbour Line", tagline: "Ferries across Mumbai harbour", fictional: true };
export const CURRENCY = "USDC";
export const INR_PER_USDC = 88; // for colour only, always labelled "approx."
export const DEMO_DATE = "2026-11-07";
export const TZ_OFFSET = "+05:30"; // all times are India time (IST)
export const MAX_PASSENGERS = 9;
export const FREE_UNDER_AGE = 5;
export const ID_REQUIRED_FROM_AGE = 18;
export const QUOTE_MINUTES = 15;
export const ORDER_MINUTES = 10;

export const MISSION =
  "Book Harbour Line ferry tickets for four: Gateway of India to Elephanta on Saturday 7 November, " +
  "leaving between 9 and 10, back after 14:00, upper deck if it is under 4 USDC a person, boarding at " +
  "the step-free jetty. Passengers: Asha Rao, 31, passport P4417702 · Leo Marin, 34, passport " +
  "X9024416 · Mei Tan, 27, driving licence MH0220190045 · Sam Okoye, 40, passport A7781230. " +
  "Sam uses a cane: ask for help boarding. Ask me before you pay.";

export const MISSION_PASSENGERS = [
  { name: "Asha Rao", age: 31, idType: "passport", idNumber: "P4417702" },
  { name: "Leo Marin", age: 34, idType: "passport", idNumber: "X9024416" },
  { name: "Mei Tan", age: 27, idType: "driving-licence", idNumber: "MH0220190045" },
  { name: "Sam Okoye", age: 40, idType: "passport", idNumber: "A7781230" },
];

export const SEAT_CLASSES = [
  { id: "economy", label: "Economy", short: "E", description: "Lower deck, open seating" },
  { id: "upper-deck", label: "Upper deck", short: "U", description: "Open upper deck, reserved seat" },
  { id: "upper-deck-guide", label: "Upper deck with guide", short: "G", description: "Upper deck seat and a guided walk on the island" },
];

export const BOARDING_POINTS = [
  { id: "jetty-1", label: "Gateway jetty 1", stepFree: false, note: "Stairs down to the boat" },
  { id: "jetty-4", label: "Gateway jetty 4", stepFree: true, note: "Step-free access, ramp to the boat" },
];

export const ID_TYPES = [
  { id: "passport", label: "Passport", pattern: "^[A-Z][0-9]{7}$", hint: "one letter and 7 digits, like P4417702" },
  { id: "aadhaar", label: "Aadhaar", pattern: "^[0-9]{4} ?[0-9]{4} ?[0-9]{4}$", hint: "12 digits, like 1234 5678 9012" },
  { id: "driving-licence", label: "Driving licence", pattern: "^[A-Z]{2}[0-9]{2} ?[0-9]{6,11}$", hint: "2 letters and 8 to 13 digits, like MH0220190045" },
];

// Seats left per class, by departure time. Fixed so the demo is the same every run.
const ELEPHANTA_SAT_OUT = {
  "09:00": { economy: 14, "upper-deck": 0, "upper-deck-guide": 3 },
  "09:30": { economy: 22, "upper-deck": 6, "upper-deck-guide": 4 },
  "10:00": { economy: 11, "upper-deck": 2, "upper-deck-guide": 0 },
  "10:30": { economy: 30, "upper-deck": 12, "upper-deck-guide": 8 },
  "11:30": { economy: 38, "upper-deck": 16, "upper-deck-guide": 10 },
};
const ELEPHANTA_SAT_BACK = {
  "12:30": { economy: 20, "upper-deck": 8, "upper-deck-guide": 6 },
  "14:00": { economy: 25, "upper-deck": 10, "upper-deck-guide": 6 },
  "15:30": { economy: 34, "upper-deck": 14, "upper-deck-guide": 8 },
  "17:00": { economy: 40, "upper-deck": 20, "upper-deck-guide": 10 },
};

export const ROUTES = [
  {
    id: "gateway-elephanta",
    from: "Gateway of India",
    to: "Elephanta Island",
    minutes: 60,
    note: "The cave temples on the island. Boats return from Elephanta jetty.",
    prices: { economy: 260, "upper-deck": 320, "upper-deck-guide": 480 },
    schedule: {
      saturday: { out: Object.keys(ELEPHANTA_SAT_OUT), back: Object.keys(ELEPHANTA_SAT_BACK) },
      other: { out: ["09:00", "10:00", "11:30"], back: ["14:00", "15:30", "17:00"] },
    },
    fixedSeats: { saturday: { out: ELEPHANTA_SAT_OUT, back: ELEPHANTA_SAT_BACK } },
  },
  {
    id: "gateway-mandwa",
    from: "Gateway of India",
    to: "Mandwa Jetty",
    minutes: 55,
    note: "For Alibaug. Buses meet the boat at Mandwa.",
    prices: { economy: 310, "upper-deck": 420, "upper-deck-guide": 560 },
    schedule: {
      saturday: { out: ["08:30", "10:30", "13:00"], back: ["15:00", "18:00"] },
      other: { out: ["08:30", "10:30", "13:00"], back: ["15:00", "18:00"] },
    },
  },
];

// ---------- small helpers ----------

export const getRoute = (id) => ROUTES.find((r) => r.id === id) || null;
export const getSeatClass = (id) => SEAT_CLASSES.find((c) => c.id === id) || null;
export const getBoardingPoint = (id) => BOARDING_POINTS.find((b) => b.id === id) || null;
export const getIdType = (id) => ID_TYPES.find((t) => t.id === id) || null;

export const usdc = (cents) => Math.round(cents) / 100; // cents -> number, e.g. 1280 -> 12.8
export const formatUsdc = (cents) => (Math.round(cents) / 100).toFixed(2); // "12.80"
export const inrApprox = (cents) => Math.round((cents / 100) * INR_PER_USDC);
export const toCents = (amount) => Math.round(Number(amount) * 100);

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const MONTHS_LONG = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];

export function isValidDate(date) {
  if (typeof date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const d = new Date(`${date}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === date;
}
export function weekdayOf(date) {
  return WEEKDAYS[new Date(`${date}T00:00:00Z`).getUTCDay()];
}
export function formatDateShort(date) {
  // "2026-11-07" -> "Sat 7 Nov"
  if (!isValidDate(date)) return String(date);
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()].slice(0, 3)} ${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]}`;
}
export function formatDateLong(date) {
  // "2026-11-07" -> "Saturday 7 November 2026"
  if (!isValidDate(date)) return String(date);
  const d = new Date(`${date}T00:00:00Z`);
  return `${WEEKDAYS[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_LONG[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
const toMinutes = (hhmm) => {
  const [h, m] = String(hhmm).split(":").map(Number);
  return h * 60 + m;
};
const fromMinutes = (mins) => `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;
export const addMinutes = (hhmm, mins) => fromMinutes(toMinutes(hhmm) + mins);

function hash(text) {
  let h = 2166136261;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

// Free cancellation until 18:00 India time the day before the trip.
export function cancellationFor(date) {
  if (!isValidDate(date)) return { freeUntil: null, text: "Free cancellation until 18:00 the day before the trip" };
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  const day = d.toISOString().slice(0, 10);
  return {
    freeUntil: `${day}T18:00:00${TZ_OFFSET}`,
    text: `Free cancellation until ${formatDateShort(day)} 18:00, refund to the same wallet`,
    short: `Free cancellation until ${WEEKDAYS[d.getUTCDay()].slice(0, 3)} 18:00`,
  };
}

// ---------- departures ----------

function scheduleFor(route, date) {
  const isSat = weekdayOf(date) === "Saturday";
  return { kind: isSat ? "saturday" : "other", ...(isSat ? route.schedule.saturday : route.schedule.other) };
}

function seatsFor(route, date, leg, time, kind) {
  const fixed = route.fixedSeats?.[kind]?.[leg]?.[time];
  if (fixed) return { ...fixed };
  const out = {};
  for (const c of SEAT_CLASSES) {
    const n = hash(`${route.id}|${date}|${leg}|${time}|${c.id}`) % (c.id === "economy" ? 40 : 18);
    out[c.id] = c.id === "economy" ? 8 + n : n;
  }
  return out;
}

function slot(route, date, leg, time, kind) {
  const seatsLeft = seatsFor(route, date, leg, time, kind);
  const price = {};
  const soldOut = {};
  for (const c of SEAT_CLASSES) {
    price[c.id] = usdc(route.prices[c.id]);
    soldOut[c.id] = seatsLeft[c.id] <= 0;
  }
  const from = leg === "out" ? route.from : route.to;
  const to = leg === "out" ? route.to : route.from;
  return { time, arrives: addMinutes(time, route.minutes), from, to, seatsLeft, price, soldOut };
}

export function listDepartures(routeId, date) {
  const route = getRoute(routeId);
  if (!route) return { error: `Unknown route "${routeId}". Routes: ${ROUTES.map((r) => r.id).join(", ")}` };
  if (!isValidDate(date)) return { error: `Date must look like YYYY-MM-DD, for example ${DEMO_DATE}` };
  const s = scheduleFor(route, date);
  return {
    route: route.id,
    from: route.from,
    to: route.to,
    date,
    weekday: weekdayOf(date),
    dateLabel: formatDateShort(date),
    currency: CURRENCY,
    priceNote: "Price per person, return trip",
    departures: s.out.map((t) => slot(route, date, "out", t, s.kind)),
    returns: s.back.map((t) => slot(route, date, "back", t, s.kind)),
  };
}

export function routesCatalogue() {
  return {
    operator: OPERATOR.name,
    currency: CURRENCY,
    priceNote: "Price per person, return trip, in USDC on a test network. Children under 5 travel free.",
    inrPerUsdc: INR_PER_USDC,
    routes: ROUTES.map((r) => ({
      id: r.id,
      from: r.from,
      to: r.to,
      minutes: r.minutes,
      note: r.note,
      prices: Object.fromEntries(SEAT_CLASSES.map((c) => [c.id, usdc(r.prices[c.id])])),
      departures: { saturday: r.schedule.saturday.out, otherDays: r.schedule.other.out },
      returns: { saturday: r.schedule.saturday.back, otherDays: r.schedule.other.back },
    })),
    seatClasses: SEAT_CLASSES.map(({ id, label, description }) => ({ id, label, description })),
    boardingPoints: BOARDING_POINTS,
    idTypes: ID_TYPES.map(({ id, label, hint }) => ({ id, label, hint })),
    rules: {
      freeUnderAge: FREE_UNDER_AGE,
      idRequiredFromAge: ID_REQUIRED_FROM_AGE,
      maxPassengers: MAX_PASSENGERS,
      cancellation: "Free cancellation until 18:00 the day before the trip",
    },
  };
}

// ---------- booking: validate, price, alternatives ----------

// Returns a list of { field, message }. Empty list = the booking can be quoted.
export function validateBooking(b) {
  const errors = [];
  const err = (field, message) => errors.push({ field, message });
  if (!b || typeof b !== "object") return [{ field: "booking", message: "Send a booking object" }];
  const route = getRoute(b.route);
  if (!route) err("route", `Choose a route: ${ROUTES.map((r) => r.id).join(", ")}`);
  if (!isValidDate(b.date)) err("date", `Date must look like YYYY-MM-DD, for example ${DEMO_DATE}`);
  const cls = getSeatClass(b.seatClass);
  if (!cls) err("seatClass", `Choose a seat class: ${SEAT_CLASSES.map((c) => c.id).join(", ")}`);
  if (!getBoardingPoint(b.boardingPoint)) err("boardingPoint", `Choose a boarding point: ${BOARDING_POINTS.map((p) => p.id).join(", ")}`);
  const pax = Array.isArray(b.passengers) ? b.passengers : [];
  if (!pax.length) err("passengers", "Add at least one passenger");
  if (pax.length > MAX_PASSENGERS) err("passengers", `At most ${MAX_PASSENGERS} passengers per booking`);
  pax.forEach((p, i) => {
    const f = (k) => `passengers[${i}].${k}`;
    const who = p && p.name ? p.name : `Passenger ${i + 1}`;
    if (!p || typeof p.name !== "string" || p.name.trim().length < 2) err(f("name"), `Passenger ${i + 1}: name is required`);
    const age = p ? Number(p.age) : NaN;
    if (p == null || p.age === "" || p.age == null || !Number.isInteger(age) || age < 0 || age > 120) err(f("age"), `${who}: age is required (a whole number)`);
    else if (age >= ID_REQUIRED_FROM_AGE) {
      const t = getIdType(p.idType);
      if (!t) err(f("idType"), `${who}: ID type is required from age 18 (${ID_TYPES.map((x) => x.id).join(", ")})`);
      else if (!p.idNumber) err(f("idNumber"), `${who}: ID number is required from age 18`);
      else if (!new RegExp(t.pattern).test(String(p.idNumber).trim().toUpperCase())) err(f("idNumber"), `${who}: ${t.label.toLowerCase()} number should be ${t.hint}`);
    }
  });
  if (route && isValidDate(b.date)) {
    const s = scheduleFor(route, b.date);
    const out = s.out.includes(b.departure);
    const back = s.back.includes(b.return);
    if (!out) err("departure", `No ${route.from} departure at ${b.departure ?? "(none)"} on ${formatDateShort(b.date)}. Departures: ${s.out.join(", ")}`);
    if (!back) err("return", `No return at ${b.return ?? "(none)"} on ${formatDateShort(b.date)}. Returns: ${s.back.join(", ")}`);
    if (out && back && toMinutes(b.return) <= toMinutes(addMinutes(b.departure, route.minutes)))
      err("return", `The return must leave after you arrive (${addMinutes(b.departure, route.minutes)}). Returns: ${s.back.join(", ")}`);
    if (out && back && cls && pax.length) {
      const need = pax.length;
      const so = seatsFor(route, b.date, "out", b.departure, s.kind)[cls.id];
      const sb = seatsFor(route, b.date, "back", b.return, s.kind)[cls.id];
      if (so <= 0) err("departure", `${cls.label} at ${b.departure} is sold out`);
      else if (so < need) err("departure", `${cls.label} at ${b.departure} has only ${so} seats left`);
      if (sb <= 0) err("return", `${cls.label} on the ${b.return} return is sold out`);
      else if (sb < need) err("return", `${cls.label} on the ${b.return} return has only ${sb} seats left`);
    }
  }
  if (b.assistance != null && typeof b.assistance !== "string") err("assistance", "Assistance must be text");
  return errors;
}

// Clean copy of a booking (trimmed names, upper-case ID numbers, numeric ages).
export function normaliseBooking(b) {
  return {
    route: b.route,
    date: b.date,
    departure: b.departure,
    return: b.return,
    seatClass: b.seatClass,
    boardingPoint: b.boardingPoint,
    passengers: (b.passengers || []).map((p) => ({
      name: String(p.name || "").trim(),
      age: Number(p.age),
      ...(p.idType ? { idType: p.idType } : {}),
      ...(p.idNumber ? { idNumber: String(p.idNumber).trim().toUpperCase() } : {}),
    })),
    ...(b.assistance && String(b.assistance).trim() ? { assistance: String(b.assistance).trim() } : {}),
  };
}

// { lines:[{label, qty, unit, amount}], totalCents } with unit/amount as numbers in USDC.
export function priceBooking(b) {
  const route = getRoute(b.route);
  const cls = getSeatClass(b.seatClass);
  const unitCents = route.prices[cls.id];
  const paying = b.passengers.filter((p) => Number(p.age) >= FREE_UNDER_AGE).length;
  const free = b.passengers.length - paying;
  const lines = [];
  if (paying) lines.push({ label: `${cls.label}, return, ${route.from} to ${route.to}`, qty: paying, unit: usdc(unitCents), amount: usdc(unitCents * paying) });
  if (free) lines.push({ label: `Child under ${FREE_UNDER_AGE}, travels free`, qty: free, unit: 0, amount: 0 });
  if (b.assistance) lines.push({ label: `Boarding help at ${getBoardingPoint(b.boardingPoint)?.label ?? b.boardingPoint}`, qty: 1, unit: 0, amount: 0 });
  return { lines, totalCents: unitCents * paying, unitCents };
}

// Plain lines for a person: "the order in four lines".
export function describeBooking(b) {
  const route = getRoute(b.route);
  const cls = getSeatClass(b.seatClass);
  const point = getBoardingPoint(b.boardingPoint);
  const names = b.passengers.map((p) => p.name);
  const n = names.length;
  return [
    `${n} ${n === 1 ? "person" : "people"}: ${names.join(", ")}`,
    `${formatDateShort(b.date)}, ${route?.from ?? b.route} ${b.departure} to ${route?.to ?? ""}, back at ${b.return}`.replace(/ to ,/, ","),
    `${cls?.label ?? b.seatClass}, ${route && cls ? formatUsdc(route.prices[cls.id]) : "?"} USDC a person`,
    `Board at ${point?.label ?? b.boardingPoint}${point?.stepFree ? " (step-free)" : ""}${b.assistance ? `, with help boarding` : ""}`,
  ];
}

// The two alternatives: one cheaper (economy, same times) and one later (next departure with seats).
export function alternativesFor(b) {
  const route = getRoute(b.route);
  const s = scheduleFor(route, b.date);
  const need = b.passengers.length;
  const seatsOk = (bk) => validateBooking(bk).length === 0;
  const base = priceBooking(b).totalCents;
  const alts = [];

  // 1. cheaper: economy at the same times (or, if already economy, the upper deck).
  if (b.seatClass !== "economy") {
    let alt = { ...b, seatClass: "economy" };
    if (!seatsOk(alt)) {
      const t = s.out.find((time) => seatsOk({ ...alt, departure: time }));
      if (t) alt = { ...alt, departure: t };
    }
    alts.push({ id: "cheaper", kind: "cheaper", booking: alt });
  } else {
    alts.push({ id: "upgrade", kind: "upgrade", booking: { ...b, seatClass: "upper-deck" } });
  }

  // 2. later: the next departure with enough seats in the same class, else an earlier one.
  const idx = s.out.indexOf(b.departure);
  const later = s.out.slice(idx + 1).find((time) => seatsOk({ ...b, departure: time }));
  const earlier = [...s.out.slice(0, idx)].reverse().find((time) => seatsOk({ ...b, departure: time }));
  if (later) alts.push({ id: "later", kind: "later", booking: { ...b, departure: later } });
  else if (earlier) alts.push({ id: "earlier", kind: "earlier", booking: { ...b, departure: earlier } });
  else {
    const other = BOARDING_POINTS.find((p) => p.id !== b.boardingPoint);
    alts.push({ id: "other-jetty", kind: "other-jetty", booking: { ...b, boardingPoint: other.id } });
  }

  return alts.map((a) => {
    const cents = priceBooking(a.booking).totalCents;
    const diff = cents - base;
    const cls = getSeatClass(a.booking.seatClass);
    const per = formatUsdc(route.prices[cls.id]);
    let label;
    let change;
    if (a.kind === "cheaper") {
      label = a.booking.departure === b.departure ? `${cls.label}, same times` : `${cls.label} at ${a.booking.departure}`;
      change = `Saves ${formatUsdc(-diff)} USDC: lower deck, ${per} a person`;
    } else if (a.kind === "upgrade") {
      label = `${cls.label}, same times`;
      change = `${formatUsdc(diff)} USDC more: ${per} a person`;
    } else if (a.kind === "later" || a.kind === "earlier") {
      label = `${cls.label} at ${a.booking.departure}`;
      const mins = Math.abs(toMinutes(a.booking.departure) - toMinutes(b.departure));
      const gap = mins % 60 === 0 ? `${mins / 60} hour${mins === 60 ? "" : "s"}` : `${mins} minutes`;
      change = `Leaves ${a.booking.departure}, ${gap} ${a.kind}${diff === 0 ? ", same price" : ""}`;
    } else {
      label = `Board at ${getBoardingPoint(a.booking.boardingPoint).label}`;
      change = "Same boat, other jetty";
    }
    return { id: a.id, kind: a.kind, label, change, total: usdc(cents), totalText: formatUsdc(cents), booking: a.booking, summary: describeBooking(a.booking), checks: checkMission(a.booking) };
  });
}

// "This matches your request": one line per point of the demo mission.
// ok:false is a deviation, to be flagged softly (a quiet dot, not a red X).
export function checkMission(b) {
  const route = getRoute(b.route);
  const names = MISSION_PASSENGERS.map((p) => p.name.toLowerCase());
  const got = (b.passengers || []).map((p) => String(p.name || "").trim().toLowerCase());
  const samePeople = got.length === names.length && names.every((n) => got.includes(n));
  const dep = toMinutes(b.departure || "00:00");
  const ret = toMinutes(b.return || "00:00");
  const upperCents = route ? route.prices["upper-deck"] : 0;
  const cls = getSeatClass(b.seatClass);
  const clsCents = route && cls ? route.prices[cls.id] : 0;
  let classOk;
  let classNote;
  if (b.seatClass === "upper-deck") {
    classOk = upperCents < 400;
    classNote = `Upper deck, ${formatUsdc(upperCents)} a person`;
  } else if (b.seatClass === "economy") {
    classOk = upperCents >= 400;
    classNote = `Economy, ${formatUsdc(clsCents)} a person (upper deck is ${formatUsdc(upperCents)})`;
  } else {
    classOk = false;
    classNote = `${cls?.label ?? b.seatClass}, ${formatUsdc(clsCents)} a person, over 4 USDC`;
  }
  const point = getBoardingPoint(b.boardingPoint);
  return [
    { id: "people", label: "Four people", ok: samePeople, note: (b.passengers || []).map((p) => p.name).join(", ") },
    { id: "trip", label: "Gateway of India to Elephanta, Sat 7 Nov", ok: b.route === "gateway-elephanta" && b.date === DEMO_DATE, note: `${route ? `${route.from} to ${route.to}` : b.route}, ${formatDateShort(b.date)}` },
    { id: "leave", label: "Leaving between 9 and 10", ok: dep >= 540 && dep <= 600, note: `Leaves ${b.departure}` },
    { id: "back", label: "Back after 14:00", ok: ret >= 840, note: `Back at ${b.return}` },
    { id: "class", label: "Upper deck if under 4 USDC a person", ok: classOk, note: classNote },
    { id: "jetty", label: "Step-free jetty", ok: !!point?.stepFree, note: point ? `${point.label}${point.stepFree ? ", step-free" : ", has stairs"}` : String(b.boardingPoint) },
    { id: "help", label: "Help boarding for Sam", ok: !!(b.assistance && b.assistance.trim()), note: b.assistance ? b.assistance : "No help asked for" },
  ];
}

// Seats for the ticket: consecutive seats in the class, from a seed (the order id).
export function assignSeats(b, seed) {
  const cls = getSeatClass(b.seatClass);
  const start = 1 + (hash(String(seed)) % 40);
  return b.passengers.map((p, i) => ({ passenger: p.name, seat: `${cls?.short ?? "S"}${start + i}` }));
}

// Parse the CLI's passenger flag: "Asha Rao,31,passport,P4417702" (ID optional under 18).
export function parsePassenger(text) {
  const parts = String(text).split(",").map((s) => s.trim());
  const [name, age, idType, ...rest] = parts;
  const idNumber = rest.join("").replace(/\s+/g, " ");
  const type = idType ? idType.toLowerCase().replace(/\s+/g, "-").replace("driving-license", "driving-licence") : undefined;
  return { name, age: age === undefined || age === "" ? undefined : Number(age), ...(type ? { idType: type } : {}), ...(idNumber ? { idNumber } : {}) };
}
