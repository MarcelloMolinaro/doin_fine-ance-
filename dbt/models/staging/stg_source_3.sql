{{ config(
    materialized = 'view'
) }}

with source as (
    select * from {{ source('public_sources', 'source3') }}
)

select
    id,
    category,
    case
        when category = 'A' then 1
        else 0
    end as is_a
from source