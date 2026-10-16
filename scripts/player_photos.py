#!/usr/bin/env python3
"""Build playerId -> portrait URL lookup used by the pitch and cards.

Sources, in order: Transfermarkt image_url (by player id, then unique name),
FPL photo CDN, Wikipedia thumbnails for FIFA overlay icons still missing.
"""

from __future__ import annotations

import gzip
import json
import re
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from collections import defaultdict
from csv import DictReader
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from ingest_epl import CACHE, FIFA_OVERLAY, ROOT  # noqa: E402

OUT_DATA = ROOT / "data" / "player-photos.json"
OUT_PUBLIC = ROOT / "public" / "data" / "player-photos.json"
PLAYERS_JSON = ROOT / "public" / "data" / "epl-player-seasons.json"
TM_PLAYERS = CACHE / "players.csv.gz"
WIKI_CACHE = CACHE / "wiki-thumbs.json"
FPL_PHOTO = "https://resources.premierleague.com/premierleague/photos/players/250x250/p{code}.png"
WIKI_SUMMARY = "https://en.wikipedia.org/api/rest_v1/page/summary/{title}"
USER_AGENT = "EraDraftLeague/1.0 (local game prototype; portraits for selected XI)"

WIKI_TITLES = {
    "n golo kante": "N'Golo_Kanté",
    "ngolo kante": "N'Golo_Kanté",
    "n'golo kante": "N'Golo_Kanté",
    "son heungmin": "Son_Heung-min",
    "son heung-min": "Son_Heung-min",
    "heungmin son": "Son_Heung-min",
    "heung-min son": "Son_Heung-min",
    "trent alexanderarnold": "Trent_Alexander-Arnold",
    "trent alexander-arnold": "Trent_Alexander-Arnold",
    "alisson": "Alisson",
    "alisson becker": "Alisson",
    "edwin van der sar": "Edwin_van_der_Sar",
    "robin van persie": "Robin_van_Persie",
    "ruud van nistelrooy": "Ruud_van_Nistelrooy",
    "juan sebastian veron": "Juan_Sebastián_Verón",
    "ole gunnar solskjaer": "Ole_Gunnar_Solskjær",
    "arnjen robben": "Arjen_Robben",
    "gabriel magalhaes": "Gabriel_Magalhães",
}


def log(message: str) -> None:
    print(message, flush=True)


def strip_accents(value: str) -> str:
    return unicodedata.normalize("NFKD", value).encode("ascii", "ignore").decode("ascii")


def slug_name(value: str) -> str:
    value = strip_accents(str(value or "")).lower().strip()
    return re.sub(r"[^a-z0-9]+", "-", value).strip("-")


def is_real_photo(url: str | None) -> bool:
    if not url:
        return False
    lower = url.lower()
    if "default.jpg" in lower or "default.png" in lower:
        return False
    return lower.startswith("http")


def birth_year_of(raw: str) -> int | None:
    match = re.match(r"(\d{4})", str(raw or ""))
    return int(match.group(1)) if match else None


def age_plausible(born: int | None, min_season: int | None) -> bool:
    if not born or not min_season:
        return False
    age = min_season - born
    return 16 <= age <= 44


def load_tm_images() -> tuple[dict[str, str], dict[str, list[tuple[str, int | None]]]]:
    by_id: dict[str, str] = {}
    by_slug: dict[str, list[tuple[str, int | None]]] = defaultdict(list)
    if not TM_PLAYERS.exists():
        log("  players.csv.gz missing — run ingest first for Transfermarkt portraits")
        return {}, {}
    with gzip.open(TM_PLAYERS, "rt") as handle:
        for rec in DictReader(handle):
            url = (rec.get("image_url") or "").strip()
            if not is_real_photo(url):
                continue
            player_id = str(rec.get("player_id") or "").strip()
            born = birth_year_of(rec.get("date_of_birth") or "")
            if player_id:
                by_id[player_id] = url
            slug = slug_name(rec.get("name") or "")
            if slug:
                by_slug[slug].append((url, born))
    return by_id, by_slug


def uid_parts(record_id: str) -> tuple[str, str]:
    uid = record_id.split("::", 1)[0]
    if uid.startswith("tm-") or uid.startswith("fpl-"):
        kind, _, rest = uid.partition("-")
        return kind, rest
    return "", ""


def wiki_title_for(name: str) -> str:
    key = re.sub(r"\s+", " ", strip_accents(name).lower().strip())
    if key in WIKI_TITLES:
        return WIKI_TITLES[key]
    titled = " ".join(part[:1].upper() + part[1:] if part else part for part in name.split())
    return titled.replace(" ", "_")


def http_get_json(url: str) -> dict | None:
    req = urllib.request.Request(url, headers={"User-Agent": USER_AGENT, "Accept": "application/json"})
    try:
        with urllib.request.urlopen(req, timeout=20) as response:
            return json.loads(response.read().decode("utf-8"))
    except (urllib.error.URLError, TimeoutError, json.JSONDecodeError, UnicodeDecodeError):
        return None


def wiki_thumb(name: str, cache: dict[str, str | None]) -> str | None:
    if name in cache:
        return cache[name]
    title = wiki_title_for(name)
    payload = http_get_json(WIKI_SUMMARY.format(title=urllib.parse.quote(title)))
    url = None
    if payload and payload.get("type") == "standard":
        thumb = (payload.get("thumbnail") or {}).get("source")
        if is_real_photo(thumb):
            url = str(thumb).split("?")[0]
    cache[name] = url
    return url


def overlay_icon_names() -> set[str]:
    names: set[str] = set()
    for name, _season in FIFA_OVERLAY:
        names.add(name)
    return names


def build_photos(records: list[dict]) -> dict[str, str]:
    by_id, by_slug = load_tm_images()
    wiki_cache: dict[str, str | None] = {}
    if WIKI_CACHE.exists():
        try:
            wiki_cache = json.loads(WIKI_CACHE.read_text())
        except json.JSONDecodeError:
            wiki_cache = {}

    grouped: dict[str, dict] = {}
    for rec in records:
        player_id = rec["playerId"]
        bucket = grouped.setdefault(
            player_id, {"tm": set(), "fpl": set(), "names": set(), "min_season": None}
        )
        bucket["names"].add(rec["name"])
        start = int(str(rec.get("season") or "0")[:4] or 0)
        if start and (bucket["min_season"] is None or start < bucket["min_season"]):
            bucket["min_season"] = start
        kind, value = uid_parts(rec["id"])
        if kind == "tm" and value:
            bucket["tm"].add(value)
        elif kind == "fpl" and value.isdigit():
            bucket["fpl"].add(value)

    photos: dict[str, str] = {}
    counts = {"tm-id": 0, "tm-name": 0, "fpl": 0, "wiki": 0, "none": 0}
    overlay_keys = overlay_icon_names()

    def name_match(pid: str, bucket: dict) -> str | None:
        slugs = [pid[3:] if pid.startswith("nm-") else slug_name(pid)]
        slugs.extend(slug_name(name) for name in bucket["names"])
        candidates: list[str] = []
        for slug in slugs:
            for url, born in by_slug.get(slug, []):
                if age_plausible(born, bucket["min_season"]):
                    candidates.append(url)
        unique = list(dict.fromkeys(candidates))
        return unique[0] if len(unique) == 1 else None

    for player_id, bucket in grouped.items():
        url = None
        display_name = next(iter(bucket["names"]))
        overlay_key = re.sub(r"\s+", " ", strip_accents(display_name).lower().strip())
        is_icon = overlay_key in overlay_keys
        for tmid in bucket["tm"]:
            if tmid in by_id:
                url = by_id[tmid]
                counts["tm-id"] += 1
                break
        if not url and is_icon:
            url = wiki_thumb(display_name, wiki_cache)
            if url:
                counts["wiki"] += 1
        if not url:
            url = name_match(player_id, bucket)
            if url:
                counts["tm-name"] += 1
        if not url:
            for code in bucket["fpl"]:
                url = FPL_PHOTO.format(code=code)
                counts["fpl"] += 1
                break
        if url:
            photos[player_id] = url
        else:
            counts["none"] += 1

    WIKI_CACHE.parent.mkdir(parents=True, exist_ok=True)
    WIKI_CACHE.write_text(json.dumps(wiki_cache, ensure_ascii=False, indent=2))
    log(
        "  photos: "
        f"{counts['tm-id']} tm-id, {counts['tm-name']} tm-name, {counts['fpl']} fpl, "
        f"{counts['wiki']} wiki, {counts['none']} initials-only "
        f"({len(photos)}/{len(grouped)} unique players)"
    )
    return photos


def write_photos(photos: dict[str, str]) -> None:
    payload = {
        "generatedAt": __import__("datetime").datetime.now(__import__("datetime").timezone.utc).isoformat(),
        "photos": photos,
    }
    text = json.dumps(payload, ensure_ascii=False)
    OUT_DATA.parent.mkdir(parents=True, exist_ok=True)
    OUT_PUBLIC.parent.mkdir(parents=True, exist_ok=True)
    OUT_DATA.write_text(text)
    OUT_PUBLIC.write_text(text)
    log(f"Wrote {OUT_PUBLIC} ({len(photos)} portraits)")


def main() -> int:
    if not PLAYERS_JSON.exists():
        log("ERROR: public/data/epl-player-seasons.json missing — run ingest first")
        return 1
    data = json.loads(PLAYERS_JSON.read_text())
    records = data["players"] if isinstance(data, dict) else data
    photos = build_photos(records)
    write_photos(photos)
    return 0


if __name__ == "__main__":
    sys.exit(main())
