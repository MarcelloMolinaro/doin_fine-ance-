
  create view "dagster"."analytics"."source2__dbt_tmp"
    
    
  as (
    SELECT id, score, score + 1 AS score_plus_one FROM public.source2
  );