import { createServerFn } from "@tanstack/react-start";

function usernameToEmail(username: string) {
  return `${username.toLowerCase()}@metertrack.local`;
}

function validateUsername(username: string) {
  const normalized = username.trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,64}$/.test(normalized)) {
    throw new Error("Use 3-64 letters, numbers, dots, hyphens, or underscores for the username.");
  }
  return normalized;
}

/** This endpoint closes permanently after it creates the first Auth user. */
export const createInitialAccount = createServerFn({ method: "POST" })
  .inputValidator((input: { username: string; password: string }) => input)
  .handler(async ({ data }) => {
    const username = validateUsername(data.username);
    if (data.password.length < 6) throw new Error("Use a password of at least 6 characters.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: users, error: listError } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1 });
    if (listError) throw new Error(listError.message);
    if (users.users.length > 0) throw new Error("The initial account has already been created. Sign in instead.");

    const { error } = await supabaseAdmin.auth.admin.createUser({
      email: usernameToEmail(username),
      password: data.password,
      email_confirm: true,
      user_metadata: { username },
    });
    if (error) throw new Error(error.message);
    return { username };
  });
