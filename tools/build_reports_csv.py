from __future__ import annotations

import re
from pathlib import Path

import pandas as pd


RAW_DIR = Path("data/raw_reports")
OUT_DIR = Path("data/processed")
OUT_FILE = OUT_DIR / "unreadable_license_plates.csv"


DAY_LABELS = {"SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"}


def normalize_cell(value: object) -> str:
    if pd.isna(value):
        return ""
    return str(value).strip()


def extract_quarter(filename: str) -> str:
    match = re.search(r"q[1-4]-\d{4}", filename.lower())
    return match.group(0).upper() if match else "UNKNOWN"


def extract_metadata(df: pd.DataFrame) -> tuple[str, str]:
    vio_type = "Unknown"
    month = "Unknown"
    for idx in range(min(6, len(df))):
        cell = normalize_cell(df.iat[idx, 0])
        if cell.upper().startswith("VIO TYPE"):
            parts = cell.split(":", 1)
            if len(parts) == 2:
                vio_type = parts[1].strip()
        if cell.upper().startswith("MONTH"):
            parts = cell.split(":", 1)
            if len(parts) == 2:
                month = parts[1].strip()
    return vio_type, month


def find_row(df: pd.DataFrame, label: str) -> int | None:
    label_lower = label.lower()
    for idx, value in df[0].items():
        cell = normalize_cell(value).lower()
        if label_lower in cell:
            return idx
    return None


def parse_day_of_week(df: pd.DataFrame, start_row: int, meta: dict) -> list[dict]:
    header_row = None
    for idx in range(start_row, min(start_row + 6, len(df))):
        if normalize_cell(df.iat[idx, 0]) == "Reject Reason":
            header_row = idx
            break
    if header_row is None:
        return []

    day_row = header_row - 1
    day_by_col: dict[int, str] = {}
    current_day = ""
    for col in range(1, df.shape[1]):
        day_value = normalize_cell(df.iat[day_row, col]).upper()
        if day_value in DAY_LABELS:
            current_day = day_value
        if current_day:
            day_by_col[col] = current_day

    time_by_col: dict[int, str] = {}
    for col in range(1, df.shape[1]):
        time_value = normalize_cell(df.iat[header_row, col])
        if time_value:
            time_by_col[col] = time_value

    records: list[dict] = []
    for idx in range(header_row + 1, len(df)):
        reason = normalize_cell(df.iat[idx, 0])
        if not reason:
            break
        if reason.lower() == "reject reason":
            continue
        for col, day in day_by_col.items():
            if col not in time_by_col:
                continue
            value = df.iat[idx, col]
            if pd.isna(value):
                continue
            records.append(
                {
                    **meta,
                    "section": "day_of_week",
                    "reject_reason": reason,
                    "day": day,
                    "time_window": time_by_col[col],
                    "borough": "",
                    "community_board": "",
                    "count": int(value),
                }
            )
    return records


def parse_borough(df: pd.DataFrame, start_row: int, meta: dict) -> list[dict]:
    header_row = None
    for idx in range(start_row, min(start_row + 4, len(df))):
        if normalize_cell(df.iat[idx, 0]) == "Reject Reason":
            header_row = idx
            break
    if header_row is None:
        return []

    borough_by_col = {}
    for col in range(1, df.shape[1]):
        name = normalize_cell(df.iat[header_row, col])
        if name:
            borough_by_col[col] = name.title()

    records: list[dict] = []
    for idx in range(header_row + 1, len(df)):
        reason = normalize_cell(df.iat[idx, 0])
        if not reason:
            break
        if reason.lower() == "reject reason":
            continue
        for col, borough in borough_by_col.items():
            value = df.iat[idx, col]
            if pd.isna(value):
                continue
            records.append(
                {
                    **meta,
                    "section": "borough",
                    "reject_reason": reason,
                    "day": "",
                    "time_window": "",
                    "borough": borough,
                    "community_board": "",
                    "count": int(value),
                }
            )
    return records


def parse_community_board(df: pd.DataFrame, start_row: int, meta: dict) -> list[dict]:
    header_row = None
    for idx in range(start_row, min(start_row + 4, len(df))):
        if normalize_cell(df.iat[idx, 0]) == "Reject Reason":
            header_row = idx
            break
    if header_row is None:
        return []

    board_by_col = {}
    for col in range(1, df.shape[1]):
        label = normalize_cell(df.iat[header_row, col])
        if label:
            board_by_col[col] = " ".join(label.split())

    records: list[dict] = []
    for idx in range(header_row + 1, len(df)):
        reason = normalize_cell(df.iat[idx, 0])
        if not reason:
            break
        if reason.lower() == "reject reason":
            continue
        for col, board in board_by_col.items():
            value = df.iat[idx, col]
            if pd.isna(value):
                continue
            records.append(
                {
                    **meta,
                    "section": "community_board",
                    "reject_reason": reason,
                    "day": "",
                    "time_window": "",
                    "borough": "",
                    "community_board": board,
                    "count": int(value),
                }
            )
    return records


def parse_month_sheet(df: pd.DataFrame, meta: dict) -> list[dict]:
    records: list[dict] = []

    day_row = find_row(df, "Day Of Week - Rejects")
    if day_row is not None:
        records.extend(parse_day_of_week(df, day_row, meta))

    borough_row = find_row(df, "Borough - Rejects")
    if borough_row is not None:
        records.extend(parse_borough(df, borough_row, meta))

    board_row = find_row(df, "Community Board - Rejects")
    if board_row is not None:
        records.extend(parse_community_board(df, board_row, meta))

    return records


def read_report(path: Path) -> pd.DataFrame:
    xls = pd.ExcelFile(path)
    frames = []
    for sheet_name in xls.sheet_names:
        if sheet_name.lower().startswith("reject category"):
            continue
        df = pd.read_excel(xls, sheet_name=sheet_name, header=None)
        vio_type, month = extract_metadata(df)
        meta = {
            "source_file": path.name,
            "quarter": extract_quarter(path.name),
            "sheet": sheet_name,
            "month": month,
            "violation_type": vio_type,
        }
        records = parse_month_sheet(df, meta)
        if records:
            frames.append(pd.DataFrame(records))

    if not frames:
        return pd.DataFrame()
    return pd.concat(frames, ignore_index=True)


def main() -> None:
    files = sorted(RAW_DIR.glob("*.xlsx"))
    if not files:
        raise SystemExit(f"No .xlsx files found in {RAW_DIR}")

    frames = []
    for path in files:
        frame = read_report(path)
        if not frame.empty:
            frames.append(frame)

    combined = pd.concat(frames, ignore_index=True)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    combined.to_csv(OUT_FILE, index=False)

    print(f"Wrote {len(combined)} rows to {OUT_FILE}")


if __name__ == "__main__":
    main()
