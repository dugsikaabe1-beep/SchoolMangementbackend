import test from 'node:test';
import assert from 'node:assert/strict';

import {
  academicTermParamSchema,
  academicTermQuerySchema,
  createAcademicTermSchema,
  updateAcademicTermSchema,
} from '../src/middlewares/validationMiddleware.js';

const objectId = '64b7f0d2c9f1a2b3c4d5e6f7';

test('academic term create validation accepts a complete valid payload', () => {
  const result = createAcademicTermSchema.safeParse({
    body: {
      name: 'Term 1',
      code: 'T1',
      academicYear: objectId,
      startDate: '2026-01-05',
      endDate: '2026-04-05',
      order: 1,
      status: 'active',
      isCurrent: true,
    },
  });

  assert.equal(result.success, true);
});

test('academic term create validation rejects an invalid academic year id', () => {
  const result = createAcademicTermSchema.safeParse({
    body: {
      name: 'Term 1',
      academicYear: 'bad-id',
      startDate: '2026-01-05',
      endDate: '2026-04-05',
      order: 1,
    },
  });

  assert.equal(result.success, false);
});

test('academic term create validation rejects an end date before the start date', () => {
  const result = createAcademicTermSchema.safeParse({
    body: {
      name: 'Term 1',
      academicYear: objectId,
      startDate: '2026-04-05',
      endDate: '2026-01-05',
      order: 1,
    },
  });

  assert.equal(result.success, false);
});

test('academic term update validation allows partial status updates', () => {
  const result = updateAcademicTermSchema.safeParse({
    params: { id: objectId },
    body: { status: 'completed' },
  });

  assert.equal(result.success, true);
});

test('academic term query and params validation reject malformed ids', () => {
  const queryResult = academicTermQuerySchema.safeParse({
    query: { academicYearId: 'not-an-object-id' },
  });
  const paramResult = academicTermParamSchema.safeParse({
    params: { id: 'not-an-object-id' },
  });

  assert.equal(queryResult.success, false);
  assert.equal(paramResult.success, false);
});
