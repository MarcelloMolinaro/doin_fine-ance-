{{ config(
    materialized = 'view'
) }}

with 

src_simplefin as (select * from {{ ref('stg_simplefin') }}),

src_historic_trxns as (select * from {{ ref('stg_historic_trxns') }}),

simplefin_full as (
    
        select
        transaction_id,
        account_id,
        account_name as original_account_name,
        mapped_account_name as account_name, -- Junior Checking, Student Checking, Blue Cash Preferred, etc.
        null as detailed_account_name,
        null as owner_name,
        institution_domain,
        institution_name, -- Wintrust, American Express, etc.
        amount,
        posted,
        posted_date,
        transacted_at,
        transacted_date,
        description,
        pending,
        null as source_category,
        null as master_category,
        import_timestamp,
        import_date,
        'simplefin' as source_name
    from src_simplefin

)

, historic_trxns_full as (

    select
        transaction_id,
        account_id,
        original_account_name,
        account_name,
        detailed_account_name,
        owner_name,
        institution_domain,
        institution_name,
        amount,
        posted,
        posted_date,
        transacted_at,
        transacted_date,
        description,
        pending,
        source_category,
        master_category,
        import_timestamp,
        import_date,
        'historic' as source_name
    from src_historic_trxns
    
)

, unioned_tables as (

    select * from simplefin_full
    union all
    select * from historic_trxns_full

)

, final as (

    select
        *
        -- Not sure that I need this column
        -- , institution_name || ' - ' || account_name as full_account_name
    from unioned_tables

)

select * from final