"use client";
import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { supabase, hasSupabase } from "@/lib/supabaseClient";
import AuthGate from "./AuthGate";
import "./auth.css";

const Ctx = createContext(null);
export const useAuth = () => useContext(Ctx);

// <Can perm="payments.record"><AddPaymentButton /></Can>
export function Can({ perm, children, fallback = null }) {
  const { can } = useAuth();
  return can(perm) ? children : fallback;
}

export default function AuthProvider({ children }) {
  const [state, setState] = useState({ loading: true, user: null, access: null });
  const [recovery, setRecovery] = useState(false);

  const load = useCallback(async () => {
    if (!hasSupabase) return setState({ loading: false, user: null, access: null });
    const { data: s } = await supabase.auth.getSession();
    if (!s.session) return setState({ loading: false, user: null, access: null });
    const { data, error } = await supabase.rpc("my_access");
    setState({ loading: false, user: s.session.user, access: error ? null : data });
  }, []);

  useEffect(() => {
    load();
    if (!hasSupabase) return;
    const { data } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") setRecovery(true);
      setTimeout(load, 0); // don't call Supabase inside the callback itself
    });
    return () => data.subscription.unsubscribe();
  }, [load]);

  const { access, user } = state;
  const approved = access?.status === "approved";
  const role = access?.role;
  const perms = access?.permissions ?? [];
  const can = (p) => approved && (role === "super_admin" || perms.includes(p));
  const signOut = async () => {
    await supabase.auth.signOut();
    setState({ loading: false, user: null, access: null });
  };
  const refresh = (recoveryDone) => {
    if (recoveryDone === true) setRecovery(false);
    return load();
  };

  // No Supabase env vars: local-only mode, no sign-in and everything allowed
  if (!hasSupabase)
    return (
      <Ctx.Provider value={{ user: null, access: null, role: "super_admin", can: () => true, signOut() {}, refresh() {} }}>
        {children}
      </Ctx.Provider>
    );

  if (state.loading) return <div className="ax-loading">Loading...</div>;
  if (recovery || !approved)
    return <AuthGate user={user} access={access} recovery={recovery} onDone={refresh} signOut={signOut} />;

  return (
    <Ctx.Provider value={{ user, access, role, can, signOut, refresh }}>
      {children}
    </Ctx.Provider>
  );
}
