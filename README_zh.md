# NewClaudian

[English](README.md) | [中文](README_zh.md)

![GitHub stars](https://img.shields.io/github/stars/laoshi1991/NewClaudian?style=social)
![GitHub release](https://img.shields.io/github/v/release/laoshi1991/NewClaudian)
![License](https://img.shields.io/github/license/laoshi1991/NewClaudian)

![Preview](Preview.png)

一个将 Claude Code 作为 AI 协作者嵌入到你 Vault（知识库）中的 Obsidian 插件。你的 Vault 将成为 Claude 的工作目录，赋予它完全的智能代理（Agentic）能力：文件读写、搜索、Bash 命令执行以及多步骤工作流。

> **注：** 本项目是在原 [YishenTu/claudian](https://github.com/YishenTu/claudian) 项目基础上 Fork 并增强开发的版本。

## 核心特性

### ✨ NewClaudian 新增功能

- **全格式与文件夹拖拽**：大幅增强了聊天输入框的交互能力：
  - **递归文件夹拖拽**：直接将整个文件夹（从操作系统或文件树）拖入聊天框中。系统会自动递归解析文件夹内的嵌套层级和文件，批量引入作为上下文。
  - **全格式文件支持**：将拖拽解析支持扩展到各种文档、压缩包和其他常见文件格式，远远超越了仅支持图片的限制。
  - **智能图标渲染**：拖入的上下文文件现在会根据其文件类型显示特定、易于识别的专属图标，提供清晰的视觉区分。
- **AI 对话保存为笔记**：支持将 AI 的高质量回答一键无缝保存为 Vault 中的独立 Markdown 笔记。不仅能自动调用大模型为这篇笔记生成精准的中文短标题作为文件名，还可以通过原生的模糊搜索界面自由选择想要保存到的目标文件夹。
- **自定义头像**：通过为用户和 AI 助手设置自定义头像，个性化你的工作空间。
- **自定义模型与 Skill 选择**：在界面中轻松选择和切换已配置好的自定义模型以及专门的 Skills。
- **快速回到底部**：增加了一个便捷的悬浮按钮，可以瞬间滚动到聊天框底部的最新消息处。
- **全面多语言支持 (i18n)**：深度优化了插件的国际化体验。全面支持简体中文、繁体中文、英语、日语、韩语、法语、德语、俄语、西班牙语和葡萄牙语等 10 种语言，所有的交互按钮、弹窗提示及悬浮文案均已实现母语化，为全球用户提供无缝的沉浸式体验。

### 🚀 核心功能（继承自原版 claudian）

- **完全的 Agent 能力**：利用 Claude Code 的强大功能，在你的 Obsidian Vault 内读取、写入和编辑文件、搜索以及执行 Bash 命令。
- **上下文感知**：自动附加当前聚焦的笔记，使用 `@` 提及文件，通过标签排除特定笔记，包含编辑器中的选中文本（Highlight），并支持访问外部目录获取额外上下文。
- **视觉支持**：通过拖放、粘贴或文件路径发送图片来进行图像分析。
- **内联编辑（Inline Edit）**：选中一段文本，或在光标位置通过快捷键触发，直接在笔记中进行带单词级差异预览的编辑，并以只读模式访问工具获取上下文。
- **指令模式 (`#`)**：直接从聊天输入框中将精炼后的自定义指令添加到系统提示词（System Prompt）中，并支持在模态框中进行预览/编辑。
- **斜杠命令（Slash Commands）**：通过 `/command` 触发可复用的提示词模板，支持参数占位符、`@file` 文件引用，以及可选的内联 Bash 替换。
- **Skills 技能**：使用可复用的能力模块扩展 NewClaudian，基于上下文自动调用，并与 Claude Code 的 skill 格式完全兼容。
- **自定义 Agent**：定义 Claude 可以调用的自定义子代理（subagents），支持工具权限限制和模型覆盖。
- **Claude Code 插件支持**：启用通过 CLI 安装的 Claude Code 插件，支持从 `~/.claude/plugins` 自动发现，并可按 Vault 进行独立配置。插件中的 Skills、Agents 和斜杠命令均可无缝集成。
- **MCP 支持**：通过 Model Context Protocol 服务器（stdio、SSE、HTTP）连接外部工具和数据源，支持上下文保存模式及 `@` 提及激活。
- **高级模型控制**：在 Haiku、Sonnet 和 Opus 之间自由选择，通过环境变量配置自定义模型，微调思考预算（thinking budget），并启用支持 1M 上下文窗口的 Opus 和 Sonnet（需要 Max 订阅或额外使用额度）。
- **计划模式（Plan Mode）**：在聊天输入框中通过 `Shift+Tab` 切换计划模式。NewClaudian 会在实施前进行探索和设计，向你展示一个可供批准的计划，并提供在新会话中批准、在当前会话中继续或提供反馈的选项。
- **安全性**：多重权限模式（YOLO/安全/计划），安全黑名单，以及通过符号链接安全检查实现的 Vault 隔离。
- **Claude in Chrome**：允许 Claude 通过 `claude-in-chrome` 浏览器扩展与 Chrome 交互。

## 环境要求

- 已安装 [Claude Code CLI](https://code.claude.com/docs/en/overview)（强烈建议通过原生方式安装 Claude Code）
- Obsidian v1.8.9+
- Claude 订阅/API，或支持 Anthropic API 格式的自定义模型提供商（如 [Openrouter](https://openrouter.ai/docs/guides/guides/claude-code-integration)、[Kimi](https://platform.moonshot.ai/docs/guide/agent-support)、[GLM](https://docs.z.ai/devpack/tool/claude)、[DeepSeek](https://api-docs.deepseek.com/guides/anthropic_api) 等）
- 仅支持桌面端（macOS, Linux, Windows）

## 安装指南

### 通过 GitHub Release 安装（推荐）

1. 从 [最新 Release 页面](https://github.com/laoshi1991/NewClaudian/releases/latest) 下载 `main.js`、`manifest.json` 和 `styles.css`。
2. 在你 Vault 的 plugins 文件夹下创建一个名为 `NewClaudian` 的文件夹：
   ```
   /path/to/vault/.obsidian/plugins/NewClaudian/
   ```
3. 将下载的文件复制到 `NewClaudian` 文件夹中。
4. 在 Obsidian 中启用插件：
   - 设置 → 第三方插件（Community plugins） → 启用 "NewClaudian"

### 使用 BRAT 插件安装

[BRAT](https://github.com/TfTHacker/obsidian42-brat) (Beta Reviewers Auto-update Tester) 允许你直接从 GitHub 安装并自动更新插件。

1. 从 Obsidian 第三方插件市场安装 BRAT 插件。
2. 在 设置 → 第三方插件 中启用 BRAT。
3. 打开 BRAT 设置，点击 "Add Beta plugin"。
4. 输入仓库 URL：`https://github.com/laoshi1991/NewClaudian`
5. 点击 "Add Plugin"，BRAT 将自动安装 NewClaudian。
6. 在 设置 → 第三方插件 中启用 NewClaudian。

> **提示**：BRAT 会自动检查更新，并在有新版本时通知你。

### 源码编译安装（开发者）

1. 将本仓库克隆到你 Vault 的 plugins 文件夹中：
   ```bash
   cd /path/to/vault/.obsidian/plugins
   git clone https://github.com/laoshi1991/NewClaudian.git
   cd NewClaudian
   ```

2. 安装依赖并构建：
   ```bash
   npm install
   npm run build
   ```

3. 在 Obsidian 中启用插件：
   - 设置 → 第三方插件 → 启用 "NewClaudian"

### 开发模式

```bash
# 监听模式 (Watch mode)
npm run dev

# 生产环境构建 (Production build)
npm run build
```

> **提示**：复制 `.env.local.example` 并重命名为 `.env.local`，或者配置你的 Vault 路径，即可在开发期间实现文件的自动复制（热更新）。

## 使用说明

**两种模式：**
1. 点击左侧 Ribbon 栏的机器人图标，或使用命令面板打开聊天侧边栏。
2. 选中文本 + 快捷键，触发内联编辑（Inline edit）。

像使用 Claude Code 一样使用它——在你的 Vault 中读取、写入、编辑和搜索文件。

### 上下文管理

- **当前文件**：自动附加当前聚焦的笔记；输入 `@` 可附加其他文件。
- **@-提及 下拉菜单**：输入 `@` 查看 MCP 服务器、Agents、外部上下文和 Vault 内的文件。
  - `@Agents/`：显示可供选择的自定义 Agents。
  - `@mcp-server`：启用具备上下文保存模式的 MCP 服务器。
  - `@folder/`：过滤并显示来自该外部上下文的文件（例如 `@workspace/`）。
  - 默认显示 Vault 内的文件。
- **内容选中**：在编辑器中选中文本，或在 Canvas 白板中选中元素，然后发送聊天——选中内容将自动包含在内。
- **图片支持**：拖放、粘贴或输入路径；可配置媒体文件夹以支持 `![[image]]` 嵌入语法。
- **外部上下文**：点击工具栏的文件夹图标，访问 Vault 外部的目录。

## 隐私与数据使用

- **发送至 API 的内容**：你的输入内容、附加的文件、图片以及工具调用输出。默认：Anthropic；可通过 `ANTHROPIC_BASE_URL` 配置自定义端点。
- **本地存储**：设置、会话元数据和命令存储在 `vault/.claude/` 中；会话消息存储在 `~/.claude/projects/` 中（SDK原生）；旧版会话存储在 `vault/.claude/sessions/` 中。
- **无遥测（No telemetry）**：除了你配置的 API 提供商之外，没有任何追踪代码。

## 许可证

本项目基于 [MIT 许可证](LICENSE) 开源。

## 致谢

- 感谢 [Obsidian](https://obsidian.md) 提供的插件 API。
- 感谢 [Anthropic](https://anthropic.com) 提供的 Claude 模型以及 [Claude Agent SDK](https://platform.claude.com/docs/en/agent-sdk/overview)。
## 文件图标规则

我们在聊天框拖拽上传组件中实现了一套完整的文件类型差异化图标显示方案，支持超过 15 种常见类型的文件。

### 支持的文件类型与颜色

| 文件类型 | 扩展名 | 图标 | 主题色 |
| --- | --- | --- | --- |
| JavaScript / TypeScript | `.js`, `.ts`, `.jsx`, `.tsx` | 📄 FileCode2 | <span style="color:#F7DF1E">#F7DF1E</span> / <span style="color:#3178C6">#3178C6</span> |
| Vue / Svelte | `.vue`, `.svelte` | 📄 FileCode2 | <span style="color:#41B883">#41B883</span> / <span style="color:#FF3E00">#FF3E00</span> |
| JSON | `.json` | 📄 FileJson | <span style="color:#FBC02D">#FBC02D</span> |
| Markdown | `.md`, `.mdx` | 📖 BookOpen | <span style="color:#519ABA">#519ABA</span> |
| PDF | `.pdf` | 📄 FileText | <span style="color:#FF5252">#FF5252</span> |
| 压缩包 | `.zip`, `.tar`, `.gz`, `.rar`, `.7z` | 📦 Binary | <span style="color:#757575">#757575</span> |
| 图片 | `.png`, `.jpg`, `.jpeg`, `.gif`, `.svg`, `.webp` | 🖼️ Image | <span style="color:#4CAF50">#4CAF50</span> |
| 视频 | `.mp4`, `.mkv`, `.avi`, `.mov`, `.webm` | 🎬 Video | <span style="color:#F06292">#F06292</span> |
| 音频 | `.mp3`, `.wav`, `.ogg`, `.flac` | 🎵 Music | <span style="color:#FF9800">#FF9800</span> |
| 网页 | `.html`, `.htm` | 📄 FileCode2 | <span style="color:#E34F26">#E34F26</span> |
| 样式表 | `.css`, `.scss`, `.less` | 📄 FileCode2 | <span style="color:#1572B6">#1572B6</span> |
| 数据库 | `.db`, `.sql`, `.sqlite` | 💾 Database | <span style="color:#607D8B">#607D8B</span> |
| 文本/日志 | `.txt`, `.log` | 📄 FileText | <span style="color:#9E9E9E">#9E9E9E</span> |
| Word / Doc | `.doc`, `.docx` | 📄 FileText | <span style="color:#2B579A">#2B579A</span> |
| Excel / CSV | `.xls`, `.xlsx`, `.csv` | 📊 Table | <span style="color:#217346">#217346</span> |
| PPT | `.ppt`, `.pptx` | 📽️ Presentation | <span style="color:#B7472A">#B7472A</span> |
| 脚本 / 可执行文件 | `.sh`, `.bash`, `.exe` | 💻 TerminalSquare | <span style="color:#4CAF50">#4CAF50</span> |
| 文件夹（空） | | 📁 Folder | <span style="color:#B0BEC5">#B0BEC5</span> |
| 文件夹（非空） | | 📂 FolderOpen | <span style="color:#FFCA28">#FFCA28</span> |
| 其他类型 | | 📄 File | <span style="color:#9E9E9E">#9E9E9E</span> |

所有图标使用 `lucide-svelte` 渲染，默认大小为 `24x24 px`。在支持大量文件上传时，我们采用了虚拟滚动技术，确保首次渲染小于 200ms。
