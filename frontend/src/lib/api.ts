const API_BASE = import.meta.env.VITE_API_BASE as string;

async function jsonFetch<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: {
      "Content-Type": "application/json",
      ...(options?.headers || {})
    },
    ...options
  });

  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    throw new Error(data?.error || `Request failed: ${res.status}`);
  }
  return data as T;
}

export type Invite = {
  id: string;
  displayName: string;
  allowedGuests: number; // extra guests they can bring
  message?: string | null;
};

export async function findInviteByName(name: string) {
  return jsonFetch<{ invite: Invite }>(`/public/find`, {
    method: "POST",
    body: JSON.stringify({ name })
  });
}

export async function getInvite(id: string) {
  return jsonFetch<{ invite: Invite }>(`/public/invite?id=${encodeURIComponent(id)}`);
}

export async function submitRSVP(payload: {
  inviteId: string;
  primaryName: string;
  attending: boolean;
  extraGuestNames: string[];
  notes?: string;
}) {
  return jsonFetch<{ ok: true }>(`/public/rsvp`, {
    method: "POST",
    body: JSON.stringify(payload)
  });
}

export async function adminLogin(password: string) {
  return jsonFetch<{ token: string }>(`/admin/login`, {
    method: "POST",
    body: JSON.stringify({ password })
  });
}

export async function adminListInvites(token: string) {
  return jsonFetch<{
    invites: Array<Invite & { rsvpAttending?: number | null; rsvpUpdatedAt?: string | null }>;
  }>(`/admin/invites`, {
    headers: { Authorization: `Bearer ${token}` }
  });
}

export async function adminCreateInvite(
  token: string,
  payload: { displayName: string; allowedGuests: number; message?: string }
) {
  return jsonFetch<{ invite: Invite }>(`/admin/invites`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}` },
    body: JSON.stringify(payload)
  });
}

export async function adminDeleteInvite(token: string, id: string) {
  return jsonFetch<{ ok: true }>(`/admin/invites?id=${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` }
  });
}
