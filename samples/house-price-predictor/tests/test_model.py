import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from model import predict_price  # noqa: E402


def test_price_is_positive():
    assert predict_price(1000, 2, 2, 5, "Pune") > 0


def test_more_area_means_higher_price():
    small = predict_price(800, 2, 2, 5, "Pune")
    large = predict_price(1500, 2, 2, 5, "Pune")
    assert large > small


def test_mumbai_costs_more_than_nagpur():
    assert predict_price(1000, 2, 2, 5, "Mumbai") > predict_price(1000, 2, 2, 5, "Nagpur")
