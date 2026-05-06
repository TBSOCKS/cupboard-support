-- Cupboard Support: em dash cleanup
-- Run this in the Supabase SQL Editor if you've already loaded seed data
-- and want to strip em dashes from existing rows.
--
-- Replaces ' — ' with ' - ' (with spaces preserved)
-- and bare em dashes with regular hyphens.

update orders
set notes = regexp_replace(notes, ' \u2014 ', ' - ', 'g')
where notes like '%' || chr(8212) || '%';

update orders
set notes = replace(notes, chr(8212), '-')
where notes like '%' || chr(8212) || '%';

update policies
set content = regexp_replace(content, ' \u2014 ', ' - ', 'g')
where content like '%' || chr(8212) || '%';

update policies
set content = replace(content, chr(8212), '-')
where content like '%' || chr(8212) || '%';

update products
set description = regexp_replace(description, ' \u2014 ', ' - ', 'g')
where description like '%' || chr(8212) || '%';

update products
set description = replace(description, chr(8212), '-')
where description like '%' || chr(8212) || '%';

update products
set care_instructions = regexp_replace(care_instructions, ' \u2014 ', ' - ', 'g')
where care_instructions like '%' || chr(8212) || '%';

update products
set care_instructions = replace(care_instructions, chr(8212), '-')
where care_instructions like '%' || chr(8212) || '%';

-- Verify: count any remaining em dashes
select 'orders.notes' as col, count(*) as remaining from orders where notes like '%' || chr(8212) || '%'
union all
select 'policies.content', count(*) from policies where content like '%' || chr(8212) || '%'
union all
select 'products.description', count(*) from products where description like '%' || chr(8212) || '%'
union all
select 'products.care_instructions', count(*) from products where care_instructions like '%' || chr(8212) || '%';
