"use client";

import { useEffect, useMemo, useState } from "react";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { Graph } from "@/lib/api";

const colors: Record<string, string> = {
  regulation: "#087f71", article: "#4675a4", obligation: "#e4a841",
  entity: "#9c75b6", profile: "#0d6b65", process: "#6a9d69",
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
  const counters = [0, 0, 0];
  const layers: Record<string, number> = {
    regulation: 0, profile: 0, article: 1, process: 1, obligation: 2, entity: 2,
  };
  const nodes: Node[] = visible.map(node => {
    const layer = layers[node.type] ?? 2;
    const position = { x: layer * 260, y: counters[layer]++ * 76 };
    return {
      id: node.id, position, data: { label: node.label },
      style: { width: 210, borderRadius: 12, border: `2px solid ${colors[node.type]}`,
        background: "white", padding: 10, fontSize: 14 },
    };
  });
  const edges: Edge[] = limitedEdges.map((edge, index) => ({
    id: String(index), source: edge.source, target: edge.target, label: edge.label,
    style: { stroke: "#a8b9ba" },
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
    <div className="h-[640px] rounded-xl border border-line">
      {visible.length ? <ReactFlow key={`${selected}:${page}`} nodes={nodes} edges={edges} fitView nodesDraggable={false}>
        <Background color="#dfe8e8" /><Controls /><MiniMap />
      </ReactFlow> : <p className="p-6 text-sm text-muted">Upload a regulation to explore its article graph.</p>}
    </div>
  </div>;
}
