import { Loader2, Shield } from "lucide-react";
import { useSuperAccess } from "@/lib/super-access-rbac-hooks";
import { isSuperAccessEmail } from "@/lib/super-access-constants";
import { useAuth } from "@/lib/auth";

export function SuperAccessGate({
  children,
  moduleLabel,
}: {
  children: React.ReactNode;
  moduleLabel: string;
}) {
  const { user } = useAuth();
  const accessQ = useSuperAccess();
  const allowed = accessQ.data?.allowed === true || isSuperAccessEmail(user?.email);

  if (accessQ.isLoading) {
    return (
      <div className="app-page-gutter py-16 flex justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="app-page-gutter py-10">
        <div className="surface-card p-10 text-center">
          <div className="mx-auto h-10 w-10 rounded-full bg-muted grid place-items-center text-muted-foreground mb-3">
            <Shield className="h-5 w-5" />
          </div>
          <div className="font-medium text-[15px]">Super access required</div>
          <div className="text-[13px] text-muted-foreground mt-1 max-w-md mx-auto">
            {moduleLabel} is restricted to privileged users only. Contact an admin if you need access.
          </div>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
