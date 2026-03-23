import { useState, useRef, useEffect, useCallback } from "react";

const SUPA_URL = "https://sokseckeylohuyajwtxb.supabase.co";
const SUPA_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNva3NlY2tleWxvaHV5YWp3dHhiIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzQyMjcxMDYsImV4cCI6MjA4OTgwMzEwNn0.OxDHC7JdBf-qVEp9_du8eZO_g8CGsupJw4NwFdigpLY";

const supa = async (path, opts = {}) => {
  const res = await fetch(`${SUPA_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: opts.prefer || "return=representation",
      ...(opts.headers || {}),
    },
    method: opts.method || "GET",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  if (opts.method === "DELETE") return [];
  const text = await res.text();
  return text ? JSON.parse(text) : [];
};

const COLS = [
  { id: "backlog", name: "Backlog", color: "#6C5CE7" },
  { id: "todo", name: "To Do", color: "#0984E3" },
  { id: "doing", name: "Doing", color: "#FDCB6E" },
  { id: "blocked", name: "Blocked", color: "#D63031" },
  { id: "awaiting", name: "Awaiting action", color: "#E17055" },
  { id: "done", name: "Done", color: "#00B894" },
  { id: "closed", name: "Closed", color: "#636E72" },
];

const TAGS_MAP = {
  QA: { bg: "#00B89420", border: "#00B89460", text: "#00B894" },
  DEV: { bg: "#0984E320", border: "#0984E360", text: "#0984E3" },
  Plan: { bg: "#FDCB6E20", border: "#FDCB6E60", text: "#D4A017" },
  Personal: { bg: "#FD79A820", border: "#FD79A860", text: "#FD79A8" },
  Work: { bg: "#6C5CE720", border: "#6C5CE760", text: "#6C5CE7" },
};

const PRIO = {
  high: { color: "#D63031", icon: "\u25B2", label: "Alta" },
  medium: { color: "#FDCB6E", icon: "\u25C6", label: "M\u00e9dia" },
  low: { color: "#636E72", icon: "\u25BD", label: "Baixa" },
};

const EFFORTS = ["XS", "S", "M", "L", "XL"];
async function classifyWithAI(text) {
  try {
    const res = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "claude-sonnet-4-20250514",
        max_tokens: 1000,
        messages: [{
          role: "user",
          content: `You are a task classifier for an agile board used by a QA Manager at Lojas Renner S.A. Given natural language input, extract tasks and classify.

Available tags (multi): QA, DEV, Plan, Personal, Work
Available agents: manager, qa, dev, po, pm, finance
Effort sizes: XS, S, M, L, XL
Business units: renner, youcom, camicado, realize, ashua, na

Input: "${text}"

Return ONLY a JSON array, no markdown:
[{"title":"...","description":"...","tags":["..."],"agent_type":"...","priority":"medium","effort_estimate":"M","objective":"...","acceptance_criteria":["..."],"business_unit":"na"}]`,
        }],
      }),
    });
    const data = await res.json();
    const raw = data.content?.find(b => b.type === "text")?.text || "[]";
    return JSON.parse(raw.replace(/```json|```/g, "").trim());
  } catch (e) {
    console.error("AI error:", e);
    return null;
  }
}
function AgentBadge({ agent, size = 24 }) {
  if (!agent) return null;
  return (
    <div title={agent.name} style={{
      width: size, height: size, borderRadius: 7, flexShrink: 0,
      background: `${agent.color}20`, border: `1.5px solid ${agent.color}40`,
      display: "flex", alignItems: "center", justifyContent: "center",
      color: agent.color, fontSize: size < 26 ? 9 : 11, fontWeight: 700,
      fontFamily: "'JetBrains Mono', monospace",
    }}>{agent.short_name}</div>
  );
}

function TagPill({ tag, small }) {
  const cfg = TAGS_MAP[tag] || { bg: "#5A5A6E20", border: "#5A5A6E40", text: "#5A5A6E" };
  return (
    <span style={{
      fontSize: small ? 10 : 11, fontWeight: 500, padding: small ? "2px 7px" : "3px 9px",
      borderRadius: small ? 5 : 6, background: cfg.bg, color: cfg.text, border: `1px solid ${cfg.border}`,
    }}>{tag}</span>
  );
}

export default function AgentBoard() {
  const [tasks, setTasks] = useState([]);
  const [agents, setAgents] = useState([]);
  const [selected, setSelected] = useState(null);
  const [draggedId, setDraggedId] = useState(null);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sideCol, setSideCol] = useState(false);
  const [filterTag, setFilterTag] = useState(null);
  const [initDone, setInitDone] = useState(false);
  const inputRef = useRef(null);

  const load = useCallback(async () => {
    const [t, a] = await Promise.all([
      supa("board_tasks?order=created_at.desc"),
      supa("board_agents?order=id"),
    ]);
    setTasks(t || []);
    setAgents(a || []);
    setInitDone(true);
  }, []);

  useEffect(() => { load(); }, [load]);

  const agentMap = {};
  agents.forEach(a => { agentMap[a.id] = a; });

  const addTasks = async () => {
    if (!input.trim()) return;
    setLoading(true);
    const classified = await classifyWithAI(input);
    if (classified?.length) {
      for (const c of classified) {
        await supa("board_tasks", {
          method: "POST",
          body: {
            title: c.title || input.trim(),
            raw_input: input.trim(),
            description: c.description || "",
            tags: c.tags || [],
            agent_type: c.agent_type || null,
            priority: c.priority || "medium",
            effort_estimate: c.effort_estimate || null,
            objective: c.objective || "",
            acceptance_criteria: c.acceptance_criteria || [],
            business_unit: c.business_unit || "na",
            column: "backlog",
          },
        });
      }
    } else {
      const lines = input.split(/\n|;/).map(l => l.trim()).filter(Boolean);
      for (const line of lines) {
        await supa("board_tasks", {
          method: "POST",
          body: { title: line, raw_input: input.trim(), column: "backlog", tags: [], priority: "medium" },
        });
      }
    }
    setInput("");
    setLoading(false);
    load();
  };

  const moveTask = async (taskId, toCol) => {
    setTasks(prev => prev.map(t => t.id === taskId ? { ...t, column: toCol } : t));
    await supa(`board_tasks?id=eq.${taskId}`, { method: "PATCH", body: { column: toCol } });
    setDraggedId(null);
  };

  const updateTask = async (id, data) => {
    await supa(`board_tasks?id=eq.${id}`, { method: "PATCH", body: data });
    load();
  };

  const deleteTask = async (id) => {
    await supa(`board_tasks?id=eq.${id}`, { method: "DELETE" });
    setSelected(null);
    load();
  };

  const filtered = filterTag ? tasks.filter(t => t.tags?.includes(filterTag)) : tasks;
  const stats = {
    total: tasks.length,
    doing: tasks.filter(t => t.column === "doing").length,
    blocked: tasks.filter(t => t.column === "blocked").length,
    done: tasks.filter(t => t.column === "done" || t.column === "closed").length,
  };

  if (!initDone) return (
    <div style={{ height: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0F0F12", color: "#5A5A6E", fontFamily: "'DM Sans', sans-serif" }}>
      Carregando Agent Board...
    </div>
  );

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "'DM Sans', 'Segoe UI', sans-serif", overflow: "hidden", background: "#0F0F12" }}>
      <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet" />

      {/* Sidebar */}
      <div style={{
        width: sideCol ? 56 : 240, transition: "width 0.25s cubic-bezier(.4,0,.2,1)",
        background: "#16161D", borderRight: "1px solid #2A2A35", display: "flex", flexDirection: "column",
        overflow: "hidden", flexShrink: 0,
      }}>
        <div style={{ padding: sideCol ? "16px 12px" : "16px 20px", borderBottom: "1px solid #2A2A35", display: "flex", alignItems: "center", gap: 10, minHeight: 56 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: "linear-gradient(135deg, #6C5CE7, #0984E3)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
            <span style={{ color: "#fff", fontSize: 13, fontWeight: 700 }}>AB</span>
          </div>
          {!sideCol && <span style={{ color: "#E8E8ED", fontSize: 15, fontWeight: 600, letterSpacing: -0.3 }}>Agent Board</span>}
          <div onClick={() => setSideCol(p => !p)} style={{ marginLeft: "auto", cursor: "pointer", color: "#5A5A6E", fontSize: 16, padding: 4, transform: sideCol ? "rotate(180deg)" : "none", transition: "transform 0.2s" }}>{"\u2039"}</div>
        </div>

        {!sideCol && (
          <div style={{ padding: "16px 20px", borderBottom: "1px solid #2A2A35" }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {[
                { l: "Total", v: stats.total, c: "#E8E8ED" },
                { l: "Doing", v: stats.doing, c: "#FDCB6E" },
                { l: "Blocked", v: stats.blocked, c: "#D63031" },
                { l: "Done", v: stats.done, c: "#00B894" },
              ].map((s, i) => (
                <div key={i} style={{ padding: "8px 10px", background: "#1E1E28", borderRadius: 8 }}>
                  <div style={{ fontSize: 10, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 0.5 }}>{s.l}</div>
                  <div style={{ fontSize: 20, fontWeight: 700, color: s.c, marginTop: 2, fontFamily: "'JetBrains Mono', monospace" }}>{s.v}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div style={{ padding: sideCol ? "12px 8px" : "12px 20px", flex: 1, overflowY: "auto" }}>
          {!sideCol && <div style={{ fontSize: 10, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Agentes</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
            {agents.map(agent => {
              const activeTasks = tasks.filter(t => t.assigned_agent === agent.id && (t.column === "doing" || t.column === "blocked"));
              const isWorking = activeTasks.length > 0;
              return (
                <div key={agent.id} style={{
                  display: "flex", alignItems: "center", gap: 10, padding: sideCol ? "8px 4px" : "8px 10px",
                  borderRadius: 8, cursor: "default", background: isWorking ? `${agent.color}10` : "transparent",
                }}>
                  <div style={{ position: "relative", flexShrink: 0 }}>
                    <AgentBadge agent={agent} size={30} />
                    <div style={{
                      position: "absolute", bottom: -1, right: -1, width: 9, height: 9, borderRadius: "50%",
                      background: isWorking ? "#FDCB6E" : "#00B894", border: "2px solid #16161D",
                    }} />
                  </div>
                  {!sideCol && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 12, fontWeight: 500, color: "#E8E8ED" }}>{agent.name}</div>
                      <div style={{ fontSize: 10, color: "#5A5A6E", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                        {isWorking ? `${activeTasks.length} tarefa(s)` : "Dispon\u00edvel"}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {!sideCol && (
          <div style={{ padding: "12px 20px", borderTop: "1px solid #2A2A35" }}>
            <div style={{ fontSize: 10, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Filtros</div>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
              {Object.entries(TAGS_MAP).map(([tag, cfg]) => (
                <div key={tag} onClick={() => setFilterTag(filterTag === tag ? null : tag)} style={{
                  padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer",
                  background: filterTag === tag ? cfg.text : cfg.bg,
                  color: filterTag === tag ? "#fff" : cfg.text,
                  border: `1px solid ${filterTag === tag ? cfg.text : cfg.border}`, transition: "all 0.15s",
                }}>{tag}</div>
              ))}
              {filterTag && <div onClick={() => setFilterTag(null)} style={{ padding: "3px 8px", borderRadius: 6, fontSize: 11, cursor: "pointer", color: "#5A5A6E" }}>{"\u00d7"}</div>}
            </div>
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex: 1, display: "flex", flexDirection: "column", overflow: "hidden" }}>
        <div style={{ padding: "12px 24px", borderBottom: "1px solid #2A2A35", display: "flex", alignItems: "center", gap: 12, background: "#16161D" }}>
          <div style={{
            flex: 1, display: "flex", alignItems: "center", gap: 10, background: "#1E1E28",
            borderRadius: 10, padding: "0 16px", border: "1px solid #2A2A35",
          }}>
            <span style={{ color: "#5A5A6E", fontSize: 16 }}>+</span>
            <input ref={inputRef} value={input} onChange={e => setInput(e.target.value)}
              placeholder="Descreva atividades em linguagem natural..."
              style={{ flex: 1, background: "transparent", border: "none", outline: "none", color: "#E8E8ED", fontSize: 13, fontFamily: "'DM Sans', sans-serif", padding: "10px 0" }}
              onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); addTasks(); } }}
            />
            {loading ? (
              <span style={{ fontSize: 12, color: "#6C5CE7", fontFamily: "'JetBrains Mono', monospace" }}>classificando...</span>
            ) : (
              <div onClick={addTasks} style={{
                padding: "4px 12px", borderRadius: 6, background: "#6C5CE720", color: "#6C5CE7",
                fontSize: 11, fontWeight: 600, cursor: input.trim() ? "pointer" : "default", border: "1px solid #6C5CE740",
                whiteSpace: "nowrap", opacity: input.trim() ? 1 : 0.4,
              }}>IA Classificar</div>
            )}
          </div>
        </div>

        <div style={{ flex: 1, overflow: "auto", padding: "16px 12px 16px 24px", display: "flex", gap: 10 }}>
          {COLS.map(col => {
            const colTasks = filtered.filter(t => t.column === col.id)
              .sort((a, b) => { const p = { high: 0, medium: 1, low: 2 }; return (p[a.priority] ?? 1) - (p[b.priority] ?? 1); });
            return (
              <div key={col.id} onDragOver={e => e.preventDefault()} onDrop={(e) => {
                const id = e.dataTransfer.getData("taskId");
                if (id) moveTask(id, col.id);
              }} style={{
                minWidth: 252, maxWidth: 280, flex: "0 0 252px",
                display: "flex", flexDirection: "column", borderRadius: 12,
                background: "#16161D", border: "1px solid #2A2A35",
              }}>
                <div style={{ padding: "12px 14px 10px", display: "flex", alignItems: "center", gap: 8 }}>
                  <div style={{ width: 4, height: 18, borderRadius: 2, background: col.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: "#E8E8ED", flex: 1 }}>{col.name}</span>
                  <span style={{ fontSize: 11, fontWeight: 600, color: "#5A5A6E", background: "#1E1E28", padding: "2px 8px", borderRadius: 6, fontFamily: "'JetBrains Mono', monospace" }}>{colTasks.length}</span>
                </div>
                <div style={{ flex: 1, padding: "0 8px 8px", display: "flex", flexDirection: "column", gap: 6, overflowY: "auto" }}>
                  {colTasks.map(task => {
                    const prio = PRIO[task.priority] || PRIO.medium;
                    const agent = agentMap[task.assigned_agent || task.agent_type];
                    return (
                      <div key={task.id} draggable
                        onDragStart={e => { e.dataTransfer.setData("taskId", task.id); setDraggedId(task.id); }}
                        onDragEnd={() => setDraggedId(null)}
                        onClick={() => setSelected(task)}
                        style={{
                          background: "#1E1E28", borderRadius: 10, cursor: "grab",
                          border: draggedId === task.id ? `1.5px solid ${col.color}` : "1px solid #2A2A35",
                          overflow: "hidden", opacity: draggedId === task.id ? 0.5 : 1, transition: "border-color 0.15s",
                        }}
                        onMouseEnter={e => { if (draggedId !== task.id) e.currentTarget.style.borderColor = "#3A3A48"; }}
                        onMouseLeave={e => { if (draggedId !== task.id) e.currentTarget.style.borderColor = "#2A2A35"; }}
                      >
                        <div style={{ height: 3, background: prio.color, opacity: 0.7 }} />
                        <div style={{ padding: "10px 12px" }}>
                          <div style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 6 }}>
                            <span style={{ fontSize: 13, fontWeight: 500, color: "#E8E8ED", lineHeight: 1.35, flex: 1 }}>{task.title}</span>
                            {agent && <AgentBadge agent={agent} />}
                          </div>
                          {task.description && (
                            <div style={{ fontSize: 11, color: "#5A5A6E", lineHeight: 1.4, marginBottom: 6, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{task.description}</div>
                          )}
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6 }}>
                            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", flex: 1 }}>
                              {(task.tags || []).map(tag => <TagPill key={tag} tag={tag} small />)}
                            </div>
                            <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
                              {task.effort_estimate && (
                                <span style={{ fontSize: 10, fontWeight: 600, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", background: "#0F0F12", padding: "2px 6px", borderRadius: 4 }}>{task.effort_estimate}</span>
                              )}
                              <span style={{ fontSize: 11, color: prio.color }} title={prio.label}>{prio.icon}</span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div onClick={() => inputRef.current?.focus()} style={{
                    padding: "8px 12px", borderRadius: 8, cursor: "pointer",
                    border: "1px dashed #2A2A35", color: "#3A3A48", fontSize: 12,
                    display: "flex", alignItems: "center", gap: 6, transition: "all 0.15s",
                  }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "#5A5A6E"; e.currentTarget.style.color = "#5A5A6E"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "#2A2A35"; e.currentTarget.style.color = "#3A3A48"; }}
                  ><span style={{ fontSize: 16 }}>+</span> Nova atividade</div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Detail sidebar */}
      {selected && (() => {
        const t = tasks.find(x => x.id === selected.id) || selected;
        const agent = agentMap[t.assigned_agent || t.agent_type];
        const colCfg = COLS.find(c => c.id === t.column);
        const prio = PRIO[t.priority] || PRIO.medium;
        return (
          <div style={{
            width: 380, background: "#16161D", borderLeft: "1px solid #2A2A35",
            display: "flex", flexDirection: "column", overflow: "hidden", flexShrink: 0,
          }}>
            <div style={{ padding: "16px 20px", borderBottom: "1px solid #2A2A35", display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 4, height: 20, borderRadius: 2, background: colCfg?.color }} />
              <span style={{ fontSize: 14, fontWeight: 600, color: "#E8E8ED", flex: 1 }}>Detalhes</span>
              <div onClick={() => setSelected(null)} style={{ width: 28, height: 28, borderRadius: 7, background: "#1E1E28", display: "flex", alignItems: "center", justifyContent: "center", cursor: "pointer", color: "#5A5A6E", fontSize: 16 }}>{"\u00d7"}</div>
            </div>
            <div style={{ flex: 1, overflow: "auto", padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 600, color: "#E8E8ED", lineHeight: 1.4, marginBottom: 6 }}>{t.title}</div>
                {t.description && <div style={{ fontSize: 13, color: "#8A8A9E", lineHeight: 1.6 }}>{t.description}</div>}
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                {/* Status select */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", minWidth: 80 }}>Status</span>
                  <select value={t.column} onChange={e => { updateTask(t.id, { column: e.target.value }); setSelected({ ...t, column: e.target.value }); }}
                    style={{ background: "#1E1E28", border: "1px solid #2A2A35", borderRadius: 6, color: "#E8E8ED", padding: "4px 8px", fontSize: 12, outline: "none" }}>
                    {COLS.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                  </select>
                </div>
                {/* Priority */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", minWidth: 80 }}>Prioridade</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {["low", "medium", "high"].map(p => (
                      <div key={p} onClick={() => { updateTask(t.id, { priority: p }); setSelected({ ...t, priority: p }); }} style={{
                        padding: "3px 10px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer",
                        background: t.priority === p ? `${PRIO[p].color}30` : "transparent",
                        color: t.priority === p ? PRIO[p].color : "#5A5A6E",
                        border: `1px solid ${t.priority === p ? PRIO[p].color + "50" : "#2A2A35"}`,
                      }}>{PRIO[p].label}</div>
                    ))}
                  </div>
                </div>
                {/* Agent */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", minWidth: 80 }}>Agente</span>
                  <select value={t.agent_type || ""} onChange={e => { updateTask(t.id, { agent_type: e.target.value || null, assigned_agent: e.target.value || null }); setSelected({ ...t, agent_type: e.target.value || null, assigned_agent: e.target.value || null }); }}
                    style={{ background: "#1E1E28", border: "1px solid #2A2A35", borderRadius: 6, color: "#E8E8ED", padding: "4px 8px", fontSize: 12, outline: "none" }}>
                    <option value="">N\u00e3o atribu\u00eddo</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name} - {a.role}</option>)}
                  </select>
                </div>
                {/* Effort */}
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", minWidth: 80 }}>Esfor\u00e7o</span>
                  <div style={{ display: "flex", gap: 4 }}>
                    {EFFORTS.map(e => (
                      <div key={e} onClick={() => { updateTask(t.id, { effort_estimate: e }); setSelected({ ...t, effort_estimate: e }); }} style={{
                        padding: "3px 8px", borderRadius: 4, fontSize: 11, fontWeight: 600, cursor: "pointer",
                        fontFamily: "'JetBrains Mono', monospace",
                        background: t.effort_estimate === e ? "#6C5CE720" : "#0F0F12",
                        color: t.effort_estimate === e ? "#6C5CE7" : "#5A5A6E",
                        border: `1px solid ${t.effort_estimate === e ? "#6C5CE740" : "#2A2A35"}`,
                      }}>{e}</div>
                    ))}
                  </div>
                </div>
                {/* Tags */}
                <div style={{ display: "flex", alignItems: "flex-start", gap: 12 }}>
                  <span style={{ fontSize: 12, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", minWidth: 80, paddingTop: 4 }}>Tags</span>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                    {Object.keys(TAGS_MAP).map(tag => {
                      const active = (t.tags || []).includes(tag);
                      return (
                        <div key={tag} onClick={() => {
                          const newTags = active ? t.tags.filter(x => x !== tag) : [...(t.tags || []), tag];
                          updateTask(t.id, { tags: newTags }); setSelected({ ...t, tags: newTags });
                        }} style={{
                          ...(() => { const cfg = TAGS_MAP[tag]; return { background: active ? cfg.bg : "transparent", color: active ? cfg.text : "#3A3A48", border: `1px solid ${active ? cfg.border : "#2A2A35"}` }; })(),
                          padding: "3px 9px", borderRadius: 6, fontSize: 11, fontWeight: 500, cursor: "pointer", transition: "all 0.15s",
                        }}>{tag}</div>
                      );
                    })}
                  </div>
                </div>
              </div>

              {/* Objective */}
              {t.objective && (
                <div style={{ borderTop: "1px solid #2A2A35", paddingTop: 14 }}>
                  <div style={{ fontSize: 10, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Objetivo</div>
                  <div style={{ fontSize: 13, color: "#8A8A9E", lineHeight: 1.5 }}>{t.objective}</div>
                </div>
              )}

              {/* Acceptance criteria */}
              {t.acceptance_criteria?.length > 0 && (
                <div style={{ borderTop: "1px solid #2A2A35", paddingTop: 14 }}>
                  <div style={{ fontSize: 10, color: "#5A5A6E", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Crit\u00e9rios de aceite</div>
                  {t.acceptance_criteria.map((c, i) => (
                    <div key={i} style={{ fontSize: 12, color: "#8A8A9E", lineHeight: 1.5, display: "flex", gap: 6, marginBottom: 2 }}>
                      <span style={{ color: "#3A3A48" }}>{"\u2022"}</span>{c}
                    </div>
                  ))}
                </div>
              )}

              {/* Blocked reason */}
              {t.column === "blocked" && (
                <div style={{ borderTop: "1px solid #2A2A35", paddingTop: 14 }}>
                  <div style={{ fontSize: 10, color: "#D63031", fontFamily: "'JetBrains Mono', monospace", textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>Motivo do bloqueio</div>
                  <textarea value={t.blocked_reason || ""} onChange={e => { setSelected({ ...t, blocked_reason: e.target.value }); }}
                    onBlur={e => updateTask(t.id, { blocked_reason: e.target.value })}
                    placeholder="Descreva o impedimento..."
                    style={{ width: "100%", background: "#0F0F12", border: "1px solid #2A2A35", borderRadius: 8, color: "#E8E8ED", padding: 10, fontSize: 12, fontFamily: "'DM Sans', sans-serif", resize: "vertical", outline: "none", minHeight: 50 }}
                  />
                </div>
              )}

              {/* Delete */}
              <div style={{ borderTop: "1px solid #2A2A35", paddingTop: 14, display: "flex", gap: 8 }}>
                <div onClick={() => { if (confirm("Excluir esta atividade?")) deleteTask(t.id); }} style={{
                  padding: "6px 14px", borderRadius: 6, fontSize: 12, cursor: "pointer",
                  color: "#D63031", border: "1px solid #D6303130", background: "#D6303110",
                }}>Excluir atividade</div>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
