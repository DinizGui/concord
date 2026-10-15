import type { User } from "@prisma/client";
import type { NextRequest } from "next/server";
import { appUrl, sendMail, verifyEmail } from "./mail";
import { createAuthToken } from "./tokens";

export async function sendVerification(req: NextRequest, user: User) {
  const token = await createAuthToken(user.id, "verify");
  const mail = verifyEmail(`${appUrl(req)}/verify?token=${token}`, user.globalName || user.username);
  return sendMail(user.email, mail.subject, mail.html, mail.text);
}
