"use client";
import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabaseClient";
import { useAuth } from "@/components/AuthProvider";

const PERMS = {
  "orders.view": "View orders", "orders.edit": "Create / edit orders",
  "payments.view": "View payments", "payments.record": "Record payments",
  "finance.view": "View expenses & overheads", "finance.edit": "Edit expenses & overheads",
  "inventory.view": "View inventory", "inventory.edit": "Edit inventory",
  "qc.view": "View QC", "qc.edit": "Record QC inspections",
  "reports.view": "View reports", "settings.edit": "Change prices & settings",
  "staff.manage": "Approve staff & assign roles", "audit.view": "View audit log", "ai.use": "Use AI assistant",
};
const ADMIN_ROLES = ["super_admin", "admin"];

export default function StaffAdminPage() {
  const me = useAuth();
  const [tab, setTab] = useState("staff");
  if (!me.can("staff.manage")) return <div className="ax-page"><p>You don't have access to this page.</p></div>;
  const isSuper = me.role === "super_admin";
  return (
    <div className="ax-page">
      <Link href="/">← Back to tracker</Link>
      <h1>Manage access</h1>
      <div className="ax-tabs">
        <button className="ax-btn alt" onClick={() => setTab("staff")}>Staff</button>
        {isSuper && <button className="ax-btn alt" onClick={() => setTab("roles")}>Roles & permissions</button>}
      </div>
      {tab === "staff" || !isSuper ? <StaffTab me={me} isSuper={isSuper} /> : <RolesTab />}
    </div>
  );
}

function StaffTab({ me, isSuper }) {
  const [members, setMembers] = useState(null);
  const [roles, setRoles] = useState([]);
  const load = useCallback(async () => {
    const [m, r] = await Promise.all([
      supabase.from("staff_members").select("*").order("created_at"),
      supabase.from("roles").select("name,label").order("name"),
    ]);
    const rank = { pending: 0, approved: 1, suspended: 2, rejected: 3 };
    setMembers((m.data || []).sort((a, b) => rank[a.status] - rank[b.status]));
    setRoles(r.data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  if (!members) return <p>Loading...</p>;
  return <>{members.map((m) => <MemberRow key={m.user_id} m={m} roles={roles} me={me} isSuper={isSuper} reload={load} />)}</>;
}

function MemberRow({ m, roles, me, isSuper, reload }) {
  const [role, setRole] = useState(m.role || "");
  const locked = m.user_id === me.user.id || (!isSuper && ADMIN_ROLES.includes(m.role));
  const options = roles.filter((r) => isSuper || !ADMIN_ROLES.includes(r.name));
  async function act(status) {
    const { error } = await supabase.rpc("admin_review_member", { p_user: m.user_id, p_status: status, p_role: role || null });
    if (error) alert(error.message); else reload();
  }
  const btn = (label, status, cls = "") => <button className={"ax-btn " + cls} onClick={() => act(status)}>{label}</button>;
  return (
    <div className="ax-item">
      <div className="grow">
        <b>{m.full_name || "(no name)"}</b>
        <small>{m.email}{m.phone ? " · " + m.phone : ""}</small>
      </div>
      <span className={"ax-badge " + m.status}>{m.status}</span>
      <select className="ax-sel" style={{ width: "auto", margin: 0 }} value={role} disabled={locked} onChange={(e) => setRole(e.target.value)}>
        <option value="">Choose role...</option>
        {options.map((r) => <option key={r.name} value={r.name}>{r.label}</option>)}
      </select>
      {!locked && m.status === "approved" && <>{btn("Save role", "approved")}{btn("Suspend", "suspended", "bad")}</>}
      {!locked && m.status === "pending" && <>{btn("Approve", "approved")}{btn("Reject", "rejected", "bad")}</>}
      {!locked && (m.status === "rejected" || m.status === "suspended") && btn("Approve", "approved")}
    </div>
  );
}

function RolesTab() {
  const [roles, setRoles] = useState(null);
  const [label, setLabel] = useState("");
  const load = useCallback(async () => {
    const { data } = await supabase.from("roles").select("*").order("created_at");
    setRoles(data || []);
  }, []);
  useEffect(() => { load(); }, [load]);
  async function add() {
    const l = label.trim();
    if (!l) return;
    const name = l.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
    const { error } = await supabase.from("roles").insert({ name, label: l, permissions: [] });
    if (error) alert(error.message); else { setLabel(""); load(); }
  }
  if (!roles) return <p>Loading...</p>;
  return (
    <>
      {roles.map((r) => <RoleCard key={r.name} r={r} reload={load} />)}
      <div className="ax-item">
        <input className="ax-sel" style={{ width: "auto", margin: 0 }} placeholder="New role, e.g. Cashier" value={label} onChange={(e) => setLabel(e.target.value)} />
        <button className="ax-btn" onClick={add}>Add role</button>
      </div>
    </>
  );
}

function RoleCard({ r, reload }) {
  const locked = r.name === "super_admin";
  const [perms, setPerms] = useState(locked ? Object.keys(PERMS) : r.permissions);
  const toggle = (k) => setPerms((p) => (p.includes(k) ? p.filter((x) => x !== k) : [...p, k]));
  async function save() {
    const { error } = await supabase.from("roles").update({ permissions: perms }).eq("name", r.name);
    alert(error ? error.message : "Saved. People see the change next time they sign in or refresh.");
  }
  async function del() {
    if (!confirm(`Delete role "${r.label}"?`)) return;
    const { error } = await supabase.from("roles").delete().eq("name", r.name);
    if (error) alert("Cannot delete: people still have this role."); else reload();
  }
  return (
    <div className="ax-item">
      <div className="grow"><b>{r.label}</b><small>{r.description || r.name}</small></div>
      <div className="ax-perms">
        {Object.entries(PERMS).map(([k, label]) => (
          <label key={k}><input type="checkbox" checked={perms.includes(k)} disabled={locked} onChange={() => toggle(k)} /> {label}</label>
        ))}
      </div>
      {!locked && <button className="ax-btn" onClick={save}>Save</button>}
      {!locked && !r.is_system && <button className="ax-btn bad" onClick={del}>Delete</button>}
    </div>
  );
}
