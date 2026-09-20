-- F2-1 홈에서 지인의 답장이 오면 새로고침 없이 바로 반영하기 위해
-- worry_invites의 UPDATE(답변 도착 = used_at 세팅)를 realtime으로 구독한다.
alter publication supabase_realtime add table worry_invites;
