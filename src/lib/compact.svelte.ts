// Whether the viewport is below Tailwind's `md` breakpoint — the same line the layout already
// splits on, but readable from script rather than only from a class. The editor needs it because
// two of its mobile accommodations (soft-wrapping, native selection) are configuration rather
// than styling, and CSS cannot reach them.
import { browser } from '$app/environment';

const QUERY = '(max-width: 767px)';

let matches = $state(browser ? window.matchMedia(QUERY).matches : false);

if (browser) {
	window.matchMedia(QUERY).addEventListener('change', (e) => (matches = e.matches));
}

export const compact = {
	get current() {
		return matches;
	}
};
