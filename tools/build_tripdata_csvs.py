from __future__ import annotations

import sqlite3
from collections import defaultdict
import shutil
from pathlib import Path

import pandas as pd
from tqdm import tqdm

INPUT_DIR = Path("data/tripdata")
OUT_DIR = Path("data/processed/tripdata")
WEB_OUT_DIR = Path("web/data/processed/tripdata")

CHUNK_SIZE = 400_000
TOP_FLOWS = 50
TOP_STATIONS = 20

USECOLS = [
    "ride_id",
    "rideable_type",
    "started_at",
    "ended_at",
    "start_station_name",
    "start_station_id",
    "end_station_name",
    "end_station_id",
    "start_lat",
    "start_lng",
    "end_lat",
    "end_lng",
    "member_casual",
]

DURATION_BINS = [0, 5, 10, 20, 40, 10_000]
DURATION_LABELS = [
    "0-5 min",
    "5-10 min",
    "10-20 min",
    "20-40 min",
    "40+ min",
]


# -----------------------
# SQLite helpers
# -----------------------
def make_conn(db_path: Path) -> sqlite3.Connection:
    conn = sqlite3.connect(db_path)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    conn.execute("PRAGMA temp_store=MEMORY;")
    conn.execute("PRAGMA cache_size=-20000;")  # ~20MB
    return conn


def init_db(conn: sqlite3.Connection) -> None:
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS flows (
            start_station_id   TEXT NOT NULL,
            end_station_id     TEXT NOT NULL,
            start_station_name TEXT,
            start_lat          REAL,
            start_lng          REAL,
            end_station_name   TEXT,
            end_lat            REAL,
            end_lng            REAL,
            trip_count         INTEGER NOT NULL,
            duration_sum       REAL NOT NULL,
            PRIMARY KEY (start_station_id, end_station_id)
        );

        CREATE TABLE IF NOT EXISTS stations (
            station_id   TEXT PRIMARY KEY,
            station_name TEXT,
            lat          REAL,
            lng          REAL,
            trip_count   INTEGER NOT NULL
        );
        """
    )


def upsert_flows(conn: sqlite3.Connection, df: pd.DataFrame) -> None:
    rows = list(
        df[
            [
                "start_station_id",
                "end_station_id",
                "start_station_name",
                "start_lat",
                "start_lng",
                "end_station_name",
                "end_lat",
                "end_lng",
                "trip_count",
                "duration_sum",
            ]
        ].itertuples(index=False, name=None)
    )
    conn.executemany(
        """
        INSERT INTO flows (
            start_station_id, end_station_id,
            start_station_name, start_lat, start_lng,
            end_station_name, end_lat, end_lng,
            trip_count, duration_sum
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(start_station_id, end_station_id) DO UPDATE SET
            trip_count   = flows.trip_count + excluded.trip_count,
            duration_sum = flows.duration_sum + excluded.duration_sum,
            start_station_name = COALESCE(flows.start_station_name, excluded.start_station_name),
            start_lat = COALESCE(flows.start_lat, excluded.start_lat),
            start_lng = COALESCE(flows.start_lng, excluded.start_lng),
            end_station_name = COALESCE(flows.end_station_name, excluded.end_station_name),
            end_lat = COALESCE(flows.end_lat, excluded.end_lat),
            end_lng = COALESCE(flows.end_lng, excluded.end_lng)
        """,
        rows,
    )


def upsert_stations(conn: sqlite3.Connection, df: pd.DataFrame) -> None:
    rows = list(
        df[
            ["start_station_id", "start_station_name", "start_lat", "start_lng", "trip_count"]
        ].itertuples(index=False, name=None)
    )
    conn.executemany(
        """
        INSERT INTO stations (station_id, station_name, lat, lng, trip_count)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(station_id) DO UPDATE SET
            trip_count = stations.trip_count + excluded.trip_count,
            station_name = COALESCE(stations.station_name, excluded.station_name),
            lat = COALESCE(stations.lat, excluded.lat),
            lng = COALESCE(stations.lng, excluded.lng)
        """,
        rows,
    )


# -----------------------
# In-RAM counters
# -----------------------
def add_counts(counter: dict[tuple, int], group_df: pd.DataFrame) -> None:
    for row in group_df.itertuples(index=False, name=None):
        counter[row[:-1]] += int(row[-1])


def counter_to_df(counter: dict[tuple, int], columns: list[str]) -> pd.DataFrame:
    rows = [list(k) + [v] for k, v in counter.items()]
    return pd.DataFrame(rows, columns=columns)


# -----------------------
# Robust datetime + duration (no .dt on diff)
# -----------------------
def parse_datetime_utc(series: pd.Series) -> pd.Series:
    """
    Converte una Series (stringhe sporche/mix formati) in datetime UTC.
    Ritorna datetime64[ns, UTC] (o NaT).
    """
    s = series.astype("string").str.strip()
    s = s.replace({"": pd.NA, "NaT": pd.NA, "nan": pd.NA, "None": pd.NA})

    # Pandas >= 2.0 supporta format="mixed". Se non disponibile, fallback.
    try:
        dt = pd.to_datetime(s, errors="coerce", utc=True, format="mixed", cache=True)
    except TypeError:
        dt = pd.to_datetime(s, errors="coerce", utc=True, cache=True)

    return dt


def duration_minutes(start_dt: pd.Series, end_dt: pd.Series) -> pd.Series:
    """
    Durata in minuti via differenza numerica in ns.
    Evita completamente `.dt` sul risultato della sottrazione.
    """
    # start_dt/end_dt sono già tz-aware UTC, ma li normalizziamo comunque
    start = pd.to_datetime(start_dt, utc=True, errors="coerce")
    end = pd.to_datetime(end_dt, utc=True, errors="coerce")

    # Converti a naive UTC (datetime64[ns]) per fare differenze stabili
    start_naive = start.dt.tz_convert("UTC").dt.tz_localize(None)
    end_naive = end.dt.tz_convert("UTC").dt.tz_localize(None)

    start_ns = start_naive.values.astype("datetime64[ns]").astype("int64")
    end_ns = end_naive.values.astype("datetime64[ns]").astype("int64")

    nat = pd.Timestamp("NaT").value
    valid = (start_ns != nat) & (end_ns != nat)

    out = pd.Series(pd.NA, index=start_dt.index, dtype="Float64")
    out.loc[valid] = (end_ns[valid] - start_ns[valid]) / 60_000_000_000.0
    return out


def main() -> None:
    files = sorted(INPUT_DIR.glob("*.csv"))
    if not files:
        raise SystemExit("No CSV files found in data/tripdata.")

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    # DB temporaneo di aggregazione
    db_path = OUT_DIR / "_agg.sqlite"
    if db_path.exists():
        db_path.unlink()

    conn = make_conn(db_path)
    init_db(conn)

    hourly_counter: dict[tuple, int] = defaultdict(int)
    weekday_counter: dict[tuple, int] = defaultdict(int)
    rideable_counter: dict[tuple, int] = defaultdict(int)
    member_counter: dict[tuple, int] = defaultdict(int)
    duration_counter: dict[tuple, int] = defaultdict(int)

    total_bytes = sum(f.stat().st_size for f in files)
    pbar = tqdm(
        total=total_bytes,
        unit="B",
        unit_scale=True,
        unit_divisor=1024,
        desc="Tripdata",
        mininterval=0.3,
        smoothing=0.05,
    )

    rows_kept = 0

    try:
        for file in files:
            file_size = file.stat().st_size
            pbar.set_postfix_str(file.name)

            # Leggiamo normalmente: progress bar aggiornata UNA VOLTA a fine file (robusto)
            for chunk in pd.read_csv(
                file,
                usecols=USECOLS,
                chunksize=CHUNK_SIZE,
                low_memory=False,
                dtype={"start_station_id": "string", "end_station_id": "string"},
            ):
                # Filtri base + copy per evitare SettingWithCopyWarning
                chunk = chunk.dropna(
                    subset=[
                        "started_at",
                        "ended_at",
                        "start_station_id",
                        "end_station_id",
                        "start_lat",
                        "start_lng",
                        "end_lat",
                        "end_lng",
                    ]
                ).copy()

                if chunk.empty:
                    continue

                start_dt = parse_datetime_utc(chunk["started_at"])
                end_dt = parse_datetime_utc(chunk["ended_at"])
                chunk = chunk.assign(started_at=start_dt, ended_at=end_dt)

                chunk.loc[:, "duration_min"] = duration_minutes(start_dt, end_dt)
                chunk = chunk.dropna(subset=["duration_min"]).copy()
                if chunk.empty:
                    continue

                # Durate realistiche (0..360 min)
                chunk = chunk[(chunk["duration_min"] >= 0) & (chunk["duration_min"] <= 360)].copy()
                if chunk.empty:
                    continue

                rows_kept += len(chunk)
                pbar.set_postfix_str(f"{file.name} | kept={rows_kept:,}")

                # ---- FLOWS & STATIONS (DB) ----
                flow_group = (
                    chunk.groupby(["start_station_id", "end_station_id"], dropna=True)
                    .agg(
                        start_station_name=("start_station_name", "first"),
                        start_lat=("start_lat", "first"),
                        start_lng=("start_lng", "first"),
                        end_station_name=("end_station_name", "first"),
                        end_lat=("end_lat", "first"),
                        end_lng=("end_lng", "first"),
                        trip_count=("ride_id", "count"),
                        duration_sum=("duration_min", "sum"),
                    )
                    .reset_index()
                )

                station_group = (
                    chunk.groupby(["start_station_id"], dropna=True)
                    .agg(
                        start_station_name=("start_station_name", "first"),
                        start_lat=("start_lat", "first"),
                        start_lng=("start_lng", "first"),
                        trip_count=("ride_id", "count"),
                    )
                    .reset_index()
                )

                conn.execute("BEGIN;")
                try:
                    upsert_flows(conn, flow_group)
                    upsert_stations(conn, station_group)
                    conn.execute("COMMIT;")
                except Exception:
                    conn.execute("ROLLBACK;")
                    raise

                # ---- COUNTERS (RAM) ----
                # Sicuro: started_at è datetime tz-aware
                chunk.loc[:, "hour"] = chunk["started_at"].dt.hour
                chunk.loc[:, "weekday_index"] = chunk["started_at"].dt.dayofweek

                hourly_group = (
                    chunk.groupby(["hour", "member_casual"])
                    .agg(trip_count=("ride_id", "count"))
                    .reset_index()
                )
                add_counts(hourly_counter, hourly_group)

                weekday_group = (
                    chunk.groupby(["weekday_index", "member_casual"])
                    .agg(trip_count=("ride_id", "count"))
                    .reset_index()
                )
                add_counts(weekday_counter, weekday_group)

                rideable_group = (
                    chunk.groupby(["rideable_type"])
                    .agg(trip_count=("ride_id", "count"))
                    .reset_index()
                )
                add_counts(rideable_counter, rideable_group)

                member_group = (
                    chunk.groupby(["member_casual"])
                    .agg(trip_count=("ride_id", "count"))
                    .reset_index()
                )
                add_counts(member_counter, member_group)

                duration_bins = pd.cut(
                    chunk["duration_min"].astype("float64"),
                    bins=DURATION_BINS,
                    labels=DURATION_LABELS,
                    include_lowest=True,
                )
                duration_group = (
                    chunk.assign(duration_bin=duration_bins)
                    .groupby(["duration_bin", "member_casual"], observed=False)
                    .agg(trip_count=("ride_id", "count"))
                    .reset_index()
                )
                add_counts(duration_counter, duration_group)

            # ✅ avanzamento “robusto”: a fine file aggiungiamo la sua dimensione
            pbar.update(file_size)

    finally:
        pbar.close()

    # ---- EXPORT FINALI ----
    flows_df = pd.read_sql_query(
        """
        SELECT
            start_station_id,
            start_station_name,
            start_lat,
            start_lng,
            end_station_id,
            end_station_name,
            end_lat,
            end_lng,
            trip_count,
            ROUND(CASE WHEN trip_count > 0 THEN duration_sum * 1.0 / trip_count ELSE 0 END, 2) AS avg_duration_min
        FROM flows
        ORDER BY trip_count DESC
        LIMIT ?
        """,
        conn,
        params=(TOP_FLOWS,),
    )
    flows_df.to_csv(OUT_DIR / "top_flows.csv", index=False)

    stations_df = pd.read_sql_query(
        """
        SELECT
            station_id   AS station_id,
            station_name AS station_name,
            lat          AS lat,
            lng          AS lng,
            trip_count   AS trip_count
        FROM stations
        ORDER BY trip_count DESC
        LIMIT ?
        """,
        conn,
        params=(TOP_STATIONS,),
    )
    stations_df.to_csv(OUT_DIR / "top_start_stations.csv", index=False)

    counter_to_df(hourly_counter, ["hour", "member_casual", "trip_count"]).to_csv(
        OUT_DIR / "hourly_by_user.csv", index=False
    )
    counter_to_df(weekday_counter, ["weekday_index", "member_casual", "trip_count"]).to_csv(
        OUT_DIR / "weekday_by_user.csv", index=False
    )
    counter_to_df(rideable_counter, ["rideable_type", "trip_count"]).to_csv(
        OUT_DIR / "rideable_type_share.csv", index=False
    )
    counter_to_df(member_counter, ["member_casual", "trip_count"]).to_csv(
        OUT_DIR / "member_share.csv", index=False
    )
    counter_to_df(duration_counter, ["duration_bin", "member_casual", "trip_count"]).to_csv(
        OUT_DIR / "duration_bins.csv", index=False
    )

    conn.close()
    WEB_OUT_DIR.mkdir(parents=True, exist_ok=True)
    for csv_path in OUT_DIR.glob("*.csv"):
        shutil.copy2(csv_path, WEB_OUT_DIR / csv_path.name)

    print(f"Tripdata outputs written to {OUT_DIR}")
    print(f"Web-ready tripdata outputs written to {WEB_OUT_DIR}")


if __name__ == "__main__":
    main()
