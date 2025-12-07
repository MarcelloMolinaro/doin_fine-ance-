{{ config(
    materialized = 'view',
    enabled = false
) }}

with source as (
    select * from {{ source('public_sources', 'source1') }}
)

select
    id,
    value,
    value * 2 as value_x2
from source