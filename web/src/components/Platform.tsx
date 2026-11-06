"use client";
import { useCallback, useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { BarChart3, BookOpen, FileText, Network, Search, ShieldCheck } from "lucide-react";
import { BarChart, Bar, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import GraphView from "@/components/GraphView";
import { API, get, post, put, type Document, type Graph, type Profile, type QueryResult, type ResultItem } from "@/lib/api";

type Tab = "overview" | "documents" | "search" | "graph" | "impact";
const tabs: { id: Tab; label: string; icon: typeof BookOpen }[] = [
  { id: "overview", label: "Overview", icon: BarChart3 }, { id: "documents", label: "Documents", icon: FileText },
  { id: "search", label: "Search", icon: Search }, { id: "graph", label: "Knowledge graph", icon: Network },
  { id: "impact", label: "Impact analysis", icon: ShieldCheck },
];

function EvidenceCard({ item }: { item: ResultItem }) {
  return <article className="panel p-5"><div className="mb-3 flex items-start justify-between gap-4"><div><p className="text-xs font-semibold uppercase tracking-wider text-teal">{item.evidence.article} · page {item.evidence.page}</p><h3 className="mt-1 font-semibold">{item.subject}</h3></div>{item.impact && <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">{item.impact.classification}</span>}</div>
    <p className="text-sm text-ink">{item.action}</p><div className="mt-4 rounded-xl bg-canvas p-4 text-sm text-muted"><p className="mb-2 text-xs font-bold uppercase tracking-wider">Source evidence</p><p>{item.evidence.quote}</p>{item.evidence.source_url && <a className="mt-2 inline-block text-teal underline" href={item.evidence.source_url} target="_blank" rel="noreferrer">Open source document</a>}</div>
    {item.impact && <p className="mt-3 text-sm text-muted"><strong>Interpretation:</strong> {item.impact.reason}</p>}</article>;
}

export default function Home() {
  const pathname = usePathname();
  const router = useRouter();
  const section = pathname.split("/")[1] as Tab;
  const [tab, setTab] = useState<Tab>(tabs.some(item => item.id === section) ? section : "overview");
  const [documents, setDocuments] = useState<Document[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [graph, setGraph] = useState<Graph>({ nodes: [], edges: [] });
  const [question, setQuestion] = useState("What ICT risk management duties apply to financial entities?");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [selectedProfile, setSelectedProfile] = useState("");
  const [profileName, setProfileName] = useState("Sample payment fintech");
  const [entityType, setEntityType] = useState("payment institution");
  const [activities, setActivities] = useState("payment processing, ICT risk management, cloud services");
  const [upload, setUpload] = useState({ title: "Digital Operational Resilience Act", regulation_id: "EU 2022/2554", version: "OJ 2022-12-27", source_url: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng/pdf" });
  const [file, setFile] = useState<File | null>(null);
  const [firstVersion, setFirstVersion] = useState("");
  const [secondVersion, setSecondVersion] = useState("");
  const [changes, setChanges] = useState<{ article: string; change: string; diff: string }[]>([]);

  const refresh = useCallback(async () => {
    try { const [d, p, g] = await Promise.all([get<Document[]>("/documents"), get<Profile[]>("/profiles"), get<Graph>("/graph")]); setDocuments(d); setProfiles(p); setGraph(g); setError(""); }
    catch (e) { setError(`API unavailable: ${String(e)}`); }
  }, []);
  useEffect(() => { refresh(); }, [refresh]);
  useEffect(() => { setTab(tabs.some(item => item.id === section) ? section : "overview"); }, [section]);
  function navigate(next: Tab) { setTab(next); router.push(next === "overview" ? "/" : `/${next}`); }

  async function submitUpload() {
    if (!file) return;
    setBusy(true); setError("");
    try { const form = new FormData(); form.append("file", file); Object.entries(upload).forEach(([k,v]) => form.append(k,v));
      const response = await fetch(API + "/documents", { method: "POST", body: form });
      const data = await response.json(); if (!response.ok) throw new Error(data.detail || "Upload failed");
      if (data.warnings?.length) setError(data.warnings.join(" · ")); await refresh(); setTab("overview"); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function runQuery(profileId?: string) {
    setBusy(true); setError("");
    try { setResult(await post<QueryResult>("/query", { question, profile_id: profileId || null })); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  async function createProfile() {
    setBusy(true); setError("");
    try { const data = { name: profileName, entity_type: entityType, activities: activities.split(",").map(x => x.trim()).filter(Boolean) };
      const existingId = selectedProfile || profiles.find(p => p.name === profileName)?.id;
      const p = existingId ? await put<Profile>(`/profiles/${existingId}`, data) : await post<Profile>("/profiles", data);
      setSelectedProfile(p.id); await refresh(); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  function selectProfile(id: string) {
    setSelectedProfile(id);
    const profile = profiles.find(p => p.id === id);
    if (profile) { setProfileName(profile.name); setEntityType(profile.entity_type); setActivities(profile.activities.join(", ")); }
  }
  async function compareVersions() {
    setBusy(true); setError("");
    try { const data = await get<{ changes: typeof changes }>(`/compare?first_id=${encodeURIComponent(firstVersion)}&second_id=${encodeURIComponent(secondVersion)}`); setChanges(data.changes); }
    catch (e) { setError(String(e)); } finally { setBusy(false); }
  }
  function downloadReport() {
    if (!result) return;
    const blob = new Blob([JSON.stringify({ title: "FinReg Graph impact review", profile_id: selectedProfile, question, generated_at: new Date().toISOString(), advisory: "Potential impact only; verify source and legal applicability.", ...result }, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a"); link.href = url; link.download = "finreg-impact-report.json";
    document.body.appendChild(link); link.click(); link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }
  const articleCount = new Set(graph.nodes.filter(n => n.type === "article").map(n => n.id)).size;
  const obligationCount = graph.nodes.filter(n => n.type === "obligation").length;
  const chartData = [{ name: "Documents", value: documents.length }, { name: "Articles", value: articleCount }, { name: "Obligations", value: obligationCount }];
  return <div className="min-h-screen lg:flex"><aside className="border-b border-line bg-white p-4 lg:min-h-screen lg:w-64 lg:border-b-0 lg:border-r lg:p-6"><div className="mb-5 flex items-center gap-3 lg:mb-10"><span className="rounded-xl bg-teal p-2 text-white"><Network size={22}/></span><div><h1 className="font-bold leading-tight">FinReg Graph</h1><p className="text-xs text-muted">Impact intelligence</p></div></div><nav className="flex flex-wrap gap-1 lg:block">{tabs.map(t => <button key={t.id} onClick={() => navigate(t.id)} className={`flex w-auto items-center gap-2 rounded-lg px-3 py-2.5 text-left text-sm lg:w-full lg:gap-3 ${tab === t.id ? "bg-emerald-50 font-semibold text-teal" : "text-muted hover:bg-canvas"}`}><t.icon size={17}/>{t.label}</button>)}</nav><p className="mt-5 text-xs leading-relaxed text-muted lg:mt-10">Research aid only. Verify each source and legal applicability with qualified counsel.</p></aside>
    <main className="mx-auto w-full max-w-7xl p-6 lg:p-10"><header className="mb-8"><p className="text-xs font-bold uppercase tracking-[.18em] text-teal">Regulatory workspace</p><h2 className="mt-2 text-3xl font-bold">{tabs.find(t => t.id === tab)?.label}</h2><p className="mt-2 text-sm text-muted">Trace obligations from regulation text to potential business impact.</p></header>{error && <div role="alert" className="mb-6 rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-900">{error}</div>}
    {tab === "overview" && documents.length > 0 && <div className="panel mb-6 p-5"><p className="text-sm font-semibold text-teal">DORA is ready to explore</p><p className="mt-1 text-sm text-muted">Follow a question from source evidence to graph context and potential business impact.</p><div className="mt-4 flex flex-wrap gap-2"><button className="button-light" onClick={() => navigate("search")}>Search evidence</button><button className="button-light" onClick={() => navigate("graph")}>Explore graph</button><button className="button" onClick={() => navigate("impact")}>Review impact</button></div></div>}
    {tab === "overview" && <div className="space-y-6"><div className="grid gap-4 md:grid-cols-3">{chartData.map(x => <div className="panel p-6" key={x.name}><p className="text-sm text-muted">{x.name}</p><p className="mt-2 text-4xl font-bold">{x.value}</p></div>)}</div><div className="grid gap-6 lg:grid-cols-2"><div className="panel p-6"><h3 className="mb-5 font-semibold">Indexed evidence</h3><div className="h-64"><ResponsiveContainer width="100%" height="100%"><BarChart data={chartData}><CartesianGrid strokeDasharray="3 3"/><XAxis dataKey="name"/><YAxis allowDecimals={false}/><Tooltip/><Bar dataKey="value" fill="#087f71" radius={[6,6,0,0]}/></BarChart></ResponsiveContainer></div></div><div className="panel p-6"><h3 className="font-semibold">Get started</h3><ol className="mt-4 space-y-3 text-sm text-muted"><li>1. Download the official DORA PDF from EUR-Lex.</li><li>2. Upload the PDF with its version and source URL.</li><li>3. Review extracted passages, then search or analyze a business profile.</li></ol><button className="button mt-6" onClick={() => navigate("documents")}>Manage documents</button></div></div></div>}
    {tab === "documents" && <div className="space-y-6"><div className="grid gap-6 xl:grid-cols-2"><section className="panel p-6"><h3 className="mb-4 font-semibold">Upload regulation PDF</h3><div className="space-y-3">{(Object.keys(upload) as (keyof typeof upload)[]).map(k => <label className="block text-xs font-semibold capitalize text-muted" key={k}>{k.replaceAll("_", " ")}<input className="input mt-1" value={upload[k]} onChange={e => setUpload({ ...upload, [k]: e.target.value })}/></label>)}<input className="input" type="file" accept="application/pdf" onChange={e => setFile(e.target.files?.[0] || null)}/><button className="button" disabled={!file || busy} onClick={submitUpload}>{busy ? "Processing…" : "Upload and extract"}</button></div></section><section className="panel p-6"><h3 className="mb-4 font-semibold">Document collection</h3>{documents.length === 0 ? <p className="text-sm text-muted">No documents yet.</p> : <div className="space-y-3">{documents.map(d => <div className="rounded-xl border border-line p-4" key={d.id}><p className="font-semibold">{d.title}</p><p className="text-sm text-muted">{d.regulation_id} · {d.version}</p>{d.source_url && <a className="text-xs text-teal underline" href={d.source_url} target="_blank" rel="noreferrer">Source PDF</a>}</div>)}</div>}</section></div><section className="panel p-6"><h3 className="mb-3 font-semibold">Compare document versions</h3><div className="flex flex-wrap gap-3"><select className="input max-w-xs" value={firstVersion} onChange={e => setFirstVersion(e.target.value)}><option value="">Earlier version</option>{documents.map(d => <option key={d.id} value={d.id}>{d.regulation_id} · {d.version}</option>)}</select><select className="input max-w-xs" value={secondVersion} onChange={e => setSecondVersion(e.target.value)}><option value="">Later version</option>{documents.map(d => <option key={d.id} value={d.id}>{d.regulation_id} · {d.version}</option>)}</select><button className="button" disabled={!firstVersion || !secondVersion || busy} onClick={compareVersions}>Compare</button></div>{changes.length > 0 && <div className="mt-5 space-y-4">{changes.map(c => <div key={c.article}><p className="font-semibold">{c.article} · {c.change}</p><pre className="mt-2 overflow-auto rounded-lg bg-canvas p-3 text-xs">{c.diff}</pre></div>)}</div>}</section></div>}
    {tab === "search" && <div className="space-y-5"><div className="panel p-6"><label className="text-sm font-semibold">Ask about the uploaded regulation</label><div className="mt-3 flex gap-3"><input className="input" value={question} onChange={e => setQuestion(e.target.value)} onKeyDown={e => e.key === "Enter" && runQuery()}/><button className="button" disabled={busy} onClick={() => runQuery()}>Search</button></div></div>{result && <><p className="text-sm text-muted">{result.answer} Retrieval: {result.retrieval_mode}.</p><div className="grid gap-4">{result.items.map(item => <EvidenceCard key={item.id} item={item}/>)}</div></>}</div>}
    {tab === "graph" && <div className="panel p-5"><p className="mb-4 text-sm text-muted">Choose an article to inspect its entities and obligations. Use the page controls to explore more relationships.</p><GraphView data={graph}/></div>}
    {tab === "impact" && <div className="space-y-6"><div className="grid gap-6 xl:grid-cols-2"><section className="panel p-6"><h3 className="mb-4 font-semibold">Business profile</h3><div className="space-y-3"><label className="block text-xs font-semibold text-muted">Profile name<input className="input mt-1" value={profileName} onChange={e => setProfileName(e.target.value)}/></label><label className="block text-xs font-semibold text-muted">Entity type<input className="input mt-1" value={entityType} onChange={e => setEntityType(e.target.value)}/></label><label className="block text-xs font-semibold text-muted">Activities<textarea className="input mt-1 min-h-24" value={activities} onChange={e => setActivities(e.target.value)}/></label><p className="text-xs text-muted">Separate activities with commas.</p><button className="button" disabled={busy} onClick={createProfile}>Save profile</button></div></section><section className="panel p-6"><h3 className="mb-4 font-semibold">Analyze potential impact</h3><select className="input" value={selectedProfile} onChange={e => selectProfile(e.target.value)}><option value="">Select a profile</option>{profiles.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}</select><input className="input mt-3" value={question} onChange={e => setQuestion(e.target.value)}/><button className="button mt-3" disabled={!selectedProfile || busy} onClick={() => runQuery(selectedProfile)}>Run analysis</button><p className="mt-4 text-xs text-muted">Classifications are heuristic candidates. They do not establish legal applicability.</p></section></div>{result && <><div className="flex items-center justify-between"><p className="text-sm text-muted">{result.answer}</p><button className="button-light" onClick={downloadReport}>Download report</button></div><div className="grid gap-4">{result.items.map(item => <EvidenceCard key={item.id} item={item}/>)}</div></>}</div>}
    </main></div>;
}
