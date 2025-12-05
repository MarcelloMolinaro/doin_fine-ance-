
  create view "dagster"."public"."weather__dbt_tmp"
    
    
  as (
    config {
    "enabled": false
}


SELECT 
    name, 
    temperature, 
    windSpeed, 
    temperature * 1.8 + 32 AS temperature_f 
FROM public.weather
  );