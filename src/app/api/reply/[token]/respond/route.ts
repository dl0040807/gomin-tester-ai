import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(request: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  let body: { freeText?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "요청 본문을 읽을 수 없습니다." }, { status: 400 });
  }
  const freeText = body.freeText?.trim();

  if (!freeText) {
    return NextResponse.json({ error: "답변을 입력해주세요." }, { status: 400 });
  }

  const { data: invite, error: inviteError } = await supabaseAdmin
    .from("worry_invites")
    .select("id, expires_at, used_at, contacts(name)")
    .eq("token", token)
    .maybeSingle<{ id: string; expires_at: string; used_at: string | null; contacts: { name: string } | { name: string }[] | null }>();

  if (inviteError || !invite) {
    return NextResponse.json({ error: "유효하지 않은 링크입니다." }, { status: 404 });
  }
  if (invite.used_at) {
    return NextResponse.json({ error: "이미 답변을 보낸 링크입니다." }, { status: 409 });
  }
  if (new Date(invite.expires_at) < new Date()) {
    return NextResponse.json({ error: "만료된 링크입니다." }, { status: 410 });
  }

  // 이 답은 이 고민 하나에 대한 것일 뿐, 지인의 전반적인 성향 프로필(personality_tags/memo)에는 반영하지 않는다 —
  // 지인 관리 화면에는 "본인이 어떤 사람인지" 설문(성향 퀴즈) 답만 보이게 한다.
  const { error: updateError } = await supabaseAdmin
    .from("worry_invites")
    .update({ free_text: freeText, used_at: new Date().toISOString() })
    .eq("id", invite.id);

  if (updateError) {
    return NextResponse.json({ error: updateError.message }, { status: 500 });
  }

  const contactField = invite.contacts;
  const contactName = (Array.isArray(contactField) ? contactField[0]?.name : contactField?.name) ?? "친구";

  return NextResponse.json({ contactName });
}
