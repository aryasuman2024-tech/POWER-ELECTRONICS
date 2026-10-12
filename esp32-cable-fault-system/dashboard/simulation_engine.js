/**
 * ============================================================================
 * ESP32 CABLE FAULT DETECTION - ELECTRICAL SIMULATION ENGINE
 * ============================================================================
 * Full mathematical and electrical modeling of:
 *  - Wheatstone Bridge with 1 kOhm precision top arms
 *  - Discrete 10-tap Simulated Cable Ladder (100 ohms/segment, 1000 ohms total)
 *  - MCP4131 7-bit SPI Digital Potentiometer (128 steps, Rw = 75 ohms)
 *  - LM358N Difference Amplifier with single-supply saturation limits
 *  - Conductor resistance temperature drift (Copper: alpha = 0.00393, Aluminum: alpha = 0.00403)
 *  - NTC 10k thermistor divider with Steinhart-Hart / Beta equation
 *  - ESP32 12-bit SAR ADC quantization & Gaussian noise
 *  - Non-oscillating bracket convergence null-seeking algorithm
 *  - Classical Murray-Loop and direct resistor ladder fault localization
 * ============================================================================
 */

class CableFaultSimulationEngine {
  constructor() {
    // Physical & Circuit Constants
    this.BRIDGE_SUPPLY_V = 3.3;        // Regulated 3.3V rail
    this.R_TOP_BRIDGE = 1000.0;        // 1 kOhm precision 1% metal film
    this.R_CABLE_NOMINAL = 1000.0;     // 10x 100-ohm ladder
    this.MCP4131_RAB = 10000.0;        // 10 kOhm end-to-end
    this.MCP4131_RWIPER = 75.0;        // Parasitic internal wiper resistance
    this.MCP4131_MAX_STEPS = 128;      // 7-bit resolution (0..128)
    this.REFERENCE_TEMP_C = 25.0;      // 25°C baseline
    this.BALANCE_THRESHOLD_V = 0.050;  // 50 mV threshold (Presentation Slide 10)

    // Configurable Parameters
    this.cableLength = 10.0;           // Total length in metres
    this.faultDistance = 4.0;          // Reference fault distance in metres
    this.faultResistance = 0.0;        // Bolted fault (0 ohms) to high-R fault
    this.temperature = 28.5;           // Conductor/ambient temperature in °C
    this.conductorMaterial = 'copper'; // 'copper' or 'aluminum'
    this.relayActive = true;           // True = fault injected; False = healthy cable
    this.noiseEnabled = true;          // Include ADC noise & quantization
    this.noiseSigma = 0.0025;          // 2.5 mV Gaussian noise

    // State Variables
    this.potPosition = 64;             // Current wiper position (0..128)
    this.status = 'IDLE';              // IDLE, SEARCHING, BALANCED, TIMEOUT_ERROR, SATURATION_ERROR
    this.stepCount = 0;
    this.maxSteps = 200;
    this.bestStep = 64;
    this.minAbsVoltage = 999.0;
    this.previousStep = -1;
    this.history = [];
    this.maxHistory = 100;
  }

  getAlpha() {
    return this.conductorMaterial === 'aluminum' ? 0.00403 : 0.00393;
  }

  /**
   * Computes MCP4131 active resistance (POA to Wiper)
   */
  getPotResistance(step) {
    const clampedStep = Math.max(0, Math.min(this.MCP4131_MAX_STEPS, step));
    const ratio = (this.MCP4131_MAX_STEPS - clampedStep) / this.MCP4131_MAX_STEPS;
    return (this.MCP4131_RAB * ratio) + this.MCP4131_RWIPER;
  }

  /**
   * Computes NTC thermistor resistance and divider voltage
   */
  getNtcModel(tempC) {
    const T0 = 298.15;
    const Beta = 3950.0;
    const R0 = 10000.0;
    const T_kelvin = tempC + 273.15;
    const rNtc = R0 * Math.exp(Beta * (1.0 / T_kelvin - 1.0 / T0));
    const vNtc = this.BRIDGE_SUPPLY_V * (10000.0 / (rNtc + 10000.0));
    return { rNtc, vNtc };
  }

  /**
   * Evaluates the electrical state of the Wheatstone bridge
   */
  calculateState() {
    // 1. Temperature-dependent total cable resistance
    const alpha = this.getAlpha();
    const tempFactor = 1.0 + alpha * (this.temperature - this.REFERENCE_TEMP_C);
    const totalCableR = this.R_CABLE_NOMINAL * tempFactor;

    // 2. Equivalent cable resistance from Node A to Ground
    let rCableGnd;
    if (!this.relayActive) {
      rCableGnd = totalCableR;
    } else {
      const faultFraction = Math.max(0.0, Math.min(1.0, this.faultDistance / this.cableLength));
      const rFaultSection = faultFraction * totalCableR;
      const rRemSection = (1.0 - faultFraction) * totalCableR;

      if (this.faultResistance <= 0.001) {
        // Bolted fault bypasses remaining section
        rCableGnd = rFaultSection;
      } else {
        const rParallel = (this.faultResistance * rRemSection) / (this.faultResistance + rRemSection);
        rCableGnd = rFaultSection + rParallel;
      }
    }

    // 3. Node A Voltage: VA = 3.3 * (rCableGnd / (1000 + rCableGnd))
    const VA = this.BRIDGE_SUPPLY_V * (rCableGnd / (this.R_TOP_BRIDGE + rCableGnd));

    // 4. Node B Voltage: VB = 3.3 * (rPot / (1000 + rPot))
    const rPot = this.getPotResistance(this.potPosition);
    const VB = this.BRIDGE_SUPPLY_V * (rPot / (this.R_TOP_BRIDGE + rPot));

    // 5. Differential Bridge Imbalance Voltage
    let vDiff = VB - VA;

    // Add Gaussian noise and 12-bit ADC quantization if enabled
    if (this.noiseEnabled) {
      const u1 = Math.random();
      const u2 = Math.random();
      const randStdNormal = Math.sqrt(-2.0 * Math.log(u1 || 0.0001)) * Math.sin(2.0 * Math.PI * u2);
      vDiff += randStdNormal * this.noiseSigma;
    }

    // 6. LM358 Single-Supply Saturation Model (VOL ~ 10mV, VOH ~ 2.1V)
    const vOpampConditioned = Math.max(0.010, Math.min(2.10, vDiff));

    // 7. ADC 12-bit Quantization (LSB = 3.3V / 4096 = 0.806 mV)
    const adcCounts = Math.round((Math.max(0, Math.min(3.3, vOpampConditioned)) / 3.3) * 4095);
    const vAdcMeasured = (adcCounts / 4095) * 3.3;

    // 8. Distance estimation
    const rTotalComp = this.R_CABLE_NOMINAL * tempFactor;
    let estimatedDistance = 0.0;
    if (this.status === 'BALANCED') {
      estimatedDistance = (rPot / rTotalComp) * this.cableLength;
      estimatedDistance = Math.max(0.0, Math.min(this.cableLength, estimatedDistance));
    }

    const refDistance = this.relayActive ? this.faultDistance : this.cableLength;
    const absError = Math.abs(estimatedDistance - refDistance);
    const pctError = (refDistance > 0.001 && this.status === 'BALANCED')
      ? (absError / refDistance) * 100.0
      : 0.0;

    const ntcInfo = this.getNtcModel(this.temperature);

    return {
      timestamp: Date.now(),
      VA,
      VB,
      vDiff,
      vOpampConditioned,
      vAdcMeasured,
      adcCounts,
      rCableGnd,
      rPot,
      r1: this.R_TOP_BRIDGE,
      r2: rPot,
      temperature: this.temperature,
      ntcVoltage: ntcInfo.vNtc,
      ntcResistance: ntcInfo.rNtc,
      potPosition: this.potPosition,
      status: this.status,
      estimatedDistance,
      referenceDistance: refDistance,
      absError,
      pctError,
      stepCount: this.stepCount
    };
  }

  /**
   * Executes a single step of the automated null-seeking loop
   */
  stepBalancing() {
    if (this.status === 'BALANCED' || this.status.includes('ERROR')) {
      return this.calculateState();
    }

    this.status = 'SEARCHING';
    const state = this.calculateState();
    const absV = Math.abs(state.vDiff);

    // Track minimum imbalance
    if (absV < this.minAbsVoltage) {
      this.minAbsVoltage = absV;
      this.bestStep = this.potPosition;
    }

    // Exact threshold satisfaction
    if (absV <= this.BALANCE_THRESHOLD_V) {
      this.status = 'BALANCED';
      return this.calculateState();
    }

    // Iteration limit
    if (this.stepCount >= this.maxSteps) {
      if (this.minAbsVoltage <= (this.BALANCE_THRESHOLD_V * 1.5)) {
        this.potPosition = this.bestStep;
        this.status = 'BALANCED';
      } else {
        this.status = 'TIMEOUT_ERROR';
      }
      return this.calculateState();
    }

    // Direction calculation
    let nextStep = this.potPosition;
    if (state.vDiff > 0.0) {
      // VB is too high -> lower R_pot -> increase step
      if (this.potPosition < this.MCP4131_MAX_STEPS) {
        nextStep++;
      } else {
        this.status = 'SATURATION_ERROR';
        return this.calculateState();
      }
    } else {
      // VB is too low -> raise R_pot -> decrease step
      if (this.potPosition > 0) {
        nextStep--;
      } else {
        this.status = 'SATURATION_ERROR';
        return this.calculateState();
      }
    }

    // Bracket / Oscillation detection
    if (nextStep === this.previousStep) {
      this.potPosition = this.bestStep;
      this.status = 'BALANCED';
      return this.calculateState();
    }

    this.previousStep = this.potPosition;
    this.potPosition = nextStep;
    this.stepCount++;

    return this.calculateState();
  }

  startBalancing() {
    this.status = 'SEARCHING';
    this.stepCount = 0;
    this.previousStep = -1;
    this.minAbsVoltage = 999.0;
    this.bestStep = this.potPosition;
  }

  resetSimulation() {
    this.status = 'IDLE';
    this.stepCount = 0;
    this.potPosition = 64;
    this.previousStep = -1;
    this.minAbsVoltage = 999.0;
    this.bestStep = 64;
  }
}

// Export for browser
if (typeof window !== 'undefined') {
  window.CableFaultSimulationEngine = CableFaultSimulationEngine;
}
