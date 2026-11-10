// Synthetic race for testing the board (?sim=1). Never shown as a real run: the board
// puts a "Simulation" badge on screen whenever this is in use. Every event goes through
// the same handler as live events. Times are seconds after race.start.

const MISSION_PEOPLE = [
  ['Asha Rao', '31', 'passport', 'P4417702'],
  ['Leo Marin', '34', 'passport', 'X9024416'],
  ['Mei Tan', '27', 'driving-licence', 'MH0220190045'],
  ['Sam Okoye', '40', 'passport', 'A7781230'],
];

export const SIM_ORDER_ID = 'sim-order-1';
export const SIM_QUOTE_ID = 'sim-quote-1';

function lane1() {
  const ev = [];
  const at = (s, type, lane, data = {}) => ev.push({ s, type, lane, ...data });
  const req = (s, method, path, status, bytes, ms, summary, accept = 'application/json') =>
    at(s, 'agent.request', '1', { method, path, status, bytes, ms, accept, summary });
  const tool = (s, command) => at(s, 'agent.tool', '1', { name: 'Bash', input: { command } });
  const usage = (s, inputTokens, outputTokens, turns) => at(s, 'agent.usage', '1', { inputTokens, outputTokens, turns });

  at(0.9, 'agent.say', '1', { text: 'I will start at the Harbour Line agent door and read what it offers.' });
  tool(1.3, "curl -s -H 'Accept: text/markdown' http://127.0.0.1:4900/ferry/");
  req(1.5, 'GET', '/ferry/', 200, 1874, 6, 'read the Markdown door', 'text/markdown');
  tool(2.7, 'curl -s http://127.0.0.1:4900/ferry/SKILL.md');
  req(2.9, 'GET', '/ferry/SKILL.md', 200, 2412, 4, 'read the booking skill');
  usage(3.2, 9840, 310, 3);
  tool(4.4, './bin/ferry departures --route gateway-elephanta --date 2026-11-07');
  req(4.6, 'GET', '/ferry/api/departures?route=gateway-elephanta&date=2026-11-07', 200, 3108, 9, 'asked for departures on Sat 7 Nov');
  at(6.0, 'agent.say', '1', { text: '09:30 upper deck has 6 seats at 3.20 USDC, under 4. Back on the 14:00 boat. Jetty 4 is step-free.' });
  usage(6.4, 15620, 702, 5);
  tool(7.6, './bin/ferry quote --route gateway-elephanta --date 2026-11-07 --depart 09:30 --return 14:00 --class upper-deck --board jetty-4 --passenger "Asha Rao,31,passport,P4417702" --passenger "Leo Marin,34,passport,X9024416" --passenger "Mei Tan,27,driving-licence,MH0220190045" --passenger "Sam Okoye,40,passport,A7781230" --assist "Sam uses a cane: help boarding"');
  req(7.9, 'POST', '/ferry/api/quote', 200, 1466, 11, 'got a quote: 12.80 USDC for four');
  at(7.9, 'order.quoted', '1', { quoteId: SIM_QUOTE_ID, total: '12.80' });
  tool(9.0, `./bin/ferry book ${SIM_QUOTE_ID}`);
  req(9.2, 'POST', '/ferry/api/orders', 202, 412, 7, 'asked you to approve 12.80 USDC');
  at(9.2, 'order.awaiting_approval', '1', { orderId: SIM_ORDER_ID, total: '12.80', approveUrl: '/approve/?order=' + SIM_ORDER_ID });
  at(9.7, 'agent.say', '1', { text: 'The order is waiting for your yes on your phone. I will not pay before you approve.' });
  tool(10.0, `./bin/ferry wait ${SIM_ORDER_ID} --timeout 100`);
  usage(10.3, 21980, 1104, 7);
  at(31.2, 'order.approved', '1', { orderId: SIM_ORDER_ID });
  req(31.5, 'POST', `/ferry/api/orders/${SIM_ORDER_ID}/pay`, 402, 688, 5, 'got the price: 402, 12.80 USDC');
  at(31.5, 'order.payment_required', '1', { orderId: SIM_ORDER_ID, amount: '12.80', asset: 'USDC', network: 'arbitrum-sepolia', payTo: '0x5151515151515151515151515151515151515151' });
  req(32.1, 'POST', `/ferry/api/orders/${SIM_ORDER_ID}/pay`, 200, 942, 2140, 'paid with x402, one confirmation');
  at(34.3, 'order.paid', '1', { orderId: SIM_ORDER_ID, txHash: '0x5151515151515151515151515151515151515151515151515151515151515151', explorerUrl: '', amount: '12.80', mode: 'testnet', ref: 'HL-SIM01' });
  at(34.3, 'lane.done', '1', { ms: 34300 });
  at(35.4, 'agent.say', '1', { text: 'Paid 12.80 USDC. Four tickets on the 09:30 upper deck, help boarding noted for Sam.' });
  usage(35.6, 26310, 1382, 9);
  at(35.7, 'agent.done', '1', { ok: true });
  return ev;
}

// One person (or a screen agent) filling in the Harbour Line website.
function webLane(lane, total, opts) {
  const flow = [];
  const add = (type, data, dur) => flow.push({ type, data, dur });
  add('web.view', { step: 'cookies', label: 'Home page' }, 1.2);
  add('web.click', { step: 'cookies', label: 'Only necessary' }, 2.0);
  add('web.step', { step: 'account', label: 'Sign in to book' }, 1.0);
  add('web.click', { step: 'account', label: 'Create an account' }, 1.4);
  add('web.field', { step: 'account', field: 'email', label: 'Email', valueLen: 19 }, 4.0);
  add('web.field', { step: 'account', field: 'password', label: 'Password', valueLen: 12 }, 3.2);
  add('web.field', { step: 'account', field: 'password2', label: 'Password again', valueLen: 12 }, 3.0);
  add('web.click', { step: 'account', label: 'I agree to the terms' }, 1.4);
  add('web.submit', { step: 'account', label: 'Create account' }, 1.0);
  add('web.step', { step: 'code', label: 'We sent a code' }, 4.2);
  add('web.field', { step: 'code', field: 'code', label: '6-digit code', valueLen: 6 }, 3.4);
  add('web.submit', { step: 'code', label: 'Confirm' }, 1.0);
  add('web.step', { step: 'trip', label: 'Trip' }, 1.2);
  add('web.click', { step: 'trip', label: 'Route: Gateway of India to Elephanta' }, 2.6);
  add('web.click', { step: 'trip', label: 'Date: Sat 7 Nov' }, 3.4);
  add('web.click', { step: 'trip', label: 'Leaving 09:30' }, 2.2);
  add('web.click', { step: 'trip', label: 'Back 14:00' }, 2.0);
  add('web.submit', { step: 'trip', label: 'Continue' }, 1.0);
  add('web.step', { step: 'passengers', label: 'Passengers' }, 1.0);
  add('web.click', { step: 'passengers', label: 'Passengers: 4' }, 2.4);
  MISSION_PEOPLE.forEach(([name, age, idType, id], i) => {
    add('web.field', { step: 'passengers', field: `name-${i}`, label: `Passenger ${i + 1} name`, valueLen: name.length }, 3.0);
    add('web.field', { step: 'passengers', field: `age-${i}`, label: `Passenger ${i + 1} age`, valueLen: age.length }, 1.6);
    add('web.click', { step: 'passengers', label: `Passenger ${i + 1} ID type: ${idType.replace('-', ' ')}` }, 2.4);
    add('web.field', { step: 'passengers', field: `id-${i}`, label: `Passenger ${i + 1} ID number`, valueLen: id.length }, 3.6);
    if (opts.idError === i) {
      add('web.submit', { step: 'passengers', label: 'Continue' }, 1.0);
      add('web.error', { step: 'passengers', field: `id-${i}`, label: 'ID number does not match the ID type' }, 3.0);
      add('web.field', { step: 'passengers', field: `id-${i}`, label: `Passenger ${i + 1} ID number`, valueLen: id.length }, 4.0);
    }
  });
  add('web.click', { step: 'passengers', label: 'Seat class: upper deck' }, 2.2);
  add('web.click', { step: 'passengers', label: 'Boarding: jetty 4, step-free' }, 2.0);
  add('web.field', { step: 'passengers', field: 'assistance', label: 'Special assistance', valueLen: 30 }, 5.0);
  add('web.submit', { step: 'passengers', label: 'Review' }, 1.0);
  add('web.step', { step: 'review', label: 'Review' }, 4.0);
  add('web.click', { step: 'review', label: 'Continue to payment' }, 1.6);
  add('web.step', { step: 'pay', label: 'Pay' }, 1.0);
  add('web.field', { step: 'pay', field: 'card', label: 'Card number', valueLen: 19 }, 4.4);
  add('web.field', { step: 'pay', field: 'expiry', label: 'Expiry', valueLen: 5 }, 1.8);
  add('web.field', { step: 'pay', field: 'cvc', label: 'CVC', valueLen: 3 }, 1.4);
  add('web.field', { step: 'pay', field: 'cardName', label: 'Name on card', valueLen: 8 }, 2.2);
  if (opts.cardError) {
    add('web.submit', { step: 'pay', label: 'Pay 12.80 USDC' }, 1.0);
    add('web.error', { step: 'pay', field: 'card', label: 'Card declined: use the test card' }, 3.0);
    add('web.field', { step: 'pay', field: 'card', label: 'Card number', valueLen: 19 }, 4.0);
  }
  add('web.submit', { step: 'pay', label: 'Pay 12.80 USDC' }, 2.4);
  add('web.step', { step: 'ticket', label: 'Ticket' }, 0.6);
  add('web.done', { step: 'ticket', label: 'Booked', ref: opts.ref }, 0);

  const raw = flow.reduce((a, f) => a + f.dur, 0);
  const k = (total - opts.start) / raw;
  let s = opts.start;
  const ev = [];
  for (const f of flow) {
    ev.push({ s: Math.round(s * 10) / 10, type: f.type, lane, sessionId: `sim-${lane}`, ...f.data });
    s += f.dur * k;
  }
  ev.push({ s: total, type: 'lane.done', lane, ms: Math.round(total * 1000) });
  return ev;
}

function outside() {
  return [
    { s: 19.5, type: 'agent.request', lane: 'x', method: 'GET', path: '/ferry/llms.txt', status: 200, bytes: 640, ms: 3, accept: 'text/plain', summary: 'read llms.txt' },
    { s: 47.0, type: 'agent.request', lane: 'x', method: 'GET', path: '/ferry/', status: 200, bytes: 1874, ms: 5, accept: 'text/markdown', summary: 'read the Markdown door' },
    { s: 63.2, type: 'agent.request', lane: 'x', method: 'GET', path: '/ferry/SKILL.md', status: 200, bytes: 2412, ms: 4, accept: '*/*', summary: 'read the booking skill' },
  ];
}

// Absolute events for a race whose start is t0 (epoch ms).
export function simEvents(t0) {
  const all = [
    { s: 0, type: 'race.start', lane: 'sys', t0, replay: 'sim' },
    ...lane1(),
    ...webLane('2', 151.4, { start: 2.2, idError: 2, cardError: true, ref: 'HL-SIM02' }),
    ...webLane('3', 118.6, { start: 1.6, idError: 1, cardError: false, ref: 'HL-SIM03' }),
    ...outside(),
  ];
  all.sort((a, b) => a.s - b.s);
  return all.map(({ s, ...e }) => ({ t: Math.round(t0 + s * 1000), ...e }));
}

// What the yes card shows in a simulation (the same shape as GET /ferry/api/orders/:id with its quote).
export function simOrder() {
  const now = Date.now();
  const booking = {
    route: 'gateway-elephanta', date: '2026-11-07', departure: '09:30', return: '14:00',
    seatClass: 'upper-deck', boardingPoint: 'jetty-4',
    passengers: MISSION_PEOPLE.map(([name, age, idType, idNumber]) => ({ name, age: Number(age), idType, idNumber })),
    assistance: 'Sam uses a cane: help boarding',
  };
  return {
    orderId: SIM_ORDER_ID, quoteId: SIM_QUOTE_ID, channel: 'agent', lane: '1', status: 'awaiting_approval',
    total: '12.80', agent: { name: 'Claude Code' },
    quote: {
      quoteId: SIM_QUOTE_ID,
      booking,
      lines: [{ label: 'Upper deck, return', qty: 4, unit: '3.20', amount: '12.80' }],
      total: '12.80', currency: 'USDC', inrApprox: 1126, expiresAt: new Date(now + 10 * 60 * 1000).toISOString(),
      alternatives: [
        { id: 'cheaper', kind: 'cheaper', label: 'Economy, same times', change: 'Saves 2.40 USDC: lower deck, 2.60 a person', total: '10.40', booking: { ...booking, seatClass: 'economy' } },
        { id: 'later', kind: 'later', label: 'Upper deck at 10:30', change: 'Leaves 10:30, 1 hour later, same price', total: '12.80', booking: { ...booking, departure: '10:30' } },
      ],
    },
  };
}
