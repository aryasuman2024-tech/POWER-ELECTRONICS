# LabVIEW Virtual Instrument Integration Guide
**Project:** ESP32-Based Automated Cable Fault Detection and Localization System  
**Document:** NI-VISA Configuration, Front Panel Layout, Block Diagram Architecture, and Parsing Logic  
**Target Software:** National Instruments LabVIEW (2020 or later) with NI-VISA Driver  

---

## 1. Serial Communication Specification

| Parameter | Value | LabVIEW Constant / Setting |
| :--- | :--- | :--- |
| **Baud Rate** | $115200\text{ bps}$ | Numeric Constant: `115200` |
| **Data Bits** | `8` | Numeric Constant: `8` |
| **Parity** | `None` | Enum: `None (0)` |
| **Stop Bits** | `1.0` | Enum: `1.0 (10)` |
| **Flow Control** | `None` | Enum: `None (0)` |
| **Termination Character** | Line Feed (`\n`, `0x0A`) | ASCII `\n` Enabled (`True`) |
| **Timeout** | $2000\text{ ms}$ | Numeric Constant: `2000` |

---

## 2. Telemetry CSV Field Definitions

The ESP32 transmits a structured 10-column CSV line every $500\text{ ms}$:

```csv
timestamp,bridge_voltage,R1,R2,temperature,estimated_fault_distance,reference_fault_distance,distance_error,pot_position,status
```

### Field Specification Table

| Index | Field Name | Data Type | Units | Valid Range | LabVIEW Type |
| :---: | :--- | :---: | :---: | :---: | :---: |
| **0** | `timestamp` | Integer | $\text{ms}$ | $\ge 0$ | U32 / I32 |
| **1** | `bridge_voltage` | Float | $\text{V}$ | $-3.3000 \text{ to } +3.3000$ | DBL (Double) |
| **2** | `R1` | Float | $\Omega$ | $0.0 \text{ to } 10000.0$ | DBL (Double) |
| **3** | `R2` | Float | $\Omega$ | $0.0 \text{ to } 10000.0$ | DBL (Double) |
| **4** | `temperature` | Float | $^\circ\text{C}$ | $-20.0 \text{ to } 125.0$ | DBL (Double) |
| **5** | `estimated_fault_distance` | Float | $\text{m}$ | $0.0 \text{ to } L$ | DBL (Double) |
| **6** | `reference_fault_distance` | Float | $\text{m}$ | $0.0 \text{ to } L$ | DBL (Double) |
| **7** | `distance_error` | Float | $\text{m}$ | $\ge 0.0$ | DBL (Double) |
| **8** | `pot_position` | Integer | Step | $0 \text{ to } 128$ | I32 |
| **9** | `status` | String | — | `IDLE`, `SEARCHING`, `BALANCED`, `TIMEOUT_ERROR`, `SATURATION_ERROR` | String |

### Example Records
```csv
# Initial unbalanced search phase:
500,0.4812,1000.00,3200.00,28.50,0.000,4.000,4.000,88,SEARCHING
1000,0.1850,1000.00,1637.50,28.50,0.000,4.000,4.000,108,SEARCHING
# Converged null state:
2000,0.0084,1000.00,465.62,28.50,3.962,4.000,0.038,123,BALANCED
```

---

## 3. Front Panel Layout Blueprint

Design the LabVIEW Front Panel to mirror professional test laboratory instrumentation:

```
+--------------------------------------------------------------------------------------------------+
|  ESP32 CABLE FAULT DETECTION & LOCALIZATION VIRTUAL INSTRUMENT                     [RUN] [STOP]  |
+--------------------------------------------------------------------------------------------------+
| [PORT CONFIG]                  | [FAULT LOCALIZATION MAP]              | [SYSTEM STATUS ALARMS]   |
| VISA Resource: [ COM3       v] | Cable Length: [ 10.00 ] m             | ( ) BALANCED (Green LED) |
| Baud Rate:     [ 115200     v] | ESTIMATED DIST: [ 3.962 ] m           | ( ) SEARCHING (Yel LED)  |
| Acquisition:   [ START / STOP] | REFERENCE DIST: [ 4.000 ] m           | ( ) FAULT/ERROR (Red LED)|
| Log to File:   [ ON / OFF    ] | ABSOLUTE ERROR: [ 0.038 ] m           | Pot Wiper: [ 123 / 128 ] |
| File Path:     [ C:\logs\... ] | PERCENT ERROR:  [  0.95 ] %           | Status: [ BALANCED     ] |
+--------------------------------+---------------------------------------+--------------------------+
| [WAVEFORM CHARTS]                                                                                |
| 1. Bridge Voltage Vout (V) vs Time (s)       | 2. Bridge Resistance R1 / R2 (Ohm) vs Time        |
|    +---------------------------------------+ |    +---------------------------------------+      |
|    |      /\                               | |    |                                       |      |
|    | ----/--\----------------------------  | |    | ===================================== |      |
|    +---------------------------------------+ |    +---------------------------------------+      |
| 3. Cable / Ambient Temperature (°C)         | 4. Measurement History Table                      |
|    +---------------------------------------+ |    Timestamp | Vout | R2 | Dist | Error | Status  |
|    | ~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~ | |    2000 ms   | 8 mV | 465| 3.96m| 0.03m | OK      |
|    +---------------------------------------+ |    2500 ms   | 8 mV | 465| 3.96m| 0.03m | OK      |
+--------------------------------------------------------------------------------------------------+
```

### Front Panel Controls & Indicators Checklist
1. **VISA Resource Name Control:** Dropdown to select active COM port.
2. **Boolean Toggle ("Acquisition"):** Mechanical action: *Switch when pressed*.
3. **Numeric Indicators:**
   - `Estimated Fault Distance (m)` (Digital meter with high-contrast font).
   - `Absolute Error (m)` and `Percentage Error (%)`.
   - `Bridge Voltage Vout (V)`.
   - `Bridge Arm R1 (Ohm)` and `Bridge Arm R2 (Ohm)`.
   - `MCP4131 Pot Step (0..128)` (Horizontal pointer slide gauge).
   - `Cable Temperature (°C)` (Thermometer indicator).
4. **Boolean Indicators (LEDs):**
   - Green Round LED (`Bridge Balanced`).
   - Yellow Round LED (`Searching / In Progress`).
   - Red Round LED (`System Error / Saturation`).
5. **Waveform Charts:**
   - Chart 1: `Bridge Output Voltage (V)` (Y-scale: $-0.5\text{V}$ to $+2.5\text{V}$).
   - Chart 2: `Arm Resistances R1 & R2 (\Omega)`.
   - Chart 3: `Conductor Temperature (°C)`.
6. **File I/O Controls:**
   - File Path Control: Destination `.csv` or `.tdms` log file.
   - Boolean Button: `Log Enable`.

---

## 4. Block Diagram Architecture: Producer / Consumer Design Pattern

To prevent buffer overflow and UI lag during 115200-baud continuous acquisition, use the **Producer/Consumer (Queue-Based) Pattern**:

```
[Loop 1: Producer (High-Priority VISA DAQ)]
  VISA Read (until '\n') ---> Enqueue Element (Raw CSV String) ---> [Queue]
                                                                      |
[Loop 2: Consumer (UI Update, Parsing & Logging)]                     |
  [Queue] ---> Dequeue Element ---> Scan From String ---> Parse Fields
                                              |
                  +---------------------------+---------------------------+
                  |                           |                           |
            Update Front Panel         Write to File            Statistical Engine
            (Charts, Meters, LEDs)     (CSV Data Logger)        (Mean, StdDev, % Err)
```

---

## 5. LabVIEW VIs and Implementation Steps

### Step 1: Initialize VISA Connection
1. Place `VISA Configure Serial Port.vi` on the block diagram.
2. Wire inputs:
   - `VISA resource name` $\leftarrow$ Front panel COM control.
   - `baud rate` $\leftarrow$ `115200`.
   - `data bits` $\leftarrow$ `8`.
   - `parity` $\leftarrow$ `0 (None)`.
   - `stop bits` $\leftarrow$ `10 (1.0)`.
   - `Enable Termination Char` $\leftarrow$ `True`.
   - `Termination Char` $\leftarrow$ `0x0A` (`\n`).
   - `timeout value` $\leftarrow$ `2000 ms`.
3. Place `VISA Set I/O Buffer Size.vi` and set receive buffer to `4096 bytes`.

### Step 2: Read and Parse Telemetry
1. In the acquisition loop, place `VISA Read.vi`. Wire `byte count` to `1024` (with termination enabled, it automatically returns on `\n`).
2. Wire the output string into `Scan From String.vi`.
3. Set the `format string` parameter to:
   ```
   %d,%f,%f,%f,%f,%f,%f,%f,%d,%s
   ```
4. Output pins from `Scan From String`:
   - Output 1 $\rightarrow$ `Timestamp (ms)`
   - Output 2 $\rightarrow$ `Vout (V)`
   - Output 3 $\rightarrow$ `R1 (Ohm)`
   - Output 4 $\rightarrow$ `R2 (Ohm)`
   - Output 5 $\rightarrow$ `Temperature (°C)`
   - Output 6 $\rightarrow$ `Estimated Distance (m)`
   - Output 7 $\rightarrow$ `Reference Distance (m)`
   - Output 8 $\rightarrow$ `Distance Error (m)`
   - Output 9 $\rightarrow$ `Pot Position`
   - Output 10 $\rightarrow$ `Status String`

### Step 3: LED Status Demultiplexing
Place a `Case Structure` wired to `Status String`:
- `"BALANCED"`: Green LED = `True`, Red LED = `False`, Yellow LED = `False`.
- `"SEARCHING"`: Green LED = `False`, Red LED = `False`, Yellow LED = `True`.
- `"TIMEOUT_ERROR"` or `"SATURATION_ERROR"`: Green LED = `False`, Red LED = `True`, Yellow LED = `False`.

### Step 4: Statistical Analysis Engine
1. Feed `Distance Error (m)` and `Estimated Distance (m)` into a 20-sample circular array buffer.
2. Use `Standard Deviation and Variance.vi` to compute live measurement jitter $\sigma$.
3. Display `Mean Distance` and `Standard Deviation` on the front panel.

### Step 5: File Logging
1. When `Log Enable` is `True`, pass the parsed CSV string into `Write to Text File.vi` with automatic file creation and append mode.
2. Write header line when file is first opened:
   `timestamp,bridge_voltage,R1,R2,temperature,estimated_fault_distance,reference_fault_distance,distance_error,pot_position,status`

### Step 6: Shutdown & Error Handling
1. Wire the `Error Cluster` from all VIs into `Simple Error Handler.vi`.
2. When the Stop button is clicked:
   - Place `VISA Close.vi` to release the COM port cleanly.
   - Release the queue using `Release Queue.vi`.
