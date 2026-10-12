# AI Markdown 文档整理工具 — 增强版功能设计文档（v2）

> 版本：v2.0　日期：2026-09-03
> 前置文档：`docs/AI Markdown文档整理工具 功能设计开发文档.md`（v1）、`docs/design-review.md`
> 目标平台：**iOS、Windows、Linux**（macOS 作为桌面壳天然附带，无需额外成本）
> v2 定位：在 v1 功能清单基础上，补齐**技术架构、平台适配、数据机制、安全、错误处理、性能路径、测试验收**七大空白，使其成为可直接指导开发的完整设计。

## 1. 总体架构

### 1.1 技术选型（决策记录）

| 层 | 选型 | 理由 |
|---|---|---|
| 共享核心 | **Vue 3 + TypeScript + Pinia + Vite** | Composition API 便于编辑器状态组织；响应式系统同步源码与视图 |
| WYSIWYG 引擎 | **Milkdown（@milkdown/kit，基于 ProseMirror AST）** | 唯一能实现 Typora 级"输入即渲染"的开源方案；AST 增量更新；插件化（公式/图表） |
| Markdown 解析（导出/大纲） | **markdown-it + DOMPurify** | 无状态解析用于导出与大纲提取；DOMPurify 消毒内嵌 HTML |
| 桌面壳 | **Electron** | Win/Linux/macOS 三端统一；Typora 同源路线；本地文件系统深度集成 |
| iOS 壳 | **Capacitor 7** | 复用同一 Web 核心；原生插件补齐 WKWebView 短板（原生 HTTP 绕过 CORS、Filesystem 沙盒、Share 导出） |
| 打包 | electron-builder（nsis/AppImage/deb/dmg） | 全平台产物一键产出 |

### 1.2 分层架构

```
┌─────────────────────────────────────────────────────────┐
│                  共享核心（renderer/，100% 三端复用）      │
│  UI 层：编辑器视图 / 侧栏 / AI 面板 / 设置 / 状态栏        │
│  状态层：Pinia（settings / document / ai / prompts）      │
│  领域层：AI 客户端 · 分段 · 脱敏 · 大纲 · 导出 · 备份策略  │
│  适配层：PlatformAdapter（接口）                          │
├──────────────┬──────────────────────┬────────────────────┤
│ Electron 适配 │ Capacitor 适配（iOS） │ Web 适配（开发/降级）│
│ · IPC 白名单 │ · CapacitorHttp      │ · fetch（受 CORS 限）│
│ · 主进程文件IO│ · Filesystem 插件    │ · File System Access│
│ · safeStorage│ · Preferences        │ · localStorage      │
│ · printToPDF │ · Share              │ · window.print      │
│ · chokidar   │ · Keychain(预留)     │                     │
└──────────────┴──────────────────────┴────────────────────┘
```

**PlatformAdapter 接口**（平台差异唯一收口点）：

```ts
interface PlatformAdapter {
  readonly kind: 'electron' | 'capacitor' | 'web'
  fs: {
    readFile(path?: string): Promise<{ path: string; content: string }>
    writeFile(path: string, content: string): Promise<void>
    pickOpen(defaultPath?: string): Promise<string | null>      // 选文件
    pickSave(defaultName: string): Promise<string | null>       // 选保存位置
    listDocuments?(): Promise<DocMeta[]>                         // iOS：应用文档区
    onExternalChange?(cb: (path: string) => void): () => void    // 桌面：冲突检测
  }
  http: { request(req: HttpRequest): Promise<HttpResponse> }     // AI 调用（绕 CORS）
  secure: { get(key: string): Promise<string | null>; set(key: string, v: string): Promise<void> }
  export: { toPdf?(html: string, target: string): Promise<void>; share?(file: { name: string; base64: string }): Promise<void> }
}
```

### 1.3 进程/运行模型

- **桌面**：Electron 主进程（Node）持有文件 IO、网络代理（`net.fetch`，无 CORS）、safeStorage、打印；渲染进程以 `contextIsolation + sandbox` 运行共享核心，仅经 preload 暴露白名单 API。
- **iOS**：Capacitor WebView 运行共享核心；HTTP 走 `CapacitorHttp`（原生 URLSession，绕 WKWebView CORS）；文件限 App 沙盒 `Documents/`（开启 Files App 访问与就地打开）。

## 2. 功能规格（增强）

### 2.1 基础编辑（继承 v1 全量清单，补充落地规格）

| 功能 | 规格 |
|---|---|
| WYSIWYG | Milkdown commonmark + gfm 预设；输入实时渲染；块级元素失焦呈现、聚焦显语法（Typora 行为） |
| 语法覆盖 | GFM 全量：标题/列表/任务清单/表格/删除线/代码块/引用/脚注/链接图片；`history` 插件提供无限撤销栈 |
| 大纲 | markdown-it 提取标题树（worker 中解析，>5 万字防卡顿），点击滚动定位 |
| 统计 | 字符数/词数（中文按字、英文按词）/行数/预计阅读时长，防抖 300ms |
| 查找替换 | 原生能力 + 正则开关 + 全部替换 |
| 触屏（iOS） | 选区悬浮工具栏（AI 润色/加粗/纠错）；无键盘场景全部功能经面板可达 |
| 快捷键 | Win/Linux：Ctrl 系；macOS：Cmd 系自动映射；自定义存储于 settings.keymap |

### 2.2 AI 智能整理（增强执行规格）

**操作模型**（v1 4.5 的细化；v0.2 修订）：

1. 目标范围（双触发）：选中文本 → 弹出悬浮工具栏，仅处理选区（AI 面板内指令为自动模式：有选区处理选区，无选区处理全文）。
2. 修改保护：执行前快照入 AI 历史栈（默认保留 20 条，可关闭持久化）+ 桌面端文件级备份；AI 面板可整体隐藏（✨ 按钮 / Ctrl+Shift+2）。
3. **统一预览**：所有 AI 结果先进入**预览视图**（左右双栏：修改前/修改后 + 采用/放弃），整理过程零改动原文，采用后仍可 Ctrl+Z 撤销。

**AI 请求管线**（错误处理与性能的核心）：

```
输入文本 → [隐私脱敏(可选)] → [长度判断]
   ├─ ≤ maxChunkChars(默认6000) → 单次请求
   └─ >  阈值 → 按标题/段落边界分块(保留块级结构) → 逐块请求(进度反馈, 支持取消)
        → 失败: 该块重试(指数退避, 最多3次) → 仍失败: 保留原文并标注, 其余块继续
→ [还原脱敏占位符] → 写回编辑器(经对比视图或直接生效)
```

**内置指令集**（v1 4.2/4.3 全量落地为提示词模板，见 `renderer/lib/ai/prompts.ts`）：一键规整、润色(4 风格)、精简、扩写、自动分级、目录生成、摘要、重点标注、纠错、去重、列表规整、表格优化、代码整理、引用规整；自定义指令支持增删改、置顶、一键调用。

**连通性检测**：配置保存时发送 1 token 探活请求，按错误分类码给出精确提示（密钥错误/网络不通/超时/模型不存在）。

### 2.3 文件管理（增强）

- **桌面**：原生对话框打开/保存/另存；`.md/.markdown/.txt` 过滤；拖拽文件到窗口打开；chokidar 监听当前文件外部变更 → 干净时自动重载、脏时弹窗三选（保留我的/载入磁盘版/另存后载入）。
- **iOS**：应用文档区浏览器（Filesystem 列 `Documents/`）；Files App 可见（`UIFileSharingEnabled`）；支持"就地打开"系统选入的文件（`LSSupportsOpeningDocumentsInPlace`）。
- **自动保存**：默认开，间隔 10s–5min 可调；仅"有路径且内容脏"时触发；保存失败进入重试队列并状态栏告警。
- **备份**：AI 整理前、每次手动保存前快照至 `<userData>/.mdai-backup/<文件名>/<yyyyMMdd-HHmmss>.md`，每文件保留 20 份，超出滚动清理；"文件 → 从备份恢复"入口。

### 2.4 导出能力矩阵（按平台如实标注；v0.2 修订）

| 格式 | Win/Linux/macOS | iOS | 参数 |
|---|---|---|---|
| Markdown / TXT | ✔ 直接写文件 | ✔ 写沙盒 + 分享面板 | — |
| HTML（自包含样式） | ✔ | ✔ 分享面板 | 是否内嵌 Markdown 源码 |
| PDF | ✔ 主进程 printToPDF | ✖（分享 HTML 后系统打印另存） | 纸张 A4/Letter · 横向 · 页边距（无/标准/宽裕） |
| DOCX | ✔ 自研 md→docx 转换器（标题/行内样式/列表/任务清单/代码/引用/表格） | ✔ 分享面板 | 正文字号 |
| PNG 长图 | ✔ 主进程按内容高度整页截图 | ✖ | 宽度（480–2400）· 清晰度倍率（1–3） |

### 2.5 主题与设置

- 主题：浅色/深色/护眼/纯白/墨黑 + 跟随系统；全部以 CSS 变量实现，一键切换无重载；编辑器字体/字号/行高/代码配色可自定义并持久化。
- 设置分组（v0.2 起为**独立设置页面**，编辑/设置视图切换 + 返回）：AI 模型（多套配置、默认模型、温度、超时、最大生成长度）、编辑（自动保存、自动备份、保存时规整）、外观（主题/字体/缩放）、隐私（脱敏开关、隐私模式、AI 历史持久化）、快捷键（自定义/重置）。
- **隐私模式**：开启后仅允许调用本地/自建端点（baseUrl 白名单校验），云端模型入口禁用并提示。

## 3. 界面与交互规格

### 3.1 桌面（Windows/Linux/macOS）

```
┌──────────┬───────────────────────────────┬──────────┐
│ 侧栏      │  编辑区（WYSIWYG 单栏）         │ AI 面板   │
│ · 大纲    │  Markdown 实时渲染             │ · 功能组  │
│ · 最近    │                               │ · 模型切换│
│ · 指令    │                               │ · 运行/取消│
├──────────┴───────────────────────────────┴──────────┤
│ 状态栏：保存状态 · 字数 · 行列 · AI 状态 · 隐私模式徽标   │
└──────────────────────────────────────────────────────┘
```

- 三栏均可折叠（Ctrl+Shift+1/2/3），专注模式隐藏全部只留编辑区；侧栏窄屏自动收起。
- 顶部为**中文菜单栏**（文件：新建/打开/保存/另存为…/设置）+ **动态文档标题**（未保存加 `*`，未命名显示「未命名文档」）。
- 选中任意文本自动弹出**悬浮 AI 工具栏**（字数提示 + 整理选中/整理全文）；右键菜单含 AI 一键规整入口。
- 编辑区任意位置（含内容下方空白）点击均可精确定位光标（posAtCoords）。
- AI 运行中：状态栏进度指示（分块 i/n）+ 面板内取消按钮；错误以非阻断 toast + 面板详情呈现。

### 3.2 iOS（触屏适配）

- 布局：编辑区全屏；顶部精简栏（文档名/保存状态/⋯ 菜单）；底部工具条（大纲 · AI · 文件 · 设置）。
- AI 面板/设置/文件浏览器均以底部抽屉（sheet）呈现，支持手势下滑关闭。
- 选区操作：系统选区菜单 + 自定义悬浮条；长按段落呼出块级 AI 菜单。
- 键盘避让：编辑区随键盘上移；外接键盘时启用桌面快捷键子集（Cmd+B/I/U）。
- 适配深色模式与 Dynamic Type 基础字号缩放。

### 3.3 状态与反馈规范

| 场景 | 反馈 |
|---|---|
| 保存成功/失败 | 状态栏"已保存 HH:mm"/红色告警 + 重试 |
| AI 运行中 | 进度（i/n 块）+ 可取消；超 30s 提示"模型响应较慢，可切换模型或稍后重试" |
| AI 失败 | toast 显示分类原因（见 §6 错误码），面板保留原文不丢失 |
| 冲突 | 模态三选，默认聚焦"保留我的" |
| 未保存关闭 | 拦截并三选（保存/不保存/取消） |

## 4. 数据处理机制

### 4.1 数据模型（JSON Schema 摘要）

```ts
interface AppSettings {
  version: number                        // schema 版本，迁移用
  ai: {
    providers: AiProvider[]              // { id, name, baseUrl, model, temperature, timeoutMs, maxTokens }
    activeProviderId: string
    maxChunkChars: number                // 默认 6000
    retryLimit: number                   // 默认 3
  }
  privacy: { redact: boolean; privacyMode: boolean; persistAiHistory: boolean }
  editor: { autosave: boolean; autosaveIntervalSec: number; backupBeforeAi: boolean; backupKeep: number }
  appearance: { theme: 'light'|'dark'|'sepia'|'paper'|'ink'|'system'; fontFamily: string; fontSize: number; lineHeight: number }
  keymap: Record<string, string>
  recent: { path: string; title: string; openedAt: number }[]
}
interface AiHistoryItem { id: string; time: number; action: string; before: string; after: string }
interface CustomPrompt { id: string; name: string; prompt: string; pinned: boolean }
```

### 4.2 存储位置与安全级别

| 数据 | Win/Linux | macOS | iOS | 加密 |
|---|---|---|---|---|
| settings.json（不含密钥） | `%APPDATA%`/`~/.config` userData | `~/Library/Application Support` | Preferences 插件 | 否（非敏感） |
| API 密钥 | userData/secure.bin（**safeStorage** 加密） | 同左（联动 Keychain） | v1 Preferences + 应用沙盒（**v2 升级 Keychain 插件**，见 §7 威胁模型） | ✔ |
| 文档备份 | userData/.mdai-backup | 同左 | 沙盒 Documents/.mdai-backup | 否 |
| AI 历史 | localStorage（可关闭） | 同左 | 同左 | 否（仅存脱敏后可选） |

### 4.3 迁移与自愈

- 读取 settings 时校验 `version`，逐版本迁移函数链 `migrate(vN→vN+1)`；解析失败 → 重命名损坏文件为 `.corrupt-<ts>` 并以默认配置重建（绝不静默丢配置）。
- 最近文件列表在启动时逐项存在性校验（桌面），失效项清理。

## 5. 平台兼容性矩阵

| 能力 | Windows 10+ | Linux（glibc 2.28+/X11/Wayland） | iOS 14+ | 实现差异说明 |
|---|---|---|---|---|
| WYSIWYG 编辑 | ✔ | ✔ | ✔ | 同一 Milkdown 核心 |
| 文件读写 | 任意路径（对话框） | 任意路径 | 沙盒 Documents + Files App | 适配层分流 |
| AI 网络 | 主进程代理 | 主进程代理 | CapacitorHttp 原生 | 均绕过 CORS |
| 密钥加密 | DPAPI（safeStorage） | libsecret/KWallet | 沙盒+v2 Keychain | 见 §7 |
| 外部修改检测 | chokidar | chokidar | ✖（v1 不做） | iOS 文件由本 App 管理 |
| PDF 导出 | printToPDF | printToPDF | 分享 HTML | 见 §2.4 |
| 全局快捷键 | Ctrl | Ctrl（含桌面环境差异回退） | Cmd/无键盘触屏路径 | UI 均可达，快捷键仅增强 |
| 深色模式 | 跟随系统 | 跟随系统 | 跟随系统 | prefers-color-scheme |
| 安装产物 | NSIS 安装包 | AppImage + deb | App Store/TestFlight（企业内测可 sideload） | electron-builder / Xcode |

## 6. 错误处理设计

### 6.1 统一错误分类码

| 码 | 分类 | 触发 | 用户文案（zh） | 自动策略 |
|---|---|---|---|---|
| E-AUTH | 鉴权失败 | HTTP 401/403 | API 密钥无效或无权限，请检查密钥配置 | 不重试 |
| E-NET | 网络不可达 | fetch TypeError/DNS | 网络连接失败，请检查网络或接口地址 | 重试 2 次 |
| E-TIMEOUT | 超时 | AbortController | 请求超时（{n}s），可在设置调大超时或换模型 | 重试 1 次 |
| E-RATE | 限流 | HTTP 429 | 请求过于频繁，已自动等待重试 | 指数退避（1s/2s/4s）重试 3 次 |
| E-CTX | 上下文超限 | HTTP 400 + 长度关键词 | 文本超出模型上限，已建议分段处理 | 自动降半分块重试 1 次 |
| E-SERVER | 服务端错误 | HTTP 5xx | 模型服务暂时不可用 | 退避重试 2 次 |
| E-CANCELED | 用户取消 | AbortController | 已取消 | 终止后续块 |
| E-RESP | 响应异常 | 空/畸形 JSON | 模型返回异常，请重试或换模型 | 重试 1 次 |
| E-IO / E-FS | 文件错误 | 读写异常 | 文件读写失败：{原因} | 保留内存副本，状态栏重试 |

### 6.2 原则

1. **任何失败不丢失内容**：AI 失败原文保留；保存失败内存态不丢，自动重试队列（5s 间隔，3 次）。
2. **可取消**：所有 AI 请求挂 AbortController，UI 取消即时生效；分块任务取消后续块。
3. **部分成功**：长文分块处理，单块最终失败保留该块原文并在结果中标注，不阻断整体。
4. **错误可见**：toast 一句话 + 错误码；设置-诊断可复制详细堆栈。

## 7. 安全设计

### 7.1 威胁模型与对策

| 威胁 | 对策 |
|---|---|
| API 密钥泄露 | 桌面 safeStorage（OS 级加密：Win DPAPI/Linux libsecret/mac Keychain）；密钥永不写入 settings.json/日志/遥测；渲染进程仅经 IPC 读写密文 |
| 文档隐私（上云） | 隐私模式（仅本地端点）；发送前脱敏（邮箱/手机号/身份证/密钥串正则替换为占位符，响应后还原）；本地 Ollama 全程不出网 |
| XSS（内嵌 HTML/图片链接） | 预览与导出 HTML 经 DOMPurify 消毒；CSP `default-src 'self'; img-src 'self' data: blob: https: http:; connect-src <配置端点>`；禁 `javascript:` 链接 |
| Electron 攻击面 | `contextIsolation:true; sandbox:true; nodeIntegration:false`；preload 仅白名单 API；禁用 `webview`；`will-navigate` 拦截外部跳转到系统浏览器；窗口不加载任何远程页面 |
| 供应链 | 锁定依赖版本（package-lock 提交）；CI 可接 npm audit |
| iOS 密钥存储 | v1：Preferences + 沙盒（风险：越狱/备份提取）；v2 计划：Keychain 插件 + 生物识别解锁开关 |

### 7.2 传输安全

- 默认强制 `https:` 端点；`http:` 仅允许 `localhost/127.0.0.1/::1`（本地模型），其余拦截并提示。
- 超时与体积上限：请求默认 60s 超时；响应体 >5MB 拒绝解析（防异常服务拖垮内存）。

## 8. 性能设计

| 指标 | 目标 | 实现路径 |
|---|---|---|
| 启动 | 桌面 ≤1.5s / iOS 冷启 ≤2s | 渲染层代码分割；设置同步读、文档异步读；首屏骨架 |
| 10 万字编辑 | 输入到渲染 <50ms | Milkdown AST 增量更新（仅重绘变更节点）；编辑区不整篇重渲染 |
| 大纲/统计 | 不阻塞输入 | 300ms 防抖；>5 万字移 Worker 线程解析 |
| AI 长文 | 全程可交互 | 分块串行 + 进度反馈；请求经平台原生层，不占主线程 |
| 内存 | 桌面常驻 <250MB | 单窗口；图片懒加载；备份快照仅存增量路径引用，超限滚动清理 |
| 包体 | Win 安装包 <120MB | electron-builder 压缩；按需引入 Milkdown 插件 |

## 9. 测试策略与验收

### 9.1 测试分层

| 层 | 工具 | 范围 |
|---|---|---|
| 单元测试 | Vitest | AI 客户端（超时/重试/取消/错误映射）、分块器（边界/结构保持）、脱敏（还原一致性）、大纲解析、备份命名与滚动清理、设置迁移 |
| 组件测试 | Vitest + Vue Test Utils | 设置对话框、AI 面板状态流转 |
| 构建/冒烟 | npm scripts | 类型检查、三端构建产物生成、Electron 启动、iOS 工程编译 |
| 平台验收 | 人工矩阵（§9.2） | 三平台核心路径逐项走查 |

### 9.2 平台验收矩阵（每平台必过）

核心路径 12 项：新建/打开/编辑实时渲染/保存/另存/自动保存/一键 AI 规整/选中润色/撤销/主题切换/导出 HTML（桌面另验 PDF）/异常恢复（断网 AI、外部改文件）。

### 9.3 通过标准

单测全绿且覆盖率（领域纯函数层）≥85%；三平台矩阵全项通过；10 万字文档在目标硬件编辑无可感知卡顿；密钥在磁盘明文扫描中不可见。

## 10. 范围与非目标（v1）

- **不做**：云端同步与协作（v1 明确移出，接口预留）、双向链接/知识图谱、插件市场、Word 导出（二期）。
- **桌面自动更新**：二期 electron-updater（v1 提供手动检查入口占位）。
- **国际化**：v1 中文，文案集中 `i18n.ts` 单一字典，二期增 en-US。

## 11. 迭代路线（对齐 v1 第 11 章）

- 一期（本版实现）：核心编辑 + AI 全指令 + 文件/备份/导出 + 三端壳 + 安全与错误体系 + 单测与冒烟。
- 二期：自定义指令管理增强、AI 用量统计、Word 导出、Keychain、自动更新、en-US。
- 三期：批量处理、模板中心、翻译、同步（含冲突合并 UI）。
