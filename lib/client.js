// dsh-obsidian-tools — client half: an "Obsidian" tab for dsh-better-sidebar.
// Registers via ctx.betterSidebar.registerTab; renders the vault as a
// navigable file list with a note preview, fed by the host /obsidian/api.
// Written directly in the __ModuleLoader__ format (no build step).
window.__ModuleLoader__.load({
  id: "dsh-obsidian-tools",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
    Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
    var React = require("react");

    var API = "/obsidian/api";

    function apiCall(method, body) {
      return fetch(API + "/" + method, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body || {})
      }).then(function (r) {
        return r.json();
      }).then(function (j) {
        if (!j || j.ok !== true) {
          throw new Error((j && j.error && j.error.message) || "obsidian api error");
        }
        return j.value;
      });
    }

    function el(tag, attrs, children) {
      return React.createElement(tag, attrs, children);
    }

    var COLORS = {
      border: "var(--dsw-alias-border-l1, rgba(128,128,128,.25))",
      text: "var(--dsw-alias-label-primary, #e2e2e2)",
      textDim: "var(--dsw-alias-label-tertiary, #909090)",
      bg: "var(--dsw-specific-tip, transparent)",
      accent: "var(--dsw-alias-accent, #4d9fff)"
    };

    // Append text to the current session's composer draft (same path as the
    // explorer's @-reference: conversation service via inject-free ctx.get).
    function appendDraft(ctx, sessionId, text) {
      try {
        var sessions = (ctx && ctx.get && ctx.get("sessions")) || (ctx && ctx.sessions);
        if (!sessions) return false;
        var actx = sessions.scope(sessionId);
        if (!actx) return false;
        var conversation = ctx.get("conversation");
        if (!conversation) return false;
        var input = conversation.input.for(actx);
        var draft = input.state.getSnapshot().draft;
        input.setDraft(draft.trim() === "" ? text : draft + " " + text);
        return true;
      } catch (e) {
        return false;
      }
    }

    function ObsidianTab(props) {
      var hostRef = React.useRef(null);

      React.useEffect(function () {
        var root = hostRef.current;
        if (!root) return;

        var state = {
          dir: "",
          mode: "browse", // 'browse' | 'search'
          query: "",
          entries: [],
          results: [],
          selected: null,
          content: null,
          loading: false
        };

        // ---- DOM skeleton ----
        root.innerHTML = "";
        var toolbar = document.createElement("div");
        var search = document.createElement("input");
        search.type = "text";
        search.placeholder = "搜索笔记…（回车）";
        search.style.cssText = "flex:1;min-width:0;padding:4px 8px;border-radius:6px;border:1px solid " + COLORS.border + ";background:transparent;color:" + COLORS.text + ";font-size:12px;outline:none;";
        var backBtn = document.createElement("button");
        backBtn.textContent = "←";
        backBtn.title = "返回浏览";
        backBtn.style.cssText = "padding:2px 8px;border-radius:6px;border:1px solid " + COLORS.border + ";background:transparent;color:" + COLORS.textDim + ";cursor:pointer;font-size:12px;";
        backBtn.style.display = "none";
        toolbar.style.cssText = "display:flex;gap:6px;padding:8px;border-bottom:1px solid " + COLORS.border + ";";
        toolbar.appendChild(search);
        toolbar.appendChild(backBtn);

        var crumbs = document.createElement("div");
        crumbs.style.cssText = "padding:4px 8px;font-size:11px;color:" + COLORS.textDim + ";border-bottom:1px solid " + COLORS.border + ";white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";

        var list = document.createElement("div");
        list.style.cssText = "flex:1 1 45%;min-height:80px;overflow:auto;padding:4px;";

        var preview = document.createElement("div");
        preview.className = "dsh-obsidian-preview";
        preview.style.cssText = "flex:1 1 55%;min-height:80px;overflow:auto;border-top:1px solid " + COLORS.border + ";padding:10px 12px;font-size:13px;line-height:1.7;color:" + COLORS.text + ";word-break:break-word;";

        // Preview typography (markdown-rendered HTML).
        var style = document.createElement("style");
        style.textContent = ".dsh-obsidian-preview h1{font-size:17px;margin:10px 0 6px;line-height:1.4;}" +
          ".dsh-obsidian-preview h2{font-size:15px;margin:10px 0 6px;}" +
          ".dsh-obsidian-preview h3,.dsh-obsidian-preview h4{font-size:13px;margin:8px 0 4px;}" +
          ".dsh-obsidian-preview p{margin:6px 0;}" +
          ".dsh-obsidian-preview ul,.dsh-obsidian-preview ol{padding-left:18px;margin:6px 0;}" +
          ".dsh-obsidian-preview pre{background:var(--dsw-specific-tip, rgba(128,128,128,.12));border:1px solid " + COLORS.border + ";border-radius:6px;padding:8px;overflow:auto;font-family:var(--dsh-code-font-family, ui-monospace, monospace);font-size:12px;line-height:1.5;margin:8px 0;}" +
          ".dsh-obsidian-preview code{font-family:var(--dsh-code-font-family, ui-monospace, monospace);font-size:12px;}" +
          ".dsh-obsidian-preview p code,.dsh-obsidian-preview li code{background:var(--dsw-specific-tip, rgba(128,128,128,.15));border-radius:4px;padding:1px 4px;}" +
          ".dsh-obsidian-preview table{border-collapse:collapse;margin:8px 0;font-size:12px;}" +
          ".dsh-obsidian-preview th,.dsh-obsidian-preview td{border:1px solid " + COLORS.border + ";padding:4px 8px;text-align:left;}" +
          ".dsh-obsidian-preview blockquote{border-left:3px solid " + COLORS.border + ";margin:8px 0;padding:2px 10px;color:" + COLORS.textDim + ";}" +
          ".dsh-obsidian-preview a{color:" + COLORS.accent + ";}" +
          ".dsh-obsidian-preview hr{border:none;border-top:1px solid " + COLORS.border + ";margin:10px 0;}";
        (document.head || document.documentElement).appendChild(style);

        root.appendChild(toolbar);
        root.appendChild(crumbs);
        root.appendChild(list);
        root.appendChild(preview);

        // ---- helpers ----
        function setLoading(on) {
          state.loading = on;
          if (on) {
            list.innerHTML = '<div style="padding:12px;color:' + COLORS.textDim + ';font-size:12px;">加载中…</div>';
          }
        }

        function renderCrumbs() {
          if (state.mode === "search") {
            crumbs.textContent = '搜索：「' + state.query + '」';
            return;
          }
          var parts = state.dir === "" ? [] : state.dir.split("/");
          var acc = "";
          var html = '<span style="cursor:pointer;" data-crumb="root">📁 根目录</span>';
          parts.forEach(function (p, i) {
            acc = acc === "" ? p : acc + "/" + p;
            html += ' <span style="color:' + COLORS.textDim + ';">/</span> <span style="cursor:pointer;" data-crumb="' + acc + '">' + p + "</span>";
          });
          crumbs.innerHTML = html;
        }

        // Reference a note into the chat draft: @obsidian:<vault-relative path>.
        function referenceNote(notePath) {
          var sessionId = props && props.scope && props.scope.sessionId;
          if (!sessionId || !props || !props.ctx) return;
          appendDraft(props.ctx, sessionId, "@obsidian:" + notePath);
        }

        function makeRefButton(notePath, row) {
          var btn = document.createElement("button");
          btn.textContent = "@";
          btn.title = "引用到聊天（@obsidian:路径）";
          btn.style.cssText = "margin-left:6px;padding:0 6px;border:none;border-radius:4px;background:transparent;color:" + COLORS.accent + ";cursor:pointer;font-size:11px;flex:0 0 auto;opacity:0;transition:opacity .15s;";
          btn.addEventListener("click", function (ev) {
            ev.stopPropagation();
            referenceNote(notePath);
            btn.textContent = "✓";
            btn.style.color = "#4caf50";
            setTimeout(function () {
              btn.textContent = "@";
              btn.style.color = COLORS.accent;
            }, 1200);
          });
          row.addEventListener("mouseenter", function () { btn.style.opacity = "1"; });
          row.addEventListener("mouseleave", function () { btn.style.opacity = "0"; });
          return btn;
        }

        function rowBase(text, onClick) {
          var row = document.createElement("div");
          var label = document.createElement("span");
          label.textContent = text;
          label.style.cssText = "flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
          row.appendChild(label);
          row.style.cssText = "display:flex;align-items:center;padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;";
          row.addEventListener("click", onClick);
          row.addEventListener("mouseenter", function () { row.style.background = COLORS.bg; });
          row.addEventListener("mouseleave", function () { row.style.background = "transparent"; });
          return row;
        }

        function renderList() {
          if (state.loading) return;
          list.innerHTML = "";
          if (state.mode === "search") {
            if (state.results.length === 0) {
              list.innerHTML = '<div style="padding:12px;color:' + COLORS.textDim + ';font-size:12px;">无结果</div>';
              return;
            }
            state.results.forEach(function (r) {
              var tag = r.kind === "title" ? "[标题]" : "[内容@" + r.line + "]";
              var row = rowBase(tag + " " + r.path, function () { openNote(r.path); });
              list.appendChild(row);
              row.appendChild(makeRefButton(r.path, row));
            });
            return;
          }
          if (state.entries.length === 0) {
            list.innerHTML = '<div style="padding:12px;color:' + COLORS.textDim + ';font-size:12px;">（空目录）</div>';
            return;
          }
          state.entries.forEach(function (e) {
            if (e.type === "dir") {
              list.appendChild(rowBase("📁 " + e.name, function () { enterDir(e.path); }));
            } else {
              var row = rowBase("📄 " + e.name, function () { openNote(e.path); });
              list.appendChild(row);
              row.appendChild(makeRefButton(e.path, row));
            }
          });
        }

        function renderPreview() {
          if (state.content === null) {
            preview.textContent = state.selected ? "加载中…" : "";
            return;
          }
          if (state.content.html !== undefined) {
            preview.innerHTML = state.content.html;
            if (state.content.truncated) {
              var more = document.createElement("p");
              more.textContent = "…（内容过长已截断）";
              more.style.color = COLORS.textDim;
              more.style.fontSize = "11px";
              preview.appendChild(more);
            }
          } else {
            preview.textContent = state.content.content;
            if (state.content.truncated) preview.textContent += "\n\n…（内容过长已截断）";
          }
        }

        // ---- actions ----
        function enterDir(dir) {
          state.dir = dir;
          state.mode = "browse";
          backBtn.style.display = "none";
          setLoading(true);
          apiCall("tree", { dir: dir }).then(function (v) {
            state.entries = v.entries;
            setLoading(false);
            renderCrumbs();
            renderList();
          }).catch(function (err) {
            setLoading(false);
            list.innerHTML = '<div style="padding:12px;color:#e06c6c;font-size:12px;">' + err.message + "</div>";
          });
        }

        function openNote(p) {
          state.selected = p;
          state.content = null;
          renderPreview();
          apiCall("render", { path: p }).then(function (v) {
            state.content = v;
            renderPreview();
          }).catch(function (err) {
            state.content = { html: "<p style='color:#e06c6c'>读取失败：" + err.message + "</p>", truncated: false };
            renderPreview();
          });
        }

        function doSearch(q) {
          state.mode = "search";
          state.query = q;
          backBtn.style.display = "inline-block";
          setLoading(true);
          apiCall("search", { query: q }).then(function (v) {
            state.results = v.results;
            setLoading(false);
            renderCrumbs();
            renderList();
          }).catch(function (err) {
            setLoading(false);
            list.innerHTML = '<div style="padding:12px;color:#e06c6c;font-size:12px;">' + err.message + "</div>";
          });
        }

        // ---- events ----
        search.addEventListener("keydown", function (ev) {
          if (ev.key === "Enter" && search.value.trim() !== "") {
            doSearch(search.value.trim());
          }
        });
        backBtn.addEventListener("click", function () {
          state.mode = "browse";
          state.query = "";
          backBtn.style.display = "none";
          search.value = "";
          setLoading(true);
          apiCall("tree", { dir: state.dir }).then(function (v) {
            state.entries = v.entries;
            setLoading(false);
            renderCrumbs();
            renderList();
          }).catch(function (err) {
            setLoading(false);
            list.innerHTML = '<div style="padding:12px;color:#e06c6c;font-size:12px;">' + err.message + "</div>";
          });
        });
        crumbs.addEventListener("click", function (ev) {
          var t = ev.target;
          if (!t || !t.getAttribute || !t.getAttribute("data-crumb")) return;
          var c = t.getAttribute("data-crumb");
          if (c === "root") c = "";
          enterDir(c);
        });

        // ---- init ----
        enterDir("");
      }, []);

      return el("div", {
        ref: hostRef,
        style: { height: "100%", display: "flex", flexDirection: "column", minHeight: 0 }
      });
    }

    var inject = ["betterSidebar"];

    function apply(ctx) {
      ctx.effect(function () {
        var dispose = ctx.betterSidebar.registerTab({
          id: "obsidian",
          title: "Obsidian",
          icon: el("span", { style: { fontSize: 14 } }, "📓"),
          single: true,
          order: 10,
          component: function (p) { return el(ObsidianTab, p); }
        });
        // Human-visible by default: open the Obsidian tab on plugin start
        // (single: true focuses an existing tab instead of duplicating).
        try {
          ctx.betterSidebar.openTab({ type: "obsidian" });
        } catch (e) { /* sidebar store not ready yet; user can open via + menu */ }
        return dispose;
      }, "dsh-obsidian-tools: obsidian tab");
    }

    exports.ObsidianTab = ObsidianTab;
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
