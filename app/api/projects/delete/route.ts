import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function getSupabaseAdmin() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl) {
    throw new Error("缺少环境变量 NEXT_PUBLIC_SUPABASE_URL");
  }

  if (!serviceRoleKey) {
    throw new Error("缺少环境变量 SUPABASE_SERVICE_ROLE_KEY");
  }

  return createClient(supabaseUrl, serviceRoleKey);
}

async function getCurrentProfile(req: Request) {
  const authHeader = req.headers.get("authorization");
  if (!authHeader?.startsWith("Bearer ")) return null;

  const token = authHeader.replace("Bearer ", "").trim();
  if (!token) return null;

  const supabaseAdmin = getSupabaseAdmin();

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

  return profile as { id: string; role: string; is_active: boolean };
}

export async function POST(req: Request) {
  try {
    const currentProfile = await getCurrentProfile(req);

    if (!currentProfile) {
      return NextResponse.json({ error: "未授权访问" }, { status: 401 });
    }

    if (currentProfile.role !== "boss") {
      return NextResponse.json({ error: "只有 boss 可以删除项目" }, { status: 403 });
    }

    const body = await req.json();
    const { projectId } = body ?? {};

    if (!projectId) {
      return NextResponse.json({ error: "缺少 projectId" }, { status: 400 });
    }

    const supabaseAdmin = getSupabaseAdmin();

    const { data: quote } = await supabaseAdmin
      .from("project_quotes")
      .select("id")
      .eq("project_id", projectId)
      .maybeSingle();

    const quoteId = quote?.id || null;

    const { data: materialPhotos } = await supabaseAdmin
      .from("project_material_photos")
      .select("storage_path")
      .eq("project_id", projectId);

    const { data: workPhotos } = await supabaseAdmin
      .from("project_work_photos")
      .select("storage_path")
      .eq("project_id", projectId);

    let quoteItemIds: string[] = [];
    if (quoteId) {
      const { data: quoteItems } = await supabaseAdmin
        .from("project_quote_items")
        .select("id")
        .eq("quote_id", quoteId);

      quoteItemIds = (quoteItems || []).map((x) => x.id);
    }

    let quotePhotoPaths: { image_path: string }[] = [];
    if (quoteItemIds.length > 0) {
      const { data } = await supabaseAdmin
        .from("project_quote_item_photos")
        .select("image_path")
        .in("quote_item_id", quoteItemIds);

      quotePhotoPaths = data || [];
    }

    let voucherPaths: { storage_path: string }[] = [];
    if (quoteId) {
      const { data } = await supabaseAdmin
        .from("payment_vouchers")
        .select("storage_path")
        .eq("quote_id", quoteId);

      voucherPaths = data || [];
    }

    const pathsToDelete = [
      ...(materialPhotos || []).map((x) => x.storage_path),
      ...(workPhotos || []).map((x) => x.storage_path),
      ...quotePhotoPaths.map((x) => x.image_path),
      ...voucherPaths.map((x) => x.storage_path),
    ].filter(Boolean);

    if (pathsToDelete.length > 0) {
      await supabaseAdmin.storage.from("project-photos").remove(pathsToDelete);
    }

    await supabaseAdmin.from("project_action_logs").delete().eq("project_id", projectId);
    await supabaseAdmin.from("project_assignments").delete().eq("project_id", projectId);

    await supabaseAdmin.from("project_material_photos").delete().eq("project_id", projectId);
    await supabaseAdmin.from("project_materials").delete().eq("project_id", projectId);

    await supabaseAdmin.from("project_work_photos").delete().eq("project_id", projectId);
    await supabaseAdmin.from("project_work_items").delete().eq("project_id", projectId);

    if (quoteItemIds.length > 0) {
      await supabaseAdmin
        .from("project_quote_item_photos")
        .delete()
        .in("quote_item_id", quoteItemIds);
    }

    if (quoteId) {
      await supabaseAdmin.from("payment_vouchers").delete().eq("quote_id", quoteId);
      await supabaseAdmin.from("project_quote_payments").delete().eq("quote_id", quoteId);
      await supabaseAdmin.from("project_quote_items").delete().eq("quote_id", quoteId);
      await supabaseAdmin.from("project_quotes").delete().eq("id", quoteId);
    }

    const { error: deleteProjectErr } = await supabaseAdmin
      .from("projects")
      .delete()
      .eq("id", projectId);

    if (deleteProjectErr) {
      return NextResponse.json({ error: deleteProjectErr.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "删除项目失败";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}