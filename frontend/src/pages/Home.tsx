import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { container, item } from "../lib/motion";
import { findInviteByName } from "../lib/api";

export default function Home() {
  const nav = useNavigate();
  const [name, setName] = useState("");
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  async function onFind() {
    setErr(null);
    const trimmed = name.trim();
    if (!trimmed) return;

    try {
      setLoading(true);
      const res = await findInviteByName(trimmed);
      nav(`/invite/${res.invite.id}`);
    } catch (e: any) {
      setErr(e.message || "Could not find invite.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container">
      <motion.div variants={container} initial="hidden" animate="show">
        <motion.div className="hero" variants={item}>
          <div className="kicker">Together with their families</div>
          <div className="names">Sarah &amp; Michael</div>
          <p className="date">Saturday, June 14th, 2025</p>
          <div className="rule" />
        </motion.div>

        <motion.div className="card" variants={item}>
          <div className="label">Enter your name as it appears on your invitation</div>
          <input
            className="input"
            placeholder="e.g., John Smith"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onFind()}
          />
          <button className="btn" onClick={onFind} disabled={loading}>
            {loading ? "Searching..." : "Find my invitation"}
          </button>

          {err && <div className="error">{err}</div>}

          <div className="small">
            Tip: Type the exact spacing/spelling from your invite. <br />
            If you have a link from us, you can open it directly.
          </div>
        </motion.div>

        <motion.div className="footer" variants={item}>
          Questions? Contact us at <span className="accent">wedding@example.com</span>
        </motion.div>
      </motion.div>
    </div>
  );
}
