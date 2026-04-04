"""
What-If Scenario Simulation API

Provides endpoints for demand scenario simulations based on historical data.
Supports both predefined scenarios and AI-powered custom scenario analysis.
"""

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session
from sqlalchemy import func
from typing import List, Dict, Optional, Any, Set
from datetime import datetime, timedelta
from pydantic import BaseModel
import json
import os
import re

from app.database import get_db
from app.models.transaction import DailyDemand
from app.services.gnn_propagation import get_gnn_propagator

router = APIRouter(prefix="/simulations", tags=["Simulations"])

OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "qwen2.5:7b")

CATEGORY_KEYWORDS: Dict[str, List[str]] = {
    "AUTO": ["auto", "automobile", "car", "vehicle", "cars", "vehicles"],
    "BABC": ["baby", "infant", "toddler", "formula", "diaper"],
    "BEVG": ["beverage", "drink", "soda", "juice", "water"],
    "BKDY": ["bakery", "bread", "pastry", "cake"],
    "CLNS": ["cleaning", "detergent", "disinfectant", "sanitizer"],
    "CLOT": ["clothing", "apparel", "shirt", "pants", "fashion"],
    "ELEC": ["electronics", "phone", "laptop", "tv", "gadget"],
    "FRPR": ["produce", "fruit", "vegetable", "dairy", "milk"],
    "FURH": ["furniture", "sofa", "table", "chair", "wardrobe", "bed"],
    "GROC": ["grocery", "groceries", "rice", "pasta", "staple", "canned"],
    "JWCH": ["jewelry", "watch", "watches"],
    "MEAT": ["meat", "seafood", "fish", "chicken", "beef"],
    "PETC": ["pet", "pets", "dog", "cat", "pet care"],
    "PRSN": ["personal care", "shampoo", "toothpaste", "cosmetic", "soap"],
    "SNCK": ["snack", "chips", "biscuits", "chocolate"],
    "SPRT": ["sport", "sports", "outdoor", "gym", "fitness"],
    "STOF": ["stationery", "office", "school supplies", "notebook", "pen"],
    "TOYG": ["toy", "toys", "games", "gaming"],
}

SYSTEMIC_SCENARIO_TERMS = [
    "war", "conflict", "recession", "inflation", "lockdown", "pandemic",
    "flood", "hurricane", "storm", "earthquake", "festival", "holiday",
    "christmas", "diwali", "eid", "thanksgiving", "new year", "stimulus",
    "competitor", "shutdown", "closure", "tax rebate", "cash handout",
]


class ProductImpact(BaseModel):
    """Product-level impact from GNN propagation"""
    multiplier: float
    name: str


class SimulationScenario(BaseModel):
    """Scenario configuration for what-if simulation"""
    scenario: str
    demand_multiplier: Optional[float] = None  # If None, AI will determine it
    weather_impact: Optional[str] = None
    holiday_effect: Optional[bool] = False
    custom_description: Optional[str] = None  # Free text for AI analysis


class SimulationResult(BaseModel):
    """Result of a scenario simulation"""
    scenario: str
    demand: int
    risk: str
    confidence: int
    description: str
    ai_reasoning: Optional[str] = None  # AI explanation of the multiplier choice
    affected_categories: Optional[List[str]] = None  # Which categories are affected
    category_impacts: Optional[Dict[str, float]] = None  # Category-specific multipliers
    affected_products: Optional[Dict[str, ProductImpact]] = None  # SKU -> impact with name from GNN propagation
    baseline_demand_used: Optional[float] = None
    multiplier_used: Optional[float] = None
    store_id: Optional[str] = None


def normalize_store_id(store_id: Optional[str]) -> Optional[str]:
    """Normalize incoming store IDs to canonical format (e.g., s1 -> S1)."""
    if not store_id:
        return None
    normalized = store_id.strip().upper()
    return normalized or None


def extract_store_id_from_text(scenario_text: str) -> Optional[str]:
    """Extract a store hint from natural language text (e.g., 'near store s1')."""
    match = re.search(r"\bstore\s*[:\-]?\s*(s\d+)\b", scenario_text, re.IGNORECASE)
    if not match:
        return None
    return normalize_store_id(match.group(1))


def ensure_store_exists(db: Session, store_id: str) -> None:
    """Raise 404 when the requested store has no historical demand data."""
    has_data = db.query(DailyDemand.id).filter(DailyDemand.store_id == store_id).first()
    if not has_data:
        raise HTTPException(status_code=404, detail=f"No demand data found for store_id '{store_id}'")


def average_multiplier_across_all_categories(category_impacts: Dict[str, float], category_count: int) -> float:
    """Compute overall multiplier by treating missing categories as neutral (1.0)."""
    if category_count <= 0:
        return 1.0
    total = float(sum(category_impacts.values())) + float(category_count - len(category_impacts))
    return max(0.1, min(5.0, total / category_count))


def get_store_mix_weights(db: Session, days: int = 30, store_id: Optional[str] = None) -> Dict[str, Any]:
    """Build recent demand share weights by category and SKU for a store scope."""
    cutoff_date = datetime.now().date() - timedelta(days=days)

    category_query = db.query(
        DailyDemand.product_category,
        func.sum(DailyDemand.total_quantity).label("qty"),
    ).filter(DailyDemand.date >= cutoff_date)

    sku_query = db.query(
        DailyDemand.product_id,
        DailyDemand.product_category,
        func.sum(DailyDemand.total_quantity).label("qty"),
    ).filter(DailyDemand.date >= cutoff_date)

    if store_id:
        category_query = category_query.filter(DailyDemand.store_id == store_id)
        sku_query = sku_query.filter(DailyDemand.store_id == store_id)

    category_rows = category_query.group_by(DailyDemand.product_category).all()
    sku_rows = sku_query.group_by(DailyDemand.product_id, DailyDemand.product_category).all()

    total_units = float(sum(float(r.qty or 0.0) for r in sku_rows))
    if total_units <= 0:
        return {
            "total_units": 0.0,
            "category_share": {},
            "sku_share": {},
            "sku_to_category": {},
        }

    category_share: Dict[str, float] = {}
    for row in category_rows:
        code = row.product_category or ""
        if not code:
            continue
        category_share[code] = float(row.qty or 0.0) / total_units

    sku_share: Dict[str, float] = {}
    sku_to_category: Dict[str, str] = {}
    for row in sku_rows:
        sku = row.product_id
        if not sku:
            continue
        sku_share[sku] = float(row.qty or 0.0) / total_units
        if row.product_category:
            sku_to_category[sku] = row.product_category

    return {
        "total_units": total_units,
        "category_share": category_share,
        "sku_share": sku_share,
        "sku_to_category": sku_to_category,
    }


def extract_sku_mentions(scenario_text: str) -> Set[str]:
    """Extract explicit SKU mentions (e.g., SKU_GROC001) or product-name mentions."""
    text = scenario_text.strip()
    explicit = set(re.findall(r"\bSKU_[A-Z]+\d+\b", text.upper()))
    if explicit:
        return explicit

    lower_text = text.lower()
    mentions: Set[str] = set()
    try:
        propagator = get_gnn_propagator()
        if propagator and propagator.sku_to_name:
            for sku, name in propagator.sku_to_name.items():
                # Avoid very short / noisy names for matching.
                if name and len(name) >= 6 and name.lower() in lower_text:
                    mentions.add(sku)
                if len(mentions) >= 5:
                    break
    except Exception:
        return mentions
    return mentions


def compute_weighted_multiplier(
    llm_multiplier: float,
    category_impacts: Dict[str, float],
    scenario_scope: Dict[str, Any],
    mix: Dict[str, Any],
    sku_mentions: Set[str],
) -> float:
    """Compute total-demand multiplier using observed volume shares."""
    category_share: Dict[str, float] = mix.get("category_share", {})
    sku_share: Dict[str, float] = mix.get("sku_share", {})
    sku_to_category: Dict[str, str] = mix.get("sku_to_category", {})

    # SKU-focused: apply impact only to mentioned SKUs, rest remains neutral.
    if sku_mentions:
        weighted_delta = 0.0
        covered_share = 0.0
        for sku in sku_mentions:
            share = sku_share.get(sku, 0.0)
            if share <= 0:
                continue
            category = sku_to_category.get(sku)
            sku_multiplier = category_impacts.get(category, llm_multiplier)
            weighted_delta += share * (sku_multiplier - 1.0)
            covered_share += share

        if covered_share > 0:
            return max(0.1, min(5.0, 1.0 + weighted_delta))

    # Category-focused: weight only affected categories by their observed store share.
    if category_impacts and category_share:
        weighted_delta = 0.0
        covered_share = 0.0
        for category, category_multiplier in category_impacts.items():
            share = category_share.get(category, 0.0)
            if share <= 0:
                continue
            weighted_delta += share * (category_multiplier - 1.0)
            covered_share += share

        if covered_share > 0:
            return max(0.1, min(5.0, 1.0 + weighted_delta))

    # Fallback to LLM value if we cannot weight with data.
    return max(0.1, min(5.0, llm_multiplier))


def classify_scenario_scope(scenario_text: str) -> Dict[str, Any]:
    """Classify scenario as focused vs systemic and infer directly mentioned categories."""
    lower = scenario_text.lower()
    direct_categories: List[str] = []

    for code, keywords in CATEGORY_KEYWORDS.items():
        if any(keyword in lower for keyword in keywords):
            direct_categories.append(code)

    is_systemic = any(term in lower for term in SYSTEMIC_SCENARIO_TERMS)
    if len(direct_categories) >= 3:
        is_systemic = True

    return {
        "is_systemic": is_systemic,
        "direct_categories": sorted(set(direct_categories)),
    }


def apply_targeted_guardrails(
    scenario_scope: Dict[str, Any],
    affected_categories: List[str],
    category_impacts: Dict[str, float],
) -> tuple[List[str], Dict[str, float], Optional[str]]:
    """Limit spillover for focused scenarios to only directly referenced categories."""
    if scenario_scope["is_systemic"]:
        return affected_categories, category_impacts, None

    direct_categories = set(scenario_scope["direct_categories"])
    if not direct_categories:
        return affected_categories, category_impacts, None

    filtered_impacts = {k: v for k, v in category_impacts.items() if k in direct_categories}
    filtered_affected = [c for c in affected_categories if c in direct_categories]

    if filtered_impacts and not filtered_affected:
        filtered_affected = sorted(filtered_impacts.keys())

    note = "Guardrail applied: focused scenario limited to directly referenced categories."
    return filtered_affected, filtered_impacts, note


def analyze_scenario_with_ai(
    scenario_text: str,
    baseline_demand: float,
    db: Session,
    store_id: Optional[str] = None,
) -> Dict:
    """
    Use LLM to analyze a custom scenario and determine appropriate demand multiplier.
    The LLM reasons from economic first principles — no hardcoded scenario rules.

    Returns:
        {
            "multiplier": float,
            "reasoning": str,
            "confidence": int,
            "affected_categories": list[str],
            "category_impacts": dict,
        }
    """
    # All 24 store categories with human-readable names
    category_map = {
        "AUTO": "Automotive accessories",
        "BABC": "Baby Care products",
        "BAGL": "Bagels",
        "BEDM": "Bedding and Mattresses",
        "BEVG": "Beverages (water, juice, soda, energy drinks)",
        "BKDY": "Bakery items (bread, cakes, pastries)",
        "BOOK": "Books and magazines",
        "CLNS": "Cleaning Supplies (detergents, disinfectants)",
        "CLOT": "Clothing and apparel",
        "ELEC": "Consumer Electronics (phones, laptops, TVs)",
        "FRPR": "Fresh Produce and Dairy (vegetables, fruits, milk, cheese)",
        "FRZN": "Frozen Foods",
        "FTRW": "Footwear (shoes, boots)",
        "FURH": "Furniture (sofas, tables, chairs)",
        "GROC": "Groceries (packaged staples: rice, pasta, canned goods)",
        "JWCH": "Jewelry and Watches",
        "KICH": "Kitchenware (pots, pans, utensils)",
        "MEAT": "Meat and Seafood (fresh and processed)",
        "PETC": "Pet Care (food, accessories)",
        "PRSN": "Personal Care (shampoo, toothpaste, cosmetics)",
        "SNCK": "Snacks (chips, biscuits, chocolates)",
        "SPRT": "Sports and Outdoor equipment",
        "STOF": "Stationery and Office supplies",
        "TOYG": "Toys and Games",
    }

    try:
        import requests

        prompt = f"""You are an expert retail economist. A store manager has described a scenario and you must predict how it will affect demand across product categories.

STORE CATEGORIES (use only these exact codes):
{json.dumps(category_map, indent=2)}

SCENARIO: "{scenario_text}"
CURRENT BASELINE: {baseline_demand:.0f} units/day across all categories combined

YOUR TASK:
Step 1 — Identify which categories from the list above are logically and directly affected by this scenario. Think about what a consumer would actually buy or stop buying because of this event.
Step 2 — For each affected category, determine the demand multiplier using economic reasoning:

  NEGATIVE DEMAND RULES (multiplier < 1.0):
  - A tax, price hike, tariff, or surcharge makes things MORE expensive → people buy LESS
  - An economic downturn / recession / unemployment → luxury and discretionary goods (FURH, ELEC, JWCH, TOYG, CLOT, SPRT, FTRW) fall sharply; essentials (GROC, FRPR, MEAT) are stable or slightly down
  - Supply shortage / product unavailability → demand constrained
  - Magnitude matters: a 100% tax causes near-collapse (0.3–0.5), a 50% tax causes large drop (0.55–0.7), a 10% tax causes mild drop (0.85–0.92)

  POSITIVE DEMAND RULES (multiplier > 1.0):
  - A discount, subsidy, promotion, or sale → people buy MORE
  - Weather emergency (storm, flood, hurricane, heavy rain, snow) → panic-buying of essentials: FRPR, BKDY, BEVG, GROC, MEAT, CLNS spike sharply; non-essentials (FURH, ELEC, CLOT) drop as people stay home
  - Competitor closing / shutdown nearby → ALL categories get a mild-to-moderate lift (1.2–1.5) as displaced shoppers redirect here
  - Holidays / festivals (Christmas, Thanksgiving, Eid, Diwali, New Year) → food categories spike strongly (FRPR, BKDY, MEAT, GROC, BEVG, SNCK) and gift categories surge (TOYG, JWCH, CLOT, ELEC)
  - Back-to-school / university semester start → STOF, BOOK spike, CLOT and SNCK rise moderately
  - New housing development / population influx / new residential area → broad sustained lift across ALL categories (1.15–1.4), especially FURH, BEDM, KICH, CLNS
  - Payday week / salary bonus season / end-of-month → discretionary categories up (ELEC, CLOT, JWCH, SPRT, TOYG, SNCK, BEVG); essentials stable
  - Sports event / Super Bowl / World Cup / local match → SNCK, BEVG surge strongly; SPRT rises moderately
  - Government stimulus / cash handout / tax rebate → broad lift across all categories, stronger in mid-range discretionary
  - Local concert / festival / fair / large public event nearby → BEVG, SNCK, FRPR, PRSN rise; general foot traffic up
Step 3 — Compute overall_multiplier as the demand-weighted average across all categories (categories not in the list count as 1.0).
Step 4 — Set confidence (0–100) reflecting how certain you are. Be less confident for vague or unusual scenarios.

WAR / CONFLICT CONTEXT:
- If conflict/war is near the store, assume access disruption, curfews, migration, logistics friction, and safety concerns.
- For the affected store, this usually reduces on-site retail demand in most categories unless the scenario explicitly says population inflow or relief distribution at this store.

RULES:
- Only include categories that are genuinely affected. Do NOT add food/grocery categories to a car price scenario. Do NOT add automotive to a food price scenario.
- If the scenario affects ALL categories equally (e.g., competitor closure, general lockdown), return an empty affected_categories list and set overall_multiplier accordingly.
- Multiplier range: 0.1 (near-zero demand) to 5.0 (extreme spike). Most scenarios fall between 0.4 and 2.5.
- Your reasoning must explain WHY each category is affected, citing the specific economic mechanism.
- Keep reasoning direction consistent with multipliers: if most impacted categories are below 1.0, explain a demand decrease.

Respond ONLY with valid JSON, no markdown:
{{
  "affected_categories": ["CODE1", "CODE2"],
  "category_impacts": {{
    "CODE1": <float>,
    "CODE2": <float>
  }},
  "overall_multiplier": <float>,
  "reasoning": "<clear explanation of the economic mechanism driving these changes>",
  "confidence": <int 0-100>
}}"""

        response = requests.post(
            f"{OLLAMA_URL}/api/generate",
            json={
                "model": OLLAMA_MODEL,
                "prompt": prompt,
                "stream": False,
                "format": "json"
            },
            timeout=120
        )

        if response.status_code == 200:
            ai_response = response.json()
            result_text = ai_response.get("response", "{}")
            result = json.loads(result_text)
            scenario_scope = classify_scenario_scope(scenario_text)
            sku_mentions = extract_sku_mentions(scenario_text)
            mix = get_store_mix_weights(db, days=30, store_id=store_id)

            # Validate category codes — reject any code not in our known set
            valid_codes = set(category_map.keys())
            raw_impacts = result.get("category_impacts", {})
            category_impacts = {
                k: float(v)
                for k, v in raw_impacts.items()
                if k in valid_codes and isinstance(v, (int, float))
            }
            affected_categories = [c for c in result.get("affected_categories", []) if c in valid_codes]
            if category_impacts and not affected_categories:
                affected_categories = list(category_impacts.keys())

            if affected_categories and not category_impacts:
                for code in affected_categories:
                    category_impacts[code] = 1.0

            affected_categories, category_impacts, guardrail_note = apply_targeted_guardrails(
                scenario_scope,
                affected_categories,
                category_impacts,
            )

            llm_multiplier = float(result.get("overall_multiplier", 1.0))
            llm_multiplier = max(0.1, min(5.0, llm_multiplier))
            derived_multiplier = average_multiplier_across_all_categories(category_impacts, len(valid_codes))
            weighted_multiplier = compute_weighted_multiplier(
                llm_multiplier=llm_multiplier,
                category_impacts=category_impacts,
                scenario_scope=scenario_scope,
                mix=mix,
                sku_mentions=sku_mentions,
            )

            # Focused scenarios must follow focused category impacts to avoid cross-category leakage.
            if not scenario_scope["is_systemic"]:
                multiplier = weighted_multiplier
            # Prefer category-consistent multiplier if the LLM overall value is far from category impacts.
            elif category_impacts and abs(llm_multiplier - derived_multiplier) > 0.2:
                multiplier = weighted_multiplier
            else:
                multiplier = weighted_multiplier if category_impacts else llm_multiplier

            confidence = int(result.get("confidence", 70))
            confidence = max(0, min(100, confidence))

            raw_reasoning = result.get("reasoning", "AI analysis completed")
            reasoning = raw_reasoning
            if guardrail_note and affected_categories:
                focused_impacts = []
                for code in affected_categories:
                    impact = category_impacts.get(code)
                    if impact is None:
                        continue
                    delta = (impact - 1.0) * 100
                    sign = "+" if delta >= 0 else ""
                    focused_impacts.append(f"{category_map.get(code, code)} ({sign}{delta:.0f}%)")

                if focused_impacts:
                    scoped_summary = (
                        "Focused scenario detected. Demand impact is limited to directly referenced categories: "
                        + ", ".join(focused_impacts)
                        + "."
                    )
                    if raw_reasoning and raw_reasoning != "AI analysis completed":
                        reasoning = f"{raw_reasoning}\n\n{scoped_summary}"
                    else:
                        reasoning = scoped_summary

            if sku_mentions:
                reasoning += (
                    "\n\nVolume-aware weighting applied using recent store SKU shares for mentioned items."
                )
            elif category_impacts:
                reasoning += (
                    "\n\nVolume-aware weighting applied using recent store category shares."
                )

            if guardrail_note and reasoning and guardrail_note not in reasoning:
                reasoning = f"{reasoning}\n\n{guardrail_note}"

            return {
                "multiplier": multiplier,
                "reasoning": reasoning,
                "confidence": confidence,
                "affected_categories": affected_categories,
                "category_impacts": category_impacts,
                "is_systemic": scenario_scope["is_systemic"],
                "mentioned_skus": sorted(sku_mentions),
            }

        raise HTTPException(status_code=503, detail=f"AI simulation unavailable (status {response.status_code} from Ollama)")

    except Exception as e:
        print(f"AI analysis failed: {e}")

    raise HTTPException(
        status_code=503,
        detail=(
            f"AI simulation unavailable. Ensure Ollama is running at {OLLAMA_URL} "
            f"with model '{OLLAMA_MODEL}'."
        ),
    )


def apply_graph_propagation(db, category_impacts: Dict[str, float], propagate_neighbors: bool = True) -> Dict[str, float]:
    """
    Apply GNN graph propagation to translate category impacts to product-level impacts.
    
    Args:
        db: Database session
        category_impacts: Dict of category -> multiplier (e.g., {"FRPR": 1.5, "GROC": 1.3})
    
    Returns:
        Dict of SKU -> impact multiplier with graph-based propagation
    """
    try:
        # Get GNN propagator singleton
        propagator = get_gnn_propagator()
        
        if not propagator.graph_loaded:
            print("⚠️ GNN graph not loaded, skipping product-level propagation")
            return {}
        
        # Find directly affected SKUs based on categories
        affected_skus = []
        for category, multiplier in category_impacts.items():
            skus_in_category = propagator.find_skus_by_category(category)
            affected_skus.extend(skus_in_category)
        
        if not affected_skus:
            return {}
        
        # Calculate average multiplier for directly affected products
        avg_multiplier = sum(category_impacts.values()) / len(category_impacts)

        if propagate_neighbors:
            # Propagate impact through GNN graph (2 hops with 0.5 decay)
            product_impacts = propagator.propagate_impact(
                affected_skus=affected_skus,
                direct_multiplier=avg_multiplier,
                propagation_depth=2,
                decay_factor=0.5
            )
        else:
            # Focused shocks should not automatically spill into unrelated product neighborhoods.
            product_impacts = {sku: avg_multiplier for sku in affected_skus}
        
        # Apply category-specific multipliers to directly affected products
        for category, multiplier in category_impacts.items():
            skus = propagator.find_skus_by_category(category)
            for sku in skus:
                if sku in product_impacts:
                    product_impacts[sku] = multiplier  # Override with category-specific multiplier
        
        # Convert to dict with product names
        product_impacts_with_names = {}
        for sku, mult in product_impacts.items():
            product_impacts_with_names[sku] = {
                "multiplier": mult,
                "name": propagator.get_product_name(sku)
            }
        
        return product_impacts_with_names
        
    except Exception as e:
        print(f"Graph propagation failed: {e}")
        import traceback
        traceback.print_exc()
        return {}


def calculate_baseline_demand(db: Session, days: int = 30, store_id: Optional[str] = None) -> float:
    """Calculate baseline demand from recent historical data (total daily demand across all products)"""
    cutoff_date = datetime.now().date() - timedelta(days=days)
    
    # Get total demand per day, then average across days
    query_recent = db.query(
        DailyDemand.date,
        func.sum(DailyDemand.total_quantity).label('daily_total')
    ).filter(
        DailyDemand.date >= cutoff_date
    )
    if store_id:
        query_recent = query_recent.filter(DailyDemand.store_id == store_id)
    result = query_recent.group_by(DailyDemand.date).all()
    
    if result:
        # Calculate average daily total across all products
        avg_daily_demand = sum(row.daily_total for row in result) / len(result)
        return float(avg_daily_demand)
    
    # Fallback to all-time average if recent data not available
    query_all_time = db.query(
        DailyDemand.date,
        func.sum(DailyDemand.total_quantity).label('daily_total')
    )
    if store_id:
        query_all_time = query_all_time.filter(DailyDemand.store_id == store_id)
    result = query_all_time.group_by(DailyDemand.date).all()
    
    if result:
        avg_daily_demand = sum(row.daily_total for row in result) / len(result)
        return float(avg_daily_demand)
    
    return 1000.0  # Ultimate fallback


def calculate_risk_level(multiplier: float) -> str:
    """Determine risk level based on demand multiplier"""
    if multiplier >= 2.0:
        return "high"
    elif multiplier >= 1.3:
        return "medium"
    elif multiplier <= 0.7:
        return "medium"
    else:
        return "low"


def calculate_confidence(scenario_type: str) -> int:
    """Estimate confidence level for scenario prediction"""
    confidence_map = {
        "baseline": 95,
        "demand_spike": 85,
        "holiday": 80,
        "weather": 82,
        "demand_drop": 88,
        "combined": 75
    }
    return confidence_map.get(scenario_type, 85)


@router.post("/run", response_model=List[SimulationResult])
async def run_simulation(
    scenarios: Optional[List[SimulationScenario]] = None,
    db: Session = Depends(get_db)
):
    """
    Run what-if scenario simulations based on historical data.
    
    If no scenarios provided, returns default set of common scenarios.
    """
    
    # Get baseline demand from historical data
    baseline_demand = calculate_baseline_demand(db, days=30)
    
    # Default scenarios if none provided
    if not scenarios:
        scenarios = [
            SimulationScenario(
                scenario="Baseline",
                demand_multiplier=1.0,
                description="Current trend projection"
            ),
            SimulationScenario(
                scenario="Demand Spike +50%",
                demand_multiplier=1.5,
                description="Sudden demand increase"
            ),
            SimulationScenario(
                scenario="Holiday Season",
                demand_multiplier=1.8,
                holiday_effect=True,
                description="Holiday shopping surge"
            ),
            SimulationScenario(
                scenario="Weather Shock",
                demand_multiplier=1.2,
                weather_impact="storm",
                description="Adverse weather impact"
            ),
        ]
    
    results = []
    
    for scenario in scenarios:
        # Determine multiplier: use AI if custom_description provided, otherwise use explicit value
        ai_result = None
        if scenario.custom_description:
            # AI-powered analysis with graph awareness
            ai_result = analyze_scenario_with_ai(scenario.custom_description, baseline_demand, db, store_id=None)
            multiplier = ai_result["multiplier"]
            ai_reasoning = ai_result["reasoning"]
            confidence = ai_result["confidence"]
        elif scenario.demand_multiplier is not None:
            # Explicitly provided multiplier
            multiplier = scenario.demand_multiplier
            ai_reasoning = None
            
            # Determine scenario type for confidence
            scenario_type = "baseline"
            if "spike" in scenario.scenario.lower():
                scenario_type = "demand_spike"
            elif "holiday" in scenario.scenario.lower():
                scenario_type = "holiday"
            elif "weather" in scenario.scenario.lower():
                scenario_type = "weather"
            elif "drop" in scenario.scenario.lower():
                scenario_type = "demand_drop"
            
            confidence = calculate_confidence(scenario_type)
        else:
            # Default baseline
            multiplier = 1.0
            ai_reasoning = None
            confidence = 95
        
        # Add weather impact
        if scenario.weather_impact:
            multiplier *= 1.15
        
        # Add holiday boost
        if scenario.holiday_effect:
            multiplier *= 1.15
        
        # Apply GNN graph propagation if we have category impacts
        affected_products = {}
        if ai_result and ai_result.get("category_impacts"):
            affected_products = apply_graph_propagation(
                db,
                ai_result["category_impacts"],
                propagate_neighbors=ai_result.get("is_systemic", True),
            )
        
        projected_demand = int(baseline_demand * multiplier)
        risk = calculate_risk_level(multiplier)
        
        results.append(SimulationResult(
            scenario=scenario.scenario,
            demand=projected_demand,
            risk=risk,
            confidence=confidence,
            description=scenario.custom_description or getattr(scenario, 'description', scenario.scenario),
            ai_reasoning=ai_reasoning,
            affected_categories=ai_result.get("affected_categories") if ai_result else None,
            category_impacts=ai_result.get("category_impacts") if ai_result else None,
            affected_products=affected_products if affected_products else None,
            baseline_demand_used=baseline_demand,
            multiplier_used=multiplier,
            store_id=None
        ))
    
    return results


@router.get("/baseline", response_model=Dict[str, float])
async def get_baseline_metrics(
    days: int = 30,
    store_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Get baseline metrics for simulation reference.
    
    Returns average daily demand and trends from recent history.
    """
    normalized_store_id = normalize_store_id(store_id)
    if normalized_store_id:
        ensure_store_exists(db, normalized_store_id)

    cutoff_date = datetime.now().date() - timedelta(days=days)
    
    # Use same calculation as calculate_baseline_demand for consistency
    baseline_demand = calculate_baseline_demand(db, days, normalized_store_id)
    
    # Get daily totals for min/max calculation
    daily_totals_query = db.query(
        DailyDemand.date,
        func.sum(DailyDemand.total_quantity).label('daily_total')
    ).filter(
        DailyDemand.date >= cutoff_date
    )
    if normalized_store_id:
        daily_totals_query = daily_totals_query.filter(DailyDemand.store_id == normalized_store_id)
    daily_totals = daily_totals_query.group_by(DailyDemand.date).all()
    
    if not daily_totals:
        raise HTTPException(status_code=404, detail="No historical data available")
    
    totals = [row.daily_total for row in daily_totals]
    
    return {
        "avg_demand": baseline_demand,
        "min_demand": float(min(totals)),
        "max_demand": float(max(totals)),
        "data_points": len(daily_totals),
        "days_analyzed": days
    }


@router.post("/custom", response_model=SimulationResult)
async def run_custom_scenario(
    scenario_text: str,
    store_id: Optional[str] = None,
    db: Session = Depends(get_db)
):
    """
    Run AI-powered custom scenario simulation with GNN graph propagation.
    
    Analyst provides natural language scenario description,
    AI determines appropriate demand multiplier and affected categories,
    GNN propagates impacts through product relationships.
    
    Examples:
    - "Major snowstorm forecast for next week"
    - "Competitor in the area just closed permanently"
    - "Economic recession predicted by analysts"
    - "New housing development opening nearby with 500 families"
    """
    normalized_store_id = normalize_store_id(store_id) or extract_store_id_from_text(scenario_text)
    if normalized_store_id:
        ensure_store_exists(db, normalized_store_id)

    baseline_demand = calculate_baseline_demand(db, days=30, store_id=normalized_store_id)
    
    # Let AI analyze the scenario
    ai_result = analyze_scenario_with_ai(scenario_text, baseline_demand, db, store_id=normalized_store_id)
    
    multiplier = ai_result["multiplier"]
    projected_demand = int(baseline_demand * multiplier)
    risk = calculate_risk_level(multiplier)
    
    # Apply GNN graph propagation if we have category impacts
    affected_products = {}
    if ai_result.get("category_impacts"):
        affected_products = apply_graph_propagation(
            db,
            ai_result["category_impacts"],
            propagate_neighbors=ai_result.get("is_systemic", True),
        )
    
    return SimulationResult(
        scenario=scenario_text[:50] + "..." if len(scenario_text) > 50 else scenario_text,
        demand=projected_demand,
        risk=risk,
        confidence=ai_result["confidence"],
        affected_categories=ai_result.get("affected_categories"),
        category_impacts=ai_result.get("category_impacts"),
        affected_products=affected_products if affected_products else None,
        description=scenario_text,
        ai_reasoning=ai_result["reasoning"],
        baseline_demand_used=baseline_demand,
        multiplier_used=multiplier,
        store_id=normalized_store_id
    )

