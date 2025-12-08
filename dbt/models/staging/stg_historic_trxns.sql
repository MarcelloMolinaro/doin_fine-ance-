{{ config(
    materialized = 'view',
) }}

with source as ( select * from {{ ref('historic_transactions') }} ),

final as (

    select
    -- TODO: Add transaction_id from historic transactions
        null::text                             as transaction_id,  
        null::text                             as account_id,
        account_name::text                     as account_name,
        type_account_person_account::text      as detailed_account_name,
        null::text                             as institution_domain,
        null::text                             as institution_name,
        amount::numeric                        as amount,
        null::timestamp                        as posted,
        null::date                             as posted_date,
        null::timestamp                        as transacted_at,
        transaction_date::date                 as transacted_date,
        description::text                      as description,
        null::boolean                          as pending,
        source_category::text                  as source_category,
        master_category::text                  as master_category,
        null::timestamp                        as import_timestamp,
        to_date(input_date, 'MM/DD/YYYY')      as import_date
    from source

)

select * from final