# Data notes

Anyone who uses this data will ask: where did it come from, how clean is it, what can it not tell us.

## Sources

| id       | what it is                                                                                       | url                                           | retrieved  | licence or terms                                              |
| -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- | ---------- | ------------------------------------------------------------- |
| ais      | AIS positions, Dec 5 to 9 2024 UTC, Bellingham Bay to Cherry Point, handed out by the organizers | https://marinecadastre.gov/ais                | 2026-11-07 | NOAA MarineCadastre, public domain (CC0)                      |
| boundary | Lummi Indian Reservation boundary, a KML polygon handed out by the organizers                    | https://lumminaturalresources.org/            | 2026-11-07 | Event material; the Nation's own layer says not for legal use |
| demo     | One synthetic vessel we invented                                                                 | https://github.com/SkylerrSimpson/wwu-sj-hack | 2026-11-07 | Ours                                                          |

`data/raw/` holds the event's AIS file zipped and the KML as given. The organizers' files arrived with their names swapped (the `.jpg` was the KML, the `.txt` was the CSV); `raw/` uses the names of what they are.

The committed zip is not the original byte for byte: `strip.py` (`uv run strip.py <csv> <zip>`) reads the event's CSV, blanks `VesselName`, `IMO` and `CallSign` on every row of a private boat (the rule under Cleaning, one function in `check.py` that `build.py` uses too), replaces the `MMSI` of those rows with a pseudonym `P0001` to `P0153` (one per boat, numbered in sorted-MMSI order, so `build.py`'s sort by MMSI gives the same `private-n` ids), keeps every other column and all 219,863 rows in their order, and writes the result as the single entry `ais-2024-12-05-to-09.csv`, deflate level 9. A refreshed NOAA file goes through the same script before it is committed. The original stays in `data/lummifiles/`, which is ignored by version control. Tests read the zip and refuse any private row with a name, IMO, call sign or nine-digit MMSI, and any public row with a pseudonym.

## Cleaning

- 99 exact duplicate rows dropped, and one position kept per vessel per 5 minutes: 219,863 rows become 124,445 positions, plus 21 for the synthetic vessel.
- AIS type codes recoded to words (30 Fishing; 31, 32, 52 Tug; 36 Sailing; 37 Pleasure craft; 55 Law enforcement; 60s Passenger; 70s Cargo; 80s Tanker; anything else Other).
- Private boats (153 of the 224 vessels) are anonymised: named by type and length only, such as "Fishing, 24 m", with an empty `callsign` and ids `private-1` to `private-153` given in sorted-MMSI order, so nobody can look one up. A boat is private when its AIS type is 30, 36 or 37 (fishing, sailing, pleasure craft), or when its type is one we recode as Other and it is under 20 m or has no length: six such boats, 8 to 17 m with type codes such as 40, 51, 90 and 99, were named before this rule, and a 9 m boat is somebody's skiff whatever code its owner picked. The three Other vessels of 33 m and longer keep their names. AIS is public, but a private boat's name, call sign or MMSI identifies its owner. Commercial vessels keep their AIS name, call sign and MMSI as id. A vessel with no name gets its type. Vessels are sorted by id, so `private-10` comes before `private-2`. `check.py` refuses a private boat with any other id shape or with a call sign, an open boundary ring, a track out of time order, and `priority` that disagrees with `fleet`.
- `fleet` is set from an explicit list invented for the demo: the Lummi Island ferry _Whatcom Chief_ (368011730) is "Whatcom County ferry" and the patrol boat _Lengesot_ (338162321) is "Law enforcement, listed"; everyone else is null, and `priority` is true exactly when `fleet` is set. The name patterns the PM gave (XWL Lummi Nation, WSF Washington State Ferries, SWN Swinomish, NKK Nooksack) are not applied here: the app matches them against `name` and `callsign` at runtime, so the officer can change them. In this data no name or call sign contains XWL, SWN or NKK; four WSF ferries do (_Chelan_, _Yakima_, _Kaleetan_, _Tillikum_), and they are not priority in `data.json`. The real list is the Nation's.
- One synthetic vessel, "Demo vessel (synthetic)", crosses into Lummi Bay twice on Dec 5 UTC, in 5-minute steps: inside from 13:30, back out from 13:55, inside again from 14:30 to 14:40. In five real days no vessel outside the priority list enters the reservation, so without it the demo has nothing to alert on, and alerting on a real boat against an invented list would be a false statement. The second crossing lets the demo show a second alert on a vessel the officer has already seen.
- Example of the rules getting it wrong: two pleasure craft moored at the Sandy Point marina sit inside the boundary for all five days. They never "enter", so they never alert, but any rule that counted time inside would count them.

## Gaps

- Only four real vessels transmit from inside the reservation in five days: the ferry, the patrol boat, and the two moored pleasure craft. Most fishing and recreational boats under 65 ft are not required to carry AIS, so no alert does not mean no unapproved boat was there.
- A private boat's fleet cannot be read from this data: its name and call sign are blanked before the app sees them, so a Lummi Nation fishing boat with XWL in its call sign would alert like anyone else. None exists in these five days; the Nation's own list would fix it by MMSI.
- 64% of positions are from Class B transmitters, which send no navigational status, so "anchored" cannot be read from the data for them.
- December is not salmon season. The busiest traffic near the boundary is tugs waiting and anchoring 0.6 to 1.3 km outside its north-west edge, off Cherry Point.
- The boundary is approximate. It agrees with the Census Bureau's reservation polygon on every one of the 219,863 positions, but neither is a legal determination.

## Model card

Nothing in `build.py` fits or predicts.
