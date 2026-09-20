-- 추천 결과에 매칭도(score)를 저장 — 결과 화면에서 오른쪽에 표시하기 위함.
alter table recommendations add column score int;
