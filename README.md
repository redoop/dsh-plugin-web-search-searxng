# dsh-plugin-web-search-searxng

把**本地 SearXNG 元搜索引擎**注册为 DeepSeek Harness（DSH）web 的**搜索 provider**，并提供一个在设置页切换「搜索提供商」的选项卡（`searxng` / `deepseek`）。

搜素结果由本地 SearXNG 聚合（免费、无 API key、数据不出本机），替代云端的原生搜索后端。

## 功能

- 注册 `ctx.web` 搜索 provider（id `searxng`），走 SearXNG 的 JSON API
- 提供 `/websearch/api` HTTP 端点：列出 / 切换当前搜索 provider
- 在 DSH **设置 → 搜索提供商** 选项卡切换 `deepseek` / `searxng`
- 通过 bundle patch 把 `web.searchProvider` 默认指向 `searxng`

## 架构

```
DSH 设置面板 (client) ──fetch──▶ /websearch/api (host 插件) ──▶ ctx.web.setSearchProviderId(id)
        │                                                                      │
        └── 切换 provider ◀────────────── 持久共享变量 (dsh-web 运行时补丁) ◀──┘

web_search 工具 ──▶ ctx.web.search() ──▶ resolveProvider(configuredId) ──▶ SearXNG :8889
```

## 文件

| 文件 | 说明 |
|---|---|
| `lib/index.js` | host 半：注册 SearXNG provider + `/websearch/api` 端点 |
| `lib/client.js` | client 半：「搜索提供商」设置选项卡 |
| `cordis.patch.yml` | bundle patch（insert 插件行 + 覆盖 `web.searchProvider`） |
| `deploy/searxng.service` | SearXNG 的 systemd 服务模板 |

## 安装

在 DSH 的 web profile（`~/.dsh/profiles/web`）下添加插件并安装：

```sh
cd ~/.dsh/profiles/web
# 1. 在 package.json 的 dependencies 加：
#    "dsh-plugin-web-search-searxng": "link:/path/to/dsh-plugin-web-search-searxng"
# 2. 在 dsh.profile.bundles 数组里追加 "dsh-plugin-web-search-searxng"
pnpm install
sudo systemctl restart dsh.service    # 让插件 + 运行时补丁生效
```

`cordis.patch.yml` 会自动完成两件事：`insert` 插件行（激活模块）+ 把 `web` 服务行覆盖为 `searchProvider: searxng`。

## 配置

SearXNG 端点在 settings 的 `web-search-searxng` 命名空间配置（或环境变量 `SEARXNG_BASE_URL`）：

```yaml
web-search-searxng:
  baseURL: http://127.0.0.1:8889   # 默认
  maxResults: 20
  timeoutMs: 30000
```

## 使用

打开 DSH 设置 → **搜索提供商**，选择 `SearXNG` 或 `DeepSeek`。选择会立即对后续所有 `web_search` 生效。

## ⚠️ 运行时依赖：dsh-web 补丁

DSH 官方 `@deepseek-ai/dsh-web` 的 `WebRuntime` 原本把 `searchProvider` 固定在构造时，无法动态切换。本插件需要**运行时补丁**给 `WebRuntime` 增加：

1. `setSearchProviderId(id)` / `currentSearchProviderId()` / `listSearchProviders()`（动态切换）
2. 一个**模块级共享变量** `runtimeSearchProviderId`（让 host 与每个会话作用域的 `ctx.web` 实例读到同一个选择）

补丁位于 `node_modules/@deepseek-ai/dsh-web/lib/index.js`，内容见 `deploy/dsh-web.patch.diff`。包升级后需重打。若你的 DSH 版本已支持动态 provider，可移除该补丁。

## SearXNG 安装

SearXNG 官方推荐 Docker，但若环境无法拉取镜像（如 Docker Hub 被墙），可**从源码用 Python 3.11 编译安装**（SearXNG 要求 ≥3.11）：

```sh
# 1. 安装 Python 3.11 + 构建依赖
sudo apt-get install -y software-properties-common
sudo add-apt-repository -y ppa:deadsnakes/ppa
sudo apt-get install -y python3.11 python3.11-venv python3.11-dev build-essential libxml2-dev libxslt1-dev zlib1g-dev

# 2. 克隆源码（注意：searxng-docker 仓库已废弃，用主仓库）
git clone https://github.com/searxng/searxng.git ~/searxng

# 3. 建 venv 并装依赖（先在主目录装 msgspec，否则构建 searxng 时会报缺它）
python3.11 -m venv ~/searxng-venv
source ~/searxng-venv/bin/activate
pip install msgspec==0.21.1
pip install -r ~/searxng/requirements.txt
cd ~/searxng && pip install -e . --no-build-isolation

# 4. 生成配置（复制模板并改 secret_key / 端口 / 启用 json 格式）
cp ~/searxng/utils/templates/etc/searxng/settings.yml ~/searxng-instance/settings.yml
#   在 server: 段加 bind_address: 127.0.0.1 / port: 8889 / secret_key: <随机> / limiter: false
#   在 search: 段把 formats 加上 - json（否则 format=json 返回 403）
```

> 注意：PyPI 上的 `searxng` 只有占位版 `0.0.0.dev0`（损坏），必须从源码安装。安装时需要 `--no-build-isolation`，且先装 `msgspec`。

## SearXNG 启动

手动前台启动：

```sh
cd ~/searxng
source ~/searxng-venv/bin/activate
SEARXNG_SETTINGS_PATH=~/searxng-instance/settings.yml searxng-run
```

用 systemd 开机自启（推荐，见 `deploy/searxng.service`）：

```sh
sudo cp deploy/searxng.service /etc/systemd/system/searxng.service
# 按需把 User / WorkingDirectory / SEARXNG_SETTINGS_PATH 换成你的路径
sudo systemctl daemon-reload
sudo systemctl enable --now searxng
```

验证：

```sh
curl "http://127.0.0.1:8889/search?q=test&format=json" -H "User-Agent: Mozilla/5.0"
# → {"query":"test","results":[...], ...}
```

> 部分搜索引擎（DuckDuckGo/Startpage 需验证码、Brave 限流、Google CSE 超时）因数据中心 IP 受限属正常；Google、Wikipedia 等引擎正常工作。

## 许可证

MIT
