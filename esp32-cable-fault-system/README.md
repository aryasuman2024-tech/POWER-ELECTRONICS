# ESP32-Based Automated Cable Fault Detection and Localization System

**Academic Course:** Measurement & Instrumentation / Electrical & Electronics Engineering  
**Project Authors:** Suyash Tatiya (24BEE0087), Gopika Rathi (24BEE0062), Arya Suman (24BEE0032)  
**System Architecture:** ESP32 + SPI Digital Potentiometer (MCP4131) + LM358N Signal Conditioning + NTC Thermal Compensation + Virtual Instrument Dashboard + LabVIEW Integration  

---

## 1. Project Overview

Underground power and distribution cables are subject to mechanical stress, moisture ingress, thermal cycling, and insulation degradation, leading to phase-to-ground faults and short circuits. While fault detection indicates that a line has failed, **precise localization** is critical to avoid expensive, destructive excavation and minimize downtime.

This software simulation and engineering suite provides:
1. **Mathematical & Electrical Model:** Simulates the complete electrical behaviour of the Wheatstone bridge, discrete 10-tap cable ladder ($10 \times 100\ \Omega = 1\text{ k}\Omega$), MCP4131 digital potentiometer, LM358N difference amplifier, thermal drift, and 12-bit ADC quantization.
2. **Production-Ready ESP32 Firmware (`.ino`):** Modular, non-blocking Arduino C++ code featuring dual operating modes (Simulation Mode & Physical Hardware Mode), automated null balancing with bracket convergence detection, temperature compensation, and structured 115200-baud CSV telemetry.
3. **Interactive Virtual Instrument Browser Dashboard:** A professional test equipment interface with live controls, interactive cable map, real-time oscilloscopes, status annunciator LEDs, measurement history table, CSV export, and optional Web Serial API support for physical ESP32 plug-and-play.
4. **Automated Validation Test Suite:** Python test runner executing 15 rigorous test scenarios (unbalanced bridge, null convergence, boundary conditions, noise, temperature variation, malformed data) with 100% passing results.
5. **LabVIEW Integration Architecture:** A complete step-by-step implementation blueprint for recreating the Virtual Instrument in NI LabVIEW with NI-VISA serial parsing, producer/consumer pattern, and statistical analysis.

---

## 2. Project Directory Structure

```
esp32-cable-fault-system/
├── README.md                          # Comprehensive guide, test instructions, and circuit analysis
├── docs/
│   ├── circuit_analysis.md            # Part 1: Hardware schematic breakdown, component table, pinouts & critique
│   ├── mathematical_model.md          # Part 2: Rigorous electrical equations, bridge physics, op-amp & ADC models
│   ├── murray_loop_analysis.md        # Part 4 & 5: Murray-Loop derivations, cable topologies, and thermal physics
│   └── labview_integration_guide.md   # Part 8: NI-VISA setup, VI front panel, producer/consumer block diagram
├── firmware/
│   └── esp32_cable_fault_system/
│       └── esp32_cable_fault_system.ino # Part 3: Production ESP32 Arduino firmware (Simulation & Hardware modes)
├── dashboard/
│   ├── index.html                     # Part 6: Virtual instrument test bench web application
│   ├── styles.css                     # High-end laboratory equipment UI styling (dark graphite theme)
│   ├── simulation_engine.js           # Full electrical simulation math engine in JavaScript
│   └── app.js                         # Dashboard controller, canvas scopes, CSV exporter, Web Serial API
├── tests/
│   ├── run_automated_tests.py         # Part 9: Automated validation test suite (15 scenarios)
│   └── test_telemetry_parser.py       # Part 7: Telemetry CSV parser verification & corruption tests
└── data/
    └── sample_telemetry.csv           # Part 7: Documented example telemetry dataset from ESP32
```

---

## 3. Quick Start Guide: Running Locally

### 3.1 Running the Virtual Instrument Dashboard
No build tools, Node.js, or complex installations are required. The dashboard runs locally in any modern browser (Chrome, Edge, Firefox):

**Option A (Direct File Open):**
- Double-click `dashboard/index.html` to open it directly in your web browser.

**Option B (Local HTTP Server - Recommended for Web Serial API):**
Open a terminal in the project directory and run:
```bash
python -m http.server 8000 --directory dashboard
```
Then navigate to `http://localhost:8000` in your browser.

**Interactive Controls on the Dashboard:**
- Click **"⚡ Start Auto-Balance"** to watch the algorithm seek bridge equilibrium in real time.
- Adjust **Cable Length**, **Fault Distance**, and **Ambient Temperature** sliders to observe instantaneous physical changes in bridge imbalance voltage and estimated distance.
- Toggle **"Clear Fault (Relay OFF)" / "Inject Fault (Relay ON)"** to simulate healthy vs faulted cable lines.
- Click **"Export CSV"** to download logged telemetry records.
- In Chrome/Edge, click **"Connect ESP32"** to stream live measurements directly from physical hardware over USB!

---

### 3.2 Running the Automated Validation Tests
Ensure Python 3 is installed. Open a terminal in the `tests/` folder:

```bash
cd tests
python run_automated_tests.py
python test_telemetry_parser.py
```

All 15 automated validation tests and 10 telemetry parser tests will execute and print detailed results:
```
================================================================================
ESP32 AUTOMATED CABLE FAULT LOCALIZATION - 15 VALIDATION TEST CASES
================================================================================
#    | Test Scenario                | Measured / Output        | Expected Criterion | Status
----------------------------------------------------------------------------------------
1    | 1. Initially Unbalanced      | Vdiff = 2.059 V          | Vdiff > 0.5 V      | [PASS]
2    | 2. Successful Balancing      | Step=124, Lf=3.88m       | BALANCED, Err<0.5m | [PASS]
3    | 3. Convergence Failure       | Status=TIMEOUT_ERROR     | TIMEOUT_ERROR      | [PASS]
4    | 4. Min Pot Setting (w=0)     | R_pot = 10075.0 Ohm      | 10075.0 Ohm        | [PASS]
5    | 5. Max Pot Setting (w=128)   | R_pot = 75.0 Ohm         | 75.0 Ohm           | [PASS]
6    | 6. Fault at Beginning (0m)   | Step=128, Lf=0.00m       | Step >= 125        | [PASS]
7    | 7. Fault at Middle (5m)      | Lf=5.44m, Err=0.44m      | Err < 0.6m         | [PASS]
8    | 8. Fault Near Far End (9.5m) | Lf=10.00m, Err=0.50m     | Err < 0.6m         | [PASS]
9    | 9. Scale Length (L=50m)      | Lf=19.38m, Err=0.62m     | Err < 2.5m (5%)    | [PASS]
10   | 10. Fault Resistance (50 Ohm) | R_pot=465.6 Ohm          | R_pot > 380 Ohm    | [PASS]
11   | 11. Temp Drift (50 deg C)    | Comp Lf=4.24m            | Err < 0.6m         | [PASS]
12   | 12. Noise (3mV Gaussian)     | Lf=3.88m, Err=0.12m      | Err < 0.8m         | [PASS]
13   | 13. Bounds / Invalid Param   | Rejected invalid bounds  | Safe Rejection     | [PASS]
14   | 14. Malformed CSV Handling   | Corrupt line rejected    | Graceful Error     | [PASS]
15   | 15. Missing/NaN Handling     | NaN detected & flagged   | Flagged Error      | [PASS]
----------------------------------------------------------------------------------------

OVERALL RESULT: ALL 15 TESTS PASSED (15/15)
```

---

### 3.3 Flashing the ESP32 Firmware

1. Install the [Arduino IDE](https://www.arduino.cc/en/software) (version 2.0+).
2. Install the ESP32 board package:
   - Go to **Tools &rarr; Board &rarr; Boards Manager**.
   - Search for `esp32` by Espressif Systems and click **Install**.
3. Select your board: **Tools &rarr; Board &rarr; esp32 &rarr; ESP32 Dev Module**.
4. Open `firmware/esp32_cable_fault_system/esp32_cable_fault_system.ino`.
5. Select Operating Mode:
   - For standalone software demonstration: keep `#define SIMULATION_MODE 1`.
   - For real physical hardware deployment: change to `#define SIMULATION_MODE 0`.
6. Connect your ESP32 board via USB, select the COM port under **Tools &rarr; Port**, and click **Upload**.
7. Open the Arduino **Serial Monitor** at **115200 Baud** to observe the real-time CSV telemetry.

---

## 4. Hardware Pin Mapping Table

| Component | Pin Function | ESP32 GPIO | Electrical Notes |
| :--- | :--- | :--- | :--- |
| **MCP4131 Digital Pot** | CS (Chip Select) | `GPIO 5` | Active LOW SPI select |
| **MCP4131 Digital Pot** | SCK (SPI Clock) | `GPIO 18` | Hardware VSPI clock |
| **MCP4131 Digital Pot** | SDI (MOSI) | `GPIO 23` | Hardware VSPI data line |
| **5V Relay Module** | IN (Relay Trigger) | `GPIO 26` | Switches ground fault to tap #4 |
| **LM358N Op-Amp** | Pin 1 ($V_{out}$) | `GPIO 34` | ADC1_CH6 (Input-only analog pin) |
| **NTC Thermistor** | Voltage Divider Node | `GPIO 35` | ADC1_CH7 (Input-only analog pin) |
| **Green Status LED** | Balanced Indicator | `GPIO 21` | Connected via $330\ \Omega$ current limiter |
| **Red Status LED** | Fault / Error Indicator | `GPIO 22` | Connected via $330\ \Omega$ current limiter |
| **Yellow Status LED**| Searching / Null Seeking | `GPIO 19` | Connected via $330\ \Omega$ current limiter |

---

## 5. Critical Engineering Insights & Viva Defense Notes

When presenting this project to professors and examiners, highlighting these technical nuances will demonstrate genuine electrical engineering depth:

1. **The LM358N Single-Supply Limitation:**  
   In the circuit diagram, the LM358 difference amplifier is powered from single-supply $3.3\text{V}$ and $\text{GND}$ ($0\text{V}$). A standard difference amplifier output is $V_{out} = V_B - V_A$. When $V_B < V_A$, the ideal voltage is negative, but a single-supply op-amp cannot swing below ground ($V_{OL} \approx 10\text{ mV}$).  
   *Defense Explanation:* In our simulation and firmware, we document this constraint and show that referencing the non-inverting ground resistor to $V_{ref} = 1.65\text{V}$ ($V_{CC}/2$) creates a bidirectional bipolar offset output centered at $1.65\text{V}$, allowing true signed null tracking.

2. **Digital Potentiometer Discretization & Wiper Parasitics:**  
   The MCP4131 has 128 steps across $10\text{ k}\Omega$, producing a discrete step size of $\approx 78.1\ \Omega$. Furthermore, it has an internal parasitic wiper resistance $R_W \approx 75\ \Omega$. Setting a balance threshold tighter than this quantization step width will cause continuous oscillation. Our firmware solves this with **bracket convergence detection** that detects when adjacent steps sandwich the true null and selects the optimum wiper position.

3. **Field Murray Loop vs. Breadboard Resistor Ladder:**  
   Classical Murray Loop testing uses two parallel cables of length $L$ shorted at the far end (total loop $2L$), yielding $L_f = \frac{2L \cdot R_2}{R_1 + R_2}$. The physical educational breadboard rig models a single cable line on Node A balanced against the digital pot on Node B ($L_f = \frac{R_{pot}}{R_{cable}} \times L$). Our software engine rigorously explains and supports both formulations.

4. **Thermal Drift Correction:**  
   Under uniform loop temperature, thermal drift cancels out of pure Murray resistance ratios. However, when calculating absolute conductor distance from measured resistance, temperature compensation via $R(T) = R_0 [1 + \alpha(T - T_0)]$ is critical—preventing up to $\approx 8\%$ localization error over seasonal temperature swings ($25^\circ\text{C}$ to $45^\circ\text{C}$).
