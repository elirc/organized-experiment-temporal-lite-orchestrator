import { AppShell } from "@/components/app-shell";
import { requirePageUser } from "@/lib/auth/page-auth";

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const user = await requirePageUser();

  return (
    <AppShell
      user={{
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      }}
    >
      {children}
    </AppShell>
  );
}
