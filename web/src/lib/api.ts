export const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
export type Document = { id: string; title: string; regulation_id: string; version: string; source_url?: string; created_at: string };
export type Profile = { id: string; name: string; entity_type: string; activities: string[] };
export type Evidence = { passage_id: string; document_id: string; article: string; page: number; quote: string; source_url?: string };
export type ResultItem = { id: string; subject: string; action: string; confidence: number; evidence: Evidence; impact?: { classification: string; matched_terms: string[]; reason: string } };
export type QueryResult = { answer: string; items: ResultItem[]; graph: { article: string; obligation_id: string; entity: string }[]; retrieval_mode: string };
export type Graph = { nodes: { id: string; label: string; type: string }[]; edges: { source: string; target: string; label: string }[] };
export async function get<T>(path: string): Promise<T> {
  const response = await fetch(API + path, { cache: "no-store" });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
export async function post<T>(path: string, body: unknown): Promise<T> {
  const response = await fetch(API + path, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!response.ok) throw new Error(await response.text());
  return response.json();
}
