{{ config(
    materialized = 'table'
) }}

with src as (select * from {{ ref('int_trxns') }}),

final as (
    
    select * from src
    where master_category is null

)

select * from final