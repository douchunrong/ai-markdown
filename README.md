# AI Markdown 文档整理工具

[English](./README.en.md) | 简体中文

沉浸式所见即所得编辑 + AI 智能文档整理，一套共享核心覆盖 **iOS / Windows / Linux（含 macOS）** 三端。

- 设计文档：[docs/design-review.md](docs/design-review.md) · [docs/enhanced-design.md](docs/enhanced-design.md)
- 测试报告：[docs/platform-test-report.md](docs/platform-test-report.md)
- 变更记录：[CHANGELOG.md](CHANGELOG.md)

## 功能一览

| 模块 | 能力 |
|---|---|
| 编辑 | Milkdown WYSIWYG 实时渲染、GFM 全语法、大纲跳转、统计、无限撤销、**编辑区任意位置点击定位** |
| AI 整理 | 面板可隐藏（✨/Ctrl+Shift+2）；**选中文本悬浮工具栏局部整理 / 全文整理**双触发；20 项内置指令 + 自定义指令；长文分块；**结果统一预览后采用/放弃（整理过程零改动原文）**；处理期间编辑区自动锁定 |
| 角色 | 全局角色设定（如「10 年经验作家」），处理任何内容时注入系统提示词；4 个预置模板 |
| 模型 | OpenAI 兼容接口（DeepSeek / OpenAI / Kimi / GLM / 通义 / Ollama 本地），多套配置切换、连通性检测 |
| 文件 | 中文菜单栏（新建/打开/保存/另存为/导出）、最近文件、自动保存、AI 前备份（滚动保留）、外部修改冲突检测（桌面） |
| 另存为 | **MD / TXT / HTML / PDF / DOCX / PNG** 六格式，每格式独立参数（PDF 纸张·方向·边距；PNG 宽度·倍率；HTML 源码内嵌；DOCX 字号） |
| 表格 | 光标处插入任意行列表格（菜单 / 右键 / 快捷键 ⌘/Ctrl+Alt+T，可在设置中自定义），行列配置对话框 + GFM 预览 |
| 标题栏 | 动态显示：已保存→文档名；未保存→「未命名文档」；修改未保存→名称后 `*` |
| 设置 | **独立设置页面**（编辑/设置视图切换 + 返回），AI 模型 / 隐私 / 编辑 / 外观四组 |
| 主题 | 浅色/深色/护眼/纯白/墨黑/跟随系统 + 字号行高自定义 |
| 安全 | 密钥系统级加密（safeStorage）、隐私模式（仅本地端点）、发送前脱敏、DOMPurify 防 XSS、Electron 沙箱加固 |

## 技术栈

Vue 3 + TypeScript + Pinia + Vite · Milkdown（WYSIWYG 引擎） · Electron（桌面壳） · Capacitor 7（iOS 壳）

平台差异统一收口在 `src/renderer/lib/platform/`（`PlatformAdapter` 接口 + 三端实现）。

## 目录结构

```
markdown/
├── docs/        设计与测试文档
├── src/         应用工程（Vue 核心 + Electron 壳 + Capacitor iOS 工程）
│   ├── renderer/        共享核心（UI/状态/领域逻辑/平台适配）
│   ├── electron/        主进程（IPC/安全存储/文件监听/PDF）
│   ├── ios/             Xcode 工程（cap add ios 生成）
│   └── tests 位于根目录 tests/（见下）
├── tests/       单元测试（Vitest）
├── config/      配置模板（AI 提供商预设、默认应用配置）
├── scripts/     平台构建脚本
├── assets/      静态资源
├── backup/      原始设计文档备份（.bak_v1_20260903）
└── logs/        运行日志（忽略提交）
```

## 快速开始

```bash
cd src
npm install

# 单元测试（106 项）
npm test

# 桌面开发（Windows/Linux/macOS，自动拉起 Electron）
npm run dev

# 纯浏览器开发（AI 仅支持 CORS 友好端点，如本地 Ollama）
npm run dev:web

# 类型检查 / 构建
npm run typecheck
npm run build:web        # 产出 dist/（亦为 iOS webDir）
npm run build:desktop    # 产出 dist/ + dist-electron/
```

### 桌面安装包（在对应平台执行）

```bash
npm run build:win     # NSIS 安装包 → src/release/（需在 Windows 上执行）
npm run build:linux   # AppImage + deb（需在 Linux 上执行）
npm run build:mac     # dmg（需在 macOS 上执行）
```

### iOS

```bash
cd src
npm run ios:sync      # 构建 web 产物并同步进 Xcode 工程
npm run ios:open      # 打开 Xcode（选真机/模拟器运行）
# 命令行模拟器编译验证：
cd ios/App && pod install && xcodebuild -scheme App -sdk iphonesimulator build
```

iOS 特性：应用文档区与「文件」App 互通（`UIFileSharingEnabled`）、原生 HTTP（绕 WKWebView CORS）、系统分享导出、深色模式与安全区适配。

## AI 配置

启动后进入「设置 → AI 模型」：填写接口地址（OpenAI 兼容 `/v1`）、密钥（系统加密存储）、模型名，点「测试连通性」。预设模板见 `config/ai-providers.example.json`。可在「设置 → AI 模型 → 角色设定」中配置全局角色（如「10 年经验作家」），对所有 AI 处理生效。

本地模型（隐私推荐）：

```bash
ollama serve   # 端点 http://localhost:11434/v1，模型如 qwen2.5
```

## 环境要求

- Node ≥ 20，npm ≥ 10
- 桌面开发：各平台标准构建链（Windows: VS Build Tools 可选；Linux: libsecret、libnss3 等 Electron 依赖）
- iOS：macOS + Xcode ≥ 16 + CocoaPods（`brew install cocoapods`）

## 已知限制（v0.2）

- 本项目所在卷对 node fs 的目录删除受限，Vite 已设 `emptyOutDir: false`，重复构建的过期哈希产物需手动清理
- Web 降级模式下 AI 请求受浏览器 CORS 限制（桌面/iOS 经原生层不受影响）
- iOS 端 PDF 以分享 HTML 替代（系统打印可另存 PDF）、DOCX 走分享、PNG 不支持（桌面专属）
- iOS 端密钥存于应用沙盒 Preferences，二期升级 Keychain 插件（见增强设计 §7.1）
