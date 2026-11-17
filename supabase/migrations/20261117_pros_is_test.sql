-- ProGuild — pros.is_test flag
-- ===========================================================================
-- Test/internal accounts (mailinator, @proguild.ai, clauderaju*/rajuproguild*,
-- "(TEST)" names, "-TEST" licenses, data_source='TEST') were surfacing in the
-- public directory, Find-a-Pro search and the Google sitemap. This flag marks
-- them once so every public surface can filter them out with .eq('is_test',
-- false). Going forward, app/api/auth/signup/route.ts auto-flags new test
-- accounts at creation. RUN once per environment. Idempotent.
-- ===========================================================================

alter table pros add column if not exists is_test boolean not null default false;

update pros set is_test = true
where is_test = false
  and ( email ilike '%@mailinator.com'
     or email ilike '%@proguild.ai'
     or email ilike 'clauderaju%'
     or email ilike 'rajuproguild%'
     or full_name ilike '%(TEST)%'
     or license_number ilike '%-TEST'
     or data_source = 'TEST' );

-- To exempt a row later: update pros set is_test = false where id = '…';
