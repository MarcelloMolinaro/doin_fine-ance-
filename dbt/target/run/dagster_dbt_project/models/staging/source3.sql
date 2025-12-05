
  create view "dagster"."public"."source3__dbt_tmp"
    
    
  as (
    SELECT 
    id, 
    category, 
    CASE WHEN category='A' 
        THEN 1 
        ELSE 0 
    END AS is_a 
FROM public.source3
  );