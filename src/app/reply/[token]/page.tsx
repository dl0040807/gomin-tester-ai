import { supabaseAdmin } from "@/lib/supabase/admin";
import { StatusScreen } from "@/components/common/StatusScreen";
import { ReplyForm } from "./_source/components/ReplyForm";

interface InviteRow {
  id: string;
  expires_at: string;
  used_at: string | null;
  contacts: { name: string } | { name: string }[] | null;
  worries: { content: string; desired_response_type: string } | { content: string; desired_response_type: string }[] | null;
}

export default async function ReplyPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;

  const { data } = await supabaseAdmin
    .from("worry_invites")
    .select("id, expires_at, used_at, contacts(name), worries(content, desired_response_type)")
    .eq("token", token)
    .maybeSingle<InviteRow>();

  if (!data) {
    return <StatusScreen title="링크를 찾을 수 없어요" sub="주소를 다시 확인해주세요." />;
  }
  if (data.used_at) {
    return <StatusScreen title="이미 답변을 보냈어요" sub="이 링크는 한 번만 사용할 수 있어요." />;
  }
  if (new Date(data.expires_at) < new Date()) {
    return <StatusScreen title="링크가 만료됐어요" sub="7일이 지나면 링크가 자동으로 닫혀요." />;
  }

  const contactField = data.contacts;
  const contactName = (Array.isArray(contactField) ? contactField[0]?.name : contactField?.name) ?? "친구";

  const worryField = data.worries;
  const worry = Array.isArray(worryField) ? worryField[0] : worryField;
  const concern = worry?.content ?? "";

  return <ReplyForm token={token} contactName={contactName} concern={concern} />;
}
