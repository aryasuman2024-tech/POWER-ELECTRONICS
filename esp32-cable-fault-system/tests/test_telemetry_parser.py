#!/usr/bin/env python3
"""
Unit tests for ESP32 Cable Fault Detection CSV Telemetry Parser.
Verifies parsing of standard streams, rejection of malformed lines, and handling of edge cases.
"""

import sys

def parse_telemetry_line(line):
    """
    Parses a single line of CSV telemetry from the ESP32.
    Expected format:
    timestamp,bridge_voltage,R1,R2,temperature,estimated_fault_distance,reference_fault_distance,distance_error,pot_position,status
    """
    line = line.strip()
    if not line or line.startswith('#'):
        return None  # Comment or blank line
    
    parts = [p.strip() for p in line.split(',')]
    if len(parts) != 10:
        return {"valid": False, "error": f"Expected 10 fields, got {len(parts)}"}

    # Check header
    if parts[0].lower() in ["timestamp", "timestamp_ms"]:
        return {"valid": False, "is_header": True}

    try:
        record = {
            "valid": True,
            "timestamp_ms": int(float(parts[0])),
            "bridge_voltage": float(parts[1]),
            "R1": float(parts[2]),
            "R2": float(parts[3]),
            "temperature": float(parts[4]),
            "estimated_fault_distance": float(parts[5]),
            "reference_fault_distance": float(parts[6]),
            "distance_error": float(parts[7]),
            "pot_position": int(float(parts[8])),
            "status": parts[9].upper()
        }
    except ValueError as e:
        return {"valid": False, "error": f"Numerical conversion error: {e}"}

    # Range and validity checks
    if record["timestamp_ms"] < 0:
        return {"valid": False, "error": "Negative timestamp"}
    if record["R1"] <= 0 or record["R2"] < 0:
        return {"valid": False, "error": "Non-physical resistance values"}
    if not (0 <= record["pot_position"] <= 128):
        return {"valid": False, "error": "Potentiometer position outside 0..128 range"}
    valid_statuses = {"IDLE", "SEARCHING", "BALANCED", "TIMEOUT_ERROR", "SATURATION_ERROR", "OUT_OF_RANGE_ERROR", "ERROR"}
    if record["status"] not in valid_statuses:
        return {"valid": False, "error": f"Unknown status: {record['status']}"}

    return record


def test_parser():
    print("=== RUNNING TELEMETRY PARSER TESTS ===")
    test_cases = [
        # 1. Normal valid balanced line
        ("2000,0.0084,1000.00,465.62,28.50,3.962,4.000,0.038,123,BALANCED", True),
        # 2. Searching line
        ("500,0.4812,1000.00,3200.00,28.50,0.000,4.000,4.000,88,SEARCHING", True),
        # 3. Header line (should be ignored gracefully)
        ("timestamp,bridge_voltage,R1,R2,temperature,estimated_fault_distance,reference_fault_distance,distance_error,pot_position,status", False),
        # 4. Incomplete line (missing fields)
        ("1000,0.1850,1000.00,1637.50,28.50", False),
        # 5. Non-numeric corrupt field
        ("1500,CORRUPT_VOLT,1000.00,856.25,28.50,0.000,4.000,4.000,118,SEARCHING", False),
        # 6. Pot position out of bounds (position 150)
        ("2000,0.0084,1000.00,465.62,28.50,3.962,4.000,0.038,150,BALANCED", False),
        # 7. Invalid status
        ("2000,0.0084,1000.00,465.62,28.50,3.962,4.000,0.038,123,MAGIC_STATUS", False),
        # 8. Extra whitespace resilience
        (" 3000 , 0.0050 , 1000.00 , 450.00 , 29.00 , 4.010 , 4.000 , 0.010 , 122 , BALANCED ", True),
        # 9. Comment line
        ("# This is a comment from firmware", None),
        # 10. Negative resistance
        ("2000,0.0084,-100.00,465.62,28.50,3.962,4.000,0.038,123,BALANCED", False)
    ]

    passed = 0
    total = len(test_cases)
    for idx, (raw, expected_valid) in enumerate(test_cases, 1):
        res = parse_telemetry_line(raw)
        if expected_valid is None:
            ok = (res is None)
        elif expected_valid is True:
            ok = (res is not None and res.get("valid") is True)
        else:
            ok = (res is not None and res.get("valid") is False)
        
        status_msg = "PASS" if ok else "FAIL"
        if ok:
            passed += 1
        print(f"Test {idx:02d}: [{status_msg}] Input: '{raw[:50]}...' -> {res.get('error') if res and not res.get('valid') else 'Parsed OK' if res and res.get('valid') else 'Skipped'}")

    print(f"\nParser Test Summary: {passed}/{total} tests passed ({passed/total*100:.1f}%)")
    return passed == total

if __name__ == "__main__":
    success = test_parser()
    sys.exit(0 if success else 1)
