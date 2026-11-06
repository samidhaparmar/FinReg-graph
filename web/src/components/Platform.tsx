"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRight, BarChart3, BookOpen, ChevronRight, ExternalLink,
  FileText, Layers3, Network, Search, ShieldCheck, UploadCloud,
} from "lucide-react";
import {
  Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from "recharts";
import GraphView from "@/components/GraphView";
import {
  API, get, post, put, type Document, type Graph, type Profile,
  type QueryResult, type ResultItem,
} from "@/lib/api";

type Tab = "overview" | "documents" | "search" | "graph" | "impact";

const tabs: { id: Tab; label: string; icon: typeof BookOpen; description: string }[] = [
  { id: "overview", label: "Overview", icon: BarChart3, description: "A clear view of the regulation evidence in your workspace." },
  { id: "documents", label: "Documents", icon: FileText, description: "Keep source versions and article text organized." },
  { id: "search", label: "Search", icon: Search, description: "Find obligations with a traceable source sentence." },
  { id: "graph", label: "Knowledge graph", icon: Network, description: "Explore the relationships between articles, entities, and duties." },
  { id: "impact", label: "Impact analysis", icon: ShieldCheck, description: "Review which obligations may be relevant to a business profile." },
];

const badgeTone: Record<string, string> = {
  potential: "badge-positive",
  review: "badge-review",
  unclear: "badge-neutral",
};

function EvidenceCard({ item, index }: { item: ResultItem; index: number }) {
  return (
    <article className="finance-card evidence-card">
      <div className="evidence-head">
        <div className="flex min-w-0 items-center gap-3">
          <span className="evidence-number">{String(index + 1).padStart(2, "0")}</span>
          <div>
            <p className="eyebrow">SOURCE / {item.evidence.article} · PAGE {item.evidence.page}</p>
            <h3 className="mt-1 text-base font-semibold text-ink">{item.subject}</h3>
          </div>
        </div>
        {item.impact && (
          <span className={"status-badge " + badgeTone[item.impact.classification]}>
            {item.impact.classification}
          </span>
        )}
      </div>
      <div className="p-5">
        <p className="text-[15px] leading-7 text-ink">{item.action}</p>
        <div className="source-box">
          <p className="eyebrow mb-2">EVIDENCE FROM SOURCE</p>
          <p className="text-sm leading-6 text-slate-700">{item.evidence.quote}</p>
        </div>
        {item.impact && (
          <p className="mt-4 border-l-2 border-sky-400 pl-3 text-sm leading-6 text-muted">
            <strong className="text-ink">Interpretation:</strong> {item.impact.reason}
          </p>
        )}
      </div>
      <div className="evidence-foot">
        <span>Extracted fact · Review applicability</span>
        {item.evidence.source_url && (
          <a href={item.evidence.source_url} target="_blank" rel="noreferrer">
            Open official source <ExternalLink size={14} />
          </a>
        )}
      </div>
    </article>
  );
}

export default function Platform() {
  const pathname = usePathname();
  const router = useRouter();
  const section = pathname.split("/")[1] as Tab;
  const active: Tab = tabs.some(item => item.id === section) ? section : "overview";

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
  const [upload, setUpload] = useState({
    title: "Digital Operational Resilience Act",
    regulation_id: "EU 2022/2554",
    version: "OJ 2022-12-27",
    source_url: "https://eur-lex.europa.eu/eli/reg/2022/2554/oj/eng/pdf",
  });
  const [file, setFile] = useState<File | null>(null);
  const [firstVersion, setFirstVersion] = useState("");
  const [secondVersion, setSecondVersion] = useState("");
  const [changes, setChanges] = useState<{ article: string; change: string; diff: string }[]>([]);

  const refresh = useCallback(async () => {
    try {
      const [d, p, g] = await Promise.all([
        get<Document[]>("/documents"), get<Profile[]>("/profiles"), get<Graph>("/graph"),
      ]);
      setDocuments(d);
      setProfiles(p);
      setGraph(g);
      setError("");
    } catch (cause) {
      setError("API unavailable: " + String(cause));
    }
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  function navigate(next: Tab) {
    router.push(next === "overview" ? "/" : "/" + next);
  }

  async function submitUpload() {
    if (!file) return;
    setBusy(true);
    setError("");
    try {
      const form = new FormData();
      form.append("file", file);
      Object.entries(upload).forEach(([key, value]) => form.append(key, value));
      const response = await fetch(API + "/documents", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload failed");
      await refresh();
      if (data.warnings?.length) setError(data.warnings.join(" · "));
      navigate("overview");
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function runQuery(profileId?: string) {
    setBusy(true);
    setError("");
    try {
      setResult(await post<QueryResult>("/query", { question, profile_id: profileId || null }));
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  async function saveProfile() {
    setBusy(true);
    setError("");
    try {
      const data = {
        name: profileName,
        entity_type: entityType,
        activities: activities.split(",").map(value => value.trim()).filter(Boolean),
      };
      const existingId = selectedProfile || profiles.find(profile => profile.name === profileName)?.id;
      const saved = existingId
        ? await put<Profile>("/profiles/" + existingId, data)
        : await post<Profile>("/profiles", data);
      setSelectedProfile(saved.id);
      await refresh();
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function selectProfile(id: string) {
    setSelectedProfile(id);
    const profile = profiles.find(item => item.id === id);
    if (profile) {
      setProfileName(profile.name);
      setEntityType(profile.entity_type);
      setActivities(profile.activities.join(", "));
    }
  }

  async function compareVersions() {
    setBusy(true);
    setError("");
    try {
      const path = "/compare?first_id=" + encodeURIComponent(firstVersion)
        + "&second_id=" + encodeURIComponent(secondVersion);
      const data = await get<{ changes: typeof changes }>(path);
      setChanges(data.changes);
    } catch (cause) {
      setError(String(cause));
    } finally {
      setBusy(false);
    }
  }

  function downloadReport() {
    if (!result) return;
    const content = {
      title: "FinReg Graph impact review",
      profile_id: selectedProfile,
      question,
      generated_at: new Date().toISOString(),
      advisory: "Potential impact only; verify source and legal applicability.",
      ...result,
    };
    const url = URL.createObjectURL(new Blob([JSON.stringify(content, null, 2)], { type: "application/json" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "finreg-impact-report.json";
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 30_000);
  }

  const articleCount = graph.nodes.filter(node => node.type === "article").length;
  const obligationCount = graph.nodes.filter(node => node.type === "obligation").length;
  const articleChart = useMemo(() => {
    const labels = new Map(graph.nodes.filter(node => node.type === "article").map(node => [node.id, node.label]));
    const counts = new Map<string, number>();
    graph.edges.filter(edge => edge.label === "STATES").forEach(edge => {
      counts.set(edge.source, (counts.get(edge.source) || 0) + 1);
    });
    return [...counts.entries()]
      .map(([id, count]) => ({ name: labels.get(id) || "Article", count }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 8);
  }, [graph]);
  const currentDocument = documents[0];
  const page = tabs.find(item => item.id === active) || tabs[0];

  return (
    <div className="platform-shell">
      <aside className="platform-sidebar">
        <div className="brand-row">
          <div className="brand-icon"><Network size={21} strokeWidth={2.3} /></div>
          <div>
            <p className="text-lg font-bold leading-none tracking-tight text-ink">FinReg Graph</p>
            <p className="mt-1 text-[11px] font-medium tracking-wide text-muted">REGULATORY INTELLIGENCE</p>
          </div>
        </div>
        <p className="sidebar-label">WORKSPACE</p>
        <nav className="platform-nav" aria-label="Main navigation">
          {tabs.map(item => (
            <button
              key={item.id}
              className={"nav-item " + (active === item.id ? "nav-item-active" : "")}
              onClick={() => navigate(item.id)}
              aria-current={active === item.id ? "page" : undefined}
            >
              <item.icon size={17} strokeWidth={2} />
              <span>{item.label}</span>
              {active === item.id && <span className="nav-dot" />}
            </button>
          ))}
        </nav>
        <div className="sidebar-footer">
          <span className="eyebrow">EVIDENCE STANDARD</span>
          <p className="mt-2 text-xs leading-5 text-muted">
            Every extracted obligation links back to its source. Review legal applicability before acting.
          </p>
        </div>
      </aside>

      <div className="platform-main">
        <div className="utility-bar">
          <div className="flex items-center gap-2 text-sm font-semibold text-ink">
            <Layers3 size={16} className="text-blue" />
            Regulation workspace
            <ChevronRight size={14} className="text-slate-400" />
            <span className="font-normal text-muted">{page.label}</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="status-badge badge-positive"><span className="status-dot" /> Local preview</span>
            <span className="hidden text-xs text-muted sm:inline">{documents.length} document{documents.length === 1 ? "" : "s"} indexed</span>
          </div>
        </div>

        <main className="page-content">
          <header className="page-header">
            <div>
              <p className="eyebrow">FINREG GRAPH / {page.label.toUpperCase()}</p>
              <h1 className="mt-2 text-3xl font-bold tracking-tight text-ink sm:text-4xl">{page.label}</h1>
              <p className="mt-2 text-sm text-muted">{page.description}</p>
            </div>
            {currentDocument && (
              <div className="source-chip">
                <span className="status-dot" />
                <span>{currentDocument.regulation_id}</span>
                <span className="text-slate-400">·</span>
                <span className="font-normal text-muted">{currentDocument.version}</span>
              </div>
            )}
          </header>

          {error && <div role="alert" className="alert-box">{error}</div>}

          {active === "overview" && (
            <div className="space-y-6">
              <section className="hero-panel">
                <div className="relative z-10 max-w-2xl">
                  <p className="hero-eyebrow">FINANCIAL REGULATION / EU 2022/2554</p>
                  <h2 className="mt-4 text-3xl font-semibold leading-tight tracking-tight text-white sm:text-4xl">
                    Regulation intelligence,
                    <br /> grounded in evidence.
                  </h2>
                  <p className="mt-4 max-w-xl text-sm leading-6 text-sky-100">
                    Search the DORA source text, follow article relationships, and review potential business impact with every claim tied to a passage.
                  </p>
                  <div className="mt-6 flex flex-wrap gap-3">
                    <button className="button button-inverse" onClick={() => navigate("search")}>
                      Search evidence <ArrowRight size={16} />
                    </button>
                    <button className="button-ghost" onClick={() => navigate("graph")}>
                      Explore graph <ArrowRight size={16} />
                    </button>
                  </div>
                </div>
                <div className="hero-mark" aria-hidden="true">FG</div>
              </section>

              <section className="metric-grid" aria-label="Workspace totals">
                {[
                  { label: "Documents indexed", value: documents.length, note: "Versioned source files", icon: FileText },
                  { label: "Articles mapped", value: articleCount, note: "With graph links", icon: BookOpen },
                  { label: "Obligation candidates", value: obligationCount, note: "Each with source evidence", icon: ShieldCheck },
                  { label: "Business profiles", value: profiles.length, note: "For impact review", icon: Layers3 },
                ].map(metric => (
                  <div className="finance-card metric-card" key={metric.label}>
                    <div className="metric-top"><span>{metric.label}</span><metric.icon size={18} /></div>
                    <p className="mt-3 text-3xl font-semibold tracking-tight text-ink">{metric.value.toLocaleString()}</p>
                    <p className="mt-1 text-xs text-muted">{metric.note}</p>
                  </div>
                ))}
              </section>

              <div className="overview-grid">
                <section className="finance-card chart-card">
                  <div className="section-heading">
                    <div>
                      <p className="eyebrow">EXTRACTION OVERVIEW</p>
                      <h3 className="mt-1 text-lg font-semibold text-ink">Most obligations by article</h3>
                    </div>
                    <span className="status-badge badge-neutral">Top 8 articles</span>
                  </div>
                  {articleChart.length ? (
                    <div className="mt-6 h-[330px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={articleChart} layout="vertical" margin={{ top: 0, right: 24, bottom: 0, left: 8 }}>
                          <CartesianGrid stroke="#edf0f5" horizontal={false} />
                          <XAxis type="number" allowDecimals={false} tickLine={false} axisLine={false} tick={{ fill: "#7b8798", fontSize: 11 }} />
                          <YAxis type="category" dataKey="name" width={78} tickLine={false} axisLine={false} tick={{ fill: "#526278", fontSize: 12 }} />
                          <Tooltip cursor={{ fill: "#f4f7fc" }} contentStyle={{ borderRadius: 10, border: "1px solid #e3e8f0" }} />
                          <Bar dataKey="count" name="Obligations" fill="#2774d8" radius={[0, 5, 5, 0]} barSize={20} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  ) : <p className="empty-note">Upload a document to see article coverage.</p>}
                  <p className="mt-4 border-t border-line pt-4 text-xs text-muted">
                    Counts reflect extracted candidates, not confirmed legal duties.
                  </p>
                </section>

                <div className="space-y-6">
                  <section className="finance-card p-6">
                    <p className="eyebrow">YOUR NEXT STEP</p>
                    <h3 className="mt-1 text-lg font-semibold text-ink">Research workflow</h3>
                    <div className="mt-4 divide-y divide-line">
                      {[
                        { label: "Find obligations", detail: "Search article evidence", target: "search" as Tab, icon: Search },
                        { label: "Trace relationships", detail: "Explore the knowledge graph", target: "graph" as Tab, icon: Network },
                        { label: "Review business impact", detail: "Use a sample fintech profile", target: "impact" as Tab, icon: ShieldCheck },
                      ].map(action => (
                        <button className="action-row" key={action.label} onClick={() => navigate(action.target)}>
                          <span className="action-icon"><action.icon size={18} /></span>
                          <span className="flex-1 text-left"><strong>{action.label}</strong><small>{action.detail}</small></span>
                          <ChevronRight size={16} className="text-slate-400" />
                        </button>
                      ))}
                    </div>
                  </section>
                  <section className="finance-card p-6">
                    <p className="eyebrow">SOURCE WATCHLIST</p>
                    <h3 className="mt-1 text-lg font-semibold text-ink">
                      {currentDocument?.title || "No regulation uploaded"}
                    </h3>
                    <p className="mt-2 text-sm text-muted">
                      {currentDocument
                        ? currentDocument.regulation_id + " · " + currentDocument.version
                        : "Add a regulation PDF to begin."}
                    </p>
                    <div className="mt-5 flex flex-wrap gap-2">
                      <button className="button-light" onClick={() => navigate("documents")}>Manage source</button>
                      {currentDocument?.source_url && (
                        <a className="button-light inline-flex items-center gap-2" href={currentDocument.source_url} target="_blank" rel="noreferrer">
                          Official PDF <ExternalLink size={14} />
                        </a>
                      )}
                    </div>
                  </section>
                </div>
              </div>
            </div>
          )}

          {active === "documents" && (
            <div className="space-y-6">
              <div className="page-grid">
                <section className="finance-card p-6">
                  <div className="section-heading">
                    <div><p className="eyebrow">SOURCE INTAKE</p><h2 className="mt-1 text-lg font-semibold text-ink">Upload a regulation</h2></div>
                    <span className="action-icon"><UploadCloud size={20} /></span>
                  </div>
                  <p className="mt-2 text-sm text-muted">Text PDFs retain article and page references.</p>
                  <div className="mt-5 space-y-4">
                    {(Object.keys(upload) as (keyof typeof upload)[]).map(key => (
                      <label className="field-label" key={key}>
                        {key.replaceAll("_", " ")}
                        <input className="input mt-1.5" value={upload[key]} onChange={event => setUpload({ ...upload, [key]: event.target.value })} />
                      </label>
                    ))}
                    <label className="field-label">PDF file
                      <input className="input mt-1.5 file:mr-3 file:border-0 file:bg-transparent file:font-medium file:text-blue" type="file" accept="application/pdf" onChange={event => setFile(event.target.files?.[0] || null)} />
                    </label>
                    <button className="button" disabled={!file || busy} onClick={submitUpload}>
                      {busy ? "Processing…" : "Upload and extract"} <ArrowRight size={16} />
                    </button>
                  </div>
                </section>
                <section className="finance-card p-6">
                  <div className="section-heading">
                    <div><p className="eyebrow">DOCUMENT LIBRARY</p><h2 className="mt-1 text-lg font-semibold text-ink">Versioned sources</h2></div>
                    <span className="status-badge badge-neutral">{documents.length} total</span>
                  </div>
                  {documents.length ? (
                    <div className="mt-5 space-y-3">
                      {documents.map(document => (
                        <div className="document-row" key={document.id}>
                          <div className="flex items-start gap-3">
                            <span className="action-icon"><FileText size={18} /></span>
                            <div>
                              <p className="font-semibold text-ink">{document.title}</p>
                              <p className="mt-1 text-xs text-muted">{document.regulation_id} · {document.version}</p>
                            </div>
                          </div>
                          {document.source_url && (
                            <a className="mt-4 inline-flex items-center gap-1 text-sm font-semibold text-blue hover:underline" href={document.source_url} target="_blank" rel="noreferrer">
                              Official source <ExternalLink size={14} />
                            </a>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : <p className="empty-note">Your document library is empty.</p>}
                </section>
              </div>
              <section className="finance-card p-6">
                <div className="section-heading">
                  <div><p className="eyebrow">VERSION INTELLIGENCE</p><h2 className="mt-1 text-lg font-semibold text-ink">Compare article text</h2></div>
                  <span className="status-badge badge-neutral">Text diff</span>
                </div>
                <p className="mt-2 text-sm text-muted">Choose two versions of the same regulation to inspect article-level changes.</p>
                <div className="mt-5 flex flex-wrap gap-3">
                  <select className="input max-w-xs" aria-label="Earlier version" value={firstVersion} onChange={event => setFirstVersion(event.target.value)}>
                    <option value="">Earlier version</option>
                    {documents.map(document => <option key={document.id} value={document.id}>{document.regulation_id} · {document.version}</option>)}
                  </select>
                  <select className="input max-w-xs" aria-label="Later version" value={secondVersion} onChange={event => setSecondVersion(event.target.value)}>
                    <option value="">Later version</option>
                    {documents.map(document => <option key={document.id} value={document.id}>{document.regulation_id} · {document.version}</option>)}
                  </select>
                  <button className="button" disabled={!firstVersion || !secondVersion || firstVersion === secondVersion || busy} onClick={compareVersions}>Compare versions</button>
                </div>
                {changes.length > 0 && (
                  <div className="mt-6 space-y-4">
                    {changes.map(change => (
                      <div className="document-row" key={change.article}>
                        <p className="font-semibold text-ink">{change.article} · {change.change}</p>
                        <pre className="mt-3 overflow-auto rounded-lg bg-canvas p-4 text-xs leading-5">{change.diff}</pre>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            </div>
          )}

          {active === "search" && (
            <div className="space-y-6">
              <section className="finance-card search-panel">
                <p className="eyebrow">EVIDENCE SEARCH</p>
                <h2 className="mt-1 text-xl font-semibold text-ink">Ask about the regulation</h2>
                <p className="mt-2 text-sm text-muted">Results contain the extracted sentence, article, page, and source link.</p>
                <div className="mt-5 flex flex-col gap-3 sm:flex-row">
                  <label className="sr-only" htmlFor="question-search">Your question</label>
                  <input id="question-search" className="input flex-1" value={question} onChange={event => setQuestion(event.target.value)} onKeyDown={event => { if (event.key === "Enter") runQuery(); }} />
                  <button className="button" disabled={busy} onClick={() => runQuery()}><Search size={16} /> Search</button>
                </div>
              </section>
              {result ? (
                <>
                  <div className="results-bar">
                    <div><strong>{result.items.length} supported candidates</strong><span className="ml-2 text-muted">· {result.answer}</span></div>
                    <span className="status-badge badge-neutral">{result.retrieval_mode.replace("+", " + ")} retrieval</span>
                  </div>
                  <div className="results-grid">
                    <div className="space-y-4">{result.items.map((item, index) => <EvidenceCard item={item} index={index} key={item.id} />)}</div>
                    <aside className="finance-card guidance-card">
                      <p className="eyebrow">HOW TO READ RESULTS</p>
                      <h3 className="mt-2 text-base font-semibold text-ink">Evidence first</h3>
                      <p className="mt-3 text-sm leading-6 text-muted">The article and page identify where a statement appears. An extracted sentence is a candidate; exceptions and scope still need human review.</p>
                      <div className="mt-5 border-t border-line pt-5 text-sm text-muted">
                        <p className="font-semibold text-ink">Source collection</p>
                        <p className="mt-1">{currentDocument?.regulation_id || "No document"} · {currentDocument?.version || "No version"}</p>
                      </div>
                    </aside>
                  </div>
                </>
              ) : (
                <section className="finance-card p-6">
                  <p className="eyebrow">SUGGESTED START</p>
                  <h3 className="mt-1 font-semibold text-ink">Explore a concrete question</h3>
                  <p className="mt-2 text-sm text-muted">Try “What ICT risk management duties apply to financial entities?”</p>
                </section>
              )}
            </div>
          )}

          {active === "graph" && (
            <section className="finance-card p-6">
              <div className="section-heading">
                <div><p className="eyebrow">RELATIONSHIP MAP</p><h2 className="mt-1 text-lg font-semibold text-ink">Regulation knowledge graph</h2></div>
                <span className="status-badge badge-neutral">{graph.edges.length.toLocaleString()} links</span>
              </div>
              <p className="mb-5 mt-2 text-sm text-muted">Choose an article to inspect its entities and obligations. Page through its relationships below.</p>
              <GraphView data={graph} />
            </section>
          )}

          {active === "impact" && (
            <div className="space-y-6">
              <div className="page-grid">
                <section className="finance-card p-6">
                  <div className="section-heading">
                    <div><p className="eyebrow">BUSINESS CONTEXT</p><h2 className="mt-1 text-lg font-semibold text-ink">Business profile</h2></div>
                    <span className="action-icon"><Layers3 size={19} /></span>
                  </div>
                  <div className="mt-5 space-y-4">
                    <label className="field-label">Profile name
                      <input className="input mt-1.5" value={profileName} onChange={event => setProfileName(event.target.value)} />
                    </label>
                    <label className="field-label">Entity type
                      <input className="input mt-1.5" value={entityType} onChange={event => setEntityType(event.target.value)} />
                    </label>
                    <label className="field-label">Activities
                      <textarea className="input mt-1.5 min-h-24" value={activities} onChange={event => setActivities(event.target.value)} />
                    </label>
                    <p className="text-xs text-muted">Separate activities with commas.</p>
                    <button className="button" disabled={busy} onClick={saveProfile}>Save profile</button>
                  </div>
                </section>
                <section className="finance-card p-6">
                  <div className="section-heading">
                    <div><p className="eyebrow">CANDIDATE MATCHING</p><h2 className="mt-1 text-lg font-semibold text-ink">Analyze potential impact</h2></div>
                    <span className="action-icon"><ShieldCheck size={19} /></span>
                  </div>
                  <p className="mt-2 text-sm text-muted">Match a business profile against evidence-linked obligations.</p>
                  <div className="mt-5 space-y-4">
                    <label className="field-label">Select a profile
                      <select className="input mt-1.5" value={selectedProfile} onChange={event => selectProfile(event.target.value)}>
                        <option value="">Select a profile</option>
                        {profiles.map(profile => <option key={profile.id} value={profile.id}>{profile.name}</option>)}
                      </select>
                    </label>
                    <label className="field-label">Question
                      <input className="input mt-1.5" value={question} onChange={event => setQuestion(event.target.value)} />
                    </label>
                    <button className="button" disabled={!selectedProfile || busy} onClick={() => runQuery(selectedProfile)}>Run analysis <ArrowRight size={16} /></button>
                  </div>
                  <div className="interpretation-note">
                    Classifications are review priorities. They do not establish legal applicability.
                  </div>
                </section>
              </div>
              {result && (
                <>
                  <div className="results-bar">
                    <div><strong>{result.items.length} impact candidates</strong><span className="ml-2 text-muted">· {result.answer}</span></div>
                    <button className="button-light" onClick={downloadReport}>Download report</button>
                  </div>
                  <div className="results-grid">
                    <div className="space-y-4">{result.items.map((item, index) => <EvidenceCard item={item} index={index} key={item.id} />)}</div>
                    <aside className="finance-card guidance-card">
                      <p className="eyebrow">CLASSIFICATION KEY</p>
                      <div className="mt-5 space-y-4 text-sm text-muted">
                        <p><span className="status-badge badge-positive mr-2">potential</span> Direct subject and activity cues</p>
                        <p><span className="status-badge badge-review mr-2">review</span> Activity terms overlap</p>
                        <p><span className="status-badge badge-neutral mr-2">unclear</span> Scope or subject needs review</p>
                      </div>
                      <p className="mt-5 border-t border-line pt-5 text-xs leading-5 text-muted">The matching engine is heuristic. Verify the legal scope with qualified counsel.</p>
                    </aside>
                  </div>
                </>
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
