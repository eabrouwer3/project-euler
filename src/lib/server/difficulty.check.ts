/**
 * The difficulty rating is stated once per problem page, inside the tooltip beside the title, so
 * what is worth asserting is that it is read out of a real page and that an unrated problem —
 * which simply has no such line — comes back as "no rating" rather than a zero.
 *
 * The fixtures are the real tooltips, trimmed; the markup around them is the input under test.
 */
import assert from 'node:assert';
import { parseDifficulty } from './difficulty.ts';

const tooltip = (text: string) =>
	`<div id="problem_icons" class="noprint"><span class="tooltip"><img src="/images/icons/info.png" class="icon"><span class="tooltiptext_right">${text}</span></span></div>`;

// Problem 100, mid-archive.
assert.deepEqual(
	parseDifficulty(
		tooltip(
			'Published on Saturday, 25th June 2005, 05:00 am and solved by 46826<br>Difficulty: Level 5 [13%]'
		)
	),
	{ level: 5, percent: 13 }
);

// Problem 1, the easiest in the archive, and the only place a level of zero shows up.
assert.deepEqual(
	parseDifficulty(
		tooltip(
			'Published on Friday, 5th October 2001, 06:00 pm and solved by 863130<br>Difficulty: Level 0 [1%]'
		)
	),
	{ level: 0, percent: 1 }
);

// Levels and percentages both run into two digits at the hard end of the archive.
assert.deepEqual(
	parseDifficulty(tooltip('Published on Sunday, 2nd July 2023, 08:00 am<br>Difficulty: Level 30 [77%]')),
	{ level: 30, percent: 77 }
);

// A recently published problem has no rating yet: the site omits the line rather than showing a
// zero, and reading that as "level 0" would put the hardest new problems at the top of the list.
assert.equal(
	parseDifficulty(
		tooltip('Published on Saturday, 6th June 2026, 08:00 pm and solved by 414<br>')
	),
	null
);

console.log('difficulty checks passed');
