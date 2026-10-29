-- Money Tracker: all-or-nothing loan functions.
-- Each function runs as ONE database transaction: either everything it does
-- is saved, or nothing is. Safe to run more than once.

-- 1) Create a loan + its opening transaction, with the next free loan code.
create or replace function public.create_loan(
  p_date        date,
  p_person      text,
  p_type        text,
  p_description text,
  p_amount      numeric,
  p_notes       text,
  p_account_id  bigint
) returns text
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loans_account bigint;
  v_category      bigint;
  v_num           integer;
  v_code          text;
  v_from          bigint;
  v_to            bigint;
begin
  if p_type not in ('Given', 'Received') then
    raise exception 'Loan type must be Given or Received';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_person is null or btrim(p_person) = '' then
    raise exception 'Person is required';
  end if;
  if not exists (select 1 from accounts where id = p_account_id) then
    raise exception 'Account not found';
  end if;

  select id into v_loans_account from accounts where name = 'Loans' limit 1;
  if v_loans_account is null then
    raise exception 'The "Loans" account was not found';
  end if;

  select id into v_category from categories
   where name = case when p_type = 'Given' then 'Loan Given' else 'Loan Received' end
   limit 1;
  if v_category is null then
    raise exception 'The loan category was not found';
  end if;

  -- One loan creation at a time, so two devices can never pick the same code.
  perform pg_advisory_xact_lock(hashtext('money_tracker_create_loan'));

  select coalesce(max(substring(loan_code from 2)::integer), 0) + 1
    into v_num
    from loans
   where loan_code ~ '^L[0-9]+$';
  v_code := 'L' || lpad(v_num::text, 4, '0');

  if p_type = 'Given' then
    v_from := p_account_id;      v_to := v_loans_account;
  else
    v_from := v_loans_account;   v_to := p_account_id;
  end if;

  insert into loans (loan_code, date, person, type, description, amount, notes)
  values (v_code, p_date, btrim(p_person), p_type, p_description, p_amount, p_notes);

  insert into transactions (date, description, category_id, from_account_id, to_account_id, amount, notes, loan_code)
  values (p_date, 'Loan ' || lower(p_type) || ' - ' || btrim(p_person), v_category, v_from, v_to, p_amount, p_notes, v_code);

  return v_code;
end;
$$;

-- 2) Edit a loan and its opening transaction together.
create or replace function public.update_loan(
  p_loan_code   text,
  p_date        date,
  p_person      text,
  p_type        text,
  p_description text,
  p_amount      numeric,
  p_notes       text,
  p_account_id  bigint
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_loans_account bigint;
  v_category      bigint;
  v_opening_id    bigint;
  v_settled       numeric;
  v_from          bigint;
  v_to            bigint;
begin
  if p_type not in ('Given', 'Received') then
    raise exception 'Loan type must be Given or Received';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'Amount must be greater than zero';
  end if;
  if p_person is null or btrim(p_person) = '' then
    raise exception 'Person is required';
  end if;
  if not exists (select 1 from accounts where id = p_account_id) then
    raise exception 'Account not found';
  end if;
  if not exists (select 1 from loans where loan_code = p_loan_code) then
    raise exception 'Loan % not found', p_loan_code;
  end if;

  select id into v_loans_account from accounts where name = 'Loans' limit 1;
  if v_loans_account is null then
    raise exception 'The "Loans" account was not found';
  end if;

  select id into v_category from categories
   where name = case when p_type = 'Given' then 'Loan Given' else 'Loan Received' end
   limit 1;
  if v_category is null then
    raise exception 'The loan category was not found';
  end if;

  select t.id into v_opening_id
    from transactions t
    join categories c on c.id = t.category_id
   where t.loan_code = p_loan_code
     and c.name in ('Loan Given', 'Loan Received')
   order by t.id
   limit 1;
  if v_opening_id is null then
    raise exception 'The opening transaction for loan % was not found', p_loan_code;
  end if;

  select coalesce(sum(t.amount), 0) into v_settled
    from transactions t
    join categories c on c.id = t.category_id
   where t.loan_code = p_loan_code
     and c.name in ('Loan Repaid', 'Loan Paid');
  if p_amount < v_settled then
    raise exception 'Amount cannot be less than what is already settled (%)', v_settled;
  end if;

  if p_type = 'Given' then
    v_from := p_account_id;      v_to := v_loans_account;
  else
    v_from := v_loans_account;   v_to := p_account_id;
  end if;

  update loans
     set date = p_date, person = btrim(p_person), type = p_type,
         description = p_description, amount = p_amount, notes = p_notes
   where loan_code = p_loan_code;

  update transactions
     set date = p_date,
         description = 'Loan ' || lower(p_type) || ' - ' || btrim(p_person),
         category_id = v_category, from_account_id = v_from, to_account_id = v_to,
         amount = p_amount, notes = p_notes
   where id = v_opening_id;
end;
$$;

-- 3) Delete a loan, its opening transaction and all its repayments together.
create or replace function public.delete_loan(p_loan_code text)
returns void
language plpgsql
security invoker
set search_path = public
as $$
begin
  if not exists (select 1 from loans where loan_code = p_loan_code) then
    raise exception 'Loan % not found', p_loan_code;
  end if;
  delete from transactions where loan_code = p_loan_code;
  delete from loans where loan_code = p_loan_code;
end;
$$;

-- Only signed-in users may call them (your table rules still apply too).
revoke all on function public.create_loan(date, text, text, text, numeric, text, bigint) from public, anon;
revoke all on function public.update_loan(text, date, text, text, text, numeric, text, bigint) from public, anon;
revoke all on function public.delete_loan(text) from public, anon;
grant execute on function public.create_loan(date, text, text, text, numeric, text, bigint) to authenticated;
grant execute on function public.update_loan(text, date, text, text, text, numeric, text, bigint) to authenticated;
grant execute on function public.delete_loan(text) to authenticated;
