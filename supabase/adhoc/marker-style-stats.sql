-- marker-style-stats.sql — how many users are on each marker style (run
-- BEFORE switching everyone to circle-fill-black, for the record).
--
-- Run via:
--   powershell -File scripts/supa-sql.ps1 -Sql "$(Get-Content sql/marker-style-stats.sql -Raw)"

-- 1) Distribution of marker styles across all user_settings rows.
select
  coalesce(marker_style, '(null)') as marker_style,
  count(*)                            as users
from user_settings
group by 1
order by 2 desc;

-- 2) The columns we plan to touch for the "everyone → circle-fill-black +
--    sky-blue default" change (confirm they exist before migrating).
select column_name, data_type, column_default
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_settings'
  and column_name in (
    'marker_style',
    'style_default_colors',
    'marker_default_color',
    'marker_default_color_mode',
    'marker_onboarding_done',
    'marker_onboarding_skips'
  )
order by column_name;
