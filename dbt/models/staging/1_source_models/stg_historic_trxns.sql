{{ config(
    materialized = 'view',
) }}

with 

source as ( select * from {{ ref('historic_transactions') }} )

, account_mappings as ( select * from {{ ref('account_mappings') }} )

, accounts_mapped as (
    select
        source.*,
        coalesce(
            account_mappings.mapped_account_name,
            source.account_name
        ) as mapped_account_name,
        account_mappings.owner_name,
        row_number() over (order by transaction_date) as original_row_number
    from source
    left join account_mappings
        on source.account_name = account_mappings.source_account_name
        and (
            account_mappings.detailed_account_info is null
            or account_mappings.detailed_account_info = ''
            or source.additional_account_info::text = account_mappings.detailed_account_info
        )
)


, final as (

    select
        -- Create transaction_id from account_name | amount | transaction_date | description
        ('HIST_TRN_' ||
        MD5(coalesce(account_name, '') ||
        coalesce(amount::text, '') ||
        coalesce(transaction_date::text, '') ||
        coalesce(description, '') ||
        coalesce(original_row_number::text, ''))
        )::text                                as transaction_id,  
        null::text                             as account_id,
        account_name::text                     as original_account_name,
        mapped_account_name::text              as account_name,
        additional_account_info::text          as detailed_account_name,
        owner_name::text                       as owner_name,
        null::text                             as institution_domain,
        null::text                             as institution_name,
        case
            when amount is null or amount = '' or amount = '#VALUE!' then null::numeric
            else amount::numeric
        end as amount,
        null::timestamp                        as posted,
        null::date                             as posted_date,
        null::timestamp                        as transacted_at,
        transaction_date::date                 as transacted_date,
        description::text                      as description,
        null::boolean                          as pending,
        source_category::text                  as source_category,
        master_category::text                  as master_category,
        null::timestamp                        as import_timestamp,
        case
            when input_date is null then null::date
            when input_date ~ '^\d{1,2}/\d{1,2}/\d{4}$' then to_date(input_date, 'MM/DD/YYYY')
            when input_date ~ '^\d{4}-\d{1,2}-\d{1,2}$' then to_date(input_date, 'YYYY-MM-DD')
            else null::date
        end as import_date
        from accounts_mapped

)

select * from final