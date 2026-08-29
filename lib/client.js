window.__ModuleLoader__.load({
	id: "dsh-plugin-web-search-searxng",
	factory: (require) => {
		var module = { exports: {} };
		var exports = module.exports;
		Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
		//#region requires
		let react = require("react");
		let react_jsx_runtime = require("react/jsx-runtime");
		//#endregion
		//#region styles
		const css = ".wsRoot{flex-direction:column;gap:18px;display:flex}.wsTitle{color:var(--dsw-alias-label-primary);font-size:14px;font-weight:600;line-height:22px}.wsDesc{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.wsProviders{flex-direction:column;gap:8px;display:flex}.wsCard{box-sizing:border-box;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-layer-2);border:1px solid var(--dsw-alias-border-l2);border-radius:12px;align-items:center;gap:10px;padding:12px 14px;display:flex}.wsCard:hover{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-interactive-bg-hover)}.wsCardActive{border-color:var(--dsw-alias-state-business-primary);background:var(--dsw-alias-state-business-tertiary)}.wsCardBody{flex-direction:column;flex:1;min-width:0;display:flex}.wsCardName{font-size:13px;font-weight:600;line-height:20px}.wsCardHint{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.wsCheck{color:var(--dsw-alias-state-business-primary);flex:0 0 18px;place-items:center;display:grid}.wsStatus{color:var(--dsw-alias-label-tertiary);font-size:12px;line-height:18px}.wsErr{color:var(--dsw-alias-state-error-primary);font-size:12px;line-height:18px}.wsBtn{height:30px;color:var(--dsw-alias-label-primary);background:var(--dsw-alias-bg-module-platform);border:1px solid var(--dsw-alias-border-l2);border-radius:7px;font:inherit;cursor:pointer;padding:0 12px;font-size:12px}.wsBtn:hover:not(:disabled){background:var(--dsw-alias-interactive-bg-hover)}.wsBtn:disabled{color:var(--dsw-alias-label-caption);cursor:wait}";
		const tagId = "dsh-plugin-web-search-searxng/settings";
		if (typeof document !== "undefined" && document.querySelector("style[data-plugin-css=" + JSON.stringify(tagId) + "]") === null) {
			const tag = document.createElement("style");
			tag.dataset.plugin = "dsh-plugin-web-search-searxng";
			tag.dataset.pluginCss = tagId;
			tag.textContent = css;
			document.head.appendChild(tag);
		}
		const csscls = {
			"root": "wsRoot", "title": "wsTitle", "desc": "wsDesc", "providers": "wsProviders",
			"card": "wsCard", "cardActive": "wsCardActive", "cardBody": "wsCardBody",
			"cardName": "wsCardName", "cardHint": "wsCardHint", "check": "wsCheck",
			"status": "wsStatus", "err": "wsErr", "btn": "wsBtn"
		};
		//#endregion
		//#region locales
		/** Dictionary namespace owned by this plugin. */
		const NS = "webSearch";
		const zh = {
			"nav": "搜索提供商",
			"title": "搜索提供商",
			"desc": "选择 DSH 的 web_search 工具使用哪个后端检索网页。",
			"current": "当前",
			"hint.searxng": "本地 SearXNG 元搜索引擎（免费、无 API key、数据不出本机）",
			"hint.deepseek": "DeepSeek 原生 web_search（云端）",
			"hint.unknown": "第三方搜索后端",
			"status.loading": "读取中…",
			"status.error": "加载失败：{message}",
			"set.ok": "已切换为 {name}",
			"set.err": "切换失败：{message}",
			"btn.apply": "应用"
		};
		const en = {
			"nav": "Search Provider",
			"title": "Search Provider",
			"desc": "Choose which backend the web_search tool uses to search the web.",
			"current": "current",
			"hint.searxng": "Local SearXNG metasearch (free, no API key, data stays on this machine)",
			"hint.deepseek": "DeepSeek native web_search (cloud)",
			"hint.unknown": "third-party search backend",
			"status.loading": "Loading…",
			"status.error": "Failed to load: {message}",
			"set.ok": "Switched to {name}",
			"set.err": "Switch failed: {message}",
			"btn.apply": "Apply"
		};
		//#endregion
		//#region settings section component
		/** Render the web-search provider settings panel. */
		function SearchProviderSection(props) {
			const t = props.t;
			const [state, setState] = react.useState({ status: "loading", current: null, providers: [], error: null });
			const [busy, setBusy] = react.useState(false);
			const [notice, setNotice] = react.useState(null);
			const api = props.api;
			const load = () => {
				setState((s) => ({ ...s, status: "loading" }));
				api.providers().then((value) => {
					setState({ status: "ready", current: value.current, providers: value.providers, error: null });
				}, (error) => {
					setState({ status: "error", current: null, providers: [], error: error.message });
				});
			};
			react.useEffect(() => {
				load();
				// eslint-disable-next-line react-hooks/exhaustive-deps
			}, []);
			const choose = (id) => {
				if (busy) return;
				setBusy(true);
				setNotice(null);
				api.set(id).then((value) => {
					setState((s) => ({ ...s, current: value.current }));
					setNotice({ ok: true, text: t("set.ok", { name: value.name }) });
					setBusy(false);
				}, (error) => {
					setNotice({ ok: false, text: t("set.err", { message: error.message }) });
					setBusy(false);
				});
			};
			return react_jsx_runtime.jsx("div", {
				className: csscls.root,
				children: [
					react_jsx_runtime.jsx("div", {
						className: csscls.title,
						children: t("title")
					}),
					react_jsx_runtime.jsx("div", {
						className: csscls.desc,
						children: t("desc")
					}),
					state.status === "loading" && react_jsx_runtime.jsx("div", {
						className: csscls.status,
						children: t("status.loading")
					}),
					state.status === "error" && react_jsx_runtime.jsx("div", {
						className: csscls.err,
						children: t("status.error", { message: state.error })
					}),
					state.status === "ready" && react_jsx_runtime.jsx("div", {
						className: csscls.providers,
						children: state.providers.map((p) => {
							const active = p.id === state.current;
							return react_jsx_runtime.jsxs("button", {
								type: "button",
								className: csscls.card + (active ? " " + csscls.cardActive : ""),
								disabled: busy || !p.available,
								onClick: () => choose(p.id),
								children: [
									react_jsx_runtime.jsxs("div", {
										className: csscls.cardBody,
										children: [
											react_jsx_runtime.jsx("span", {
												className: csscls.cardName,
												children: p.name + (active ? " · " + t("current") : "")
											}),
											react_jsx_runtime.jsx("span", {
												className: csscls.cardHint,
												children: t(p.id === "searxng" ? "hint.searxng" : p.id === "deepseek-official" ? "hint.deepseek" : "hint.unknown")
											})
										]
									}),
									react_jsx_runtime.jsx("span", {
										className: csscls.check,
										children: active ? "\u2713" : ""
									})
								]
							}, p.id);
						})
					}),
					notice !== null && react_jsx_runtime.jsx("div", {
						className: notice.ok ? csscls.status : csscls.err,
						children: notice.text
					})
				]
			});
		}
		//#endregion
		//#region apply
		const inject = ["slots", "locale"];
		/** Client plugin body: register the "搜索提供商" settings section. */
		function apply(ctx) {
			ctx.effect(() => ctx.locale.register(NS, { zh, en }), "dsh-plugin-web-search-searxng: dictionaries");
			const t = ctx.locale.bind(NS);
			ctx.slots.inject("settings.section", () => ctx.slots.register({
				name: "settings.section",
				id: "search-provider",
				order: 100,
				label: () => t("nav"),
				locale: NS,
				inject: () => ({
					t,
					api: {
						providers: async () => {
							const res = await fetch("/websearch/api/providers", { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
							const body = await res.json();
							if (!body.ok) throw new Error(body.error?.message ?? "failed");
							return body.value;
						},
						set: async (id) => {
							const res = await fetch("/websearch/api/set", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ provider: id }) });
							const body = await res.json();
							if (!body.ok) throw new Error(body.error?.message ?? "failed");
							return body.value;
						}
					}
				})
			}, SearchProviderSection));
		}
		//#endregion
		exports.apply = apply;
		exports.inject = inject;
		return module.exports;
	}
});
