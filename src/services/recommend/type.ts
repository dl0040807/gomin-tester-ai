import type { WorryOutcome } from "@/lib/supabase/types";

export interface ContactForApi {
  id: string;
  name: string;
  relationship: string;
  occupation: string | null;
  mbti: string | null;
  personality_tags: string[];
  memo: string | null;
}

export interface AiRecommendation {
  contact_id: string;
  score: number;
  reasons: string[];
  expected_reply: string;
}

export interface PastFeedback {
  concern: string;
  contactName: string;
  outcome: WorryOutcome;
}
