{{ config(
    materialized = 'view',
) }}

with 

source as ( select * from {{ ref('historic_transactions') }} )

, account_mapping as (
    select * from {{ ref('seed_account_mapping_historic') }}
)

, accounts_mapped as (
    select
        source.*,
        coalesce(
            account_mapping.mapped_account_name,
            source.account_name, -- remove this if you want to force a mapping
            'Missing mapping! Add to seed_account_mapping_historic.csv'
        ) as mapped_account_name,
        coalesce(
            account_mapping.owner_name,
            source.account_name, -- remove this if you want to force a mapping
            'Missing mapping! Add to seed_account_mapping_historic.csv'
        ) as owner_name,
        coalesce(source.account_name, '') ||
            coalesce(source.amount::text, '') ||
            coalesce(source.transaction_date::text, '') ||
            coalesce(source.description, '')
        as base_transaction_id
    from source
    left join account_mapping
        on source.account_name = account_mapping.account_name
        and (
            account_mapping.additional_account_info is null
            or account_mapping.additional_account_info = ''
            or source.additional_account_detail::text = account_mapping.additional_account_info
        )
)

, dupe_row_nums as (

    select 
        *
        , row_number() over (
            partition by base_transaction_id 
            order by transaction_date
        ) as duplicates_row_number
    from accounts_mapped

)


, final as (

    select
        -- Create transaction_id from account_name | amount | transaction_date | description 
        -- ... and duplicates_row_number when needed
        'HIST_TRN_' || MD5(base_transaction_id || 
            duplicates_row_number::text)      as transaction_id,
        null::text                          as account_id,
        account_name::text                  as original_account_name,
        mapped_account_name::text           as account_name,
        additional_account_detail::text     as detailed_account_name,
        owner_name::text                    as owner_name,
        null::text                          as institution_domain,
        null::text                          as institution_name,
        amount::numeric                     as amount,
        null::timestamp                     as posted,
        null::date                          as posted_date,
        null::timestamp                     as transacted_at,
        transaction_date::date              as transacted_date,
        description::text                   as description,
        null::boolean                       as pending,
        source_category::text               as source_category,
        master_category::text               as master_category,
        null::timestamp                     as import_timestamp,
        to_date(input_date, 'MM/DD/YYYY')   as import_date
    from dupe_row_nums

)

select * from final
