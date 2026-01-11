import React, { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { motion } from "framer-motion";
import { container, item } from "../lib/motion";
import { getInvite, submitRSVP, Invite as InviteType } from "../lib/api";

export default function Invite() {
  const { id } = useParams();
  const [invite, setInvite] = useState<InviteType | null>(null);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  const [primaryName, setPrimaryName] = useState("");
  const [attending, setAttending] = useState(true);
  const [extraCount, setExtraCount] = useState(0);
  const [extraNames, setExtraNames] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [done, setDone] = useState(false);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        setLoading(true);
        const res = await getInvite(id!);
        if (!mounted) return;
        setInvite(res.invite);
        setPrimaryName(res.invite.displayName);
      } catch (e: any) {
        setErr(e.message || "Invite not found.");
      } finally {
        setLoading(false);
      }
    })();
    return () => {
      mounted = false;
    };
  }, [id]);

  // keep extraNames array sized to extraCount
  useEffect(() => {
    setExtraNames((prev) => {
      const next = [...prev];
      next.length = extraCount;
      for (let i = 0; i < next.length; i++) if (!next[i]) next[i] = "";
      return next;
    });
  }, [extraCount]);

  const maxExtra = invite?.allowedGuests ?? 0;
  const canSubmit = useMemo(() => {
    if (!invite) return false;
    if (!primaryName.trim()) return false;
    if (!attending) return true;
    if (extraCount < 0 || extraCount > maxExtra) return false;
    if (extraCount > 0 && extraNames.some((n) => !n.trim())) return false;
    return true;
  }, [invite, primaryName, attending, extraCount, extraNames, maxExtra]);

  async function onSubmit() {
    if (!invite) return;
    setErr(null);

    try {
      await submitRSVP({
        inviteId: invite.id,
        primaryName: primaryName.trim(),
        attending,
        extraGuestNames: attending ? extraNames.map((n) => n.trim()).filter(Boolean) : [],
        notes: notes.trim() || undefined
      });
      setDone(true);
    } catch (e: any) {
      setErr(e.message || "Could not submit RSVP.");
    }
  }

  if (loading) {
    return (
      <div className="container">
        <div className="card">Loading…</div>
      </div>
    );
  }

  if (err || !invite) {
    return (
      <div className="container">
        <div className="card">
          <div className="error">{err || "Invite not found."}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div className="hero" variants={item}>
          <div className="kicker">Invitation</div>
          <div className="names">Sarah &amp; Michael</div>
          <p className="date">Saturday, June 14th, 2025</p>
          <div className="rule" />
        </motion.div>

        <motion.div className="card" variants={item}>
          <div className="pill">
            <span>Invite for:</span> <strong>{invite.displayName}</strong>
          </div>

          <div className="pill" style={{ marginLeft: 10 }}>
            <span>Extra guests allowed:</span> <strong>{invite.allowedGuests}</strong>
          </div>

          {invite.message ? (
            <>
              <div className="hr" />
              <div className="small" style={{ textAlign: "left" }}>
                {invite.message}
              </div>
            </>
          ) : null}

          <div className="hr" />

          {done ? (
            <div className="success">
              RSVP received. Thank you! ❤️
            </div>
          ) : (
            <>
              <div className="label">Your name</div>
              <input
                className="input"
                value={primaryName}
                onChange={(e) => setPrimaryName(e.target.value)}
                placeholder="Your full name"
              />

              <div className="hr" />

              <div className="label">Will you be attending?</div>
              <div style={{ display: "flex", gap: 12 }}>
                <button
                  className="iconBtn"
                  onClick={() => setAttending(true)}
                  aria-pressed={attending}
                >
                  ✅ Accept
                </button>
                <button
                  className="iconBtn"
                  onClick={() => setAttending(false)}
                  aria-pressed={!attending}
                >
                  ❌ Decline
                </button>
              </div>

              {attending && (
                <>
                  <div className="hr" />
                  <div className="label">How many additional guests will you bring?</div>
                  <div className="row">
                    <input
                      className="input"
                      type="number"
                      min={0}
                      max={maxExtra}
                      value={extraCount}
                      onChange={(e) => setExtraCount(Number(e.target.value))}
                    />
                    <div className="pill" style={{ justifyContent: "center" }}>
                      Max {maxExtra}
                    </div>
                  </div>

                  {extraCount > 0 && (
                    <>
                      <div className="hr" />
                      <div className="label">Additional guest names</div>
                      <div style={{ display: "grid", gap: 10 }}>
                        {extraNames.map((val, idx) => (
                          <input
                            key={idx}
                            className="input"
                            placeholder={`Guest ${idx + 1} full name`}
                            value={val}
                            onChange={(e) => {
                              const next = [...extraNames];
                              next[idx] = e.target.value;
                              setExtraNames(next);
                            }}
                          />
                        ))}
                      </div>
                    </>
                  )}

                  <div className="hr" />
                  <div className="label">Notes (optional)</div>
                  <input
                    className="input"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Dietary notes, questions, etc."
                  />
                </>
              )}

              {err && <div className="error">{err}</div>}

              <button className="btn" onClick={onSubmit} disabled={!canSubmit}>
                Submit RSVP
              </button>

              <div className="small">
                This site is only used to collect RSVPs.
              </div>
            </>
          )}
        </motion.div>

        <motion.div className="footer" variants={item}>
          Need help? Contact <span className="accent">wedding@example.com</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
