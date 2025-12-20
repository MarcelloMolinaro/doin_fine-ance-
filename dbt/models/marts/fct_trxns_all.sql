{{ config(
    materialized = 'view'
) }}


-- I think this is not needed! Maybe we change the name of int_trxns to fct_trxns_all or int_union_trxns? 
with 

src_simplefin as (select * from {{ ref('int_trxns') }})

select * from src_simplefin