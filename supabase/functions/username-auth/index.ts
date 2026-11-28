import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!supabaseUrl || !anonKey || !serviceRoleKey) {
  throw new Error("Missing required Supabase environment variables.");
}

const adminClient = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const authClient = createClient(supabaseUrl, anonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeUsername(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const username = value.trim().toLowerCase();
  return /^[a-z0-9_]{3,24}$/.test(username) ? username : null;
}

function validPassword(value: unknown): value is string {
  return typeof value === "string" && value.length >= 8 && value.length <= 128;
}

function sessionResponse(session: { access_token: string; refresh_token: string } | null): Response {
  if (!session) return jsonResponse({ error: "Không tạo được phiên đăng nhập." }, 500);
  return jsonResponse({
    session: {
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    },
  });
}

async function register(username: string, password: string): Promise<Response> {
  const { data: existing, error: lookupError } = await adminClient
    .from("username_accounts")
    .select("user_id")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error("Username lookup failed:", lookupError);
    return jsonResponse({ error: "Không thể kiểm tra tên đăng nhập." }, 500);
  }
  if (existing) return jsonResponse({ error: "Tên đăng nhập đã được sử dụng." }, 409);

  const authEmail = `${username}@username-auth.invalid`;
  const { data: created, error: createError } = await adminClient.auth.admin.createUser({
    email: authEmail,
    password,
    email_confirm: true,
    user_metadata: { username },
  });

  if (createError || !created.user) {
    console.error("Auth user creation failed:", createError);
    if (createError?.code === "email_exists") {
      return jsonResponse({ error: "Tên đăng nhập đã được sử dụng." }, 409);
    }
    return jsonResponse({ error: "Không thể tạo tài khoản. Vui lòng thử lại." }, 500);
  }

  const { error: insertError } = await adminClient.from("username_accounts").insert({
    user_id: created.user.id,
    username,
    auth_email: authEmail,
  });

  if (insertError) {
    const { error: cleanupError } = await adminClient.auth.admin.deleteUser(created.user.id);
    if (cleanupError) console.error("Could not clean up unregistered Auth user:", cleanupError);
    if (insertError.code === "23505") {
      return jsonResponse({ error: "Tên đăng nhập đã được sử dụng." }, 409);
    }
    console.error("Username record creation failed:", insertError);
    return jsonResponse({ error: "Không thể lưu tài khoản. Vui lòng thử lại." }, 500);
  }

  const { data: signedIn, error: signInError } = await authClient.auth.signInWithPassword({
    email: authEmail,
    password,
  });
  if (signInError) {
    console.error("New account sign-in failed:", signInError);
    return jsonResponse({
      error: "Tài khoản đã tạo nhưng đăng nhập tự động thất bại. Hãy đăng nhập lại.",
    }, 503);
  }
  return sessionResponse(signedIn.session);
}

async function login(username: string, password: string): Promise<Response> {
  const { data: account, error: lookupError } = await adminClient
    .from("username_accounts")
    .select("auth_email")
    .eq("username", username)
    .maybeSingle();

  if (lookupError) {
    console.error("Username lookup failed:", lookupError);
    return jsonResponse({ error: "Không thể đăng nhập lúc này." }, 500);
  }
  if (!account) return jsonResponse({ error: "Tên đăng nhập hoặc mật khẩu không đúng." }, 401);

  const { data, error } = await authClient.auth.signInWithPassword({
    email: account.auth_email,
    password,
  });
  if (error || !data.session) {
    return jsonResponse({ error: "Tên đăng nhập hoặc mật khẩu không đúng." }, 401);
  }
  return sessionResponse(data.session);
}

Deno.serve(async (request: Request): Promise<Response> => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }
  if (request.method !== "POST") {
    return jsonResponse({ error: "Phương thức không được hỗ trợ." }, 405);
  }

  try {
    const body = await request.json();
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return jsonResponse({ error: "Dữ liệu gửi lên không hợp lệ." }, 400);
    }

    const username = normalizeUsername(body.username);
    const password = body.password;
    if (!username) {
      return jsonResponse({
        error: "Tên đăng nhập phải có 3–24 ký tự chữ không dấu, số hoặc dấu gạch dưới.",
      }, 400);
    }
    if (!validPassword(password)) {
      return jsonResponse({ error: "Mật khẩu phải có từ 8 đến 128 ký tự." }, 400);
    }

    if (body.action === "register") return await register(username, password);
    if (body.action === "login") return await login(username, password);
    return jsonResponse({ error: "Yêu cầu xác thực không hợp lệ." }, 400);
  } catch (error) {
    console.error("Username auth request failed:", error);
    return jsonResponse({ error: "Dịch vụ xác thực gặp lỗi. Vui lòng thử lại." }, 500);
  }
});
