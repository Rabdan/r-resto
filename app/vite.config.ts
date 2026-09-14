import adapter from '@sveltejs/adapter-node';
import { sveltekit } from '@sveltejs/kit/vite';
import tailwindcss from '@tailwindcss/vite';
import { defineConfig } from 'vite';

export default defineConfig({
	plugins: [
		tailwindcss(),
		sveltekit({
			compilerOptions: {
				runes: ({ filename }) =>
					filename.split(/[/\\]/).includes('node_modules') ? undefined : true
			},
			adapter: adapter(),
			// Админка работает по HTTP без TLS (LAN); adapter-node по умолчанию считает
			// origin как `https://`, из-за чего multipart-загрузки картинок падают с 403
			// (Cross-site POST). sameSite=lax на admin_session уже блокирует CSRF-подделку.
			csrf: {
				trustedOrigins: ['*']
			}
		})
	],
	ssr: {
		external: ['better-sqlite3', 'exceljs']
	},
	server: {
		host: true,
		port: 5173
	}
});
