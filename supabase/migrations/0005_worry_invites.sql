-- F3-5: 고민 링크로 지인이 직접 답하는 플로우.
-- contact_invites(옛 F3-2 성향 퀴즈)와는 별개로, 특정 worry에 대한 답변을 받는 용도.
create table worry_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid unique not null default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  worry_id uuid not null references worries(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  answer_1 text,
  answer_2 text,
  free_text text,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz
);

create index worry_invites_worry_id_idx on worry_invites(worry_id);
create index worry_invites_token_idx on worry_invites(token);

alter table worry_invites enable row level security;

-- 링크를 만든 본인만 자기 초대 목록을 조회/생성할 수 있다.
-- 답변을 남기는 지인은 로그인이 없으므로, 응답 저장은 서버(service role)에서만 처리한다.
create policy "worry_invites_select_own" on worry_invites
  for select using (auth.uid() = user_id);

create policy "worry_invites_insert_own" on worry_invites
  for insert with check (auth.uid() = user_id);
