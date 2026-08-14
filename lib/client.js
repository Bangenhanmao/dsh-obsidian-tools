// dsh-obsidian-tools — client half: an "Obsidian" tab for dsh-better-sidebar.
// Registers via ctx.betterSidebar.registerTab; renders the vault as a
// navigable file list with a note preview, fed by the host /obsidian/api.
// Written directly in the __ModuleLoader__ format (no build step).
window.__ModuleLoader__.load({
  id: "dsh-obsidian-tools",
  factory: (require) => {
    var module = { exports: {} };
    var exports = module.exports;
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

    function ObsidianTab() {
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

        function renderList() {
          if (state.loading) return;
          list.innerHTML = "";
          if (state.mode === "search") {
            if (state.results.length === 0) {
              list.innerHTML = '<div style="padding:12px;color:' + COLORS.textDim + ';font-size:12px;">无结果</div>';
              return;
            }
            state.results.forEach(function (r) {
              var row = document.createElement("div");
              var tag = r.kind === "title" ? "标题" : "内容@" + r.line;
              row.innerHTML = '<span style="color:' + COLORS.accent + ';font-size:10px;margin-right:6px;">' + tag + "</span><span>" + r.path + "</span>";
              row.style.cssText = "padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
              row.addEventListener("mouseenter", function () { row.style.background = COLORS.bg; });
              row.addEventListener("mouseleave", function () { row.style.background = "transparent"; });
              row.addEventListener("click", function () { openNote(r.path); });
              list.appendChild(row);
            });
            return;
          }
          if (state.entries.length === 0) {
            list.innerHTML = '<div style="padding:12px;color:' + COLORS.textDim + ';font-size:12px;">（空目录）</div>';
            return;
          }
          state.entries.forEach(function (e) {
            var row = document.createElement("div");
            if (e.type === "dir") {
              row.innerHTML = "📁 " + e.name;
              row.style.cssText = "padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
              row.addEventListener("click", function () { enterDir(e.path); });
            } else {
              row.innerHTML = "📄 " + e.name;
              row.style.cssText = "padding:4px 6px;border-radius:6px;cursor:pointer;font-size:12px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;";
              row.addEventListener("click", function () { openNote(e.path); });
            }
            row.addEventListener("mouseenter", function () { row.style.background = COLORS.bg; });
            row.addEventListener("mouseleave", function () { row.style.background = "transparent"; });
            list.appendChild(row);
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
        return ctx.betterSidebar.registerTab({
          id: "obsidian",
          title: "Obsidian",
          icon: el("span", { style: { fontSize: 14 } }, "📓"),
          single: true,
          order: 10,
          component: function () { return el(ObsidianTab); }
        });
      }, "dsh-obsidian-tools: obsidian tab");
    }

    exports.ObsidianTab = ObsidianTab;
    exports.apply = apply;
    exports.inject = inject;
    return module.exports;
  }
});
