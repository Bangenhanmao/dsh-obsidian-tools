# dsh-obsidian-tools

DeepSeek Harness 的 Obsidian 仓库工具插件：在 agent 会话里直接搜索、读取、写入本地 Obsidian 笔记。

## 工具

| 工具 | 说明 |
|---|---|
| `obsidian_search <query> [limit]` | 按标题/内容搜索笔记，返回库内相对路径 + 命中类型（标题/内容行号） |
| `obsidian_read <path> [offset] [limit]` | 读笔记，行号窗口返回 |
| `obsidian_write <path> <content>` | 创建/覆盖笔记（UTF-8）；已有 `AI-TAG` 抬头时保留抬头 |
| `obsidian_append <path> <content>` | 追加内容，不存在则创建 |

## 配置（cordis.patch.yml 或 `--patch` 覆盖）

| 字段 | 默认值 | 含义 |
|---|---|---|
| `vaultRoot` | `D:\obsidian仓库` | Obsidian 仓库根目录 |
| `excludeDirs` | `["Rikka记忆库"]` | 搜索时排除的顶层目录（AI 专用记忆库，保持独立） |
| `maxSearchResults` | 30 | 搜索结果上限 |
| `readLimit` | 200 | 单次读取行数上限 |
| `searchMaxBytesPerFile` | 65536 | 内容搜索时单文件读取上限（字节） |

## 安装

```sh
dsh plugin --profile web add D:\dsh-obsidian-tools   # 本地路径
# 或发布后：
dsh plugin --profile web add dsh-obsidian-tools
```

重启 `dsh web` 生效。

## 安全

- 所有路径解析限定在 `vaultRoot` 内，`..` 穿越会被拒绝
- 搜索跳过隐藏目录（如 `.obsidian`）
- 写入保留 `AI-TAG: RIKKAHUB` 抬头，不会破坏记忆库标记

## 设计要点

- 纯宿主端 bundle 插件，无前端依赖
- 参照官方 `@deepseek-ai/dsh-tool-fs` 的工具注册模式（`defineTool`）
- 遵循用户规则：Rikka 记忆库已从 Obsidian 搜索排除，AI 记忆与 Hermes 记忆不混淆

MIT License
