import { cookies } from "next/headers";

const COOKIE_NAME = "tpmt_admin_session";

export async function isAdminAuthenticated() {
  const cookieStore = await cookies();
  const token = cookieStore.get(COOKIE_NAME);
  return !!token?.value;
}
