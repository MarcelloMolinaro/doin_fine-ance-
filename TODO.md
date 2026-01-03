# TODOs

## Short Term
- [x] Improve Model Performance
- [ ] Consider testing a Chrome MCP for Cursor to check its work?
- [ ] Fix shitty focus on Transaction Categorization filters
- [ ] Make code updates to handle non-historic setups or different ones (with different categories?)
- [ ] Move Feature engineering out of python and into SQL?

## Marcello & Allegra Data issues
- [x] Pre Feb 3rd 2025, Allegra's Betterment 300$ are broken, listed as investment x2 and 1 transfer, should be transfer x2 and 1 investment (-300)
- [x] Sonic categorized as Utilities and Home
- [x] Apple.com monthly bill is misc/shopping/utilities - should be utilities
  - fixed historic and user_categories tables, waiting on full-refresh
- [ ] M1 is fucked, shows as income for a bunch of them

- [x] Fix different hash issue! Determine extent of problem
  - [x] I'm seeing for the Devil walnut Creek transaction it is in uncategorized AND validated but with different transaction ID's. I need to set the t_id to something that will not change anymore (done in dbt). Get the correct t_id's into the validated table (via user_categories table?) so that they don't show in uncategorized anymore.
  - [x] I don't understand why I have different types of transaction_id's in the validated table... -> must be a full-refresh issue?


## Other
  - [ ] Create sync script to sync config.yaml transaction exclusions to seed_transaction_exclusions.csv
- [ ] Add a Databricks source integration and test end-to-end
- [ ] Remove bloat/tech debt in all of my code
- [ ] Consider make key referenced VIEW's -> tables - Would requiring adding dbt steps to button triggers
- [ ] Postgres - Bad = Pulling revelvant file; good = postgres DUMP
- [ ] Tech debt: rename Jobs/refresh_validated_trxns to refresh_validated_trxns_pipeline


## Long Term
- [ ] What's up with the .user.yml file? untrack that?
- [ ] Learn about ML classifiers? Why are we using random forest here? What is Vectorized text?
  - [ ] Check out Ian's documents to see if they have good explanation
- [ ] Add a flow for "Import CSV" of historic transaction
- [ ] Consider an "Edit Validated Transactions" feature...
- [ ] Improve the filtering you can do on each page, perhaps create an accounts endpoint that allows you to easily filter by account, rather than by typing?


## Will not/Can not do
- [x] How to leverage the built in AMEX categories? Can i get them via simplefin? explore.
  - SAD :()


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account

#### Current Status & Issues (as of Dec 22 2024):
**Model Performance:**
- ✅ Precision: HIGH (80%) - predictions are accurate when made
- ❌ Recall: LOW (55%) - missing many transactions
- ⚠️ With confidence_threshold=0.45, not predicting enough transactions
- Model trained on 2022+ data only, ~4,500 training samples

**Improvements Needed:**
- [ ] **Adjust model parameters** to improve recall without sacrificing too much precision
  - Consider adding back `class_weight='balanced'`
  - Adjust confidence threshold (maybe 0.35-0.40)
  - Experiment with different max_depth, min_samples_leaf values
- [ ] **Build dbt models** to incorporate predictions in a way that surfaces the data
  - Create view/table that combines original transactions with predictions
  - Add logic to surface high-confidence predictions vs uncertain ones
  - Create summary tables by category, confidence level, date, etc.


