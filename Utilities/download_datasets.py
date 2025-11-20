# ============================================
# Author: Aron Maggisano
# Date: 2025-11-18 (ISO 8601)
# File: Utilities/download_datasets.py
# Description:
#   - List all JC-YYYYMM-*.zip files from the NYC Citi Bike S3 bucket
#   - Download all matching ZIP archives into ./Datasets/tripdata
#       * Skips files that are already downloaded with the same size
#   - Extract all ZIP files and flatten any internal folder structure
#       * All CSVs are placed directly in ./Datasets/tripdata
#   - Normalize CSV filenames to the format:
#       JC-YYYYMM-citibike-tripdata.csv
#       (e.g. JC-20151-... → JC-201501-...)
#   - Merge all normalized CSVs into a single file:
#       JC-<FIRSTYYYYMM>-<LASTYYYYMM>-citibike-tripdata.csv
#   - Clean up the download directory, removing everything except
#     the final merged CSV
# ============================================

import os
import re
import shutil
import requests
import zipfile
import xml.etree.ElementTree as ET

# Bucket URL (not index.html, the actual root)
BUCKET_ROOT = "https://s3.amazonaws.com/tripdata"

# Folder where files will be saved and processed
DOWNLOAD_DIR = "./Datasets/tripdata"

# Patterns for file name normalization
ZIP_PATTERN_JC = re.compile(r"^JC-\d{6}.*\.zip$", re.IGNORECASE)
CSV_GOOD_PATTERN = re.compile(r"^JC-(\d{6})-citibike-tripdata\.csv$", re.IGNORECASE)   # JC-YYYYMM-citibike-tripdata.csv
CSV_SHORT_PATTERN = re.compile(r"^JC-(\d{5})-citibike-tripdata\.csv$", re.IGNORECASE)  # JC-YYYYM-citibike-tripdata.csv
CSV_MERGED_PATTERN = re.compile(r"^JC-\d{6}-\d{6}-citibike-tripdata\.csv$", re.IGNORECASE)


def list_zip_files():
    """
    Read the S3 bucket XML listing and return
    a list of dicts with key, url and size
    ONLY for JC-YYYYMM-... .zip files.
    """
    print(f"Downloading file list from {BUCKET_ROOT} ...")
    resp = requests.get(BUCKET_ROOT)
    resp.raise_for_status()

    # Parse XML
    root = ET.fromstring(resp.text)

    # Handle optional S3 namespace
    if root.tag.startswith("{"):
      ns_uri = root.tag.split("}")[0].strip("{")
      ns = {"s3": ns_uri}
      contents_nodes = root.findall("s3:Contents", ns)

      def find_text(node, tag):
          return node.find(f"s3:{tag}", ns).text
    else:
      contents_nodes = root.findall("Contents")

      def find_text(node, tag):
          return node.find(tag).text

    files = []

    for c in contents_nodes:
        key = find_text(c, "Key")
        size = int(find_text(c, "Size") or 0)

        # keep only files matching JC-YYYYMM-....zip
        if not ZIP_PATTERN_JC.match(key):
            continue

        url = f"{BUCKET_ROOT}/{key}"
        files.append({
            "key": key,
            "url": url,
            "size": size
        })

    return files


def download_file(file_info, dest_dir=DOWNLOAD_DIR, chunk_size=1024 * 1024):
    """
    Download a single file in streaming mode.
    Skip if already downloaded with the same size.
    """
    os.makedirs(dest_dir, exist_ok=True)
    filename = os.path.join(dest_dir, os.path.basename(file_info["key"]))

    if os.path.exists(filename):
        existing_size = os.path.getsize(filename)
        if existing_size == file_info["size"]:
            print(f"Already downloaded: {filename}")
            return
        else:
            print(
                f"Existing file size mismatch for {filename} "
                f"(have {existing_size}, expected {file_info['size']}). Re-downloading..."
            )

    size_mb = file_info["size"] / 1_000_000 if file_info["size"] else 0
    print(f"Downloading {file_info['key']} (~{size_mb:.2f} MB)")

    with requests.get(file_info["url"], stream=True) as r:
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


def extract_all_zips(dest_dir=DOWNLOAD_DIR):
    """
    Extract all .zip files in dest_dir.
    - Extract all CSVs
    - Flatten any internal folder structure (save only the basename in dest_dir)
    """
    print("Extracting all ZIP files...")
    os.makedirs(dest_dir, exist_ok=True)

    for fname in os.listdir(dest_dir):
        if not fname.lower().endswith(".zip"):
            continue

        zip_path = os.path.join(dest_dir, fname)
        print(f"  Extracting {zip_path} ...")
        try:
            with zipfile.ZipFile(zip_path, "r") as zf:
                for member in zf.infolist():
                    # Skip directories
                    if member.is_dir():
                        continue

                    # Keep only filename (drop internal folders)
                    base_name = os.path.basename(member.filename)
                    if not base_name:
                        continue

                    target_path = os.path.join(dest_dir, base_name)

                    # Extract and flatten
                    with zf.open(member) as src, open(target_path, "wb") as dst:
                        shutil.copyfileobj(src, dst)

            print("    ✓ extracted")
        except Exception as e:
            print(f"    ✗ error extracting {zip_path}: {e}")


def normalize_csv_filenames(dest_dir=DOWNLOAD_DIR):
    """
    Ensure all CSV files follow the format:
        JC-YYYYMM-citibike-tripdata.csv

    - If a file is named JC-YYYYM-citibike-tripdata.csv, add a leading 0 to the month.
    - If a CSV is inside a subfolder, move it to dest_dir.
    """
    print("Normalizing CSV filenames...")

    dest_dir_abs = os.path.abspath(dest_dir)
    os.makedirs(dest_dir_abs, exist_ok=True)

    for root, dirs, files in os.walk(dest_dir_abs):
        for fname in files:
            if not fname.lower().endswith(".csv"):
                continue

            old_path = os.path.join(root, fname)

            # Skip already merged file(s)
            if CSV_MERGED_PATTERN.match(fname):
                print(f"  Skipping merged file: {fname}")
                continue

            m_good = CSV_GOOD_PATTERN.match(fname)
            m_short = CSV_SHORT_PATTERN.match(fname)

            # Target directory is always the main DOWNLOAD_DIR
            if m_good:
                # Already correct format; just ensure it's at root level
                if os.path.abspath(root) != dest_dir_abs:
                    new_path = os.path.join(dest_dir_abs, fname)
                    if os.path.exists(new_path):
                        print(f"  Skipping move (target exists): {new_path}")
                    else:
                        print(f"  Moving {old_path} -> {new_path}")
                        os.replace(old_path, new_path)
            elif m_short:
                # Fix month with leading zero and move/rename to root
                ym_raw = m_short.group(1)   # e.g. '20151'
                year = ym_raw[:4]
                month = ym_raw[4:]
                ym = f"{year}{month.zfill(2)}"
                new_name = f"JC-{ym}-citibike-tripdata.csv"
                new_path = os.path.join(dest_dir_abs, new_name)

                if os.path.exists(new_path):
                    print(f"  Target {new_name} already exists, skipping rename of {fname}")
                    continue

                print(f"  Renaming {fname} -> {new_name}")
                if os.path.abspath(root) != dest_dir_abs:
                    # move + rename to root
                    os.replace(old_path, new_path)
                else:
                    os.rename(old_path, new_path)
            else:
                print(f"  Skipping non-standard CSV file: {old_path}")


def extract_yearmonth_from_name(filename):
    """
    From a file name like:
      - JC-201509-citibike-tripdata.csv  -> '201509'
      - JC-20159-citibike-tripdata.csv   -> '201509' (fix 1-digit month)
    Returns a string 'YYYYMM' or None if it doesn't match.
    """
    m_good = CSV_GOOD_PATTERN.match(filename)
    if m_good:
        return m_good.group(1)

    m_short = CSV_SHORT_PATTERN.match(filename)
    if m_short:
        ym_raw = m_short.group(1)  # e.g. '20151'
        year = ym_raw[:4]
        month = ym_raw[4:]
        return f"{year}{month.zfill(2)}"

    return None


def merge_csv_files(dest_dir=DOWNLOAD_DIR):
    """
    Merge all CSVs named JC-YYYYMM-citibike-tripdata.csv in dest_dir
    into a single file named:
        JC-<FIRSTYYYYMM>-<LASTYYYYMM>-citibike-tripdata.csv

    - Assumes all CSVs share the same header.
    - Writes header only once (from the first file).
    Returns the full path of the merged file, or None if nothing was merged.
    """
    print("Merging CSV files...")

    dest_dir_abs = os.path.abspath(dest_dir)
    os.makedirs(dest_dir_abs, exist_ok=True)

    csv_files = []
    for fname in os.listdir(dest_dir_abs):
        if not fname.lower().endswith(".csv"):
            continue
        if CSV_MERGED_PATTERN.match(fname):
            # skip already merged file(s)
            print(f"  Skipping existing merged file: {fname}")
            continue

        ym = extract_yearmonth_from_name(fname)
        if ym is None:
            print(f"  Skipping non-standard CSV name: {fname}")
            continue

        csv_files.append((ym, os.path.join(dest_dir_abs, fname)))

    if not csv_files:
        print("  No CSV files found to merge.")
        return None

    # Sort by YYYYMM
    csv_files.sort(key=lambda x: x[0])

    first_ym = csv_files[0][0]
    last_ym = csv_files[-1][0]
    merged_name = f"JC-{first_ym}-{last_ym}-citibike-tripdata.csv"
    merged_path = os.path.join(dest_dir_abs, merged_name)

    print(f"  Output file: {merged_path}")

    written_header = False
    header_ref = None

    with open(merged_path, "w", encoding="utf-8", newline="") as fout:
        for ym, fpath in csv_files:
            print(f"  Adding {os.path.basename(fpath)} ...")
            with open(fpath, "r", encoding="utf-8") as fin:
                try:
                    header = fin.readline()
                except UnicodeDecodeError:
                    print(f"    ✗ Unicode error reading {fpath}, skipping.")
                    continue

                if not header:
                    continue

                if not written_header:
                    header_ref = header
                    fout.write(header)
                    written_header = True
                else:
                    if header.strip() != header_ref.strip():
                        print(f"    ⚠ Header mismatch in {os.path.basename(fpath)} (still appending rows).")

                for line in fin:
                    if line.strip():  # skip empty lines
                        fout.write(line)

    print("  ✓ Merge completed.")
    return merged_path


def cleanup_download_dir(dest_dir=DOWNLOAD_DIR, keep_filenames=None):
    """
    Remove everything inside dest_dir except the files whose *basename*
    is listed in keep_filenames.
    Also removes any leftover subdirectories.
    """
    print("Cleaning up download directory...")

    dest_dir_abs = nitpath = os.path.abspath(dest_dir)
    if keep_filenames is None:
        keep_filenames = []

    # Walk bottom-up so we can safely remove empty directories at the end
    for root, dirs, files in os.walk(dest_dir_abs, topdown=False):
        for fname in files:
            if fname in keep_filenames:
                continue
            fpath = os.path.join(root, fname)
            try:
                print(f"  Removing file: {fpath}")
                os.remove(fpath)
            except OSError as e:
                print(f"    ✗ Error removing file {fpath}: {e}")

        # Remove empty subdirectories (but not the root folder itself)
        if os.path.abspath(root) != dest_dir_abs:
            try:
                os.rmdir(root)
                print(f"  Removed empty folder: {root}")
            except OSError:
                # Folder not empty, skip
                pass

    print("  ✓ Cleanup completed. Kept files:", ", ".join(keep_filenames) or "none")


def main():
    # 1) List files in S3 bucket
    files = list_zip_files()
    print(f"Found {len(files)} JC-YYYYMM-... .zip files in the bucket.\n")

    # 2) Download all ZIPs (skips already downloaded with same size)
    for i, fi in enumerate(files, start=1):
        print(f"[{i}/{len(files)}]")
        download_file(fi)
        print()

    print("All ZIP downloads completed.\n")

    # 3) Extract all ZIPs and flatten structure
    extract_all_zips(DOWNLOAD_DIR)

    # 4) Normalize CSV names (JC-YYYYMM-citibike-tripdata.csv)
    normalize_csv_filenames(DOWNLOAD_DIR)

    # 5) Merge all normalized CSVs into one big file
    merged_path = merge_csv_files(DOWNLOAD_DIR)

    # 6) Cleanup: remove everything except the merged file
    if merged_path:
        keep_name = os.path.basename(merged_path)
        cleanup_download_dir(DOWNLOAD_DIR, keep_filenames=[keep_name])

    print("\nAll steps completed.")


if __name__ == "__main__":
    main()
