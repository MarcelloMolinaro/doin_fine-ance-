import os
import re
import base64
import requests
import pandas as pd
from dagster import asset
from datetime import datetime, timedelta
from urllib.parse import urlparse, urlunparse
from typing import Optional


@asset
def simplefin_financial_data(context):
    """
    Extracts financial transaction data from SimpleFIN Bridge.
    
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
    # Access URL format: https://username:password@host/path
    parsed = urlparse(access_url)
    
    # Require HTTPS (never HTTP) for security
    if parsed.scheme != 'https':
        raise ValueError(
            "SIMPLEFIN_ACCESS_URL must use HTTPS (not HTTP). "
            "This is required for secure transmission of financial data."
        )
    
    base_url = f"{parsed.scheme}://{parsed.netloc}{parsed.path.rstrip('/')}"
    
    # Extract username and password from the URL
    if '@' not in parsed.netloc:
        raise ValueError(
            "SIMPLEFIN_ACCESS_URL must include credentials in the format: "
            "https://username:password@bridge.simplefin.org/simplefin"
        )
    
    auth_part, host_part = parsed.netloc.rsplit('@', 1)
    if ':' not in auth_part:
        raise ValueError(
            "SIMPLEFIN_ACCESS_URL must include both username and password: "
            "https://username:password@bridge.simplefin.org/simplefin"
        )
    
    username, password = auth_part.split(':', 1)
    
    # all_accounts_data = []  # Commented out - not needed for now
    all_transactions_data = []
    
    # Capture import timestamp for all transactions
    import_timestamp = datetime.now()
    import_date = import_timestamp.date()
    
    try:
        # Get account and transaction data from SimpleFIN
        # SimpleFIN API has a 60-day limit per request, so we need to paginate
        # TODO: Add configurable date range (start-date, end-date query parameters)
        # TODO: Add support for pending transactions (pending=1)
        # TODO: Add support for balances-only mode (balances-only=1)
        end_date = datetime.now()
        start_date = end_date - timedelta(days=200)  # Last 200 days, no accounts support more
        
        # SimpleFIN API limit: 60 days per request
        MAX_DAYS_PER_REQUEST = 60
        accounts_url = f"{base_url}/accounts"
        
        # Calculate number of requests needed
        total_days = (end_date - start_date).days
        num_requests = (total_days + MAX_DAYS_PER_REQUEST - 1) // MAX_DAYS_PER_REQUEST  # Ceiling division
        context.log.info(f"Fetching {total_days} days of data using {num_requests} requests (max {MAX_DAYS_PER_REQUEST} days per request)")
        
        # Track transactions by ID to deduplicate across requests
        seen_transaction_ids = set()
        successful_institutions = set()
        failed_institutions = set()
        
        # Make requests in 60-day chunks
        current_start = start_date
        request_num = 0
        
        while current_start < end_date:
            request_num += 1
            # Calculate end date for this chunk (either 60 days later, or end_date if smaller)
            current_end = min(current_start + timedelta(days=MAX_DAYS_PER_REQUEST), end_date)
            
            context.log.info(f"Request {request_num}/{num_requests}: Fetching data from {current_start.date()} to {current_end.date()}")
            
            params = {
                'start-date': int(current_start.timestamp()),
                'end-date': int(current_end.timestamp())
            }
            
            try:
                # Make authenticated request with SSL/TLS certificate verification
                response = requests.get(
                    accounts_url,
                    params=params,
                    auth=(username, password),
                    timeout=60,  # Increased timeout for larger date ranges
                    verify=True  # Explicitly verify SSL/TLS certificates
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
                
                # Check for errors in response - log as warnings but don't fail
                # This allows other institutions to process even if one has issues
                errors = data.get('errors', [])
                if errors:
                    # Sanitize error messages to remove potentially sensitive information
                    sanitized_errors = []
                    for error in errors:
                        # Remove any URLs, tokens, or credentials that might appear in error messages
                        sanitized = error
                        # Remove URLs
                        sanitized = re.sub(r'https?://[^\s]+', '[URL_REMOVED]', sanitized)
                        # Remove potential tokens (long alphanumeric strings)
                        sanitized = re.sub(r'[A-Za-z0-9]{32,}', '[TOKEN_REMOVED]', sanitized)
                        sanitized_errors.append(sanitized)
                    error_msg = "; ".join(sanitized_errors)
                    context.log.warning(f"SimpleFIN API returned errors for date range {current_start.date()} to {current_end.date()} (continuing with available data): {error_msg}")
                
                accounts = data.get('accounts', [])
                
                # Extract transaction data
                for account in accounts:
                    org = account.get('org', {})
                    institution_name = org.get('name', 'Unknown')
                    
                    try:
                        # Extract transaction data
                        transactions = account.get('transactions', [])
                        chunk_transaction_count = 0
                        
                        for transaction in transactions:
                            transaction_id = transaction.get('id')
                            
                            # Deduplicate: skip if we've already seen this transaction
                            if transaction_id in seen_transaction_ids:
                                continue
                            seen_transaction_ids.add(transaction_id)
                            
                            transaction_data = {
                                'transaction_id': transaction_id,
                                'account_id': account.get('id'),
                                'account_name': account.get('name'),
                                'institution_domain': org.get('domain'),
                                'institution_name': institution_name,
                                'amount': transaction.get('amount'),
                                'posted': transaction.get('posted'),
                                'posted_date': datetime.fromtimestamp(transaction.get('posted', 0)).isoformat() if transaction.get('posted') else None,
                                'transacted_at': transaction.get('transacted_at'),
                                'transacted_date': datetime.fromtimestamp(transaction.get('transacted_at', 0)).isoformat() if transaction.get('transacted_at') else None,
                                'description': transaction.get('description'),
                                'pending': transaction.get('pending', False),
                                'import_timestamp': import_timestamp.isoformat(),
                                'import_date': import_date.isoformat()
                                ,'extra': transaction.get('extra')
                            }
                            all_transactions_data.append(transaction_data)
                            chunk_transaction_count += 1
                        
                        if chunk_transaction_count > 0:
                            successful_institutions.add(institution_name)
                            context.log.info(f"  Added {chunk_transaction_count} transactions from {institution_name} (date range: {current_start.date()} to {current_end.date()})")
                        
                    except Exception as e:
                        failed_institutions.add(institution_name)
                        context.log.warning(f"Failed to process account '{account.get('name')}' from {institution_name} for date range {current_start.date()} to {current_end.date()}: {str(e)}")
                        continue
                
            except requests.exceptions.RequestException as e:
                context.log.warning(f"Request failed for date range {current_start.date()} to {current_end.date()}: {str(e)}. Continuing with next date range...")
                # Continue to next date range instead of failing entirely
            except Exception as e:
                context.log.warning(f"Unexpected error for date range {current_start.date()} to {current_end.date()}: {str(e)}. Continuing with next date range...")
            
            # Move to next date range
            current_start = current_end
        
        # Log summary
        context.log.info(f"Completed fetching data. Total transactions collected: {len(all_transactions_data)}")
        if successful_institutions:
            context.log.info(f"Successfully processed institutions: {', '.join(sorted(successful_institutions))}")
        if failed_institutions:
            context.log.warning(f"Failed to process institutions: {', '.join(sorted(failed_institutions))}")
        
    except requests.exceptions.RequestException as e:
        # TODO: Add proper error handling and logging
        # TODO: Distinguish between different error types (auth, network, etc.)
        raise Exception(f"Error fetching data from SimpleFIN: {str(e)}")
    except Exception as e:
        raise Exception(f"Unexpected error processing SimpleFIN data: {str(e)}")
    
    # Return transactions DataFrame
    transactions_df = pd.DataFrame(all_transactions_data)
    
    if transactions_df.empty:
        return pd.DataFrame()
    
    return transactions_df

# def claim_simplefin_token(token: str) -> str:
#     """
#     Claims a SimpleFIN token and returns an Access URL.
    
#     Args:
#         token: Base64-encoded SimpleFIN token from user
    
#     Returns:
#         Access URL with Basic Auth credentials
    
#     TODO: Add this as a helper function or separate asset for token management
#     TODO: Handle 403 responses (token already claimed or invalid)
#     """
#     # Decode the Base64 token to get the claim URL
#     try:
#         claim_url = base64.b64decode(token).decode('utf-8')
#     except Exception as e:
#         raise ValueError(f"Invalid SimpleFIN token format: {str(e)}")
    
#     # Require HTTPS (never HTTP) for security
#     parsed_claim = urlparse(claim_url)
#     if parsed_claim.scheme != 'https':
#         raise ValueError(
#             "Claim URL must use HTTPS (not HTTP). "
#             "This is required for secure transmission of financial data."
#         )
    
#     # POST to the claim URL to get the access URL with SSL/TLS certificate verification
#     response = requests.post(claim_url, timeout=30, verify=True)
    
#     if response.status_code == 403:
#         raise ValueError(
#             "Token claim failed (403). The token may be invalid, expired, "
#             "or already claimed. User should generate a new token."
#         )
    
#     response.raise_for_status()
    
#     # The response body is the access URL
#     access_url = response.text.strip()
#     return access_url

if __name__ == "__main__":
    """
    Allow direct execution for testing in Docker container:
    
    docker-compose exec dagster python /opt/dagster/app/extractors/simplefin_api.py
    
    Or from within the container:
    python /opt/dagster/app/extractors/simplefin_api.py
    """
    import sys
    from dagster import build_op_context
    
    access_url = os.getenv('SIMPLEFIN_ACCESS_URL')
    
    if not access_url:
        print("ERROR: SIMPLEFIN_ACCESS_URL environment variable not set")
        print("\nSet it in docker-compose.yml:")
        print('  SIMPLEFIN_ACCESS_URL="https://username:password@beta-bridge.simplefin.org/simplefin"')
        sys.exit(1)
    
    print(f"Testing SimpleFIN extractor...")
    print(f"Access URL (first 15 chars): {access_url[:15]}")
    print("-" * 60)
    
    try:
        # Create a proper Dagster context for testing
        context = build_op_context()
        
        df = simplefin_financial_data(context)
        
        print(f"\n✅ Success! Retrieved {len(df)} rows")
        print(f"\nColumns: {', '.join(df.columns.tolist())}")
        
        if len(df) > 0:
            print(f"\nFirst few rows:")
            print(df.head(10).to_string())
        else:
            print("\n⚠️  No data returned (empty DataFrame)")
            
    except Exception as e:
        print(f"\n❌ Error: {str(e)}")
        import traceback
        traceback.print_exc()
        sys.exit(1)
