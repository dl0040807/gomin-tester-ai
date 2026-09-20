export type ResponseType =
  | "empathy" // 공감·위로
  | "objective_advice" // 객관적 조언
  | "fact_check" // 팩트체크
  | "action_plan" // 행동 계획
  | "just_listen"; // 그냥 들어주기

export interface Contact {
  id: string;
  user_id: string;
  name: string;
  relationship: string;
  occupation: string | null;
  mbti: string | null;
  personality_tags: string[];
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export type WorryOutcome = "helpful" | "unclear" | "regret";

export interface Worry {
  id: string;
  user_id: string;
  content: string;
  desired_response_type: ResponseType;
  outcome: WorryOutcome | null;
  outcome_recorded_at: string | null;
  created_at: string;
}

export interface Recommendation {
  id: string;
  worry_id: string;
  contact_id: string;
  user_id: string;
  rank: number;
  reason: string;
  script: string;
  score: number | null;
  created_at: string;
}

export interface WorryInvite {
  id: string;
  token: string;
  user_id: string;
  worry_id: string;
  contact_id: string;
  answer_1: string | null;
  answer_2: string | null;
  free_text: string | null;
  created_at: string;
  expires_at: string;
  used_at: string | null;
}

export interface RoleplaySimulation {
  id: string;
  recommendation_id: string;
  user_id: string;
  simulated_response: string;
  created_at: string;
}

export interface Database {
  public: {
    Tables: {
      contacts: {
        Row: Contact;
        Insert: Omit<Contact, "id" | "created_at" | "updated_at"> & {
          id?: string;
        };
        Update: Partial<Omit<Contact, "id" | "user_id">>;
        Relationships: [];
      };
      worries: {
        Row: Worry;
        Insert: Omit<Worry, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<Worry, "id" | "user_id">>;
        Relationships: [];
      };
      recommendations: {
        Row: Recommendation;
        Insert: Omit<Recommendation, "id" | "created_at"> & { id?: string };
        Update: Partial<Omit<Recommendation, "id" | "user_id">>;
        Relationships: [];
      };
      roleplay_simulations: {
        Row: RoleplaySimulation;
        Insert: Omit<RoleplaySimulation, "id" | "created_at"> & {
          id?: string;
        };
        Update: Partial<Omit<RoleplaySimulation, "id" | "user_id">>;
        Relationships: [];
      };
    };
    Views: Record<string, never>;
    Functions: Record<string, never>;
  };
}
