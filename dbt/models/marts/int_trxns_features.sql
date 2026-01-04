{{ config(
    materialized = 'view',
) }}

with 

src as (select * from {{ ref('int_trxns') }})

, final as (

    select
        transaction_id,
        account_id,
        original_account_name,
        account_name,
        detailed_account_name,
        owner_name,
        -- institution_domain,
        institution_name,
        amount,
        posted_date,
        transacted_date,
        description,
        pending,
        source_category,
        master_category,
        import_timestamp,
        import_date,
        source_name,
        
        -- Text features
        coalesce(description, '') || ' ' || 
        coalesce(account_name, '') || ' ' || 
        coalesce(institution_name, '') as combined_text,
        
        -- Date features
        -- PostgreSQL's extract(dow) returns 0=Sunday, 6=Saturday
        -- Convert to pandas convention: 0=Monday, 6=Sunday
        case extract(dow from transacted_date)::integer
            when 0 then 6  -- Sunday -> 6
            when 1 then 0  -- Monday -> 0
            when 2 then 1  -- Tuesday -> 1
            when 3 then 2  -- Wednesday -> 2
            when 4 then 3  -- Thursday -> 3
            when 5 then 4  -- Friday -> 4
            when 6 then 5  -- Saturday -> 5
        end as day_of_week,
        extract(month from transacted_date)::integer as month,      -- 1-12
        extract(day from transacted_date)::integer as day_of_month, -- 1-31
        
        -- Amount features
        case when amount < 0 then 1 else 0 end as is_negative,
        abs(amount) as amount_abs,
        
        -- Amount bucket feature
        case 
            when abs(amount) <= 10 then 0      -- micro
            when abs(amount) <= 50 then 1      -- small
            when abs(amount) <= 100 then 2     -- medium
            when abs(amount) <= 500 then 3     -- large
            when abs(amount) > 500 then 4      -- huge
            else 5                             -- N/A or Null
        end as amount_bucket,
        
        -- Keyword features
        case 
            when lower(coalesce(description, '')) ~* 'hotel|airbnb|inn|resort|motel|hipcamp|booking' then 1 
            else 0 
        end as has_hotel_keyword,
        
        case 
            when lower(coalesce(description, '')) ~* 'shell|chevron|exxon|bp|mobil|gas|fuel|76|arco' then 1 
            else 0 
        end as has_gas_keyword,
        
        case 
            when lower(coalesce(description, '')) ~* 'safeway|costco|trader|whole foods|kroger|grocery|market|albertsons|bowlberkeley' then 1 
            else 0 
        end as has_grocery_keyword,
        
        case 
            when lower(coalesce(description, '')) ~* 'restaurant|cafe|coffee|starbucks|mcdonald|burger|pizza|chipotle|dining' then 1 
            else 0 
        end as has_restaurant_keyword,
        
        case 
            when lower(coalesce(description, '')) ~* 'uber|lyft|taxi|bart|metro|transit|parking|toll' then 1 
            else 0 
        end as has_transport_keyword,
        
        case 
            when lower(coalesce(description, '')) ~* 'amazon|target|walmart|ebay|etsy|shop|store' then 1 
            else 0 
        end as has_shop_keyword,
        
        case 
            when lower(coalesce(description, '')) ~* 'airline|united|delta|american|southwest|jetblue|alaska|spirit|frontier|airlines|flight' then 1 
            else 0 
        end as has_flight_keyword,
        
        case 
            when lower(coalesce(description, '')) ~* 'annual|membership|fee' then 1 
            else 0 
        end as has_credit_fee_keyword,
        
        case 
            when lower(coalesce(description, '')) ~* 'interest' then 1 
            else 0 
        end as has_interest_keyword
        
    from src

)

select * from final

