from __future__ import annotations

import argparse
import gc
import shutil
import subprocess
import sys
from collections import defaultdict
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable

import pandas as pd
from tqdm import tqdm

try:
    import pyarrow.parquet as pq
except Exception as exc:  # pragma: no cover - dependency check
    raise SystemExit(
        "Missing dependency: pyarrow. Install it with `uv add pyarrow`."
    ) from exc

DATA_ROOT = Path("data/yellow_taxi/Dataset")
OUT_DIR = Path("data/processed/yellow_taxi")
WEB_OUT_DIR = Path("web/data/processed/yellow_taxi")
ZONE_LOOKUP = Path("data/yellow_taxi/Dataset/02.taxi_zones/taxi+_zone_lookup.csv")

TOP_ZONES = 20
TOP_PAIRS = 20
DEFAULT_BATCH_SIZE = 50_000

DISTANCE_BINS = [0, 1, 2, 5, 10, 20, 10_000]
DISTANCE_LABELS = ["0-1", "1-2", "2-5", "5-10", "10-20", "20+"]

DURATION_BINS = [0, 5, 10, 20, 30, 45, 10_000]
DURATION_LABELS = [
    "0-5",
    "5-10",
    "10-20",
    "20-30",
    "30-45",
    "45+",
]

TIP_BINS = [0, 5, 10, 15, 20, 25, 10_000]
TIP_LABELS = ["0-5%", "5-10%", "10-15%", "15-20%", "20-25%", "25%+"]

DOW_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"]

FIELD_ALIASES = {
    "pickup_datetime": [
        "tpep_pickup_datetime",
        "lpep_pickup_datetime",
        "pickup_datetime",
        "Pickup_datetime",
    ],
    "dropoff_datetime": [
        "tpep_dropoff_datetime",
        "lpep_dropoff_datetime",
        "dropoff_datetime",
        "DropOff_datetime",
    ],
    "trip_distance": ["trip_distance", "trip_miles"],
    "trip_time": ["trip_time"],
    "base_fare": ["fare_amount", "base_passenger_fare"],
    "tip_amount": ["tip_amount", "tips"],
    "tolls_amount": ["tolls_amount", "tolls"],
    "extra": ["extra"],
    "mta_tax": ["mta_tax"],
    "improvement_surcharge": ["improvement_surcharge"],
    "congestion_surcharge": ["congestion_surcharge"],
    "airport_fee": ["airport_fee"],
    "total_amount": ["total_amount"],
    "payment_type": ["payment_type"],
    "ratecode": ["RatecodeID", "RateCodeID", "ratecodeid"],
    "PULocationID": ["PULocationID", "PUlocationID"],
    "DOLocationID": ["DOLocationID", "DOlocationID"],
    "shared_match_flag": ["shared_match_flag", "SR_Flag"],
    "shared_request_flag": ["shared_request_flag"],
    "provider": ["hvfhs_license_num"],
    "sales_tax": ["sales_tax"],
    "bcf": ["bcf"],
}

COMPONENT_GROUPS = {
    "Base fare": ["base_fare"],
    "Tips": ["tip_amount"],
    "Tolls": ["tolls_amount"],
    "Taxes & funds": ["mta_tax", "sales_tax", "bcf"],
    "Surcharges": ["extra", "improvement_surcharge", "congestion_surcharge", "airport_fee"],
}

HVFHS_PROVIDER_MAP = {
    "HV0002": "Juno",
    "HV0003": "Uber",
    "HV0004": "Via",
    "HV0005": "Lyft",
}


@dataclass(frozen=True)
class ServiceSpec:
    key: str
    label: str
    dir_name: str
    fields: list[str]


SERVICES = [
    ServiceSpec(
        key="yellow",
        label="Yellow taxi",
        dir_name="yellow_taxi",
        fields=[
            "pickup_datetime",
            "dropoff_datetime",
            "trip_distance",
            "base_fare",
            "tip_amount",
            "tolls_amount",
            "extra",
            "mta_tax",
            "improvement_surcharge",
            "congestion_surcharge",
            "airport_fee",
            "ratecode",
            "PULocationID",
            "DOLocationID",
        ],
    ),
    ServiceSpec(
        key="green",
        label="Green taxi",
        dir_name="green_taxi",
        fields=[
            "pickup_datetime",
            "dropoff_datetime",
            "trip_distance",
            "base_fare",
            "tip_amount",
            "tolls_amount",
            "extra",
            "mta_tax",
            "improvement_surcharge",
            "ratecode",
            "PULocationID",
            "DOLocationID",
        ],
    ),
    ServiceSpec(
        key="fhv",
        label="FHV",
        dir_name="for_hire_vehicle",
        fields=[
            "pickup_datetime",
            "dropoff_datetime",
            "shared_match_flag",
            "PULocationID",
            "DOLocationID",
        ],
    ),
    ServiceSpec(
        key="hvfhs",
        label="HVFHS",
        dir_name="high_volume_for_hire_vehicle",
        fields=[
            "pickup_datetime",
            "dropoff_datetime",
            "trip_distance",
            "trip_time",
            "base_fare",
            "tip_amount",
            "tolls_amount",
            "congestion_surcharge",
            "airport_fee",
            "sales_tax",
            "bcf",
            "shared_match_flag",
            "shared_request_flag",
            "provider",
            "PULocationID",
            "DOLocationID",
        ],
    ),
]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Build lightweight CSVs from TLC parquet data for frontend charts.",
    )
    parser.add_argument("--year-from", type=int, default=None, help="Start year (inclusive).")
    parser.add_argument("--year-to", type=int, default=None, help="End year (inclusive).")
    parser.add_argument("--max-files", type=int, default=None, help="Limit files per service.")
    parser.add_argument(
        "--batch-size",
        type=int,
        default=DEFAULT_BATCH_SIZE,
        help="Row batch size for streaming parquet reads (default: 50000).",
    )
    parser.add_argument(
        "--split",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Split outputs larger than --max-mb using tools/split_large_data_files.py.",
    )
    parser.add_argument("--max-mb", type=int, default=100, help="Split threshold in MB.")
    parser.add_argument(
        "--remove-original",
        action=argparse.BooleanOptionalAction,
        default=True,
        help="Remove original CSV when split into parts.",
    )
    return parser.parse_args()


def available_years(root: Path) -> list[int]:
    years = []
    for path in root.iterdir():
        if path.is_dir() and path.name.isdigit():
            years.append(int(path.name))
    return sorted(years)


def resolve_columns(schema_names: set[str], fields: Iterable[str]) -> dict[str, str]:
    mapping: dict[str, str] = {}
    for field in fields:
        for candidate in FIELD_ALIASES.get(field, []):
            if candidate in schema_names:
                mapping[field] = candidate
                break
    return mapping


def parse_datetime(series: pd.Series | None) -> pd.Series | None:
    if series is None:
        return None
    if series.empty:
        return pd.to_datetime(series, errors="coerce")
    if pd.api.types.is_datetime64_any_dtype(series):
        return series
    if pd.api.types.is_numeric_dtype(series):
        numeric = pd.to_numeric(series, errors="coerce").dropna()
        if numeric.empty:
            return pd.to_datetime(series, errors="coerce")
        sample = float(numeric.median())
        abs_sample = abs(sample)
        if abs_sample >= 1e17:
            unit = "ns"
        elif abs_sample >= 1e14:
            unit = "us"
        elif abs_sample >= 1e11:
            unit = "ms"
        else:
            unit = "s"
        return pd.to_datetime(series, errors="coerce", unit=unit)

    parsed = pd.to_datetime(series, errors="coerce")
    if parsed.notna().any():
        return parsed

    values = series.astype("string").str.strip()
    if values.str.fullmatch(r"\\d{14}").any():
        return pd.to_datetime(values, format="%Y%m%d%H%M%S", errors="coerce")
    if values.str.fullmatch(r"\\d{12}").any():
        return pd.to_datetime(values, format="%Y%m%d%H%M", errors="coerce")
    if values.str.fullmatch(r"\\d{8}").any():
        return pd.to_datetime(values, format="%Y%m%d", errors="coerce")

    return parsed


def to_numeric(series: pd.Series | None) -> pd.Series:
    if series is None:
        return pd.Series([], dtype="float64")
    return pd.to_numeric(series, errors="coerce")


def add_group_counts(counter: dict[tuple, int], group: pd.Series, prefix: tuple) -> None:
    for key, value in group.items():
        if not isinstance(key, tuple):
            key = (key,)
        counter[prefix + key] += int(value)


def collect_parquet_files(
    root: Path,
    years: list[int],
    service_dir: str,
    max_files: int | None,
) -> list[Path]:
    files: list[Path] = []
    for year in years:
        folder = root / str(year) / service_dir
        if not folder.exists():
            continue
        files.extend(sorted(folder.glob("*.parquet")))
    if max_files is not None:
        files = files[:max_files]
    return files


def split_outputs(root: Path, max_mb: int, remove_original: bool) -> None:
    args = [
        sys.executable,
        "tools/split_large_data_files.py",
        "--root",
        str(root),
        "--max-mb",
        str(max_mb),
    ]
    if remove_original:
        args.append("--remove-original")
    subprocess.run(args, check=True)

def batch_to_pandas(batch) -> pd.DataFrame:
    try:
        return batch.to_pandas(self_destruct=True, use_threads=False)
    except TypeError:
        return batch.to_pandas()


def main() -> None:
    args = parse_args()
    years = available_years(DATA_ROOT)
    if not years:
        raise SystemExit(f"No year folders found under {DATA_ROOT}")

    year_from = args.year_from if args.year_from is not None else max(years)
    year_to = args.year_to if args.year_to is not None else year_from

    years = [year for year in years if year_from <= year <= year_to]
    if not years:
        raise SystemExit("No matching years found for the provided range.")
    year_min = min(years)
    year_max = max(years)

    OUT_DIR.mkdir(parents=True, exist_ok=True)
    WEB_OUT_DIR.mkdir(parents=True, exist_ok=True)

    monthly_counts: dict[tuple, int] = defaultdict(int)
    dow_hour_counts: dict[tuple, int] = defaultdict(int)
    distance_counts: dict[tuple, int] = defaultdict(int)
    duration_counts: dict[tuple, int] = defaultdict(int)
    tip_counts: dict[tuple, int] = defaultdict(int)
    airport_counts: dict[tuple, int] = defaultdict(int)
    shared_counts: dict[tuple, int] = defaultdict(int)
    provider_counts: dict[tuple, int] = defaultdict(int)
    pickup_counts: dict[tuple, int] = defaultdict(int)
    od_counts: dict[tuple, int] = defaultdict(int)
    fare_sums: dict[tuple, float] = defaultdict(float)
    trip_totals: dict[str, int] = defaultdict(int)
    service_dates: dict[str, set] = defaultdict(set)

    for spec in SERVICES:
        files = collect_parquet_files(DATA_ROOT, years, spec.dir_name, args.max_files)
        if not files:
            continue

        file_bar = tqdm(files, desc=f"{spec.label} files")
        for file_path in file_bar:
            pq_file = pq.ParquetFile(file_path, memory_map=True)
            schema_names = set(pq_file.schema.names)
            mapping = resolve_columns(schema_names, spec.fields)
            if "pickup_datetime" not in mapping:
                continue

            reverse_map = {value: key for key, value in mapping.items()}
            columns = list(mapping.values())

            batch_bar = tqdm(
                total=pq_file.metadata.num_rows,
                unit="rows",
                desc=f"{file_path.name}",
                leave=False,
            )

            batch_index = 0
            for batch in pq_file.iter_batches(batch_size=args.batch_size, columns=columns):
                batch_index += 1
                df = batch_to_pandas(batch)
                if df.empty:
                    batch_bar.update(batch.num_rows)
                    continue

                df.rename(columns=reverse_map, inplace=True)

                pickup = parse_datetime(df.get("pickup_datetime"))
                if pickup is None:
                    batch_bar.update(batch.num_rows)
                    continue

                valid_pickup = pickup.notna()
                if not valid_pickup.any():
                    batch_bar.update(batch.num_rows)
                    continue

                pickup = pickup[valid_pickup]
                year = pickup.dt.year
                valid_year = year.between(year_min, year_max)
                if not valid_year.any():
                    batch_bar.update(batch.num_rows)
                    continue
                valid_pickup = valid_pickup & valid_year.reindex(valid_pickup.index, fill_value=False)
                pickup = pickup[valid_year]
                trip_totals[spec.key] += int(valid_pickup.sum())

                year = pickup.dt.year
                month = pickup.dt.month
                hour = pickup.dt.hour
                dow = pickup.dt.dayofweek

                add_group_counts(
                    monthly_counts,
                    pd.DataFrame({"year": year, "month": month}).groupby(["year", "month"]).size(),
                    (spec.key,),
                )
                add_group_counts(
                    dow_hour_counts,
                    pd.DataFrame({"dow": dow, "hour": hour}).groupby(["dow", "hour"]).size(),
                    (spec.key,),
                )

                service_dates[spec.key].update(pickup.dt.date.unique().tolist())

                if "trip_distance" in df.columns:
                    distance = to_numeric(df.get("trip_distance"))[valid_pickup]
                    distance = distance[(distance > 0) & (distance < 200)]
                    if not distance.empty:
                        bins = pd.cut(
                            distance,
                            bins=DISTANCE_BINS,
                            labels=DISTANCE_LABELS,
                            right=False,
                        )
                        add_group_counts(
                            distance_counts,
                            bins.value_counts(),
                            (spec.key,),
                        )

                duration = None
                if "trip_time" in df.columns:
                    duration = to_numeric(df.get("trip_time"))[valid_pickup] / 60.0
                elif "dropoff_datetime" in df.columns:
                    dropoff = parse_datetime(df.get("dropoff_datetime"))
                    if dropoff is not None:
                        dropoff = dropoff[valid_pickup]
                        duration = (dropoff - pickup).dt.total_seconds() / 60.0

                if duration is not None:
                    duration = duration[duration.notna()]
                    duration = duration[(duration > 0) & (duration < 600)]
                    if not duration.empty:
                        bins = pd.cut(
                            duration,
                            bins=DURATION_BINS,
                            labels=DURATION_LABELS,
                            right=False,
                        )
                        add_group_counts(
                            duration_counts,
                            bins.value_counts(),
                            (spec.key,),
                        )

                for component, columns_for_component in COMPONENT_GROUPS.items():
                    values = []
                    for column in columns_for_component:
                        if column not in df.columns:
                            continue
                        values.append(to_numeric(df.get(column))[valid_pickup].fillna(0))
                    if values:
                        fare_sums[(spec.key, component)] += pd.concat(values, axis=1).sum().sum()

                if "tip_amount" in df.columns and "base_fare" in df.columns:
                    tip_amount = to_numeric(df.get("tip_amount"))[valid_pickup]
                    base_fare = to_numeric(df.get("base_fare"))[valid_pickup]
                    valid_tip = (base_fare > 0) & tip_amount.notna()
                    if valid_tip.any():
                        tip_rate = (tip_amount[valid_tip] / base_fare[valid_tip]) * 100.0
                        tip_rate = tip_rate[tip_rate >= 0]
                        zero_count = int((tip_rate == 0).sum())
                        if zero_count:
                            tip_counts[(spec.key, "0%")] += zero_count
                        positive = tip_rate[tip_rate > 0]
                        if not positive.empty:
                            bins = pd.cut(
                                positive,
                                bins=TIP_BINS,
                                labels=TIP_LABELS,
                                right=False,
                            )
                            add_group_counts(
                                tip_counts,
                                bins.value_counts(),
                                (spec.key,),
                            )

                if "airport_fee" in df.columns or "ratecode" in df.columns:
                    airport_flag = pd.Series(False, index=pickup.index)
                    if "airport_fee" in df.columns:
                        airport_flag |= (
                            to_numeric(df.get("airport_fee"))[valid_pickup].fillna(0) > 0
                        )
                    if "ratecode" in df.columns:
                        airport_flag |= to_numeric(df.get("ratecode"))[valid_pickup].isin([2, 3])
                    counts = airport_flag.value_counts()
                    airport_counts[(spec.key, True)] += int(counts.get(True, 0))
                    airport_counts[(spec.key, False)] += int(counts.get(False, 0))

                if spec.key in {"fhv", "hvfhs"}:
                    shared = None
                    if "shared_match_flag" in df.columns:
                        if spec.key == "fhv":
                            shared = to_numeric(df.get("shared_match_flag"))[valid_pickup].fillna(0) == 1
                        else:
                            shared = (
                                df.get("shared_match_flag")[valid_pickup]
                                .astype("string")
                                .str.upper()
                                .str.strip()
                                == "Y"
                            )
                    if shared is None and "shared_request_flag" in df.columns:
                        shared = (
                            df.get("shared_request_flag")[valid_pickup]
                            .astype("string")
                            .str.upper()
                            .str.strip()
                            == "Y"
                        )
                    if shared is not None:
                        counts = shared.value_counts()
                        shared_counts[(spec.key, True)] += int(counts.get(True, 0))
                        shared_counts[(spec.key, False)] += int(counts.get(False, 0))

                if spec.key == "hvfhs" and "provider" in df.columns:
                    provider = (
                        df.get("provider")[valid_pickup]
                        .astype("string")
                        .str.strip()
                        .replace({"": pd.NA})
                    )
                    provider = provider.map(HVFHS_PROVIDER_MAP).fillna(provider)
                    counts = provider.value_counts(dropna=True)
                    for provider_name, count in counts.items():
                        provider_counts[(provider_name,)] += int(count)

                if "PULocationID" in df.columns:
                    pu = to_numeric(df.get("PULocationID"))[valid_pickup]
                    pickup_frame = pd.DataFrame({"year": year, "pu": pu}).dropna()
                    if not pickup_frame.empty:
                        pickup_frame["pu"] = pickup_frame["pu"].astype(int)
                        add_group_counts(
                            pickup_counts,
                            pickup_frame.groupby(["year", "pu"]).size(),
                            (spec.key,),
                        )

                if "PULocationID" in df.columns and "DOLocationID" in df.columns:
                    pu = to_numeric(df.get("PULocationID"))[valid_pickup]
                    do = to_numeric(df.get("DOLocationID"))[valid_pickup]
                    pairs = pd.DataFrame({"year": year, "pu": pu, "do": do}).dropna()
                    if not pairs.empty:
                        pairs[["pu", "do"]] = pairs[["pu", "do"]].astype(int)
                        add_group_counts(
                            od_counts,
                            pairs.groupby(["year", "pu", "do"]).size(),
                            (spec.key,),
                        )

                batch_bar.update(batch.num_rows)

                del df
                if batch_index % 10 == 0:
                    gc.collect()

            batch_bar.close()
            gc.collect()

    output_files: list[Path] = []

    monthly_rows = [
        {"service": key, "year": year, "month": month, "trips": count}
        for (key, year, month), count in monthly_counts.items()
    ]
    monthly_df = pd.DataFrame(
        monthly_rows, columns=["service", "year", "month", "trips"]
    )
    if not monthly_df.empty:
        monthly_df = monthly_df.sort_values(["service", "year", "month"])
    monthly_path = OUT_DIR / "taxi_trip_volume_monthly.csv"
    monthly_df.to_csv(monthly_path, index=False)
    output_files.append(monthly_path)

    dow_records = []
    day_counts = []
    for service, dates in service_dates.items():
        if not dates:
            continue
        date_df = pd.DataFrame({"date": list(dates)})
        date_df["dow"] = pd.to_datetime(date_df["date"]).dt.dayofweek
        counts = date_df.groupby("dow").size()
        for dow, value in counts.items():
            day_counts.append({"service": service, "dow": dow, "days": int(value)})

    days_df = pd.DataFrame(day_counts, columns=["service", "dow", "days"])
    for (service, dow, hour), count in dow_hour_counts.items():
        days = days_df.loc[
            (days_df["service"] == service) & (days_df["dow"] == dow), "days"
        ].sum()
        avg = count / days if days else 0
        dow_records.append(
            {
                "service": service,
                "dow": dow,
                "dow_label": DOW_LABELS[dow],
                "hour": hour,
                "avg_trips": round(avg, 2),
            }
        )

    dow_df = pd.DataFrame(
        dow_records, columns=["service", "dow", "dow_label", "hour", "avg_trips"]
    )
    if not dow_df.empty:
        dow_df = dow_df.sort_values(["service", "dow", "hour"])
    dow_path = OUT_DIR / "taxi_pickups_by_dow_hour.csv"
    dow_df.to_csv(dow_path, index=False)
    output_files.append(dow_path)

    distance_rows = [
        {"service": key, "distance_bin": bin_label, "trips": count}
        for (key, bin_label), count in distance_counts.items()
    ]
    distance_df = pd.DataFrame(distance_rows, columns=["service", "distance_bin", "trips"])
    distance_path = OUT_DIR / "taxi_distance_bins.csv"
    distance_df.to_csv(distance_path, index=False)
    output_files.append(distance_path)

    duration_rows = [
        {"service": key, "duration_bin": bin_label, "trips": count}
        for (key, bin_label), count in duration_counts.items()
    ]
    duration_df = pd.DataFrame(duration_rows, columns=["service", "duration_bin", "trips"])
    duration_path = OUT_DIR / "taxi_duration_bins.csv"
    duration_df.to_csv(duration_path, index=False)
    output_files.append(duration_path)

    fare_rows = []
    for (service, component), total in fare_sums.items():
        trips = trip_totals.get(service, 0)
        if trips == 0:
            continue
        fare_rows.append(
            {
                "service": service,
                "component": component,
                "avg_amount": round(total / trips, 4),
            }
        )
    fare_df = pd.DataFrame(fare_rows, columns=["service", "component", "avg_amount"])
    fare_path = OUT_DIR / "taxi_avg_fare_components.csv"
    fare_df.to_csv(fare_path, index=False)
    output_files.append(fare_path)

    tip_rows = [
        {"service": key, "tip_bin": bin_label, "trips": count}
        for (key, bin_label), count in tip_counts.items()
    ]
    tip_df = pd.DataFrame(tip_rows, columns=["service", "tip_bin", "trips"])
    tip_path = OUT_DIR / "taxi_tip_rate_bins.csv"
    tip_df.to_csv(tip_path, index=False)
    output_files.append(tip_path)

    airport_rows = [
        {"service": key, "airport_trip": flag, "trips": count}
        for (key, flag), count in airport_counts.items()
    ]
    airport_df = pd.DataFrame(
        airport_rows, columns=["service", "airport_trip", "trips"]
    )
    if not airport_df.empty:
        airport_df["share"] = airport_df.groupby("service")["trips"].transform(
            lambda x: (x / x.sum()).round(4)
        )
    airport_path = OUT_DIR / "taxi_airport_trip_share.csv"
    airport_df.to_csv(airport_path, index=False)
    output_files.append(airport_path)

    shared_rows = [
        {"service": key, "shared_trip": flag, "trips": count}
        for (key, flag), count in shared_counts.items()
    ]
    shared_df = pd.DataFrame(shared_rows, columns=["service", "shared_trip", "trips"])
    if not shared_df.empty:
        shared_df["share"] = shared_df.groupby("service")["trips"].transform(
            lambda x: (x / x.sum()).round(4)
        )
    shared_path = OUT_DIR / "taxi_shared_ride_share.csv"
    shared_df.to_csv(shared_path, index=False)
    output_files.append(shared_path)

    provider_rows = [
        {"provider": provider, "trips": count}
        for (provider,), count in provider_counts.items()
    ]
    provider_df = pd.DataFrame(provider_rows, columns=["provider", "trips"])
    if not provider_df.empty:
        provider_df["share"] = (provider_df["trips"] / provider_df["trips"].sum()).round(4)
    provider_path = OUT_DIR / "taxi_provider_share.csv"
    provider_df.to_csv(provider_path, index=False)
    output_files.append(provider_path)

    pickup_rows = [
        {"service": key, "year": year, "PULocationID": pu_id, "trips": count}
        for (key, year, pu_id), count in pickup_counts.items()
    ]
    pickup_df = pd.DataFrame(pickup_rows, columns=["service", "year", "PULocationID", "trips"])
    zone_lookup = pd.read_csv(ZONE_LOOKUP)
    zone_lookup = zone_lookup.rename(columns={"LocationID": "PULocationID"})
    pickup_df = pickup_df.merge(zone_lookup, on="PULocationID", how="left")
    pickup_df = pickup_df.drop(columns=["service_zone"], errors="ignore")
    pickup_df["Borough"] = pickup_df["Borough"].fillna("Unknown")
    pickup_df["Zone"] = pickup_df["Zone"].fillna("Unknown")

    borough_df = (
        pickup_df.groupby(["service", "Borough"], as_index=False)["trips"]
        .sum()
        .sort_values(["service", "trips"], ascending=[True, False])
    )
    borough_df["share"] = borough_df.groupby("service")["trips"].transform(
        lambda x: (x / x.sum()).round(4)
    )
    borough_path = OUT_DIR / "taxi_pickup_borough_share.csv"
    borough_df.to_csv(borough_path, index=False)
    output_files.append(borough_path)

    pickup_latest = pickup_df.copy()
    if not pickup_latest.empty:
        latest_years = pickup_latest.groupby("service")["year"].transform("max")
        pickup_latest = pickup_latest[pickup_latest["year"] == latest_years]
    pickup_top_df = (
        pickup_latest.sort_values(["service", "trips"], ascending=[True, False])
        .groupby("service")
        .head(TOP_ZONES)
    )
    pickup_top_path = OUT_DIR / "taxi_top_pickup_zones.csv"
    pickup_top_df.to_csv(pickup_top_path, index=False)
    output_files.append(pickup_top_path)

    od_rows = [
        {
            "service": key,
            "year": year,
            "PULocationID": pu_id,
            "DOLocationID": do_id,
            "trips": count,
        }
        for (key, year, pu_id, do_id), count in od_counts.items()
    ]
    od_df = pd.DataFrame(
        od_rows, columns=["service", "year", "PULocationID", "DOLocationID", "trips"]
    )
    od_df = od_df.merge(
        zone_lookup.rename(
            columns={
                "PULocationID": "PULocationID",
                "Borough": "OriginBorough",
                "Zone": "OriginZone",
            }
        ),
        on="PULocationID",
        how="left",
    )
    od_df = od_df.merge(
        zone_lookup.rename(
            columns={
                "PULocationID": "DOLocationID",
                "Borough": "DestBorough",
                "Zone": "DestZone",
            }
        ),
        on="DOLocationID",
        how="left",
    )
    od_df = od_df.drop(columns=["service_zone_x", "service_zone_y"], errors="ignore")
    od_df["OriginBorough"] = od_df["OriginBorough"].fillna("Unknown")
    od_df["OriginZone"] = od_df["OriginZone"].fillna("Unknown")
    od_df["DestBorough"] = od_df["DestBorough"].fillna("Unknown")
    od_df["DestZone"] = od_df["DestZone"].fillna("Unknown")
    od_latest = od_df.copy()
    if not od_latest.empty:
        latest_years = od_latest.groupby("service")["year"].transform("max")
        od_latest = od_latest[od_latest["year"] == latest_years]
    od_top_df = (
        od_latest.sort_values(["service", "trips"], ascending=[True, False])
        .groupby("service")
        .head(TOP_PAIRS)
    )
    od_path = OUT_DIR / "taxi_top_od_pairs.csv"
    od_top_df.to_csv(od_path, index=False)
    output_files.append(od_path)

    for csv_path in output_files:
        shutil.copy2(csv_path, WEB_OUT_DIR / csv_path.name)

    if args.split:
        split_outputs(OUT_DIR, args.max_mb, args.remove_original)
        split_outputs(WEB_OUT_DIR, args.max_mb, args.remove_original)

    print("Yellow taxi aggregates built successfully.")


if __name__ == "__main__":
    main()
