
  
    

  create  table "dagster"."analytics"."summary__dbt_tmp"
  
  
    as
  
  (
    

with 

src_1 as ( select * from "dagster"."analytics"."stg_source_1"),
src_2 as (select * from "dagster"."analytics"."stg_source_2" ),
src_3 as (select * from "dagster"."analytics"."stg_source_3" ),
weather as (select * from "dagster"."analytics"."stg_weather"),

joined as (
    select
        src_1.id,
        src_1.value_x2,
        src_2.score_plus_one,
        src_3.is_a,
        weather.wind_speed
    from src_1
    join src_2 using (id)
    join src_3 using (id)
    left join weather on src_3.is_a = 1
)

select
    *,
    (value_x2 + score_plus_one) * is_a as metric
from joined
  );
  