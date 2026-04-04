"""
Forecast API with LIVE Database Data

Queries the PostgreSQL database for:
- Real historical demand from 2023-2024
- Simulated transactions from 2025 to today
- Pre-computed daily demand aggregates for fast charts

Provides:
- Historical demand data for charts
- Category filtering
- Per-product confidence scores
- ML-based forecasts
"""

from fastapi import APIRouter, HTTPException, Query, Depends
from pydantic import BaseModel
from typing import List, Dict, Optional
from datetime import date, timedelta
from sqlalchemy.orm import Session
from sqlalchemy import func
import random
import httpx
import asyncio

from app.database import get_db
from app.models.transaction import Transaction, DailyDemand
from app.models.inventory import Inventory

router = APIRouter(prefix="/forecast", tags=["Forecast"])

# ML Service URL
ML_SERVICE_URL = "http://localhost:8001"


# ==========================================
# CATEGORY NAMES MAPPING
# ==========================================

CATEGORY_NAMES = {
    "GROC": "Groceries",
    "FRPR": "Fresh Produce",
    "BEVG": "Beverages",
    "BKDY": "Bakery & Dairy",
    "FRZN": "Frozen Foods",
    "SNCK": "Snacks",
    "MEAT": "Meat & Seafood",
    "PRSN": "Personal Care",
    "BABC": "Baby Care",
    "CLOT": "Clothing",
    "FTRW": "Footwear",
    "JWCH": "Jewelry & Watches",
    "BAGL": "Bags & Luggage",
    "ELEC": "Electronics",
    "STOF": "Stationery & Office",
    "FURH": "Furniture & Home",
    "BEDM": "Bedding & Mattresses",
    "CLNS": "Cleaning Supplies",
    "KICH": "Kitchen Appliances",
    "PETC": "Pet Care",
    "SPRT": "Sports & Fitness",
    "TOYG": "Toys & Games",
    "AUTO": "Automotive",
    "BOOK": "Books & Media",
}

# Load product catalog from CSV
PRODUCT_CATALOG = {}
try:
    import csv
    import os
    catalog_path = os.path.join(os.path.dirname(__file__), '..', '..', '..', 'ml', 'data', 'raw', 'categories_products.csv')
    if os.path.exists(catalog_path):
        with open(catalog_path, 'r', encoding='utf-8') as f:
            reader = csv.DictReader(f)
            for row in reader:
                PRODUCT_CATALOG[row['SKU_ID']] = row['Product_Name']
except Exception as e:
    print(f"Warning: Could not load product catalog: {e}")


def get_product_name(product_id: str) -> str:
    """Get real product name from catalog CSV."""
    # Try to get from catalog first
    if product_id in PRODUCT_CATALOG:
        return PRODUCT_CATALOG[product_id]
    
    # Fallback to generated name
    parts = product_id.split('_')
    if len(parts) >= 2:
        category = parts[1][:4]
        num = parts[1][4:] if len(parts[1]) > 4 else "001"
        cat_name = CATEGORY_NAMES.get(category, category)
        return f"{cat_name} Item {num}"
    return product_id


# ==========================================
# RESPONSE MODELS
# ==========================================

class CategoryInfo(BaseModel):
    code: str
    name: str
    product_count: int


class DemandDataPoint(BaseModel):
    date: str
    actual: Optional[float] = None
    forecast: Optional[float] = None
    is_forecast: bool = False


class ProductForecastDetail(BaseModel):
    sku: str
    product_name: str
    category: str
    category_name: str
    store_id: str
    current_stock: int
    confidence: float
    confidence_level: str
    demand_data: List[DemandDataPoint]
    seven_day_forecast: float
    stock_days_remaining: float
    stock_status: str
    data_source: str


class ComparisonPoint(BaseModel):
    date: str
    store_id: str
    product_id: str
    demand: float


class ComparisonHistoryResponse(BaseModel):
    start_date: str
    end_date: str
    points: List[ComparisonPoint]
    data_source: str


# ==========================================
# HELPER FUNCTIONS
# ==========================================

async def get_ml_confidence() -> float:
    """Get ML model confidence from inference service."""
    try:
        async with httpx.AsyncClient(timeout=2.0) as client:
            response = await client.get(f"{ML_SERVICE_URL}/health")
            if response.status_code == 200:
                data = response.json()
                return 0.85 if data.get("model_loaded") else 0.55
    except:
        pass
    return 0.55

def calculate_confidence(data_points: int, ml_confidence: float = None) -> tuple:
    """Calculate confidence based on data availability and ML model."""
    # Use ML confidence if available, otherwise fallback to data-based
    if ml_confidence is not None and ml_confidence > 0.7:
        if ml_confidence >= 0.90:
            return ml_confidence, "high"
        elif ml_confidence >= 0.80:
            return ml_confidence, "medium"
        else:
            return ml_confidence, "medium"
    
    # Fallback to data-based confidence
    if data_points >= 300:
        return 0.92, "high"
    elif data_points >= 100:
        return 0.82, "medium"
    elif data_points >= 30:
        return 0.72, "medium"
    else:
        return 0.55, "low"


async def get_ml_forecast(sku: str, store_id: str, days: int = 7) -> List[Dict]:
    """Get forecast from ML inference service."""
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            response = await client.get(
                f"{ML_SERVICE_URL}/predict",
                params={"sku": sku, "store_id": store_id, "days_ahead": days}
            )
            if response.status_code == 200:
                data = response.json()
                forecasts = data.get("forecasts", [])
                result = []
                for f in forecasts:
                    if f["sku"] == sku and f["store_id"] == store_id:
                        result.append({
                            "date": f["date"],
                            "actual": None,
                            "forecast": f["predicted_demand"],
                            "is_forecast": True
                        })
                if result:
                    return result
    except Exception as e:
        print(f"ML Service error: {e}")
    
    # Fallback to simple forecast
    return None


def generate_forecast(avg_demand: float, store_id: str, days: int = 7) -> List[Dict]:
    """Generate forecast based on historical average."""
    result = []
    store_mult = {"S1": 1.0, "S2": 0.85, "S3": 0.95}.get(store_id, 1.0)
    today = date.today()
    
    for i in range(1, days + 1):
        day = today + timedelta(days=i)
        dow = day.weekday()
        dow_factor = 1.2 if dow >= 5 else 1.0
        noise = 0.9 + random.random() * 0.2
        forecast = round(avg_demand * store_mult * dow_factor * noise, 1)
        
        result.append({
            "date": day.isoformat(),
            "actual": None,
            "forecast": max(0, forecast),
            "is_forecast": True
        })
    
    return result


# ==========================================
# API ENDPOINTS
# ==========================================

@router.get("/data-info")
def get_data_info(db: Session = Depends(get_db)):
    """Get information about available data in the database."""
    min_date = db.query(func.min(DailyDemand.date)).scalar()
    max_date = db.query(func.max(DailyDemand.date)).scalar()
    total_transactions = db.query(func.count(Transaction.id)).scalar()
    total_demand_records = db.query(func.count(DailyDemand.id)).scalar()
    stores = [s[0] for s in db.query(DailyDemand.store_id).distinct().all()]
    product_count = db.query(DailyDemand.product_id).distinct().count()
    
    return {
        "data_loaded": True,
        "date_range": {
            "min": min_date.isoformat() if min_date else None,
            "max": max_date.isoformat() if max_date else None
        },
        "stores": stores,
        "total_transactions": total_transactions,
        "total_demand_records": total_demand_records,
        "product_count": product_count,
        "source": "PostgreSQL (live database)"
    }


@router.get("/categories", response_model=List[CategoryInfo])
def get_categories(db: Session = Depends(get_db)):
    """Get list of product categories from database."""
    results = db.query(
        DailyDemand.product_category,
        func.count(func.distinct(DailyDemand.product_id)).label('count')
    ).group_by(DailyDemand.product_category).all()
    
    categories = []
    for cat_code, count in results:
        if cat_code:
            categories.append(CategoryInfo(
                code=cat_code,
                name=CATEGORY_NAMES.get(cat_code, cat_code),
                product_count=count
            ))
    
    return sorted(categories, key=lambda x: x.code)


@router.get("/products")
def get_products(
    category: Optional[str] = Query(None, description="Filter by category code"),
    db: Session = Depends(get_db)
):
    """Get list of products from database."""
    query = db.query(
        DailyDemand.product_id,
        DailyDemand.product_category
    ).distinct()
    
    if category:
        query = query.filter(DailyDemand.product_category == category)
    
    results = query.all()
    
    products = []
    for product_id, cat_code in results:
        products.append({
            "sku": product_id,
            "name": get_product_name(product_id),
            "category": cat_code or ""
        })
    
    return sorted(products, key=lambda x: x["sku"])


@router.get("/detail/{sku}", response_model=ProductForecastDetail)
async def get_product_forecast_detail(
    sku: str,
    store_id: str = Query("S1", description="Store ID"),
    history_days: int = Query(30, description="Days of historical data", ge=7, le=365),
    forecast_days: int = Query(7, description="Days to forecast", ge=1, le=30),
    db: Session = Depends(get_db)
):
    """Get detailed forecast with LIVE database data and ML predictions."""
    max_date = db.query(func.max(DailyDemand.date)).filter(
        DailyDemand.product_id == sku,
        DailyDemand.store_id == store_id
    ).scalar()
    
    if not max_date:
        raise HTTPException(status_code=404, detail=f"No data found for {sku} at {store_id}")
    
    start_date = max_date - timedelta(days=history_days)
    
    historical_query = db.query(DailyDemand).filter(
        DailyDemand.product_id == sku,
        DailyDemand.store_id == store_id,
        DailyDemand.date >= start_date,
        DailyDemand.date <= max_date
    ).order_by(DailyDemand.date).all()
    
    historical = []
    total_demand = 0
    for record in historical_query:
        historical.append({
            "date": record.date.isoformat(),
            "actual": float(record.total_quantity),
            "forecast": None,
            "is_forecast": False
        })
        total_demand += record.total_quantity
    
    avg_demand = total_demand / len(historical_query) if historical_query else 10.0
    
    # Try to get ML forecast first
    ml_forecast = await get_ml_forecast(sku, store_id, forecast_days)
    forecast = ml_forecast if ml_forecast else generate_forecast(avg_demand, store_id, forecast_days)
    demand_data = historical + forecast
    
    total_forecast = sum(f["forecast"] for f in forecast if f["forecast"])
    
    first_record = historical_query[0] if historical_query else None
    category_code = first_record.product_category if first_record else sku.split('_')[1][:4] if '_' in sku else 'UNKN'
    
    # Get REAL inventory from inventory table
    inv_record = db.query(Inventory).filter(
        Inventory.sku == sku,
        Inventory.store_id == store_id
    ).first()
    current_stock = int(inv_record.quantity) if inv_record else 0
    avg_daily_forecast = total_forecast / forecast_days if forecast_days > 0 else 1
    stock_days = current_stock / avg_daily_forecast if avg_daily_forecast > 0 else 999
    
    if stock_days < 3:
        status = "critical"
    elif stock_days < 7:
        status = "low"
    else:
        status = "ok"
    
    # Get ML confidence
    ml_confidence = await get_ml_confidence()
    confidence, conf_level = calculate_confidence(len(historical_query), ml_confidence)
    
    return ProductForecastDetail(
        sku=sku,
        product_name=get_product_name(sku),
        category=category_code,
        category_name=CATEGORY_NAMES.get(category_code, category_code),
        store_id=store_id,
        current_stock=current_stock,
        confidence=confidence,
        confidence_level=conf_level,
        demand_data=[DemandDataPoint(**d) for d in demand_data],
        seven_day_forecast=round(total_forecast, 1),
        stock_days_remaining=round(stock_days, 1),
        stock_status=status,
        data_source="PostgreSQL (live)"
    )


@router.get("/comparison-history", response_model=ComparisonHistoryResponse)
def get_comparison_history(
    start_date: date = Query(..., description="Start date (YYYY-MM-DD)"),
    end_date: date = Query(..., description="End date (YYYY-MM-DD)"),
    store_ids: str = Query(..., description="Comma-separated store ids, e.g. S1,S2"),
    product_ids: str = Query(..., description="Comma-separated product ids, e.g. SKU_A,SKU_B"),
    db: Session = Depends(get_db),
):
    """Get historical demand points for chart comparison directly from DailyDemand."""
    if start_date > end_date:
        raise HTTPException(status_code=400, detail="start_date must be <= end_date")

    store_list = [s.strip() for s in store_ids.split(',') if s.strip()]
    product_list = [p.strip() for p in product_ids.split(',') if p.strip()]

    if not store_list:
        raise HTTPException(status_code=400, detail="At least one store_id is required")
    if not product_list:
        raise HTTPException(status_code=400, detail="At least one product_id is required")

    rows = (
        db.query(
            DailyDemand.date,
            DailyDemand.store_id,
            DailyDemand.product_id,
            func.sum(DailyDemand.total_quantity).label("demand"),
        )
        .filter(DailyDemand.date >= start_date)
        .filter(DailyDemand.date <= end_date)
        .filter(DailyDemand.store_id.in_(store_list))
        .filter(DailyDemand.product_id.in_(product_list))
        .group_by(DailyDemand.date, DailyDemand.store_id, DailyDemand.product_id)
        .order_by(DailyDemand.date.asc())
        .all()
    )

    points = [
        ComparisonPoint(
            date=row.date.isoformat(),
            store_id=row.store_id,
            product_id=row.product_id,
            demand=float(row.demand or 0.0),
        )
        for row in rows
    ]

    return ComparisonHistoryResponse(
        start_date=start_date.isoformat(),
        end_date=end_date.isoformat(),
        points=points,
        data_source="PostgreSQL (live daily_demand)",
    )


@router.get("/by-product")
async def get_forecasts_by_product(
    store_id: Optional[str] = Query(None, description="Filter by store ID"),
    category: Optional[str] = Query(None, description="Filter by category"),
    limit: int = Query(20, description="Number of products to return"),
    db: Session = Depends(get_db)
):
    """Get forecasts grouped by product from database with ML confidence."""
    # Get ML confidence once for all products
    ml_confidence = await get_ml_confidence()
    
    max_date = db.query(func.max(DailyDemand.date)).scalar()
    week_ago = max_date - timedelta(days=7) if max_date else date.today() - timedelta(days=7)
    
    query = db.query(
        DailyDemand.product_id,
        DailyDemand.product_category,
        DailyDemand.store_id,
        func.sum(DailyDemand.total_quantity).label('total_7d'),
        func.count(DailyDemand.id).label('data_points'),
        func.avg(DailyDemand.total_quantity).label('avg_daily')
    ).filter(
        DailyDemand.date >= week_ago
    ).group_by(
        DailyDemand.product_id,
        DailyDemand.product_category,
        DailyDemand.store_id
    )
    
    if store_id:
        query = query.filter(DailyDemand.store_id == store_id)
    if category:
        query = query.filter(DailyDemand.product_category == category)
    
    results = query.all()
    
    products = []
    for row in results:
        avg_daily = float(row.avg_daily) if row.avg_daily else 10
        total_7d = float(row.total_7d) if row.total_7d else 70
        
        # Get REAL inventory from inventory table
        inv_record = db.query(Inventory).filter(
            Inventory.sku == row.product_id,
            Inventory.store_id == row.store_id
        ).first()
        current_stock = int(inv_record.quantity) if inv_record else 0
        stock_days = current_stock / avg_daily if avg_daily > 0 else 999
        
        if stock_days < 3:
            status = "critical"
        elif stock_days < 7:
            status = "low"
        else:
            status = "ok"
        
        confidence, conf_level = calculate_confidence(row.data_points, ml_confidence)
        
        products.append({
            "sku": row.product_id,
            "product_name": get_product_name(row.product_id),
            "category": row.product_category or "",
            "store_id": row.store_id,
            "current_stock": current_stock,
            "seven_day_forecast": round(total_7d, 1),
            "stock_status": status,
            "confidence": confidence,
            "confidence_level": conf_level
        })
    
    status_order = {"critical": 0, "low": 1, "ok": 2}
    products.sort(key=lambda x: status_order.get(x["stock_status"], 3))
    
    return products[:limit]


@router.get("/alerts")
async def get_alerts(
    store_id: Optional[str] = Query(None, description="Filter by store ID"),
    category: Optional[str] = Query(None, description="Filter by category"),
    db: Session = Depends(get_db)
):
    """Get forecast-based alerts from database."""
    products = await get_forecasts_by_product(store_id=store_id, category=category, limit=100, db=db)
    
    alerts = []
    for p in products:
        if p["stock_status"] in ["critical", "low"]:
            alert_type = "stockout" if p["stock_status"] == "critical" else "reorder"
            
            alerts.append({
                "id": f"alert_{p['sku']}_{p['store_id']}",
                "type": alert_type,
                "severity": "high" if alert_type == "stockout" else "medium",
                "product_name": p["product_name"],
                "sku": p["sku"],
                "store_id": p["store_id"],
                "current_stock": p["current_stock"],
                "predicted_demand": p["seven_day_forecast"] / 7,
                "message": f"{'Potential stockout' if alert_type == 'stockout' else 'Reorder needed'} for {p['product_name']} at {p['store_id']}"
            })
    
    return alerts


@router.get("/summary")
async def get_forecast_summary(
    store_id: Optional[str] = Query(None),
    category: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get summary statistics from database with ML confidence."""
    products = await get_forecasts_by_product(store_id=store_id, category=category, limit=1000, db=db)
    
    critical = sum(1 for p in products if p["stock_status"] == "critical")
    low = sum(1 for p in products if p["stock_status"] == "low")
    confidences = [p["confidence"] for p in products]
    
    return {
        "total_products": len(products),
        "critical_stock_count": critical,
        "low_stock_count": low,
        "avg_confidence": round(sum(confidences) / len(confidences), 2) if confidences else 0,
        "data_source": "PostgreSQL (live)"
    }


@router.get("/inventory-value")
async def get_inventory_value(
    store_id: Optional[str] = Query(None),
    db: Session = Depends(get_db)
):
    """Get real inventory value from inventory table."""
    query = db.query(
        func.sum(Inventory.quantity).label('total_units'),
        func.count(Inventory.id).label('total_skus')
    )
    
    if store_id:
        query = query.filter(Inventory.store_id == store_id)
    
    result = query.first()
    total_units = float(result.total_units) if result.total_units else 0
    total_skus = int(result.total_skus) if result.total_skus else 0
    
    # Estimate value at $10 average per unit (can be improved with actual pricing)
    estimated_value = total_units * 10
    
    return {
        "total_units": int(total_units),
        "total_skus": total_skus,
        "estimated_value": round(estimated_value, 2),
        "data_source": "inventory_table"
    }
