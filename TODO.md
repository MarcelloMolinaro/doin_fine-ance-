# TODOs

- [ ] Send app into Production
  - [x] Allow it to be hosted locally
  - [x] Make sure I can access the DB to create visualizations with Allegra locally
  - [ ] Determine (but don't need to implement yet) a backup system

## Short Term
- [ ] Make a readme note on forcing seed mapping - line 24 stg_simplefin.sql model
- [ ] un-version control my .env file and move it to example.env

### Dagster
- [ ] Using Postgres 15, it's a but old (Postgres 17/18 are new)

## Other
- [ ] Add ability to add categroies/ surface where the defaults live? transaction_service.py line 235
- [x] Add a .env variable and update docker-compose to change the postgres volume name 
- [ ] Remove bloat/tech debt in all of my code
- [ ] Consider making key referenced VIEW's -> tables - Would requiring adding dbt steps to button triggers
- [ ] Postgres - Bad = Pulling revelvant file; good = postgres DUMP = pg_dump
- [ ] Create button at bottom of long pages that sends you to the top? What's the convention here?

## Long Term
- [ ] Consider testing a Chrome MCP for Cursor to check its work?
- [ ] What's up with the .user.yml file? untrack that?
- [ ] Add a flow for "Import CSV" of historic transaction
- [ ] Consider an "Edit Validated Transactions" feature...
- [ ] Improve the filtering you can do on each page, perhaps create an accounts endpoint that allows you to easily filter by account, rather than by typing?


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account



