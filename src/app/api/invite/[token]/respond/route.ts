import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { Q1_TAG_MAP, Q2_TAG_MAP, Q3_TAG_MAP } from "@/constants/inviteQuestions";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const body = await request.json();
  const { q1, q2, q3, free } = body as Record<string, string | undefined>;

  if (!q1 || !q2 || !q3) {
    return NextResponse.json({ error: "모든 문항에 답해주세요." }, { status: 400 });
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("contact_invites")
    .select("id, contact_id, expires_at, used_at")
    .eq("token", token)
    .maybeSingle();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 404 });
  }
  if (invite.used_at) {
    return NextResponse.json({ error: "이미 답변을 보낸 링크입니다." }, { status: 409 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "만료된 링크입니다." }, { status: 410 });
  }

  const { data: contact, error: contactError } = await supabaseAdmin
    .from("contacts")
    .select("id, name, personality_tags, memo")
    .eq("id", invite.contact_id)
    .maybeSingle();

  if (contactError || !contact) {
    return NextResponse.json({ error: "지인 정보를 찾을 수 없습니다." }, { status: 404 });
  }

  // 세 문항 모두 성향 태그로만 변환한다 — 고민 종류/피하고 싶은 주제 같은 건 묻지 않는다.
  const newTags = [Q1_TAG_MAP[q1], Q2_TAG_MAP[q2], Q3_TAG_MAP[q3]].filter((t): t is string => !!t);
  const existingTags: string[] = contact.personality_tags ?? [];
  const nextTags = Array.from(new Set([...existingTags, ...newTags]));

  const summaryLine =
    `[본인 응답] 성향: ${newTags.join(", ")}` + (free?.trim() ? ` · 한마디: "${free.trim()}"` : "");
  const nextMemo = contact.memo ? `${contact.memo}\n${summaryLine}` : summaryLine;

  const { error: updateError } = await supabaseAdmin
    .from("contacts")
    .update({ personality_tags: nextTags, memo: nextMemo })
    .eq("id", contact.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  await supabaseAdmin
    .from("contact_invites")
    .update({ used_at: new Date().toISOString() })
    .eq("id", invite.id);

  return NextResponse.json({ contactName: contact.name });
}
