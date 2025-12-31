{{ config(
    materialized = 'view',
) }}

with source as (
    select * from {{ source('public_sources', 'simplefin') }}
)

, account_mappings as (
    select * from {{ ref('simplefin_account_mappings') }}
)

-- | TRN-9dfa4f94-01a6-4187-91a9-33ab3fa8c6ed
-- | ACT-df9d25cf-18fa-4b53-b07a-e901c5976179
-- | Student Checking
-- | www.wintrust.com
-- | Wintrust Community Banks
-- | -1348.30
-- | 1764590400
-- | 2025-12-01T12:00:00
-- | 1764590400
-- | 2025-12-01T12:00:00
-- | Zelle Payment to Anthony Wei
-- | f

, final as (

    select
        source.transaction_id,
        source.account_id,
        source.account_name,
        coalesce(
            account_mappings.mapped_account_name,
            source.account_name
        ) as mapped_account_name,
        source.institution_domain,
        source.institution_name,
        source.amount::numeric             as amount,
        to_timestamp(source.posted)        as posted,
        source.posted_date::date           as posted_date,
        to_timestamp(source.transacted_at) as transacted_at,
        source.transacted_date::date       as transacted_date,
        source.description,
        source.pending,
        source.import_timestamp::timestamp as import_timestamp,
        source.import_date::date           as import_date,
        row_number() over (
            partition by source.transaction_id
            order by source.import_timestamp desc        ) as unique__check
    from source
    left join account_mappings
        on source.account_name = account_mappings.source_account_name
        and (
            account_mappings.account_id is null
            or account_mappings.account_id = ''
            or source.account_id = account_mappings.account_id
        )
    where 
        description not ilike '%PREAUTHORIZED DEBIT CHASE CREDIT%' -- Wintrust Credit Payments
        and description not ilike '%Chase Credit Card Transfer/Credit Card Payment%' -- Wintrust Debit Card Payments
        and description not ilike '%AMEX EPAYMENT/ACH PMT%' -- Amlagamated Amex Payments
        and description not ilike '%CHASE CREDIT CRD/AUTOPAY%' -- Amlagamated Chase Payments
        and description not ilike '%AUTOPAY PAYMENT%' -- Amex Payments
        and description not ilike '%ONLINE PAYMENT - THANK YOU%' -- Amex Payments
        and description not ilike '%AUTOMATIC PAYMENT - THANK%' -- Chase Payments
        and description not ilike '%Payment Thank You - Web%' -- Chase Payments

)

select * 
from final
-- Not available in Postgres: qualify row_number() over (partition by transaction_id order by import_timestamp desc) = 1
where unique__check = 1