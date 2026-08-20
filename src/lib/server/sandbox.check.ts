/**
 * The region is the part of a sandbox's identity that nothing reports back: a checkpoint carries
 * no region in `Sandbox.checkpoints()`, and one captured elsewhere fails only at boot, for every
 * user, until somebody deletes it. Both halves of the defence are asserted here — the name that
 * keeps a foreign snapshot from ever being reached for, and the error that says one was.
 */
import assert from 'node:assert';
import { Sandbox } from 'railway';
import { checkpointName, isWrongRegion } from './sandbox.ts';

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

// Railway's own wording, which is all there is to recognise it by.
assert.ok(
	isWrongRegion(
		new Error(
			'RailwayGraphQLError: Checkpoint "83912f012d2a6e9c9d2962a1acc54e55cc9c980ae4e7fc643bc9feef289ec927" ' +
				'lives in us-west2 and cannot boot in us-east4-eqdc4a.'
		)
	)
);

// Anything else must not spend a checkpoint rebuild: a boot that failed on quota or a missing
// credential is retried, not repaired.
for (const message of [
	'Sandbox limit reached for this environment',
	'Checkpoint "euler-runner-us-west2-0123456789abcdef" not found',
	'Unauthorized'
]) {
	assert.equal(isWrongRegion(new Error(message)), false, `treated as a region failure: ${message}`);
}

assert.equal(isWrongRegion('cannot boot in us-east4-eqdc4a'), false);

console.log('ok');
