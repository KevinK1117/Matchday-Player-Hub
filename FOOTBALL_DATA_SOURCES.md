# Additional football evidence

OpenLigaDB is active without credentials. Its completed league results now inform draw/outsider goal expectations and scorer opponent defence, in addition to the separate scores list.

Optional server-side Vercel production variables:

- `FOOTBALL_DATA_TOKEN`: football-data.org v4 token (https://www.football-data.org/client/register).
- `SPORTMONKS_API_TOKEN`: Sportmonks v3 token (https://my.sportmonks.com/).

Set secrets in the Vercel dashboard and redeploy. Never put tokens in HTML, Git, or public frontend variables. Only subscribed competitions can return data. Neither adapter implies worldwide coverage. Missing keys, failures and pagination limits are reported in `additionalProviders`; no subscription is purchased automatically.

Adapters request completed results before the analysis date, cache for five minutes, use bounded requests, and skip failures. Exact normalized team names or provider short names and a supported league mapping are required. Three distinct nonconflicting matches are needed. Duplicate matches are counted once. No guessed IDs or fuzzy name matching.

The current league mapping supports German divisions 1–3, Premier League, La Liga, Serie A, Ligue 1, Eredivisie, Liga Portugal, Saudi Pro League, Champions League and Europa League. Other competitions can match when both competition and country names agree exactly across providers; otherwise existing API-Sports analysis is retained.

Additional recent result form contributes 15% to goal expectations (both teams must have sufficient data) and 15% to opponent defence in scorer ranking; if defence was absent, it can supply that context. These heuristic weights are not calibrated. Result sources may describe the same underlying games: they do not count as independent forecast validation. Sources and sample sizes appear in the card details. Historical form in live details is descriptive; it does not alter current live odds or imply half-time probabilities.

Live percentages are `100 / verified decimal odds`, including bookmaker margin; absent odds show `– %`. No probability is fabricated. Player-level xG, injury and lineup evidence still requires the existing API-Sports/licensed feeds.

Documentation: https://docs.football-data.org/general/v4/match.html and https://docs.sportmonks.com/v3/endpoints-and-entities/endpoints/fixtures/get-fixtures-by-date-range
