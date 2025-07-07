// kalman tracker using the constant velocity model
class KalmanTracker {
  constructor() {
    // state vector: [x, y, vx, vy]
    this.state = [0, 0, 0, 0];

    this.P = [
      [1000, 0, 0, 0],
      [0, 1000, 0, 0],
      [0, 0, 1000, 0],
      [0, 0, 0, 1000]
    ];
    
    this.processNoise = {
      position: 5.0,
      velocity: 10.0
    };
    this.measurementNoise = 25.0;
    this.dt = 1.0 / 60.0;
    
    this.initialized = false;
    this.lastMeasurementTime = 0;
    this.confidence = 0;
  }
  
  // initialize the tracker
  initialize(measurement) {
    this.state = [measurement.x, measurement.y, 0, 0];
    this.lastMeasurementTime = measurement.timestamp;
    this.confidence = measurement.confidence;
    this.initialized = true;
  }
  
  // predict the current state
  predict(currentTime) {
    if (!this.initialized) return;
    
    const dt = Math.min((currentTime - this.lastMeasurementTime) / 1000, 0.1);
    
    const F = [
      [1, 0, dt, 0 ],
      [0, 1, 0,  dt],
      [0, 0, 1,  0 ],
      [0, 0, 0,  1 ]
    ];
    
    const newState = this.matrixVectorMultiply(F, this.state);
    this.state = newState;
    
    const Q = this.buildProcessNoiseMatrix(dt);
    
    const FP = this.matrixMultiply(F, this.P);
    const FPFT = this.matrixMultiply(FP, this.transpose(F));
    this.P = this.matrixAdd(FPFT, Q);
  }
  
  // update new measurement
  update(measurement) {
    if (!this.initialized) {
      this.initialize(measurement);
      return;
    }
    
    const H = [
      [1, 0, 0, 0],
      [0, 1, 0, 0]
    ];
    
    const adaptiveNoise = this.measurementNoise / Math.max(measurement.confidence, 0.1);
    const R = [
      [adaptiveNoise, 0],
      [0, adaptiveNoise]
    ];
    
    const HT = this.transpose(H);
    const PH = this.matrixMultiply(this.P, HT);
    const HPH = this.matrixMultiply(this.matrixMultiply(H, this.P), HT);
    const S = this.matrixAdd(HPH, R);
    const K = this.matrixMultiply(PH, this.matrixInverse2x2(S));
    
    const predicted_measurement = this.matrixVectorMultiply(H, this.state);
    const residual = [
      measurement.x - predicted_measurement[0],
      measurement.y - predicted_measurement[1]
    ];
    
    const correction = this.matrixVectorMultiply(K, residual);
    this.state = this.vectorAdd(this.state, correction);
    
    const I = [[1, 0, 0, 0], [0, 1, 0, 0], [0, 0, 1, 0], [0, 0, 0, 1]];
    const KH = this.matrixMultiply(K, H);
    const IKH = this.matrixSubtract(I, KH);
    this.P = this.matrixMultiply(IKH, this.P);
    
    this.lastMeasurementTime = measurement.timestamp;
    this.confidence = Math.max(this.confidence * 0.95 + measurement.confidence * 0.05, measurement.confidence);
  }
  
  // get the current position using predict
  getCurrentPosition(currentTime) {
    if (!this.initialized) return null;
    
    this.predict(currentTime);
    
    return {
      x: Math.round(this.state[0]),
      y: Math.round(this.state[1]),
      vx: this.state[2],
      vy: this.state[3],
      confidence: this.confidence,
      timestamp: currentTime
    };
  }

  buildProcessNoiseMatrix(dt) {
    const dt2 = dt * dt;
    const dt3 = dt2 * dt;
    const dt4 = dt3 * dt;
    
    const q_pos = this.processNoise.position;
    const q_vel = this.processNoise.velocity;
    
    return [
      [q_pos * dt4 / 4, 0, q_pos * dt3 / 2, 0],
      [0, q_pos * dt4 / 4, 0, q_pos * dt3 / 2],
      [q_pos * dt3 / 2, 0, q_vel * dt2, 0],
      [0, q_pos * dt3 / 2, 0, q_vel * dt2]
    ];
  }
  
  matrixMultiply(A, B) {
    const rows = A.length;
    const cols = B[0].length;
    const common = B.length;
    const result = [];
    
    for (let i = 0; i < rows; i++) {
      result[i] = [];
      for (let j = 0; j < cols; j++) {
        result[i][j] = 0;
        for (let k = 0; k < common; k++) {
          result[i][j] += A[i][k] * B[k][j];
        }
      }
    }
    return result;
  }
  
  // tool functions
  matrixVectorMultiply(matrix, vector) {
    return matrix.map(row => 
      row.reduce((sum, val, i) => sum + val * vector[i], 0)
    );
  }
  
  matrixAdd(A, B) {
    return A.map((row, i) => row.map((val, j) => val + B[i][j]));
  }
  
  matrixSubtract(A, B) {
    return A.map((row, i) => row.map((val, j) => val - B[i][j]));
  }
  
  vectorAdd(a, b) {
    return a.map((val, i) => val + b[i]);
  }
  
  transpose(matrix) {
    return matrix[0].map((_, i) => matrix.map(row => row[i]));
  }
  
  matrixInverse2x2(matrix) {
    const [[a, b], [c, d]] = matrix;
    const det = a * d - b * c;
    
    if (Math.abs(det) < 1e-10) {
      return [[1, 0], [0, 1]];
    }
    
    return [
      [d / det, -b / det],
      [-c / det, a / det]
    ];
  }
}

window.KalmanTracker = KalmanTracker;
