-- H3 바이럴: 지인에게 역질문 링크
-- 링크를 받은 지인은 로그인 없이 3문항에 답해 자기 프로필을 채운다.
-- 응답 제출(공개, 비로그인)은 service role 키를 쓰는 서버 라우트에서만 처리하고,
-- 이 테이블 자체의 RLS는 소유자(링크를 만든 사용자) 전용으로 유지한다.

create table contact_invites (
  id uuid primary key default gen_random_uuid(),
  token uuid not null unique default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  contact_id uuid not null references contacts(id) on delete cascade,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '7 days'),
  used_at timestamptz
);

create index contact_invites_contact_id_idx on contact_invites(contact_id);

alter table contact_invites enable row level security;

create policy "contact_invites_owner_all" on contact_invites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
