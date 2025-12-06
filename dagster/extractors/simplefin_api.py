import os
import base64
import requests
import pandas as pd
from dagster import asset
from datetime import datetime, timedelta
from urllib.parse import urlparse, urlunparse
from typing import Optional


@asset
def simplefin_financial_data():
    """
    Extracts financial data from SimpleFIN Bridge including:
    - Account information (bank accounts, credit cards)
    - Transaction data
    
    Environment variables required:
    - SIMPLEFIN_ACCESS_URL: Access URL with Basic Auth credentials
        Format: https://username:password@bridge.simplefin.org/simplefin
        This is obtained by claiming a SimpleFIN token (see TODO.md)
    
    TODO: Add comprehensive error handling for:
    - API rate limits
    - Network failures
    - Invalid credentials (403 responses)
    - Expired access URLs
    - Account connection issues
    
    TODO: Implement date range filtering via query parameters
    TODO: Support multiple access URLs for multiple institutions
    TODO: Add retry logic with exponential backoff
    TODO: Add data validation and schema enforcement
    TODO: Handle custom currencies (URL-based currency definitions)
    TODO: Add support for pending transactions (pending=1 parameter)
    TODO: Implement incremental updates instead of full refresh
    TODO: Move to Dagster ConfigurableResource for better configuration management
    TODO: Add function to claim SimpleFIN tokens programmatically
    """
    
    # Get access URL from environment variables
    # TODO: Move to Dagster ConfigurableResource for better secret management
    access_url = os.getenv('SIMPLEFIN_ACCESS_URL')
    
    if not access_url:
        raise ValueError(
            "SIMPLEFIN_ACCESS_URL environment variable is required. "
            "This should be in the format: https://username:password@bridge.simplefin.org/simplefin"
        )
    
    # Parse the access URL to extract credentials and base URL
    parsed = urlparse(access_url)
    base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
    
    # Extract username and password from netloc if present
    # Access URL format: https://username:password@host/path
    if '@' in parsed.netloc:
        auth_part, host_part = parsed.netloc.rsplit('@', 1)
        if ':' in auth_part:
            username, password = auth_part.split(':', 1)
        else:
            username = auth_part
            password = ''
    else:
        # If no credentials in URL, try to get from environment separately
        username = os.getenv('SIMPLEFIN_USERNAME')
        password = os.getenv('SIMPLEFIN_PASSWORD', '')
        if not username:
            raise ValueError(
                "Credentials not found in SIMPLEFIN_ACCESS_URL. "
                "Either include them in the URL or set SIMPLEFIN_USERNAME and SIMPLEFIN_PASSWORD"
            )
    
    all_accounts_data = []
    all_transactions_data = []
    
    try:
        # Get account and transaction data from SimpleFIN
        # TODO: Add configurable date range (start-date, end-date query parameters)
        # TODO: Add support for pending transactions (pending=1)
        # TODO: Add support for balances-only mode (balances-only=1)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=30)  # Last 30 days
        
        accounts_url = f"{base_url}/accounts"
        params = {
            'start-date': int(start_date.timestamp()),
            'end-date': int(end_date.timestamp())
        }
        
        # Make authenticated request
        response = requests.get(
            accounts_url,
            params=params,
            auth=(username, password),
            timeout=30
        )
        
        # Handle authentication errors
        if response.status_code == 403:
            raise ValueError(
                "Authentication failed (403). The access URL may be invalid, expired, "
                "or access may have been revoked. Check your SimpleFIN token."
            )
        
        # Handle payment required
        if response.status_code == 402:
            raise ValueError(
                "Payment required (402). The SimpleFIN service may require payment."
            )
        
        response.raise_for_status()
        
        data = response.json()
        
        # Check for errors in response
        errors = data.get('errors', [])
        if errors:
            # TODO: Sanitize error messages before displaying
            error_msg = "; ".join(errors)
            raise ValueError(f"SimpleFIN API returned errors: {error_msg}")
        
        accounts = data.get('accounts', [])
        
        # Extract account and transaction data
        for account in accounts:
            org = account.get('org', {})
            
            # Extract account data
            account_data = {
                'account_id': account.get('id'),
                'account_name': account.get('name'),
                'institution_domain': org.get('domain'),
                'institution_name': org.get('name'),
                'institution_id': org.get('id'),
                'currency': account.get('currency'),
                'balance': account.get('balance'),
                'available_balance': account.get('available-balance'),
                'balance_date': account.get('balance-date'),
                'extracted_at': datetime.now().isoformat()
            }
            all_accounts_data.append(account_data)
            
            # Extract transaction data
            transactions = account.get('transactions', [])
            for transaction in transactions:
                transaction_data = {
                    'transaction_id': transaction.get('id'),
                    'account_id': account.get('id'),
                    'account_name': account.get('name'),
                    'institution_domain': org.get('domain'),
                    'institution_name': org.get('name'),
                    'amount': transaction.get('amount'),
                    'posted': transaction.get('posted'),
                    'posted_date': datetime.fromtimestamp(transaction.get('posted', 0)).isoformat() if transaction.get('posted') else None,
                    'transacted_at': transaction.get('transacted_at'),
                    'transacted_date': datetime.fromtimestamp(transaction.get('transacted_at', 0)).isoformat() if transaction.get('transacted_at') else None,
                    'description': transaction.get('description'),
                    'pending': transaction.get('pending', False),
                    'extracted_at': datetime.now().isoformat()
                }
                all_transactions_data.append(transaction_data)
        
    except requests.exceptions.RequestException as e:
        # TODO: Add proper error handling and logging
        # TODO: Distinguish between different error types (auth, network, etc.)
        raise Exception(f"Error fetching data from SimpleFIN: {str(e)}")
    except Exception as e:
        raise Exception(f"Unexpected error processing SimpleFIN data: {str(e)}")
    
    # Combine accounts and transactions into DataFrames
    accounts_df = pd.DataFrame(all_accounts_data)
    transactions_df = pd.DataFrame(all_transactions_data)
    
    # TODO: Consider returning separate DataFrames for accounts and transactions
    # For now, combining them with a join on account_id
    if not accounts_df.empty and not transactions_df.empty:
        # Merge transactions with account info for richer data
        merged_df = transactions_df.merge(
            accounts_df[['account_id', 'account_name', 'institution_domain', 'institution_name', 'currency']],
            on='account_id',
            how='left',
            suffixes=('', '_account')
        )
        
        # TODO: Decide on return format - separate DataFrames or combined?
        # For MVP, returning combined with account info
        return merged_df
    elif not transactions_df.empty:
        return transactions_df
    elif not accounts_df.empty:
        return accounts_df
    else:
        # TODO: Handle case where no data is returned
        return pd.DataFrame()


def claim_simplefin_token(token: str) -> str:
    """
    Claims a SimpleFIN token and returns an Access URL.
    
    Args:
        token: Base64-encoded SimpleFIN token from user
    
    Returns:
        Access URL with Basic Auth credentials
    
    TODO: Add this as a helper function or separate asset for token management
    TODO: Handle 403 responses (token already claimed or invalid)
    """
    # Decode the Base64 token to get the claim URL
    try:
        claim_url = base64.b64decode(token).decode('utf-8')
    except Exception as e:
        raise ValueError(f"Invalid SimpleFIN token format: {str(e)}")
    
    # POST to the claim URL to get the access URL
    response = requests.post(claim_url, timeout=30)
    
    if response.status_code == 403:
        raise ValueError(
            "Token claim failed (403). The token may be invalid, expired, "
            "or already claimed. User should generate a new token."
        )
    
    response.raise_for_status()
    
    # The response body is the access URL
    access_url = response.text.strip()
    return access_url


if __name__ == "__main__":
    """
    Allow direct execution for testing in Docker container:
    
    docker-compose exec dagster python /opt/dagster/app/extractors/simplefin_api.py
    
    Or from within the container:
    python /opt/dagster/app/extractors/simplefin_api.py
    """
    import sys
    
    access_url = os.getenv('SIMPLEFIN_ACCESS_URL')
    
    if not access_url:
        print("ERROR: SIMPLEFIN_ACCESS_URL environment variable not set")
        print("\nSet it in docker-compose.yml or when running the container:")
        print('  SIMPLEFIN_ACCESS_URL="https://username:password@bridge.simplefin.org/simplefin"')
        sys.exit(1)
    
    print(f"Testing SimpleFIN extractor...")
    print(f"Access URL: {access_url.split('@')[0]}@***")  # Hide password
    print("-" * 60)
    
    try:
        df = simplefin_financial_data()
        
        print(f"\n✅ Success! Retrieved {len(df)} rows")
        print(f"\nColumns: {', '.join(df.columns.tolist())}")
        
        if len(df) > 0:
            print(f"\nFirst few rows:")
            print(df.head(10).to_string())
            
            print(f"\nDataFrame shape: {df.shape}")
            if 'amount' in df.columns:
                print(f"\nAmount summary:")
                print(df['amount'].describe())
        else:
            print("\n⚠️  No data returned (empty DataFrame)")
            
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
