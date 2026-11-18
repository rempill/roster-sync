"use client";

import { useCallback, useEffect, useState } from "react";
import { io } from "socket.io-client";

type Profile = { id: string; email: string; name: string; skills: string[]; ambition: number; availability: number[] };
type Team = { id: string; name: string; description: string; requiredSkills: string[]; capacity: number; ownerId: string; members: Profile[]; openSpots: number };
type Rank = { teamId: string; score: number; commonHours: number; commonSlots: number[]; components: { schedule: number; skills: number; ambition: number } };
type Request = { id: string; userId: string; kind: string; status: string; user: Profile; team: Team };
type Notice = { id: string; message: string; createdAt: string };
type Tab = "Discover" | "My team" | "Schedule" | "Requests" | "Profile";
const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
const initials = (name: string) => name.split(" ").map(p => p[0]).slice(0, 2).join("");
const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
function monday() {
  const now = new Date();
  now.setDate(now.getDate() - (now.getDay() + 6) % 7);
  return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, "0"), String(now.getDate()).padStart(2, "0")].join("-");
}

function Icon({ name, size = 20 }: { name: string; size?: number }) {
  const paths: Record<string, React.ReactNode> = {
    grid: <><rect x="3" y="3" width="7" height="7" rx="2"/><rect x="14" y="3" width="7" height="7" rx="2"/><rect x="3" y="14" width="7" height="7" rx="2"/><rect x="14" y="14" width="7" height="7" rx="2"/></>,
    people: <><circle cx="9" cy="8" r="3"/><path d="M3 20v-2a6 6 0 0 1 12 0v2M16 5a3 3 0 0 1 0 6M18 14a5 5 0 0 1 3 4v2"/></>,
    calendar: <><rect x="3" y="5" width="18" height="16" rx="3"/><path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2"/></>,
    inbox: <><path d="M4 4h16l2 13v3H2v-3L4 4Z"/><path d="M2 15h6l2 3h4l2-3h6"/></>,
    user: <><circle cx="12" cy="8" r="4"/><path d="M4 22v-2a8 8 0 0 1 16 0v2"/></>,
    arrow: <><path d="M5 12h14M13 6l6 6-6 6"/></>,
    spark: <><path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3Z"/></>,
    clock: <><circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    logout: <><path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h13"/></>,
    check: <path d="m5 12 4 4L19 6"/>,
    search: <><circle cx="10" cy="10" r="6"/><path d="m15 15 5 5"/></>,
    upload: <><path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5"/></>,
  };
  return <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.65" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name] || paths.grid}</svg>;
}

export default function Home() {
  const [token, setToken] = useState("");
  const [ready, setReady] = useState(false);
  const [user, setUser] = useState<Profile | null>(null);
  const [teams, setTeams] = useState<Team[]>([]);
  const [ranks, setRanks] = useState<Rank[]>([]);
  const [requests, setRequests] = useState<Request[]>([]);
  const [notices, setNotices] = useState<Notice[]>([]);
  const [tab, setTab] = useState<Tab>("Discover");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");
  const [live, setLive] = useState(false);
  const [search, setSearch] = useState("");
  const [creating, setCreating] = useState(false);
  const [week, setWeek] = useState(monday);
  const [calendar, setCalendar] = useState("");
  const [draft, setDraft] = useState<Profile | null>(null);
  const [compare, setCompare] = useState("");
  const [authMode, setAuthMode] = useState<"login" | "register">("login");

  useEffect(() => { setToken(localStorage.getItem("rostersync-token") || ""); setReady(true); }, []);
  const api = useCallback(async (path: string, method = "GET", body?: unknown) => {
    const response = await fetch(API + path, { method, headers: { "Content-Type": "application/json", ...(token ? { Authorization: "Bearer " + token } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.message || "Request failed.");
    return data;
  }, [token]);
  const refresh = useCallback(async () => {
    const [profile, list, ranked, pending, feed] = await Promise.all([api("/me"), api("/teams"), api("/teams/rank"), api("/applications"), api("/notifications")]);
    setUser(profile); setTeams(list); setRanks(ranked); setRequests(pending); setNotices(feed);
    setDraft(current => current || profile);
  }, [api]);
  useEffect(() => {
    if (!token) return;
    refresh().catch(e => { setError(e.message); if (/session|Sign in|Account not found/.test(e.message)) { localStorage.removeItem("rostersync-token"); setToken(""); setUser(null); } });
    const socket = io(API, { auth: { token }, transports: ["websocket", "polling"] });
    socket.on("connect", () => setLive(true));
    socket.on("disconnect", () => setLive(false));
    socket.on("team.updated", () => { refresh().catch(e => setError(e.message)); });
    socket.on("notification", (notice: Notice) => { setNotices(old => [notice, ...old.filter(n => n.id !== notice.id)].slice(0, 30)); setToast(notice.message); });
    return () => { socket.disconnect(); };
  }, [token, refresh]);
  useEffect(() => { if (!toast) return; const timer = setTimeout(() => setToast(""), 5000); return () => clearTimeout(timer); }, [toast]);

  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setBusy(true); setError("");
    try { await fn(); } catch (e) { setError(e instanceof Error ? e.message : "Something went wrong."); } finally { setBusy(false); }
  }
  async function signIn(form: FormData, demo = false) {
    await action(async () => {
      const data = await api("/auth/" + (demo ? "login" : authMode), "POST", { email: demo ? "alex@stud.ubbcluj.ro" : form.get("email"), password: demo ? "Demo12345!" : form.get("password"), ...(authMode === "register" && !demo ? { name: form.get("name") } : {}) });
      localStorage.setItem("rostersync-token", data.token); setToken(data.token); setUser(data.user); setDraft(data.user);
    });
  }
  const ownTeam = teams.find(team => team.members.some(member => member.id === user?.id));
  const pending = requests.filter(r => r.status === "PENDING");
  const rankedIds = ranks.map(rank => rank.teamId);
  const visibleTeams = [...teams].sort((a, b) => {
    const aIndex = rankedIds.indexOf(a.id), bIndex = rankedIds.indexOf(b.id);
    return (aIndex < 0 ? 999 : aIndex) - (bIndex < 0 ? 999 : bIndex);
  }).filter(team => [team.name, team.description, ...team.requiredSkills].join(" ").toLowerCase().includes(search.toLowerCase()));
  const selectedTeam = teams.find(t => t.id === compare);
  const sharedSlots = draft?.availability.map((bit, i) => bit && (selectedTeam ? selectedTeam.members.every(member => member.availability[i]) : true)) || [];

  function teamCard(team: Team, index: number) {
    const rank = ranks.find(r => r.teamId === team.id);
    const applied = requests.some(r => r.team.id === team.id && r.userId === user?.id);
    const mine = team.members.some(member => member.id === user?.id);
    return <article className="team-card" key={team.id}>
      <div className="card-top"><div className={"project-icon color-" + index % 3}><Icon name={index % 2 ? "people" : "grid"} size={26}/></div>{rank && <span className="match"><Icon name="spark" size={13}/>{rank.score}% match</span>}{mine && <span className="match">Your team</span>}</div>
      <h3>{team.name}</h3><p className="description">{team.description}</p>
      <div className="tags">{team.requiredSkills.map(skill => <span key={skill}>{skill}</span>)}</div>
      <div className="card-detail"><Icon name="clock" size={15}/><span>{rank ? rank.commonHours + "h shared availability" : "Compare your availability"}</span></div>
      {rank && <div className="score-breakdown" aria-label="Compatibility breakdown"><span>Schedule {rank.components.schedule}%</span><span>Skills {rank.components.skills}%</span><span>Ambition {rank.components.ambition}%</span></div>}
      <div className="card-footer"><div className="members">{team.members.map((member, i) => <span title={member.name} className={"avatar av-" + i % 3} key={member.id}>{initials(member.name)}</span>)}<small>{team.members.length}/{team.capacity} members</small></div>
        <button className="text-button" disabled={busy || !!ownTeam || applied || team.openSpots === 0} onClick={() => action(async () => { await api("/teams/" + team.id + "/apply", "POST", {}); await refresh(); setToast("Application sent. The team owner will review it."); })}>{mine ? "Joined" : applied ? "Requested" : team.openSpots === 0 ? "Full" : "Apply"}<Icon name="arrow" size={16}/></button>
      </div>
      <button className="compare-link" onClick={() => { setCompare(team.id); setDraft(user); setTab("Schedule"); }}>View schedule overlap</button>
    </article>;
  }

  if (!ready) return <main className="loading">Loading RosterSync...</main>;
  if (!token) return <main className="auth-shell">
    <section className="auth-story"><div className="brand"><span className="brand-mark"><Icon name="people" size={25}/></span>RosterSync<span className="brand-dot">.</span></div><span className="eyebrow">BETTER TOGETHER</span><h1>Your next great<br/>project starts<br/>with your people<span>.</span></h1><p>Shared ambition. Complementary skills. A schedule that actually works. Find your university project team.</p><div className="auth-art"><span className="orbit orbit-one">AM</span><span className="orbit orbit-two">MP</span><span className="orbit orbit-three">VI</span><div className="art-center"><Icon name="spark" size={45}/><span>Find your fit.</span></div></div><small>Built for the students of UBB Cluj.</small></section>
    <section className="auth-form"><div className="auth-box"><span className="pill">UNIVERSITY WORKSPACE</span><h2>{authMode === "login" ? "Good to have you here." : "Make room for possibility."}</h2><p>{authMode === "login" ? "Sign in and find a team you click with." : "Create your student profile to get started."}</p>
      <form onSubmit={e => { e.preventDefault(); void signIn(new FormData(e.currentTarget)); }}>
        {authMode === "register" && <label>Your name<input name="name" autoComplete="name" minLength={2} required placeholder="Alex Morgan"/></label>}
        <label>University email<input name="email" type="email" autoComplete="email" required placeholder="you@stud.ubbcluj.ro"/></label>
        <label>Password<input name="password" type="password" autoComplete={authMode === "login" ? "current-password" : "new-password"} minLength={8} maxLength={128} required placeholder="At least 8 characters"/></label>
        <button className="button primary wide" disabled={busy}>{busy ? "Please wait..." : authMode === "login" ? "Sign in" : "Create account"}<Icon name="arrow" size={18}/></button>
      </form>
      <button className="auth-switch" onClick={() => { setAuthMode(authMode === "login" ? "register" : "login"); setError(""); }}>{authMode === "login" ? "New here? Create an account" : "Already have an account? Sign in"}</button>
      <div className="divider"><span>JUST EXPLORING?</span></div><button className="button secondary wide" disabled={busy} onClick={() => void signIn(new FormData(), true)}>Explore the demo<Icon name="arrow" size={18}/></button>
      <p className="demo-note">Local demo with student email validation. University identity verification is not connected.</p>
      {error && <div className="error" role="alert">{error}</div>}
    </div></section>
  </main>;
  if (!user || !draft) return <main className="loading">{error || "Opening your workspace..."}</main>;

  return <div className="app-shell">
    <aside className="sidebar"><div className="brand"><span className="brand-mark"><Icon name="people" size={23}/></span>RosterSync<span className="brand-dot">.</span></div><div className="workspace-label">YOUR WORKSPACE</div><nav aria-label="Main navigation">
      {(["Discover", "My team", "Schedule", "Requests", "Profile"] as Tab[]).map((name, i) => <button key={name} aria-label={name} className={tab === name ? "nav-item active" : "nav-item"} onClick={() => { setTab(name); setError(""); if (name === "Profile" || name === "Schedule") setDraft(user); }}><Icon name={["grid", "people", "calendar", "inbox", "user"][i]}/>{name}{name === "Requests" && pending.length > 0 && <span className="nav-badge">{pending.length}</span>}</button>)}
    </nav><div className="sidebar-bottom"><div className="semester"><span className="semester-dot"/><div><strong>UBB Cluj</strong><small>Student workspace</small></div></div><button className="profile-switch" onClick={() => { setToken(""); setUser(null); setDraft(null); setTeams([]); setRequests([]); setNotices([]); setRanks([]); localStorage.removeItem("rostersync-token"); }}><span className="avatar av-0">{initials(user.name)}</span><span><strong>{user.name}</strong><small>Sign out</small></span><Icon name="logout" size={18}/></button></div></aside>
    <div className="workspace"><header className="topbar"><span>Workspace <span className="breadcrumb">/</span> <strong>{tab}</strong></span><div className="topbar-right"><span className={"live " + (live ? "" : "offline")}><i/>{live ? "Live updates" : "Connecting..."}</span><span className="avatar av-0">{initials(user.name)}</span></div></header>
      <main className="main-content">
      {error && <div className="error" role="alert">{error}<button aria-label="Dismiss error" onClick={() => setError("")}>x</button></div>}
      {tab === "Discover" && <>
        <div className="heading-row"><div><div className="eyebrow">GOOD THINGS START WITH THE RIGHT TEAM</div><h1>Find your people<span>.</span></h1><p>Different skills. Shared ambition. Your next project team is here.</p></div><button className="button primary" onClick={() => setCreating(!creating)} disabled={!!ownTeam}><Icon name="plus" size={18}/>Create a team</button></div>
        <div className="stats"><div><span className="stat-icon"><Icon name="people"/></span><section><strong>{teams.filter(t => t.openSpots > 0).length}<small>teams open</small></strong><p>Find a place to contribute</p></section></div><div><span className="stat-icon"><Icon name="clock"/></span><section><strong>{user.availability.reduce((a, b) => a + b, 0) / 2}<small>hours available</small></strong><p>Your weekly room for ideas</p></section></div><div><span className="stat-icon"><Icon name="spark"/></span><section><strong>{ranks[0]?.score ?? "--"}<small>best match score</small></strong><p>Based on what makes you, you</p></section></div></div>
        <div className="discovery-banner"><div><span className="pill">A LITTLE SCIENCE. A LOT OF POTENTIAL.</span><h2>Great teams are more than a coincidence.</h2><p>We connect your skills, free time and goals to help you find your fit.</p><button onClick={() => { setDraft(user); setTab("Profile"); }}>Fine-tune your profile<Icon name="arrow" size={16}/></button></div><div className="banner-art"><div className="art-tile tile-a"><Icon name="calendar" size={25}/><span>Shared time</span></div><div className="art-tile tile-b"><Icon name="spark" size={25}/><span>Shared goals</span></div><div className="art-tile tile-c"><Icon name="people" size={25}/><span>Your people</span></div></div></div>
        {creating && <form className="panel create-form" onSubmit={e => { e.preventDefault(); const data = new FormData(e.currentTarget); void action(async () => { await api("/teams", "POST", { name: data.get("name"), description: data.get("description"), requiredSkills: String(data.get("skills")).split(",").map(s => s.trim()).filter(Boolean), capacity: Number(data.get("capacity")) }); await refresh(); setCreating(false); setTab("My team"); setToast("Your team is ready."); }); }}><h2>Start something together.</h2><div className="form-grid"><label>Team name<input name="name" required minLength={3} maxLength={80}/></label><label>Team size<input name="capacity" type="number" min={2} max={10} defaultValue={4} required/></label></div><label>What are you building?<textarea name="description" required minLength={5} maxLength={1000}/></label><label>Skills you need, separated by commas<input name="skills" placeholder="React, Python, Figma"/></label><div className="form-actions"><button type="button" className="button secondary" onClick={() => setCreating(false)}>Cancel</button><button className="button primary" disabled={busy}>Create team</button></div></form>}
        <div className="section-heading"><div><h2>A good place to start <span className="count">{visibleTeams.length}</span></h2><p>Teams ranked by your skills, schedule and ambition.</p></div><label className="search"><Icon name="search" size={18}/><input aria-label="Search teams" value={search} onChange={e => setSearch(e.target.value)} placeholder="Find a team or skill"/></label></div>
        <div className="team-grid">{visibleTeams.map(teamCard)}</div>{visibleTeams.length === 0 && <div className="empty">No teams match your search. Try another skill.</div>}
      </>}
      {tab === "My team" && <><div className="heading-row"><div><div className="eyebrow">BUILD SOMETHING THAT MATTERS</div><h1>Your team<span>.</span></h1><p>A shared space for the people behind the project.</p></div></div>{ownTeam ? <><div className="team-grid single">{teamCard(ownTeam, 0)}</div><section className="panel"><h2>The people behind it</h2>{ownTeam.members.map(member => <div className="member-row" key={member.id}><span className="avatar av-1">{initials(member.name)}</span><div><strong>{member.name}</strong><small>{member.skills.join(" / ") || "Skills not set yet"}</small></div><span className="pill">{member.id === ownTeam.ownerId ? "TEAM LEAD" : "MEMBER"}</span></div>)}
        {ownTeam.ownerId === user.id && <><form className="invite-form" onSubmit={e => { e.preventDefault(); const email = new FormData(e.currentTarget).get("email"); void action(async () => { await api("/teams/" + ownTeam.id + "/invite", "POST", { email }); setToast("Invitation sent."); await refresh(); }); }}><label>Invite a student<input name="email" type="email" required placeholder="student@stud.ubbcluj.ro"/></label><button className="button primary" disabled={busy || ownTeam.openSpots === 0}>Send invitation</button></form><button className="button secondary" onClick={() => action(async () => { const result = await api("/teams/" + ownTeam.id + "/roster"); const url = URL.createObjectURL(new Blob([result.csv], { type: "text/csv" })); const a = document.createElement("a"); a.href = url; a.download = result.filename; a.click(); URL.revokeObjectURL(url); })}>Export roster CSV</button></>}
        </section></> : <div className="panel empty"><Icon name="people" size={42}/><h2>Your team is still out there.</h2><p>Discover a team to join or create your own.</p><button className="button primary" onClick={() => setTab("Discover")}>Discover teams<Icon name="arrow" size={18}/></button></div>}</>}
      {tab === "Schedule" && <><div className="heading-row"><div><div className="eyebrow">MAKE TIME FOR GOOD IDEAS</div><h1>Find your common ground<span>.</span></h1><p>Each cell is 30 minutes. Click to update your weekly availability.</p></div><button className="button primary" disabled={busy} onClick={() => action(async () => { await api("/me", "PUT", draft); await refresh(); setToast("Availability saved."); })}><Icon name="check" size={18}/>Save availability</button></div>
        <section className="panel"><div className="schedule-toolbar"><label>Compare with a team<select value={compare} onChange={e => setCompare(e.target.value)}><option value="">My availability</option>{teams.map(t => <option key={t.id} value={t.id}>{t.name}</option>)}</select></label><div className="legend"><span><i className="available"/>Available</span>{selectedTeam && <span><i className="shared"/>Shared time</span>}<span><i/>Busy</span></div></div>
        <div className="schedule-grid"><span/>{days.map(day => <strong key={day}>{day}</strong>)}{Array.from({ length: 18 }, (_, row) => <div className="schedule-row" key={row}><time>{String(9 + Math.floor(row / 2)).padStart(2, "0")}:{row % 2 ? "30" : "00"}</time>{days.map((day, d) => { const index = d * 48 + 18 + row; return <button key={day} aria-label={day + " " + (9 + Math.floor(row / 2)) + ":" + (row % 2 ? "30" : "00")} aria-pressed={!!draft.availability[index]} className={(draft.availability[index] ? "slot available" : "slot") + (selectedTeam && sharedSlots[index] ? " shared" : "")} onClick={() => setDraft({ ...draft, availability: draft.availability.map((bit, i) => i === index ? 1 - bit : bit) })}/>; })}</div>)}</div>
        <p className="schedule-caption">{selectedTeam ? sharedSlots.filter(Boolean).length / 2 + " shared hours this week with " + selectedTeam.name : draft.availability.reduce((a, b) => a + b, 0) / 2 + " available hours across your full week"}</p></section>
        <section className="panel"><h2>Bring your calendar along.</h2><p>Import an .ics file. Classes block your default weekday availability, 09:00-18:00. Recurring events are expanded for the selected week.</p><div className="form-grid"><label>Week starting Monday<input type="date" value={week} onChange={e => setWeek(e.target.value)} required/></label><label>Calendar file<input type="file" accept=".ics,text/calendar" onChange={e => { const file = e.target.files?.[0]; if (file) { if (file.size > 1000000) { setError("Calendar must be smaller than 1 MB."); return; } file.text().then(setCalendar).catch(() => setError("Cannot read calendar file.")); } }}/></label></div><button className="button secondary" disabled={busy || !calendar} onClick={() => action(async () => { const result = await api("/calendar/import", "POST", { ics: calendar, weekStart: week, timezone: "Europe/Bucharest" }); setDraft({ ...user, availability: result.availability }); await refresh(); setToast(result.eventsImported + " calendar events imported."); })}><Icon name="upload" size={18}/>Import calendar</button></section>
      </>}
      {tab === "Profile" && <><div className="heading-row"><div><div className="eyebrow">WHAT MAKES YOU, YOU</div><h1>A little about you<span>.</span></h1><p>Better profiles make better matches.</p></div></div><form className="panel profile-form" onSubmit={e => { e.preventDefault(); void action(async () => { const saved = await api("/me", "PUT", draft); setDraft(saved); await refresh(); setToast("Profile updated. Your matches are refreshed."); }); }}><div className="profile-title"><span className="avatar large av-0">{initials(draft.name)}</span><div><h2>{draft.name}</h2><p>{user.email}</p></div></div><label>Your name<input value={draft.name} onChange={e => setDraft({ ...draft, name: e.target.value })} required minLength={2} maxLength={80}/></label><label>Your skills, separated by commas<input value={draft.skills.join(",")} onChange={e => setDraft({ ...draft, skills: e.target.value.split(",") })} placeholder="React, TypeScript, Python"/></label><label>Academic ambition: {draft.ambition}/10<input type="range" min={1} max={10} value={draft.ambition} onChange={e => setDraft({ ...draft, ambition: Number(e.target.value) })}/></label><p className="muted">We balance schedule overlap (45%), skill coverage (35%) and shared ambition (20%).</p><button className="button primary" disabled={busy}>Save profile<Icon name="check" size={18}/></button></form></>}
      {tab === "Requests" && <><div className="heading-row"><div><div className="eyebrow">YOUR NEXT CONNECTION</div><h1>Keep things moving<span>.</span></h1><p>Applications, invitations and the latest from your team.</p></div></div><section className="panel"><h2>Applications & invitations</h2>{requests.length === 0 && <p className="empty">Nothing here yet. Your next connection starts in Discover.</p>}{requests.map(request => <div className="request-row" key={request.id}><span className="avatar av-2">{initials(request.user.name)}</span><div><strong>{request.kind === "INVITE" ? "Invitation to " + request.team.name : request.user.name + " applied to " + request.team.name}</strong><small>{request.kind === "INVITE" ? request.user.email : request.user.skills.join(" / ")}</small></div><span className="pill">{request.status}</span>{request.status === "PENDING" && request.kind === "APPLICATION" && request.team.ownerId === user.id && <><button className="button primary small" disabled={busy} onClick={() => action(async () => { await api("/applications/" + request.id + "/approve", "POST", {}); await refresh(); setToast("Welcome to the team."); })}>Approve</button><button className="button secondary small" disabled={busy} onClick={() => action(async () => { await api("/applications/" + request.id + "/reject", "POST", {}); await refresh(); })}>Decline</button></>}{request.status === "PENDING" && request.kind === "INVITE" && request.userId === user.id && <button className="button primary small" disabled={busy} onClick={() => action(async () => { await api("/invitations/" + request.id + "/accept", "POST", {}); await refresh(); setToast("You joined the team."); })}>Accept invitation</button>}</div>)}</section><section className="panel"><h2>Activity</h2>{notices.length === 0 && <p className="muted">You are all caught up.</p>}{notices.map(n => <div className="notice-row" key={n.id}><span className="notice-dot"/><p>{n.message}</p><time>{new Date(n.createdAt).toLocaleString("en-GB")}</time></div>)}</section></>}
      <footer className="footer"><span>Built for better together.</span><span>RosterSync / Local demo</span></footer>
      </main>
    </div>{toast && <div className="toast" role="status"><Icon name="check" size={18}/>{toast}</div>}
  </div>;
}
