const GRAPH_VERSION = "v25.0";

export async function POST(request) {
  try {
    const { token } = await request.json();
    if (!token) {
      return Response.json({ error: "token required" }, { status: 400 });
    }
    const url = new URL(`https://graph.facebook.com/${GRAPH_VERSION}/me`);
    url.searchParams.set("access_token", token);
    url.searchParams.set("fields", "id,name,picture");
    const res = await fetch(url.toString());
    const data = await res.json();
    if (data.error) {
      return Response.json({ error: data.error.message }, { status: 400 });
    }
    return Response.json({ user: data });
  } catch (e) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}
