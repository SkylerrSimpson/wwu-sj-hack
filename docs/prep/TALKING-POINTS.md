# Talking points (for the judges, in plain words)

Only the few things worth saying out loud. Draft, revised after the audit: it changes as we build.

## The whole app in one breath

Ships broadcast their position in public. Our script takes one recorded day of those positions, checks each one against the map of Lummi waters, and turns them into "visits": who came in, when, how long they stayed, whether they anchored. A webpage lists the visits by vessels not on Lummi's approved list first, each with its track on a map and a record an officer can hand on.

    Public ship data  →  our script finds visits inside Lummi waters  →  webpage lists them, flagged first

## Decisions worth explaining

1. **A recorded day, not live tracking.** Live tracking needs a server that can fail mid-demo. The rules that find visits don't change; going live only adds a server. The screen shows the date, so nobody mistakes it for live.
2. **A referral record, not a verdict. We never say "illegal".** Tribal officers can't prosecute non-Indians: state law (RCW 10.92) sends those cases to Washington courts. So the tool says "not on the approved list" and lists the times, the gaps in the signal and "self-reported AIS", so an officer can corroborate before acting and hand the record on.
3. **No real identities, and the approved list is invented.** We strip names and numbers before anything is saved, and a banner says the list is invented. The real list, and where Lummi boats work, belong to the Lummi Nation. That's tribal data sovereignty (the CARE principles).
4. **We say what it can't see.** Most fishing and recreational boats under 65 ft don't have to carry AIS, so no flag does not mean no unapproved boat was there. That's on screen, not hidden in the docs.

## Questions we should expect

- **"Why not use Skylight or Global Fishing Watch?"** They're free for some agencies, but they're global tools. Ours runs on the Nation's own approved list, keeps that list in the Nation's hands, and produces a record shaped for a referral.
- **"Where does the boundary come from?"** The Census Bureau's Lummi Reservation boundary, which includes the tidelands. Its western edge matches the state's own closure line from Gooseberry Point to Sandy Point (WDFW 2026-27 rules). It's labeled approximate, not legal.
- **"How do you know it's right?"** Each visit rule has a test, and we note a known false result: boats moored at the Sandy Point marina sit inside the boundary, so we count them as moored, not as visits.
- **"Why is the ferry listed as one line?"** It crosses the boundary 26 times a day at its Gooseberry Point dock. We list every unapproved visit one by one and summarise approved vessels, so the one visit that matters isn't buried.
- **"Why is the only flagged boat synthetic?"** We checked real data first: one to three vessels a day transmit AIS inside these waters, none of them fishing boats. Our approved list is invented, so flagging a real boat against it would be a false statement. The synthetic vessel shows the tool's behaviour; the Nation's real list would make it real.
