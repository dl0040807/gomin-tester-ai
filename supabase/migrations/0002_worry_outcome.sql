-- H2 재방문·리텐션: 고민에 대한 결과를 1탭으로 기록
alter table worries
  add column outcome text check (outcome in ('helpful', 'unclear', 'regret')),
  add column outcome_recorded_at timestamptz;
