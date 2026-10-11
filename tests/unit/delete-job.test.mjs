// A job can be deleted only while no record uses it.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deleteUnusedJob, archiveJob } from '../../src/jobs.js';

const jobs = [{ id: 'w', name: 'Westfield', active: true }, { id: 'f', name: 'Flyers', active: true }];
const records = [{ id: 'r1', jobId: 'w' }, { id: 'r2' }];

test('an unused job is removed; others are untouched', () => {
  const next = deleteUnusedJob(jobs, records, 'f');
  assert.deepEqual(next.map((j) => j.id), ['w']);
  assert.equal(jobs.length, 2, 'the original list is not mutated');
});

test('a job used by any record is never deleted', () => {
  const next = deleteUnusedJob(jobs, records, 'w');
  assert.equal(next, jobs, 'same array back, nothing removed');
});

test('archived unused jobs can be deleted; unknown ids change nothing', () => {
  const archived = archiveJob(jobs, 'f');
  assert.deepEqual(deleteUnusedJob(archived, records, 'f').map((j) => j.id), ['w']);
  assert.equal(deleteUnusedJob(jobs, records, 'nope'), jobs);
  assert.deepEqual(deleteUnusedJob(null, null, 'x'), []);
});

test('once its last record is gone, the job becomes deletable', () => {
  assert.equal(deleteUnusedJob(jobs, records, 'w'), jobs);
  assert.deepEqual(deleteUnusedJob(jobs, records.filter((r) => r.jobId !== 'w'), 'w').map((j) => j.id), ['f']);
});
