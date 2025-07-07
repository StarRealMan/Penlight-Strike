// detection using tfjs, run as a web worker

importScripts('https://cdn.jsdelivr.net/npm/@tensorflow/tfjs@latest/dist/tf.min.js');

const basePath = self.location.origin + self.location.pathname.replace(/\/js\/[^/]*$/, '/');
const modelUrl = basePath + 'model/model.json';
const MODEL_INPUT_SIZE = 192;
let loadedModel = null;
let isProcessing = false;

// load the model
async function loadKeypointModel() {    
  try {
    tf.setBackend('webgl');
    tf.env().set('WEBGL_PACK', true);
    tf.env().set('WEBGL_CONV_IM2COL', true);
    tf.env().set('WEBGL_FORCE_F16_TEXTURES', true);
    
    loadedModel = await tf.loadLayersModel(modelUrl);
    
    // warm up the model
    const dummyInput = tf.zeros([1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3]);
    const prediction = loadedModel.predict(dummyInput);

    prediction.dispose();
    dummyInput.dispose();
    
    // notify main thread that model is loaded
    self.postMessage({
      type: 'MODEL_LOADED',
      data: { success: 1 }
    });
  } catch (error) {
    loadedModel = null;
    self.postMessage({
      type: 'MODEL_LOADED',
      data: { 
        success: -1, 
        error: error.message,
        stack: error.stack
      }
    });
  }
}

// preprocess the image to the input size of the model
function preprocessImage(imageBitmap) {
  return tf.tidy(() => {
    // directly create tensor from ImageBitmap
    const tensor = tf.browser.fromPixels(imageBitmap, 3)
      .resizeBilinear([MODEL_INPUT_SIZE, MODEL_INPUT_SIZE])
      .expandDims(0)
      .toFloat()
      .div(255.0);
    return tensor;
  });
}

// find the max value in the heatmaps and return the position
async function extractGlowstickPosition(heatmaps, originalWidth, originalHeight) {
  const heatmapShape = heatmaps.shape;
  const heatmapHeight = heatmapShape[1];
  const heatmapWidth = heatmapShape[2];
  
  const { scaledX, scaledY, maxValue } = tf.tidy(() => {
    const squeezedHeatmap = heatmaps.squeeze();
    const reshapedHeatmap = squeezedHeatmap.reshape([heatmapHeight * heatmapWidth]);
    
    const maxIndex = tf.argMax(reshapedHeatmap);
    const maxValue = tf.max(reshapedHeatmap);
    const yCoord = tf.floorDiv(maxIndex, heatmapWidth);
    const xCoord = tf.mod(maxIndex, heatmapWidth);
    
    const finalX = xCoord.cast('float32');
    const finalY = yCoord.cast('float32');
    const scaleX = originalWidth / heatmapWidth;
    const scaleY = originalHeight / heatmapHeight;
    const scaledX = finalX.mul(scaleX);
    const scaledY = finalY.mul(scaleY);
    
    return { scaledX, scaledY, maxValue };
  });
  
  const xData = scaledX.dataSync();
  const yData = scaledY.dataSync();  
  const confidenceData = maxValue.dataSync();
  
  scaledX.dispose();
  scaledY.dispose();
  maxValue.dispose();
  
  const result = {
    x: Math.round(xData[0]),
    y: Math.round(yData[0]),
    confidence: confidenceData[0],
    timestamp: Date.now()
    };
    
    return result;
}

// main detect function
async function detectGlowstickPosition(imageBitmap, width, height, returnDebugData = false) {
  if (isProcessing) {
    return null;
  }
  
  // check if model is loaded
  if (!loadedModel) {
    return null;
  }

  isProcessing = true;
  
  try {
    const inputTensor = preprocessImage(imageBitmap);
    const heatmaps = loadedModel.predict(inputTensor);
    const position = await extractGlowstickPosition(heatmaps, width, height);
    
    let debugData = null;
    if (returnDebugData) {
      debugData = tf.tidy(() => {
        const resizedImageData = inputTensor.squeeze().mul(255).cast('int32');
        const heatmapData = heatmaps.squeeze().mul(255).cast('int32');
        
        return {
          resizedImage: resizedImageData.dataSync(),
          heatmap: heatmapData.dataSync(),
          imageShape: [MODEL_INPUT_SIZE, MODEL_INPUT_SIZE, 3],
          heatmapShape: [heatmaps.shape[1], heatmaps.shape[2]]
        };
      });
    }
    
    inputTensor.dispose();
    heatmaps.dispose();
    isProcessing = false;
    
    return { position, debugData };
  } catch (error) {
    isProcessing = false;
    return null;
  }
}

self.onmessage = async function(e) {
  const { type, data } = e.data;
  
  switch (type) {
    case 'INIT':
      await loadKeypointModel();
      break;
      
    case 'DETECT':
      const { imageBitmap, width, height, returnDebugData } = data;
      const result = await detectGlowstickPosition(imageBitmap, width, height, returnDebugData);
      
      if (result) {
        self.postMessage({
          type: 'DETECTION_RESULT',
          data: {
            position: result.position,
            debugData: result.debugData
          }
        });
      }
      break;
      
    case 'DISPOSE':
      if (loadedModel) {
        loadedModel.dispose();
        loadedModel = null;
      }
      break;
  }
}; 