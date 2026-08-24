# TODOs

## Short Term

### Dagster
- [ ] Upgrade Postgres 15 → 17/18 (optional)

## Other
- [ ] dbt hardening: materialize key views if perf/timing becomes an issue
- [ ] Scroll-to-top on long pages (optional UX)
- [ ] Show job progress/completion status after clicking Run buttons in the Web UI (right now the click gives no feedback until the job finishes). Tiers:
  - MVP (~2-4 hrs): backend endpoint polls Dagster GraphQL for run status; frontend polls every 2s and shows spinner + Running/Succeeded/Failed + toast
  - Solid (~1 day): step-by-step progress from the run's event log, disable Run button while active, link out to the Dagster UI for details
  - Great (~2 days): WebSocket subscription to Dagster's live events (no polling), streaming log tail, cancel button

## Long Term
- [ ] Untrack dbt/.user.yml `git rm --cached dbt/.user.yml`
- [ ] Add a flow for "Import CSV" of historic transaction
- [ ] Improve the filtering you can do on each page, perhaps create an accounts endpoint that allows you to easily filter by account, rather than by typing?


# Resources
- SimpleFin Dev Tools: https://www.simplefin.org/protocol.html
- https://beta-bridge.simplefin.org/my-account



