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
            account_mapping.mapped_account_name::text,
            source.account_name::text, -- remove this if you want to force a mapping
            'Missing mapping! Add to seed_account_mapping_historic.csv'
        ) as mapped_account_name,
        coalesce(
            account_mapping.owner_name::text,
            source.account_name::text, -- remove this if you want to force a mapping
            'Missing mapping! Add to seed_account_mapping_historic.csv'
        ) as owner_name,
        coalesce(source.account_name::text, '') ||
            coalesce(source.amount::text, '') ||
            coalesce(source.transaction_date::text, '') ||
            coalesce(source.description::text, '')
        as base_transaction_id
    from source
    left join account_mapping
        on source.account_name::text = account_mapping.account_name::text
        and (
            account_mapping.additional_account_info is null
            or account_mapping.additional_account_info::text = ''
            or source.additional_account_detail::text = account_mapping.additional_account_info::text
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
        case 
            when transaction_date is null then null::date
            else transaction_date::text::date
        end                                  as transacted_date,
        description::text                   as description,
        null::boolean                       as pending,
        source_category::text               as source_category,
        master_category::text               as master_category,
        null::timestamp                     as import_timestamp,
        case 
            when input_date is null or input_date::text = '' then null::date
            else to_date(input_date::text, 'MM/DD/YYYY')
        end                                  as import_date
    from dupe_row_nums

)

select * from final
