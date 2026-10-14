-- Metre variance reporting for Power BI.
-- Run this in the Supabase SQL Editor AFTER schema.sql. It is safe to run again.
-- It reads the actual metres saved by the tracker's "Metre variance" screen (stored in the app snapshot) and adds one reporting view.

-- Drop first so this file can be run again after changes to the columns.
drop view if exists rpt_metre_variance;
drop view if exists snap_metre_variance;

create view snap_metre_variance as
select o ->> 'jc' as job_card,
  o ->> 'ent' as entity,
  (o ->> 'date')::date as order_date,
  (select coalesce(sum((l ->> 'q')::int), 0) from jsonb_array_elements(arr(o -> 'lines')) l) as shirts,
  (o #>> '{metres,theo}')::numeric as theoretical_m,
  (o #>> '{metres,act}')::numeric as actual_m,
  coalesce((s ->> 'tol')::numeric, 10) as tolerance_pct,
  coalesce((o ->> 'allow')::numeric, 0) as costed_allowance_pct,
  coalesce((s #>> '{R,print}')::numeric, 0) + coalesce((s #>> '{R,fabric}')::numeric, 0) + coalesce((s #>> '{R,press}')::numeric, 0) as metre_rate,
  o #>> '{metres,reason}' as reason,
  o #>> '{metres,by}' as recorded_by,
  (o #>> '{metres,at}')::timestamptz as recorded_at,
  jsonb_array_length(arr(o #> '{metres,hist}')) as corrections
from snap, jsonb_array_elements(arr(s -> 'orders')) o
where o #>> '{metres,act}' is not null;

create view rpt_metre_variance as
select job_card, entity, order_date, date_trunc('month', order_date)::date as month_start, shirts,
  theoretical_m, round(theoretical_m * (1 + costed_allowance_pct / 100), 3) as costed_m, actual_m,
  actual_m - theoretical_m as variance_m,
  case when theoretical_m > 0 then round(actual_m / theoretical_m - 1, 4) end as variance_pct,
  tolerance_pct, costed_allowance_pct,
  case when theoretical_m <= 0 then 'Check theoretical'
       when actual_m / theoretical_m - 1 > tolerance_pct / 100 + 0.000001 then 'OVER tolerance'
       when actual_m / theoretical_m - 1 < -tolerance_pct / 100 - 0.000001 then 'UNDER - verify'
       else 'Within tolerance' end as status,
  round((actual_m - theoretical_m * (1 + costed_allowance_pct / 100)) * metre_rate, 2) as cost_impact, -- extra cost beyond the metres costed into the job
  reason, recorded_by, recorded_at, corrections
from snap_metre_variance;

revoke all on snap_metre_variance, rpt_metre_variance from public, anon, authenticated;
grant select on rpt_metre_variance to powerbi_reader;
