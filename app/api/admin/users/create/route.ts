import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const ALLOWED_ROLES = ["worker", "sales", "manager", "boss"] as const;
type Role = (typeof ALLOWED_ROLES)[number];

async function getCurrentProfile(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const {
    data: { user },
    error: userErr,
  } = await supabaseAdmin.auth.getUser(token);

  if (userErr || !user) return null;

  const { data: profile, error: profileErr } = await supabaseAdmin
    .from("user_profiles")
    .select("id, role, is_active")
    .eq("id", user.id)
    .single();

  if (profileErr || !profile || !profile.is_active) return null;

  return profile as { id: string; role: Role; is_active: boolean };
}

export async function POST(req: Request) {
  try {
    const currentProfile = await getCurrentProfile(req);

    if (!currentProfile) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    if (currentProfile.role !== "manager" && currentProfile.role !== "boss") {
      return NextResponse.json({ error: "无权限创建用户" }, { status: 403 });
    }

    const body = await req.json();
    const { email, password, full_name, role, trade_type } = body ?? {};

    if (!email || !password || !full_name || !role) {
      return NextResponse.json({ error: "缺少必要字段" }, { status: 400 });
    }

    if (!ALLOWED_ROLES.includes(role)) {
      return NextResponse.json({ error: "角色不合法" }, { status: 400 });
    }

    if (currentProfile.role === "manager" && role === "boss") {
      return NextResponse.json(
        { error: "主管不能创建高级老板账号" },
        { status: 403 }
      );
    }

    const { data: createdUser, error: createErr } =
      await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
      });

    if (createErr || !createdUser.user) {
      return NextResponse.json(
        { error: createErr?.message || "创建 Auth 用户失败" },
        { status: 400 }
      );
    }

    const userId = createdUser.user.id;

    const { error: profileErr } = await supabaseAdmin.from("user_profiles").insert({
      id: userId,
      email,
      full_name,
      role,
      trade_type: role === "worker" ? trade_type || null : null,
      is_active: true,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });

    if (profileErr) {
      await supabaseAdmin.auth.admin.deleteUser(userId);
      return NextResponse.json({ error: profileErr.message }, { status: 400 });
    }

    return NextResponse.json({
      ok: true,
      user: {
        id: userId,
        email,
        full_name,
        role,
        trade_type: role === "worker" ? trade_type || null : null,
      },
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "服务器错误" },
      { status: 500 }
    );
  }
}