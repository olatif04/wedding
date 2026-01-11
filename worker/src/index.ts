export interface Env {
  DB: D1Database;

  SITE_ORIGIN: string;
  RSVP_TO_EMAIL: string;
  RSVP_FROM_EMAIL: string;

  // secrets
  ADMIN_PASSWORD_SALT: string;
  ADMIN_PASSWORD_HASH: string;
  JWT_SECRET: string;
  RESEND_API_KEY: string;
}

/** ---------- helpers ---------- **/

function corsHeaders(origin: string) {
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization"
  };
}

function json(data: unknown, init?: ResponseInit) {
  return new Response(JSON.stringify(data), {
    headers: { "Content-Type": "application/json", ...(init?.headers || {}) },
    status: init?.status || 200
  });
}

function normalizeName(input: string) {
  return input
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s]/gu, "")
    .replace(/\s+/g, " ");
}

function uuid() {
  // simple unique id
  return crypto.randomUUID();
}

async function sha256Hex(input: string) {
  const enc = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a: string, b: string) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i++) out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return out === 0;
}

/** Minimal JWT (HMAC SHA-256) */
function b64url(bytes: Uint8Array) {
  return btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replaceAll("=", "");
}
function b64urlJson(obj: any) {
  const s = JSON.stringify(obj);
  return b64url(new TextEncoder().encode(s));
}
async function hmacSha256(secret: string, data: string) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(data));
  return new Uint8Array(sig);
}
async function signJWT(secret: string, payload: any, expiresSeconds: number) {
  const header = { alg: "HS256", typ: "JWT" };
  const now = Math.floor(Date.now() / 1000);
  const fullPayload = { ...payload, iat: now, exp: now + expiresSeconds };
  const part1 = b64urlJson(header);
  const part2 = b64urlJson(fullPayload);
  const toSign = `${part1}.${part2}`;
  const sig = await hmacSha256(secret, toSign);
  return `${toSign}.${b64url(sig)}`;
}
async function verifyJWT(secret: string, token: string) {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const [p1, p2, sig] = parts;
  const toVerify = `${p1}.${p2}`;
  const expected = b64url(await hmacSha256(secret, toVerify));
  if (!timingSafeEqual(expected, sig)) return null;

  const payload = JSON.parse(
    new TextDecoder().decode(
      Uint8Array.from(atob(p2.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.charCodeAt(0))
    )
  );
  const now = Math.floor(Date.now() / 1000);
  if (typeof payload.exp !== "number" || payload.exp < now) return null;
  return payload;
}

function getBearer(req: Request) {
  const h = req.headers.get("Authorization") || "";
  const m = h.match(/^Bearer\s+(.+)$/i);
  return m ? m[1] : null;
}

/** ---------- email (Resend) ---------- **/
async function sendResend(env: Env, subject: string, text: string, html?: string) {
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: env.RSVP_FROM_EMAIL,
      to: [env.RSVP_TO_EMAIL],
      subject,
      text,
      html
    })
  });

  if (!res.ok) {
    const msg = await res.text();
    throw new Error(`Email failed: ${res.status} ${msg}`);
  }
}

/** ---------- routes ---------- **/
export default {
  async fetch(req: Request, env: Env, ctx: ExecutionContext) {
    const origin = req.headers.get("Origin");
    const allowedOrigin = origin && origin === env.SITE_ORIGIN ? origin : env.SITE_ORIGIN;

    if (req.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(allowedOrigin) });
    }

    const url = new URL(req.url);
    const path = url.pathname;

    // Attach CORS to all JSON responses
    const withCors = (resp: Response) => {
      const h = new Headers(resp.headers);
      const cors = corsHeaders(allowedOrigin);
      Object.entries(cors).forEach(([k, v]) => h.set(k, v));
      return new Response(resp.body, { status: resp.status, headers: h });
    };

    try {
      /** -------- public -------- **/

      // POST /public/find {name}
      if (req.method === "POST" && path === "/public/find") {
        const body = await req.json<any>();
        const name = String(body?.name || "");
        const norm = normalizeName(name);
        if (!norm) return withCors(json({ error: "Name is required." }, { status: 400 }));

        const row = await env.DB.prepare(
          "SELECT id, display_name, allowed_guests, message FROM invites WHERE norm_name = ? LIMIT 1"
        )
          .bind(norm)
          .first();

        if (!row) return withCors(json({ error: "Invite not found. Please check spelling." }, { status: 404 }));

        return withCors(
          json({
            invite: {
              id: row.id,
              displayName: row.display_name,
              allowedGuests: row.allowed_guests,
              message: row.message
            }
          })
        );
      }

      // GET /public/invite?id=...
      if (req.method === "GET" && path === "/public/invite") {
        const id = url.searchParams.get("id");
        if (!id) return withCors(json({ error: "Missing id" }, { status: 400 }));

        const row = await env.DB.prepare(
          "SELECT id, display_name, allowed_guests, message FROM invites WHERE id = ? LIMIT 1"
        )
          .bind(id)
          .first();

        if (!row) return withCors(json({ error: "Invite not found." }, { status: 404 }));

        return withCors(
          json({
            invite: {
              id: row.id,
              displayName: row.display_name,
              allowedGuests: row.allowed_guests,
              message: row.message
            }
          })
        );
      }

      // POST /public/rsvp
      if (req.method === "POST" && path === "/public/rsvp") {
        const body = await req.json<any>();
        const inviteId = String(body?.inviteId || "");
        const primaryName = String(body?.primaryName || "").trim();
        const attending = Boolean(body?.attending);
        const extraGuestNames = Array.isArray(body?.extraGuestNames) ? body.extraGuestNames.map((x: any) => String(x || "").trim()).filter(Boolean) : [];
        const notes = String(body?.notes || "").trim() || null;

        if (!inviteId || !primaryName) {
          return withCors(json({ error: "Missing required fields." }, { status: 400 }));
        }

        const inv = await env.DB.prepare("SELECT display_name, allowed_guests FROM invites WHERE id = ? LIMIT 1")
          .bind(inviteId)
          .first();

        if (!inv) return withCors(json({ error: "Invite not found." }, { status: 404 }));

        if (attending && extraGuestNames.length > inv.allowed_guests) {
          return withCors(json({ error: `This invite allows up to ${inv.allowed_guests} additional guest(s).` }, { status: 400 }));
        }

        const ip = req.headers.get("CF-Connecting-IP") || null;
        const submittedAt = new Date().toISOString();
        const attendingCount = attending ? (1 + extraGuestNames.length) : 0;

        await env.DB.prepare(
          `INSERT INTO rsvps (invite_id, primary_name, attending, extra_guest_names, notes, submitted_at, ip)
           VALUES (?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT(invite_id) DO UPDATE SET
            primary_name=excluded.primary_name,
            attending=excluded.attending,
            extra_guest_names=excluded.extra_guest_names,
            notes=excluded.notes,
            submitted_at=excluded.submitted_at,
            ip=excluded.ip`
        )
          .bind(inviteId, primaryName, attending ? 1 : 0, JSON.stringify(extraGuestNames), notes, submittedAt, ip)
          .run();

        const subject = `RSVP: ${inv.display_name} — ${attending ? "Attending" : "Declined"}`;

        const textLines = [
          `Invite: ${inv.display_name}`,
          `Response: ${attending ? "Attending" : "Declined"}`,
          `Total attending (including invitee): ${attendingCount}`,
          `Primary name: ${primaryName}`,
          attending ? `Additional guests: ${extraGuestNames.length}` : `Additional guests: 0`,
          attending && extraGuestNames.length ? `Guest names: ${extraGuestNames.join(", ")}` : `Guest names: —`,
          notes ? `Notes: ${notes}` : `Notes: —`,
          `Submitted: ${submittedAt}`,
          ip ? `IP: ${ip}` : `IP: —`
        ];

        const html = `
          <div style="font-family: Arial, sans-serif; line-height: 1.5;">
            <h2 style="margin:0 0 10px;">RSVP Received</h2>
            <p><strong>Invite:</strong> ${escapeHtml(inv.display_name)}</p>
            <p><strong>Response:</strong> ${attending ? "Attending ✅" : "Declined ❌"}</p>
            <p><strong>Total attending:</strong> ${attendingCount}</p>
            <p><strong>Primary name:</strong> ${escapeHtml(primaryName)}</p>
            <p><strong>Additional guest names:</strong> ${attending && extraGuestNames.length ? escapeHtml(extraGuestNames.join(", ")) : "—"}</p>
            <p><strong>Notes:</strong> ${notes ? escapeHtml(notes) : "—"}</p>
            <p style="color:#666;font-size:12px;margin-top:16px;">
              Submitted: ${escapeHtml(submittedAt)} ${ip ? `• IP: ${escapeHtml(ip)}` : ""}
            </p>
          </div>
        `;

        // Send email async
        ctx.waitUntil(sendResend(env, subject, textLines.join("\n"), html));

        return withCors(json({ ok: true }));
      }

      /** -------- admin -------- **/

      // POST /admin/login {password}
      if (req.method === "POST" && path === "/admin/login") {
        const body = await req.json<any>();
        const password = String(body?.password || "");
        if (!password) return withCors(json({ error: "Password required." }, { status: 400 }));

        const computed = await sha256Hex(env.ADMIN_PASSWORD_SALT + password);
        if (!timingSafeEqual(computed, env.ADMIN_PASSWORD_HASH)) {
          return withCors(json({ error: "Invalid password." }, { status: 401 }));
        }

        const token = await signJWT(env.JWT_SECRET, { role: "admin" }, 60 * 60 * 6); // 6 hours
        return withCors(json({ token }));
      }

      // Auth middleware
      const requireAdmin = async () => {
        const tok = getBearer(req);
        if (!tok) return null;
        const payload = await verifyJWT(env.JWT_SECRET, tok);
        if (!payload || payload.role !== "admin") return null;
        return payload;
      };

      // GET /admin/invites
      if (req.method === "GET" && path === "/admin/invites") {
        const admin = await requireAdmin();
        if (!admin) return withCors(json({ error: "Unauthorized" }, { status: 401 }));

        const rows = await env.DB.prepare(
          `SELECT i.id, i.display_name, i.allowed_guests, i.message,
                  r.attending as rsvp_attending, r.submitted_at as rsvp_updated_at
           FROM invites i
           LEFT JOIN rsvps r ON r.invite_id = i.id
           ORDER BY i.created_at DESC`
        ).all();

        const invites = (rows.results || []).map((r: any) => ({
          id: r.id,
          displayName: r.display_name,
          allowedGuests: r.allowed_guests,
          message: r.message,
          rsvpAttending: r.rsvp_attending == null ? null : (r.rsvp_attending ? 1 : 0),
          rsvpUpdatedAt: r.rsvp_updated_at || null
        }));

        return withCors(json({ invites }));
      }

      // POST /admin/invites
      if (req.method === "POST" && path === "/admin/invites") {
        const admin = await requireAdmin();
        if (!admin) return withCors(json({ error: "Unauthorized" }, { status: 401 }));

        const body = await req.json<any>();
        const displayName = String(body?.displayName || "").trim();
        const allowedGuests = Number(body?.allowedGuests ?? 0);
        const message = body?.message != null ? String(body.message).trim() : null;

        if (!displayName) return withCors(json({ error: "displayName required" }, { status: 400 }));
        if (!Number.isInteger(allowedGuests) || allowedGuests < 0 || allowedGuests > 10) {
          return withCors(json({ error: "allowedGuests must be an integer between 0 and 10." }, { status: 400 }));
        }

        const id = uuid();
        const createdAt = new Date().toISOString();
        const norm = normalizeName(displayName);

        await env.DB.prepare(
          `INSERT INTO invites (id, display_name, norm_name, allowed_guests, message, created_at)
           VALUES (?, ?, ?, ?, ?, ?)`
        )
          .bind(id, displayName, norm, allowedGuests, message, createdAt)
          .run();

        return withCors(json({ invite: { id, displayName, allowedGuests, message } }));
      }

      // DELETE /admin/invites?id=...
      if (req.method === "DELETE" && path === "/admin/invites") {
        const admin = await requireAdmin();
        if (!admin) return withCors(json({ error: "Unauthorized" }, { status: 401 }));

        const id = url.searchParams.get("id");
        if (!id) return withCors(json({ error: "Missing id" }, { status: 400 }));

        await env.DB.prepare("DELETE FROM invites WHERE id = ?").bind(id).run();
        await env.DB.prepare("DELETE FROM rsvps WHERE invite_id = ?").bind(id).run();

        return withCors(json({ ok: true }));
      }

      return withCors(json({ error: "Not found" }, { status: 404 }));
    } catch (e: any) {
      return new Response(
        JSON.stringify({ error: e?.message || "Server error" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            ...corsHeaders(env.SITE_ORIGIN)
          }
        }
      );
    }
  }
};

function escapeHtml(s: string) {
  return s
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
