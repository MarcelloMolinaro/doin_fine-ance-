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

)

select * 
from final
-- Not available in Postgres: qualify row_number() over (partition by transaction_id order by import_timestamp desc) = 1
where unique__check = 1