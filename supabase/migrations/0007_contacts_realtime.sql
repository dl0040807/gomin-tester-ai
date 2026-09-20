-- 지인 관리 화면에서 성향 퀴즈 답(지인이 /invite/[token]에서 직접 제출)이 오면
-- 새로고침 없이 바로 반영하기 위해 contacts의 UPDATE를 realtime으로 구독한다.
alter publication supabase_realtime add table contacts;
