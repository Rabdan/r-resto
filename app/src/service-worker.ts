/// <reference types="@sveltejs/kit" />
/// <reference no-default-lib="true"/>
/// <reference lib="esnext" />
/// <reference lib="webworker" />

import { build, files, version } from '$service-worker';

const CACHE = `r-resto-${version}`;
const ASSETS = [...build, ...files];

self.addEventListener('install', (event) => {
	event.waitUntil(
		caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting())
	);
});

self.addEventListener('activate', (event) => {
	event.waitUntil(
		caches.keys().then(async (keys) => {
			for (const key of keys) {
				if (key !== CACHE) await caches.delete(key);
			}
			await self.clients.claim();
		})
	);
});

self.addEventListener('fetch', (event) => {
	const request = event.request;
	if (request.method !== 'GET') return;

	const url = new URL(request.url);
	if (url.origin !== self.location.origin) return;
	if (url.pathname.startsWith('/api/')) return;

	if (request.mode === 'navigate') {
		event.respondWith(networkFirst(request));
		return;
	}

	if (url.pathname.startsWith('/_app/immutable/')) {
		event.respondWith(cacheFirst(request));
		return;
	}

	event.respondWith(staleWhileRevalidate(event));
});

async function put(request: Request, response: Response): Promise<Response> {
	if (response.ok) {
		const copy = response.clone();
		const cache = await caches.open(CACHE);
		await cache.put(request, copy);
	}
	return response;
}

async function networkFirst(request: Request): Promise<Response> {
	try {
		return await put(request, await fetch(request));
	} catch {
		const cached = await caches.match(request);
		if (cached) return cached;
		const shell = await caches.match('/');
		if (shell) return shell;
		throw new Error('offline');
	}
}

async function cacheFirst(request: Request): Promise<Response> {
	const cached = await caches.match(request);
	if (cached) return cached;
	return put(request, await fetch(request));
}

async function staleWhileRevalidate(event: FetchEvent): Promise<Response> {
	const request = event.request;
	const cached = await caches.match(request);
	const network = fetch(request)
		.then((response) => put(request, response))
		.catch(() => undefined);
	if (cached) {
		event.waitUntil(network);
		return cached;
	}
	const response = await network;
	if (response) return response;
	throw new Error('offline');
}
