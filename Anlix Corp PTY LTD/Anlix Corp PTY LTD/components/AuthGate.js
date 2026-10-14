"use client";
import { useState } from "react";
import { supabase } from "@/lib/supabaseClient";

const STATUS_TEXT = {
  pending: ["Waiting for approval", "Your request has been received. You'll get access once an admin approves it."],
  rejected: ["Request declined", "Your request wasn't approved. Contact an administrator if this is a mistake."],
  suspended: ["Access suspended", "Your access has been paused. Contact an administrator."],
  none: ["Account not set up", "Your login has no staff profile yet. Contact an administrator."],
};

function Shell({ title, sub, children }) {
  return (
    <div id="ax-gate">
      <div className="ax-card">
        <div className="ax-brand">Anlix Corp</div>
        <h1>{title}</h1>
        <p>{sub}</p>
        {children}
      </div>
    </div>
  );
}
const Field = ({ label, ...props }) => (
  <label className="ax-f">{label}<input required {...props} /></label>
);

export default function AuthGate({ user, access, recovery, onDone, signOut }) {
  const [view, setView] = useState("login");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const go = (v) => { setView(v); setMsg(null); };
  const note = msg && <div className={"ax-msg" + (msg.err ? " err" : "")}>{msg.text}</div>;
  const link = (text, v) => <button type="button" className="ax-link" onClick={() => go(v)}>{text}</button>;

  const submit = (fn) => async (e) => {
    e.preventDefault();
    const values = Object.fromEntries(new FormData(e.currentTarget));
    setBusy(true); setMsg(null);
    try { await fn(values); } catch (err) { setMsg({ err: true, text: err.message || "Something went wrong." }); }
    setBusy(false);
  };

  // Came back from a password-reset email
  if (recovery)
    return (
      <Shell title="Choose a new password" sub="Enter a new password for your account.">
        <form onSubmit={submit(async ({ password }) => {
          if (password.length < 8) throw new Error("Password must be at least 8 characters.");
          const { error } = await supabase.auth.updateUser({ password });
          if (error) throw error;
          onDone(true);
        })}>
          <Field label="New password" type="password" name="password" autoComplete="new-password" />
          <button className="ax-btn full" disabled={busy}>Save password</button>{note}
        </form>
      </Shell>
    );

  // Signed in, but not approved yet
  if (user) {
    const [title, sub] = STATUS_TEXT[access?.status] || STATUS_TEXT.none;
    return (
      <Shell title={title} sub={sub}>
        <div className="ax-row">
          <button className="ax-btn alt" onClick={() => onDone()}>Check again</button>
          <button className="ax-btn alt" onClick={signOut}>Sign out</button>
        </div>
      </Shell>
    );
  }

  if (view === "signup")
    return (
      <Shell title="Request access" sub="Create your account. An admin will review it.">
        <form onSubmit={submit(async (v) => {
          if (v.password.length < 8) throw new Error("Password must be at least 8 characters.");
          if (v.password !== v.confirm) throw new Error("Passwords do not match.");
          const { data, error } = await supabase.auth.signUp({
            email: v.email.trim(), password: v.password,
            options: { data: { full_name: v.name.trim(), phone: v.phone.trim() } },
          });
          if (error) throw error;
          if (data.session) return onDone();
          setMsg({ text: "Request sent. Confirm your email, then sign in. An admin must approve you before you can get in." });
        })}>
          <Field label="Full name" name="name" autoComplete="name" />
          <Field label="Phone" type="tel" name="phone" autoComplete="tel" />
          <Field label="Email" type="email" name="email" autoComplete="email" />
          <Field label="Password (min 8 characters)" type="password" name="password" autoComplete="new-password" />
          <Field label="Confirm password" type="password" name="confirm" autoComplete="new-password" />
          <button className="ax-btn full" disabled={busy}>Request access</button>{note}
          <div className="ax-row">{link("Back to sign in", "login")}</div>
        </form>
      </Shell>
    );

  if (view === "reset")
    return (
      <Shell title="Reset password" sub="We'll email you a link.">
        <form onSubmit={submit(async ({ email }) => {
          const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: window.location.origin });
          if (error) throw error;
          setMsg({ text: "If that email has an account, a reset link is on its way." });
        })}>
          <Field label="Email" type="email" name="email" autoComplete="email" />
          <button className="ax-btn full" disabled={busy}>Send reset link</button>{note}
          <div className="ax-row">{link("Back to sign in", "login")}</div>
        </form>
      </Shell>
    );

  return (
    <Shell title="Welcome back" sub="Sign in to the order tracker.">
      <form onSubmit={submit(async ({ email, password }) => {
        const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
        if (error) throw error;
        onDone();
      })}>
        <Field label="Email" type="email" name="email" autoComplete="email" />
        <Field label="Password" type="password" name="password" autoComplete="current-password" />
        <button className="ax-btn full" disabled={busy}>Sign in</button>{note}
        <div className="ax-row">{link("Forgot password?", "reset")}{link("Request access", "signup")}</div>
      </form>
    </Shell>
  );
}
