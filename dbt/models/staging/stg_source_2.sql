{{ config(
    materialized = 'view'
) }}

with source as (
    select * from {{ source('public_sources', 'source2') }}
)

select
    id,
    score,
    score + 1 as score_plus_one
from source