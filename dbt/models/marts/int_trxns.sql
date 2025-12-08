{{ config(
    materialized = 'view'
) }}

with 

src_simplefin as (select * from {{ ref('stg_simplefin') }}),

src_historic_trxns as (select * from {{ ref('stg_historic_trxns') }}),

final as (

    select
        transaction_id,
        account_id,
        account_name, -- Junior Checking, Student Checking, Blue Cash Preferred, etc.
        null as detailed_account_name,
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

    union all

    select
        transaction_id,
        account_id,
        account_name,
        detailed_account_name,
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

select * from final