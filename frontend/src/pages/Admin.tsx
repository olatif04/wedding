import React, { useMemo, useState } from "react";
import { motion } from "framer-motion";
import { container, item } from "../lib/motion";
import {
  adminCreateInvite,
  adminDeleteInvite,
  adminListInvites,
  adminLogin
} from "../lib/api";

function inviteLink(inviteId: string) {
  // HashRouter + invite route:
  return `${window.location.origin}${window.location.pathname}#/invite/${inviteId}`;
}

export default function Admin() {
  const [password, setPassword] = useState("");
  const [token, setToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [loading, setLoading] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);

  const [displayName, setDisplayName] = useState("");
  const [allowedGuests, setAllowedGuests] = useState(0);
  const [message, setMessage] = useState("");

  const canCreate = useMemo(() => {
    return displayName.trim().length > 0 && allowedGuests >= 0 && allowedGuests <= 10;
  }, [displayName, allowedGuests]);

  async function refresh(tkn: string) {
    const res = await adminListInvites(tkn);
    setInvites(res.invites);
  }

  async function onLogin() {
    setError(null);
    try {
      setLoading(true);
      const res = await adminLogin(password);
      setToken(res.token);
      await refresh(res.token);
    } catch (e: any) {
      setError(e.message || "Login failed.");
    } finally {
      setLoading(false);
    }
  }

  async function onCreate() {
    if (!token) return;
    setError(null);
    try {
      setLoading(true);
      const res = await adminCreateInvite(token, {
        displayName: displayName.trim(),
        allowedGuests,
        message: message.trim() || undefined
      });
      setDisplayName("");
      setAllowedGuests(0);
      setMessage("");
      await refresh(token);

      const link = inviteLink(res.invite.id);
      const text =
        `Hi ${res.invite.displayName}! ` +
        `Please RSVP here: ${link}\n\n` +
        `If the link doesn’t open, go to the website and enter your name exactly as written: "${res.invite.displayName}".`;

      await navigator.clipboard.writeText(text);
      alert("Invite created. Message copied to clipboard ✅");
    } catch (e: any) {
      setError(e.message || "Could not create invite.");
    } finally {
      setLoading(false);
    }
  }

  async function onCopy(inv: any) {
    const link = inviteLink(inv.id);
    const text =
      `Hi ${inv.displayName}! ` +
      `Please RSVP here: ${link}\n\n` +
      `If the link doesn’t open, go to the website and enter your name exactly as written: "${inv.displayName}".`;

    await navigator.clipboard.writeText(text);
    alert("Copied ✅");
  }

  async function onDelete(id: string) {
    if (!token) return;
    if (!confirm("Delete this invite?")) return;
    setError(null);
    try {
      setLoading(true);
      await adminDeleteInvite(token, id);
      await refresh(token);
    } catch (e: any) {
      setError(e.message || "Could not delete invite.");
    } finally {
      setLoading(false);
    }
  }

  if (!token) {
    return (
      <div className="container">
        <motion.div variants={container} initial="hidden" animate="show">
          <motion.div className="hero" variants={item}>
            <div className="kicker">Admin</div>
            <div className="names" style={{ fontSize: 48 }}>RSVP Manager</div>
            <div className="rule" />
          </motion.div>

          <motion.div className="card" variants={item}>
            <div className="label">Admin password</div>
            <input
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && onLogin()}
              placeholder="••••••••"
            />
            <button className="btn" onClick={onLogin} disabled={loading}>
              {loading ? "Signing in..." : "Sign in"}
            </button>
            {error && <div className="error">{error}</div>}
            <div className="small">
              This page is private. Do not share the link.
            </div>
          </motion.div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="container">
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div className="hero" variants={item}>
          <div className="kicker">Admin</div>
          <div className="names" style={{ fontSize: 48 }}>Guest List</div>
          <p className="date">Create invites + copy messages</p>
          <div className="rule" />
        </motion.div>

        <motion.div className="card" variants={item}>
          <div className="label">Guest / Family name (exact)</div>
          <input
            className="input"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            placeholder='e.g., "The Williams Family"'
          />

          <div className="hr" />

          <div className="label">Extra guests allowed</div>
          <input
            className="input"
            type="number"
            min={0}
            max={10}
            value={allowedGuests}
            onChange={(e) => setAllowedGuests(Number(e.target.value))}
          />

          <div className="hr" />

          <div className="label">Optional message (shown on invite)</div>
          <input
            className="input"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            placeholder="Dress code, timing note, etc. (optional)"
          />

          {error && <div className="error">{error}</div>}

          <button className="btn" onClick={onCreate} disabled={!canCreate || loading}>
            {loading ? "Working..." : "Create + Copy Message"}
          </button>

          <div className="small">
            Creating an invite automatically copies a text message to your clipboard (includes their link).
          </div>
        </motion.div>

        <motion.div className="card" variants={item}>
          <div className="label">Invites</div>
          <div className="adminGrid">
            {invites.map((inv) => (
              <div className="inviteItem" key={inv.id}>
                <div className="inviteLeft">
                  <div className="inviteTitle">{inv.displayName}</div>
                  <div className="inviteMeta">
                    Extra guests: {inv.allowedGuests}{" "}
                    • RSVP: {inv.rsvpAttending == null ? "—" : inv.rsvpAttending > 0 ? `Attending (${inv.rsvpAttending})` : "Declined"}
                  </div>
                </div>

                <div style={{ display: "flex", gap: 10 }}>
                  <button className="iconBtn" onClick={() => onCopy(inv)}>Copy msg</button>
                  <button className="iconBtn" onClick={() => onDelete(inv.id)}>Delete</button>
                </div>
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>
    </div>
  );
}
