import { redirect } from "next/navigation";

import { getPageSessionUser } from "@/lib/auth/session";

export default async function HomePage() {
  const user = await getPageSessionUser();

  if (user) {
    redirect("/dashboard");
  }

  redirect("/login");
}
