-- Anlix Corp order tracker: Supabase schema
-- Run once in the Supabase SQL editor. Then run the bootstrap statement at the bottom with your own email.
--
-- How it works
--  1. The tracker saves one JSON snapshot to anlix_app_state (this is what the HTML file does today).
--  2. A trigger keeps an append-only history of every real change and rebuilds the relational tables
--     (orders, order_lines, payments, ...) from the snapshot, writing a row-level audit log as it does.
--  3. Reporting views (rpt_*) feed Power BI through a read-only database role.
-- Limits: sync is last-write-wins (two people saving at once can overwrite each other), and the relational
-- tables are a read-only mirror until the app is changed to write rows directly.

-- ============ 1. Staff and roles ============
create table if not exists staff_members (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  role text not null default 'staff' check (role in ('admin','staff','viewer')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);
create or replace function is_staff() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from staff_members where user_id = auth.uid() and active) $$;
create or replace function is_admin() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from staff_members where user_id = auth.uid() and active and role = 'admin') $$;
create or replace function can_write() returns boolean language sql stable security definer set search_path = public as
$$ select exists (select 1 from staff_members where user_id = auth.uid() and active and role in ('admin','staff')) $$;

alter table staff_members enable row level security;
create policy staff_read on staff_members for select to authenticated using (user_id = auth.uid() or is_admin());
create policy staff_admin on staff_members for all to authenticated using (is_admin()) with check (is_admin());

-- ============ 2. The snapshot the tracker saves ============
create table if not exists anlix_app_state (
  id int primary key default 1 check (id = 1),
  state jsonb not null,
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users(id)
);
alter table anlix_app_state enable row level security;
create policy state_read   on anlix_app_state for select to authenticated using (is_staff());
create policy state_insert on anlix_app_state for insert to authenticated with check (can_write());
create policy state_update on anlix_app_state for update to authenticated using (can_write()) with check (can_write());

create table if not exists snapshot_history (
  id bigint generated always as identity primary key,
  saved_at timestamptz not null default now(),
  saved_by uuid,
  state_hash text not null,
  state jsonb not null
);
alter table snapshot_history enable row level security;
create policy history_read on snapshot_history for select to authenticated using (is_admin());

-- ============ 3. Relational mirror ============
create table if not exists settings (
  id int primary key, print_rate numeric, fabric_rate numeric, press_rate numeric, sew_rate numeric,
  bulk_threshold int, deposit_pct numeric, adult_small numeric, adult_bulk numeric, kids_small numeric, kids_bulk numeric
);
create table if not exists sizes (size text primary key, category text, height_mm numeric, height_estimated boolean);
create table if not exists orders (
  job_card text primary key, quotation_no text, invoice_no text, order_date date, received_by text, placed_by text,
  entity text, discount_type text, discount_value numeric, discount_reason text, prod_status text, priority text,
  due_date date, created_at timestamptz
);
create table if not exists order_lines (
  job_card text references orders(job_card) on delete cascade, size text, qty int, unit_price numeric, unit_cost numeric,
  primary key (job_card, size)
);
create table if not exists payments (
  pay_key text primary key, job_card text references orders(job_card) on delete cascade,
  paid_on date, amount numeric, paid_by text, entity text
);
create table if not exists overheads (oh_key text primary key, incurred_on date, item text, amount numeric);
create table if not exists expenses (
  expense_id text primary key, expense_date date, category text, description text, amount numeric, reference text, recorded_by text
);
create table if not exists inventory_items (item_id text primary key, name text, sku text, unit text, qty numeric, minimum numeric, unit_cost numeric);
create table if not exists qc_inspections (
  qc_id text primary key, inspected_on date, job_card text, inspection_point text, result text, qty int,
  defect text, action text, inspected_by text
);
create table if not exists ai_log (
  id bigint generated always as identity primary key, user_id uuid, email text, question text, created_at timestamptz default now()
);

do $$ declare t text; begin
  foreach t in array array['settings','sizes','orders','order_lines','payments','overheads','expenses','inventory_items','qc_inspections','ai_log'] loop
    execute format('alter table %I enable row level security', t);
    execute format('create policy %I on %I for select to authenticated using (is_staff())', t || '_read', t);
  end loop;
end $$;
create policy ai_log_insert on ai_log for insert to authenticated with check (auth.uid() = user_id);

-- ============ 4. Audit log (append-only) ============
create table if not exists audit_log (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  user_id uuid,
  table_name text not null,
  record_key text,
  action text not null,
  old_row jsonb,
  new_row jsonb
);
alter table audit_log enable row level security;
create policy audit_read on audit_log for select to authenticated using (is_staff());

create or replace function audit_row() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into audit_log (user_id, table_name, record_key, action, old_row, new_row)
  values (auth.uid(), tg_table_name, coalesce(to_jsonb(new) ->> tg_argv[0], to_jsonb(old) ->> tg_argv[0]), tg_op,
          case when tg_op <> 'INSERT' then to_jsonb(old) end, case when tg_op <> 'DELETE' then to_jsonb(new) end);
  return coalesce(new, old);
end $$;

create or replace function block_changes() returns trigger language plpgsql as $$
begin raise exception '% is append-only', tg_table_name; end $$;
create trigger audit_log_frozen before update or delete on audit_log for each row execute function block_changes();
create trigger audit_log_nowipe before truncate on audit_log for each statement execute function block_changes();
create trigger history_frozen before update or delete on snapshot_history for each row execute function block_changes();
create trigger history_nowipe before truncate on snapshot_history for each statement execute function block_changes();

do $$ declare r record; begin
  for r in select * from (values ('settings','id'),('sizes','size'),('orders','job_card'),('order_lines','job_card'),('payments','pay_key'),
      ('overheads','oh_key'),('expenses','expense_id'),('inventory_items','item_id'),('qc_inspections','qc_id')) v(tbl, key) loop
    execute format('create trigger %1$s_a_ins after insert on %1$s for each row execute function audit_row(%2$L)', r.tbl, r.key);
    execute format('create trigger %1$s_a_upd after update on %1$s for each row when (old.* is distinct from new.*) execute function audit_row(%2$L)', r.tbl, r.key);
    execute format('create trigger %1$s_a_del after delete on %1$s for each row execute function audit_row(%2$L)', r.tbl, r.key);
  end loop;
end $$;

-- ============ 5. Views that read the snapshot ============
create or replace function arr(j jsonb) returns jsonb language sql immutable as
$$ select case when jsonb_typeof(j) = 'array' then j else '[]'::jsonb end $$;
create or replace view snap as select state as s from anlix_app_state where id = 1;

create or replace view snap_settings as
select 1 as id, (s #>> '{R,print}')::numeric print_rate, (s #>> '{R,fabric}')::numeric fabric_rate, (s #>> '{R,press}')::numeric press_rate,
  (s #>> '{R,sew}')::numeric sew_rate, (s ->> 'thr')::int bulk_threshold, (s ->> 'dep')::numeric deposit_pct,
  (s #>> '{T,adult,0}')::numeric adult_small, (s #>> '{T,adult,1}')::numeric adult_bulk,
  (s #>> '{T,kids,0}')::numeric kids_small, (s #>> '{T,kids,1}')::numeric kids_bulk from snap;
create or replace view snap_sizes as
select x ->> 'n' as size, x ->> 'c' as category, (x ->> 'h')::numeric height_mm, coalesce((x ->> 'e')::int, 0) = 1 as height_estimated
from snap, jsonb_array_elements(arr(s -> 'sizes')) x;
create or replace view snap_orders as
select o ->> 'jc' job_card, o ->> 'qt' quotation_no, o ->> 'inv' invoice_no, (o ->> 'date')::date order_date, o ->> 'by' received_by,
  o ->> 'placed' placed_by, o ->> 'ent' entity, o ->> 'dt' discount_type, coalesce((o ->> 'dv')::numeric, 0) discount_value, o ->> 'dr' discount_reason,
  coalesce(o ->> 'prodStatus', 'Awaiting production') prod_status, coalesce(o ->> 'priority', 'Normal') priority,
  nullif(o ->> 'dueDate', '')::date due_date, coalesce((o ->> 'createdAt')::timestamptz, (o ->> 'date')::timestamptz) created_at
from snap, jsonb_array_elements(arr(s -> 'orders')) o;
create or replace view snap_order_lines as
select o ->> 'jc' job_card, l ->> 's' size, sum((l ->> 'q')::int)::int qty,
  max(nullif(l ->> 'unitPrice', '')::numeric) unit_price, max(nullif(l ->> 'unitCost', '')::numeric) unit_cost
from snap, jsonb_array_elements(arr(s -> 'orders')) o, jsonb_array_elements(arr(o -> 'lines')) l group by 1, 2;
create or replace view snap_payments as
select md5(concat_ws('|', o ->> 'jc', p ->> 'd', p ->> 'amt', p ->> 'by',
    row_number() over (partition by o ->> 'jc', p ->> 'd', p ->> 'amt', p ->> 'by'))) pay_key,
  o ->> 'jc' job_card, (p ->> 'd')::date paid_on, (p ->> 'amt')::numeric amount, p ->> 'by' paid_by, p ->> 'ent' entity
from snap, jsonb_array_elements(arr(s -> 'orders')) o, jsonb_array_elements(arr(o -> 'pays')) p;
create or replace view snap_overheads as
select md5(concat_ws('|', x ->> 'd', x ->> 'n', x ->> 'a', row_number() over (partition by x ->> 'd', x ->> 'n', x ->> 'a'))) oh_key,
  (x ->> 'd')::date incurred_on, x ->> 'n' item, (x ->> 'a')::numeric amount
from snap, jsonb_array_elements(arr(s -> 'over')) x;
create or replace view snap_expenses as
select x ->> 'id' expense_id, (x ->> 'date')::date expense_date, x ->> 'category' category, x ->> 'desc' description,
  (x ->> 'amount')::numeric amount, x ->> 'ref' reference, x ->> 'by' recorded_by
from snap, jsonb_array_elements(arr(s -> 'finance')) x;
create or replace view snap_inventory_items as
select x ->> 'id' item_id, x ->> 'name' name, x ->> 'sku' sku, x ->> 'unit' unit, (x ->> 'qty')::numeric qty,
  (x ->> 'min')::numeric minimum, (x ->> 'cost')::numeric unit_cost
from snap, jsonb_array_elements(arr(s -> 'inventory')) x;
create or replace view snap_qc_inspections as
select x ->> 'id' qc_id, (x ->> 'date')::date inspected_on, x ->> 'jc' job_card, x ->> 'point' inspection_point, x ->> 'result' result,
  (x ->> 'qty')::int qty, x ->> 'defect' defect, x ->> 'action' action, x ->> 'by' inspected_by
from snap, jsonb_array_elements(arr(s -> 'qc')) x;

-- ============ 6. Sync from snapshot ============
create or replace function sync_table(tbl regclass, vw regclass, pk text[]) returns void
language plpgsql security definer set search_path = public as $$
declare cols text; sets text; cond text;
begin
  select string_agg(quote_ident(attname), ',' order by attnum) into cols
    from pg_attribute where attrelid = tbl and attnum > 0 and not attisdropped;
  select string_agg(format('%1$I = excluded.%1$I', attname), ',' order by attnum) into sets
    from pg_attribute where attrelid = tbl and attnum > 0 and not attisdropped and attname::text <> all (pk);
  select string_agg(format('v.%1$I is not distinct from t.%1$I', k), ' and ') into cond from unnest(pk) k;
  execute format('delete from %s t where not exists (select 1 from %s v where %s)', tbl, vw, cond);
  execute format('insert into %1$s (%2$s) select %2$s from %3$s on conflict (%4$s) do update set %5$s where to_jsonb(%1$s) is distinct from to_jsonb(excluded)',
                 tbl, cols, vw, array_to_string(pk, ','), coalesce(nullif(sets, ''), 'id = excluded.id'));
end $$;

create or replace function on_snapshot_save() returns trigger language plpgsql security definer set search_path = public as $$
declare h text;
begin
  h := md5((new.state - array['cur','wk','view','err','cloud','user','mo'])::text);
  if h is distinct from (select state_hash from snapshot_history order by id desc limit 1) then
    insert into snapshot_history (saved_by, state_hash, state) values (new.updated_by, h, new.state - 'cloud');
    perform sync_table('settings', 'snap_settings', array['id']);
    perform sync_table('sizes', 'snap_sizes', array['size']);
    perform sync_table('orders', 'snap_orders', array['job_card']);
    perform sync_table('order_lines', 'snap_order_lines', array['job_card','size']);
    perform sync_table('payments', 'snap_payments', array['pay_key']);
    perform sync_table('overheads', 'snap_overheads', array['oh_key']);
    perform sync_table('expenses', 'snap_expenses', array['expense_id']);
    perform sync_table('inventory_items', 'snap_inventory_items', array['item_id']);
    perform sync_table('qc_inspections', 'snap_qc_inspections', array['qc_id']);
  end if;
  return new;
end $$;
drop trigger if exists snapshot_saved on anlix_app_state;
create trigger snapshot_saved after insert or update on anlix_app_state for each row execute function on_snapshot_save();

-- ============ 7. Reporting views for Power BI ============
create or replace view rpt_orders as
select *, (net_total > 0 and paid_total >= required_payment - 0.005) as payment_requirement_met from (
  with l as (select job_card, sum(qty) shirts, sum(qty * coalesce(unit_price, 0)) subtotal, sum(qty * coalesce(unit_cost, 0)) production_cost from order_lines group by 1),
  pd as (select job_card, sum(amount) paid_total from payments group by 1),
  b as (select o.*, coalesce(l.shirts, 0) shirts, coalesce(l.subtotal, 0) subtotal, coalesce(l.production_cost, 0) production_cost,
          least(coalesce(l.subtotal, 0), case when o.discount_type = '%' then coalesce(l.subtotal, 0) * o.discount_value / 100 else o.discount_value end) discount_amount,
          coalesce(pd.paid_total, 0) paid_total
        from orders o left join l using (job_card) left join pd using (job_card))
  select job_card, quotation_no, invoice_no, order_date, date_trunc('week', order_date)::date week_start, received_by, placed_by, entity,
    prod_status, priority, due_date, shirts, subtotal, discount_amount, subtotal - discount_amount net_total, production_cost,
    subtotal - discount_amount - production_cost gross_profit,
    case when subtotal - discount_amount > 0 then round((subtotal - discount_amount - production_cost) / (subtotal - discount_amount) * 100, 1) end margin_pct,
    paid_total, subtotal - discount_amount - paid_total balance,
    case when shirts < st.bulk_threshold then subtotal - discount_amount else (subtotal - discount_amount) * st.deposit_pct / 100 end required_payment
  from b cross join settings st) x;

create or replace view rpt_payments as
select pay_key, job_card, paid_on, date_trunc('week', paid_on)::date week_start, date_trunc('month', paid_on)::date month_start, amount, paid_by, entity from payments;

create or replace view rpt_sizes as
select *, round((price_small - cost_per_shirt) / nullif(price_small, 0) * 100, 1) margin_small_pct,
          round((price_bulk - cost_per_shirt) / nullif(price_bulk, 0) * 100, 1) margin_bulk_pct from (
  select z.size, z.category, z.height_mm, z.height_estimated,
    round(z.height_mm / 1000 * (st.print_rate + st.fabric_rate + st.press_rate) + st.sew_rate, 2) cost_per_shirt,
    case when z.category = 'kids' then st.kids_small else st.adult_small end price_small,
    case when z.category = 'kids' then st.kids_bulk else st.adult_bulk end price_bulk
  from sizes z cross join settings st) x;

create or replace view rpt_sales_by_size as
select *, revenue - cost profit, case when revenue > 0 then round((revenue - cost) / revenue * 100, 1) end margin_pct from (
  select date_trunc('month', r.order_date)::date month_start, l.size, sum(l.qty) shirts,
    sum(l.qty * coalesce(l.unit_price, 0) * case when r.subtotal > 0 then r.net_total / r.subtotal else 1 end) revenue,
    sum(l.qty * coalesce(l.unit_cost, 0)) cost
  from order_lines l join rpt_orders r using (job_card) group by 1, 2) x;

create or replace view rpt_monthly as
with m as (select date_trunc('month', order_date)::date mth, sum(shirts) shirts, sum(net_total) net_sales, sum(production_cost) cost, sum(gross_profit) gp from rpt_orders group by 1),
p as (select date_trunc('month', paid_on)::date mth, sum(amount) received from payments group by 1),
o as (select date_trunc('month', incurred_on)::date mth, sum(amount) oh from overheads group by 1),
months as (select mth from m union select mth from p union select mth from o)
select months.mth month_start, coalesce(m.shirts, 0) shirts, coalesce(m.net_sales, 0) net_sales, coalesce(m.cost, 0) production_cost,
  coalesce(m.gp, 0) gross_profit, coalesce(p.received, 0) revenue_received, coalesce(o.oh, 0) overheads, coalesce(m.gp, 0) - coalesce(o.oh, 0) net_profit,
  case when coalesce(m.shirts, 0) > 0 and m.gp > 0 then ceil(coalesce(o.oh, 0) / (m.gp / m.shirts)) end break_even_shirts
from months left join m using (mth) left join p using (mth) left join o using (mth);

create or replace view rpt_cost_by_job as
select r.job_card, r.order_date, r.entity,
  sum(l.qty * z.height_mm / 1000 * st.fabric_rate) fabric, sum(l.qty * z.height_mm / 1000 * st.print_rate) printing,
  sum(l.qty * z.height_mm / 1000 * st.press_rate) pressing, sum(l.qty * st.sew_rate) sewing,
  coalesce(max(e.wastage), 0) wastage_and_rework, coalesce(max(e.other), 0) other_direct
from rpt_orders r join order_lines l using (job_card) join sizes z on z.size = l.size cross join settings st
left join (select reference, sum(amount) filter (where category = 'Wastage and rework') wastage,
                  sum(amount) filter (where category <> 'Wastage and rework') other from expenses group by 1) e on e.reference = r.job_card
group by r.job_card, r.order_date, r.entity;

-- ============ 8. Lock down API access, add a read-only Power BI role ============
revoke all on snap, snap_settings, snap_sizes, snap_orders, snap_order_lines, snap_payments, snap_overheads, snap_expenses, snap_inventory_items,
  snap_qc_inspections, rpt_orders, rpt_payments, rpt_sizes, rpt_sales_by_size, rpt_monthly, rpt_cost_by_job from public, anon, authenticated;
revoke execute on function sync_table(regclass, regclass, text[]), on_snapshot_save(), audit_row() from public, anon, authenticated;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'powerbi_reader') then
    create role powerbi_reader login password 'CHANGE-THIS-PASSWORD';
  end if;
end $$;
grant usage on schema public to powerbi_reader;
grant select on rpt_orders, rpt_payments, rpt_sizes, rpt_sales_by_size, rpt_monthly, rpt_cost_by_job to powerbi_reader;

-- ============ 9. First admin (run after you have created your login under Authentication > Users) ============
-- insert into staff_members (user_id, email, role) select id, email, 'admin' from auth.users where email = 'YOUR-EMAIL@example.com';
