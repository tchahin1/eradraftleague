#!/usr/bin/env python3
"""Build the EPL player-season database used by Era Draft League.

Primary source: Transfermarkt open dataset (appearances in GB1, 2000-2026).
Fallbacks: ewenme Transfermarkt squad CSVs (2004-2020) and FPL (2016-2026).
Ratings: FIFA-style overlay for iconic player-seasons, otherwise estimated
from minutes, output, and (when present) market value.
"""

from __future__ import annotations

import json
import re
import sys
import traceback
import unicodedata
import urllib.request
from pathlib import Path

import pandas as pd

sys.path.insert(0, str(Path(__file__).resolve().parent))
from early_era_squads import EARLY_SEASONS  # noqa: E402

ROOT = Path(__file__).resolve().parents[1]
CACHE = Path(__file__).resolve().parent / ".cache"
OUT_DATA = ROOT / "data" / "epl-player-seasons.json"
OUT_PUBLIC = ROOT / "public" / "data" / "epl-player-seasons.json"

TM_BASE = "https://pub-e682421888d945d684bcae8890b0ec20.r2.dev/data"
EWENME_BASE = "https://raw.githubusercontent.com/ewenme/squads/master/data"
FPL_BASE = "https://raw.githubusercontent.com/vaastav/Fantasy-Premier-League/master/data"

SEASON_STARTS = list(range(2000, 2026))  # 2000-01 through 2025-26

CLUB_ALIASES = {
    "man utd": "Manchester United",
    "man united": "Manchester United",
    "manchester utd": "Manchester United",
    "manchester united": "Manchester United",
    "man city": "Manchester City",
    "manchester city": "Manchester City",
    "spurs": "Tottenham Hotspur",
    "tottenham": "Tottenham Hotspur",
    "tottenham hotspur": "Tottenham Hotspur",
    "wolves": "Wolverhampton Wanderers",
    "wolverhampton wanderers": "Wolverhampton Wanderers",
    "wolverhampton": "Wolverhampton Wanderers",
    "brighton": "Brighton & Hove Albion",
    "brighton and hove albion": "Brighton & Hove Albion",
    "brighton & hove albion": "Brighton & Hove Albion",
    "west brom": "West Bromwich Albion",
    "west bromwich albion": "West Bromwich Albion",
    "west bromwich": "West Bromwich Albion",
    "west ham": "West Ham United",
    "west ham united": "West Ham United",
    "newcastle": "Newcastle United",
    "newcastle united": "Newcastle United",
    "leicester": "Leicester City",
    "leicester city": "Leicester City",
    "norwich": "Norwich City",
    "norwich city": "Norwich City",
    "qpr": "Queens Park Rangers",
    "queens park rangers": "Queens Park Rangers",
    "sheff utd": "Sheffield United",
    "sheffield utd": "Sheffield United",
    "sheffield united": "Sheffield United",
    "sheffield wednesday": "Sheffield Wednesday",
    "sheff wed": "Sheffield Wednesday",
    "nott'm forest": "Nottingham Forest",
    "nott m forest": "Nottingham Forest",
    "nottm forest": "Nottingham Forest",
    "nottingham forest": "Nottingham Forest",
    "forest": "Nottingham Forest",
    "afc bournemouth": "Bournemouth",
    "bournemouth": "Bournemouth",
    "aFC bournemouth": "Bournemouth",
    "leeds": "Leeds United",
    "leeds united": "Leeds United",
    "birmingham": "Birmingham City",
    "birmingham city": "Birmingham City",
    "blackburn": "Blackburn Rovers",
    "blackburn rovers": "Blackburn Rovers",
    "bolton": "Bolton Wanderers",
    "bolton wanderers": "Bolton Wanderers",
    "charlton": "Charlton Athletic",
    "charlton athletic": "Charlton Athletic",
    "coventry": "Coventry City",
    "coventry city": "Coventry City",
    "derby": "Derby County",
    "derby county": "Derby County",
    "huddersfield": "Huddersfield Town",
    "huddersfield town": "Huddersfield Town",
    "hull": "Hull City",
    "hull city": "Hull City",
    "ipswich": "Ipswich Town",
    "ipswich town": "Ipswich Town",
    "luton": "Luton Town",
    "luton town": "Luton Town",
    "middlesbrough": "Middlesbrough",
    "portsmouth": "Portsmouth",
    "reading": "Reading",
    "sunderland": "Sunderland",
    "swansea": "Swansea City",
    "swansea city": "Swansea City",
    "watford": "Watford",
    "wigan": "Wigan Athletic",
    "wigan athletic": "Wigan Athletic",
    "burnley": "Burnley",
    "cardiff": "Cardiff City",
    "cardiff city": "Cardiff City",
    "fulham": "Fulham",
    "crystal palace": "Crystal Palace",
    "palace": "Crystal Palace",
    "everton": "Everton",
    "arsenal": "Arsenal",
    "chelsea": "Chelsea",
    "liverpool": "Liverpool",
    "aston villa": "Aston Villa",
    "villa": "Aston Villa",
    "southampton": "Southampton",
    "stoke": "Stoke City",
    "stoke city": "Stoke City",
    "brentford": "Brentford",
    "bradford": "Bradford City",
    "bradford city": "Bradford City",
    "oldham": "Oldham Athletic",
    "wimbledon": "Wimbledon",
    "barnsley": "Barnsley",
    "blackpool": "Blackpool",
    "middlesboro": "Middlesbrough",
}

POSITION_MAP = {
    "goalkeeper": ("GK", "GK"),
    "keeper": ("GK", "GK"),
    "gk": ("GK", "GK"),
    "centre-back": ("CB", "DEF"),
    "center-back": ("CB", "DEF"),
    "centre back": ("CB", "DEF"),
    "central defender": ("CB", "DEF"),
    "sweeper": ("CB", "DEF"),
    "defender": ("CB", "DEF"),
    "defence": ("CB", "DEF"),
    "cb": ("CB", "DEF"),
    "left-back": ("LB", "DEF"),
    "left back": ("LB", "DEF"),
    "lb": ("LB", "DEF"),
    "right-back": ("RB", "DEF"),
    "right back": ("RB", "DEF"),
    "rb": ("RB", "DEF"),
    "left wing-back": ("LWB", "DEF"),
    "left wingback": ("LWB", "DEF"),
    "lwb": ("LWB", "DEF"),
    "right wing-back": ("RWB", "DEF"),
    "right wingback": ("RWB", "DEF"),
    "rwb": ("RWB", "DEF"),
    "defensive midfield": ("CDM", "MID"),
    "defensive midfielder": ("CDM", "MID"),
    "dm": ("CDM", "MID"),
    "cdm": ("CDM", "MID"),
    "central midfield": ("CM", "MID"),
    "central midfielder": ("CM", "MID"),
    "centre-forward": ("ST", "FWD"),
    "midfield": ("CM", "MID"),
    "midfielder": ("CM", "MID"),
    "cm": ("CM", "MID"),
    "attacking midfield": ("CAM", "MID"),
    "attacking midfielder": ("CAM", "MID"),
    "am": ("CAM", "MID"),
    "cam": ("CAM", "MID"),
    "left midfield": ("LM", "MID"),
    "left midfielder": ("LM", "MID"),
    "lm": ("LM", "MID"),
    "right midfield": ("RM", "MID"),
    "right midfielder": ("RM", "MID"),
    "rm": ("RM", "MID"),
    "left winger": ("LW", "FWD"),
    "left wing": ("LW", "FWD"),
    "lw": ("LW", "FWD"),
    "right winger": ("RW", "FWD"),
    "right wing": ("RW", "FWD"),
    "rw": ("RW", "FWD"),
    "second striker": ("ST", "FWD"),
    "centre forward": ("ST", "FWD"),
    "center forward": ("ST", "FWD"),
    "forward": ("ST", "FWD"),
    "attack": ("ST", "FWD"),
    "striker": ("ST", "FWD"),
    "st": ("ST", "FWD"),
    "cf": ("ST", "FWD"),
    "fw": ("ST", "FWD"),
}

FPL_TYPE = {1: ("GK", "GK"), 2: ("CB", "DEF"), 3: ("CM", "MID"), 4: ("ST", "FWD")}

# Iconic FIFA-style overalls for landmark Premier League player-seasons.
FIFA_OVERLAY = {
    ("thierry henry", 2003): 93,
    ("thierry henry", 2002): 91,
    ("thierry henry", 2001): 90,
    ("thierry henry", 2004): 90,
    ("alan shearer", 2000): 89,
    ("patrick vieira", 2001): 89,
    ("patrick vieira", 2003): 88,
    ("roy keane", 2000): 89,
    ("dennis bergkamp", 2001): 88,
    ("gianfranco zola", 2001): 87,
    ("steven gerrard", 2005): 90,
    ("steven gerrard", 2008): 89,
    ("frank lampard", 2004): 88,
    ("frank lampard", 2009): 88,
    ("john terry", 2004): 88,
    ("rio ferdinand", 2007): 88,
    ("sol campbell", 2003): 86,
    ("ashley cole", 2005): 87,
    ("cristiano ronaldo", 2007): 91,
    ("cristiano ronaldo", 2006): 87,
    ("wayne rooney", 2009): 89,
    ("wayne rooney", 2006): 87,
    ("wayne rooney", 2011): 87,
    ("didier drogba", 2009): 90,
    ("didier drogba", 2005): 87,
    ("cesc fabregas", 2007): 88,
    ("fernando torres", 2007): 88,
    ("nemanja vidic", 2008): 88,
    ("edwin van der sar", 2008): 87,
    ("petr cech", 2004): 88,
    ("petr cech", 2014): 86,
    ("gareth barry", 2008): 82,
    ("yaya toure", 2013): 89,
    ("yaya toure", 2011): 87,
    ("sergio aguero", 2014): 89,
    ("sergio aguero", 2011): 88,
    ("david silva", 2011): 89,
    ("david silva", 2017): 88,
    ("vincent kompany", 2011): 87,
    ("luis suarez", 2013): 91,
    ("robin van persie", 2011): 90,
    ("robin van persie", 2012): 89,
    ("vincent kompany", 2013): 86,
    ("nemanja matic", 2014): 86,
    ("eden hazard", 2014): 90,
    ("eden hazard", 2016): 91,
    ("n golo kante", 2016): 90,
    ("ngolo kante", 2016): 90,
    ("n'golo kante", 2016): 90,
    ("jamie vardy", 2015): 84,
    ("riyad mahrez", 2015): 85,
    ("harry kane", 2016): 88,
    ("harry kane", 2017): 89,
    ("harry kane", 2022): 89,
    ("dejan lovren", 2016): 80,
    ("sadio mane", 2019): 90,
    ("mohamed salah", 2017): 90,
    ("mohamed salah", 2019): 91,
    ("mohamed salah", 2024): 90,
    ("virgil van dijk", 2018): 91,
    ("alisson", 2018): 89,
    ("alisson becker", 2018): 89,
    ("kevin de bruyne", 2017): 91,
    ("kevin de bruyne", 2019): 91,
    ("kevin de bruyne", 2021): 91,
    ("raheem sterling", 2018): 88,
    ("bernardo silva", 2018): 87,
    ("phil foden", 2023): 88,
    ("erling haaland", 2022): 91,
    ("erling haaland", 2024): 91,
    ("rodri", 2023): 91,
    ("rodrigo hernandez", 2023): 91,
    ("bukayo saka", 2023): 89,
    ("martin odegaard", 2023): 88,
    ("declan rice", 2023): 87,
    ("cole palmer", 2024): 88,
    ("son heungmin", 2021): 89,
    ("son heung-min", 2021): 89,
    ("heungmin son", 2021): 89,
    ("heung-min son", 2021): 89,
    ("bruno fernandes", 2020): 88,
    ("marcus rashford", 2022): 86,
    ("trent alexanderarnold", 2019): 87,
    ("trent alexander-arnold", 2019): 87,
    ("andrew robertson", 2018): 87,
    ("ruben dias", 2020): 88,
    ("ederson", 2020): 88,
    ("thibaut courtois", 2014): 86,
    ("david de gea", 2015): 88,
    ("paul scholes", 2002): 88,
    ("ryan giggs", 2008): 85,
    ("paul pogba", 2017): 88,
    ("alexis sanchez", 2016): 88,
    ("mesut ozil", 2015): 88,
    ("luka modric", 2011): 86,
    ("gareth bale", 2012): 87,
    ("dimitar berbatov", 2010): 85,
    ("carlos tevez", 2009): 87,
    ("michael owen", 2001): 88,
    ("robbie keane", 2005): 83,
    ("jermain defoe", 2009): 83,
    ("peter crouch", 2005): 80,
    ("emile heskey", 2000): 82,
    ("dwight yorke", 2000): 84,
    ("andy cole", 2000): 84,
    ("ole gunnar solskjaer", 2001): 82,
    ("ruud van nistelrooy", 2002): 89,
    ("juan sebastian veron", 2001): 86,
    ("claude makelele", 2004): 87,
    ("michael essien", 2006): 86,
    ("deco", 2008): 84,
    ("arnjen robben", 2004): 86,
    ("arjen robben", 2004): 86,
    ("damien duff", 2004): 84,
    ("joe cole", 2005): 83,
    ("ashley young", 2008): 82,
    ("james milner", 2010): 82,
    ("jordan henderson", 2019): 85,
    ("xabi alonso", 2008): 86,
    ("javier mascherano", 2008): 85,
    ("pepe reina", 2008): 85,
    ("pepe", 2008): 85,
    ("fernandinho", 2017): 86,
    ("ilkay gundogan", 2022): 86,
    ("jack grealish", 2021): 85,
    ("kai havertz", 2023): 84,
    ("william saliba", 2023): 86,
    ("gabriel magalhaes", 2023): 84,
    ("gabriel martinelli", 2023): 84,
    ("ousmane dembele", 2025): 88,
    ("alexander isak", 2024): 87,
    ("bruno guimaraes", 2024): 86,
    ("anthony gordon", 2024): 84,
}


def log(message: str) -> None:
    print(message, flush=True)


def strip_accents(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def norm_text(value: str) -> str:
    value = strip_accents(str(value or "")).lower().strip()
    value = value.replace("&", " and ")
    value = re.sub(r"[^a-z0-9 ]+", " ", value)
    return re.sub(r"\s+", " ", value).strip()


def club_name(raw: str) -> str:
    key = norm_text(raw)
    key = key.replace(" fc", "").replace(" afc", "").strip()
    if "nott" in key and "forest" in key:
        return "Nottingham Forest"
    return CLUB_ALIASES.get(key, str(raw).replace(" FC", "").strip())


def club_key(name: str) -> str:
    return re.sub(r"[^a-z0-9]+", "-", club_name(name).lower()).strip("-")


def season_label(start: int) -> str:
    return f"{start}-{str(start + 1)[2:]}"


def map_position(raw: str, fallback_group: str | None = None) -> tuple[str, str]:
    key = norm_text(raw)
    if key in POSITION_MAP:
        return POSITION_MAP[key]
    for token, mapped in POSITION_MAP.items():
        if token in key:
            return mapped
    if fallback_group == "GK":
        return "GK", "GK"
    if fallback_group == "DEF":
        return "CB", "DEF"
    if fallback_group == "FWD":
        return "ST", "FWD"
    return "CM", "MID"


def download(url: str, dest: Path) -> Path:
    dest.parent.mkdir(parents=True, exist_ok=True)
    if dest.exists() and dest.stat().st_size > 1000:
        return dest
    log(f"  downloading {url}")
    req = urllib.request.Request(url, headers={"User-Agent": "epl-era-draft/1.0"})
    with urllib.request.urlopen(req, timeout=120) as response:
        dest.write_bytes(response.read())
    return dest


def percentile_rank(series: pd.Series) -> pd.Series:
    return series.rank(method="average", pct=True).fillna(0.35)


def estimate_overall(row: pd.Series) -> int:
    minutes = float(row.get("minutes") or 0)
    goals = float(row.get("goals") or 0)
    assists = float(row.get("assists") or 0)
    apps = float(row.get("apps") or 0)
    value_pct = float(row.get("value_pct") or 0.4)
    minutes_pct = float(row.get("minutes_pct") or 0.4)
    group = row.get("group") or "MID"

    score = 50 + 18 * value_pct + 8 * minutes_pct
    if group == "FWD":
        score += min(5, goals * 0.18 + assists * 0.12)
    elif group == "MID":
        score += min(4, goals * 0.14 + assists * 0.14)
    elif group == "DEF":
        score += min(3, apps * 0.03)
    elif group == "GK":
        score += min(3, apps * 0.04)

    if minutes < 180:
        score -= 8
    elif minutes < 900:
        score -= 4
    elif minutes >= 2700:
        score += 1

    return int(max(52, min(86, round(score))))


def apply_fifa_overlay(name: str, season_start: int, estimated: int) -> tuple[int, str]:
    key = (norm_text(name), int(season_start))
    if key in FIFA_OVERLAY:
        return FIFA_OVERLAY[key], "fifa"
    # Allow nearby season for the same icon
    for delta in (-1, 1):
        nearby = (key[0], key[1] + delta)
        if nearby in FIFA_OVERLAY:
            return max(estimated, FIFA_OVERLAY[nearby] - 2), "fifa"
    return estimated, "estimated"


def load_transfermarkt() -> pd.DataFrame | None:
    log("Trying Transfermarkt open dataset...")
    try:
        apps_path = download(f"{TM_BASE}/appearances.csv.gz", CACHE / "appearances.csv.gz")
        players_path = download(f"{TM_BASE}/players.csv.gz", CACHE / "players.csv.gz")
        clubs_path = download(f"{TM_BASE}/clubs.csv.gz", CACHE / "clubs.csv.gz")
        vals_path = download(f"{TM_BASE}/player_valuations.csv.gz", CACHE / "player_valuations.csv.gz")

        apps = pd.read_csv(
            apps_path,
            usecols=[
                "player_id",
                "player_club_id",
                "player_name",
                "competition_id",
                "date",
                "goals",
                "assists",
                "minutes_played",
            ],
        )
        apps = apps[apps["competition_id"] == "GB1"].copy()
        apps["date"] = pd.to_datetime(apps["date"], errors="coerce")
        apps = apps.dropna(subset=["date"])
        apps["season_start"] = apps["date"].dt.year.where(apps["date"].dt.month >= 8, apps["date"].dt.year - 1)
        apps = apps[apps["season_start"].isin(SEASON_STARTS)]

        grouped = (
            apps.groupby(["player_id", "player_club_id", "season_start"], as_index=False)
            .agg(
                appearance_name=("player_name", "last"),
                minutes=("minutes_played", "sum"),
                goals=("goals", "sum"),
                assists=("assists", "sum"),
                apps=("minutes_played", "count"),
            )
        )
        grouped = grouped[grouped["minutes"] >= 90]

        players = pd.read_csv(
            players_path,
            usecols=lambda c: c in {
                "player_id",
                "name",
                "position",
                "sub_position",
                "country_of_citizenship",
                "country_of_birth",
                "market_value_in_eur",
            },
        ).rename(columns={"name": "player_name_full"})
        clubs = pd.read_csv(clubs_path, usecols=lambda c: c in {"club_id", "name", "club_code"})
        clubs = clubs.rename(columns={"club_id": "player_club_id", "name": "club_raw"})

        merged = grouped.merge(players, on="player_id", how="left")
        merged = merged.merge(clubs[["player_club_id", "club_raw"]], on="player_club_id", how="left")

        try:
            vals = pd.read_csv(vals_path, usecols=["player_id", "date", "market_value_in_eur"])
            vals["date"] = pd.to_datetime(vals["date"], errors="coerce")
            vals = vals.dropna(subset=["date", "market_value_in_eur"])
            vals["season_start"] = vals["date"].dt.year.where(vals["date"].dt.month >= 8, vals["date"].dt.year - 1)
            val_season = (
                vals.groupby(["player_id", "season_start"], as_index=False)["market_value_in_eur"].median()
            )
            merged = merged.merge(val_season, on=["player_id", "season_start"], how="left", suffixes=("", "_season"))
        except Exception as exc:  # noqa: BLE001
            log(f"  valuations optional skip: {exc}")

        value_col = "market_value_in_eur_season" if "market_value_in_eur_season" in merged.columns else "market_value_in_eur"
        if value_col not in merged.columns:
            merged["market_value"] = 0
        else:
            merged["market_value"] = merged[value_col].fillna(merged.get("market_value_in_eur", 0)).fillna(0)

        merged["display_name"] = merged["player_name_full"].fillna(merged["appearance_name"])

        pos_raw = merged["sub_position"].fillna(merged.get("position", "")) if "sub_position" in merged.columns else merged.get("position", "")
        mapped = pos_raw.map(lambda p: map_position(str(p)))
        merged["slot"] = mapped.map(lambda t: t[0])
        merged["group"] = mapped.map(lambda t: t[1])
        merged["club"] = merged["club_raw"].map(lambda x: club_name(str(x)))
        merged["nationality"] = merged.get("country_of_citizenship", pd.Series([""] * len(merged))).fillna("")
        merged["source"] = "transfermarkt"
        merged["player_uid"] = merged["player_id"].map(lambda i: f"tm-{int(i)}")
        log(f"  Transfermarkt player-seasons: {len(merged)}")
        return merged[
            [
                "player_uid",
                "display_name",
                "season_start",
                "club",
                "slot",
                "group",
                "minutes",
                "goals",
                "assists",
                "apps",
                "market_value",
                "nationality",
                "source",
            ]
        ].rename(columns={"display_name": "name"})
    except Exception as exc:  # noqa: BLE001
        log(f"  Transfermarkt failed: {exc}")
        traceback.print_exc()
        return None


def load_early_era() -> pd.DataFrame:
    log("Loading curated 2000-04 Premier League squads...")
    rows = []
    for season_start, clubs in EARLY_SEASONS.items():
        for club, squad in clubs.items():
            seen = set()
            for name, slot, overall in squad:
                key = norm_text(name)
                if key in seen:
                    continue
                seen.add(key)
                group = "GK" if slot == "GK" else "DEF" if slot in {"CB", "LB", "RB", "LWB", "RWB"} else "FWD" if slot in {"LW", "RW", "ST"} else "MID"
                rows.append(
                    {
                        "player_uid": "nm-" + re.sub(r"[^a-z0-9]+", "-", key),
                        "name": name,
                        "season_start": season_start,
                        "club": club_name(club),
                        "slot": slot,
                        "group": group,
                        "minutes": 2200,
                        "goals": 0,
                        "assists": 0,
                        "apps": 28,
                        "market_value": max(500_000, (overall ** 4) * 30),
                        "nationality": "",
                        "source": "early-era",
                        "forced_overall": overall,
                    }
                )
    df = pd.DataFrame(rows)
    log(f"  early-era player-seasons: {len(df)}")
    return df


def load_ewenme() -> pd.DataFrame | None:
    log("Trying ewenme squad CSVs...")
    frames = []
    for year in range(2004, 2021):
        try:
            path = download(f"{EWENME_BASE}/{year}/premier_league.csv", CACHE / f"ewenme-{year}.csv")
            df = pd.read_csv(path)
            df["season_start"] = year
            frames.append(df)
        except Exception as exc:  # noqa: BLE001
            log(f"  skip ewenme {year}: {exc}")
    if not frames:
        return None
    df = pd.concat(frames, ignore_index=True)
    mapped = df["position"].map(lambda p: map_position(str(p)))
    df["slot"] = mapped.map(lambda t: t[0])
    df["group"] = mapped.map(lambda t: t[1])
    df["club"] = df["club_name"].map(club_name)
    df["name"] = df["player_name"]
    df["minutes"] = 1500
    df["goals"] = 0
    df["assists"] = 0
    df["apps"] = 20
    df["market_value"] = 0
    df["nationality"] = df.get("nationality", "")
    df["source"] = "ewenme"
    df["player_uid"] = df["name"].map(lambda n: "nm-" + re.sub(r"[^a-z0-9]+", "-", norm_text(n)))
    log(f"  ewenme player-seasons: {len(df)}")
    return df[
        [
            "player_uid",
            "name",
            "season_start",
            "club",
            "slot",
            "group",
            "minutes",
            "goals",
            "assists",
            "apps",
            "market_value",
            "nationality",
            "source",
        ]
    ]


def load_fpl_team_map(start: int, season: str) -> dict:
    try:
        teams_path = download(f"{FPL_BASE}/{season}/teams.csv", CACHE / f"fpl-{season}-teams.csv")
        teams = pd.read_csv(teams_path)
        return dict(zip(teams["id"], teams["name"]))
    except Exception:
        master_path = download(f"{FPL_BASE}/master_team_list.csv", CACHE / "fpl-master-teams.csv")
        master = pd.read_csv(master_path)
        season_key = season if "season" in master.columns else None
        if season_key:
            subset = master[master["season"].astype(str) == season]
            if subset.empty:
                subset = master
            team_id_col = "team" if "team" in subset.columns else "id"
            name_col = "team_name" if "team_name" in subset.columns else "name"
            return dict(zip(subset[team_id_col], subset[name_col]))
        return {}


def load_fpl() -> pd.DataFrame | None:
    log("Trying FPL historical dumps...")
    frames = []
    for start in range(2016, 2026):
        season = f"{start}-{str(start + 1)[2:]}"
        try:
            players_path = download(f"{FPL_BASE}/{season}/players_raw.csv", CACHE / f"fpl-{season}-players.csv")
            players = pd.read_csv(players_path)
            team_map = load_fpl_team_map(start, season)
            players["club"] = players["team"].map(lambda i: club_name(str(team_map.get(i, i))))
            players["season_start"] = start
            frames.append(players)
        except Exception as exc:  # noqa: BLE001
            log(f"  skip FPL {season}: {exc}")
    if not frames:
        return None
    df = pd.concat(frames, ignore_index=True)
    mapped = df["element_type"].map(lambda t: FPL_TYPE.get(int(t), ("CM", "MID")))
    df["slot"] = mapped.map(lambda t: t[0])
    df["group"] = mapped.map(lambda t: t[1])
    first = df.get("first_name", pd.Series([""] * len(df))).fillna("")
    last = df.get("second_name", pd.Series([""] * len(df))).fillna("")
    web = df.get("web_name", pd.Series([""] * len(df))).fillna("")
    df["name"] = (first.astype(str) + " " + last.astype(str)).str.strip()
    df["name"] = df["name"].where(df["name"].str.len() > 1, web)
    df["minutes"] = pd.to_numeric(df.get("minutes"), errors="coerce").fillna(0)
    df = df[df["minutes"] >= 90]
    df["goals"] = pd.to_numeric(df.get("goals_scored"), errors="coerce").fillna(0)
    df["assists"] = pd.to_numeric(df.get("assists"), errors="coerce").fillna(0)
    df["apps"] = (df["minutes"] / 90).clip(lower=1)
    cost = pd.to_numeric(df.get("now_cost"), errors="coerce").fillna(45)
    # FPL price (45-150) mapped into a pseudo market value for percentile scoring.
    df["market_value"] = (cost ** 3) * 1000
    df["nationality"] = ""
    df["source"] = "fpl"
    code = df.get("code", df.get("id"))
    df["player_uid"] = code.map(lambda i: f"fpl-{int(i)}" if pd.notna(i) else "fpl-unknown")
    log(f"  FPL player-seasons: {len(df)}")
    return df[
        [
            "player_uid",
            "name",
            "season_start",
            "club",
            "slot",
            "group",
            "minutes",
            "goals",
            "assists",
            "apps",
            "market_value",
            "nationality",
            "source",
        ]
    ]


def merge_sources(frames: list[pd.DataFrame]) -> pd.DataFrame:
    preferred = {"transfermarkt": 0, "fpl": 1, "early-era": 2, "ewenme": 3}
    combined = pd.concat(frames, ignore_index=True)
    combined["club"] = combined["club"].map(club_name)
    combined["name_key"] = combined["name"].map(norm_text)
    combined["club_key"] = combined["club"].map(club_key)
    combined["priority"] = combined["source"].map(lambda s: preferred.get(s, 9))
    combined = combined.sort_values(["season_start", "club_key", "name_key", "priority"])
    combined = combined.drop_duplicates(subset=["season_start", "club_key", "name_key"], keep="first")
    return combined


def to_records(df: pd.DataFrame) -> list[dict]:
    df = df.copy()
    df["value_pct"] = df.groupby("season_start")["market_value"].transform(percentile_rank)
    df["minutes_pct"] = df.groupby("season_start")["minutes"].transform(percentile_rank)

    records = []
    for data in df.to_dict("records"):
        if pd.notna(data.get("forced_overall")) and data.get("source") == "early-era":
            estimated = int(data["forced_overall"])
        else:
            estimated = estimate_overall(pd.Series(data))
        overall, source = apply_fifa_overlay(str(data["name"]), int(data["season_start"]), estimated)
        season = season_label(int(data["season_start"]))
        player_id = "nm-" + re.sub(r"[^a-z0-9]+", "-", norm_text(str(data["name"])))
        club = club_name(str(data["club"]))
        records.append(
            {
                "id": f"{data['player_uid']}::{season}::{club_key(club)}",
                "playerId": player_id,
                "name": str(data["name"]).strip(),
                "season": season,
                "club": club,
                "clubKey": club_key(club),
                "slot": str(data["slot"]),
                "group": str(data["group"]),
                "overall": int(overall),
                "ratingSource": source,
                "nationality": "" if pd.isna(data.get("nationality")) else str(data.get("nationality") or ""),
                "minutes": int(float(data.get("minutes") or 0)),
            }
        )
    records.sort(key=lambda r: (r["season"], r["club"], -r["overall"], r["name"]))
    return records


def validate(records: list[dict]) -> None:
    seasons = {r["season"] for r in records}
    clubs = {(r["season"], r["club"]) for r in records}
    log(f"Seasons: {len(seasons)} ({min(seasons) if seasons else '-'} to {max(seasons) if seasons else '-'})")
    log(f"Club-seasons: {len(clubs)}")
    log(f"Players: {len(records)}")
    missing = [season_label(y) for y in SEASON_STARTS if season_label(y) not in seasons]
    if missing:
        log(f"WARNING missing seasons: {missing}")
    per = {}
    for season, club in clubs:
        per[season] = per.get(season, 0) + 1
    thin = {s: n for s, n in per.items() if n < 18}
    if thin:
        log(f"WARNING seasons with <18 clubs: {thin}")


def main() -> int:
    CACHE.mkdir(parents=True, exist_ok=True)
    frames: list[pd.DataFrame] = []
    tm = load_transfermarkt()
    if tm is not None and len(tm) > 1000:
        frames.append(tm)
    frames.append(load_early_era())
    ewenme = load_ewenme()
    if ewenme is not None:
        frames.append(ewenme)
    fpl = load_fpl()
    if fpl is not None:
        frames.append(fpl)
    if not frames:
        log("ERROR: no data sources succeeded")
        return 1

    merged = merge_sources(frames)
    records = to_records(merged)
    validate(records)
    payload = {
        "generatedAt": pd.Timestamp.now(tz="UTC").isoformat(),
        "sourceNotes": [
            "Premier League player-seasons 2000-01 to 2025-26",
            "Squads from Transfermarkt appearances (GB1), with FPL and ewenme fallbacks",
            "Ratings are FIFA overlays where listed, otherwise estimated from minutes/output/value",
        ],
        "players": records,
    }
    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(payload, ensure_ascii=False)
    OUT_DATA.write_text(text)
    OUT_PUBLIC.write_text(text)
    log(f"Wrote {OUT_DATA}")
    log(f"Wrote {OUT_PUBLIC}")
    try:
        from player_photos import build_photos, write_photos

        write_photos(build_photos(records))
    except Exception as exc:  # noqa: BLE001
        log(f"WARNING player photos skipped: {exc}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
