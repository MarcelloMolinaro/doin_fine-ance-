{{ config(
    materialized = 'view',
) }}

with source as (
    select * from {{ source('public_sources', 'simplefin') }}
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
        transaction_id,
        account_id,
        account_name,
        case 
            when account_name = 'Junior Savers Savings' then 'Wintrust Savings'
            when account_name = 'Student Checking'      then 'Wintrust Checking'
            when account_name = 'Blue Cash Preferred®'  then 'Amex Shared'
            when 
                account_name = 'Chase Freedom Unlimited' and
                account_id = 'ACT-79364eca-c58a-46c0-8ea2-a414114ab918'
                then 'Chase Freedom - Marcello'
            when
                account_name = 'Chase Freedom Unlimited' and
                account_id = 'ACT-12c50460-e546-4cfb-bd23-ca6edd934e44'
                then 'Chase Freedom - Allegra'
            when 
                account_name = 'United Explorer' and
                account_id = 'ACT-d58aec93-610a-4455-bfba-eb9983433ef9'
                then 'Chase United - Marcello'
            when
                account_name = 'United Explorer' and
                account_id = 'ACT-4557534a-64d3-44fb-9a29-bf41397d0f83'
                then 'Chase United - Allegra'
            when account_name = 'ONLINE CHECKING-3633'          then 'Amalgamated'
            when account_name = 'VISTA Personal Money Market'   then 'Mountain One - Savings'
            when account_name = 'VISTA Premier Checking'        then 'Mountain One - Checking'
            else 'Missing mapping! talk to marcello stg_simplefin.sql'
        end as mapped_account_name,
        institution_domain,
        institution_name,
        amount::numeric             as amount,
        to_timestamp(posted)        as posted,
        posted_date::date           as posted_date,
        to_timestamp(transacted_at) as transacted_at,
        transacted_date::date       as transacted_date,
        description,
        pending,
        import_timestamp::timestamp as import_timestamp,
        import_date::timestamp      as import_date,
        row_number() over (
            partition by transaction_id
            order by import_timestamp desc
        ) as unique__check
    from source
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