{{ config(
    materialized = 'view',
    enabled = false
) }}

with source as (
    select * from {{ source('public_sources', 'weather') }}
)

select
    name,
    temperature,
    "windSpeed" as wind_speed,
    temperature * 1.8 + 32 as temperature_f,
    "startTime" as start_time,
    "startTime"::timestamp::date as start_date
from source