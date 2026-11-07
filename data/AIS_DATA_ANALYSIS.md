# AIS data analysis

This document records what we learned from the bulk AIS sample. It supports a tool that shows its data and lets the user configure the rules. It reports facts and options, and the user makes the decisions.

To choose front-end features, start with "What this data is", which describes each field, its common values and what it can support. "Lummi and other tribal vessels" and "Limits" follow it. The later sections list detailed facts, data problems and open questions.

Written Nov 7, 2026. The app does not use this sample. The demo still uses the five December days in `data/raw/ais-2024-12-05-to-09.zip`.

## Terms

- **Row:** one position record for one vessel at one time.
- **Vessel:** one MMSI, the ID number that an AIS device transmits.
- **Vessel-day:** one vessel on one sample day.
- **Box:** the area we kept: 48.40 to 49.05 N, 123.20 to 122.40 W. It runs from Deception Pass to Point Roberts, and from Haro Strait to the Whatcom County shore.
- **Polygon:** the reservation boundary in `data/raw/lummi-reservation-boundary.kml`. The app calls this "Lummi waters".
- **Entry:** a row inside the polygon when the same vessel's previous row that UTC day was outside.
- **Unlisted vessel:** any vessel except the Lummi Island ferry and the listed patrol boat.
- **Moving:** speed of 2 knots or more. **Stopped:** speed below 0.5 knots.
- **Class A and Class B:** the two main types of AIS device. In this sample, commercial vessels mostly use Class A and small boats mostly use Class B.
- **Private vessel:** a fishing, sailing or pleasure vessel. The app shows only its type and length. The sample has 2,946 private vessels (78%).
- **Public vessel:** any other vessel. The app shows its name. The sample has 833 public vessels, including 57 of unknown type that the live feed hides until a type arrives.
- **Streamer box:** the area that `apps/streamer` watches by default: 48.60 to 48.90 N, 122.90 to 122.40 W.

## The data we hold

| Item              | Value                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------- |
| Source            | NOAA Marine Cadastre daily files, built from the U.S. Coast Guard receiver network    |
| Location          | `data/raw/ais-bulk/`, one `.csv.zst` file per day, with `manifest.csv`                |
| In git            | No. A local `.gitignore` excludes the folder, so only this machine has the files      |
| Days              | 19: Jul 17, 2025 to Jun 1, 2026, one day every 29 days, and all of Jun 24 to 30, 2026 |
| Rows              | 4,110,307 as published, 4,083,817 after we remove duplicates                          |
| Vessels           | 3,779                                                                                 |
| Disk space        | 53.5 MB                                                                               |
| Network transfer  | 5.06 GB                                                                               |
| Newest day online | Jun 30, 2026, when we checked on Nov 7, 2026                                          |

The script kept each row as NOAA published it and cut only by location. Each file URL has this form: `https://noaaocm.blob.core.windows.net/ais/csv2/csv<year>/ais-<yyyy-mm-dd>.csv.zst`.

## What this data is

AIS is a ship radio system. Each AIS device regularly broadcasts a vessel ID, a position and motion data. It also broadcasts identity data, such as a name and a call sign. Receivers on shore record these messages. A vessel with no device, or with the device off, does not appear.

NOAA joins these messages into one table. Each row has one vessel ID, one time, a position, motion data and identity data.

### Every field

"Filled" shows the percent of vessels with a value for identity fields, and the percent of rows with a value for motion fields.

| Field            | What it is                            | Format or common values                    | Filled              |
| ---------------- | ------------------------------------- | ------------------------------------------ | ------------------- |
| `mmsi`           | Vessel ID                             | 9 digits. The first 3 show the flag        | 100%                |
| `base_date_time` | Time of the row, in UTC               | `2026-06-30 00:00:02`                      | 100%                |
| `longitude`      | Position                              | Decimal degrees                            | 100%                |
| `latitude`       | Position                              | Decimal degrees                            | 100%                |
| `sog`            | Speed over ground, in knots           | Median 0, and 90% of rows are 6.3 or below | 99.8% of rows       |
| `cog`            | Direction of travel, in degrees       | 0 to 359.9                                 | 70.5% of rows       |
| `heading`        | Direction of the bow, in degrees      | 0 to 359                                   | 29.6% of rows       |
| `status`         | Navigation status code                | Class A only. See "Status codes"           | 22.4% of rows       |
| `vessel_name`    | Vessel name                           | `WHATCOM CHIEF`                            | 99% of vessels      |
| `call_sign`      | Radio call sign                       | `WDJ7956`                                  | 76% (89% of public) |
| `imo`            | Permanent ship number                 | `IMO` and 7 digits. Mostly large ships     | 19% (69% of public) |
| `vessel_type`    | Vessel type code                      | 37 is pleasure craft. See "Vessel types"   | 99% (93% of public) |
| `length`         | Length, in meters                     | Median 14                                  | 93% of vessels      |
| `width`          | Width, in meters                      | Median 5                                   | 90% of vessels      |
| `draft`          | Depth of the hull in water, in meters | Median 7.6. Mostly large ships             | 18% (71% of public) |
| `cargo`          | Code that usually repeats the type    | Same as `vessel_type` for 92% of vessels   | 21% (79% of public) |
| `transceiver`    | AIS device class                      | `A` or `B`                                 | 100%                |

NOAA does not publish destination or arrival time.

### Call signs

- **Most vessels have one.** 2,853 of 3,779 vessels have a call sign. The figure is 100% for cargo ships and tankers, 92% for fishing vessels, 87% for tugs, 85% for passenger vessels, 74% for sailing vessels and 70% for pleasure craft.
- **A call sign identifies one vessel.** The 2,853 vessels have 2,850 different call signs. 19 vessels use more than one call sign during the sample.
- **The common format is 7 characters.** 2,338 vessels (82%) have this format, such as `WDJ7956`. Others are shorter, such as `WXAE`.
- **Some values are not real call signs.** 7 vessels have a placeholder value, 11 have 3 characters or fewer, and 10 have characters other than letters and digits.
- **A prefix shows a country, not a fleet.** 71% of all call signs start with `WD`, so that prefix does not separate vessels in a useful way.

| Prefix           | Vessels | Flag from the MMSI        |
| ---------------- | ------- | ------------------------- |
| `WD`             | 2,038   | United States             |
| `WC`             | 59      | United States             |
| `CF`             | 82      | Canada (all 82)           |
| `V7`             | 68      | Marshall Islands (all 68) |
| `D5`, `5L`, `A8` | 87      | Liberia (all 87)          |
| `3E`             | 41      | Mostly Panama             |
| `9V`             | 40      | Mostly Singapore          |
| `C6`             | 24      | Mostly Bahamas            |
| `VR`             | 14      | Hong Kong (all 14)        |

The app shows a call sign only for public vessels. 741 of the 833 public vessels have one. In the replay data, 70 of 225 vessels have a call sign.

### Names

- **Almost every vessel has a name.** 99% of vessels have a name, and the median name has 9 characters.
- **A name does not always identify one vessel.** 262 names are used by more than one vessel, for a total of 679 vessels. Among public vessels, only 7 names repeat, for a total of 16 vessels. Use the ID to follow a vessel.
- **Names can show an operator.** Our count below uses public vessels only. We did not verify who owns these vessels.

| Text in name         | Vessels | Types                            |
| -------------------- | ------- | -------------------------------- |
| `OCEAN` (first word) | 20      | 15 tugs, 3 cargo ships, 1 other  |
| `SEASPAN`            | 16      | 12 tugs, 3 tankers, 1 cargo ship |
| `MSC` (first word)   | 11      | Cargo ships                      |
| `WSF`                | 9       | Passenger vessels                |
| `WDFW`               | 6       | Law enforcement and other        |
| `BLACKFISH`          | 5       | Passenger vessels                |
| `FOSS`               | 4       | Tugs                             |

The app's approved name patterns can already use these words. A pattern must match a whole word in the name or call sign, without regard to case. Spaces, `/` and `-` separate words, so `CG` does not match `CMA CGM`, and `XWL` matches `WN-123-XWL` but not `WN123XWL`. The settings page says "contains", but the matcher uses whole words.

### Flags

The first 3 digits of the MMSI show the flag. This flag shows where a vessel is registered. It does not show who owns or operates the vessel.

| Flag          | Vessels |
| ------------- | ------- |
| United States | 2,966   |
| Canada        | 364     |
| Other         | 449     |

96% of cargo ships and 79% of tankers have a foreign flag. 96% of fishing vessels have a U.S. flag.

### Vessel types

| Codes      | Meaning           | Vessels | Word in the app |
| ---------- | ----------------- | ------- | --------------- |
| 37         | Pleasure craft    | 2,201   | Pleasure craft  |
| 36         | Sailing           | 565     | Sailing         |
| 70 to 79   | Cargo             | 300     | Cargo           |
| 30         | Fishing           | 181     | Fishing         |
| 31, 32, 52 | Towing and tug    | 129     | Tug             |
| 80 to 89   | Tanker            | 127     | Tanker          |
| 60 to 69   | Passenger         | 117     | Passenger       |
| 55         | Law enforcement   | 11      | Law enforcement |
| 54         | Anti-pollution    | 10      | Anti-pollution  |
| 51         | Search and rescue | 29      | Other           |
| 90 to 99   | Other             | 32      | Other           |
| 35         | Military          | 7       | Other           |
| No type    | Not known         | 56      | Other           |

Each vessel appears here under its most common type. The app's "Other" group holds 138 vessels, including all search and rescue vessels.

"Passenger" is a wide group: 32 of these vessels are 12 m or shorter, and 23 are over 100 m.

### Vessel size

Length separates small boats from large ships clearly. Few vessels fall between 50 m and 100 m.

| Length       | Vessels |
| ------------ | ------- |
| Up to 8 m    | 185     |
| 8 to 12 m    | 1,086   |
| 12 to 20 m   | 1,406   |
| 20 to 30 m   | 247     |
| 30 to 50 m   | 107     |
| 50 to 100 m  | 36      |
| 100 to 200 m | 217     |
| 200 to 400 m | 238     |

The app shows length for private and public vessels.

### Speed

Median speed while moving:

| Type      | Knots | Type     | Knots |
| --------- | ----- | -------- | ----- |
| Passenger | 13.9  | Tug      | 7.9   |
| Cargo     | 11.8  | Fishing  | 7.7   |
| Tanker    | 11.2  | Pleasure | 7.4   |
|           |       | Sailing  | 5.6   |

### Status codes

Only Class A devices send status, and the values are often wrong. See "Status is not reliable".

| Code | Meaning                 | Rows    |
| ---- | ----------------------- | ------- |
| 0    | Under way, using engine | 593,462 |
| 5    | Moored                  | 204,569 |
| 1    | At anchor               | 62,403  |
| 12   | Reserved or towing code | 20,066  |
| 11   | Reserved or towing code | 17,349  |
| 8    | Under way, sailing      | 8,563   |
| 3    | Restricted movement     | 7,762   |
| 7    | Fishing                 | 2,305   |

### What a map shows at one time

We counted vessels with a row in the last 10 minutes, in the streamer box, at one time in each hour of all 19 days:

| Vessels on the map | Median | 90th percentile | Highest |
| ------------------ | ------ | --------------- | ------- |
| All                | 105    | 121             | 146     |
| Private            | 87     | 101             | 129     |
| Moving             | 4      | 18              | 42      |

Most dots on a map are therefore parked private boats. On half of the vessel-days, a vessel stays in the streamer box for 23 hours or more. On a quarter of them, it stays for about 2 hours or less.

These counts use the NOAA sample. The live feed can show different numbers.

### Regular vessels and visitors

The streamer box has about 240 public vessels. 24 of them appear on 10 or more of the 19 days, and 121 appear on only one day. Of 567 pleasure craft, 43 appear on 10 or more days, and 315 appear on only one day.

Public vessels of 20 m or more that appear on 10 or more days:

| Name           | Call sign | Type           | Length | Days |
| -------------- | --------- | -------------- | ------ | ---- |
| WHATCOM CHIEF  | WDJ7956   | Passenger      | 32 m   | 19   |
| NRC COLUMBIA   | WDA8288   | Anti-pollution | 36 m   | 19   |
| PROTECTOR      | WCY2824   | Tug            | 41 m   | 16   |
| WESTRAC II     | WCU4545   | Tug            | 24 m   | 15   |
| VICTORIA STAR2 | WCW4552   | Passenger      | 29 m   | 14   |
| TUG RESPONSE   | WDQ4966   | Tug            | 40 m   | 12   |
| SOUND RELIANCE | WXAE      | Tanker         | 183 m  | 12   |
| SALISH EXPRESS | WDJ9193   | Passenger      | 28 m   | 12   |
| VALOR          | WDD8691   | Tug            | 30 m   | 12   |
| OSPREY         | WDM6586   | Tug            | 40 m   | 10   |

### Which fields reach the front end

| Data                      | NOAA sample | Replay (`data.json`)    | Live feed (`apps/streamer`) |
| ------------------------- | ----------- | ----------------------- | --------------------------- |
| Position and time         | Yes         | Yes, in `track`         | Yes                         |
| Name                      | Yes         | Public vessels only     | Public vessels only         |
| Call sign                 | Yes         | Public vessels only     | Public vessels only         |
| MMSI                      | Yes         | Public vessels, as `id` | Public vessels only         |
| Type                      | Code        | Word                    | Word                        |
| Length                    | Yes         | Yes                     | Yes                         |
| Speed, course, heading    | Yes         | No                      | Yes                         |
| Status                    | Yes         | No                      | Yes, in `nav_status`        |
| Device class              | Yes         | No                      | Yes, in `vessel_class`      |
| Position age              | No          | From `track` time       | Yes, in `heard_at`          |
| Warning flags             | No          | No                      | Yes, in `flags`             |
| Width, draft, IMO, cargo  | Yes         | No                      | No                          |
| Destination, arrival time | No          | No                      | No                          |

The replay can calculate speed from two positions in `track`. A new `data.json` field needs a schema issue, as `data/AGENTS.md` states. AIS Message 5, from Class A devices, carries destination, arrival time and draft. Message 24, from Class B devices, does not. The streamer does not read these fields, and we did not check whether this feed delivers them.

The streamer can also record reports to a database. It has these history endpoints: `/v1/history`, `/v1/track`, `/v1/reports`, `/v1/catalog`, `/v1/density`, `/v1/activity` and `/v1/coverage`. The database stores real names, call signs and MMSIs for private vessels, so it must stay out of the repo. We did not audit what each endpoint returns for private vessels.

### What the data can support

These are options, not decisions. Each one links a user need to a fact in this document.

| User need                                      | Field                   | Why the data supports it                                    | Limit                                                               |
| ---------------------------------------------- | ----------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------- |
| Find one known vessel                          | Call sign, name, ID     | Call signs are almost unique, and few public names repeat   | Public vessels only                                                 |
| See only certain kinds of boat                 | Type                    | 99% of vessels have a type                                  | The "Other" group holds 138 vessels, and types can be wrong         |
| Remove parked boats from view                  | Speed                   | About 4 of 105 vessels on the map are moving                | The replay must calculate speed                                     |
| Filter by size                                 | Length                  | 93% have a length, and private vessels can use it too       | 7% have no length                                                   |
| Filter by Lummi, other tribal, agency or other | Label from the settings | The app already gives each vessel a label from its settings | Tribal groups start empty. See "Lummi and other tribal vessels"     |
| Group vessels by operator                      | Name text               | Names such as `WSF` and `SEASPAN` repeat                    | We did not verify owners, and a pattern reaches public vessels only |
| Separate foreign ships                         | Flag from MMSI          | Most cargo ships and tankers have a foreign flag            | Needs a new field for private vessels, and shows registration only  |
| Tell regular vessels from visitors             | ID over time            | 121 of about 240 public vessels appear on only one day      | Needs the streamer's history database                               |
| Judge how current a dot is                     | `heard_at`              | Rows arrive about 1 to 3 minutes apart                      | Live feed only                                                      |
| See warnings about bad data                    | `flags`                 | Impossible moves and unusual IDs exist in the data          | Live feed only, and a warning is not proof                          |

The data does not support these features today:

| Feature                                    | Reason                                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------- |
| Filter by call sign prefix to find a fleet | A prefix shows a country. 71% of call signs start with `WD`.                                                      |
| Search private boats by name or call sign  | The privacy rule hides these fields.                                                                              |
| Filter by "anchored" or "fishing" status   | Class B has no status, and Class A status is often wrong. Use speed and time in place to detect a stopped vessel. |
| Show "vessels fishing now"                 | AIS does not record this. Only 3 of 186 fishing vessels ever report status "fishing".                             |
| Filter by destination                      | NOAA does not publish it, and the streamer does not read it.                                                      |
| Filter by width, draft or IMO              | Neither the replay nor the live feed has these fields.                                                            |

The map popup says "Call sign: not broadcast" for every vessel with an empty call sign. For private vessels, this text is not accurate: most of them broadcast a call sign, and the app hides it.

### Lummi and other tribal vessels

**The registration number**

- A Lummi representative gave the team the table below. It lists the suffix of each tribe's WN vessel registration number.
- [Washington's rule](https://app.leg.wa.gov/wac/default.aspx?cite=308-93&full=true) (WAC 308-93-730) gives each tribe a block of numbers with a unique 3-letter suffix. It requires the number on the vessel.
- [Lummi's natural resources code](https://www.lummi-nsn.gov/userfiles/1_Title%2010%20Natural%20Resources%20Code.pdf) (Title 10, section 10.05.030, 2008 edition) sets the Lummi format: `WN`, 3 digits and `XWL`. The number must be on both sides of the bow, in block letters at least 3 inches high. Documented vessels can follow Coast Guard display practice.
- WAC 308-93-710 names 21 tribes. The table does not include the Muckleshoot, Nisqually, Puyallup, Upper Skagit or Yakama tribes.

The "Matches" column counts vessels with the code as a whole word in a name or call sign. The count is a snapshot of the streamer database, with about 36 NOAA days and 10 minutes of live data. The import was still running.

| Code  | Tribe                       | Matches                                    |
| ----- | --------------------------- | ------------------------------------------ |
| `XWL` | Lummi Nation                | 0                                          |
| `HOH` | Hoh Tribe                   | 0                                          |
| `JST` | Jamestown S'Klallam Tribe   | 0                                          |
| `KWA` | Quinault Nation             | 0                                          |
| `KWL` | Quileute Nation             | 0                                          |
| `LEK` | Lower Elwha Klallam Tribe   | 0                                          |
| `MKH` | Makah Tribe                 | 0                                          |
| `NKK` | Nooksack Tribe              | 0                                          |
| `PGK` | Port Gamble S'Klallam Tribe | 0                                          |
| `SKK` | Skokomish Tribe             | 0                                          |
| `SST` | Sauk-Suiattle Tribe         | 2 tugs                                     |
| `STL` | Stillaguamish Tribe         | 0                                          |
| `SUN` | Suquamish Tribe             | 9: 5 pleasure, 2 sailing, 1 tug, 1 fishing |
| `SWN` | Swinomish Tribe             | 0                                          |
| `SXN` | Squaxin Island Tribe        | 0                                          |
| `TUL` | Tulalip Tribe               | 0                                          |

We did not check who owns the `SST` and `SUN` matches. `SUN` is also an ordinary word, so a match does not show tribal ownership.

**What AIS carries**

- AIS has no field for a registration number. Message 5 and Message 24 carry the MMSI, name, call sign, ship type and dimensions. Message 5 also carries the IMO number.
- The name field holds 20 characters and the call sign field holds 7 characters, so `WN 123 XWL` fits in the name field. No source we read states that an operator may enter it there.
- No vessel in the sample has a name or call sign in the form `WN`, digits and a 3-letter suffix.
- One fishing vessel has a state-style WN number, with a 2-letter suffix, in its name. An operator therefore can enter a registration number in that field.
- 8 pleasure craft have call signs that start with `WN`, with no 3-letter suffix. We do not read these as registration numbers.
- NOAA can replace a broadcast name from AVID, so the NOAA sample may hide a number that a vessel broadcast. The live data has no matches, but it covers only about 10 minutes.

**How the app labels a vessel today**

The app takes the first of these rules that applies:

1. `fleet`, a value set at build time. The replay sets it for two vessels. The live feed never sets it.
2. The label of the first matching pattern. The defaults are `XWL`, `WSF`, `SWN` and `NKK`.
3. "Approved by the Nation", if the vessel's ID is on the approved list.
4. The vessel's type.

- The map has no filter or search yet.
- The default patterns cannot match a private vessel, because the app receives only its type and length. A user pattern such as `pleasure` or `24` can match those generated names.
- A user can select any dot and approve it. The approval stays in that browser.
- A replay ID stays the same until a rebuild with different data. A live ID stays the same across restarts only if `STREAMER_ID_SALT` is set.
- Replay and live IDs differ, so an approval in one mode does not apply in the other.

**Ways to fill a tribal group**

| Method                                                | Reaches private vessels | Limit                                                                                                     |
| ----------------------------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| User approves a vessel on the map                     | Yes                     | The user must already know the boat. It stays in one browser                                              |
| User enters or imports a list of MMSIs                | Yes, if built           | The app has no import yet. The user must hold the list                                                    |
| Pattern in the browser                                | No                      | Matches public vessels only. `XWL` has 0 matches today                                                    |
| Pattern in the streamer, before it hides the identity | Yes, if built           | Not built. It finds a boat only if the operator entered the code. It also labels a private boat in public |

Until a user adds vessels, the Lummi group holds 0 vessels. This count does not show that no Lummi boats are present. Lummi boats can appear under "Other" or under their type.

### Fishery notices

The Nation publishes a [fishery hotline message](https://www.lummi-nsn.gov/widgets/FisheryHotline_pdf.php). We read message #2026-087, recorded Nov 5, 2026.

- The message states: "All fisheries and areas are closed unless specifically opened."
- It lists open and closed areas, with hours, as plain text. For example, it lists Bellingham Bay as closed to shellfish harvest.
- It states that vessels in the Lummi fisheries must have the registration number on the hull and the registration card on board.
- The app can link to this message and show its date. The PDF has no published format, so automatic reading of the areas can fail when the text changes.
- We found only the current message, not past messages.

[WDFW's agreed fisheries summaries](https://wdfw.wa.gov/fishing/management/north-falcon/summaries) are PDF files. [WDFW's emergency rules](https://wdfw.wa.gov/fishing/regulations/emergency-rules/search) are web pages with no feed.

## Limits

### Limits that no research can remove

| Limit                                                | Reason                                                                                                                                                              | What the app can do                                            |
| ---------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
| AIS cannot show that a boat is tribal                | AIS has no registration or membership field                                                                                                                         | Show the rule that gave each label                             |
| The tribal vessel registry is not public             | WAC 308-93-770 limits access to law enforcement. Other people need a court order or written permission from the treaty fisher or tribe                              | Let an authorized user enter their own list                    |
| A boat with no AIS, or with AIS off, does not appear | AIS is a broadcast. [Ecology reports](https://apps.ecology.wa.gov/publications/documents/2008019.pdf) that tribal fishing vessels under 65 ft often do not transmit | Say "no vessels heard"                                         |
| AIS does not show a permit, catch, gear or intent    | AIS has no field for these                                                                                                                                          | Show the vessel's data without a verdict                       |
| AIS identity is self-reported                        | An operator enters the name and other static data. A wrong or false value looks the same as a true one                                                              | Mark data as self-reported, and show `flags` on the live feed  |
| Radar cannot identify a boat                         | Radar shows a contact. It has no MMSI, name or registration number                                                                                                  | Show the contact as unidentified                               |
| NOAA data arrives months late                        | The newest NOAA day is Jun 30, 2026                                                                                                                                 | Use the live feed for recent data, and show each source's date |

### Limits of the research so far

- **No public list found.** We found no public source that links the `XWL` fleet to an MMSI or a call sign.
- **Owner lookups not run.** [NAVCEN](https://navcen.uscg.gov/ais-vessel-information-verification-service) and the FCC's ship license search can reportedly search by owner, and a person can try these in a browser. Our scripts received HTTP 403 from uscg.mil and fcc.gov, and we did not try to get around that. We ran no "Lummi" search.
- **No organization-owned boats named.** We found no public list of boats that the Nation owns. We did not search for boats that individual members own.
- **No AIS count for tribal boats.** We found no published count of tribal vessels with AIS.
- **A hull number can identify a boat with no AIS.** It is on both sides of the bow, so a person or camera may read it. We did not test this.

## Facts: measured in the sample

Each number below comes from these 19 days. Do not read a number as a yearly rate.

### File format and quality

- All 19 files have the same columns: `mmsi, base_date_time, longitude, latitude, sog, cog, heading, vessel_name, imo, call_sign, vessel_type, status, length, width, draft, cargo, transceiver`.
- One sampled day from each year, 2015 to 2026, has the same columns.
- These columns differ from the December file. For example, `latitude` replaces `LAT`, and `longitude` comes before `latitude`. `build.py` needs a column map before it can read this sample.
- All rows are inside the box and on the correct UTC date. The script found no unreadable rows.
- 26,490 rows repeat a vessel and a time. All but one are exact copies. Only one vessel and time has two different positions.
- No row has the placeholder values heading 511, speed 102 or above, or course 360 or above. These fields are blank instead.
- 67 moves in 34 vessels need more than 60 knots and cover more than 1 nautical mile. No vessel can make most of these moves.
- 441 rows from 43 vessels report more than 40 knots. The highest value is 99.2 knots.

Percent of published rows with a blank field:

| Field     | Blank | Field         | Blank |
| --------- | ----- | ------------- | ----- |
| `imo`     | 83.8% | `call_sign`   | 18.7% |
| `draft`   | 81.3% | `width`       | 5.3%  |
| `status`  | 77.6% | `length`      | 3.3%  |
| `cargo`   | 77.3% | `vessel_type` | 0.4%  |
| `heading` | 70.4% | `sog`         | 0.2%  |
| `cog`     | 29.5% | `vessel_name` | 0.1%  |

### Time between rows

Median seconds between rows for one vessel:

| Device  | Moving | Not moving |
| ------- | ------ | ---------- |
| Class A | 69     | 80         |
| Class B | 90     | 181        |

### Most rows show parked boats

- 83% of rows are from stopped vessels.
- Stopped rows in eight map cells make up 57% of all rows. Each cell is about 1.5 km by 2.2 km.
- On 53% of vessel-days, the vessel never reaches 2 knots. The figure is 72% for fishing vessels, 62% for pleasure craft, and 9% for tugs.
- A row count therefore measures parked boats more than traffic.

### Who is in the box

A vessel can have more than one type, so the vessel counts add up to more than 3,779.

| Type      | Vessels | Rows      | Moving rows | Class A share of rows |
| --------- | ------- | --------- | ----------- | --------------------- |
| Pleasure  | 2,218   | 2,387,220 | 199,951     | 7%                    |
| Sailing   | 576     | 541,454   | 76,464      | 2%                    |
| Cargo     | 300     | 135,155   | 40,999      | 97%                   |
| Fishing   | 186     | 266,339   | 13,995      | 34%                   |
| Tug       | 130     | 244,861   | 84,676      | 99%                   |
| Tanker    | 129     | 73,430    | 15,463      | 99%                   |
| Passenger | 118     | 326,676   | 140,788     | 67%                   |

- Class B makes up 75% of rows. It made up 64% in the December file.
- Vessels with Canadian ID numbers make up 364 of the 3,779 vessels and 5.4% of rows.
- 13 IDs are outside the normal ship ranges. Six of these start with 970, 972 or 974, which the ITU numbering plan assigns to emergency devices. Do not count these IDs as ordinary vessels.

### Traffic changes with the season and the hour

Vessels moving on two single days:

| Type     | Jul 17, 2025 | Jan 7, 2026 |
| -------- | ------------ | ----------- |
| Pleasure | 407          | 26          |
| Sailing  | 92           | 4           |
| Fishing  | 17           | 3           |
| Tug      | 30           | 19          |
| Cargo    | 16           | 21          |
| Tanker   | 9            | 6           |

- Between these two days, rows rise 49% and moving pleasure craft rise about 16 times.
- Tug movement stays about level across all 24 hours.
- Pleasure craft movement peaks near noon, Pacific time, and is close to zero overnight.

### Status is not reliable

- Class B rows never have a status.
- 60% of Class A rows with status "under way" are from vessels moving below 0.2 knots.
- 8,309 Class A rows report "anchored" or "moored" at 2 knots or more.
- Only 3 of the 186 fishing vessels ever report status "fishing".

### Fishing vessels

- 133 of the 186 use Class B and 53 use Class A.
- Of the 175 with a known length, the median is 18 m, 58% are shorter than 65 ft, and 15% are 12 m or shorter.
- 70% of rows at 0.5 to 4 knots fall in one map cell at about 48.76 N, 122.50 W, which appears to be a Bellingham harbor. GPS drift at a dock can look like slow movement.
- Away from harbors, only 12 fishing vessels hold 1 to 5 knots for 30 minutes or more. Only 2 of those 26 runs come within 5 km of the polygon.

### The polygon

- 26 vessels have rows inside the polygon. No fishing vessel has a row inside.
- 16 fishing vessels pass within 1 km of the polygon. All 451 of their rows in that band show 4.7 knots or more, with a median of 7.8 knots.
- The polygon has 650 entries. The ferry makes 623 of them.
- 20 unlisted vessels make the other 27 entries:

| Type      | Entries | Vessels |
| --------- | ------- | ------- |
| Pleasure  | 12      | 11      |
| Sailing   | 8       | 5       |
| Other     | 3       | 1       |
| Passenger | 2       | 1       |
| Tug       | 2       | 2       |
| Fishing   | 0       | 0       |

- These 27 entries occur at about 1.2 per day on the 12 spaced days, and 1.9 per day in the June week. All occur between 10 AM and 9 PM, Pacific time.
- 7 of the 27 entries have only one row inside. 4 vessel-days have repeat entries. One entry needs a speed of about 246 knots, so that position is probably wrong.
- The line "Real data has no non-priority vessel entering" in `docs/DECISIONS.md` is true for the five December days. It is not true for this sample.
- `build.py` keeps one row per vessel per 5 minutes. That rule reduces the 27 entries to 19 and misses 4 of the 20 vessels.

A wider zone adds many entries. This table excludes the ferry, the patrol boat and vessels with `WSF` in the name:

| Zone             | Entries per day | Vessels |
| ---------------- | --------------- | ------- |
| Polygon          | 1.4             | 20      |
| Polygon + 0.5 km | 25.2            | 136     |
| Polygon + 1 km   | 17.5            | 159     |
| Polygon + 2 km   | 21.3            | 181     |
| Polygon + 5 km   | 60.9            | 367     |

The 0.5 km zone has more entries than the 1 km zone, even though it has fewer vessels. We did not find the cause.

### Known vessels

- The Lummi Island ferry appears on all 19 days. It makes 32 to 38 entries on weekdays and 24 to 29 on weekends.
- The listed patrol boat appears on 3 of 19 days. It has no rows inside the polygon.
- `XWL`, `SWN` and `NKK` match no vessel name or call sign in the sample. `WSF` matches 9 passenger vessels.

### Commercial vessels near the polygon

- 27 tugs and 15 tankers stop within 5 km of the polygon and outside it.
- The busiest map cell has 22 vessels, mostly tugs, at a median distance of about 0.7 km from the northwest edge.
- 12 of the 38 tankers seen in the June week change their reported draft. The median change is 2.1 m.

### Reception

- We tested vessels at 3 knots or more. A gap of more than 10 minutes follows 0.08% to 0.14% of these rows within 20 km of the polygon.
- The figure is 0.47% beyond 20 km. Many of those gaps occur at the west edge of the box, probably because vessels leave the box.
- The median time between rows does not change with distance from the polygon.

### The streamer's smaller box

`apps/streamer` watches 48.60 to 48.90 N, 122.90 to 122.40 W by default. Inside that area, the sample shows:

- 22% of all rows and 1,083 vessels.
- 130 to 261 vessels per day, and 35 to 191 moving vessels per day.
- 94 fishing vessels.

The larger box has 470 to 1,053 vessels per day, so a count from one box does not apply to the other.

### Cost of more data

- The fetch script must download each national file to keep about 1% of it.
- The 13 spaced days average 252.7 MB of transfer and 2.6 MB of disk space per day.
- That average gives an estimate of 92 GB of transfer and about 1 GB of disk space per year.
- NOAA's file sizes for Jan 1, 2025 to Jun 30, 2026 total 131.6 GB.
- NOAA's 2024 GeoParquet files have no location index. A range request cannot skip to our region.

## Facts: from outside the data

I read the NOAA record, the Ecology report and the streamer code directly. The live feed test results come from the worker that built the streamer, and I did not rerun them. The other items come from search summaries, so read the source before you cite them.

**How NOAA builds the files** ([NOAA record](https://www.fisheries.noaa.gov/inport/item/77594))

- NOAA filters raw messages to a one-minute rate.
- NOAA keeps vessels that broadcast within the U.S. Exclusive Economic Zone.
- NOAA updates names, IMO numbers, call signs, sizes and types from a separate database, AVID. These fields do not always show what the vessel transmitted.
- NOAA says a record's presence depends on unpublished receiver locations, antenna height, transmit power and radio interference.

**Who must carry AIS** ([33 CFR 164.46](https://www.law.cornell.edu/cfr/text/33/164.46))

- Self-propelled commercial vessels of 65 ft or more must carry AIS. This includes fishing vessels.
- Recreational vessels are not covered. Government non-commercial vessels are excluded.
- Coast Guard material also covers towing vessels over 26 ft and 600 horsepower. Check the current rule text for the exact wording.

**The live feed** (`apps/streamer` and `docs/DECISIONS.md`)

- Position and static data arrive as separate messages, so a vessel can have no name or type at first. The streamer README allows about 6 minutes for this after a restart.
- The feed uses placeholder values such as heading 511 and speed 102.3. The streamer changes them to `null`.
- The streamer keeps each vessel's latest position and the last 1,000 events in memory, so the vessel list starts empty after a restart and refills over a few minutes. It can also record reports to a database.

**Live feed test results, as reported by the streamer worker on Nov 7, 2026**

- **Age of data:** reports are about 4 seconds old on arrival, and about 6 seconds at the slow end.
- **Update rate:** vessels heard repeatedly update about every 60 seconds on Class A and every 90 to 180 seconds on Class B. These rates are close to the NOAA sample. However, 473 of 631 vessels were heard only once in 4 minutes.
- **Accuracy:** a replay of 2,575 real messages had no rejected messages and no leaked private names. A short live run was also clean.
- **Coverage:** no vessel has been heard inside the polygon on this feed yet. The ferry was heard twice in 8 minutes, both times outside the polygon.
- **Provider limits:** an account has 3 connections. The streamer uses one, and website viewers connect to the streamer, so they do not use a slot. Each teammate or script that uses the same key does use a slot.
- **Rate limits:** compression is on, which avoids the limits on uncompressed connections. After a 429 response, the streamer waits at least 30 seconds before it tries again.
- **Load:** the streamer allows 200 viewers and disconnects slow viewers. Nobody has run a load test or a multi-hour test.
- **Outages:** AISStream has no service guarantee. It reportedly went silent for days in August, and an expired TLS certificate reportedly took it down for more than 50 hours in July. Its current certificate expires Nov 17 and had no renewal when checked. The worker simulated only a dropped connection and silence, not a real outage.
- **Deployment:** the streamer runs only on a local machine. The live site needs public HTTPS, and the home lab needs a fixed `STREAMER_ID_SALT` to keep IDs stable across restarts. The streamer has no login or per-IP limit, so one user can fill all the viewer slots.

**Regional traffic** ([Ecology VEAT 2025](https://apps.ecology.wa.gov/publications/documents/2608002.pdf))

- Washington tank ship and barge entering transits reached 1,554 in 2025, up from 1,319 in 2024. This is the highest value in the report's 2011 to 2025 series.
- The report has no row for Cherry Point, so it cannot check our local counts.

**Lummi fleet and rights**

- Reports of the Lummi fleet range from [over 250 vessels](https://www.lummi-nsn.gov/userfiles/181_Lummi%20Fishing%20Gear%20Loss%20Forum%20Presentations%20-%20All[1].pdf), in a document with data through 2006, to [about 450](https://www.heraldnet.com/news/fishing-at-the-heart-of-lummi-nation), in an article with no date in our result. We have no current count.
- [12 reefnet licenses](https://seattlemag.com/lifestyle/outdoors/photo-essay-the-reefnetters-of-legoe-bay/) exist in this fishery.
- [Boldt's findings](https://nill.narf.org/bulletins/federal/documents/lummi.html) describe Lummi fishing grounds from the Fraser River south to the Seattle area, and particularly Bellingham Bay. The Ninth Circuit held in [_Swinomish v. Lummi Nation_](https://law.justia.com/cases/federal/appellate-courts/ca9/21-35812/21-35812-2023-09-11.html) (2023) that those grounds did not extend to the disputed waters in that case.

**What AIS does not record**

AIS has no field for a permit, a catch, fishing gear, intent or legal status. It does not show boats without a device, boats with the device off, nets, crab pots, reefnet gear, people harvesting on shore, or paddled canoes. It also does not record noise, spill risk or lost gear.

## Open facts

The data does not settle these questions. Each item states what we see, why it stays open, and what can settle it.

### Enforcement

1. **Why does no fishing vessel enter the polygon?** Perhaps none did, the sample missed them, or they do not transmit. The data looks the same in all three cases. Patrol logs and incident reports can settle this.
2. **Are the 27 entries a problem?** Most are pleasure and sailing boats. We do not know whether any had permission or broke a rule. They are not evidence of wrongdoing. The Nation can state which vessels may enter.
3. **Do boats switch AIS off to hide?** A gap can mean a device off, a vessel out of range, or a vessel out of the box. AIS alone cannot separate these. A second sensor, such as a shore camera or radar, can test this.
4. **Does the patrol boat keep AIS off, or was it elsewhere?** It appears on 3 of 19 days. The patrol log can settle this.
5. **What does "exclusive Lummi waters" mean on a map?** The challenge uses this term, and the app uses the reservation polygon. Treaty fishing grounds extend much farther, and courts have ruled on disputes about their limits. Only the Nation should answer this. The polygon is also approximate.

### Coverage

6. **How many boats does AIS miss?** We see 186 fishing vessels in the whole box, and not all of them are Lummi. A current fleet list with lengths and AIS status can measure the gap.
7. **How many AIS vessels use this area in a year?** A rough capture estimate gives about 7,000, against the 3,779 we saw. The method assumes independent samples, and these days are not independent. New vessels still appear at 67 to 94 per day at the end of the June week. A full-year download can improve this figure.
8. **Is reception good for boats we never heard?** The reception test measures only vessels that a receiver heard. A small boat with a low antenna can stay unheard. A boat with a known AIS device can test this on a planned route near the polygon.
9. **Can the live feed hear vessels inside the polygon?** This is the most important open question for the live tracker. The feed has heard none there yet, but the test is too short to show a blind spot. In the NOAA sample, 20% to 27% of the ferry's daily rows are inside the polygon. If each row is independent, two rows are both outside about 55% to 65% of the time. To test this, watch the live feed during the next ferry crossings, then compare the share of rows inside with the NOAA share.
10. **Does the live feed cover the same area as NOAA?** The two sources can use different receivers, so NOAA's reception result may not apply. A side-by-side capture can test this, but NOAA's files arrive months later.
11. **Why did the live test hear 631 vessels in 4 minutes?** In the NOAA sample, the busiest day in the streamer's default box has 261 vessels. The test may have used a larger box, or the feed may hear far more vessels than NOAA keeps. Confirm the box that the test used, then compare the counts. Later data is mixed. One live snapshot had 116 vessels, close to the NOAA median of 105 on a map. The streamer database had 264 live vessels from about 10 minutes.
12. **Will the streamer survive a real outage or a long run?** Nobody has tested a multi-hour run or a real provider outage. The certificate date of Nov 17 is the next known risk. Test this on the home lab, and check that the status changes to `stale` or `down`.
13. **How complete is the Canadian side?** NOAA says it keeps U.S. EEZ broadcasts, but 2.8% of rows are north of 49 N. The rows are uneven along the border. We do not know the filter's exact effect. Use counts on the Canadian side with care.

### Meaning of the fields

14. **How accurate is `vessel_type`?** AVID can replace the transmitted type. 54 vessels have more than one type, and 41 have more than one name. Three fishing vessels report a length of 100 m or more. A sport fishing boat can also be typed as pleasure craft. We cannot measure the error rate without a reference list.
15. **Can we detect fishing from movement?** Sailboats, tugs and pleasure craft also hold slow speeds for long periods. We have no labeled fishing trips to test a rule.
16. **What do the unusual IDs mean?** Six IDs start with 941, and they have 1,120 rows and speeds up to 15.1 knots. One starts with 848 and is typed as sailing. We do not know what these devices are.
17. **Do vessel names on the live feed match NOAA's names?** `WSF` matches NOAA's names, which AVID can change. We did not compare these names with a live capture.
18. **Why do the duplicate rows exist?** They do no harm once removed, but we do not know the cause. We also do not know if the live feed repeats messages in the same way.

### Trends

19. **Is the summer rise real across years?** Each month has one day, except June 2026. We have no second year to compare. More boats may also carry AIS now. More data would help, at about 92 GB of transfer per year.
20. **Does the sample include fishing openings?** We found the current Lummi hotline message but no past messages, so we cannot match openings to the sample days. One day every 29 days can easily miss a short opening. A saved copy of each new message can build this record from now on.
21. **Is there a weekday pattern beyond the ferry?** The June week is one week, and each UTC day starts in the evening before, Pacific time. A Saturday file starts at 5 PM on Friday.
22. **What happened after Jun 30, 2026?** NOAA's files are 130 days behind today. Only a stored live capture can fill that gap. The streamer's database started on Nov 7, 2026, so Jul 1 to Nov 6, 2026 stays empty until NOAA publishes those days.
23. **Does more commercial traffic reach Lummi waters?** Statewide tank traffic rose in 2025. We have no earlier local data to compare, and no measure of harm.

### Interpretation

24. **Which places do the map cells show?** We identified harbors and piers from coordinates only. We did not check them against a map layer.
25. **Does the ferry match its timetable?** Its pattern is regular, but we did not get the regular timetable. A match would give us a known reference for reception.
26. **Do Lummi fishers want to be tracked?** A public map can expose fishing locations and can give people a reason to switch AIS off. The data cannot answer this. Ask the Nation.

## How to use this data

- Remove duplicates by `mmsi` and `base_date_time`.
- Count moving vessels or vessel-days. Do not use raw rows as a measure of traffic.
- Detect anchoring from speed and time in place. Do not use `status`.
- Treat a position as doubtful if the move needs an impossible speed.
- Do not use 5-minute rows to count entries.
- Write "no vessels heard". Do not write "no vessels present".
- Show the rule behind each label, so a user can see and change it. An empty tribal group means that no vessel matched the settings.
- Keep the replay as the main demo path. Show the live feed as an extra, with its status visible.
- Do not publish private boat names, call signs or MMSIs from this sample. `data/AGENTS.md` has the rule.

## Limits of this analysis

- 19 days is a small sample, and late June counts for 7 of the 19 days.
- We count entries inside each UTC day. A vessel's first row of the day never counts as an entry.
- Our count of moves near midnight has the same limit.
- A person has not reviewed these results against a second source, except where this document names one.
