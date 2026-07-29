import { supabase } from "./supabase";

export type SiteRole = "site_admin" | "moderator" | "user";

export interface SiteAdminContext {
  role: SiteRole;
  userId: string;
  email: string;
}

export interface ManagedUser {
  id: string;
  displayName: string;
  email: string;
  role: SiteRole;
  createdAt: string;
  lastSignInAt: string | null;
  emailConfirmed: boolean;
  suspended: boolean;
  suspensionReason: string | null;
  suspendedUntil: string | null;
}

export interface AdminAuditLog {
  id: string;
  admin_user_id: string | null;
  target_user_id: string | null;
  action: string;
  before_value: Record<string, unknown> | null;
  after_value: Record<string, unknown> | null;
  reason: string | null;
  created_at: string;
}

interface UserPage {
  users: ManagedUser[];
  page: number;
  perPage: number;
  total: number;
}

interface AuditPage {
  logs: AdminAuditLog[];
  page: number;
  perPage: number;
  total: number;
}

async function invokeSiteAdmin<T>(body: Record<string, unknown>): Promise<T> {
  if (!supabase) throw new Error("サイト管理機能を利用できません。");
  const { data, error } = await supabase.functions.invoke("site-admin", {
    body,
  });
  if (error) {
    let message = "";
    const context = (error as { context?: unknown }).context;
    if (context instanceof Response) {
      const responseBody = (await context.clone().json().catch(() => null)) as {
        error?: unknown;
      } | null;
      if (typeof responseBody?.error === "string") message = responseBody.error;
    }
    throw new Error(
      message ||
        "管理操作を完了できませんでした。時間を空けてもう一度お試しください。",
      { cause: error },
    );
  }
  return data as T;
}

export function getSiteAdminContext() {
  return invokeSiteAdmin<SiteAdminContext>({ action: "me" });
}

export function loadManagedUsers(input: {
  page: number;
  perPage?: number;
  search?: string;
  sort?: "newest" | "oldest";
}) {
  return invokeSiteAdmin<UserPage>({
    action: "list_users",
    page: input.page,
    perPage: input.perPage ?? 20,
    search: input.search ?? "",
    sort: input.sort ?? "newest",
  });
}

export function loadAdminAuditLogs(page: number, perPage = 20) {
  return invokeSiteAdmin<AuditPage>({
    action: "list_audit_logs",
    page,
    perPage,
  });
}

export function changeSiteRole(
  targetUserId: string,
  role: SiteRole,
  confirmation?: string,
) {
  return invokeSiteAdmin<{ updated: true; role: SiteRole }>({
    action: "change_role",
    targetUserId,
    role,
    confirmation: confirmation ?? "",
  });
}

export function suspendManagedUser(
  targetUserId: string,
  reason: string,
  suspendedUntil: string | null,
) {
  return invokeSiteAdmin<{ suspended: true }>({
    action: "suspend_user",
    targetUserId,
    reason,
    suspendedUntil,
  });
}

export function reactivateManagedUser(targetUserId: string, reason: string) {
  return invokeSiteAdmin<{ suspended: false }>({
    action: "reactivate_user",
    targetUserId,
    reason,
  });
}

export function deleteManagedUser(
  targetUserId: string,
  confirmation: string,
  reason: string,
) {
  return invokeSiteAdmin<{ deleted: true }>({
    action: "delete_user",
    targetUserId,
    confirmation,
    reason,
  });
}
