{{ config(
    materialized = 'view',
) }}

with source as (
    select * from {{ ref('historic_transactions') }}
),

final as (
    select * from source
)

select * from final