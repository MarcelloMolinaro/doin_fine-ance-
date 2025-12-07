{{ config(
    materialized = 'table'
) }}

with src_transactions as (select * from {{ ref('fct_transactions') }}),

final as (
    select * from src_transactions
    where master_category is null
)

select * from final