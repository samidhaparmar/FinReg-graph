"use client";

import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, Position, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { Graph } from "@/lib/api";

const colors: Record<string, string> = {
  regulation: "#0f846f", article: "#2774d8", obligation: "#d79a36",
  entity: "#8c70b0", profile: "#0f846f", process: "#719970",
};
const fills: Record<string, string> = {
  regulation: "#eef9f5", article: "#eef5ff", obligation: "#fff9ed",
  entity: "#f7f2fc", profile: "#eef9f5", process: "#f1f8f1",
};

export default function GraphView({ data }: { data: Graph }) {
  const articles = useMemo(() => data.nodes.filter(node => node.type === "article"), [data.nodes]);
  const hasProfiles = data.nodes.some(node => node.type === "profile");
  const [selected, setSelected] = useState("");
  const [page, setPage] = useState(0);

  useEffect(() => {
    if (!selected && articles.length) {
      setSelected(articles.find(node => node.label === "Article 6")?.id || articles[0].id);
    }
  }, [articles, selected]);

  const selectedEdges = selected === "profiles"
    ? data.edges.filter(edge => data.nodes.some(node => node.id === edge.source && node.type === "profile"))
    : data.edges.filter(edge => edge.source === selected || edge.target === selected);
  const obligationEdges = selectedEdges.filter(edge => edge.label === "STATES");
  const contextEdges = selectedEdges.filter(edge => edge.label !== "STATES").slice(0, 4);
  const limitedEdges = selected === "profiles" ? selectedEdges.slice(page * 6, page * 6 + 6)
    : [...contextEdges, ...obligationEdges.slice(page * 6, page * 6 + 6)];
  const totalPages = Math.ceil((selected === "profiles" ? selectedEdges.length : obligationEdges.length) / 6);
  const ids = new Set(limitedEdges.flatMap(edge => [edge.source, edge.target]));
  const visible = data.nodes.filter(node => ids.has(node.id));
  const counters: Record<string, number> = {};
  const obligationCount = visible.filter(node => node.type === "obligation").length;
  const centerY = Math.max(160, ((obligationCount - 1) * 94) / 2);
  const nodes: Node[] = visible.map(node => {
    const index = counters[node.type] || 0;
    counters[node.type] = index + 1;
    const position = node.type === "regulation" || node.type === "profile"
      ? { x: 0, y: centerY + index * 94 }
      : node.type === "article" || node.type === "process"
        ? { x: 250, y: centerY + index * 94 }
        : node.type === "entity"
          ? { x: 500, y: 40 + index * 94 }
          : { x: 750, y: 20 + index * 94 };
    const label = node.type === "obligation" && node.label.length > 74
      ? node.label.slice(0, 72) + "…" : node.label;
    return {
      id: node.id, position, sourcePosition: Position.Right, targetPosition: Position.Left,
      data: { label },
      style: { width: 195, minHeight: 54, borderRadius: 9, border: `1.5px solid ${colors[node.type]}`,
        background: fills[node.type], padding: 10, fontSize: 12, lineHeight: 1.35,
        color: "#172b45", boxShadow: "0 2px 6px rgba(25,48,79,.07)" },
    };
  });
  const edges: Edge[] = limitedEdges.map((edge, index) => ({
    id: String(index), source: edge.source, target: edge.target, label: edge.label,
    style: { stroke: "#a7b8c9" },
  }));

  return <div>
    <div className="mb-4 flex flex-wrap items-center gap-3">
      <label className="text-sm font-semibold" htmlFor="graph-view">Explore</label>
      <select id="graph-view" className="input max-w-xs" value={selected} onChange={event => { setSelected(event.target.value); setPage(0); }}>
        {articles.map(article => <option key={article.id} value={article.id}>{article.label}</option>)}
        {hasProfiles && <option value="profiles">Business profiles</option>}
      </select>
      <span className="text-xs text-muted">{limitedEdges.length} relationships shown</span>
      {totalPages > 1 && <div className="flex items-center gap-2">
        <button className="button-light" disabled={page === 0} onClick={() => setPage(page - 1)}>Previous</button>
        <span className="text-xs text-muted">{page + 1} / {totalPages}</span>
        <button className="button-light" disabled={page >= totalPages - 1} onClick={() => setPage(page + 1)}>Next</button>
      </div>}
    </div>
    <div className="h-[640px] overflow-hidden rounded-xl border border-line">
      {visible.length ? <ReactFlow key={`${selected}:${page}`} nodes={nodes} edges={edges} fitView fitViewOptions={{ padding: 0.13, maxZoom: 1 }} nodesDraggable={false}>
        <Background color="#e8eef5" /><Controls /><MiniMap />
      </ReactFlow> : <p className="p-6 text-sm text-muted">Upload a regulation to explore its article graph.</p>}
    </div>
  </div>;
}
