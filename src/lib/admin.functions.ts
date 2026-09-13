import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type Role = "admin" | "standard";

function usernameToEmail(username: string) {
  const normalized = username.trim().toLowerCase().replace(/[^a-z0-9._-]/g, "");
  return `${normalized || "user"}@metertrack.local`;
}

async function assertAdmin(context: { supabase: { rpc: (fn: string, args: Record<string, unknown>) => PromiseLike<{ data: unknown }> }; userId: string }) {
  const { data } = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
  if (data !== true) throw new Error("Administrator permission required");
}

export const createUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { username: string; password: string; role: Role; assignedDcuId: string | null }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (!data.username.trim()) throw new Error("Enter a user name");
    if (data.password.length < 6) throw new Error("Use a password of at least 6 characters");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(data.username),
      password: data.password,
      email_confirm: true,
      user_metadata: {
        username: data.username.trim(),
        role: data.role,
        assigned_dcu_id: data.assignedDcuId ?? "",
      },
    });
    if (error || !created.user) throw new Error(error?.message ?? "That user could not be created");

    // The signup trigger only makes the very first account an administrator.
    await supabaseAdmin.from("user_roles").delete().eq("user_id", created.user.id);
    await supabaseAdmin.from("user_roles").insert({ user_id: created.user.id, role: data.role });
    await supabaseAdmin
      .from("profiles")
      .update({ username: data.username.trim(), assigned_dcu_id: data.role === "standard" ? data.assignedDcuId : null })
      .eq("id", created.user.id);

    return { id: created.user.id };
  });

export const deleteUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { userId: string }) => input)
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.userId === (context as { userId: string }).userId) throw new Error("You cannot delete your own account");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.auth.admin.deleteUser(data.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updateUserAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (input: { userId: string; password?: string; role?: Role; assignedDcuId?: string | null; enabled?: boolean }) => input,
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.password) {
      if (data.password.length < 6) throw new Error("Use a password of at least 6 characters");
      const { error } = await supabaseAdmin.auth.admin.updateUserById(data.userId, { password: data.password });
      if (error) throw new Error(error.message);
    }

    if (data.role) {
      await supabaseAdmin.from("user_roles").delete().eq("user_id", data.userId);
      const { error } = await supabaseAdmin.from("user_roles").insert({ user_id: data.userId, role: data.role });
      if (error) throw new Error(error.message);
    }

    const profileUpdate: Record<string, unknown> = {};
    if (data.assignedDcuId !== undefined) profileUpdate['assigned_dcu_id'] = data.assignedDcuId;
    if (data.role === "admin") profileUpdate['assigned_dcu_id'] = null;
    if (data.enabled !== undefined) profileUpdate['enabled'] = data.enabled;
    if (Object.keys(profileUpdate).length) {
      const { error } = await supabaseAdmin.from("profiles").update(profileUpdate).eq("id", data.userId);
      if (error) throw new Error(error.message);
    }

    return { ok: true };
  });
