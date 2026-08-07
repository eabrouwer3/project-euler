/**
 * Lists sandboxes in the environment, and destroys them with --destroy.
 *
 * Sandboxes bill while they run, including while idle, so a benchmark or a runner that
 * crashed between create and destroy leaves something costing money behind. Idle timeouts
 * eventually collect them, but this makes it immediate and visible.
 *
 *   RAILWAY_API_TOKEN=... RAILWAY_ENVIRONMENT_ID=... node --experimental-strip-types bench/sandbox-cleanup.ts [--destroy]
 */
import { Sandbox } from 'railway';

const list = await Sandbox.list();
console.log(`${list.length} sandbox(es) in environment`);

for (const s of list) {
	console.log(` - ${s.id}  status=${s.status}  region=${s.region ?? '?'}`);
	if (process.argv.includes('--destroy')) {
		// list() returns plain records, not live handles — reattach before tearing down.
		await Sandbox.connect(s.id)
			.then((h) => h.destroy())
			.then(() => console.log('   destroyed'))
			.catch((e: Error) => console.log(`   destroy failed: ${e.message}`));
	}
}

if (!process.argv.includes('--destroy') && list.length > 0) {
	console.log('\npass --destroy to tear these down');
}
