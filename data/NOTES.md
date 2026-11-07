# Data notes

Anyone who uses this data will ask: where did it come from, how clean is it, what can it not tell us.

## Sources

| id       | what it is                                                                                       | url                                           | retrieved  | licence or terms                                              |
| -------- | ------------------------------------------------------------------------------------------------ | --------------------------------------------- | ---------- | ------------------------------------------------------------- |
| ais      | AIS positions, Dec 5 to 9 2024 UTC, Bellingham Bay to Cherry Point, handed out by the organizers | https://marinecadastre.gov/ais                | 2026-11-07 | NOAA MarineCadastre, public domain (CC0)                      |
| boundary | Lummi Indian Reservation boundary, a KML polygon handed out by the organizers                    | https://lumminaturalresources.org/            | 2026-11-07 | Event material; the Nation's own layer says not for legal use |
| demo     | One synthetic vessel we invented                                                                 | https://github.com/SkylerrSimpson/wwu-sj-hack | 2026-11-07 | Ours                                                          |

`data/raw/` holds the event's AIS file zipped and the KML as given. The organizers' files arrived with their names swapped (the `.jpg` was the KML, the `.txt` was the CSV); `raw/` uses the names of what they are.

## Cleaning

- 99 exact duplicate rows dropped, and one position kept per vessel per 5 minutes: 219,863 rows become 124,458 positions.
- AIS type codes recoded to words (30 Fishing; 31, 32, 52 Tug; 36 Sailing; 37 Pleasure craft; 55 Law enforcement; 60s Passenger; 70s Cargo; 80s Tanker; anything else Other).
- Private boats (sailing and pleasure craft) are named by type and length only, such as "Pleasure craft, 14 m". AIS is public, but a private boat's name identifies its owner. Commercial vessels keep their AIS name. A vessel with no name gets its type.
- The priority list is invented for the demo: the Lummi Island ferry _Whatcom Chief_ (368011730) and the patrol boat _Lengesot_ (338162321). The real list is the Nation's.
- One synthetic vessel, "Demo vessel (synthetic)", crosses into Lummi Bay between 13:00 and 14:00 UTC on Dec 5. In five real days no vessel outside the priority list enters the reservation, so without it the demo has nothing to alert on, and alerting on a real boat against an invented list would be a false statement.
- Example of the rules getting it wrong: two pleasure craft moored at the Sandy Point marina sit inside the boundary for all five days. They never "enter", so they never alert, but any rule that counted time inside would count them.

## Gaps

- Only four real vessels transmit from inside the reservation in five days: the ferry, the patrol boat, and the two moored pleasure craft. Most fishing and recreational boats under 65 ft are not required to carry AIS, so no alert does not mean no unapproved boat was there.
- 64% of positions are from Class B transmitters, which send no navigational status, so "anchored" cannot be read from the data for them.
- December is not salmon season. The busiest traffic near the boundary is tugs waiting and anchoring 0.6 to 1.3 km outside its north-west edge, off Cherry Point.
- The boundary is approximate. It agrees with the Census Bureau's reservation polygon on every one of the 219,863 positions, but neither is a legal determination.

## Model card

Nothing in `build.py` fits or predicts.
