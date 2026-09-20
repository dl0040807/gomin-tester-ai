import { supabase } from "@/lib/supabase/client";
import type { WorryOutcome } from "@/lib/supabase/types";
import type { AiRecommendation } from "./type";

export async function saveRecommendations(
  worryId: string,
  userId: string,
  recommendations: AiRecommendation[],
) {
  await supabase.from("recommendations").delete().eq("worry_id", worryId);
  const sorted = [...recommendations].sort((a, b) => b.score - a.score);
  const rows = sorted.map((r, i) => ({
    worry_id: worryId,
    contact_id: r.contact_id,
    user_id: userId,
    rank: i + 1,
    reason: (r.reasons ?? []).join("\n"),
    script: r.expected_reply,
    score: r.score,
  }));
  const { error } = await supabase.from("recommendations").insert(rows);
  if (error) throw new Error(error.message);
}

export const OUTCOME_OPTIONS: { value: WorryOutcome; label: string }[] = [
  { value: "helpful", label: "도움이 됐어요" },
  { value: "unclear", label: "애매했어요" },
  { value: "regret", label: "괜히 말했어요" },
];

export async function recordOutcome(worryId: string, outcome: WorryOutcome) {
  const { error } = await supabase
    .from("worries")
    .update({ outcome, outcome_recorded_at: new Date().toISOString() })
    .eq("id", worryId);
  if (error) throw new Error(error.message);
}
