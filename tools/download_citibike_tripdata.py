"""
Citi Bike monthly tripdata downloader (S3 listing).

Date: 2026-01-12
Author: Aron Maggisano
"""

from __future__ import annotations

import re
import shutil
import time
import zipfile
import xml.etree.ElementTree as ET
from pathlib import Path

import requests
from tqdm import tqdm

BASE_URL = "https://s3.amazonaws.com/tripdata/"
DOWNLOAD_DIR = Path("data/tripdata")

# Typical monthly archives:
# 202406-citibike-tripdata.zip or 202406-citibike-tripdata.csv.zip
MONTHLY_ZIP_RE = re.compile(r"^(?P<ym>\d{6})-citibike-tripdata(?:\.csv)?\.zip$")

# S3 XML namespace for ListObjectsV2
S3_NS = {"s3": "http://s3.amazonaws.com/doc/2006-03-01/"}

# ==========================
# CONFIG
# ==========================
EXTRACT = True
REMOVE_ZIP_AFTER_EXTRACT = True

# Limit how many months to process at once (helps avoid disk saturation)
MAX_ARCHIVES: int | None = None

# Minimum free space (GiB) required before extracting
MIN_FREE_GIB_TO_EXTRACT = 10

# Extract only CSV files (recommended)
EXTRACT_ONLY_REGEX = re.compile(r".*\.csv$", re.IGNORECASE)
# ==========================


def iter_s3_keys(session: requests.Session, prefix: str = "") -> list[str]:
    """List all object keys from the S3 bucket using ListObjectsV2 (paginated)."""
    keys: list[str] = []
    token: str | None = None

    while True:
        params: dict[str, str] = {"list-type": "2", "max-keys": "1000"}
        if prefix:
            params["prefix"] = prefix
        if token:
            params["continuation-token"] = token

        response = session.get(BASE_URL, params=params, timeout=30)
        response.raise_for_status()

        root = ET.fromstring(response.text)
        for element in root.findall("s3:Contents", S3_NS):
            key = element.findtext("s3:Key", default="", namespaces=S3_NS)
            if key:
                keys.append(key)

        is_truncated = root.findtext(
            "s3:IsTruncated", default="false", namespaces=S3_NS
        ) == "true"
        if not is_truncated:
            break

        token = root.findtext("s3:NextContinuationToken", default="", namespaces=S3_NS) or None
        if not token:
            break

    return keys


def fetch_zip_list(
    session: requests.Session,
    *,
    year_from: int | None = None,
    year_to: int | None = None,
    months: set[str] | None = None,
) -> list[str]:
    """
    Return the list of archive keys to download.

    - If months is provided, download only those YYYYMM.
    - Otherwise, filter by year range (inclusive).
    """
    all_keys = iter_s3_keys(session)
    selected: list[str] = []

    for key in all_keys:
        match = MONTHLY_ZIP_RE.match(key)
        if not match:
            continue

        ym = match.group("ym")
        year = int(ym[:4])

        if months is not None and ym not in months:
            continue
        if year_from is not None and year < year_from:
            continue
        if year_to is not None and year > year_to:
            continue

        selected.append(key)

    return sorted(set(selected))


def is_valid_zip(path: Path) -> bool:
    """Fast+safe zip validation: file exists, is a zip, and passes testzip."""
    if not path.exists() or path.stat().st_size == 0:
        return False
    if not zipfile.is_zipfile(path):
        return False
    try:
        with zipfile.ZipFile(path) as archive:
            return archive.testzip() is None
    except zipfile.BadZipFile:
        return False


def month_has_extracted_csvs(ym: str) -> bool:
    """Treat the month as extracted if at least one *_YYYYMM CSV exists."""
    pattern = f"{ym}-citibike-tripdata_*.csv"
    return any(DOWNLOAD_DIR.glob(pattern))


def download_file(session: requests.Session, key: str) -> Path:
    DOWNLOAD_DIR.mkdir(parents=True, exist_ok=True)
    target = DOWNLOAD_DIR / key
    temp = target.with_name(target.name + ".part")

    if temp.exists():
        print(f"[CLEAN] Removing partial download: {temp.name}")
        temp.unlink(missing_ok=True)

    if target.exists():
        if is_valid_zip(target):
            print(f"[SKIP] Valid archive already present: {target.name}")
            return target
        print(f"[REDL] Invalid archive found, re-downloading: {target.name}")
        target.unlink(missing_ok=True)

    url = f"{BASE_URL}{key}"
    print(f"[DL]   {key}")

    with session.get(url, stream=True, timeout=120) as response:
        response.raise_for_status()

        total = int(response.headers.get("Content-Length", "0") or 0)
        chunk_size = 1024 * 1024

        bar = tqdm(
            total=total if total > 0 else None,
            unit="B",
            unit_scale=True,
            unit_divisor=1024,
            desc=target.name,
            leave=True,
        )

        start = time.time()
        downloaded = 0

        try:
            with open(temp, "wb") as handle:
                for chunk in response.iter_content(chunk_size=chunk_size):
                    if not chunk:
                        continue
                    handle.write(chunk)
                    downloaded += len(chunk)
                    bar.update(len(chunk))
                    elapsed = time.time() - start
                    if elapsed > 0:
                        speed = downloaded / elapsed
                        bar.set_postfix_str(f"{speed/1024/1024:.1f} MB/s")
        finally:
            bar.close()

    temp.replace(target)

    if not is_valid_zip(target):
        target.unlink(missing_ok=True)
        raise RuntimeError(f"Download completed but archive is invalid: {target.name}")

    print(f"[OK]   Saved: {target} ({downloaded/1024/1024:.1f} MiB)")
    return target


def free_gib(path: Path) -> float:
    usage = shutil.disk_usage(path)
    return usage.free / (1024**3)


def safe_extract_all_csvs(zip_path: Path, dest: Path) -> None:
    """Extract all CSVs safely (file-by-file, no extractall)."""
    available = free_gib(dest)
    if available < MIN_FREE_GIB_TO_EXTRACT:
        raise RuntimeError(
            f"Not enough free space: {available:.1f} GiB available, "
            f"need at least {MIN_FREE_GIB_TO_EXTRACT} GiB."
        )

    with zipfile.ZipFile(zip_path) as archive:
        infos = archive.infolist()
        if EXTRACT_ONLY_REGEX is not None:
            infos = [info for info in infos if EXTRACT_ONLY_REGEX.match(info.filename)]

        if not infos:
            print(f"[UNZIP] No CSV files in {zip_path.name}, skipping.")
            return

        print(f"[UNZIP] {zip_path.name} -> extracting {len(infos)} files")
        dest_resolved = dest.resolve()

        for info in infos:
            out_path = (dest / info.filename).resolve()
            if not str(out_path).startswith(str(dest_resolved)):
                raise ValueError(f"Suspicious path inside zip: {info.filename}")
            archive.extract(info, path=dest)


def cleanup_extracted_zips() -> None:
    """Remove zip files for months that already have extracted CSVs."""
    for zip_path in DOWNLOAD_DIR.glob("*-citibike-tripdata*.zip"):
        match = MONTHLY_ZIP_RE.match(zip_path.name)
        if not match:
            continue
        ym = match.group("ym")
        if month_has_extracted_csvs(ym):
            print(f"[CLEANZIP] Removing extracted archive: {zip_path.name}")
            zip_path.unlink(missing_ok=True)


def clean_empty_dirs(root: Path) -> None:
    for path in sorted(root.rglob("*"), reverse=True):
        if path.is_dir():
            try:
                next(path.iterdir())
            except StopIteration:
                shutil.rmtree(path, ignore_errors=True)


def main() -> None:
    # ==========================
    # FILTERS
    # ==========================
    year_from, year_to = 2024, 2024
    months: set[str] | None = None
    # months = {"202401", "202402"}  # example
    # ==========================

    session = requests.Session()
    session.headers.update({"User-Agent": "NYC_mobility/1.0 (+requests)"})

    files = fetch_zip_list(session, year_from=year_from, year_to=year_to, months=months)
    if not files:
        raise SystemExit("No monthly archives found with the selected filters.")

    if MAX_ARCHIVES is not None:
        files = files[:MAX_ARCHIVES]

    print(f"[LIST] {len(files)} archives found. EXTRACT={EXTRACT}")

    for key in files:
        match = MONTHLY_ZIP_RE.match(key)
        ym = match.group("ym") if match else None

        if ym and month_has_extracted_csvs(ym):
            print(f"[SKIP] Month {ym} already extracted (CSV found).")
            continue

        zip_path = download_file(session, key)

        if EXTRACT:
            safe_extract_all_csvs(zip_path, DOWNLOAD_DIR)
            if REMOVE_ZIP_AFTER_EXTRACT:
                zip_path.unlink(missing_ok=True)
                print(f"[RM]   Removed zip: {zip_path.name}")

        print(f"[DONE] {key}")

    cleanup_extracted_zips()
    clean_empty_dirs(DOWNLOAD_DIR)
    print(f"[ALL DONE] Output in {DOWNLOAD_DIR}")


if __name__ == "__main__":
    main()
