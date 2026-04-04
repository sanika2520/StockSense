"""
GNN Insights API

Provides endpoints for:
- Product influence graph structure
- Node relationships and edge weights
- Product influence scores
- 3D visualization data
"""

from fastapi import APIRouter, HTTPException, Query
from typing import List, Dict, Optional, Literal, Set, Tuple
from pathlib import Path
import json
import random
from pydantic import BaseModel, Field

try:
    import torch
    TORCH_AVAILABLE = True
except ImportError:
    TORCH_AVAILABLE = False

router = APIRouter(prefix="/gnn", tags=["GNN"])

# Path to GNN model files
ML_DIR = Path(__file__).parent.parent.parent.parent / "ml"
MODELS_DIR = ML_DIR / "models" / "gnn"
DATA_DIR = ML_DIR / "data" / "raw"


class EdgeWeightBulkUpdateRequest(BaseModel):
    source_scope_type: Literal["sku", "category"]
    source_scope_value: str = Field(..., min_length=1)
    target_scope_type: Literal["sku", "category"]
    target_scope_value: str = Field(..., min_length=1)
    operation: Literal["set", "multiply", "add"] = "set"
    value: float
    min_clip: Optional[float] = 0.0
    max_clip: Optional[float] = 5.0
    exclude_self: bool = True
    dry_run: bool = False


def _resolve_scope_indices(
    scope_type: str,
    scope_value: str,
    sku_to_idx: Dict[str, int],
    idx_to_sku: Dict[int, str],
) -> Set[int]:
    """Resolve SKU/category scope into graph node indices."""
    if scope_type == "sku":
        sku = scope_value.strip().upper()
        if sku not in sku_to_idx:
            raise HTTPException(status_code=404, detail=f"SKU {sku} not found in graph")
        return {int(sku_to_idx[sku])}

    category = scope_value.strip().upper()
    matched_indices: Set[int] = set()
    for idx, sku in idx_to_sku.items():
        if get_product_category(sku).upper() == category:
            matched_indices.add(int(idx))

    if not matched_indices:
        raise HTTPException(status_code=404, detail=f"Category {category} not found in graph")

    return matched_indices


def _compute_updated_weight(old_weight: float, operation: str, value: float) -> float:
    if operation == "set":
        return value
    if operation == "multiply":
        return old_weight * value
    return old_weight + value


def load_graph_data():
    """Load GNN graph structure from saved files."""
    if not TORCH_AVAILABLE:
        print("Warning: torch is not available, GNN functionality disabled")
        return None
    
    try:
        # Load metadata
        metadata_file = MODELS_DIR / "graph_metadata.json"
        if metadata_file.exists():
            with open(metadata_file, 'r') as f:
                metadata = json.load(f)
        else:
            metadata = {}
        
        # Load SKU mappings
        sku_to_idx_file = MODELS_DIR / "sku_to_idx.pt"
        idx_to_sku_file = MODELS_DIR / "idx_to_sku.pt"
        
        if sku_to_idx_file.exists() and idx_to_sku_file.exists():
            sku_to_idx = torch.load(sku_to_idx_file)
            idx_to_sku = torch.load(idx_to_sku_file)
        else:
            return None
        
        # Load adjacency matrix
        adjacency_file = MODELS_DIR / "adjacency.pt"
        if adjacency_file.exists():
            adjacency = torch.load(adjacency_file)
        else:
            return None
        
        return {
            "metadata": metadata,
            "sku_to_idx": sku_to_idx,
            "idx_to_sku": idx_to_sku,
            "adjacency": adjacency
        }
    except Exception as e:
        print(f"Error loading graph data: {e}")
        return None


def get_product_category(sku: str) -> str:
    """Get category for a SKU (simplified extraction from SKU name)."""
    # Extract category prefix from SKU (e.g., SKU_BABC001 -> BABC)
    parts = sku.split('_')
    if len(parts) >= 2:
        category_code = ''.join([c for c in parts[1] if c.isalpha()])
        return category_code[:4] if len(category_code) >= 4 else category_code
    return "MISC"


@router.get("/graph-structure")
def get_graph_structure(
    limit: Optional[int] = Query(None, description="Limit number of nodes (for performance)"),
    min_edge_weight: Optional[float] = Query(0.1, description="Minimum edge weight to include")
):
    """
    Get the full GNN graph structure for visualization.
    
    Returns nodes and edges with weights for 3D graph rendering.
    """
    graph_data = load_graph_data()
    
    if not graph_data:
        raise HTTPException(status_code=404, detail="GNN graph data not found")
    
    adjacency = graph_data["adjacency"]
    idx_to_sku = graph_data["idx_to_sku"]
    metadata = graph_data.get("metadata", {})
    
    n_nodes = adjacency.shape[0]
    
    # Limit nodes if requested
    if limit and limit < n_nodes:
        selected_indices = list(range(min(limit, n_nodes)))
    else:
        selected_indices = list(range(n_nodes))
    
    # Build nodes list
    nodes = []
    for idx in selected_indices:
        sku = idx_to_sku[idx]
        category = get_product_category(sku)
        
        # Calculate node importance (sum of edge weights)
        node_strength = float(adjacency[idx].sum())
        
        nodes.append({
            "id": sku,
            "index": idx,
            "category": category,
            "strength": round(node_strength, 2),
            "label": sku
        })
    
    # Build edges list (only significant edges)
    edges = []
    for i in selected_indices:
        for j in selected_indices:
            if i < j:  # Avoid duplicates in undirected graph
                weight = float(adjacency[i, j])
                if weight >= min_edge_weight:
                    edges.append({
                        "source": idx_to_sku[i],
                        "target": idx_to_sku[j],
                        "weight": round(weight, 3)
                    })
    
    return {
        "nodes": nodes,
        "edges": edges,
        "total_nodes": n_nodes,
        "total_edges": len(edges),
        "metadata": {
            "min_edge_weight": min_edge_weight,
            "limit_applied": limit is not None,
            **metadata
        }
    }


@router.get("/product-influences/{sku}")
def get_product_influences(
    sku: str,
    top_k: int = Query(10, description="Number of top influences to return")
):
    """
    Get the most influential products for a given SKU.
    
    Returns products that have the strongest connections to the target SKU.
    """
    if not TORCH_AVAILABLE:
        raise HTTPException(status_code=503, detail="GNN functionality is not available (torch not installed)")
    
    graph_data = load_graph_data()
    
    if not graph_data:
        raise HTTPException(status_code=404, detail="GNN graph data not found")
    
    sku_to_idx = graph_data["sku_to_idx"]
    idx_to_sku = graph_data["idx_to_sku"]
    adjacency = graph_data["adjacency"]
    
    if sku not in sku_to_idx:
        raise HTTPException(status_code=404, detail=f"SKU {sku} not found in graph")
    
    target_idx = sku_to_idx[sku]
    
    # Get edge weights for this product
    connections = adjacency[target_idx]
    
    # Find top-k strongest connections
    top_indices = torch.argsort(connections, descending=True)[:top_k]
    
    influences = []
    for idx in top_indices:
        idx_val = int(idx)
        weight = float(connections[idx_val])
        
        if weight > 0:  # Only include actual connections
            influenced_sku = idx_to_sku[idx_val]
            influences.append({
                "sku": influenced_sku,
                "category": get_product_category(influenced_sku),
                "influence_weight": round(weight, 3),
                "influence_strength": round(weight * 100, 1)  # As percentage
            })
    
    return {
        "target_sku": sku,
        "category": get_product_category(sku),
        "total_connections": int((connections > 0).sum()),
        "influences": influences,
        "top_k": len(influences)
    }


@router.get("/product-neighbors/{sku}")
def get_product_neighbors(
    sku: str,
    depth: int = Query(1, ge=1, le=3, description="Depth of neighborhood (1-3)")
):
    """
    Get the neighborhood of products around a given SKU.
    
    Useful for understanding local graph structure.
    """
    graph_data = load_graph_data()
    
    if not graph_data:
        raise HTTPException(status_code=404, detail="GNN graph data not found")
    
    sku_to_idx = graph_data["sku_to_idx"]
    idx_to_sku = graph_data["idx_to_sku"]
    adjacency = graph_data["adjacency"]
    
    if sku not in sku_to_idx:
        raise HTTPException(status_code=404, detail=f"SKU {sku} not found in graph")
    
    target_idx = sku_to_idx[sku]
    
    # BFS to find neighbors at each depth
    visited = {target_idx}
    current_level = {target_idx}
    neighbors_by_depth = {0: [sku]}
    
    for d in range(1, depth + 1):
        next_level = set()
        for node_idx in current_level:
            # Find all connected nodes
            connections = adjacency[node_idx]
            connected_indices = (connections > 0).nonzero(as_tuple=True)[0]
            
            for neighbor_idx in connected_indices:
                neighbor_idx_val = int(neighbor_idx)
                if neighbor_idx_val not in visited:
                    next_level.add(neighbor_idx_val)
                    visited.add(neighbor_idx_val)
        
        neighbors_by_depth[d] = [idx_to_sku[idx] for idx in next_level]
        current_level = next_level
        
        if not current_level:
            break
    
    return {
        "target_sku": sku,
        "depth": depth,
        "neighbors_by_depth": neighbors_by_depth,
        "total_neighbors": len(visited) - 1  # Exclude target itself
    }


@router.get("/graph-statistics")
def get_graph_statistics():
    """
    Get overall statistics about the GNN graph.
    """
    graph_data = load_graph_data()
    
    if not graph_data:
        raise HTTPException(status_code=404, detail="GNN graph data not found")
    
    adjacency = graph_data["adjacency"]
    metadata = graph_data.get("metadata", {})
    
    n_nodes = adjacency.shape[0]
    
    # Calculate statistics
    total_edges = int((adjacency > 0).sum()) // 2  # Divide by 2 for undirected graph
    avg_degree = float((adjacency > 0).sum(dim=1).float().mean())
    max_degree = int((adjacency > 0).sum(dim=1).max())
    min_degree = int((adjacency > 0).sum(dim=1).min())
    
    # Edge weight statistics
    edge_weights = adjacency[adjacency > 0]
    avg_weight = float(edge_weights.mean())
    max_weight = float(edge_weights.max())
    min_weight = float(edge_weights.min())
    
    # Density
    max_possible_edges = n_nodes * (n_nodes - 1) / 2
    density = total_edges / max_possible_edges if max_possible_edges > 0 else 0
    
    return {
        "nodes": n_nodes,
        "edges": total_edges,
        "density": round(density, 4),
        "degree_stats": {
            "average": round(avg_degree, 2),
            "min": min_degree,
            "max": max_degree
        },
        "edge_weight_stats": {
            "average": round(avg_weight, 3),
            "min": round(min_weight, 3),
            "max": round(max_weight, 3)
        },
        "metadata": metadata
    }


@router.post("/edge-weights/bulk-update")
def bulk_update_edge_weights(request: EdgeWeightBulkUpdateRequest):
    """
    Bulk update edge weights between SKU/category scopes.

    Supports:
    - sku -> sku
    - sku -> category
    - category -> sku
    - category -> category
    """
    graph_data = load_graph_data()

    if not graph_data:
        raise HTTPException(status_code=404, detail="GNN graph data not found")

    adjacency = graph_data["adjacency"]
    sku_to_idx = graph_data["sku_to_idx"]
    idx_to_sku = graph_data["idx_to_sku"]

    if request.min_clip is not None and request.max_clip is not None and request.min_clip > request.max_clip:
        raise HTTPException(status_code=400, detail="min_clip cannot be greater than max_clip")

    source_indices = _resolve_scope_indices(
        request.source_scope_type,
        request.source_scope_value,
        sku_to_idx,
        idx_to_sku,
    )
    target_indices = _resolve_scope_indices(
        request.target_scope_type,
        request.target_scope_value,
        sku_to_idx,
        idx_to_sku,
    )

    unique_pairs: Set[Tuple[int, int]] = set()
    for src_idx in source_indices:
        for tgt_idx in target_indices:
            if request.exclude_self and src_idx == tgt_idx:
                continue
            i, j = (src_idx, tgt_idx) if src_idx <= tgt_idx else (tgt_idx, src_idx)
            unique_pairs.add((i, j))

    if not unique_pairs:
        raise HTTPException(status_code=400, detail="No edges matched the requested update scope")

    changed = 0
    unchanged = 0
    sample_updates = []

    for i, j in sorted(unique_pairs):
        old_weight = float(adjacency[i, j])
        new_weight = _compute_updated_weight(old_weight, request.operation, request.value)

        if request.min_clip is not None:
            new_weight = max(request.min_clip, new_weight)
        if request.max_clip is not None:
            new_weight = min(request.max_clip, new_weight)

        if abs(new_weight - old_weight) < 1e-12:
            unchanged += 1
            continue

        changed += 1
        if len(sample_updates) < 10:
            sample_updates.append({
                "source": idx_to_sku[i],
                "target": idx_to_sku[j],
                "old_weight": round(old_weight, 4),
                "new_weight": round(float(new_weight), 4),
            })

        if not request.dry_run:
            adjacency[i, j] = new_weight
            adjacency[j, i] = new_weight

    if changed == 0:
        return {
            "success": True,
            "dry_run": request.dry_run,
            "changed_edges": 0,
            "unchanged_edges": unchanged,
            "total_candidate_edges": len(unique_pairs),
            "message": "No edge weights changed for this request",
            "sample_updates": sample_updates,
        }

    if not request.dry_run:
        try:
            adjacency_file = MODELS_DIR / "adjacency.pt"
            torch.save(adjacency, adjacency_file)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"Failed to persist adjacency matrix: {e}")

    return {
        "success": True,
        "dry_run": request.dry_run,
        "changed_edges": changed,
        "unchanged_edges": unchanged,
        "total_candidate_edges": len(unique_pairs),
        "source_scope": {
            "type": request.source_scope_type,
            "value": request.source_scope_value.strip().upper(),
            "resolved_nodes": len(source_indices),
        },
        "target_scope": {
            "type": request.target_scope_type,
            "value": request.target_scope_value.strip().upper(),
            "resolved_nodes": len(target_indices),
        },
        "operation": request.operation,
        "value": request.value,
        "sample_updates": sample_updates,
        "message": (
            "Preview complete" if request.dry_run
            else "Edge weights updated and saved"
        ),
    }
