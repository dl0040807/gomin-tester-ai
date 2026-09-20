-- 고민테스터 AI - 초기 스키마
-- Supabase SQL Editor에서 실행하거나 `supabase db push`로 적용하세요.

create extension if not exists pgcrypto;

-- 원하는 답변 유형
create type response_type as enum (
  'empathy',          -- 공감·위로
  'objective_advice',  -- 객관적 조언
  'fact_check',        -- 팩트체크
  'action_plan',       -- 행동 계획
  'just_listen'        -- 그냥 들어주기
);

-- 지인 프로필
create table contacts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  relationship text not null,        -- 관계 (친구/가족/직장동료/선후배 등, 자유 입력)
  occupation text,                   -- 직업
  mbti text check (mbti ~ '^[EI][NS][TF][JP]$'),
  personality_tags text[] not null default '{}',  -- 성향 태그 (예: ['공감형','직설적'])
  memo text,                         -- 기타 메모
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index contacts_user_id_idx on contacts(user_id);

-- 고민 기록
create table worries (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  content text not null,
  desired_response_type response_type not null,
  created_at timestamptz not null default now()
);

create index worries_user_id_idx on worries(user_id);

-- AI 추천 결과 (고민 하나당 여러 지인 추천, 순위별)
create table recommendations (
  id uuid primary key default gen_random_uuid(),
  worry_id uuid not null references worries(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  rank int not null,                 -- 1위, 2위, 3위 ...
  reason text not null,              -- 추천 이유
  script text not null,              -- "이렇게 물어보세요" 대화 시작 스크립트
  created_at timestamptz not null default now(),
  unique (worry_id, contact_id)
);

create index recommendations_worry_id_idx on recommendations(worry_id);
create index recommendations_user_id_idx on recommendations(user_id);

-- 스트레치: 역할극 미리보기 (그 사람이 어떻게 반응할지 시뮬레이션)
create table roleplay_simulations (
  id uuid primary key default gen_random_uuid(),
  recommendation_id uuid not null references recommendations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  simulated_response text not null,
  created_at timestamptz not null default now()
);

create index roleplay_simulations_recommendation_id_idx on roleplay_simulations(recommendation_id);

-- updated_at 자동 갱신 트리거 (contacts)
create or replace function set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

create trigger contacts_set_updated_at
  before update on contacts
  for each row
  execute function set_updated_at();

-- Row Level Security: 본인 데이터만 조회/수정 가능
alter table contacts enable row level security;
alter table worries enable row level security;
alter table recommendations enable row level security;
alter table roleplay_simulations enable row level security;

create policy "contacts_owner_all" on contacts
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "worries_owner_all" on worries
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "recommendations_owner_all" on recommendations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "roleplay_simulations_owner_all" on roleplay_simulations
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
