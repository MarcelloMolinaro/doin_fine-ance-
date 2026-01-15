# TODOs

## Today 1/14/26-1/15/26
- [ ] Make app ready to share with others
  -[x] Make sure setup from scratch situtation is created
  -[x] Make sure no historical, no etc. other things doesn't break anything
  -[x] Handle missing historical = missing categories
  -[x] Make sure too few transactions doesn't break anything
  -[x] Mount the database like ben suggested
    ... decided to go with profiles / keep as is for performance on MacOS
  -[ ] Convert the Dagster logs into Postgres database
  -[x] remove all PII from commit history
  -[ ] remove all storage files from history
  -[ ] revert the makefile to only prod
  - [ ] NEED TO TEST THIS ALL WITH FRESH DB!!

#### Setup Notes
  - docker compose up ("make app" or "make prod")
  - Create your env. variable with your simplefin credentials!
  - Add in your historical data and transaction_exclusions!
  - "Run ingest & predict Job" button (or do the job! http://localhost:3000/locations/repo.py/jobs/2_ingest_and_predict)
  - Currently there is no way to check other than this command whether it worked...
    ```
    docker exec -it postgres psql -U dagster -d dagster
    select * from public.simplefin;
    ```
  - Navigate to Dagster -> Jobs -> 3_run_all_dbt_models (http://localhost:3000/locations/repo.py/jobs/3_run_all_dbt_models)
  - Return to Transaction Categorization to determine if it worked? Do you see Transactions Unpredicted?
  - Navigate to Validated tab and hit Refresh Validated or 4_refresh_validated_retrain_repredict job (http://localhost:3000/locations/repo.py/jobs/4_refresh_validated_retrain_repredict) to run predictions!


- [ ] Send app into Production
  - Allow it to be hosted locally
  - Make sure I can access the DB to create visualizations with Allegra locally
  - Determine (but don't need to implement yet) a backup system


## Short Term
- [x] Figure out the seed-mapping situation so that it's an either or ...
- [ ] Make a readme note on forcing seed mapping - line 24 stg_simplefin.sql model
- [x] edit training code so that my one-off filters (lodging and pre-2022 are not included in committed code!)
- [x] Make code updates to handle non-historic setups or different ones (with different categories?)
- [x] Consider making a dagster init job? (ingest & predict -> run_all_dbt_models -> refresh_validated_trxns) - Done! Use 1_dagster_init
- [x] Fix description filter - clear button does not work
- [x] Fix notes input - allowqs only 1 character at a time

- [x] Improve Model Performance
- [x] Fix shitty focus on Transaction Categorization filters
### Dagster
- [x] Figure out how to store Dagster metadata in a postgres database not in a storage file
- [ ] Using Postgres 15, it's a but old (Postgres 17/18 are new)
- [x] Stg_simplefin requires the existince of simplefin data and the load to postgres -> need to build but 
  - need to initialize the simplefin postgres source tbale (simplefin)
  - need to initialize the predictions table (predict_transaction)
  - Maybe show the dag with extra arrows for this process
  - add to the int_db.py file

## Marcello & Allegra Data issues
- [ ] ...

## Other
- [ ] Add ability to add categroies/ surface where the defaults live? transaction_service.py line 235
- [ ] Add a .env variable and update docker-compose to change the postgres volume name 
- [ ] Look into improving Docker process better? Could this be because the training model is being held in memory?
- [ ] Create sync script to sync config.yaml transaction exclusions to seed_transaction_exclusions.csv
- [ ] Add a Databricks source integration and test end-to-end
- [ ] Remove bloat/tech debt in all of my code
- [ ] Consider make key referenced VIEW's -> tables - Would requiring adding dbt steps to button triggers
- [ ] Postgres - Bad = Pulling revelvant file; good = postgres DUMP = pg_dump
- [x] Tech debt: rename Jobs/refresh_validated_trxns to refresh_validated_trxns_pipeline - Done! Now 4_refresh_validated_retrain_repredict
- [ ] Create button at bottom of long pages that sends you to the top? What's the convention here?

## Long Term
- [ ] Consider testing a Chrome MCP for Cursor to check its work?
- [ ] What's up with the .user.yml file? untrack that?
- [ ] Learn about ML classifiers? Why are we using random forest here? What is Vectorized text?
  - [ ] Check out Ian's documents to see if they have good explanation
- [ ] Add a flow for "Import CSV" of historic transaction
- [ ] Consider an "Edit Validated Transactions" feature...
- [ ] Improve the filtering you can do on each page, perhaps create an accounts endpoint that allows you to easily filter by account, rather than by typing?
- [x] Make Transaciton Categorization description filters work as well as "ALl Data"
- [ ] Spawn a new container per asset as default? The way I'm doing it means crashing a single asset crashes the container -> Look into this more?


## Will not/Can not do
- [x] How to leverage the built in AMEX categories? Can i get them via simplefin? explore.
  - SAD :()


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account



