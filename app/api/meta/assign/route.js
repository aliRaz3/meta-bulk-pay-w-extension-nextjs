const GRAPH_VERSION = "v25.0";

const RETRYABLE_HTTP_STATUSES = new Set([429, 500, 502, 503, 504]);

async function fetchWithRetry(url, options, retries = 3) {
  let delay = 600;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, options);
      if (RETRYABLE_HTTP_STATUSES.has(response.status) && attempt < retries) {
        await new Promise((r) => setTimeout(r, delay));
        delay *= 2;
        continue;
      }
      return response;
    } catch (error) {
      const msg = String(error.message || "");
      const isRetryable = error instanceof TypeError || /failed to fetch|networkerror/i.test(msg);
      if (!isRetryable || attempt >= retries) throw error;
      await new Promise((r) => setTimeout(r, delay));
      delay *= 2;
    }
  }
  throw new Error("Unexpected retry state");
}

export async function POST(request) {
  try {
    const { token, adAccountId, businessId, selectedUserId } = await request.json();

    if (!token || !adAccountId || !businessId || !selectedUserId) {
      return Response.json(
        { error: "token, adAccountId, businessId, selectedUserId required" },
        { status: 400 }
      );
    }

    const assignEndpoint = `https://graph.facebook.com/${GRAPH_VERSION}/${adAccountId}/assigned_users`;
    const assignPayload = {
      user: selectedUserId,
      tasks: ["MANAGE", "ADVERTISE", "ANALYZE"],
      business: businessId,
      access_token: token,
    };

    const assignResponse = await fetchWithRetry(assignEndpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(assignPayload),
    });

    if (!assignResponse.ok) {
      let assignJsonResponse = null;
      try { assignJsonResponse = await assignResponse.json(); } catch { }
      throw new Error(
        `Failed to assign: HTTP ${assignResponse.status} (${assignJsonResponse?.error?.code ?? "unknown"}): ${assignJsonResponse?.error?.message || "Unknown error"}`
      );
    }

    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
