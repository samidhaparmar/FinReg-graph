"use client";
import { Background, Controls, MiniMap, ReactFlow, type Edge, type Node } from "@xyflow/react";
import type { Graph } from "@/lib/api";

export default function GraphView({ data }: { data: Graph }) {
  const visible = data.nodes.slice(0, 80);
  const ids = new Set(visible.map(n => n.id));
  const layers: Record<string, number> = { regulation: 0, article: 1, obligation: 2, entity: 2, profile: 0, process: 1 };
  const counters = [0, 0, 0];
  const colors: Record<string, string> = { regulation: "#087f71", article: "#4675a4", obligation: "#e4a841", entity: "#9c75b6", profile: "#0d6b65", process: "#6a9d69" };
  const nodes: Node[] = visible.map(n => {
    const level = layers[n.type] ?? 2;
    const index = counters[level]++;
    return { id: n.id, position: { x: level * 290, y: index * 92 }, data: { label: n.label }, style: { width: 230, borderRadius: 12, border: `2px solid ${colors[n.type]}`, background: "white", padding: 10, fontSize: 12 } };
  });
  const edges: Edge[] = data.edges.filter(e => ids.has(e.source) && ids.has(e.target)).map((e, i) => ({ id: String(i), source: e.source, target: e.target, label: e.label, animated: false, style: { stroke: "#a8b9ba" } }));
  return <div className="h-[520px] rounded-xl border border-line"><ReactFlow nodes={nodes} edges={edges} fitView nodesDraggable={false}><Background color="#dfe8e8" /><Controls /><MiniMap /></ReactFlow></div>;
}
