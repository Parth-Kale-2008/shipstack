# House Price Predictor (Streamlit)

A demo price estimator for Pune, Mumbai, Bengaluru and Nagpur. The pricing formula lives in `model.py`, in `predict_price`.
Run it with `pip install -r requirements.txt` and then `streamlit run app.py --server.port $PORT --server.address 0.0.0.0`.
To run the tests you only need pytest: `pip install pytest` and then `pytest`.
