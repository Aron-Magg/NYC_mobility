# Push exclusions

The following paths are excluded from commits/push due to size. Revisit later if needed.

- `data/raw_traffic_counts/` (~229MB CSV)
- `data/tripdata/` (multiple GB of monthly Citi Bike CSVs; ignored)
- `cache/` (~136MB)

If we need any of these in the repo later, consider compressing or storing externally.
