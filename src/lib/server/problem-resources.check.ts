/**
 * Problem descriptions arrive with every image, data file and cross-reference written relative
 * to projecteuler.net's document root, so the two things worth asserting are that a relative URL
 * still points somewhere real once served from our origin, and that a problem's data file gets
 * the name the problem itself calls it.
 *
 * The fixtures are the real `minimal=` bodies, trimmed — the format is the input under test.
 */
import assert from 'node:assert';
import { getProblemAttachments, getProblemHtml, parseAttachments, resolveLinks } from './problems.ts';

// --- relative URLs --------------------------------------------------------------------------

// Problem 15's grid, the image that rendered broken while only the pre-2023 `project/` prefix
// was rewritten.
assert.match(
	resolveLinks('<div class="center">\n<img src="resources/images/0015.png?1678992052"></div>'),
	/src="https:\/\/projecteuler\.net\/resources\/images\/0015\.png\?1678992052"/
);

// A cross-reference belongs on our own page for that problem, not back on the site.
assert.match(
	resolveLinks('<p>...the same challenge as <a href="problem=18">Problem 18</a></p>'),
	/<a href="\/problem\/18">/
);

// Anything that already resolves is left exactly as it was.
for (const url of ['https://example.com/x.png', '//cdn.example.com/x', '/problem/7', '#top']) {
	const html = `<a href="${url}">x</a>`;
	assert.equal(resolveLinks(html), html, `rewrote an already-absolute URL: ${url}`);
}

// Off-site links open in a new tab so following one does not take the editor with it.
assert.match(
	resolveLinks('<a href="about=roman_numerals">About</a>'),
	/<a target="_blank" rel="noopener noreferrer" href="https:\/\/projecteuler\.net\/about=roman_numerals">/
);

// --- data files -----------------------------------------------------------------------------

// Problem 22: link text is the bare name, the file on the server is prefixed. Both must work.
const [names] = parseAttachments(
	'<p>Using <a href="resources/documents/0022_names.txt">names.txt</a> (right click and ...)</p>'
);
assert.equal(names.name, 'names.txt');
assert.deepEqual(names.aliases, ['0022_names.txt']);
assert.equal(names.url, 'https://projecteuler.net/resources/documents/0022_names.txt');

// Problem 59 writes the prefixed name instead, so that is the name its solutions will open.
const [cipher] = parseAttachments(
	'<p>...file <a href="resources/documents/0059_cipher.txt">0059_cipher.txt</a>...</p>'
);
assert.equal(cipher.name, '0059_cipher.txt');
assert.deepEqual(cipher.aliases, ['cipher.txt']);

// Link text that is prose rather than a filename falls back to the unprefixed name.
const [sudoku] = parseAttachments(
	'<p><a href="resources/documents/0096_sudoku.txt">this 6K text file</a></p>'
);
assert.equal(sudoku.name, 'sudoku.txt');
assert.deepEqual(sudoku.aliases, ['0096_sudoku.txt']);

// Images and cross-references are not data files; a problem with no file gets none.
assert.deepEqual(
	parseAttachments(
		'<img src="resources/images/0107_1.png?1678992052"><a href="problem=81">Problem 81</a>'
	),
	[]
);

// Problem 96 links its file twice, once per paragraph; it is still one file.
assert.equal(
	parseAttachments(
		'<a href="resources/documents/0096_sudoku.txt">sudoku.txt</a>' +
			'<a href="resources/documents/0096_sudoku.txt">sudoku.txt</a>'
	).length,
	1
);

// --- fetching -------------------------------------------------------------------------------

// Opening a problem asks for its description and its file list together, and both are read out
// of the same response; projecteuler.net must see one request, not two.
let requests = 0;
globalThis.fetch = (async () => {
	requests++;
	return new Response('<p>Using <a href="resources/documents/0022_names.txt">names.txt</a></p>');
}) as typeof fetch;

const [html, attachments] = await Promise.all([getProblemHtml(22), getProblemAttachments(22)]);
assert.equal(requests, 1, `one description fetch expected, made ${requests}`);
assert.match(html, /href="https:\/\/projecteuler\.net\/resources\/documents\/0022_names\.txt"/);
assert.equal(attachments[0].name, 'names.txt');

console.log('ok');
