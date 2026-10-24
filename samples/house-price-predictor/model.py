"""A simple, hand-tuned linear pricing model (illustrative only, not real market data)."""

CITY_MULTIPLIERS = {
    "Mumbai": 2.2,
    "Bengaluru": 1.5,
    "Pune": 1.2,
    "Nagpur": 0.8,
}

BASE_PRICE_PER_SQFT = 5000  # rupees
BEDROOM_PREMIUM = 300000    # rupees per bedroom
BATHROOM_PREMIUM = 150000   # rupees per bathroom
AGE_DEPRECIATION = 0.01     # 1% per year of age
MAX_DEPRECIATION = 0.5      # never lose more than half the value


def predict_price(area, bedrooms, bathrooms, age, city):
    """Return the estimated price in rupees."""
    if city not in CITY_MULTIPLIERS:
        raise ValueError(f"Unknown city: {city}")
    if area <= 0:
        raise ValueError("area must be positive")

    base = area * BASE_PRICE_PER_SQFT + bedrooms * BEDROOM_PREMIUM + bathrooms * BATHROOM_PREMIUM
    depreciation = 1 - min(max(age, 0) * AGE_DEPRECIATION, MAX_DEPRECIATION)
    return round(base * depreciation * CITY_MULTIPLIERS[city], 2)


def to_lakh(rupees):
    return rupees / 100000
