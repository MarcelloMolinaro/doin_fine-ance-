
  create view "dagster"."public"."source1__dbt_tmp"
    
    
  as (
    SELECT id, value, value * 2 AS value_x2 FROM public.source1
  );