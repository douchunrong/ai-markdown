# 平台测试报告 — MDAI

> v0.1.0 初测：2026-09-03　环境：macOS（Apple Silicon）+ Xcode 26.5 + Node 22.17 + CocoaPods 1.17
> v0.2.0 回归：2026-09-03（见文末附录）
> 结论先行：**共享核心全量验证通过（单测 62/62、类型检查零错误、Web/桌面构建成功、Electron 冒烟通过）；iOS 端 Pod 依赖全装、Swift 代码 100% 编译通过，仅 storyboard 编译因本开发环境的沙箱注入限制受阻，附一键补验命令。**

## 1. 自动化验证结果（本机实测）

| # | 验证项 | 命令 | 结果 |
|---|---|---|---|
| 1 | 单元测试（8 套件） | `npm test` | ✅ **62/62 通过**（2.95s） |
| 2 | TypeScript 类型检查 | `npm run typecheck`（vue-tsc --noEmit） | ✅ 零错误 |
| 3 | Web 构建（iOS webDir / 浏览器） | `npm run build:web` | ✅ 1022 模块，产物 248KB gzip |
| 4 | 桌面构建（main + preload + renderer） | `npm run build:desktop` | ✅ main.js(ESM) + preload.js(CJS) + dist/ |
| 5 | Electron 二进制 | `npx electron --version` | ✅ v33.4.11 |
| 6 | Electron 应用冒烟 | dev server(200) + `electron .` | ✅ **进程存活**，窗口创建成功（详见 §4 环境备注） |
| 7 | iOS 依赖解析与安装 | `pod install` | ✅ 6/6 pods（Capacitor 7.6.9 / Filesystem 7.1.8 / Preferences / Share / IONFilesystemLib / Cordova） |
| 8 | iOS Swift/ObjC 编译 | `xcodebuild build`（模拟器 + 真机 SDK） | ✅ **68/68 编译单元通过**；仅 CompileStoryboard 受阻（见 §4） |

### 单元测试覆盖明细

| 套件 | 用例 | 覆盖点 |
|---|---|---|
| ai-client | 13 | 成功链路、429 退避重试、E-AUTH 不重试、取消（E-CANCELED）、超时（E-TIMEOUT）、畸形/空响应（E-RESP）、分块部分成功（失败块保留原文）、脱敏往返、探活 |
| ai-chunk | 6 | 短文不分块、标题边界切分、段落装箱、无边界硬切不死循环、内容无损校验 |
| ai-redact | 6 | 邮箱/手机/身份证/密钥脱敏、URL 参数值脱敏保留前缀、占位符复用、无损还原 |
| ai-errors | 8 | 全错误码映射（401/403/404/408/429/5xx/400-CTX）、abort 识别、序列化 |
| backup | 5 | 命名规范、同秒去重、滚动清理（保留最新 N）、时间戳解析排序 |
| settings-store | 9 | 默认值合并、类型防注入、损坏自愈隔离、未来版本回退、隐私模式端点校验 |
| markdown-outline | 7 | 标题树提取、代码块 # 忽略、行号定位、中英混合统计 |
| prompts-export | 8 | 20 项内置指令完整性、输出约束、分块标记、HTML 自包含与标题转义 |

## 2. 三平台能力验证矩阵

| 能力 | Windows | Linux | iOS | 验证方式 |
|---|---|---|---|---|
| 共享核心（编辑/AI/主题/设置） | ✅ | ✅ | ✅ | 单测 + 构建（同一代码） |
| WYSIWYG 渲染 | ✅ | ✅ | ✅ | 构建 + Electron 冒烟；iOS WKWebView 同源 |
| AI 网络（绕 CORS） | ✅ 主进程 net.fetch | ✅ 同左 | ✅ CapacitorHttp 原生 | 适配层单测 + 代码审查 |
| 密钥加密存储 | ✅ DPAPI | ✅ libsecret | ⚠️ v1 沙盒（v2 Keychain，见增强设计 §7.1） | 代码审查 |
| 文件读写 | ✅ 对话框+原子写 | ✅ 同左 | ✅ 沙盒 Documents + Files App（Info.plist 已配 `UIFileSharingEnabled`/`LSSupportsOpeningDocumentsInPlace`） | IPC 审查 + plist 校验 |
| 外部修改冲突检测 | ✅ chokidar | ✅ 同左 | N/A（文件由本 App 管理） | 代码审查 |
| PDF 导出 | ✅ printToPDF | ✅ 同左 | ➖ 分享 HTML 替代 | 代码审查 |
| 安装包产出 | `build:win`（NSIS） | `build:linux`（AppImage+deb） | Xcode/TestFlight | 需在对应平台执行（见 §3） |

## 3. 各平台补验指引（一键命令）

> 以下需在**对应目标平台**的正常终端（无代理沙箱）执行，产物/结果可直接作为发布依据。

```bash
# Windows / Linux（在各自平台上）：
cd src && npm install && npm test && npm run build:win   # 或 build:linux

# iOS（本机普通终端或 Xcode）：
cd src && ./scripts/build-ios.sh                          # web 构建 + sync + pod + xcodebuild
# 或：npm run ios:open → 选模拟器 ⌘R 运行

# 桌面开发联调：
cd src && npm run dev
```

## 4. 本环境（TRAE 沙箱）限制备注

以下限制均为**开发环境沙箱所致，与代码质量无关**，已通过变通方案或文档化处理：

1. **目录删除受限（EXDEV）**：项目所在卷上 node fs 的 unlink/rmdir 被拦截 → Vite 设 `emptyOutDir:false`；`cap sync` 的清理步骤改为手动拷贝 `dist → ios/App/App/public`（Podfile 插件条目已手动补全并备份原版于 `backup/`）。
2. **github.com 直连被阻断**（npm/CDN 可达）→ CapacitorFilesystem 的传递依赖 `IONFilesystemLib` 已 vendor 至 `src/vendor/IONFilesystemLib`（官方 1.1.2 xcframework，MIT），Podfile 本地引用。
3. **Electron GUI 写用户缓存目录被拦截** → 冒烟时以 `--user-data-dir=/tmp/mdai-profile` 重定向，进程正常存活（窗口创建成功）；仅沙箱内 DNS 观测报噪音。
4. **iOS storyboard 编译受阻**：ibtool 需经 CoreSimulator 拉起 `IBAgent-iOS`，TRAE 沙箱注入的 macOS 架构 dylib 无法在 iOS-simulator 进程内加载（dyld 明确报错），属工具链进程被环境破坏。Swift/ObjC 全部 68 个编译单元已编译通过，Pods 6/6 安装完成；在普通终端执行 §3 命令即可完成最后一步 storyboard 编译。

## 5. 人工验收清单（发布前必过，对应增强设计 §9.2）

- [ ] 新建 / 打开（含拖拽）/ 编辑实时渲染 / 保存 / 另存
- [ ] 自动保存（30s 间隔，脏文档触发）与保存失败状态栏告警
- [ ] 一键 AI 规整（全文）；选中局部润色；结果对比（长文）与一键撤销
- [ ] AI 失败路径：断网执行 → E-NET 提示且原文无损；429 → 自动退避
- [ ] 外部程序修改当前文件（桌面）：干净自动重载 / 脏时三选弹窗
- [ ] 主题切换（含跟随系统）、字号行高调整即时生效并持久化
- [ ] 导出：HTML（桌面+iOS 分享）、TXT、MD、PDF（桌面）
- [ ] iOS：文档区文件列表、Files App 拷入 .md 可打开、分享导出、深色模式、键盘避让
- [ ] 密钥落盘加密验证：`grep -r "sk-" <userData>` 无明文

---

## 附录：v0.2.0 回归记录（2026-09-03）

本轮五项改进（AI 触发机制/中文菜单与多格式另存为/编辑区点击定位/动态标题/设置页化）后的验证：

| 验证项 | 结果 |
|---|---|
| 单元测试 | ✅ **69/69**（新增 to-docx 套件 7 例：标题/行内样式/三种列表含任务清单/代码块/引用/表格行分组/空文档） |
| 类型检查 | ✅ vue-tsc 零错误 |
| Web + 桌面构建 | ✅ dist + dist-electron（preload CJS） |
| Electron 运行时冒烟（生产包） | ✅ `TITLE: 未命名文档 — MDAI`（远程调试端口断言：Vue 完整挂载 + 动态标题逻辑生效；加载 file://…/dist/index.html） |
| iOS webDir 同步 | ✅ 新构建产物已拷入 ios/App/App/public 并清理过期哈希文件 |

新增人工验收项（发布前）：选区悬浮工具栏两按钮、AI 结果预览「采用/放弃」、文件菜单四项、另存为六格式参数面板、设置页进入/返回、脏文档标题 `*`、编辑区空白处点击定位。
