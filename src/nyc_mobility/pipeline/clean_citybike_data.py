# ============================================
# Author: Aron Maggisano
# File: src/nyc_mobility/pipeline/clean_citybike_data.py
# Description:
#   Cleaning e aggregazione per TUTTI i file Citi Bike CSV
#   dentro data/raw/tripdata:
#
#   - supporta schema "vecchio" (2013–2019):
#     tripduration,starttime,stoptime,start station id, ...
#
#   - è pronto anche per schema "nuovo" (2020+):
#     ride_id,rideable_type,started_at,ended_at, ...
#
#   - legge tutte le CSV in streaming (chunks), e costruisce:
#
#     1) end_stations_usage.csv
#        - per (year, end station) -> totale arrivi
#
#     2) start_stations_usage.csv
#        - per (year, start station) -> totale partenze
#
#     3) station_year_flows.csv
#        - per (year, origin station, destination station) -> trip_count
#
#     4) monthly_durations.csv
#        - per month (YYYY-MM) -> durata totale, numero viaggi, media durata
#        - poi filtrato a 2015-09 .. 2017-12 (come da specifica del progetto)
#
#   NOTA:
#   - ignora file nascosti (es. ._201306-...) e file che iniziano con "old_"
#   - ignora .zip e altre estensioni: lavora solo su .csv
# ============================================

from __future__ import annotations

from collections import defaultdict
from pathlib import Path
from typing import Dict, Iterable, Mapping, MutableMapping, Optional

import pandas as pd

# Cartelle di default
DEFAULT_INPUT_DIR = Path("data/raw/tripdata")
DEFAULT_OUTPUT_DIR = Path("data/processed/citybike")


# ------------------ helper per path ------------------


def _ensure_paths(
    input_dir: Optional[str | Path],
    output_dir: Optional[str | Path],
) -> tuple[Path, Path]:
    in_dir = Path(input_dir) if input_dir is not None else DEFAULT_INPUT_DIR
    out_dir = Path(output_dir) if output_dir is not None else DEFAULT_OUTPUT_DIR

    if not in_dir.exists() or not in_dir.is_dir():
        raise FileNotFoundError(
            f"Input Citi Bike folder not found or not a directory: {in_dir}"
        )

    out_dir.mkdir(parents=True, exist_ok=True)
    return in_dir, out_dir


# ------------------ helper per aggregazioni ------------------


def _agg_to_rows_station_yearly(
    mapping: Mapping[tuple, int],
    id_idx: int,
    name_idx: int,
    lat_idx: int,
    lon_idx: int,
    year_idx: int,
    count_column: str,
) -> list[dict]:
    rows: list[dict] = []
    for key, count in mapping.items():
        station_id = key[id_idx]
        station_name = key[name_idx]
        lat = key[lat_idx]
        lon = key[lon_idx]
        year = key[year_idx]

        rows.append(
            {
                "year": int(year),
                "station_id": station_id,
                "station_name": station_name,
                "station_latitude": lat,
                "station_longitude": lon,
                count_column: int(count),
            }
        )
    return rows


def _agg_to_rows_flows(mapping: Mapping[tuple, int]) -> list[dict]:
    rows: list[dict] = []
    for key, count in mapping.items():
        (
            start_id,
            start_name,
            start_lat,
            start_lon,
            end_id,
            end_name,
            end_lat,
            end_lon,
            year,
        ) = key

        rows.append(
            {
                "year": int(year),
                "origin_station_id": start_id,
                "origin_station_name": start_name,
                "origin_station_latitude": start_lat,
                "origin_station_longitude": start_lon,
                "destination_station_id": end_id,
                "destination_station_name": end_name,
                "destination_station_latitude": end_lat,
                "destination_station_longitude": end_lon,
                "trip_count": int(count),
            }
        )
    return rows


def _agg_to_rows_monthly(
    mapping: Mapping[str, MutableMapping[str, float | int]],
) -> list[dict]:
    rows: list[dict] = []
    for ym, stats in mapping.items():
        total_seconds = float(stats.get("total_duration_seconds", 0.0))
        trip_count = int(stats.get("trip_count", 0))

        avg_seconds = total_seconds / trip_count if trip_count > 0 else 0.0

        year_str, month_str = ym.split("-")
        rows.append(
            {
                "year": int(year_str),
                "month": int(month_str),
                "year_month": ym,
                "total_trip_duration_seconds": total_seconds,
                "total_trip_duration_hours": total_seconds / 3600.0,
                "trip_count": trip_count,
                "avg_trip_duration_seconds": avg_seconds,
            }
        )
    return rows


# ------------------ helper per schema colonne ------------------


def _normalize(col: str) -> str:
    """
    Normalizza il nome colonna:
    - lowercase
    - trim spazi
    - spazi -> underscore
    """
    return col.strip().lower().replace(" ", "_")


def _norm_map(df: pd.DataFrame) -> dict[str, str]:
    """
    Ritorna mapping:
        normalized_name -> original_name
    per tutte le colonne del DataFrame.
    """
    m: dict[str, str] = {}
    for c in df.columns:
        m[_normalize(c)] = c
    return m


def _first_present(norm: Mapping[str, str], *candidates: str) -> Optional[str]:
    """
    Dato un mapping normalized_name -> original_name,
    ritorna l'original_name del primo candidato presente, oppure None.
    """
    for cand in candidates:
        if cand in norm:
            return norm[cand]
    return None


# ------------------ pipeline principale ------------------


def run_citybike_cleaning(
    input_dir: Optional[str | Path] = None,
    output_dir: Optional[str | Path] = None,
    chunksize: int = 250_000,
) -> Dict[str, Path]:
    """
    Cleaning e aggregazione Citi Bike leggendo TUTTE le CSV
    in input_dir (default: data/raw/tripdata).

    Ritorna un dict con i percorsi dei 4 file aggregati.
    """
    in_dir, out_dir = _ensure_paths(input_dir, output_dir)

    print(f"[clean_citybike_data] Input dir : {in_dir}")
    print(f"[clean_citybike_data] Output dir : {out_dir}")

    # Aggregatori globali
    end_counts: dict[tuple, int] = defaultdict(int)
    start_counts: dict[tuple, int] = defaultdict(int)
    station_flows: dict[tuple, int] = defaultdict(int)
    monthly_duration: dict[str, dict[str, float | int]] = defaultdict(
        lambda: {"total_duration_seconds": 0.0, "trip_count": 0}
    )

    # ------------------ trova tutte le CSV utili ------------------

    csv_files = [
        p
        for p in sorted(in_dir.glob("*.csv"))
        if not p.name.startswith(".")  # niente ._201306-...
        and not p.name.startswith("old_")  # ignoriamo il vecchio JC merge
    ]

    print("[clean_citybike_data] Scanning CSV files...")
    print(f"  Found {len(csv_files)} CSV files to process.\n")

    # ------------------ loop sui file ------------------

    for idx, path in enumerate(csv_files, start=1):
        print(f"[{idx}/{len(csv_files)}] Processing file: {path.name}")

        try:
            # Leggiamo in chunks per non esplodere la RAM
            chunk_iter: Iterable[pd.DataFrame] = pd.read_csv(
                path,
                dtype=str,
                chunksize=chunksize,
            )
        except UnicodeDecodeError as e:  # file sporchi/macOS ._ ecc.
            print(f"  ✗ Unicode error reading {path}: {e}. Skipping this file.")
            continue
        except Exception as e:  # noqa: BLE001
            print(f"  ✗ Error opening {path}: {e}. Skipping this file.")
            continue

        # ------------------ loop sui chunk ------------------

        for c_i, chunk in enumerate(chunk_iter, start=1):
            # rimuove righe completamente vuote
            chunk = chunk.dropna(how="all")
            if chunk.empty:
                continue

            norm = _norm_map(chunk)

            # Proviamo a capire quale schema ha il chunk

            tripduration_col = _first_present(norm, "tripduration", "trip_duration")
            starttime_col = _first_present(norm, "starttime", "start_time")
            stoptime_col = _first_present(norm, "stoptime", "stop_time")

            started_at_col = norm.get("started_at")
            ended_at_col = norm.get("ended_at")

            if tripduration_col and starttime_col:
                # -------- schema "vecchio" (2013–2019, JC vecchio, ecc.) --------
                start_dt = pd.to_datetime(
                    chunk[starttime_col],
                    errors="coerce",
                )
                trip_dur = pd.to_numeric(
                    chunk[tripduration_col],
                    errors="coerce",
                )

            elif started_at_col and ended_at_col:
                # -------- schema "nuovo" (2020+) --------
                start_dt = pd.to_datetime(chunk[started_at_col], errors="coerce")
                end_dt = pd.to_datetime(chunk[ended_at_col], errors="coerce")
                trip_dur = (end_dt - start_dt).dt.total_seconds()
            else:
                # schema sconosciuto: saltiamo il chunk
                if c_i == 1:
                    print(
                        "  ⚠ Unrecognized schema in this file "
                        "(no tripduration/starttime or started_at/ended_at). "
                        "Skipping file."
                    )
                    # saltiamo completamente il file
                    break
                else:
                    continue

            # filtra righe valide
            mask_valid = start_dt.notna() & trip_dur.notna() & (trip_dur > 0)
            if not mask_valid.any():
                continue

            df = chunk.loc[mask_valid].copy()
            df["start_dt"] = start_dt[mask_valid]
            df["trip_duration"] = trip_dur[mask_valid]

            # mappiamo le colonne stazione su nomi canonici
            start_id_col = _first_present(norm, "start_station_id")
            start_name_col = _first_present(norm, "start_station_name")
            start_lat_col = _first_present(norm, "start_station_latitude", "start_lat")
            start_lng_col = _first_present(norm, "start_station_longitude", "start_lng")

            end_id_col = _first_present(norm, "end_station_id")
            end_name_col = _first_present(norm, "end_station_name")
            end_lat_col = _first_present(norm, "end_station_latitude", "end_lat")
            end_lng_col = _first_present(norm, "end_station_longitude", "end_lng")

            # se ci mancano ID o name di stazione, non ha molto senso proseguire
            if not (start_id_col and start_name_col and end_id_col and end_name_col):
                if c_i == 1:
                    print(
                        "  ⚠ Missing essential station columns "
                        "(start/end station id/name). Skipping file."
                    )
                    break
                else:
                    continue

            # costruiamo DataFrame normalizzato
            norm_df = pd.DataFrame(index=df.index)
            norm_df["start_time"] = df["start_dt"]
            norm_df["trip_duration"] = df["trip_duration"]

            norm_df["start_station_id"] = df[start_id_col]
            norm_df["start_station_name"] = df[start_name_col]
            norm_df["start_station_lat"] = df[start_lat_col] if start_lat_col else None
            norm_df["start_station_lng"] = df[start_lng_col] if start_lng_col else None

            norm_df["end_station_id"] = df[end_id_col]
            norm_df["end_station_name"] = df[end_name_col]
            norm_df["end_station_lat"] = df[end_lat_col] if end_lat_col else None
            norm_df["end_station_lng"] = df[end_lng_col] if end_lng_col else None

            # anno e mese
            norm_df["year"] = norm_df["start_time"].dt.year
            norm_df["year_month"] = norm_df["start_time"].dt.to_period("M")

            # ---------------- aggregazioni sul chunk ----------------

            # 1) End station usage per year
            end_group = norm_df.groupby(
                [
                    "end_station_id",
                    "end_station_name",
                    "end_station_lat",
                    "end_station_lng",
                    "year",
                ],
                dropna=False,
            ).size()

            for key, count in end_group.items():
                end_counts[key] += int(count)

            # 2) Start station usage per year
            start_group = norm_df.groupby(
                [
                    "start_station_id",
                    "start_station_name",
                    "start_station_lat",
                    "start_station_lng",
                    "year",
                ],
                dropna=False,
            ).size()

            for key, count in start_group.items():
                start_counts[key] += int(count)

            # 3) Flussi stazione-stazione per year
            flow_group = norm_df.groupby(
                [
                    "start_station_id",
                    "start_station_name",
                    "start_station_lat",
                    "start_station_lng",
                    "end_station_id",
                    "end_station_name",
                    "end_station_lat",
                    "end_station_lng",
                    "year",
                ],
                dropna=False,
            ).size()

            for key, count in flow_group.items():
                station_flows[key] += int(count)

            # 4) Monthly total duration (tutti gli anni, filtriamo dopo)
            month_group = norm_df.groupby("year_month")["trip_duration"].agg(
                ["sum", "count"]
            )
            for ym, row in month_group.iterrows():
                key = str(ym)  # 'YYYY-MM'
                monthly_duration[key]["total_duration_seconds"] = float(
                    monthly_duration[key]["total_duration_seconds"]
                ) + float(row["sum"])
                monthly_duration[key]["trip_count"] = int(
                    monthly_duration[key]["trip_count"]
                ) + int(row["count"])

    # ========================
    # Build final DataFrames
    # ========================

    # 1) End stations usage per year
    end_rows = _agg_to_rows_station_yearly(
        mapping=end_counts,
        id_idx=0,
        name_idx=1,
        lat_idx=2,
        lon_idx=3,
        year_idx=4,
        count_column="total_arrivals",
    )
    df_end = pd.DataFrame(end_rows)
    if not df_end.empty:
        df_end = df_end.sort_values(
            ["year", "total_arrivals", "station_id"],
            ascending=[True, False, True],
        )

    # 2) Start stations usage per year
    start_rows = _agg_to_rows_station_yearly(
        mapping=start_counts,
        id_idx=0,
        name_idx=1,
        lat_idx=2,
        lon_idx=3,
        year_idx=4,
        count_column="total_departures",
    )
    df_start = pd.DataFrame(start_rows)
    if not df_start.empty:
        df_start = df_start.sort_values(
            ["year", "total_departures", "station_id"],
            ascending=[True, False, True],
        )

    # 3) Station-to-station flows per year
    flow_rows = _agg_to_rows_flows(station_flows)
    df_flows = pd.DataFrame(flow_rows)
    if not df_flows.empty:
        df_flows = df_flows.sort_values(
            ["year", "origin_station_id", "destination_station_id"]
        )

    # 4) Monthly durations (filtrate 2015-09 .. 2017-12)
    monthly_rows = _agg_to_rows_monthly(monthly_duration)
    df_monthly = pd.DataFrame(monthly_rows)
    if not df_monthly.empty:
        df_monthly = df_monthly.sort_values(["year", "month"])
        df_monthly = df_monthly[
            (df_monthly["year_month"] >= "2015-09")
            & (df_monthly["year_month"] <= "2017-12")
        ].reset_index(drop=True)

    # ========================
    # Write CSV files
    # ========================
    end_path = out_dir / "end_stations_usage.csv"
    start_path = out_dir / "start_stations_usage.csv"
    flows_path = out_dir / "station_year_flows.csv"
    monthly_path = out_dir / "monthly_durations.csv"

    print(f"[clean_citybike_data] Writing {end_path}")
    df_end.to_csv(end_path, index=False)

    print(f"[clean_citybike_data] Writing {start_path}")
    df_start.to_csv(start_path, index=False)

    print(f"[clean_citybike_data] Writing {flows_path}")
    df_flows.to_csv(flows_path, index=False)

    print(f"[clean_citybike_data] Writing {monthly_path}")
    df_monthly.to_csv(monthly_path, index=False)

    print("[clean_citybike_data] Cleaning and aggregation completed.")

    return {
        "end_station_usage": end_path,
        "start_station_usage": start_path,
        "station_year_flows": flows_path,
        "monthly_durations": monthly_path,
    }


if __name__ == "__main__":
    run_citybike_cleaning()
