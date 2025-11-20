# **NYC–Milan Mobility Visualization Project**


## Academic Context

**SUPSI – A.Y. 2025–2026**
*Data Visualization Course (M-D3202E)*

**Instructor:** Giovanni Profeta

---

## 👥 **Authors**

* [Adoh Emmanuel](https://github.com/)
* [Aron Maggisano](https://github.com/Aron-Magg)
* [Francesco Masolini](https://github.com/)
* [Maithili Nalawade](https://github.com/)

---

## 0. Project Structure & Usage Guide

The project directory is organized as follows:

```bash
.
├── DataPreProcessing/          # Notebooks and scripts for cleaning and preparing the data
├── DataVisualizations/         # Notebooks and scripts for plots, maps, and visual analysis
├── Datasets/                   # Processed datasets used by the visualizations
├── tripdata/                   # Raw trip data (e.g., Citi Bike data)
│   └── JC-201509-202510-citibike-tripdata.csv
├── Utilities/                  # Utility scripts and helper tools
│   ├── clean.sh                # Script to clean temporary files / artifacts
│   ├── download_datasets.py    # Script to download all required datasets
│   ├── requirements.txt        # Python dependencies for the project
│   └── start_jupyter_lab.sh    # Convenience script to launch Jupyter Lab
├── Resources/                  # Static assets used in the web interface
│   └── images/
│       ├── background.jpeg     # Global background image
│       └── intro-banner.jpg    # Banner image for the intro section
├── main.html                   # Main HTML file for the web-based visualization
├── styles.css                  # Stylesheet for the web interface
└── README.md                   # Project documentation (this file)
```

### **0.1. Getting Started**

#### **0.1.1. Set up the Python environment and launch JupyterLab:**

```bash
Utilities/start_jupyter_lab.sh
```

This will:

* Create a virtual environment (`.venv`) if it does not exist.
* Upgrade `pip`.
* Install required packages from `requirements.txt`.
* Register a Jupyter kernel for the environment.
* Launch JupyterLab.

#### **0.1.2. Clean the project folder before committing to GitHub:**

```bash
Utilities/clean.sh
```

This removes:

* The virtual environment (`.venv`)
* Jupyter notebook checkpoints (`.ipynb_checkpoints`)
* Python cache files (`__pycache__` and `*.pyc`)

#### **0.1.3. Organizing work:**

* Place raw datasets in `Datasets`.
* Perform data preprocessing in `DataPreProcessing`.
* Generate visualizations in `DataVisualizations`.
* Keep utility scripts in `Utilities`.

---

## **1. Abstract**

This project investigates how urban mobility has evolved in **New York City** and **Milan** over time.
Using open data, transportation metrics, and reproducible analytical workflows, we compare trends in mode share, service performance, accessibility, safety, emissions, and travel behavior.

The final goal is to create a set of clear and engaging **data visualizations** tailored to both the general public and expert users, enabling meaningful comparisons between the two cities’ mobility systems.

---

## **2. Introduction**

Urban mobility is undergoing significant transformations due to new transportation modes, changing travel behavior, policy interventions, and long-term socio-economic trends.
This project aims to analyze these developments and communicate them visually.

**Main objectives:**

* Understand how mobility patterns changed over the last years.
* Compare NYC and Milan using harmonized metrics.
* Provide both high-level overviews and detailed, route-level analyses.
* Build clear visualizations that support both laypeople and experts.

---

## **3. Dataset**

This project integrates datasets from multiple sources:

### **3.1 Data Sources**

* NYC Open Data (subway turnstiles, bus ridership, Citi Bike, taxi trips, traffic counts, collisions)
* MTA Performance Dashboard
* Comune di Milano Open Data (ATM ridership, punctuality, bike counters, accidents)
* GTFS feeds (static and real-time)
* Micromobility (BikeMi and scooter providers)
* Weather data (historical hourly)
* OpenStreetMap (street network and topology)
* Socio-economic datasets (census, POIs, income)

### **3.2 Dataset Structure**

Each city’s data is harmonized into:

* **Mobility flows**
* **Trips and ridership counts**
* **Network features** (stops, lines, coverage)
* **Reliability and speed metrics**
* **Accessibility measures**
* **Safety and environmental impact metrics**

### **3.3 Known Issues & Data Challenges**

* Different spatial and temporal granularity across sources
* Missing or inconsistent timestamps
* Mode naming discrepancies (e.g., subway vs metro)
* Partial real-time availability
* Aggregation differences (daily vs hourly vs monthly)

---

## 4. Data Pre-processing

### 4.0 Data Download

To download all the required datasets, run the following command from the project root:

```bash
python -m Utilities.download_datasets
```

### **4.1 Data Cleaning**

[to be completed]

### **4.2 Harmonization**

[to be completed]

### **4.3 Aggregation & Feature Engineering**

[to be completed]

### **4.4 Final Dataset Output**

[to be completed]

---

## **5. Data Visualizations**

[to be completed]

## **6. Resources**

This section lists all the key materials supporting the analysis, including datasets, documentation, research references, and tools used throughout the project.
It will be progressively expanded as the project evolves.

### **6.1 Data Portals & Official Sources**

[to be completed]

### **6.2 External Datasets & Mobility Research**

[to be completed]

### **6.3 Tools & Libraries**

[to be completed]

### **6.4 Background Reading & References**

[to be completed]