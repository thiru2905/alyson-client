from __future__ import annotations

import json
from collections import Counter
from pathlib import Path

root = Path(r"d:\agentic\thiru\alysonClient\alyson-client")
graph_path = root / ".dual-graph" / "info_graph.json"
out_dir = root / ".dual-graph" / "viewer"
out_dir.mkdir(parents=True, exist_ok=True)

g = json.loads(graph_path.read_text(encoding="utf-8"))

SENSITIVE = (".env", "oauth", "token", "secret", "credential", "password")


def is_sensitive(path: str) -> bool:
    p = (path or "").lower().replace("\\", "/")
    return any(s in p for s in SENSITIVE)


files: list[dict] = []
symbols: list[dict] = []
for n in g.get("nodes", []):
    path = n.get("path") or n.get("id") or ""
    if n.get("kind") == "file":
        files.append(
            {
                "id": n.get("id"),
                "path": path,
                "ext": n.get("ext") or "",
                "size": n.get("size") or 0,
                "sensitive": is_sensitive(path),
            }
        )
    elif n.get("kind") == "symbol":
        symbols.append(
            {
                "id": n.get("id"),
                "name": n.get("name") or "",
                "path": path,
                "symbol_type": n.get("symbol_type") or "",
                "line_start": n.get("line_start"),
                "line_end": n.get("line_end"),
                "exported": bool(n.get("exported")),
                "sensitive": is_sensitive(path),
            }
        )

edges: list[dict] = []
for e in g.get("edges", []):
    fr = e.get("from") or ""
    to = e.get("to") or ""
    if is_sensitive(fr) or is_sensitive(to):
        continue
    edges.append({"from": fr, "to": to, "rel": e.get("rel") or ""})

deg: Counter[str] = Counter()
for e in edges:
    deg[e["from"]] += 1
    deg[e["to"]] += 1
top_files = {p for p, _ in deg.most_common(120)}
viz_nodes = [
    {"id": p, "label": Path(p).name, "group": Path(p).suffix or "other"} for p in top_files
]
viz_edges = [
    {"from": e["from"], "to": e["to"], "label": e["rel"]}
    for e in edges
    if e["from"] in top_files and e["to"] in top_files
][:800]

payload = {
    "root": g.get("root"),
    "file_count": g.get("file_count"),
    "symbol_count": g.get("symbol_count"),
    "node_count": g.get("node_count"),
    "edge_count": g.get("edge_count"),
    "files": files,
    "symbols": symbols,
    "edges": edges,
    "viz": {"nodes": viz_nodes, "edges": viz_edges},
}

(out_dir / "graph-data.js").write_text(
    "window.GRAPE_GRAPH = " + json.dumps(payload, ensure_ascii=False) + ";",
    encoding="utf-8",
)

page = r"""<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>GrapeRoot graph viewer</title>
  <script src="https://unpkg.com/vis-network@9.1.9/standalone/umd/vis-network.min.js"></script>
  <style>
    :root {
      --bg: #0f1419;
      --panel: #171d25;
      --border: #2a3441;
      --text: #e7ecf3;
      --muted: #9aa7b8;
      --accent: #5b9fd4;
      --good: #3ecf8e;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; font-family: "Segoe UI", system-ui, sans-serif;
      background: var(--bg); color: var(--text);
      height: 100vh; display: grid; grid-template-rows: auto auto 1fr;
    }
    header {
      padding: 14px 18px; border-bottom: 1px solid var(--border);
      background: linear-gradient(180deg, #1a222d, var(--bg));
    }
    header h1 { margin: 0 0 4px; font-size: 18px; font-weight: 650; }
    header p { margin: 0; color: var(--muted); font-size: 13px; }
    .stats {
      display: grid; grid-template-columns: repeat(4, 1fr); gap: 10px;
      padding: 12px 18px; border-bottom: 1px solid var(--border);
    }
    .stat {
      background: var(--panel); border: 1px solid var(--border);
      border-radius: 10px; padding: 12px 14px;
    }
    .stat b { display: block; font-size: 22px; color: var(--good); }
    .stat span { color: var(--muted); font-size: 12px; }
    .layout { display: grid; grid-template-columns: 340px 1fr; min-height: 0; }
    aside {
      border-right: 1px solid var(--border); background: var(--panel);
      display: flex; flex-direction: column; min-height: 0;
    }
    .tabs { display: flex; border-bottom: 1px solid var(--border); }
    .tabs button {
      flex: 1; background: transparent; border: 0; color: var(--muted);
      padding: 12px; cursor: pointer; font-weight: 600;
    }
    .tabs button.active { color: var(--text); border-bottom: 2px solid var(--accent); }
    .search { padding: 10px; border-bottom: 1px solid var(--border); }
    .search input {
      width: 100%; background: var(--bg); border: 1px solid var(--border);
      color: var(--text); border-radius: 8px; padding: 9px 10px;
    }
    .list { overflow: auto; min-height: 0; flex: 1; }
    .item {
      padding: 10px 12px; border-bottom: 1px solid var(--border);
      cursor: pointer; font-size: 12px;
    }
    .item:hover, .item.active { background: #1f2833; }
    .item .name { color: var(--accent); font-weight: 600; }
    .item .meta { color: var(--muted); margin-top: 3px; word-break: break-all; }
    main { display: grid; grid-template-rows: 1fr 180px; min-height: 0; }
    #network { background: #0c1015; min-height: 0; }
    .detail {
      border-top: 1px solid var(--border); padding: 12px 16px; overflow: auto;
      background: var(--panel); font-size: 13px;
    }
    .detail h2 { margin: 0 0 8px; font-size: 14px; }
    .note { color: var(--muted); font-size: 12px; margin-top: 8px; }
  </style>
</head>
<body>
  <header>
    <h1>GrapeRoot local graph viewer</h1>
    <p id="subtitle">Loading…</p>
  </header>
  <section class="stats" id="stats"></section>
  <div class="layout">
    <aside>
      <div class="tabs">
        <button class="active" data-tab="files">Files</button>
        <button data-tab="symbols">Symbols</button>
        <button data-tab="edges">Edges</button>
      </div>
      <div class="search"><input id="q" placeholder="Search…" /></div>
      <div class="list" id="list"></div>
    </aside>
    <main>
      <div id="network"></div>
      <div class="detail" id="detail">
        <h2>Graph preview</h2>
        <div>Top connected files (capped for browser performance). Click a list item for details.</div>
        <div class="note">Official GrapeRoot Viz (full 3D UI) is a Pro feature. This is a free local viewer of your scanned `.dual-graph` data.</div>
      </div>
    </main>
  </div>
  <script src="./graph-data.js"></script>
  <script>
    const G = window.GRAPE_GRAPH;
    const subtitle = document.getElementById("subtitle");
    const stats = document.getElementById("stats");
    const list = document.getElementById("list");
    const detail = document.getElementById("detail");
    const q = document.getElementById("q");
    let tab = "files";

    subtitle.textContent = `${G.root || ""} · ${G.file_count} files · ${G.symbol_count} symbols · ${G.edge_count} edges`;
    stats.innerHTML = [
      ["Files", G.file_count],
      ["Symbols", G.symbol_count],
      ["Nodes", G.node_count],
      ["Edges", G.edge_count],
    ].map(([label, value]) => `<div class="stat"><b>${Number(value).toLocaleString()}</b><span>${label}</span></div>`).join("");

    function renderList() {
      const term = (q.value || "").trim().toLowerCase();
      let rows = [];
      if (tab === "files") {
        rows = G.files.filter(f => !term || f.path.toLowerCase().includes(term)).slice(0, 800)
          .map(f => ({
            title: f.path.split(/[\\/]/).pop(),
            meta: `${f.path} · ${f.size} bytes${f.sensitive ? " · sensitive (hidden content)" : ""}`,
            raw: f,
          }));
      } else if (tab === "symbols") {
        rows = G.symbols.filter(s => !term || `${s.name} ${s.path} ${s.symbol_type}`.toLowerCase().includes(term)).slice(0, 800)
          .map(s => ({
            title: s.name || "(unnamed)",
            meta: `${s.symbol_type || "symbol"} · ${s.path}${s.line_start != null ? `:${s.line_start}` : ""}`,
            raw: s,
          }));
      } else {
        rows = G.edges.filter(e => !term || `${e.from} ${e.to} ${e.rel}`.toLowerCase().includes(term)).slice(0, 800)
          .map(e => ({
            title: e.rel || "edge",
            meta: `${e.from} → ${e.to}`,
            raw: e,
          }));
      }
      list.innerHTML = rows.map((r, i) => `<div class="item" data-i="${i}"><div class="name">${escapeHtml(r.title)}</div><div class="meta">${escapeHtml(r.meta)}</div></div>`).join("") || `<div class="item">No matches</div>`;
      list.querySelectorAll(".item[data-i]").forEach(el => {
        el.addEventListener("click", () => {
          list.querySelectorAll(".item").forEach(x => x.classList.remove("active"));
          el.classList.add("active");
          const row = rows[Number(el.dataset.i)];
          showDetail(row.raw);
        });
      });
    }

    function showDetail(raw) {
      detail.innerHTML = `<h2>Selected</h2><pre style="white-space:pre-wrap;margin:0;color:#c9d4e3">${escapeHtml(JSON.stringify(raw, null, 2))}</pre>`;
    }

    function escapeHtml(s) {
      return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    }

    document.querySelectorAll(".tabs button").forEach(btn => {
      btn.addEventListener("click", () => {
        document.querySelectorAll(".tabs button").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        tab = btn.dataset.tab;
        renderList();
      });
    });
    q.addEventListener("input", renderList);
    renderList();

    const nodes = new vis.DataSet(G.viz.nodes.map(n => ({ id: n.id, label: n.label, group: n.group, title: n.id })));
    const edges = new vis.DataSet(G.viz.edges.map((e, i) => ({ id: i, from: e.from, to: e.to, title: e.label, arrows: "to" })));
    new vis.Network(document.getElementById("network"), { nodes, edges }, {
      physics: { stabilization: { iterations: 40 } },
      nodes: { shape: "dot", size: 10, font: { color: "#d7e0ea", size: 11 } },
      edges: { color: { color: "#3a4a5c" }, smooth: false },
      interaction: { hover: true, tooltipDelay: 80 },
    });
  </script>
</body>
</html>
"""
(out_dir / "index.html").write_text(page, encoding="utf-8")
print(f"Wrote {out_dir / 'index.html'}")
print(
    f"files={len(files)} symbols={len(symbols)} edges={len(edges)} "
    f"viz_nodes={len(viz_nodes)} viz_edges={len(viz_edges)}"
)
