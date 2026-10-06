// Physics checks against the PRD success criteria.
// Run: node --test ac-simulator/test/*.test.js
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');

// Load the engine straight out of index.html so the tests cover the shipped code.
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const src = html.match(/<script id="engine">([\s\S]*?)<\/script>/)[1];
const { Engine, Controller } = new Function(src + '\nreturn { Engine, Controller };')();

function setup(over = {}) {
  return {
    room: {
      length: 4, width: 3.5, height: 3, floor: 'middle', wall: 'brick', airtight: 'average', extWalls: 2,
      people: 2, appliances: 150, windowArea: 1.5, orientation: 'W', ...(over.room || {}),
    },
    outdoor: over.outdoor ?? 35, setpoint: over.setpoint ?? 24, tariff: 8,
    units: over.units || [{ id: 1, type: 'split', tons: 1.5, comp: 'inv', wall: 'left', pos: 0.5 }],
  };
}
function run(s, hours) {
  const sim = Controller.create(s);
  Controller.advance(sim, hours * 3600);
  return sim;
}

test('1.5 ton inverter split reaches 24 °C in 15–30 min', () => {
  const sim = run(setup(), 1);
  assert.ok(sim.reachedAt !== null, 'never reached setpoint');
  const min = sim.reachedAt / 60;
  assert.ok(min >= 15 && min <= 30, `reached in ${min.toFixed(1)} min`);
});

test('inverter uses clearly less energy than non-inverter over 8 h', () => {
  const inv = run(setup(), 8).kWh;
  const non = run(setup({ units: [{ id: 1, type: 'split', tons: 1.5, comp: 'non' }] }), 8).kWh;
  const saving = 1 - inv / non;
  assert.ok(saving > 0.1 && saving < 0.5, `saving ${(saving * 100).toFixed(0)}% (inv ${inv.toFixed(2)}, non ${non.toFixed(2)} kWh)`);
});

test('non-inverter shows a sawtooth around the setpoint', () => {
  const sim = run(setup({ units: [{ id: 1, type: 'split', tons: 1.5, comp: 'non' }] }), 2);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 3600; i++) { Controller.advance(sim, 1); lo = Math.min(lo, sim.s.Ta); hi = Math.max(hi, sim.s.Ta); }
  assert.ok(hi - lo > 1.5, `swing ${(hi - lo).toFixed(2)} K`);
});

test('inverter holds the setpoint smoothly', () => {
  const sim = run(setup(), 3);
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < 3600; i++) { Controller.advance(sim, 1); lo = Math.min(lo, sim.s.Ta); hi = Math.max(hi, sim.s.Ta); }
  assert.ok(hi - lo < 0.5, `swing ${(hi - lo).toFixed(2)} K`);
});

test('undersized unit is flagged', () => {
  const sim = run(setup({ outdoor: 40, room: { floor: 'top', airtight: 'leaky', extWalls: 3 },
    units: [{ id: 1, type: 'window', tons: 0.75, comp: 'non' }] }), 1);
  assert.strictEqual(Controller.sizing(sim).verdict, 'under');
});

test('oversized non-inverter is flagged for short-cycling', () => {
  const sim = run(setup({ units: [{ id: 1, type: 'split', tons: 3, comp: 'non' }] }), 4);
  assert.strictEqual(Controller.sizing(sim).verdict, 'over');
});

test('reasonably sized unit is reported well sized', () => {
  assert.strictEqual(Controller.sizing(run(setup(), 4)).verdict, 'good');
  assert.strictEqual(Controller.sizing(run(setup({ units: [{ id: 1, type: 'split', tons: 1, comp: 'non' }] }), 4)).verdict, 'good');
});

test('non-inverter respects 3-minute minimum off time', () => {
  const sim = Controller.create(setup({ units: [{ id: 1, type: 'split', tons: 3, comp: 'non' }] }));
  Controller.advance(sim, 4 * 3600);
  const st = sim.units[0].starts;
  for (let i = 1; i < st.length; i++) assert.ok(st[i] - st[i - 1] >= Controller.MIN_OFF, 'restart inside min off time');
});

test('capacity derates above 35 °C outdoor', () => {
  assert.strictEqual(Engine.capDerate(35), 1);
  assert.ok(Math.abs(Engine.capDerate(40) - 0.925) < 1e-9);
});

test('results do not depend on how steps are batched (speed independence)', () => {
  const a = Controller.create(setup()), b = Controller.create(setup());
  Controller.advance(a, 7200);
  for (let i = 0; i < 240; i++) Controller.advance(b, 30); // 1800× ≈ 30 steps per frame
  assert.strictEqual(a.s.Ta, b.s.Ta);
  assert.strictEqual(a.kWh, b.kWh);
});
