import { createContext, useContext, useEffect, useState, useCallback, type ReactNode } from "react";
import { ClerkProvider, useAuth as useClerkAuth, useClerk, useUser as useClerkUser } from "@clerk/clerk-react";
import { useNavigate } from "@tanstack/react-router";

export type AppRole = "super_admin" | "ceo" | "finance" | "hr" | "manager" | "employee";

const DEMO_ROLE_KEY = "alyson-demo-role";
const SUPER_ADMIN_UNLOCK_KEY = "alyson-super-admin-unlocked";
const SUPER_ADMIN_CODE = "75391";

type AppSession = { userId: string } | null;
type AppUser = { id: string; email: string | null } | null;

type AuthContextValue = {
  session: AppSession;
  user: AppUser;
  realRoles: AppRole[];
  /** Demo override role (single role) — used by the demo role switcher */
  demoRole: AppRole | null;
  setDemoRole: (role: AppRole | null) => void;
  superAdminUnlocked: boolean;
  tryUnlockSuperAdmin: (code: string) => boolean;
  lockSuperAdmin: () => void;
  /** Effective roles after demo override */
  roles: AppRole[];
  /** Highest-priority role (for landing routing) */
  primaryRole: AppRole;
  loading: boolean;
  signOut: () => Promise<void>;
  hasRole: (role: AppRole) => boolean;
  hasAnyRole: (roles: AppRole[]) => boolean;
};

const AuthContext = createContext<AuthContextValue | null>(null);

const ROLE_PRIORITY: AppRole[] = ["super_admin", "ceo", "finance", "hr", "manager", "employee"];

function pickPrimary(roles: AppRole[]): AppRole {
  for (const r of ROLE_PRIORITY) if (roles.includes(r)) return r;
  return "employee";
}

function AuthInner({ children }: { children: ReactNode }) {
  const clerkAuth = useClerkAuth();
  const clerkUser = useClerkUser();
  const clerk = useClerk();

  const [realRoles, setRealRoles] = useState<AppRole[]>([]);
  const [demoRole, setDemoRoleState] = useState<AppRole | null>(null);
  const [superAdminUnlocked, setSuperAdminUnlocked] = useState(false);

  // Load demo role from storage
  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = localStorage.getItem(DEMO_ROLE_KEY) as AppRole | null;
    if (stored) setDemoRoleState(stored);
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = sessionStorage.getItem(SUPER_ADMIN_UNLOCK_KEY);
    setSuperAdminUnlocked(stored === "1");
  }, []);

  const setDemoRole = useCallback((role: AppRole | null) => {
    setDemoRoleState(role);
    if (role) localStorage.setItem(DEMO_ROLE_KEY, role);
    else localStorage.removeItem(DEMO_ROLE_KEY);
  }, []);

  const tryUnlockSuperAdmin = useCallback((code: string) => {
    if (code.trim() !== SUPER_ADMIN_CODE) return false;
    setSuperAdminUnlocked(true);
    if (typeof window !== "undefined") sessionStorage.setItem(SUPER_ADMIN_UNLOCK_KEY, "1");
    return true;
  }, []);

  const lockSuperAdmin = useCallback(() => {
    setSuperAdminUnlocked(false);
    if (typeof window !== "undefined") sessionStorage.removeItem(SUPER_ADMIN_UNLOCK_KEY);
  }, []);

  useEffect(() => {
    // Roles come from Clerk user metadata (or demo override).
    // Expected shape: user.publicMetadata.roles = ["hr", "finance", ...]
    if (!clerkUser.isLoaded) return;
    if (!clerkUser.user) {
      setRealRoles([]);
      return;
    }
    const raw = (clerkUser.user.publicMetadata as { roles?: unknown }).roles;
    const next =
      Array.isArray(raw) ? raw.filter((r): r is AppRole => typeof r === "string" && (ROLE_PRIORITY as string[]).includes(r)) : [];
    setRealRoles(next);
  }, [clerkUser.isLoaded, clerkUser.user]);

  const rawRoles = demoRole ? [demoRole] : realRoles.length > 0 ? realRoles : (["employee"] as AppRole[]);
  const roles = superAdminUnlocked ? rawRoles : rawRoles.filter((r) => r !== "super_admin");
  const primaryRole = pickPrimary(roles);

  const signOut = useCallback(async () => {
    await clerk.signOut();
    setDemoRole(null);
    lockSuperAdmin();
  }, [clerk, setDemoRole, lockSuperAdmin]);

  const hasRole = useCallback((r: AppRole) => roles.includes(r), [roles]);
  const hasAnyRole = useCallback((rs: AppRole[]) => rs.some((r) => roles.includes(r)), [roles]);

  const session: AppSession = clerkAuth.isSignedIn && clerkAuth.userId ? { userId: clerkAuth.userId } : null;
  const user: AppUser = clerkUser.user
    ? { id: clerkUser.user.id, email: clerkUser.user.primaryEmailAddress?.emailAddress ?? null }
    : null;

  return (
    <AuthContext.Provider
      value={{
        session,
        user,
        realRoles,
        demoRole,
        setDemoRole,
        superAdminUnlocked,
        tryUnlockSuperAdmin,
        lockSuperAdmin,
        roles,
        primaryRole,
        loading: !clerkAuth.isLoaded || !clerkUser.isLoaded,
        signOut,
        hasRole,
        hasAnyRole,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const navigate = useNavigate();
  const publishableKey = import.meta.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY as string | undefined;
  if (!publishableKey) {
    throw new Error("Missing NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY. Add it to .env and restart the dev server.");
  }

  return (
    <ClerkProvider
      publishableKey={publishableKey}
      // Prevent full-page navigations during auth flows
      navigate={(to) => navigate({ to: to as any })}
    >
      <AuthInner>{children}</AuthInner>
    </ClerkProvider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}

export const ROLE_LABEL: Record<AppRole, string> = {
  super_admin: "Super Admin",
  ceo: "CEO",
  finance: "Finance",
  hr: "HR",
  manager: "Manager",
  employee: "Employee",
};
