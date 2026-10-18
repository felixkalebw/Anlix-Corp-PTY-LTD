"use client";
import { createContext, useCallback, useContext, useEffect, useRef, useState } from "react";
import { supabase, hasSupabase } from "@/lib/supabaseClient";
import AuthGate from "./AuthGate";
import "./auth.css";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

export const CACHE_KEY = "anlix-tracker-next";
export const purgeLocalCopy = () => {
  try { localStorage.removeItem(CACHE_KEY); sessionStorage.removeItem(CACHE_KEY); } catch {}
};

// ---- Inactivity auto-logout ----
const IDLE_MS = 10 * 60 * 1000;   // sign out after 10 min with no activity
const WARN_MS = 60 * 1000;        // warn during the last minute
const ACTIVITY_KEY = "anlix-last-activity"; // shared across tabs via localStorage
const IDLE_NOTICE = { text: "You were signed out after 10 minutes of inactivity. Please sign in again." };
const lastActivity = () => { try { return Number(localStorage.getItem(ACTIVITY_KEY)) || 0; } catch { return 0; } };
const markActivity = () => { try { localStorage.setItem(ACTIVITY_KEY, String(Date.now())); } catch {} };
const clearActivity = () => { try { localStorage.removeItem(ACTIVITY_KEY); } catch {} };

export function Can({ perm, children, fallback = null }) {
  const { can } = useAuth();
  return can(perm) ? children : fallback;
}

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, access: null });
  const [recovery, setRecovery] = useState(false);
  const [notice, setNotice] = useState(null);     // message shown on the login screen
  const [warnSecs, setWarnSecs] = useState(null); // seconds left in the idle warning
  const confirmedRef = useRef(false);

  const endSession = useCallback(async (scope) => {
    try { await supabase.auth.signOut({ scope }); } finally { purgeLocalCopy(); clearActivity(); }
    setWarnSecs(null);
    setState({ loading: false, user: null, access: null });
  }, []);

  const load = useCallback(async () => {
    if (!hasSupabase) return setState({ loading: false, user: null, access: null });
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) { purgeLocalCopy(); return setState({ loading: false, user: null, access: null }); }
    // Browser was closed or asleep for longer than the idle limit
    const last = lastActivity();
    if (last && Date.now() - last > IDLE_MS) { setNotice(IDLE_NOTICE); return endSession("local"); }
    const { data, error } = await supabase.rpc("my_access");
    setState({ loading: false, user: s.session.user, access: error ? null : data });
  }, [endSession]);

  useEffect(() => {
    // Arriving from the confirmation email: sign out and show the login page
    const p = new URLSearchParams(window.location.search);
    if (p.get("confirmed")) {
      p.delete("confirmed");
      const qs = p.toString();
      window.history.replaceState({}, "", window.location.pathname + (qs ? "?" + qs : "") + window.location.hash);
      if (window.location.hash.includes("error")) {
        setNotice({ err: true, text: "That confirmation link is invalid or has expired. Try signing in, or contact an administrator." });
      } else {
        confirmedRef.current = true;
        setNotice({ text: "Email confirmed. Sign in below. An admin must approve your request before you can get in." });
      }
    }

    load();
    if (!hasSupabase) return;
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "SIGNED_OUT") purgeLocalCopy();
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      if (confirmedRef.current && session && (event === "SIGNED_IN" || event === "INITIAL_SESSION")) {
        confirmedRef.current = false;
        setTimeout(() => endSession("local"), 0); // confirmation link logs them in; send them to login instead
        return;
      }
      setTimeout(load, 0);
    });
    return () => data.subscription.unsubscribe();
  }, [load, endSession]);

  const { access, user } = state;
  const approved = access?.status === "approved";
  const role = access?.role;
  const perms = access?.permissions ?? [];
  const can = (p) => approved && (role === "super_admin" || perms.includes(p));

  // Idle watcher: only runs while someone is signed in and approved
  useEffect(() => {
    if (!hasSupabase || !approved) return;
    markActivity();
    setNotice(null);
    let lastMark = Date.now();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastMark < 1000) return; // throttle writes
      lastMark = now;
      markActivity();
    };
    const events = ["mousemove", "mousedown", "keydown", "scroll", "touchstart", "click"];
    events.forEach((e) => window.addEventListener(e, onActivity, { passive: true }));
    const tick = () => {
      const idle = Date.now() - (lastActivity() || Date.now());
      if (idle >= IDLE_MS) { setNotice(IDLE_NOTICE); endSession("local"); }
      else if (idle >= IDLE_MS - WARN_MS) setWarnSecs(Math.ceil((IDLE_MS - idle) / 1000));
      else setWarnSecs(null);
    };
    const id = setInterval(tick, 1000);
    return () => { clearInterval(id); events.forEach((e) => window.removeEventListener(e, onActivity)); };
  }, [approved, endSession]);

  const signOut = () => endSession("global");
  const refresh = (recoveryDone) => {
    if (recoveryDone === true) setRecovery(false);
    return load();
  };

  if (!hasSupabase)
    return (
      <Ctx.Provider value={{ user: null, access: null, role: "super_admin", can: () => true, signOut() {}, refresh() {} }}>
        {children}
      </Ctx.Provider>
    );

  if (state.loading) return <div className="ax-loading">Loading...</div>;
  if (recovery || !approved)
    return <AuthGate user={user} access={access} recovery={recovery} notice={notice} onDone={refresh} signOut={signOut} />;

  return (
    <Ctx.Provider value={{ user, access, role, can, signOut, refresh }}>
      {children}
      {warnSecs !== null && (
        <div className="ax-idle" role="alertdialog">
          <span>For security, you'll be signed out in {warnSecs}s due to inactivity.</span>
          <button className="ax-btn" onClick={markActivity}>Stay signed in</button>
        </div>
      )}
    </Ctx.Provider>
  );
}
