import os
import re
import requests
import xml.etree.ElementTree as ET

# Bucket URL (not index.html, the actual root)
BUCKET_ROOT = "https://s3.amazonaws.com/tripdata"

# Folder where files will be saved
DOWNLOAD_DIR = "./Datasets/tripdata"


def list_zip_files():
    """
    Reads the S3 bucket XML listing and returns
    a list of dictionaries with key, url and size
    ONLY for JC-YYYYMM-... .zip files
    """
    print(f"Downloading file list from {BUCKET_ROOT} ...")
    resp = requests.get(BUCKET_ROOT)
    resp.raise_for_status()

    # XML parsing
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
    pattern_jc = re.compile(r"^JC-\d{6}.*\.zip$", re.IGNORECASE)

    for c in contents_nodes:
        key = find_text(c, "Key")
        size = int(find_text(c, "Size"))

        # take only files matching format JC-201509-....zip
        # (e.g. JC-201509-citibike-tripdata.csv.zip)
        if not pattern_jc.match(key):
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
    Skip it if it already exists.
    """
    os.makedirs(dest_dir, exist_ok=True)
    filename = os.path.join(dest_dir, os.path.basename(file_info["key"]))

    if os.path.exists(filename):
        print(f"Already downloaded: {filename}")
        return

    size_mb = file_info["size"] / 1_000_000
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
                # small text progress bar
                print(
                    f"\r  {downloaded / 1_000_000:.2f}/{size_mb:.2f} MB",
                    end=""
                )
    print("\n  ✓ done.")


def main():
    files = list_zip_files()
    print(f"Found {len(files)} JC-YYYYMM-... .zip files in the bucket.\n")

    for i, fi in enumerate(files, start=1):
        print(f"[{i}/{len(files)}]")
        download_file(fi)
        print()

    print("All downloads completed.")


if __name__ == "__main__":
    main()
