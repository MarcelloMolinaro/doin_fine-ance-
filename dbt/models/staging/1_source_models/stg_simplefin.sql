{{ config(
    materialized = 'view',
) }}

with source as (
    select * from {{ source('public_sources', 'simplefin') }}
)

, account_mapping as (
    select * from {{ ref('seed_account_mapping_simplefin') }}
)

, transaction_exclusions as (
    select pattern from {{ ref('seed_transaction_exclusions') }}
)

, deduped_by_txn as (

    select
        source.transaction_id,
        source.account_id,
        source.account_name,
        coalesce(
            account_mapping.mapped_account_name::text,
            source.account_name::text, -- comment out if you want to force a mapping
            'Missing mapping! Add to seed_account_mapping_simplefin.csv'
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
        source.import_date::timestamp      as import_date,
        row_number() over (
            partition by source.transaction_id
            order by source.import_timestamp desc
        ) as unique__check
    from source
    left join account_mapping
        on source.account_name::text = account_mapping.account_name::text
        and (
            account_mapping.account_id is null
            or account_mapping.account_id::text = ''
            or source.account_id::text = account_mapping.account_id::text
        )
    where not exists (
        select 1
        from transaction_exclusions
        where source.description ilike transaction_exclusions.pattern
    )

)

-- First dedup layer: one row per transaction_id (latest import wins).
-- Not available in Postgres: qualify row_number() over (...) = 1
, unique_transactions as (
    select * from deduped_by_txn where unique__check = 1
)

-- Second dedup layer: collapse reconnection duplicates.
--
-- When an account is disconnected and reconnected (or SimpleFIN re-issues an
-- account), the *same* real transaction reappears under a brand-new account_id
-- AND a brand-new transaction_id, so the transaction_id dedup above cannot catch
-- it. We identify the logical transaction by (institution, normalized account
-- name, date, amount, description) -- normalizing the account name strips the
-- trailing " (1234)" mask suffix that SimpleFIN sometimes appends, which is why
-- mapped_account_name is NOT reliable here (the same account_id can map to
-- different names across imports).
--
-- Guard against nuking *legitimately* identical same-day transactions: we only
-- drop rows when the collision spans MULTIPLE account_ids. Genuine repeats live
-- under a single account_id, so they all share the winning rank and survive.
, account_identity as (
    select
        *,
        regexp_replace(btrim(account_name::text), '\s*\([0-9]+\)\s*$', '') as _normalized_account_name
    from unique_transactions
)

, account_recency as (
    select
        *,
        -- Most recent import seen for THIS account_id within the logical group.
        max(import_timestamp) over (
            partition by
                institution_name,
                _normalized_account_name,
                transacted_date,
                amount,
                description,
                account_id
        ) as _account_group_last_import
    from account_identity
)

, reconnection_ranked as (
    select
        *,
        -- Rank the competing account_ids for each logical transaction by import
        -- recency; the live (most recent) connection wins. account_id is the
        -- deterministic tiebreaker so exactly one connection is kept.
        dense_rank() over (
            partition by
                institution_name,
                _normalized_account_name,
                transacted_date,
                amount,
                description
            order by _account_group_last_import desc, account_id
        ) as _reconnection_rank
    from account_recency
)

select
    transaction_id,
    account_id,
    account_name,
    mapped_account_name,
    institution_domain,
    institution_name,
    amount,
    posted,
    posted_date,
    transacted_at,
    transacted_date,
    description,
    pending,
    import_timestamp,
    import_date,
    unique__check
from reconnection_ranked
where _reconnection_rank = 1
