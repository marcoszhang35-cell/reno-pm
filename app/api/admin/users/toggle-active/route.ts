import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type Role = "worker" | "sales" | "manager" | "boss";

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
      return NextResponse.json({ error: "无权限操作用户" }, { status: 403 });
    }

    const body = await req.json();
    const { userId, is_active } = body ?? {};

    if (!userId || typeof is_active !== "boolean") {
      return NextResponse.json({ error: "参数错误" }, { status: 400 });
    }

    const { data: targetUser, error: targetErr } = await supabaseAdmin
      .from("user_profiles")
      .select("id, role, is_active")
      .eq("id", userId)
      .single();

    if (targetErr || !targetUser) {
      return NextResponse.json({ error: "目标用户不存在" }, { status: 404 });
    }

    if (currentProfile.role === "manager" && targetUser.role === "boss") {
      return NextResponse.json(
        { error: "主管不能启用或禁用高级老板" },
        { status: 403 }
      );
    }

    if (currentProfile.id === userId && is_active === false) {
      return NextResponse.json(
        { error: "不能禁用当前正在登录的账号" },
        { status: 400 }
      );
    }

    const { error } = await supabaseAdmin
      .from("user_profiles")
      .update({
        is_active,
        updated_at: new Date().toISOString(),
      })
      .eq("id", userId);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message || "服务器错误" },
      { status: 500 }
    );
  }
}