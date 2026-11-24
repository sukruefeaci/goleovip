import { cookies } from "next/headers";
import { authSecret, SESSION_COOKIE, verifySession, type Session } from "./session";

export async function currentUser(): Promise<Session | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token, authSecret());
}
