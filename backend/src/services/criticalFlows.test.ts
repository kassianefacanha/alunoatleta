import assert from 'node:assert/strict';
import test from 'node:test';
import { calculateAge } from './dates.js';
import { canReviewEnrollment, hasAvailableClassSlot } from './enrollmentRules.js';

test('calcula idade antes e depois do aniversário no ano', () => {
  assert.equal(calculateAge(new Date('2010-11-04T12:00:00.000Z'), new Date('2026-11-03T12:00:00.000Z')), 15);
  assert.equal(calculateAge(new Date('2010-11-04T12:00:00.000Z'), new Date('2026-11-04T12:00:00.000Z')), 16);
});

test('só inscrições pendentes podem ser analisadas', () => {
  assert.equal(canReviewEnrollment('pending'), true);
  assert.equal(canReviewEnrollment('approved'), false);
  assert.equal(canReviewEnrollment('rejected'), false);
});

test('a turma tem vagas somente abaixo da capacidade', () => {
  assert.equal(hasAvailableClassSlot(0, 1), true);
  assert.equal(hasAvailableClassSlot(29, 30), true);
  assert.equal(hasAvailableClassSlot(30, 30), false);
  assert.equal(hasAvailableClassSlot(31, 30), false);
});

test('a verificação de capacidade rejeita contagens inválidas', () => {
  assert.throws(() => hasAvailableClassSlot(-1, 30), RangeError);
  assert.throws(() => hasAvailableClassSlot(0, 0), RangeError);
  assert.throws(() => hasAvailableClassSlot(1.5, 30), RangeError);
});
