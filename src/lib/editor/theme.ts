// The Atom One palettes the Monaco editor used, ported to CodeMirror 6. Two halves are needed
// where Monaco took one object: `EditorView.theme` paints the editor chrome, and a
// `HighlightStyle` over lezer's tags colours the code — Monaco's flat `token` strings have no
// direct equivalent.
import { EditorView } from '@codemirror/view';
import { HighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { tags as t } from '@lezer/highlight';
import type { Extension } from '@codemirror/state';

type Palette = {
	bg: string;
	fg: string;
	lineHighlight: string;
	selection: string;
	cursor: string;
	gutterFg: string;
	gutterActiveFg: string;
	panel: string;
	border: string;
	comment: string;
	keyword: string;
	string: string;
	escape: string;
	number: string;
	operator: string;
	type: string;
	func: string;
	property: string;
};

const DARK: Palette = {
	bg: '#282c34',
	fg: '#abb2bf',
	lineHighlight: '#2c313c',
	selection: '#3e4451',
	cursor: '#528bff',
	gutterFg: '#4b5263',
	gutterActiveFg: '#abb2bf',
	panel: '#21252b',
	border: '#181a1f',
	comment: '#5c6370',
	keyword: '#c678dd',
	string: '#98c379',
	escape: '#56b6c2',
	number: '#d19a66',
	operator: '#56b6c2',
	type: '#e5c07b',
	func: '#61afef',
	property: '#e06c75'
};

const LIGHT: Palette = {
	bg: '#fafafa',
	fg: '#383a42',
	lineHighlight: '#f0f0f0',
	selection: '#d0d0d0',
	cursor: '#526fff',
	gutterFg: '#9d9d9f',
	gutterActiveFg: '#383a42',
	panel: '#eaeaeb',
	border: '#d4d4d4',
	comment: '#a0a1a7',
	keyword: '#a626a4',
	string: '#50a14f',
	escape: '#0184bc',
	number: '#986801',
	operator: '#0184bc',
	type: '#c18401',
	func: '#4078f2',
	property: '#e45649'
};

function chrome(p: Palette, dark: boolean): Extension {
	return EditorView.theme(
		{
			// No height here: whether the editor fills its pane or grows with its content is a
			// platform decision, and lives in `fillHeight` / `autoHeight` below.
			'&': {
				color: p.fg,
				backgroundColor: p.bg
			},
			'.cm-scroller': {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
				lineHeight: '1.5'
			},
			'.cm-content': {
				caretColor: p.cursor,
				// Room to breathe at the top, and enough at the bottom that the last line is not
				// pinned against the key bar once the on-screen keyboard is up.
				padding: '12px 0 40px 0'
			},
			'.cm-line': { padding: '0 12px' },
			'.cm-cursor, .cm-dropCursor': {
				borderLeftColor: p.cursor,
				borderLeftWidth: '2px'
			},
			'&.cm-focused .cm-selectionBackground, .cm-selectionBackground, .cm-content ::selection': {
				backgroundColor: p.selection
			},
			'.cm-activeLine': { backgroundColor: p.lineHighlight },
			'.cm-gutters': {
				backgroundColor: p.bg,
				color: p.gutterFg,
				borderRight: 'none',
				// The gutter is sticky, so scrolled code passes underneath it. `.cm-line`'s own left
				// padding scrolls away with the text, which leaves nothing between a line number and
				// the code sliding past it; this is the gap that survives the scroll.
				paddingRight: '8px'
			},
			'.cm-activeLineGutter': {
				backgroundColor: p.lineHighlight,
				color: p.gutterActiveFg
			},
			'.cm-foldPlaceholder': {
				backgroundColor: 'transparent',
				border: 'none',
				color: p.comment
			},
			'.cm-matchingBracket, .cm-nonmatchingBracket': {
				backgroundColor: p.selection,
				outline: `1px solid ${p.gutterFg}`
			},
			'.cm-selectionMatch': { backgroundColor: p.selection },
			'.cm-panels': { backgroundColor: p.panel, color: p.fg },
			'.cm-panels input, .cm-panels button': {
				backgroundColor: p.bg,
				color: p.fg,
				border: `1px solid ${p.border}`,
				borderRadius: '4px',
				padding: '2px 6px'
			},
			'.cm-searchMatch': { backgroundColor: p.selection },
			'.cm-searchMatch.cm-searchMatch-selected': { backgroundColor: p.cursor, color: p.bg },
			'.cm-tooltip': {
				backgroundColor: p.panel,
				color: p.fg,
				border: `1px solid ${p.border}`,
				borderRadius: '6px'
			},
			'.cm-tooltip.cm-tooltip-autocomplete > ul': {
				fontFamily: 'ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace',
				maxHeight: '12em'
			},
			'.cm-tooltip.cm-tooltip-autocomplete > ul > li': { padding: '3px 8px' },
			'.cm-tooltip.cm-tooltip-autocomplete > ul > li[aria-selected]': {
				backgroundColor: p.cursor,
				color: dark ? '#ffffff' : '#ffffff'
			}
		},
		{ dark }
	);
}

function highlight(p: Palette): Extension {
	return syntaxHighlighting(
		HighlightStyle.define([
			{ tag: [t.comment, t.lineComment, t.blockComment, t.docComment], color: p.comment, fontStyle: 'italic' },
			{ tag: [t.keyword, t.modifier, t.controlKeyword, t.operatorKeyword, t.self, t.null], color: p.keyword },
			{ tag: [t.string, t.special(t.string), t.regexp], color: p.string },
			{ tag: [t.escape, t.character], color: p.escape },
			{ tag: [t.number, t.bool, t.atom, t.literal], color: p.number },
			{ tag: [t.operator, t.derefOperator, t.compareOperator, t.logicOperator, t.arithmeticOperator], color: p.operator },
			{ tag: [t.typeName, t.className, t.namespace, t.annotation, t.standard(t.typeName)], color: p.type },
			{ tag: [t.function(t.variableName), t.function(t.propertyName), t.labelName, t.macroName], color: p.func },
			{ tag: [t.propertyName, t.standard(t.variableName), t.definition(t.propertyName)], color: p.property },
			{ tag: [t.variableName, t.definition(t.variableName), t.meta], color: p.fg },
			{ tag: [t.processingInstruction, t.attributeName], color: p.type },
			{ tag: [t.bracket, t.paren, t.squareBracket, t.brace, t.separator, t.punctuation], color: p.fg },
			{ tag: [t.link, t.url], color: p.escape, textDecoration: 'underline' },
			{ tag: t.strong, fontWeight: 'bold' },
			{ tag: t.emphasis, fontStyle: 'italic' },
			{ tag: t.strikethrough, textDecoration: 'line-through' },
			{ tag: t.invalid, color: p.property }
		])
	);
}

/** Fill the pane and scroll inside it — the desktop arrangement, and what Monaco did. */
export const fillHeight: Extension = EditorView.theme({
	'&': { height: '100%' }
});

/**
 * Grow with the content instead, so the page scrolls rather than the editor. On a phone a box that
 * scrolls inside a page that also scrolls is the thing that makes reading a solution a fight; the
 * minimum keeps a three-line answer from collapsing to a sliver.
 *
 * The base theme already gives `.cm-scroller` `overflow-x: auto`, so long lines scroll sideways —
 * which is why soft wrapping comes off when this goes on. Vertical overflow never triggers,
 * because the editor is exactly as tall as its content, so a vertical drag scrolls the page.
 */
export const autoHeight: Extension = EditorView.theme({
	'&': { height: 'auto' },
	'.cm-scroller': { height: 'auto' },
	// The trailing padding the desktop editor uses to let you scroll past the last line is dead
	// space here — the editor ends where the code does, and what follows it is the rest of the page.
	'.cm-content': { minHeight: '50dvh', paddingBottom: '12px' }
});

export const atomOneDark: Extension = [chrome(DARK, true), highlight(DARK)];
export const atomOneLight: Extension = [chrome(LIGHT, false), highlight(LIGHT)];

export function editorTheme(mode: 'dark' | 'light' | undefined): Extension {
	return mode === 'dark' ? atomOneDark : atomOneLight;
}
