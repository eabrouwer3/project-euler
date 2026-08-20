/**
 * The region is the part of a sandbox's identity that nothing reports back: a checkpoint carries
 * no region in `Sandbox.checkpoints()`, and one captured elsewhere fails only at boot, for every
 * user, until somebody deletes it. Both halves of the defence are asserted here — the name that
 * keeps a foreign snapshot from ever being reached for, and the reading of the failure that says
 * one is in the way, since a recovery that cannot name the snapshot cannot delete it either.
 */
import assert from 'node:assert';
import { Sandbox } from 'railway';
import { checkpointName, planRecovery, wrongRegion } from './sandbox.ts';

const template = Sandbox.template().withPackages('curl').run('echo 1');
const other = Sandbox.template().withPackages('curl').run('echo 2');

// --- checkpoint names -----------------------------------------------------------------------

// The same toolchain in two regions is two snapshots, and neither may answer to the other's name.
assert.notEqual(
	checkpointName(template, 'us-east4-eqdc4a'),
	checkpointName(template, 'us-west2'),
	'a region change left the checkpoint name unchanged'
);

// The region is legible in the name, since it is the one thing a checkpoint listing omits.
assert.match(checkpointName(template, 'us-east4-eqdc4a'), /^euler-runner-us-east4-eqdc4a-/);

// Editing the toolchain still renames the checkpoint; the region did not replace that.
assert.notEqual(checkpointName(template, 'us-west2'), checkpointName(other, 'us-west2'));

// And an unchanged toolchain keeps its name, or every deploy would rebuild the toolchain.
assert.equal(checkpointName(template, 'us-west2'), checkpointName(template, 'us-west2'));

// --- the wrong-region failure ---------------------------------------------------------------

// Railway's own wording, verbatim from the failure that took code execution down: the recovery
// gets the checkpoint to delete and the region it is stranded in out of this string or nowhere.
assert.deepEqual(
	wrongRegion(
		new Error(
			'RailwayGraphQLError: Checkpoint "83912f012d2a6e9c9d2962a1acc54e55cc9c980ae4e7fc643bc9feef289ec927" ' +
				'lives in us-west2 and cannot boot in us-east4-eqdc4a.'
		)
	),
	{
		checkpoint: '83912f012d2a6e9c9d2962a1acc54e55cc9c980ae4e7fc643bc9feef289ec927',
		region: 'us-west2'
	}
);

// A checkpoint of ours reads the same way; the name carries hyphens, the region parses regardless.
assert.deepEqual(
	wrongRegion(
		new Error(
			'Checkpoint "euler-runner-us-west2-be4d13e58dc8055e" lives in us-west2 ' +
				'and cannot boot in us-east4-eqdc4a.'
		)
	),
	{ checkpoint: 'euler-runner-us-west2-be4d13e58dc8055e', region: 'us-west2' }
);

// Anything else must not spend a toolchain rebuild: a boot that failed on quota, on a missing
// credential or on a deleted snapshot is retried or reported, never "recovered" from.
for (const message of [
	'Sandbox limit reached for this environment',
	'Checkpoint "euler-runner-us-west2-0123456789abcdef" not found',
	'Unauthorized'
]) {
	assert.equal(wrongRegion(new Error(message)), null, `treated as a region failure: ${message}`);
}

assert.equal(wrongRegion('Checkpoint "x" lives in us-west2 and cannot boot in us-east4'), null);

// --- recovering from it ---------------------------------------------------------------------

const stale = { checkpoint: 'recipe-hash', region: 'us-west2' };
const east = 'us-east4-eqdc4a';

// The snapshot in the way goes first: deleting it is what lets the toolchain be built here.
assert.deepEqual(planRecovery(stale, { region: east, discarded: new Set() }), {
	delete: 'recipe-hash'
});

// Failing again on a snapshot already deleted means the rebuild landed in the same foreign region,
// which no further deleting fixes — so run there rather than run nowhere.
assert.deepEqual(planRecovery(stale, { region: east, discarded: new Set(['recipe-hash']) }), {
	adopt: 'us-west2'
});

// And once we are in the region it names, there is nothing left to try: the failure stands rather
// than becoming a loop.
assert.equal(planRecovery(stale, { region: 'us-west2', discarded: new Set(['recipe-hash']) }), null);

// A different snapshot in the way is a different obstruction, and gets its own delete…
assert.deepEqual(planRecovery(stale, { region: east, discarded: new Set(['another']) }), {
	delete: 'recipe-hash'
});

// …but only so many. A Railway that answers every rebuild with a new unbootable snapshot must not
// be able to spend builds indefinitely, so past the cap the plan moves on to the region.
assert.deepEqual(
	planRecovery(stale, { region: east, discarded: new Set(['a', 'b', 'c']) }),
	{ adopt: 'us-west2' },
	'kept deleting snapshots past the cap'
);

// The loop the recovery drives has to terminate whatever Railway answers with. Worst case: every
// attempt names a snapshot never seen before, in a region that never becomes ours.
let region = east;
const seen = new Set<string>();
let plans = 0;

for (let attempt = 0; ; attempt++) {
	const plan = planRecovery({ checkpoint: `snapshot-${attempt}`, region: 'us-west2' }, {
		region,
		discarded: seen
	});
	if (plan === null) break;

	plans++;
	if ('delete' in plan) seen.add(plan.delete);
	else region = plan.adopt;

	assert.ok(plans < 10, 'recovery plan never ran out of things to try');
}

console.log('ok');
