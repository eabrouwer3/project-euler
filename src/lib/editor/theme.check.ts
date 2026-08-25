/**
 * The two ways a colour in this theme can be right in the palette and wrong on the screen.
 *
 * Both have been shipped, and both looked the same from the outside: text you had selected showed
 * no selection at all. Neither shows up in a test of the palette, because the palette was correct
 * both times — what went wrong was the CSS built around it. So these assertions read the rules back
 * out of the `StyleModule` the theme generates, which needs no DOM.
 */
import { EditorState, type Extension } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { atomOneDark, atomOneLight } from './theme.js';

function assert(condition: boolean, message: string): void {
	if (!condition) {
		console.error(`FAIL: ${message}`);
		process.exit(1);
	}
}

type Rule = { selectors: string[]; body: string };

/** The CSS a theme would mount, with each rule's comma-separated selectors split apart. */
function rulesOf(theme: Extension): Rule[] {
	return EditorState.create({ extensions: [theme] })
		.facet(EditorView.styleModule)
		.flatMap((mod) => mod.getRules().split('\n'))
		.flatMap((rule) => {
			const [head, body] = rule.split('{');
			return body ? [{ selectors: head.split(',').map((s) => s.trim()), body }] : [];
		});
}

function backgroundOf(rule: Rule): string | undefined {
	return /background(?:-color)?:\s*([^;}]+)/.exec(rule.body)?.[1].trim();
}

for (const [name, theme] of [
	['dark', atomOneDark],
	['light', atomOneLight]
] as const) {
	const rules = rulesOf(theme);

	// 1. The active-line band is painted on `.cm-line`, which sits above the layer `drawSelection`
	// draws the selection into. Opaque, it hides the selection on the line holding the cursor —
	// which is all of a selection made within one line, and the last line of one made across
	// several. Selecting a word looked like it did nothing at all.
	const activeLine = rules.find((rule) =>
		rule.selectors.some((s) => s.endsWith('.cm-activeLine'))
	);
	assert(activeLine !== undefined, `${name}: no .cm-activeLine background rule`);
	const background = backgroundOf(activeLine!);
	const alpha = /^#[0-9a-f]{6}([0-9a-f]{2})$/i.exec(background ?? '');
	assert(
		alpha !== null && parseInt(alpha[1], 16) < 64,
		`${name}: .cm-activeLine is ${background} — it needs an 8-digit hex with a low alpha, or it paints over the selection beneath it`
	);

	// 2. CodeMirror's own base theme paints the selection as well, from a selector six classes long
	// (`&dark.cm-focused > .cm-scroller > .cm-selectionLayer .cm-selectionBackground`). Anything
	// shorter here loses to it on specificity and the palette's colour never reaches the screen, so
	// both the focused and the unfocused rule have to walk the same path down the tree.
	const reaches = (s: string) => /> \.cm-scroller > \.cm-selectionLayer \.cm-selectionBackground$/.test(s);
	const selection = rules
		.filter((rule) => backgroundOf(rule) !== undefined)
		.flatMap((rule) => rule.selectors)
		.filter((s) => s.includes('.cm-selectionBackground'));
	assert(
		selection.some((s) => reaches(s) && s.includes('.cm-focused')),
		`${name}: the focused selection rule stops short of .cm-selectionLayer, so the base theme's own rule outweighs it`
	);
	assert(
		selection.some((s) => reaches(s) && !s.includes('.cm-focused')),
		`${name}: the unfocused selection rule stops short of .cm-selectionLayer, so the base theme's own rule outweighs it`
	);
}

console.log('PASS: editor theme assertions hold');
