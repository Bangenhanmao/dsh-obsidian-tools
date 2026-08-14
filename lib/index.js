// dsh-obsidian-tools — Obsidian vault tools for DeepSeek Harness.
// Search / read / write / append notes in a local Obsidian vault.
// Default vault: D:\obsidian仓库 (configurable). Rikka记忆库 is excluded
// from search by default (AI-only memory, kept separate per user rules),
// and AI-TAG header lines are preserved on overwrite.
import { defineTool } from "@deepseek-ai/dsh-tools";
import { z } from "@deepseek-ai/schemastery";
import { promises as fs } from "node:fs";
import path from "node:path";

const name = "obsidian-tools";
const inject = ["tools", "systemPrompt"];

const Config = z.object({
	vaultRoot: z.string().default("D:\\obsidian仓库"),
	excludeDirs: z.array(z.string()).default(["Rikka记忆库"]),
	maxSearchResults: z.number().default(30),
	readLimit: z.number().default(200),
	searchMaxBytesPerFile: z.number().default(65536)
});

const AI_TAG = "AI-TAG: RIKKAHUB";
const MD = ".md";

function apply(ctx, config) {
	const vault = path.resolve(config.vaultRoot);
	const excludes = new Set(config.excludeDirs);

	function relOf(abs) {
		return path.relative(vault, abs);
	}
	function inVault(abs) {
		const rel = relOf(abs);
		return rel === "" || (!rel.startsWith("..") && !path.isAbsolute(rel));
	}
	function resolveInVault(rel) {
		const abs = path.resolve(vault, rel);
		if (!inVault(abs)) throw new Error(`path escapes vault: ${rel}`);
		return abs;
	}
	function excluded(abs) {
		const rel = relOf(abs);
		if (rel === "") return false;
		return excludes.has(rel.split(path.sep)[0]);
	}

	// Walk all .md notes; visit returns false to stop the walk early.
	async function walkNotes(visit) {
		async function visitDir(dir) {
			let entries;
			try {
				entries = await fs.readdir(dir, { withFileTypes: true });
			} catch {
				return true;
			}
			for (const e of entries) {
				if (e.name.startsWith(".")) continue;
				const abs = path.join(dir, e.name);
				if (excluded(abs)) continue;
				if (e.isDirectory()) {
					if (await visitDir(abs) === false) return false;
				} else if (e.name.toLowerCase().endsWith(MD)) {
					if (await visit(abs) === false) return false;
				}
			}
			return true;
		}
		await visitDir(vault);
	}

	// ---- obsidian_search ----
	ctx.tools.register(defineTool({
		name: "obsidian_search",
		description: `Search the Obsidian vault (${vault}) for notes by title or content. Returns matching vault-relative paths with match kind (title/content) and content line. Excluded from search: ${config.excludeDirs.join(", ")}.`,
		parameters: {
			query: { type: "string", required: true, description: "Search text, case-insensitive." },
			limit: { type: "number", description: `Max results. Defaults to ${config.maxSearchResults}.` }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					query: { type: "string", required: true },
					count: { type: "integer", required: true },
					results: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								path: { type: "string", required: true },
								kind: { type: "string", required: true },
								line: { type: "integer", required: true }
							}
						}
					}
				}
			},
			render: (args, value) => {
				if (value.count === 0) return [{ type: "text", text: `No notes match "${value.query}".` }];
				const lines = value.results.map((r) => {
					const tag = r.kind === "title" ? "[title]" : `[content@${r.line}]`;
					return `${tag} ${r.path}`;
				});
				return [{ type: "text", text: `Found ${value.count} note(s) for "${value.query}":\n${lines.join("\n")}` }];
			}
		},
		async execute(args) {
			const q = String(args.query).toLowerCase();
			const limit = Math.max(1, args.limit ?? config.maxSearchResults);
			const results = [];
			await walkNotes(async (abs) => {
				const rel = relOf(abs);
				const nameHit = path.basename(abs).toLowerCase().includes(q);
				let kind = nameHit ? "title" : null;
				let line = 0;
				if (!nameHit) {
					try {
						const st = await fs.stat(abs);
						if (st.size > config.searchMaxBytesPerFile) return;
						const text = await fs.readFile(abs, "utf8");
						const idx = text.toLowerCase().indexOf(q);
						if (idx >= 0) {
							kind = "content";
							line = text.slice(0, idx).split("\n").length;
						}
					} catch {
						/* unreadable note: skip */
					}
				}
				if (kind) {
					results.push({ path: rel, kind, line });
					if (results.length >= limit) return false;
				}
			});
			return { query: args.query, count: results.length, results };
		}
	}));

	// ---- obsidian_read ----
	ctx.tools.register(defineTool({
		name: "obsidian_read",
		description: `Read an Obsidian note (vault-relative path) and return line-numbered content. Paths are relative to ${vault}, e.g. 人格/人设.md.`,
		parameters: {
			path: { type: "string", required: true, description: "Vault-relative note path." },
			offset: { type: "number", description: "1-based first line to return. Defaults to 1." },
			limit: { type: "number", description: `Maximum number of lines to return. Defaults to ${config.readLimit}.` }
		},
		output: {
			schema: {
				type: "object",
				additionalProperties: false,
				properties: {
					path: { type: "string", required: true },
					totalLines: { type: "integer", required: true },
					lines: {
						type: "array",
						required: true,
						items: {
							type: "object",
							additionalProperties: false,
							properties: {
								number: { type: "integer", required: true },
								text: { type: "string", required: true }
							}
						}
					},
					truncated: { type: "boolean", required: true }
				}
			},
			render: (args, value) => {
				const body = value.lines.map((l) => `${l.number}: ${l.text}`).join("\n");
				const footer = value.truncated
					? `(Showing lines ${value.lines[0]?.number ?? 1}-${value.lines.at(-1)?.number ?? 0} of ${value.totalLines}. Use offset=${(value.lines.at(-1)?.number ?? 0) + 1} to continue.)`
					: `(End of file - total ${value.totalLines} lines)`;
				return [{ type: "text", text: `<path>${value.path}</path>\n<type>file</type>\n<content>\n${body}\n\n${footer}\n</content>` }];
			}
		},
		async execute(args) {
			const abs = resolveInVault(args.path);
			let text;
			try {
				text = await fs.readFile(abs, "utf8");
			} catch (error) {
				throw new Error(`cannot read ${args.path}: ${error.code ?? error.message}`);
			}
			const lines = text.split("\n");
			const total = lines.length;
			const offset = Math.max(1, args.offset ?? 1);
			const limit = Math.max(1, args.limit ?? config.readLimit);
			const slice = lines.slice(offset - 1, offset - 1 + limit).map((t, i) => ({
				number: offset + i,
				text: t.replace(/\r$/, "")
			}));
			return {
				path: args.path,
				totalLines: total,
				lines: slice,
				truncated: offset - 1 + limit < total
			};
		}
	}));

	// ---- obsidian_write ----
	ctx.tools.register(defineTool({
		name: "obsidian_write",
		description: "Create or fully overwrite an Obsidian note (vault-relative path, UTF-8). If the existing note carries an AI-TAG header line, the header is preserved on overwrite.",
		parameters: {
			path: { type: "string", required: true, description: "Vault-relative note path." },
			content: { type: "string", required: true, description: "Full note content to write." }
		},
		async execute(args) {
			const abs = resolveInVault(args.path);
			let header = "";
			let hadTag = false;
			try {
				const existing = await fs.readFile(abs, "utf8");
				const first = (existing.split("\n")[0] ?? "").replace(/\r$/, "");
				if (first.includes(AI_TAG)) {
					header = `${first}\n\n`;
					hadTag = true;
				}
			} catch {
				/* new file */
			}
			await fs.mkdir(path.dirname(abs), { recursive: true });
			await fs.writeFile(abs, header + args.content, "utf8");
			return {
				path: args.path,
				operation: hadTag ? "overwritten (AI-TAG header preserved)" : "created/overwritten"
			};
		}
	}));

	// ---- obsidian_append ----
	ctx.tools.register(defineTool({
		name: "obsidian_append",
		description: "Append content to an Obsidian note (vault-relative path). Creates the note if missing.",
		parameters: {
			path: { type: "string", required: true, description: "Vault-relative note path." },
			content: { type: "string", required: true, description: "Text to append." }
		},
		async execute(args) {
			const abs = resolveInVault(args.path);
			await fs.mkdir(path.dirname(abs), { recursive: true });
			let base = "";
			try {
				base = await fs.readFile(abs, "utf8");
			} catch {
				/* new file */
			}
			const sep = base.length === 0 ? "" : base.endsWith("\n") ? "\n" : "\n\n";
			await fs.appendFile(abs, sep + args.content, "utf8");
			return { path: args.path, operation: "appended" };
		}
	}));

	ctx.systemPrompt.section({
		name: "tool:obsidian",
		order: 120,
		text: `Obsidian tools: the user's knowledge vault is at ${vault}. Use obsidian_search to find notes, obsidian_read to read one, obsidian_write/obsidian_append to create or update notes. Paths are vault-relative. ${config.excludeDirs.join("/")} is excluded from search by default.`
	});
}

export { Config, apply, inject, name };
