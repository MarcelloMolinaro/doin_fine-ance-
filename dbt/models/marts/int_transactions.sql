{{ config(
    materialized = 'view'
) }}

with 

src_simplefin as (select * from {{ ref('stg_simplefin') }}),

src_historic as (select * from {{ ref('stg_historic_transactions') }}),

transformed_historic as (
    select
        null::text as transaction_id,  -- TODO: Add transaction_id from historic transactions
        null::text as account_id,
        account_name::text as account_name,
        type_account_person_account::text as detailed_account_name,
        null::text as institution_domain,
        null::text as institution_name,
        amount::numeric as amount,
        null::boolean as posted,
        null::date as posted_date,
        null::bigint as transacted_at,
        transaction_date::date as transacted_date,
        description::text as description,
        null::boolean as pending,
        source_category::text as source_category,
        master_category::text as master_category,
        input_date::timestamp as import_timestamp,
        input_date::date as import_date
    from src_historic
),

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
    from transformed_historic

)

select * from final