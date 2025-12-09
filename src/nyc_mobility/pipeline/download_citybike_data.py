# ============================================
# Author: Aron Maggisano
# Date: 2025-11-18 (ISO 8601)
# File: src/nyc_mobility/pipeline/download_citybike_data.py
# Description:
#   Download Citi Bike yearly archives "YYYY-citibike-tripdata.zip"
#   for 2013–2023 from the official S3 bucket, and extract all
#   monthly CSVs into data/raw/tripdata (flattened).
#
#   Changes vs JC-* version:
#   - Only downloads: 2013-...-2023-citibike-tripdata.zip
#   - Does NOT merge CSVs into a single giant file anymore.
#   - Cleaning will work directly on all CSVs in data/raw/tripdata.
# ============================================

from __future__ import annotations

import os
import shutil
import xml.etree.ElementTree as ET
import zipfile
from pathlib import Path
from typing import Dict, List

import requests

# Root of the Citi Bike S3 bucket (XML listing)
BUCKET_ROOT = "https://s3.amazonaws.com/tripdata"

# Folder where files will be saved and processed
DOWNLOAD_DIR = Path("data/raw/tripdata")

# Years we want to download (inclusive)
YEARS = list(range(2013, 2024))
YEARLY_KEYS = {f"{year}-citibike-tripdata.zip" for year in YEARS}


def list_yearly_zip_files(bucket_root: str = BUCKET_ROOT) -> List[Dict[str, int | str]]:
    """
    Read the Citi Bike S3 bucket XML listing and return a list of dicts
    with keys:
        - key: object key in the bucket (e.g. "2014-citibike-tripdata.zip")
        - url: direct URL to the object
        - size: file size in bytes (int)

    Only the yearly archives 2013-2023 are included.
    """
    print(f"Downloading file list from {bucket_root} ...")
    resp = requests.get(bucket_root)
    resp.raise_for_status()

    root = ET.fromstring(resp.text)

    # Handle optional S3 namespace
    if root.tag.startswith("{"):
        ns_uri = root.tag.split("}")[0].strip("{")
        ns = {"s3": ns_uri}
        contents_nodes = root.findall("s3:Contents", ns)

        def find_text(node, tag):
            elem = node.find(f"s3:{tag}", ns)
            return elem.text if elem is not None else ""
    else:
        contents_nodes = root.findall("Contents")

        def find_text(node, tag):
            elem = node.find(tag)
            return elem.text if elem is not None else ""

    files: List[Dict[str, int | str]] = []

    for c in contents_nodes:
        key = find_text(c, "Key")
        if key not in YEARLY_KEYS:
            continue

        size_text = find_text(c, "Size") or "0"
        size = int(size_text)

        url = f"{bucket_root}/{key}"
        files.append({"key": key, "url": url, "size": size})

    files.sort(key=lambda d: d["key"])  # sort by year
    return files


def download_file(
    file_info: Dict[str, int | str],
    dest_dir: Path = DOWNLOAD_DIR,
    chunk_size: int = 1024 * 1024,
) -> None:
    """
    Download a single file in streaming mode.
    Skips download if the local file already exists with the same size.
    """
    dest_dir.mkdir(parents=True, exist_ok=True)
    filename = dest_dir / os.path.basename(str(file_info["key"]))

    expected_size = int(file_info["size"])
    if filename.exists() and expected_size > 0:
        existing_size = filename.stat().st_size
        if existing_size == expected_size:
            print(f"Already downloaded: {filename}")
            return
        else:
            print(
                f"Existing file size mismatch for {filename} "
                f"(have {existing_size}, expected {expected_size}). Re-downloading..."
            )

    size_mb = expected_size / 1_000_000 if expected_size else 0
    print(f"Downloading {file_info['key']} (~{size_mb:.2f} MB)")

    with requests.get(str(file_info["url"]), stream=True) as r:
        r.raise_for_status()
        downloaded = 0
        with open(filename, "wb") as f:
            for chunk in r.iter_content(chunk_size=chunk_size):
                if not chunk:
                    continue
                f.write(chunk)
                downloaded += len(chunk)
                if size_mb > 0:
                    print(f"\r  {downloaded / 1_000_000:.2f}/{size_mb:.2f} MB", end="")
                else:
                    print(f"\r  {downloaded / 1_000_000:.2f} MB", end="")
    print("\n  ✓ download complete.")


def download_all_zip_files(
    files: List[Dict[str, int | str]], dest_dir: Path = DOWNLOAD_DIR
) -> None:
    """
    Download all ZIP files listed in `files`, skipping already
    downloaded files with the same size.
    """
    for i, fi in enumerate(files, start=1):
        print(f"[{i}/{len(files)}] {fi['key']}")
        download_file(fi, dest_dir=dest_dir)
        print()


def extract_all_zips(dest_dir: Path = DOWNLOAD_DIR) -> None:
    """
    Extract all .zip files in dest_dir.
    - Extract all CSVs
    - Flatten any internal folder structure (save only the basename in dest_dir)
    """
    print("Extracting all ZIP files...")
    dest_dir.mkdir(parents=True, exist_ok=True)

    for fname in os.listdir(dest_dir):
        if not fname.lower().endswith(".zip"):
            continue

        zip_path = dest_dir / fname
        print(f"  Extracting {zip_path} ...")
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                for member in zf.infolist():
                    # Skip directories
                    if member.is_dir():
                        continue

                    base_name = os.path.basename(member.filename)
                    if not base_name:
                        continue

                    target_path = dest_dir / base_name

                    # Extract and flatten
                    with zf.open(member) as src, open(target_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)

            print("    ✓ extracted")
        except Exception as e:  # noqa: BLE001
            print(f"    ✗ error extracting {zip_path}: {e}")


def run_citybike_ingestion(dest_dir: Path = DOWNLOAD_DIR) -> str:
    """
    High-level pipeline for Citi Bike data (NYC system, 2013–2023):

    - list yearly ZIP archives from the S3 bucket
    - download missing ZIPs
    - extract all CSVs and flatten the folder structure into `dest_dir`

    This version **does not** merge CSVs into a single giant file anymore.
    Instead, all monthly CSVs are left in `data/raw/tripdata` and will be
    processed directly by the cleaning pipeline.

    Returns:
        str: absolute path to the download directory containing all CSVs.
    """
    # 1) List yearly archives in S3 bucket
    files = list_yearly_zip_files()
    print(f"Found {len(files)} yearly archives (2013–2023).\n")

    # 2) Download all ZIPs (skips already downloaded with same size)
    download_all_zip_files(files, dest_dir=dest_dir)
    print("All ZIP downloads completed.\n")

    # 3) Extract all ZIPs and flatten structure
    extract_all_zips(dest_dir)

    abs_dir = str(dest_dir.resolve())
    print(f"All Citi Bike CSVs are now under: {abs_dir}")
    return abs_dir


if __name__ == "__main__":
    run_citybike_ingestion()
