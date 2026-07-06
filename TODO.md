# TODOs

## Short Term
- [ ] Overwrite the source account names in the validated table...
    - [x] add the remaining account mappings to the seed file
    - [ ] make it so the seeds don't show in git (gitignore wtf?)
- [ ] Make a readme note on forcing seed mapping - line 24 stg_simplefin.sql model
- [ ] Ability to mark a transaction as "Exclude from forecasting"


### Dagster
- [ ] Using Postgres 15, it's a but old (Postgres 17/18 are new)

## Other
- [ ] Add ability to add categroies/ surface where the defaults live? transaction_service.py line 235
- [ ] Remove bloat/tech debt in all of my code
- [ ] Consider making key referenced VIEW's -> tables - Would requiring adding dbt steps to button triggers
- [ ] Postgres - Bad = Pulling revelvant file; good = postgres DUMP = pg_dump
- [ ] Create button at bottom of long pages that sends you to the top? What's the convention here?

## Long Term
- [ ] Consider testing a Chrome MCP for Cursor to check its work?
- [ ] What's up with the .user.yml file? untrack that?
- [ ] Add a flow for "Import CSV" of historic transaction
- [ ] Improve the filtering you can do on each page, perhaps create an accounts endpoint that allows you to easily filter by account, rather than by typing?


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account



