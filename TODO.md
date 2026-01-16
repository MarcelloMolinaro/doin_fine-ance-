# TODOs

## Today 1/14/26-1/15/26
- [x] Make app ready to share with others
  -[x] Make sure setup from scratch situtation is created
  -[x] Make sure no historical, no etc. other things doesn't break anything
  -[x] Handle missing historical = missing categories
  -[x] Make sure too few transactions doesn't break anything
  -[x] Mount the database like ben suggested
    ... decided to go with profiles / keep as is for performance on MacOS
  -[x] Convert the Dagster logs into Postgres database
  -[x] remove all PII from commit history
  -[x] remove all storage files from history
  -[x] revert the makefile to only prod
  - [x] NEED TO TEST THIS ALL WITH FRESH DB!!
  - [x] Commit a setup .env file
  - [x] Build docker compose so that it builds prod or dev based on .env variable

#### Setup Notes
  
  - [x] Create your env. variable with your simplefin credentials!
  - [x] Add in your historical data and transaction_exclusions!


- [ ] Send app into Production
  - Allow it to be hosted locally
  - Make sure I can access the DB to create visualizations with Allegra locally
  - Determine (but don't need to implement yet) a backup system

## MArcello & Allegra data issues
- what's up with 2 cebu air dupes
- dupes on mt hood ski bowl??

## Short Term
- [ ] Make a readme note on forcing seed mapping - line 24 stg_simplefin.sql model

### Dagster
- [ ] Using Postgres 15, it's a but old (Postgres 17/18 are new)

## Other
- [ ] Add ability to add categroies/ surface where the defaults live? transaction_service.py line 235
- [ ] Add a .env variable and update docker-compose to change the postgres volume name 
- [ ] Look into improving Docker process better? Could this be because the training model is being held in memory?
- [ ] Create sync script to sync config.yaml transaction exclusions to seed_transaction_exclusions.csv
- [ ] Add a Databricks source integration and test end-to-end
- [ ] Remove bloat/tech debt in all of my code
- [ ] Consider make key referenced VIEW's -> tables - Would requiring adding dbt steps to button triggers
- [ ] Postgres - Bad = Pulling revelvant file; good = postgres DUMP = pg_dump
- [ ] Create button at bottom of long pages that sends you to the top? What's the convention here?

## Long Term
- [ ] Consider testing a Chrome MCP for Cursor to check its work?
- [ ] What's up with the .user.yml file? untrack that?
- [ ] Learn about ML classifiers? Why are we using random forest here? What is Vectorized text?
  - [ ] Check out Ian's documents to see if they have good explanation
- [ ] Add a flow for "Import CSV" of historic transaction
- [ ] Consider an "Edit Validated Transactions" feature...
- [ ] Improve the filtering you can do on each page, perhaps create an accounts endpoint that allows you to easily filter by account, rather than by typing?


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account



