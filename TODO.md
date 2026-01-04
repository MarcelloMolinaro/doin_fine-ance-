# TODOs

## Short Term
- [x] Move Feature engineering out of python and into SQL?
- [ ] Make code updates to handle non-historic setups or different ones (with different categories?)
- [ ] Fix description filter - clear button does not work

- [ ] Consider testing a Chrome MCP for Cursor to check its work?
- [x] Improve Model Performance
- [x] Fix shitty focus on Transaction Categorization filters


## Marcello & Allegra Data issues
- [x] M1 is fucked, shows as income for a bunch of them
- [x] Add ACH Debit AUTOPAY CHASE CREDIT CRD ID4760039224 ID: 000000000032658 to exclusion list - already there
- [x] Add a job that runs dbt seed on historic + full refresh + refresh all necessary other models aftwerwards

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
- [ ] Make Transaciton Categorization description filters work as well as "ALl Data"


## Will not/Can not do
- [x] How to leverage the built in AMEX categories? Can i get them via simplefin? explore.
  - SAD :()


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account



