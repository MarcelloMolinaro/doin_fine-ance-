# TODOs

## Short Term
- [ ] Overwrite the source account names in the validated table...
    - [ ] make it so the seeds don't show in git (gitignore wtf?)
- [ ] README: note "comment out line 25 in stg_simplefin.sql to force seed mapping"

### Dagster
- [ ] Upgrade Postgres 15 → 17/18 (optional)

## Other
- [ ] dbt hardening: materialize key views if perf/timing becomes an issue
- [ ] Postgres - Bad = Pulling revelvant file; good = postgres DUMP = pg_dump
- [ ] Scroll-to-top on long pages (optional UX)

## Long Term
- [ ] Consider testing a Chrome MCP for Cursor to check its work?
- [ ] Untrack dbt/.user.yml `git rm --cached dbt/.user.yml`
- [ ] Add a flow for "Import CSV" of historic transaction
- [ ] Improve the filtering you can do on each page, perhaps create an accounts endpoint that allows you to easily filter by account, rather than by typing?


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account



