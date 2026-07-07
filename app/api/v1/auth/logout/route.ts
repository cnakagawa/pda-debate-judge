import { getSession } from "@/src/lib/session";
import { handler, ok } from "@/src/lib/api";

export const POST = handler(async () => {
  const session = await getSession();
  session.destroy();
  return ok({ loggedOut: true });
});
