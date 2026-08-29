/**
 * dsh-plugin-web-search-searxng — host half.
 *
 * Registers a `web` search provider backed by a local (or remote) SearXNG
 * instance's JSON API. Lets the harness search through SearXNG instead of a
 * paid/cloud search backend, while keeping the `ctx.web` provider seam intact.
 *
 * Provider id: `searxng`.
 *
 * Config (settings section `web-search-searxng`):
 *   baseURL    — SearXNG base URL, e.g. http://127.0.0.1:8889 (default)
 *   maxResults — provider-side result cap applied before the seam's own cap
 *   timeoutMs  — per-request timeout in ms (default 30000)
 */

import z from "@deepseek-ai/schemastery";
import { installSettingsSection, settingsNamespace } from "@deepseek-ai/dsh-settings";
import { WebError } from "@deepseek-ai/dsh-web";

const name = "web-search-searxng";

/** The web seam this provider registers into, plus the webserver route table for the settings API. */
const inject = ["web", "webServer"];

const PROVIDER_ID = "searxng";
/** Display labels for the settings selector (id → human name). */
const PROVIDER_LABELS = {
	searxng: "SearXNG",
	"deepseek-official": "DeepSeek"
};
const DEFAULT_BASE_URL = "http://127.0.0.1:8889";
const DEFAULT_MAX_RESULTS = 20;
const DEFAULT_TIMEOUT_MS = 30000;

const SEARXNG_BASE_URL_ENV = "SEARXNG_BASE_URL";
const WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE = settingsNamespace("web-search-searxng");

const Config = z.object({
	baseURL: z.string().default(DEFAULT_BASE_URL),
	maxResults: z.number().step(1).min(1).max(50).default(DEFAULT_MAX_RESULTS),
	timeoutMs: z.number().step(1).min(1000).default(DEFAULT_TIMEOUT_MS)
});

/**
 * Map a SearXNG JSON API response to the normalized `WebSearchResult` shape.
 * SearXNG returns `{ results: [{url, title, content, publishedDate, engine}], answers, infoboxes, ... }`.
 */
function mapSearxngResponse(payload) {
	const results = Array.isArray(payload?.results) ? payload.results : [];
	const sources = [];
	const seen = new Set();
	for (const item of results) {
		const url = item.url;
		if (typeof url !== "string" || url.length === 0 || seen.has(url)) continue;
		seen.add(url);
		sources.push({
			url,
			...item.title != null && String(item.title).length > 0 ? { title: String(item.title) } : {},
			...item.content != null && String(item.content).length > 0 ? { snippet: String(item.content) } : {},
			...item.publishedDate != null && String(item.publishedDate).length > 0 ? { publishedAt: String(item.publishedDate) } : {}
		});
	}
	return { sources, truncated: false };
}

/** True for a fetch/`AbortSignal` abort, surfaced as `WEB_ABORTED`. */
function isAbortError(error) {
	return error instanceof DOMException && error.name === "AbortError";
}

/** Throw the provider's stable cancellation error when the caller already aborted. */
function throwIfSearchAborted(signal) {
	if (signal?.aborted === true) throw searchAborted(signal);
}

function searchAborted(signal, fallback) {
	return new WebError("SearXNG search aborted", "WEB_ABORTED", { cause: signal?.aborted === true ? signal.reason : fallback });
}

/**
 * The SearXNG-backed search provider. `available()` is cheap and local:
 * the base URL must parse; no network probe.
 */
var SearxngSearchProvider = class {
	id = PROVIDER_ID;
	constructor(resolveOptions) {
		this.resolveOptions = resolveOptions;
	}
	available() {
		const options = this.resolveOptions();
		return URL.canParse(options.baseURL);
	}
	async search(request, signal) {
		const options = this.resolveOptions();
		throwIfSearchAborted(signal);

		const url = new URL("/search", options.baseURL);
		url.searchParams.set("q", request.query);
		url.searchParams.set("format", "json");
		url.searchParams.set("language", "auto");
		if (request.maxResults !== void 0) url.searchParams.set("num_results", String(Math.min(request.maxResults, options.maxResults)));
		else url.searchParams.set("num_results", String(options.maxResults));

		const controller = new AbortController();
		const timer = setTimeout(() => controller.abort(new Error("SearXNG request timeout")), options.timeoutMs);
		const onAbort = () => controller.abort(signal?.reason);
		if (signal !== void 0) signal.addEventListener("abort", onAbort, { once: true });

		let response;
		try {
			response = await fetch(url, {
				method: "GET",
				headers: {
					"accept": "application/json",
					"user-agent": "deepseek-harness/0.0.1 (searxng web-search provider)"
				},
				signal: controller.signal
			});
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			throw new WebError(`SearXNG search request failed: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		} finally {
			clearTimeout(timer);
			if (signal !== void 0) signal.removeEventListener("abort", onAbort);
		}

		if (!response.ok) {
			let message = `SearXNG API error (HTTP ${response.status})`;
			try {
				const parsed = await response.json();
				if (typeof parsed?.error === "string" && parsed.error.length > 0) message = parsed.error;
			} catch {
				// keep the status-based message
			}
			throw new WebError(message, "WEB_PROVIDER_ERROR");
		}

		try {
			const payload = await response.json();
			const mapped = mapSearxngResponse(payload);
			return {
				...mapped,
				truncated: mapped.sources.length > (request.maxResults ?? options.maxResults),
				sources: mapped.sources.slice(0, request.maxResults ?? options.maxResults)
			};
		} catch (error) {
			if (signal?.aborted === true || isAbortError(error)) throw searchAborted(signal, error);
			if (error instanceof WebError) throw error;
			throw new WebError(`SearXNG returned an unprocessable response body: ${String(error)}`, "WEB_PROVIDER_ERROR", { cause: error });
		}
	}
};

function resolveOptions(ctx, config) {
	return {
		baseURL: config.baseURL ?? process.env.SEARXNG_BASE_URL ?? DEFAULT_BASE_URL,
		maxResults: config.maxResults ?? DEFAULT_MAX_RESULTS,
		timeoutMs: config.timeoutMs ?? DEFAULT_TIMEOUT_MS
	};
}

/** Read the request body as JSON, tolerating an empty body. */
async function readJsonBody(req) {
	let raw = "";
	for await (const chunk of req) raw += chunk;
	if (raw.trim() === "") return {};
	try {
		return JSON.parse(raw);
	} catch (error) {
		throw new Error(`invalid JSON body: ${error instanceof Error ? error.message : String(error)}`);
	}
}

/** Write a JSON response (mirrors dsh-plugin-free-models' writeJson helper). */
function writeJson(res, status, body) {
	const data = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(data)
	});
	res.end(data);
}

/** Register the SearXNG search provider with `ctx.web` and expose the provider-switch settings API. */
function apply(ctx, config) {
	let current = () => config;
	installSettingsSection(ctx, WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE, Config, config, {
		setSource: (source) => {
			current = source;
		},
		onChange: () => {}
	});
	ctx.web.registerSearchProvider(new SearxngSearchProvider(() => resolveOptions(ctx, current())));
	// Provider switch API for the web-search settings panel.
	ctx.effect(() => ctx.webServer.register({
		kind: "prefix",
		path: "/websearch/api",
		handler: async (req, res) => {
			if (req.method !== "POST") {
				writeJson(res, 405, { ok: false, error: { code: "method-error", message: "method not allowed" } });
				return;
			}
			const pathname = new URL(req.url ?? "/", "http://dsh.internal").pathname;
			const method = pathname.startsWith("/websearch/api/") ? pathname.slice("/websearch/api/".length) : undefined;
			if (method === undefined || method.includes("/")) {
				writeJson(res, 404, { ok: false, error: { code: "not-found", message: "unknown websearch API method" } });
				return;
			}
			let payload;
			try {
				payload = await readJsonBody(req);
			} catch (error) {
				writeJson(res, 400, { ok: false, error: { code: "bad-request", message: error.message } });
				return;
			}
			try {
				switch (method) {
					case "providers": {
						const providers = ctx.web.listSearchProviders().map((p) => ({
							...p,
							name: PROVIDER_LABELS[p.id] ?? p.id
						}));
						writeJson(res, 200, { ok: true, value: { current: ctx.web.currentSearchProviderId(), providers } });
						return;
					}
					case "set": {
						const provider = payload.provider;
						if (typeof provider !== "string" || provider.length === 0) {
							writeJson(res, 400, { ok: false, error: { code: "bad-request", message: "provider is required" } });
							return;
						}
						ctx.web.setSearchProviderId(provider);
						writeJson(res, 200, { ok: true, value: { current: ctx.web.currentSearchProviderId(), name: PROVIDER_LABELS[provider] ?? provider } });
						return;
					}
					default:
						writeJson(res, 404, { ok: false, error: { code: "not-found", message: `unknown method "${method}"` } });
				}
			} catch (error) {
				writeJson(res, 500, { ok: false, error: { code: "websearch-error", message: error instanceof Error ? error.message : String(error) } });
			}
		}
	}), "dsh-plugin-web-search-searxng: /websearch/api routes");
}

export { Config, PROVIDER_ID, SearxngSearchProvider, WEB_SEARCH_SEARXNG_SETTINGS_NAMESPACE, apply, inject, name };
