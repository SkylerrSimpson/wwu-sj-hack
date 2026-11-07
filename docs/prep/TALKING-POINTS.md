# Talking points (for the judges, in plain words)

Rewritten at 12:30 to match what was built. Only the few things worth saying out loud.

## The whole app in one breath

Ships broadcast their position in public (AIS). We took five recorded days of those positions around the Lummi Reservation, drew the reservation boundary on a map, and replay the days with every ship as a dot. Rules check each boat against the approved list; when one that is not approved crosses into Lummi waters, it turns suspicious and the staff member gets an email. A table beside the map says what kinds of vessels are inside right now.

    Public ship positions  →  rules: who is inside, who just crossed in  →  map, table, email alert

## Decisions worth explaining

1. **A recorded replay, not live tracking.** Live tracking needs a server that can fail on stage. The rules that find crossings are the same either way; going live only changes where the positions come from.
2. **The approved list and the name patterns belong to the Nation, and are edited in the app.** Vessels whose AIS name or call sign contains XWL (Lummi Nation), WSF (state ferries), SWN (Swinomish) or NKK (Nooksack) count as approved; staff can add or delete patterns and approve or watch-list any vessel by id. Nothing is stored on a server; it lives in the browser.
3. **We never say "illegal".** A crossing makes a vessel "suspicious" and the email says "not on the approved list" plus "self-reported AIS: corroborate before acting". Tribal officers refer cases involving non-members to Washington courts (RCW 10.92), so the tool produces a prompt and a record, not a verdict.
4. **No real boat is accused.** We checked the real data first: in five days the only vessels inside the reservation were the Lummi Island ferry, a patrol boat and two boats moored at a marina. So the one vessel that alerts in the demo is synthetic and labeled. Private boats (fishing, sailing, pleasure) show only as "Fishing, 24 m", in the app and in the repo.
5. **We say what it can't see.** Most fishing and recreational boats under 65 ft are not required to carry AIS, so no alert does not mean no unapproved boat was there. That sentence is on every page.

## Questions we should expect

- **"Why not MarineTraffic or Skylight?"** They are global tools. Ours runs on the Nation's own list and patterns, keeps them in the Nation's hands, and emails the right person with the right wording.
- **"Where does the boundary come from?"** The organizers' KML of the reservation. It agrees with the Census Bureau's polygon on every one of the 219,863 positions, and the map says "approximate, not a legal boundary".
- **"How do you know the rules are right?"** Every rule has a test that reads like the rule: a point inside the boundary, a crossing from outside to inside, a boat that stops transmitting goes blank after 30 minutes. Over the real five days the tests confirm only the synthetic vessel crosses in.
- **"What about tugs?"** The busiest anchoring in the data is tugs waiting off Cherry Point, 0.6 to 1.3 km outside the north-west edge, which matches the Nation's 2008 complaint about lost crab gear. A watch zone outside the boundary is the obvious next feature.
- **"Did AI build this?"** Claude Code paired on it, with a plan, a spec and tests written first; every decision is one line in docs/DECISIONS.md and we can explain each. The app itself runs no AI.
