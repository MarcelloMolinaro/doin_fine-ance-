import requests
import pandas as pd
from dagster import asset

@asset
def weather_source():
    url = "https://api.weather.gov/gridpoints/MTR/88,126/forecast"
    r = requests.get(url)
    r.raise_for_status()
    periods = r.json()["properties"]["periods"]
    df = pd.DataFrame(periods)[["name", "temperature", "windSpeed"]]
    return df