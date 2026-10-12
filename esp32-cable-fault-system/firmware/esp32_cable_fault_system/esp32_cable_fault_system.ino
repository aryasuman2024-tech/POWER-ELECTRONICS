/**
 * ============================================================================
 * PROJECT: ESP32-Based Automated Cable Fault Detection & Localization System
 * ============================================================================
 * Target Microcontroller: ESP32 Dev Board (ESP-WROOM-32 / NodeMCU-32S)
 * Author: Electrical & Electronics Engineering Project Team
 * Reference Schematic: power electronics.jpeg
 * Reference Presentation: presentation_v2.pptx
 * 
 * Hardware Pin Mapping:
 *  - GPIO 5  : SPI Chip Select (CS) for MCP4131 Digital Potentiometer
 *  - GPIO 18 : SPI Clock (SCK) for MCP4131
 *  - GPIO 23 : SPI Master-Out-Slave-In (SDI/MOSI) for MCP4131
 *  - GPIO 26 : Relay Control Input (5V Fault Injection Module)
 *  - GPIO 34 : ADC1_CH6 Input (Conditioned Bridge Voltage Vout from LM358N Pin 1)
 *  - GPIO 35 : ADC1_CH7 Input (NTC Thermistor Voltage Divider Node)
 *  - GPIO 21 : Green Status LED (Bridge Balanced / System OK)
 *  - GPIO 22 : Red Status LED (Fault Detected / System Error)
 *  - GPIO 19 : Yellow Status LED (Balancing in Progress / Warning)
 * 
 * Communication:
 *  - Serial: 115200 Baud over USB
 *  - Structured CSV Telemetry every 500 ms
 * ============================================================================
 */

#include <Arduino.h>
#include <SPI.h>
#include <math.h>

// ============================================================================
// 1. CONFIGURATION & OPERATING MODE SELECTION
// ============================================================================
// Set to 1 for software simulation (runs without external hardware attached)
// Set to 0 for real physical hardware deployment with ESP32 ADC & MCP4131 SPI
#define SIMULATION_MODE 1

// Serial Baud Rate
const unsigned long SERIAL_BAUD_RATE = 115200;

// Telemetry and Balancing Timing Intervals
const unsigned long TELEMETRY_INTERVAL_MS = 500;  // Telemetry stream period
const unsigned long STEP_INTERVAL_MS      = 60;   // Interval between pot adjustments
const unsigned long BALANCE_TIMEOUT_MS    = 8000; // Maximum time allowed to seek balance

// Pin Definitions
const int PIN_SPI_CS     = 5;   // MCP4131 CS
const int PIN_SPI_SCK    = 18;  // MCP4131 SCK
const int PIN_SPI_MOSI   = 23;  // MCP4131 SDI
const int PIN_RELAY      = 26;  // 5V Relay Fault Injection
const int PIN_ADC_BRIDGE = 34;  // LM358N Pin 1 (Vout)
const int PIN_ADC_NTC    = 35;  // NTC Thermistor Divider
const int PIN_LED_GREEN  = 21;  // Status LED: Balanced / OK
const int PIN_LED_RED    = 22;  // Status LED: Fault / Error
const int PIN_LED_YELLOW = 19;  // Status LED: Searching / Warning

// Cable & Physical Constants
const float DEFAULT_CABLE_LENGTH       = 10.0f;     // Total cable length in metres
const float NOMINAL_CABLE_RESISTANCE   = 1000.0f;   // 10x 100-ohm ladder = 1000 ohms
const float COPPER_ALPHA               = 0.00393f;  // Temperature coefficient (1/°C)
const float REFERENCE_TEMP_C           = 25.0f;     // Reference calibration temperature (°C)
const float BRIDGE_EXCITATION_V        = 3.3f;      // VDD bridge supply voltage
const float R_TOP_BRIDGE               = 1000.0f;   // 1 kOhm precision top arm resistor

// MCP4131 Specifications
const int   MCP4131_STEPS              = 128;       // 7-bit resolution (0 to 128)
const int   POT_MIN                    = 0;
const int   POT_MAX                    = 128;
const float MCP4131_RAB_OHMS           = 10000.0f;  // 10 kOhm end-to-end nominal
const float MCP4131_RWIPER_OHMS        = 75.0f;     // Parasitic wiper resistance

// NTC Thermistor Specifications (10k NTC with 10k Divider)
const float NTC_R0_OHMS                = 10000.0f;  // Resistance at 25°C
const float NTC_T0_KELVIN              = 298.15f;   // 25°C in Kelvin
const float NTC_BETA                   = 3950.0f;   // Beta parameter
const float NTC_R_DIVIDER_OHMS         = 10000.0f;  // Fixed resistor to ground

// Balancing Control Limits
#if SIMULATION_MODE
const float BALANCE_THRESHOLD_V        = 0.050f;    // 50 mV threshold (Presentation Slide 10)
#else
const float BALANCE_THRESHOLD_V        = 0.065f;    // 65 mV threshold on hardware (accounts for 78 ohm pot step width)
#endif
const int   MAX_SEARCH_STEPS           = 200;       // Max adjustment iterations

// ============================================================================
// 2. SYSTEM STATE VARIABLES
// ============================================================================
enum SystemStatus {
  SYS_IDLE,
  SYS_SEARCHING,
  SYS_BALANCED,
  SYS_TIMEOUT_ERROR,
  SYS_SATURATION_ERROR,
  SYS_OUT_OF_RANGE_ERROR
};

SystemStatus currentStatus = SYS_IDLE;

// Simulated Physical Environment (Configurable)
float simulatedCableLength   = DEFAULT_CABLE_LENGTH;
float simulatedFaultDistance = 4.0f;    // Default: tap #4 (40% of cable)
float simulatedFaultResistance = 0.0f;  // Bolted ground fault
float simulatedTemperature   = 28.5f;   // Ambient temperature in °C
bool  simulatedRelayActive   = true;    // Fault injected via relay

// Live Measurement & Derived Variables
int   currentPotPosition     = 0;
int   stepCount              = 0;
float measuredBridgeVoltage  = 0.0f;
float measuredTemperature    = 25.0f;
float calculatedR1           = 1000.0f;
float calculatedR2           = 0.0f;
float estimatedFaultDistance = 0.0f;
float referenceFaultDistance = 4.0f;
float distanceErrorAbs       = 0.0f;
float distanceErrorPct       = 0.0f;
int   bestPotPosition        = 64;
float minAbsBridgeVoltage    = 999.0f;
int   previousPotPosition    = -1;

// Timers
unsigned long lastStepTimestamp      = 0;
unsigned long lastTelemetryTimestamp = 0;
unsigned long balanceStartTimestamp  = 0;

// ============================================================================
// 3. FUNCTION DECLARATIONS
// ============================================================================
void initialiseSystem();
float readBridgeVoltage();
float readTemperature();
bool setMCP4131(int position);
void selectCableTestPath(bool injectFault);
void autoBalanceBridge();
bool calculateFaultDistance();
bool applyTemperatureCompensation(float rawR1, float rawR2, float &compR1, float &compR2);
void sendTelemetry();
void checkSystemErrors();
void updateStatusLeds();
float computePotResistance(int step);
int computeIdealBalanceStep(float targetResistance);

// ============================================================================
// 4. FUNCTION IMPLEMENTATIONS
// ============================================================================

/**
 * Converts MCP4131 wiper step (0-128) into equivalent resistance (POA to Wiper).
 * As wired in the schematic: POA -> Node B, Wiper -> GND.
 * Step 0 = 10k + Rw, Step 128 = 0 + Rw.
 */
float computePotResistance(int step) {
  step = constrain(step, POT_MIN, POT_MAX);
  float ratio = (float)(POT_MAX - step) / (float)POT_MAX;
  return (MCP4131_RAB_OHMS * ratio) + MCP4131_RWIPER_OHMS;
}

/**
 * Calculates the theoretical step needed to match a target resistance.
 */
int computeIdealBalanceStep(float targetResistance) {
  if (targetResistance <= MCP4131_RWIPER_OHMS) return POT_MAX;
  if (targetResistance >= (MCP4131_RAB_OHMS + MCP4131_RWIPER_OHMS)) return POT_MIN;
  float fraction = (targetResistance - MCP4131_RWIPER_OHMS) / MCP4131_RAB_OHMS;
  int step = (int)roundf((1.0f - fraction) * (float)POT_MAX);
  return constrain(step, POT_MIN, POT_MAX);
}

/**
 * System Initialisation: Configures GPIOs, SPI bus, ADC, and initial states.
 */
void initialiseSystem() {
  // Status LEDs
  pinMode(PIN_LED_GREEN, OUTPUT);
  pinMode(PIN_LED_RED, OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  digitalWrite(PIN_LED_GREEN, LOW);
  digitalWrite(PIN_LED_RED, LOW);
  digitalWrite(PIN_LED_YELLOW, LOW);

  // Relay Control Pin
  pinMode(PIN_RELAY, OUTPUT);
  selectCableTestPath(simulatedRelayActive);

  // ADC Inputs
  pinMode(PIN_ADC_BRIDGE, INPUT);
  pinMode(PIN_ADC_NTC, INPUT);
  analogReadResolution(12); // ESP32 12-bit ADC (0 - 4095)

  // SPI Initialisation for MCP4131
  pinMode(PIN_SPI_CS, OUTPUT);
  digitalWrite(PIN_SPI_CS, HIGH); // CS active LOW
  SPI.begin(PIN_SPI_SCK, -1, PIN_SPI_MOSI, PIN_SPI_CS);

  // Set Potentiometer to baseline initial position
  currentPotPosition = 64; // Mid-scale
  setMCP4131(currentPotPosition);

  currentStatus = SYS_IDLE;
  updateStatusLeds();
}

/**
 * Sends a 16-bit command over SPI to set the MCP4131 wiper position.
 * MCP4131 Protocol: Address 0x00 (Volatile Wiper 0) + Command 00 (Write) + Data (0..128)
 */
bool setMCP4131(int position) {
  if (position < POT_MIN || position > POT_MAX) {
    return false;
  }
  currentPotPosition = position;

#if !SIMULATION_MODE
  // Hardware SPI Transfer
  SPI.beginTransaction(SPISettings(1000000, MSBFIRST, SPI_MODE0));
  digitalWrite(PIN_SPI_CS, LOW);
  // Byte 1: Address 0x00 (bits 7-4), Command Write 0b00 (bits 3-2), data MSB (bits 1-0)
  byte cmdByte = 0x00 | ((position >> 8) & 0x01);
  byte dataByte = (byte)(position & 0xFF);
  SPI.transfer(cmdByte);
  SPI.transfer(dataByte);
  digitalWrite(PIN_SPI_CS, HIGH);
  SPI.endTransaction();
#endif

  return true;
}

/**
 * Controls the Fault Injection Relay (GPIO 26).
 */
void selectCableTestPath(bool injectFault) {
  simulatedRelayActive = injectFault;
  // Many 5V relay modules are active-LOW, some active-HIGH. We assert HIGH for active.
  digitalWrite(PIN_RELAY, injectFault ? HIGH : LOW);
}

/**
 * Reads and converts bridge differential voltage.
 * In Simulation Mode: Evaluates the exact physics of the Wheatstone bridge.
 * In Hardware Mode: Reads ADC GPIO 34 (LM358N conditioned difference signal).
 */
float readBridgeVoltage() {
#if SIMULATION_MODE
  // 1. Calculate Cable Resistance with Temperature Drift
  float tempFactor = 1.0f + COPPER_ALPHA * (simulatedTemperature - REFERENCE_TEMP_C);
  float cableNominal = NOMINAL_CABLE_RESISTANCE * tempFactor;

  // 2. Determine Equivalent Cable Resistance to GND based on fault state
  float rCableToGnd;
  if (!simulatedRelayActive) {
    // Healthy cable: Full 1000 ohms to ground
    rCableToGnd = cableNominal;
  } else {
    // Faulted cable at simulatedFaultDistance
    float faultFraction = constrain(simulatedFaultDistance / simulatedCableLength, 0.0f, 1.0f);
    float rFaultSection = faultFraction * cableNominal;
    float rRemaining = (1.0f - faultFraction) * cableNominal;
    
    // Bottom end is grounded; fault connects to ground via simulatedFaultResistance
    if (simulatedFaultResistance <= 0.001f) {
      rCableToGnd = rFaultSection; // Bolted fault bypasses remaining section
    } else {
      float parallelSection = (simulatedFaultResistance * rRemaining) / 
                             (simulatedFaultResistance + rRemaining);
      rCableToGnd = rFaultSection + parallelSection;
    }
  }

  // 3. Node A Voltage: 3.3V * (rCableToGnd / (R_TOP_BRIDGE + rCableToGnd))
  float VA = BRIDGE_EXCITATION_V * (rCableToGnd / (R_TOP_BRIDGE + rCableToGnd));

  // 4. Node B Voltage: 3.3V * (rPot / (R_TOP_BRIDGE + rPot))
  float rPot = computePotResistance(currentPotPosition);
  float VB = BRIDGE_EXCITATION_V * (rPot / (R_TOP_BRIDGE + rPot));

  // 5. Differential Bridge Output (VB - VA)
  float rawDiff = VB - VA;

  // Return theoretical signed differential for simulated null tracking
  return rawDiff;

#else
  // Hardware Mode: Read ESP32 ADC on GPIO 34
  // 12-bit ADC: 0..4095 corresponds to 0..3.3V
  int rawAdc = analogRead(PIN_ADC_BRIDGE);
  float voltage = ((float)rawAdc / 4095.0f) * BRIDGE_EXCITATION_V;
  return voltage;
#endif
}

/**
 * Reads ambient/cable temperature via the NTC Thermistor divider.
 * In Simulation Mode: Returns simulatedTemperature with minor noise.
 * In Hardware Mode: Measures GPIO 35, calculates thermistor resistance and Steinhart-Hart equation.
 */
float readTemperature() {
#if SIMULATION_MODE
  return simulatedTemperature;
#else
  int rawAdc = analogRead(PIN_ADC_NTC);
  if (rawAdc <= 0) return -40.0f;
  if (rawAdc >= 4095) return 125.0f;

  float vNtc = ((float)rawAdc / 4095.0f) * BRIDGE_EXCITATION_V;
  // Divider: 3.3V -> NTC -> GPIO35 -> 10k -> GND
  // vNtc = 3.3 * (10000 / (Rntc + 10000)) => Rntc = 10000 * (3.3 / vNtc - 1)
  if (vNtc <= 0.001f) return 125.0f;
  float rNtc = NTC_R_DIVIDER_OHMS * ((BRIDGE_EXCITATION_V / vNtc) - 1.0f);

  // Steinhart-Hart B-parameter equation:
  // 1/T = 1/T0 + (1/B) * ln(R / R0)
  float steinhart = (1.0f / NTC_T0_KELVIN) + (1.0f / NTC_BETA) * logf(rNtc / NTC_R0_OHMS);
  float tempKelvin = 1.0f / steinhart;
  float tempCelsius = tempKelvin - 273.15f;

  return tempCelsius;
#endif
}

/**
 * Temperature Compensation: Corrects raw conductor resistance to reference 25°C.
 */
bool applyTemperatureCompensation(float rawR1, float rawR2, float &compR1, float &compR2) {
  float tempFactor = 1.0f + COPPER_ALPHA * (measuredTemperature - REFERENCE_TEMP_C);

  if (!isfinite(tempFactor) || tempFactor <= 0.1f || tempFactor >= 2.0f) {
    return false;
  }

  compR1 = rawR1 / tempFactor;
  compR2 = rawR2 / tempFactor;

  return isfinite(compR1) && isfinite(compR2) && compR1 > 0.0f && compR2 > 0.0f;
}

/**
 * Murray-Loop Fault Localization:
 * Evaluates: Lf = (2 * L * R2) / (R1 + R2)
 */
bool calculateFaultDistance() {
  float compR1 = 0.0f;
  float compR2 = 0.0f;

  if (!applyTemperatureCompensation(calculatedR1, calculatedR2, compR1, compR2)) {
    return false;
  }

  float denominator = compR1 + compR2;
  if (denominator <= 0.0f) {
    return false;
  }

  // Murray loop distance calculation
  estimatedFaultDistance = (2.0f * simulatedCableLength * compR2) / denominator;

  // Clamp to valid cable boundary [0, L]
  estimatedFaultDistance = constrain(estimatedFaultDistance, 0.0f, simulatedCableLength);

  // Error metrics
  referenceFaultDistance = simulatedRelayActive ? simulatedFaultDistance : simulatedCableLength;
  distanceErrorAbs = fabsf(estimatedFaultDistance - referenceFaultDistance);

  if (referenceFaultDistance > 0.001f) {
    distanceErrorPct = (distanceErrorAbs / referenceFaultDistance) * 100.0f;
  } else {
    distanceErrorPct = 0.0f;
  }

  return isfinite(estimatedFaultDistance);
}

/**
 * Automatic Bridge Balancing Logic:
 * Uses iterative null-seeking control loop with timeout and convergence detection.
 */
void autoBalanceBridge() {
  if (currentStatus == SYS_BALANCED || 
      currentStatus == SYS_TIMEOUT_ERROR || 
      currentStatus == SYS_SATURATION_ERROR) {
    return;
  }

  currentStatus = SYS_SEARCHING;
  updateStatusLeds();

  measuredBridgeVoltage = readBridgeVoltage();
  float absV = fabsf(measuredBridgeVoltage);

  // Track the minimum voltage step observed
  if (absV < minAbsBridgeVoltage) {
    minAbsBridgeVoltage = absV;
    bestPotPosition = currentPotPosition;
  }

  // Check convergence criterion: |Vout| <= BALANCE_THRESHOLD_V
  if (absV <= BALANCE_THRESHOLD_V) {
    // Bridge equilibrium achieved!
    calculatedR1 = R_TOP_BRIDGE;
    calculatedR2 = computePotResistance(currentPotPosition);

    if (calculateFaultDistance()) {
      currentStatus = SYS_BALANCED;
    } else {
      currentStatus = SYS_OUT_OF_RANGE_ERROR;
    }
    updateStatusLeds();
    return;
  }

  // Check timeout protection
  if ((millis() - balanceStartTimestamp) > BALANCE_TIMEOUT_MS) {
    if (minAbsBridgeVoltage <= (BALANCE_THRESHOLD_V * 1.5f)) {
      // Settle on the closest quantization step
      currentPotPosition = bestPotPosition;
      setMCP4131(currentPotPosition);
      calculatedR1 = R_TOP_BRIDGE;
      calculatedR2 = computePotResistance(currentPotPosition);
      calculateFaultDistance();
      currentStatus = SYS_BALANCED;
    } else {
      currentStatus = SYS_TIMEOUT_ERROR;
    }
    updateStatusLeds();
    return;
  }

  // Check iteration limit
  if (stepCount >= MAX_SEARCH_STEPS) {
    currentStatus = SYS_TIMEOUT_ERROR;
    updateStatusLeds();
    return;
  }

  // Directional step adjustment
  // In our bridge: Vout = VB - VA.
  // Increasing potPosition decreases R_pot, which lowers VB.
  // Decreasing potPosition increases R_pot, which raises VB.
  int nextPotPosition = currentPotPosition;
  if (measuredBridgeVoltage > 0.0f) {
    // VB is too high -> need to lower R_pot -> increase potPosition
    if (currentPotPosition < POT_MAX) {
      nextPotPosition++;
    } else {
      currentStatus = SYS_SATURATION_ERROR;
      updateStatusLeds();
      return;
    }
  } else {
    // VB is too low -> need to raise R_pot -> decrease potPosition
    if (currentPotPosition > POT_MIN) {
      nextPotPosition--;
    } else {
      currentStatus = SYS_SATURATION_ERROR;
      updateStatusLeds();
      return;
    }
  }

  // Bracket / Oscillation Detection: if we bounce back to previous position,
  // we have bracketed the true null between two adjacent steps!
  if (nextPotPosition == previousPotPosition) {
    currentPotPosition = bestPotPosition;
    setMCP4131(currentPotPosition);
    calculatedR1 = R_TOP_BRIDGE;
    calculatedR2 = computePotResistance(currentPotPosition);
    calculateFaultDistance();
    currentStatus = SYS_BALANCED;
    updateStatusLeds();
    return;
  }

  previousPotPosition = currentPotPosition;
  currentPotPosition = nextPotPosition;
  setMCP4131(currentPotPosition);
  stepCount++;
}

/**
 * Checks system state for errors and boundary conditions.
 */
void checkSystemErrors() {
  if (isnan(measuredBridgeVoltage) || isnan(measuredTemperature)) {
    currentStatus = SYS_OUT_OF_RANGE_ERROR;
    updateStatusLeds();
  }
}

/**
 * Updates physical status LEDs based on system state.
 * GPIO 21: Green  (Balanced / Normal)
 * GPIO 22: Red    (Error / Fault Active)
 * GPIO 19: Yellow (Searching / Null Seeking)
 */
void updateStatusLeds() {
  switch (currentStatus) {
    case SYS_BALANCED:
      digitalWrite(PIN_LED_GREEN, HIGH);
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(PIN_LED_YELLOW, LOW);
      break;

    case SYS_SEARCHING:
      digitalWrite(PIN_LED_GREEN, LOW);
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(PIN_LED_YELLOW, HIGH);
      break;

    case SYS_TIMEOUT_ERROR:
    case SYS_SATURATION_ERROR:
    case SYS_OUT_OF_RANGE_ERROR:
      digitalWrite(PIN_LED_GREEN, LOW);
      digitalWrite(PIN_LED_RED, HIGH);
      digitalWrite(PIN_LED_YELLOW, LOW);
      break;

    case SYS_IDLE:
    default:
      digitalWrite(PIN_LED_GREEN, LOW);
      digitalWrite(PIN_LED_RED, LOW);
      digitalWrite(PIN_LED_YELLOW, LOW);
      break;
  }
}

/**
 * Prints standard CSV telemetry header.
 */
void printCSVHeader() {
  Serial.println(
    "timestamp,bridge_voltage,R1,R2,temperature,"
    "estimated_fault_distance,reference_fault_distance,"
    "distance_error,pot_position,status"
  );
}

/**
 * Transmits structured CSV telemetry record over USB Serial at 115200 baud.
 */
void sendTelemetry() {
  const char* statusStr = "IDLE";
  switch (currentStatus) {
    case SYS_BALANCED:            statusStr = "BALANCED"; break;
    case SYS_SEARCHING:           statusStr = "SEARCHING"; break;
    case SYS_TIMEOUT_ERROR:       statusStr = "TIMEOUT_ERROR"; break;
    case SYS_SATURATION_ERROR:    statusStr = "SATURATION_ERROR"; break;
    case SYS_OUT_OF_RANGE_ERROR:  statusStr = "OUT_OF_RANGE_ERROR"; break;
    default:                      statusStr = "IDLE"; break;
  }

  float r2ToReport = computePotResistance(currentPotPosition);

  Serial.print(millis());
  Serial.print(",");
  Serial.print(measuredBridgeVoltage, 4);
  Serial.print(",");
  Serial.print(calculatedR1, 2);
  Serial.print(",");
  Serial.print(r2ToReport, 2);
  Serial.print(",");
  Serial.print(measuredTemperature, 2);
  Serial.print(",");
  Serial.print(estimatedFaultDistance, 3);
  Serial.print(",");
  Serial.print(referenceFaultDistance, 3);
  Serial.print(",");
  Serial.print(distanceErrorAbs, 3);
  Serial.print(",");
  Serial.print(currentPotPosition);
  Serial.print(",");
  Serial.println(statusStr);
}

// ============================================================================
// 5. ARDUINO SETUP & LOOP
// ============================================================================

void setup() {
  Serial.begin(SERIAL_BAUD_RATE);
  delay(500);

  Serial.println();
  Serial.println("# ========================================================");
  Serial.println("# ESP32 Cable Fault Detection & Localization System");
#if SIMULATION_MODE
  Serial.println("# MODE: SOFTWARE SIMULATION (Mathematical Physics Model)");
#else
  Serial.println("# MODE: PHYSICAL HARDWARE (Live ADC, SPI, Relay & LEDs)");
#endif
  Serial.println("# Telemetry: 115200 Baud, 500 ms Interval");
  Serial.println("# ========================================================");

  initialiseSystem();
  measuredTemperature = readTemperature();
  measuredBridgeVoltage = readBridgeVoltage();

  // Print telemetry CSV Header for LabVIEW and Dashboard
  printCSVHeader();

  // Initiate automatic balancing sequence
  currentStatus = SYS_SEARCHING;
  stepCount = 0;
  balanceStartTimestamp = millis();
  updateStatusLeds();
}

void loop() {
  unsigned long currentMillis = millis();

  // 1. Periodic Bridge Balancing Step
  if (currentStatus == SYS_SEARCHING && 
      (currentMillis - lastStepTimestamp >= STEP_INTERVAL_MS)) {
    lastStepTimestamp = currentMillis;
    autoBalanceBridge();
  }

  // 2. Periodic Telemetry Transmission
  if (currentMillis - lastTelemetryTimestamp >= TELEMETRY_INTERVAL_MS) {
    lastTelemetryTimestamp = currentMillis;
    measuredTemperature = readTemperature();
    measuredBridgeVoltage = readBridgeVoltage();
    checkSystemErrors();
    sendTelemetry();
  }
}
