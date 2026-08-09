// How much of the layout viewport the on-screen keyboard is currently covering.
//
// A `position: fixed` element is placed against the layout viewport, which the keyboard does not
// move — so `bottom: 0` puts a toolbar behind the keyboard rather than above it. `visualViewport`
// is what actually reports the part still on screen, and the difference between the two is the
// inset a fixed element has to be lifted by.
//
// Chrome, given `interactive-widget=resizes-content` in the viewport meta, shrinks the layout
// viewport itself and this comes out at 0. Safari does not, and this is what carries it there.
import { browser } from '$app/environment';

let inset = $state(0);

if (browser) {
	const viewport = window.visualViewport;
	if (viewport) {
		const measure = () => {
			inset = Math.max(0, window.innerHeight - (viewport.height + viewport.offsetTop));
		};
		measure();
		viewport.addEventListener('resize', measure);
		// The visual viewport pans independently of the page on iOS, so its own scroll moves the
		// bottom edge too.
		viewport.addEventListener('scroll', measure);
	}
}

export const keyboardInset = {
	get current() {
		return inset;
	}
};
