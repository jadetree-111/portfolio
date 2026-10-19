import test from 'node:test';
import assert from 'node:assert/strict';
import { planSlices } from '../shared/image-plan.js';

const covers = (slices, height) => {
  assert.equal(slices[0].y, 0);
  const last = slices.at(-1);
  assert.equal(last.y + last.h, height, 'last slice reaches the bottom');
  slices.slice(1).forEach((s, i) => {
    const prev = slices[i];
    assert.ok(s.y < prev.y + prev.h, `slice ${i + 1} overlaps the previous one`);
    assert.ok(s.y > prev.y, 'slices move downwards');
  });
};

test('small and wide images stay in one piece', () => {
  assert.deepEqual(planSlices(1080, 2000), { scale: 1, slices: [{ y: 0, h: 2000 }] });
  const wide = planSlices(4000, 3000);
  assert.equal(wide.slices.length, 1);
  assert.ok(Math.abs(wide.scale - 0.6) < 1e-9);
});

test('a long phone screenshot is cut into overlapping bands at full resolution', () => {
  const { scale, slices } = planSlices(1080, 8000);
  assert.equal(scale, 1);
  assert.equal(slices.length, 5);
  covers(slices, 8000);
  assert.ok(slices.every((s) => s.h <= 2400));
});

test('slightly tall images get two bands', () => {
  const { slices } = planSlices(1000, 2500);
  assert.equal(slices.length, 2);
  covers(slices, 2500);
});

test('extremely long images are capped at six bands and scaled down', () => {
  const { scale, slices } = planSlices(1080, 40000);
  assert.equal(slices.length, 6);
  assert.ok(scale < 1);
  covers(slices, 40000);
  assert.ok(slices.every((s) => s.h * scale <= 2400 + 1), 'every band fits the edge limit after scaling');
});

test('wide and tall at once is scaled to the width limit', () => {
  const { scale, slices } = planSlices(3000, 12000);
  assert.ok(scale <= 0.8);
  covers(slices, 12000);
});
