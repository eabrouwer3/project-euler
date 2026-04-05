import type { DefaultSession } from '@auth/sveltekit';

declare global {
	namespace App {
		interface Locals {
			auth(): Promise<Session | null>;
		}
		interface PageData {
			session: Session | null;
		}
	}
}

declare module '@auth/sveltekit' {
	interface Session extends DefaultSession {
		user: {
			id: string;
			name: string;
			image?: string;
		};
	}
}

export {};
