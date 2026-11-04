import type { EnrollmentStatus } from '../models/index.js';

export function canReviewEnrollment(status: EnrollmentStatus): boolean {
  return status === 'pending';
}

export function hasAvailableClassSlot(studentCount: number, capacity: number): boolean {
  if (!Number.isInteger(studentCount) || studentCount < 0 ||
      !Number.isInteger(capacity) || capacity < 1) {
    throw new RangeError('A quantidade de alunos e a capacidade devem ser inteiros válidos.');
  }
  return studentCount < capacity;
}
