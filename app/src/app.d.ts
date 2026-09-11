// See https://svelte.dev/docs/kit/types#app.d.ts

declare global {
	namespace App {
		interface Locals {
			deviceUuid: string;
			device: import('$lib/types').DeviceSession | null;
			admin: import('$lib/types').AdminSession | null;
		}
	}
}

export {};

declare module '*.sql?raw' {
	const content: string;
	export default content;
}
