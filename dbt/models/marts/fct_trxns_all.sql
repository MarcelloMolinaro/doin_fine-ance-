{{ config(
    materialized = 'table'
) }}

with 

src_simplefin as (select * from {{ ref('int_trxns') }}),

final as ( select * from src_simplefin )

select * from final