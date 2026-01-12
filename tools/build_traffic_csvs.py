from __future__ import annotations

from pathlib import Path

import pandas as pd


RAW_FILE = Path("data/raw_traffic_counts/Automated_Traffic_Volume_Counts.csv")
OUT_DIR = Path("data/processed/traffic")

CHUNK_SIZE = 250_000


def normalize_direction(value: str) -> str:
    value = str(value).strip().upper()
    return value if value else "UNK"


def normalize_boro(value: str) -> str:
    return str(value).strip().title()


def make_corridor(row: pd.Series) -> str:
    street = str(row.get("street", "")).strip()
    from_st = str(row.get("fromSt", "")).strip()
    to_st = str(row.get("toSt", "")).strip()
    direction = normalize_direction(row.get("Direction", ""))
    parts = [p for p in [street, from_st, to_st, direction] if p]
    return " | ".join(parts) if parts else "Unknown"


def update_sum_count(target: pd.DataFrame, chunk_grouped: pd.DataFrame) -> pd.DataFrame:
    if target.empty:
        return chunk_grouped.copy()
    combined = pd.concat([target, chunk_grouped])
    combined = combined.groupby(list(chunk_grouped.index.names), as_index=True).sum()
    return combined


def main() -> None:
    if not RAW_FILE.exists():
        raise SystemExit(f"Missing source file: {RAW_FILE}")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    hourly = pd.DataFrame()
    monthly = pd.DataFrame()
    weekday = pd.DataFrame()
    direction = pd.DataFrame()
    day_of_week = pd.DataFrame()
    borough_share = pd.DataFrame()
    corridor = pd.Series(dtype="float64")

    usecols = ["Boro", "Yr", "M", "D", "HH", "Vol", "street", "fromSt", "toSt", "Direction"]

    for chunk in pd.read_csv(RAW_FILE, usecols=usecols, chunksize=CHUNK_SIZE):
        chunk = chunk.dropna(subset=["Boro", "Yr", "M", "D", "HH", "Vol"])
        chunk = chunk[chunk["Vol"] >= 0]

        chunk["Boro"] = chunk["Boro"].map(normalize_boro)
        chunk["Direction"] = chunk["Direction"].map(normalize_direction)

        dates = pd.to_datetime(
            dict(year=chunk["Yr"], month=chunk["M"], day=chunk["D"]),
            errors="coerce",
        )
        chunk = chunk[dates.notna()].copy()
        chunk["weekday"] = dates.dt.dayofweek
        chunk["is_weekend"] = chunk["weekday"] >= 5

        hour_group = (
            chunk.groupby(["Boro", "HH"])["Vol"]
            .agg(volume_sum="sum", volume_count="count")
            .sort_index()
        )
        hourly = update_sum_count(hourly, hour_group)

        month_group = (
            chunk.groupby(["Boro", "M"])["Vol"]
            .agg(volume_sum="sum", volume_count="count")
            .sort_index()
        )
        monthly = update_sum_count(monthly, month_group)

        weekday_group = (
            chunk.groupby(["Boro", "is_weekend"])["Vol"]
            .agg(volume_sum="sum", volume_count="count")
            .sort_index()
        )
        weekday = update_sum_count(weekday, weekday_group)

        borough_share_group = (
            chunk.groupby(["Boro"])["Vol"]
            .agg(volume_sum="sum", volume_count="count")
            .sort_index()
        )
        borough_share = update_sum_count(borough_share, borough_share_group)

        direction_group = (
            chunk.groupby(["Boro", "Direction"])["Vol"]
            .agg(volume_sum="sum", volume_count="count")
            .sort_index()
        )
        direction = update_sum_count(direction, direction_group)

        day_group = (
            chunk.groupby(["weekday"])["Vol"]
            .agg(volume_sum="sum", volume_count="count")
            .sort_index()
        )
        day_of_week = update_sum_count(day_of_week, day_group)

        chunk["corridor"] = chunk.apply(make_corridor, axis=1)
        corridor_group = chunk.groupby("corridor")["Vol"].sum()
        corridor = corridor.add(corridor_group, fill_value=0)

    hourly_out = (
        hourly.reset_index()
        .assign(avg_volume=lambda df: df["volume_sum"] / df["volume_count"])
        .drop(columns=["volume_sum", "volume_count"])
        .rename(columns={"HH": "hour"})
    )
    hourly_out.to_csv(OUT_DIR / "hourly_by_borough.csv", index=False)

    monthly_out = (
        monthly.reset_index()
        .assign(avg_volume=lambda df: df["volume_sum"] / df["volume_count"])
        .drop(columns=["volume_sum", "volume_count"])
        .rename(columns={"M": "month"})
    )
    monthly_out.to_csv(OUT_DIR / "monthly_by_borough.csv", index=False)

    weekday_out = (
        weekday.reset_index()
        .assign(avg_volume=lambda df: df["volume_sum"] / df["volume_count"])
        .drop(columns=["volume_sum", "volume_count"])
    )
    weekday_out.to_csv(OUT_DIR / "weekday_vs_weekend.csv", index=False)

    direction_out = (
        direction.reset_index()
        .assign(avg_volume=lambda df: df["volume_sum"] / df["volume_count"])
        .drop(columns=["volume_sum", "volume_count"])
    )
    direction_out.to_csv(OUT_DIR / "direction_by_borough.csv", index=False)

    day_out = (
        day_of_week.reset_index()
        .assign(avg_volume=lambda df: df["volume_sum"] / df["volume_count"])
        .drop(columns=["volume_sum", "volume_count"])
        .rename(columns={"weekday": "weekday_index"})
    )
    day_out.to_csv(OUT_DIR / "day_of_week.csv", index=False)

    borough_share_out = (
        borough_share.reset_index()
        .assign(avg_volume=lambda df: df["volume_sum"] / df["volume_count"])
        .drop(columns=["volume_sum", "volume_count"])
    )
    borough_share_out.to_csv(OUT_DIR / "borough_share.csv", index=False)

    top_corridors = (
        corridor.sort_values(ascending=False)
        .head(15)
        .reset_index()
        .rename(columns={"index": "corridor", 0: "total_volume"})
    )
    top_corridors.to_csv(OUT_DIR / "top_corridors.csv", index=False)

    print("Traffic CSVs written to", OUT_DIR)


if __name__ == "__main__":
    main()
