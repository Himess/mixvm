// ZK Proof Generation Web Worker
// This runs in a separate thread to prevent UI freezing

importScripts('https://unpkg.com/snarkjs@0.7.5/build/snarkjs.min.js');

self.onmessage = async function(e) {
  const { type, input, wasmPath, zkeyPath } = e.data;

  try {
    console.log('[Worker] Starting proof generation...');

    // Fetch the circuit files
    const wasmResponse = await fetch(wasmPath);
    const wasmBuffer = await wasmResponse.arrayBuffer();

    const zkeyResponse = await fetch(zkeyPath);
    const zkeyBuffer = await zkeyResponse.arrayBuffer();

    console.log('[Worker] Circuit files loaded, generating proof...');

    // Generate the proof
    const { proof, publicSignals } = await snarkjs.groth16.fullProve(
      input,
      new Uint8Array(wasmBuffer),
      new Uint8Array(zkeyBuffer)
    );

    console.log('[Worker] Proof generated successfully');

    // Export to Solidity calldata
    const calldata = await snarkjs.groth16.exportSolidityCallData(proof, publicSignals);

    self.postMessage({
      success: true,
      proof,
      publicSignals,
      calldata
    });
  } catch (error) {
    console.error('[Worker] Error:', error);
    self.postMessage({
      success: false,
      error: error.message || 'Proof generation failed'
    });
  }
};
