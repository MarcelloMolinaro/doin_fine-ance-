{{ config(
    materialized = 'table'
) }}

with 

src as (select * from {{ ref('int_trxns') }})

, user_validated_trxns as (select * from {{ ref('fct_validated_trxns') }})

, final as (
    
    select * from src
    where 
        master_category is null
        and transaction_id not in (
            select transaction_id 
            from user_validated_trxns 
            where transaction_id is not null
        )

)

select * from final