{{ config(
    materialized = 'view'
) }}

with src as (select * from {{ ref('int_trxns') }}),

final as (
    
    select * from src
    where master_category is not null

)

select * from final