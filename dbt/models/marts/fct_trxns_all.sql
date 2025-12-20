{{ config(
    materialized = 'view'
) }}

with 

src_simplefin as (select * from {{ ref('int_trxns') }})

select * from src_simplefin