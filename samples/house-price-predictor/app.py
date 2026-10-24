import streamlit as st

from model import CITY_MULTIPLIERS, predict_price, to_lakh

st.set_page_config(page_title="House Price Predictor", page_icon="🏠", layout="centered")

st.title("🏠 House Price Predictor")
st.caption("A demo estimator for Indian cities. It uses a simple linear formula, not real market data.")

col1, col2 = st.columns(2)
with col1:
    city = st.selectbox("City", list(CITY_MULTIPLIERS.keys()), index=list(CITY_MULTIPLIERS).index("Pune"))
    area = st.number_input("Area (sq ft)", min_value=200, max_value=10000, value=1000, step=50)
    age = st.slider("Property age (years)", 0, 50, 5)
with col2:
    bedrooms = st.number_input("Bedrooms", min_value=1, max_value=10, value=2)
    bathrooms = st.number_input("Bathrooms", min_value=1, max_value=10, value=2)

price = predict_price(area, bedrooms, bathrooms, age, city)
lakh = to_lakh(price)

st.divider()
if lakh >= 100:
    st.metric("Estimated price", f"₹ {lakh:,.2f} lakh", help=f"≈ ₹ {lakh / 100:,.2f} crore")
else:
    st.metric("Estimated price", f"₹ {lakh:,.2f} lakh")
st.write(f"That works out to about **₹ {price / area:,.0f} per sq ft** in {city}.")

with st.expander("How is this calculated?"):
    st.markdown(
        "- ₹5,000 per sq ft, plus ₹3 lakh per bedroom and ₹1.5 lakh per bathroom\n"
        "- 1% depreciation per year of age, capped at 50%\n"
        "- City multipliers: " + ", ".join(f"{c} ×{m}" for c, m in CITY_MULTIPLIERS.items())
    )
